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

### 3.3. División Geométrica Multiplataforma (Split PDF en Memoria)
Las hojas A4 con formato doble (Duplicado arriba / Original abajo) se dividen directamente en memoria usando `pdf-lib`:

```javascript
// Algoritmo de Split Multiplataforma con pdf-lib (Buffers)
const srcDoc = await PDFDocument.load(sheetPdfBuffer);

// Crear Documento Original (Mitad Inferior)
const docOrig = await PDFDocument.create();
const [pageOrig] = await docOrig.copyPages(srcDoc, [0]);
const { width, height } = pageOrig.getSize();
const halfHeight = height / 2;

pageOrig.setCropBox(0, 0, width, halfHeight);
pageOrig.setMediaBox(0, 0, width, halfHeight);
docOrig.addPage(pageOrig);
const origBuffer = Buffer.from(await docOrig.save());

// Crear Documento Duplicado (Mitad Superior)
const docDup = await PDFDocument.create();
const [pageDup] = await docDup.copyPages(srcDoc, [0]);
pageDup.setCropBox(0, halfHeight, width, halfHeight);
pageDup.setMediaBox(0, halfHeight, width, halfHeight);
docDup.addPage(pageDup);
const dupBuffer = Buffer.from(await docDup.save());