1. Llave Primaria de Matcheo: El CUIL
El ancla de matcheo principal y excluyente es el CUIL del empleado. No se utiliza el nombre del archivo ni el nombre de la pestaña del Excel como mecanismo principal para asignar el empleado, sino el texto interno del documento.
2. Flujo de Extracción y Validación (Hard Requirement)
Sin importar si la subida es por PDF individual (/api/payslips/upload) o por archivo Excel masivo (/api/payslips/upload-excel), el flujo técnico es el siguiente:
Análisis del Archivo: El archivo PDF (o el PDF temporal generado a partir de una solapa de Excel) se pasa por el servicio pdfService.analyzeFile().
Extracción (OCR/Parsing): Este servicio extrae el texto y busca un patrón válido de CUIL.
Búsqueda en Base de Datos: Con el CUIL detectado, se realiza una búsqueda exacta en la base de datos de empleados registrados (db.getEmployeeByCuil(cuil)).
Condición de Rechazo: Si no se detecta un CUIL, o si el CUIL detectado no existe en la tabla de empleados, la subida de ese recibo/solapa es rechazada y eliminada inmediatamente. El código lanza un 400 Bad Request o suma un fallo al reporte del Excel.
3. Consolidación de Original y Duplicado
Dado que un recibo tiene dos partes (Original y Duplicado), el sistema necesita unirlas bajo un mismo registro (id) en la base de datos. Lo hace en dos etapas:
Matcheo Lógico Estándar (CUIL + Mes): El sistema busca si ya existe un registro (existingRecord) que coincida con el employeeId (resuelto por el CUIL) y el período exacto enviado en el request (month). Si lo encuentra, anexa el archivo entrante a ese registro (ej. si ya estaba el Original, agrega la ruta del Duplicado).
Fallback por Normalización de Filename (Opcional/Respaldo): Si la consulta anterior falla por alguna razón estructural, existe un mecanismo de fallback técnico llamado getNormalizedBase(). Esta función toma el nombre del archivo original (originalFilename) y lo "limpia":
Pasa todo a minúsculas.
Elimina extensiones (.pdf).
Remueve sufijos y palabras sueltas clave (regex): original, orig, duplicado, dupl, dup, firmar, firma, para.
Elimina cualquier carácter que no sea alfanumérico (/[^a-z0-9]/g).
Compara este string limpio con los registros existentes del mismo month. Si hay coincidencia exacta de este "hash de nombre", asocia los archivos.
4. Particularidad del Matcheo Masivo por Excel
En el endpoint /api/payslips/upload-excel, el comportamiento técnico es:
El script de PowerShell (excel_to_pdf.ps1) itera las hojas y genera un PDF por cada una.
Ignora el nombre de la hoja para el matcheo: Aunque guarda el sheetName para propósitos de logeo y nombrado de archivos (ej. 2026-05 - Recibos Sueldos [sheetName] original.pdf), el código itera sobre esos PDFs generados y vuelve a llamar a pdfService.analyzeFile() para depender exclusivamente de que el CUIL esté impreso visualmente/en texto dentro de la hoja.
Si una solapa no tiene el CUIL formateado de forma que el parser lo lea y lo encuentre en la BD, la solapa es descartada del procesamiento y se devuelve en el arreglo de errors.
5. Prevención de Duplicados Exactos (Deduplicación Global)
Antes de siquiera intentar matchear el empleado, el sistema procesa un hash criptográfico SHA-256 del buffer del archivo (crypto.createHash('sha256').update(fileBuffer).digest('hex')). Si el hash coincide con el originalHash, duplicadoHash o fileHash de cualquier recibo ya existente en la base de datos, el archivo es bloqueado tempranamente para evitar sobrescrituras de documentos idénticos (siempre y cuando la configuración duplicateDetectionEnabled sea verdadera)."