# Documentación Técnica: Flujo Multiplataforma Serverless de Ingesta y Procesamiento de Recibos

**Módulo:** Backend Serverless (`/api`)  
**Dominio:** RRHH - Recibos de Sueldo (Payslips)  
**Versión:** 2.0 (Serverless Cloud Native)  
**Entorno Target:** Linux / Vercel Serverless Functions  

Este documento detalla la arquitectura técnica, los algoritmos y los flujos de ejecución multiplataforma utilizados en el backend para la carga masiva e individual de recibos de sueldo, eliminando el uso de almacenamiento local, scripts PowerShell y persistencia en navegador (`localStorage`).

---

## 1. Arquitectura General y Stack

* **Framework API:** Express.js adapado a Serverless (`/api/index.js` exportable).
* **Gestión de Subidas en Memoria:** `multer` configurado con `multer.memoryStorage()`. Los archivos se procesan directamente desde `req.file.buffer` sin tocar el disco.
* **Procesamiento de Excel Multiplataforma:** Librería `exceljs` en Node.js puro. Parsea hojas de cálculo y genera la estructura visual de impresión a PDF en memoria sin dependencias del SO o Microsoft Excel.
* **Manipulación y Split de PDF:** Librería `pdf-lib`. Se utiliza para crear, copiar, recortar (crop) y encuadrar páginas de un PDF en memoria.
* **Extracción de Texto y Datos:** Módulo interno `pdfService.analyzeBuffer()`. Trabaja directamente sobre `Buffer` usando parsing de streams PDF o Tesseract.js (WASM/JS).
* **Persistencia Base de Datos:** Supabase PostgreSQL (`employees`, `payslips`).
* **Almacenamiento de Archivos:** Supabase Storage (`payslips` bucket con carpetas `/originals`, `/duplicados`, `/signed`).
* **Deduplicación:** Hash criptográfico `SHA-256` utilizando el módulo nativo `crypto`.

---

## 2. Flujo de Subida Individual de PDFs (`/api/payslips/upload`)

### 2.1. Validación y Deduplicación Temprana
1. **Recepción:** `multer` (MemoryStorage) recibe el archivo y lo expone en `req.file.buffer`.
2. **Hashing:** Se calcula el hash `SHA-256` del Buffer en memoria.
3. **Detección Global:** Se consulta en PostgreSQL (`payslips`) si el hash coincide con `original_hash` o `duplicado_hash`. Si existe coincidencia, se rechaza la subida (`400 Bad Request`).

### 2.2. Extracción de Metadatos
Se invoca `pdfService.analyzeBuffer(fileBuffer, originalFilename)`:
* Extrae el texto del PDF mediante parsing directo del stream de datos.
* Devuelve un objeto con: `cuil` detectado (validado con algoritmo Módulo 11 Argentina), `type` (original/duplicado detectado por heurística de texto) e importes `financialData`.

> [!IMPORTANT]
> **Hard Requirement de Matcheo:** Si la función de análisis no retorna un `cuil` válido, o si el CUIL no está registrado en la tabla `employees`, la petición se rechaza inmediatamente (`404 Not Found / 400 Bad Request`).

### 2.3. Lógica de Consolidación y Almacenamiento en la Nube
Un recibo en el sistema es un único registro que referencia dos archivos guardados en Supabase Storage (`original_storage_path` y `duplicado_storage_path`).

1. **Búsqueda Relacional:** Se busca en Postgres si existe un recibo donde `employee_id == empleadoDetectado` Y `month == mesEnviado`.
2. **Subida a Supabase Storage:**
   * Se sube el Buffer directamente al bucket `payslips`:
     ```javascript
     const storagePath = `${type}s/${uuidv4()}_${originalFilename}`;
     await supabase.storage.from('payslips').upload(storagePath, req.file.buffer, {
       contentType: 'application/pdf',
       upsert: true
     });
     ```
3. **Upsert en Base de Datos:**
   * **Existe Registro:** Se actualiza el campo correspondiente (`original_storage_path` o `duplicado_storage_path`) y se cambia el `status` a "Cargado".
   * **No Existe Registro:** Se inserta una nueva fila en `payslips` generando un `token` UUID seguro para la firma electrónica.

---

## 3. Flujo Multiplataforma de Subida Masiva por Excel (`/api/payslips/upload-excel`)

### 3.1. Procesamiento Multiplataforma en Memoria (JS Puro)
Para evitar la dependencia de scripts PowerShell y Microsoft Excel en Windows:
1. `exceljs` procesa el buffer del libro de Excel subido por el cliente.
2. Itera las hojas de trabajo visibles (descartando solapas del sistema como "Resumen", "SICOSS", etc.).
3. Convierte en tiempo real cada solapa a un buffer PDF independiente usando `pdfkit` / `pdf-lib` en memoria.

### 3.2. Procesamiento Iterativo por Solapa
Por cada buffer PDF generado a partir de una hoja:
1. **Análisis Estricto:** `pdfService.analyzeBuffer()` extrae y valida el **CUIL impreso**. Si no se detecta un CUIL válido en el contenido de la hoja, la iteración salta esa hoja y registra la advertencia en `summary.errors`.
2. **Deduplicación:** Se genera el hash SHA-256 del PDF de la hoja y se descarta si ya existe en Supabase.
3. **Prevención de Sobrescritura:** Si la tabla `payslips` ya posee un recibo completo para el empleado en ese mes, se omite (`skippedCount++`).

### 3.3. Para transformar el excel a pdf con la configuración de recibos, se debe seguir esta logica, recuerda no usar COM objects, ni PowerShell:

```powershell
$ErrorActionPreference = "Stop"

$baseDir = "c:\DocuMation"
$excelPath = Join-Path $baseDir "Recibos Sueldos -para prueba.xls.xlsx"
$outputDir = Join-Path $baseDir "recibos_generados"
$month = "2026-06"

if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

Write-Host "Starting Excel COM Object..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($excelPath)

$excludedNames = @("Modelo", "SICOSS", "Resumen", "CUSS", "Hoja6", "SAC_VAC")
$generatedPdfs = @()

Write-Host "Iterating over sheets..."
foreach ($ws in $wb.Worksheets) {
    $name = $ws.Name
    if ($excludedNames -contains $name) {
        Write-Host "Skipping sheet (excluded name): $name"
        continue
    }
    if ($name -match "^\d+$") {
        Write-Host "Skipping sheet (numbers only): $name"
        continue
    }

    Write-Host "Processing sheet: $name"

    # Forzar que el recibo entre en una sola página
    $ws.PageSetup.Zoom = $false
    $ws.PageSetup.FitToPagesWide = 1
    $ws.PageSetup.FitToPagesTall = 1

    $pdfOriginalPath = Join-Path $outputDir "$name - Original.pdf"
    $pdfDuplicadoPath = Join-Path $outputDir "$name - Duplicado.pdf"
    
    # Delete if exists to avoid errors
    if (Test-Path $pdfOriginalPath) { Remove-Item $pdfOriginalPath -Force }
    if (Test-Path $pdfDuplicadoPath) { Remove-Item $pdfDuplicadoPath -Force }

    # 0 is xlTypePDF
    # Original: B80:G153
    $ws.Range("B80:G153").ExportAsFixedFormat(0, $pdfOriginalPath)
    $generatedPdfs += $pdfOriginalPath

    # Duplicado: B2:G77
    $ws.Range("B2:G77").ExportAsFixedFormat(0, $pdfDuplicadoPath)
    $generatedPdfs += $pdfDuplicadoPath
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Host "Generated $($generatedPdfs.Length) PDFs."
Write-Host "Uploading them to the portal..."

$serverUrl = "http://localhost:5000/api/payslips/upload"

foreach ($pdf in $generatedPdfs) {
    Write-Host "Uploading $pdf"
    
    # We use curl.exe since PS 5.1 Invoke-RestMethod doesn't have an easy way to do multipart/form-data
    $args = @(
        "-s",
        "-X", "POST",
        $serverUrl,
        "-F", "file=@"$pdf"",
        "-F", "month=$month"
    )
    
    $result = & curl.exe @args
    Write-Host "Server Response: $result"
}

Write-Host "Process completed successfully."
```

## 4. Formato pdf
 - El pdf generado debe quedar con este formato /filestests/recibo_Duplicado.pdf y /filestests/recibo_Original.pdf
 - Ten en cuenta que el orden de los campos es importante:
    - los campos que estan centrados deben quedar centrados
    - los campos que estan alineados a la izquierda deben quedar alineados a la izquierda
    - los campos que estan alineados a la derecha deben quedar alineados a la derecha. 
    - No modifiques el formato del pdf, solo cambia los datos que estan de ejemplo por los datos que se envian en el excel.
