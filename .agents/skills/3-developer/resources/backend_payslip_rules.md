rules
# Backend Payslip Rules — DocuMation

## 1. Propósito

Este documento contiene las reglas específicas de negocio y arquitectura para el procesamiento de recibos de sueldo de DocuMation.

Estas reglas complementan el `SKILL.md`.

En caso de conflicto:

1. El `SKILL.md` define las reglas generales de desarrollo.
2. Este documento define las reglas específicas del dominio de recibos.
3. El código existente es la referencia del comportamiento actual cuando la documentación sea ambigua.
4. Nunca modificar comportamiento existente sin identificar explícitamente el impacto.

---

# 2. Principio fundamental

Los recibos de sueldo son una funcionalidad crítica de DocuMation.

El objetivo no es simplemente generar un archivo PDF válido.

El objetivo es:

> Generar un PDF funcional y visualmente fiel al recibo Excel original.

Por lo tanto:

```text
PDF válido
        +
PDF visualmente fiel
        +
Firma preservada
        +
Gráficos preservados
        +
Imágenes preservadas
        +
Original/Duplicado preservados
        =
PDF correcto
```

Un PDF que abre correctamente pero cambia el diseño del recibo no se considera correcto.

---

# 3. Excel como fuente visual de verdad

Cuando el recibo proviene de un workbook Excel:

**El workbook original es la fuente visual de verdad.**

Deben preservarse, cuando existan:

* contenido;
* formato;
* fuentes;
* tamaños;
* colores;
* bordes;
* alineación;
* imágenes;
* firmas;
* gráficos;
* fórmulas;
* dimensiones;
* márgenes;
* orientación;
* escala;
* saltos de página;
* áreas de impresión;
* encabezados;
* pies de página;
* posición relativa de los elementos.

No reconstruir visualmente el recibo mediante HTML/CSS salvo que el usuario solicite explícitamente cambiar el formato de origen.

---

# 4. Diagnóstico obligatorio

Antes de modificar cualquier código relacionado con PDF, el agente debe inspeccionar:

1. archivo Excel de entrada;
2. `pdfService.js`;
3. cualquier servicio relacionado con Excel;
4. cualquier renderer PDF;
5. lógica de Original/Duplicado;
6. lógica de firma;
7. almacenamiento;
8. rutas de descarga;
9. procesamiento de imágenes;
10. gráficos;
11. configuración de impresión;
12. dependencias utilizadas.

Debe identificar:

```text
Excel
  ↓
Procesamiento
  ↓
Renderer
  ↓
PDF
  ↓
Firma
  ↓
Storage
  ↓
Descarga / envío
```

Antes de cambiar el renderer debe explicar brevemente:

* cuál es el renderer actual;
* cuál es el problema;
* qué elementos visuales podrían perderse;
* qué alternativa propone;
* cómo se validará.

---

# 5. No confundir PDF válido con PDF fiel

No considerar suficiente una prueba como:

```js
Buffer.isBuffer(pdf)
```

ni:

```js
pdf.length > 0
```

ni:

```js
response.status === 200
```

Estas pruebas solamente demuestran que existe una salida.

No demuestran fidelidad visual.

Una implementación de PDF se considera correcta solamente después de verificar los requisitos visuales relevantes.

---

# 6. Renderers permitidos

El sistema debe utilizar una abstracción de renderer.

Conceptualmente:

```text
PayrollPdfEngine
```

Implementaciones posibles:

```text
PayrollPdfEngine
├── MicrosoftGraphPdfEngine
├── ExcelDesktopPdfEngine
└── LibreOfficePdfEngine
```

Estas implementaciones son alternativas.

No asumir que una implementación es correcta solamente porque funciona técnicamente.

---

# 7. Microsoft Graph

Microsoft Graph puede utilizarse como candidato para la conversión serverless de Excel a PDF.

Microsoft documenta actualmente la conversión de `.xlsx`, `.xlsm` y `.xls` a PDF mediante:

```text
GET /drive/items/{item-id}/content?format=pdf
```

y devuelve una redirección hacia una URL preautenticada para descargar el resultado.

Sin embargo:

> La disponibilidad de la conversión no demuestra fidelidad visual respecto de Excel Desktop.

Por lo tanto, antes de convertir Microsoft Graph en renderer principal debe realizarse una comparación contra la salida de referencia de Excel Desktop.

---

# 8. Excel Desktop

Cuando el requisito sea máxima fidelidad, Excel Desktop puede considerarse la referencia de renderizado.

El comportamiento histórico del sistema utiliza operaciones equivalentes a:

```text
Excel.Application
Workbook
Worksheet
PageSetup
FitToPagesWide
FitToPagesTall
Range.ExportAsFixedFormat
```

Este mecanismo puede ejecutarse fuera de Vercel mediante un worker Windows o servicio especializado.

No eliminar esta capacidad únicamente porque Vercel no pueda ejecutar Excel Desktop directamente.

La arquitectura debe permitir:

```text
Vercel
  ↓
PayrollPdfEngine
  ↓
Worker Windows / servicio externo
  ↓
Excel Desktop
  ↓
PDF
```

cuando se requiera máxima fidelidad.

---

# 9. LibreOffice

LibreOffice puede evaluarse como alternativa cuando se requiera un renderer ejecutable en infraestructura Linux.

No asumir equivalencia visual con Excel Desktop.

Debe validarse especialmente:

* gráficos;
* imágenes;
* fuentes;
* fórmulas;
* saltos de página;
* escala;
* márgenes;
* firmas;
* áreas de impresión.

Si existen diferencias visuales relevantes, no debe utilizarse como renderer principal para esos recibos.

---

# 10. ExcelJS

ExcelJS puede utilizarse para:

* leer worksheets;
* extraer datos;
* analizar celdas;
* identificar información;
* procesar estructuras del workbook;
* realizar operaciones de negocio.

No debe considerarse automáticamente un sustituto de Excel Desktop como renderer visual.

No implementar:

```text
ExcelJS → reconstrucción manual del PDF
```

si eso provoca pérdida de:

* gráficos;
* imágenes;
* firma;
* layout;
* impresión;
* fuentes;
* escala.

ExcelJS no debe ser seleccionado como renderer principal únicamente porque pueda ejecutarse en Vercel.

---

# 11. pdf-lib / PDFKit

`pdf-lib` y `pdfkit` pueden utilizarse para operaciones auxiliares sobre PDFs.

No utilizarlos como sustituto automático del renderer Excel cuando la fidelidad visual sea requisito.

Ejemplos de operaciones auxiliares válidas:

```text
PDF generado por renderer Excel
        ↓
Agregar metadata
        ↓
Operación auxiliar
        ↓
Firma / almacenamiento
```

No:

```text
Excel
 ↓
pdf-lib
 ↓
reconstrucción manual del recibo
```

si esto degrada la fidelidad.

---

# 12. Golden Master

Debe existir al menos un workbook de referencia para pruebas de regresión.

El workbook debe representar la complejidad real del sistema.

Idealmente debe contener:

* múltiples worksheets;
* firma;
* imágenes;
* gráficos;
* fórmulas;
* formatos;
* Original;
* Duplicado;
* configuración de impresión.

El archivo de referencia se considera:

```text
Golden Master
```

---

# 13. Comparación de renderers

Cuando se evalúe un nuevo renderer:

```text
Workbook
   ↓
Excel Desktop
   ↓
PDF referencia
```

y:

```text
Workbook
   ↓
Nuevo Renderer
   ↓
PDF candidato
```

Después comparar.

Como mínimo:

* número de páginas;
* tamaño de página;
* orientación;
* escala;
* contenido;
* posiciones;
* imágenes;
* firma;
* gráficos;
* márgenes;
* saltos de página.

Cuando sea posible, realizar comparación visual renderizando ambas salidas como imágenes.

---

# 14. Firma del empleador

La firma del empleador es un elemento visual crítico.

Debe preservarse:

* ubicación;
* tamaño;
* proporción;
* resolución;
* transparencia;
* relación con las celdas;
* posición dentro del recibo.

Una salida sin la firma existente constituye una regresión.

---

# 15. Gráficos

Los gráficos Excel son elementos visuales críticos.

No eliminarlos.

No reemplazarlos automáticamente por imágenes aproximadas.

Validar:

* tipo;
* tamaño;
* posición;
* leyenda;
* valores;
* etiquetas;
* escala;
* proporción.

Un PDF sin los gráficos presentes en el Excel original no es equivalente.

---

# 16. Imágenes

Las imágenes embebidas deben conservarse.

Validar:

* presencia;
* tamaño;
* posición;
* proporción;
* calidad.

No convertirlas a placeholders.

---

# 17. Original y Duplicado

El flujo actual contempla dos documentos:

```text
recibo_Original.pdf
recibo_Duplicado.pdf
```

Ambos deben mantenerse.

No eliminar ninguno.

No cambiar sus nombres, rutas o contratos API sin necesidad explícita.

Si el sistema utiliza diferentes rangos de impresión para cada documento, deben preservarse.

El comportamiento histórico utiliza:

```text
Original:
B80:G153

Duplicado:
B2:G77
```

Estos rangos deben verificarse contra el código vigente antes de modificarlos.

No asumir que estos valores son universales para todos los futuros formatos Excel.

---

# 18. Worksheets

Antes de procesar un workbook, identificar las worksheets que contienen recibos.

Históricamente existen hojas que deben ignorarse, incluyendo:

```text
Modelo
SICOSS
Resumen
CUSS
Hoja6
SAC_VAC
```

y hojas cuyo nombre sea exclusivamente numérico, según la lógica existente.

No cambiar esta regla sin verificar primero el código actual y los archivos reales utilizados por el sistema.

---

# 19. CUIL

La identificación del empleado mediante CUIL es parte de la lógica de negocio.

Debe preservarse:

```text
Excel
 ↓
detección CUIL
 ↓
matching empleado
 ↓
recibo
```

No cambiar el algoritmo de matching como efecto secundario de un cambio de renderer PDF.

---

# 20. Dedupe

Cuando un workbook contenga información duplicada, la lógica de deduplicación existente debe preservarse.

Un cambio en la generación PDF no debe alterar:

* identificación del empleado;
* cantidad de recibos;
* deduplicación;
* matching.

---

# 21. Fórmulas

Si el workbook utiliza fórmulas:

* no reemplazarlas por valores incorrectos;
* no asumir que una librería Node las recalcula igual que Excel;
* validar el resultado visual.

Si el renderer depende de fórmulas calculadas previamente, debe verificarse que los valores estén disponibles.

---

# 22. Configuración de impresión

Debe conservarse, cuando exista:

* `PageSetup`;
* orientación;
* tamaño de papel;
* márgenes;
* escala;
* `FitToPagesWide`;
* `FitToPagesTall`;
* área de impresión;
* saltos de página.

Una modificación de estas propiedades puede cambiar completamente el resultado visual.

---

# 23. Vercel

El objetivo de compatibilidad con Vercel no justifica reducir la fidelidad.

Si una funcionalidad no puede ejecutarse directamente dentro de una función serverless, considerar:

```text
Vercel
 ↓
job
 ↓
worker externo
 ↓
renderer especializado
 ↓
Storage
```

antes de reconstruir el documento con un renderer de menor fidelidad.

---

# 24. Archivos temporales

Los archivos temporales pueden utilizarse únicamente cuando el entorno lo permita y cuando el proceso sea autocontenido.

No utilizar el filesystem efímero como almacenamiento permanente.

Los resultados definitivos deben terminar en almacenamiento persistente.

---

# 25. Supabase Storage

Los PDFs definitivos deben almacenarse en Supabase Storage o el almacenamiento persistente definido por la arquitectura.

La base de datos debe almacenar metadata y referencias, no asumir que el archivo local seguirá existiendo.

Conceptualmente:

```text
PDF
 ↓
Supabase Storage
 ↓
storage path
 ↓
payslip/document
```

---

# 26. Firma del recibo

La generación del PDF y la firma son etapas independientes.

No cambiar la firma solamente para adaptar el renderer.

Preservar:

* estado;
* fecha;
* hash;
* IP;
* user-agent;
* firmante;
* storage path;
* URL;
* trazabilidad.

Flujo esperado:

```text
Excel
 ↓
PDF
 ↓
Storage
 ↓
Firma
 ↓
PDF firmado
 ↓
Storage
```

La implementación concreta puede variar si el código existente utiliza otro flujo, pero no debe cambiarse sin necesidad.

---

# 27. Estados

No renombrar estados existentes.

No cambiar transiciones existentes durante una modificación del renderer.

Ejemplo conceptual:

```text
Cargado
Procesando
Generado
Enviado
Firmado
```

Los nombres reales deben tomarse del código y esquema vigente.

---

# 28. Idempotencia

El procesamiento debe evitar generar múltiples recibos incorrectamente para una misma operación.

Cuando sea posible:

```text
job id
+
payroll id
+
employee id
+
source hash
```

deben permitir detectar operaciones repetidas.

Un retry no debe duplicar accidentalmente recibos.

---

# 29. Procesamiento masivo

Para lotes grandes:

* procesar por jobs;
* registrar progreso;
* permitir reintentos;
* registrar errores individuales;
* evitar perder todo el lote;
* mantener idempotencia.

No asumir que todo el procesamiento puede realizarse dentro de una única ejecución serverless.

---

# 30. Buffers

Los Buffers son válidos para transporte temporal de archivos.

Ejemplo:

```js
const pdfBuffer = await generatePdf(...);
```

Sin embargo:

> Obtener un Buffer no significa que el PDF sea correcto.

El Buffer debe contener el PDF producido por el renderer validado.

---

# 31. Contratos API

No cambiar:

* endpoints;
* métodos HTTP;
* nombres de parámetros;
* estructura JSON;
* estados;
* URLs;
* rutas de descarga;

sin necesidad explícita.

Cuando sea necesario cambiar un contrato:

1. identificar consumidores;
2. actualizar backend;
3. actualizar frontend;
4. agregar pruebas;
5. documentar el cambio.

---

# 32. Errores

Los errores de procesamiento deben identificarse individualmente.

Ejemplo:

```text
Empleado A → correcto
Empleado B → error de CUIL
Empleado C → error de PDF
Empleado D → correcto
```

No ocultar errores.

No retornar `null` silenciosamente.

Registrar suficiente información para diagnosticar el problema sin exponer secretos.

---

# 33. Seguridad

Nunca almacenar en la base de datos del negocio:

* client secrets;
* passwords;
* API keys;
* tokens;
* claves privadas.

Utilizar variables de entorno o secret management.

Especialmente para:

```text
Microsoft Graph
SMTP
OpenAI
Groq
VAPID
Supabase service role
```

---

# 34. Pruebas mínimas

Toda modificación de recibos debe tener pruebas adecuadas.

### Procesamiento

Verificar:

* workbook válido;
* worksheets;
* CUIL;
* matching;
* deduplicación.

### PDF

Verificar:

* PDF generado;
* cantidad de páginas;
* tamaño;
* contenido;
* Original;
* Duplicado.

### Visual

Cuando se modifica el renderer:

* comparar contra Golden Master;
* verificar firma;
* verificar gráficos;
* verificar imágenes;
* verificar layout.

### Firma

Verificar:

* PDF firmado;
* estado;
* metadata;
* storage path.

---

# 35. Prueba especial para cambios de renderer

Antes de reemplazar un renderer:

```text
NO hacer:
"Nuevo renderer funciona → reemplazar antiguo"
```

Hacer:

```text
1. Ejecutar renderer actual
2. Guardar PDF referencia
3. Ejecutar renderer nuevo
4. Comparar
5. Identificar diferencias
6. Clasificar diferencias
7. Decidir si son aceptables
8. Recién entonces considerar el reemplazo
```

---

# 36. Estrategia de migración

Cuando se introduzca un nuevo renderer, preferir:

```text
PayrollPdfEngine
        ↓
feature flag / configuración
        ↓
renderer seleccionado
```

sobre eliminar inmediatamente el renderer existente.

Ejemplo:

```text
PDF_ENGINE=excel-desktop
PDF_ENGINE=graph
PDF_ENGINE=libreoffice
```

La implementación exacta dependerá del proyecto.

Esto permite rollback.

---

# 37. Fallback

Cuando la fidelidad de un renderer alternativo no esté demostrada, mantener una alternativa de mayor fidelidad.

Ejemplo:

```text
Graph
  ↓
validado → utilizar

Graph
  ↓
no validado / error
  ↓
fallback
```

El fallback no debe introducir duplicación de recibos.

---

# 38. No modificar negocio para resolver infraestructura

No cambiar:

* formato del recibo;
* rangos;
* nombres;
* firma;
* estados;
* lógica de empleados;

simplemente para evitar una limitación del renderer.

Primero resolver la infraestructura.

---

# 39. Regla para tareas del tipo "hacer funcionar en Vercel"

Si el usuario solicita:

> "Haz que la generación de PDF funcione en Vercel"

el agente debe interpretar la tarea como:

```text
Hacer compatible la arquitectura con Vercel
+
mantener la funcionalidad existente
+
mantener fidelidad visual
```

No como:

```text
Generar cualquier PDF válido desde Vercel
```

Antes de modificar código debe diagnosticar el renderer.

---

# 40. Definition of Done

Un cambio relacionado con recibos solamente se considera terminado cuando:

* [ ] El Excel sigue procesándose correctamente.
* [ ] El CUIL sigue identificándose correctamente.
* [ ] El empleado correcto sigue asociándose.
* [ ] No se duplican recibos.
* [ ] Original continúa funcionando.
* [ ] Duplicado continúa funcionando.
* [ ] El PDF es válido.
* [ ] El PDF conserva el layout.
* [ ] La firma continúa presente.
* [ ] Los gráficos continúan presentes.
* [ ] Las imágenes continúan presentes.
* [ ] Las fórmulas/valores esperados continúan presentes.
* [ ] La escala es correcta.
* [ ] Los saltos de página son correctos.
* [ ] La firma posterior continúa funcionando.
* [ ] El almacenamiento continúa funcionando.
* [ ] Las descargas continúan funcionando.
* [ ] Las pruebas relevantes pasan.
* [ ] No se introdujeron cambios no relacionados.
* [ ] Existe rollback si se introdujo un nuevo renderer.
* [ ] Las diferencias visuales fueron documentadas.
* [ ] El resultado fue comparado con el Golden Master cuando corresponde.

---

# 41. Regla final

Para DocuMation:

> **La fidelidad del recibo es una funcionalidad del sistema.**

Por lo tanto:

> **Nunca sacrificar fidelidad visual únicamente para conseguir compatibilidad con Vercel.**

Cuando exista una tensión entre:

```text
Serverless
```

y:

```text
Fidelidad Excel → PDF
```

la solución debe ser arquitectónica:

```text
Vercel
   ↓
API / Job
   ↓
PayrollPdfEngine
   ↓
renderer apropiado
   ↓
PDF
   ↓
Storage
```

y no una degradación silenciosa del documento.

La prioridad es:

```text
Preservar comportamiento
        ↓
Preservar fidelidad
        ↓
Compatibilidad con infraestructura
        ↓
Optimizar
```
