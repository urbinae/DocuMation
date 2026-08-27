# Documentación Técnica: Flujo de Ingesta, Procesamiento y Matcheo de Recibos de Sueldo

**Módulo:** Backend (Node.js / Express)
**Dominio:** RRHH - Recibos de Sueldo (Payslips)
**Versión:** 1.0 (MVP)

Este documento detalla la arquitectura técnica, los algoritmos y los flujos de ejecución utilizados en el backend para la carga masiva e individual de recibos de sueldo. Su objetivo es servir como guía técnica para desarrolladores que necesiten mantener o escalar el módulo.

---

## 1. Arquitectura General y Stack

*   **Framework:** Express.js (Node.js)
*   **Gestión de Subidas (Multipart/form-data):** `multer`. Los archivos se guardan inicialmente en una carpeta temporal (`TEMP_DIR`).
*   **Manipulación y División de PDF:** Librería `pdf-lib`. Se utiliza para crear, copiar y recortar (crop) páginas de un PDF.
*   **Procesamiento de Excel:** Script nativo de Windows (`excel_to_pdf.ps1` usando PowerShell) invocado vía `child_process.exec`. Convierte hojas de cálculo a PDF de manera asíncrona para conservar el diseño de impresión nativo.
*   **Extracción de Texto/Datos:** Módulo interno `pdfService.analyzeFile()`.
*   **Almacenamiento (MVP):** Archivo plano en disco (`db.json`) manejado por un adaptador interno (`db.getEmployees`, `db.savePayslip`).
*   **Deduplicación:** Hash criptográfico `SHA-256` utilizando el módulo nativo `crypto`.

---

## 2. Flujo de Subida Individual de PDFs (`/api/payslips/upload`)

Este flujo se dispara cuando RRHH sube manualmente un archivo PDF (ya sea un original o un duplicado).

### 2.1. Validación y Deduplicación Temprana
1.  **Recepción:** `multer` aloja el archivo en `tempPath`.
2.  **Hashing:** Se lee el buffer del archivo temporal y se calcula su hash `SHA-256`.
3.  **Detección Global (Opcional):** Si la configuración `duplicateDetectionEnabled` está activa, se compara el hash entrante contra `originalHash` y `duplicadoHash` de todos los registros en base de datos. Si hay coincidencia exacta, se rechaza la subida (`400 Bad Request`) ahorrando procesamiento.

### 2.2. Extracción de Metadatos
Se invoca `pdfService.analyzeFile(tempPath, originalFilename)`:
*   Extrae el texto del PDF mediante OCR o Parsing directo (según el motor configurado en el servicio).
*   Devuelve un objeto con: `cuil` detectado, `type` (original/duplicado detectado por heurística de texto), `financialData` (importes) y un flag `noTextLayer`.

> [!IMPORTANT]
> **Hard Requirement de Matcheo:** Si la función de análisis no retorna un `cuil`, o si el CUIL retornado no existe en la colección de empleados (`db.getEmployeeByCuil`), el archivo se **rechaza inmediatamente**, eliminando el archivo temporal.

### 2.3. Lógica de Consolidación (Matcheo Relacional)
Un recibo en el sistema es un único registro que contiene referencias a dos archivos físicos (`originalPath` y `duplicadoPath`).

1.  **Búsqueda Primaria:** Se busca en la base de datos si existe un recibo donde `employeeId == empleadoDetectado` **Y** `month == mesEnviado`.
2.  **Fallback Normalizado (Safety Net):** Si la búsqueda primaria falla, el algoritmo normaliza el `originalFilename` (convirtiéndolo a minúsculas, quitando extensiones, caracteres no alfanuméricos y palabras como "original" o "duplicado"). Luego busca otro registro del mismo mes que coincida con ese hash de nombre. Este fallback asegura que archivos divididos previamente bajo el mismo nombre base se unan correctamente.
3.  **Actualización vs. Inserción:**
    *   **Existe Registro:** Se actualiza el campo correspondiente (`originalPath` o `duplicadoPath`), reemplazando el archivo físico viejo si existía, y se actualiza el `status` a "Cargado".
    *   **No Existe Registro:** Se crea un nuevo objeto de recibo, asignando un `uuidv4()` como token seguro y se guarda en la DB.
4.  **Sistema de Archivos:** El PDF temporal se mueve (usando `fs.copyFileSync` seguido de `fs.unlinkSync` para mitigar errores EBUSY en Windows) a la carpeta definitiva (`ORIGINALS_DIR` o `DUPLICADOS_DIR`).

---

## 3. Flujo de Subida Masiva por Excel (`/api/payslips/upload-excel`)

Este es el flujo más complejo, diseñado para procesar el archivo unificado de la contabilidad.

### 3.1. Conversión Asíncrona (PowerShell)
Dado que las librerías nativas de Node a menudo pierden el formato visual de Excel, el sistema delega la renderización a Windows:
1.  Se ejecuta `excel_to_pdf.ps1` inyectándole el `tempPath` del archivo Excel.
2.  El script abre Excel en background, itera por cada hoja visible, y la exporta como un PDF individual a una carpeta temporal (`TEMP_DIR/excel_export`).
3.  El script retorna por salida estándar (`stdout`) un JSON con el array de rutas generadas.

> [!TIP]
> **Server-Sent Events (SSE):** Durante todo este proceso masivo, el frontend puede suscribirse a `/api/payslips/upload-progress/:jobId` para recibir actualizaciones en tiempo real (SSE) sobre qué hoja se está procesando (actual vs. total).

### 3.2. Procesamiento Iterativo por Solapa
Por cada PDF generado por el script:
1.  **Análisis (Requisito Estricto):** Se pasa por `pdfService.analyzeFile()`. Al igual que en la carga individual, si no se detecta un **CUIL válido** impreso en la hoja, la iteración **falla silenciosamente para ese empleado**, agregando el error al array `summary.errors` y saltando a la siguiente hoja. No se utiliza el nombre de la solapa (`sheetName`) como llave de integridad.
2.  **Deduplicación:** Se genera el hash SHA-256 del PDF de la hoja y se descarta si ya fue subido globalmente.
3.  **Prevención de Sobrescritura:** Si ya existe un recibo completo para el empleado en ese mes, se omite (`skippedCount++`) para no pisar el trabajo de RRHH (a menos que se envíe un flag explícito de overwrite, según configuración extendida).

### 3.3. División Geométrica (Split PDF)
Los Excels corporativos suelen venir en una sola hoja A4 dividida visualmente: Mitad Superior (Firma Empleado / Duplicado) y Mitad Inferior (Firma Empleador / Original).

```javascript
// Algoritmo de Split con pdf-lib
const pdfDoc = await PDFDocument.load(fileBuffer);
const page = pdfDoc.getPages()[0];
const { width, height } = page.getSize();
const halfHeight = height / 2;

// Original (Mitad Inferior)
copiedOrig.setCropBox(0, 0, width, halfHeight);
copiedOrig.setMediaBox(0, 0, width, halfHeight);

// Duplicado (Mitad Superior)
copiedDup.setCropBox(0, halfHeight, width, halfHeight);
copiedDup.setMediaBox(0, halfHeight, width, halfHeight);
```

1.  Se crean en memoria dos documentos PDF independientes.
2.  Al primero se le ajusta la caja de recorte a la mitad inferior (`Original`).
3.  Al segundo se le ajusta a la mitad superior (`Duplicado`).
4.  Ambos se guardan físicamente en `ORIGINALS_DIR` y `DUPLICADOS_DIR` respectivamente, asignando GUIDs a sus nombres de archivo.

### 3.4. Persistencia del Registro Masivo
Se crea el registro en base de datos conteniendo ambos archivos (`originalPath` y `duplicadoPath`), sus respectivos hashes, los importes extraídos (`financialData`) y se establece el estado global como `"Cargado"`. El PDF temporal de la hoja completa es borrado.

---

## 4. Estructura de Datos en Base de Datos (db.json)

El modelo de datos esperado para un `Payslip` es el siguiente:

```json
{
  "id": "uuid-del-recibo",
  "employeeId": "uuid-del-empleado",
  "detectedCuil": "20123456789",
  "month": "2026-05",
  "originalPath": "C:\\Ruta\\originals\\xyz_original.pdf",
  "originalFilename": "Recibo original.pdf",
  "duplicadoPath": "C:\\Ruta\\duplicados\\xyz_duplicado.pdf",
  "duplicadoFilename": "Recibo duplicado.pdf",
  "signedPath": null,
  "status": "Cargado | Firmado",
  "token": "magic-link-token",
  "sentAt": "timestamp ISO",
  "signedAt": null,
  "ip": null,
  "userAgent": null,
  "financialData": {
    "netPay": 150000.00,
    "grossPay": 180000.00,
    "deductions": 30000.00
  },
  "originalHash": "hash_sha256",
  "duplicadoHash": "hash_sha256"
}
```

## 5. Puntos Clave de Mantenibilidad (Gotchas)

*   **Encoding de Nombres:** `multer` puede corromper nombres de archivos con tildes debido a configuraciones de headers HTTP. Se aplica una corrección `Buffer.from(originalFilename, 'latin1').toString('utf8')` como middleware táctico.
*   **EBUSY en Windows:** En entornos Windows, mover archivos temporalmente abiertos por `pdf-lib` o PowerShell puede lanzar un error `EBUSY`. Siempre se usa el patrón `fs.copyFileSync` + `fs.unlinkSync` dentro de un bloque `try-catch` para mitigar bloqueos del file system.
*   **PowerShell Execution Policy:** El servidor debe ejecutarse con permisos para saltar las políticas de ejecución (`-ExecutionPolicy Bypass`), o de lo contrario el script `excel_to_pdf.ps1` será bloqueado por el OS.
