skill
---

name: developer
description: Implementa y mantiene código Fullstack para DocuMation usando Node.js, Express, React, Vite, Supabase y Vercel. Debe preservar las funcionalidades existentes, especialmente la generación de recibos PDF, firma, procesamiento Excel, almacenamiento y flujos de RRHH. Usar para implementar funcionalidades, corregir bugs, migrar servicios y refactorizar de forma segura y reversible.
---
# Fullstack Developer Skill — DocuMation

## 1. Misión

El objetivo principal es **evolucionar DocuMation sin romper funcionalidades existentes**.

Todo cambio debe cumplir, en este orden:

1. Preservar el comportamiento existente.
2. Mantener la fidelidad visual y funcional de los recibos.
3. Mantener compatibilidad con Vercel/Supabase cuando corresponda.
4. Mantener seguridad y aislamiento por empresa.
5. Reutilizar código existente.
6. Realizar el menor cambio posible.
7. Agregar pruebas de regresión para evitar volver a introducir el problema.

No realizar reescrituras generales del proyecto cuando una modificación localizada sea suficiente.

---

# 2. Regla fundamental: inspeccionar antes de modificar

Antes de escribir código:

1. Inspeccionar la estructura real del repositorio.
2. Verificar la rama Git actual.
3. Verificar `git status`.
4. Identificar los archivos que participan directamente en la funcionalidad solicitada.
5. Leer las reglas de negocio relacionadas.
6. Identificar dependencias y servicios externos involucrados.
7. Determinar qué comportamiento actual debe mantenerse.
8. Determinar qué comportamiento se quiere cambiar.

No asumir que la arquitectura descrita en documentación coincide con el código real.

Si existe una contradicción entre documentación y código:

* inspeccionar primero;
* no inventar una solución;
* documentar la contradicción;
* corregir únicamente cuando sea necesario para la tarea.

---

# 3. Seguridad Git

El agente debe trabajar únicamente sobre la rama indicada por el usuario.

Antes de modificar:

```bash
git branch --show-current
git status --short
```

No ejecutar sin autorización explícita:

```bash
git reset --hard
git clean -fd
git checkout .
git restore .
git push --force
git rebase
```

No eliminar trabajo existente del usuario.

No crear commits automáticamente salvo que el usuario lo solicite.

No modificar otras ramas.

---

# 4. Inspección obligatoria del Frontend

Antes de crear o modificar componentes UI:

* inspeccionar `/src`;
* revisar `/src/employee/`;
* revisar `/src/hr/`;
* revisar `/src/commercial/`;
* revisar `/src/shared/`;
* revisar `App.jsx`;
* revisar el sistema de rutas;
* revisar `index.css`;
* revisar componentes reutilizables;
* revisar llamadas `fetch`/`axios`;
* revisar manejo de estados y errores.

No reescribir el frontend desde cero.

No reemplazar una pantalla existente por una implementación nueva si puede modificarse la existente.

Mantener:

* diseño;
* navegación;
* nombres visibles;
* estados;
* comportamiento;
* compatibilidad con funcionalidades existentes.

Cuando sea necesario cambiar únicamente una llamada API, modificar la llamada y conservar el resto de la interfaz.

---

# 5. Backend Serverless

El backend debe ser compatible con Vercel cuando el endpoint esté destinado a ejecutarse allí.

Los handlers deben ser exportables y no deben utilizar:

```js
app.listen()
```

cuando correspondan a funciones Serverless.

Usar asincronía.

Evitar depender de filesystem local persistente.

No asumir que `/tmp` o cualquier otro directorio local constituye almacenamiento permanente.

Los archivos permanentes deben almacenarse en Supabase Storage u otro almacenamiento persistente definido por la arquitectura.

No utilizar:

```js
fs.writeFileSync()
```

para implementar almacenamiento persistente.

Los Buffers en memoria pueden utilizarse cuando el tamaño y el flujo lo permitan.

---

# 6. Supabase

Toda operación con Supabase debe respetar el esquema real del proyecto.

Antes de escribir consultas:

1. inspeccionar `schema.sql` o la definición vigente;
2. verificar nombres exactos de tablas;
3. verificar nombres exactos de columnas;
4. verificar relaciones;
5. verificar políticas RLS cuando correspondan.

No inventar columnas.

No inventar tablas.

No asumir que una propiedad JavaScript tiene el mismo nombre que una columna PostgreSQL.

Ejemplo:

```js
supabase
  .from('payslips')
  .select('*, employees(name, email)')
  .eq('status', 'Cargado');
```

debe utilizarse solamente si esos nombres existen realmente en el esquema vigente.

---

# 7. Seguridad y multi-tenancy

DocuMation es una aplicación potencialmente multiempresa.

Toda información perteneciente a una empresa debe permanecer aislada.

No confiar únicamente en filtros enviados desde el frontend.

La autorización debe validarse en backend y/o mediante RLS.

Nunca exponer:

* claves privadas;
* API keys;
* passwords;
* SMTP passwords;
* tokens;
* secretos de firma;
* claves VAPID;
* claves de OpenAI/Groq;
* credenciales de Microsoft Graph.

Los secretos deben mantenerse en variables de entorno o mecanismos seguros de secretos.

Nunca guardar secretos en:

* `db.json`;
* código frontend;
* archivos públicos;
* respuestas API;
* logs.

---

# 8. REGLA CRÍTICA — Generación de PDF de recibos

## 8.1 Excel es la fuente visual de verdad

Cuando un recibo proviene de un Excel, el Excel original es la **fuente visual de verdad**.

El objetivo no es simplemente generar un PDF válido.

El objetivo es generar un PDF que conserve la apariencia y contenido visual esperado del Excel.

Esto incluye, cuando existan:

* layout;
* tamaños;
* posiciones;
* fuentes;
* bordes;
* colores;
* imágenes;
* firmas;
* gráficos;
* fórmulas calculadas;
* alineación;
* márgenes;
* escala;
* saltos de página;
* áreas de impresión;
* encabezados;
* pies;
* dimensiones;
* orientación;
* contenido de las celdas.

### Regla obligatoria

> **"PDF válido" y "PDF fiel al Excel original" son dos criterios diferentes y ambos deben cumplirse.**

Un `Buffer` válido no demuestra que la generación de PDF sea correcta.

Un PDF que abre correctamente pero pierde una firma, un gráfico, una imagen, una parte del layout o cambia la escala **NO se considera una solución correcta**.

---

# 9. Diagnóstico obligatorio antes de modificar PDF

Cuando una tarea afecte:

* generación de PDF;
* Excel → PDF;
* firma;
* gráficos;
* imágenes;
* recibos;
* impresión;
* layout;
* paginación;
* descarga de PDF;

el agente debe realizar primero un diagnóstico corto.

Debe determinar:

1. cuál es el archivo fuente;
2. qué renderer se utiliza actualmente;
3. cómo se genera actualmente el PDF;
4. si se utiliza Excel Desktop, LibreOffice, Graph, ExcelJS, pdf-lib, pdfkit, HTML u otro mecanismo;
5. si existen imágenes;
6. si existen firmas;
7. si existen gráficos;
8. si existen fórmulas;
9. qué configuración de impresión utiliza el Excel;
10. qué partes pueden perderse con el renderer actual.

Antes de cambiar el renderer debe indicar:

* problema encontrado;
* riesgo de fidelidad;
* alternativa propuesta;
* estrategia de fallback;
* estrategia de validación.

No modificar `pdfService.js` solamente porque el resultado sea un `Buffer`.

---

# 10. No utilizar un generador PDF genérico como sustituto automático de Excel

Cuando la fidelidad visual sea requisito:

No asumir que estas herramientas pueden reproducir automáticamente un Excel complejo:

* `pdf-lib`;
* `pdfkit`;
* HTML/CSS;
* React PDF;
* Canvas;
* ExcelJS como renderer principal.

Estas herramientas pueden utilizarse para tareas auxiliares cuando corresponda, pero no deben sustituir automáticamente al motor que realmente renderiza Excel.

ExcelJS puede utilizarse para:

* leer datos;
* inspeccionar worksheets;
* procesar información;
* modificar determinadas estructuras;

pero no debe considerarse por sí solo equivalente al motor de renderizado de Microsoft Excel.

---

# 11. Arquitectura de PDF desacoplada

La generación de recibos debe diseñarse mediante una abstracción equivalente a:

```text
PayrollPdfEngine
```

El resto de DocuMation no debe depender directamente de una tecnología concreta.

Ejemplo conceptual:

```text
PayrollPdfEngine
├── MicrosoftGraphPdfEngine
├── ExcelDesktopPdfEngine
└── LibreOfficePdfEngine
```

La implementación concreta dependerá de las necesidades de despliegue.

La aplicación debe poder cambiar de engine sin modificar:

* empleados;
* recibos;
* firma;
* envío;
* estados;
* almacenamiento;
* frontend.

---

# 12. Microsoft Graph como candidato

Microsoft Graph puede evaluarse como engine serverless porque Microsoft documenta conversión de archivos Excel `.xlsx`, `.xlsm` y `.xls` a PDF.

Sin embargo:

> Microsoft Graph NO debe considerarse automáticamente equivalente a Excel Desktop.

Antes de adoptarlo como renderer principal se debe comparar el resultado contra el PDF producido por Excel Desktop utilizando un workbook real del proyecto.

La prueba debe considerar especialmente:

* firma del empleador;
* gráficos;
* imágenes;
* escala;
* márgenes;
* page breaks;
* orientación;
* área de impresión;
* fuentes;
* fórmulas;
* posición de elementos;
* cantidad de páginas.

Graph debe tratarse como una alternativa técnica que debe superar la validación visual, no como una solución asumida.

---

# 13. Excel Desktop como referencia de fidelidad

Cuando el requisito sea máxima fidelidad, el comportamiento de Excel Desktop debe considerarse referencia visual.

La implementación histórica puede utilizar:

```text
Excel.Application
PageSetup
FitToPagesWide
FitToPagesTall
ExportAsFixedFormat
```

No debe eliminarse esta capacidad hasta disponer de una alternativa validada.

Si Excel Desktop no puede ejecutarse dentro de Vercel:

* mantenerlo como engine externo;
* considerar un worker Windows;
* considerar un servicio dedicado;
* considerar Microsoft Graph;
* considerar LibreOffice solamente después de validación.

La imposibilidad de ejecutar Excel Desktop directamente en Vercel NO justifica degradar silenciosamente la calidad del PDF.

---

# 14. Golden Master

Debe existir un archivo Excel representativo como referencia de regresión.

El workbook de prueba debe incluir, cuando sea posible:

* datos reales anonimizados;
* firmas;
* imágenes;
* gráficos;
* fórmulas;
* múltiples worksheets;
* configuración de impresión;
* Original;
* Duplicado.

La prueba debe generar:

```text
Excel Desktop → PDF de referencia
Nuevo Engine → PDF candidato
```

y comparar ambos.

---

# 15. Validación de PDF

No considerar suficiente:

```js
Buffer.isBuffer(pdf)
```

Debe validarse como mínimo:

* PDF generado;
* PDF legible;
* cantidad de páginas;
* tamaño de página;
* orientación;
* contenido;
* presencia de firma;
* presencia de imágenes;
* presencia de gráficos;
* posición relativa de elementos;
* escala;
* márgenes;
* ausencia de contenido cortado.

Cuando sea posible, realizar comparación visual/renderizada.

Una diferencia visual importante debe considerarse regresión.

---

# 16. Firma digital/electrónica

La firma es una funcionalidad independiente del renderer PDF.

No modificarla como efecto secundario de un cambio en generación de PDF.

Preservar:

* estado de firma;
* `signedAt`;
* IP;
* user-agent;
* URL;
* almacenamiento;
* hash;
* trazabilidad;
* datos del firmante.

Si el PDF se genera primero y se firma después, mantener ese flujo salvo que el usuario solicite modificarlo.

Una corrección de generación de PDF no debe alterar el mecanismo de firma sin necesidad.

---

# 17. Original y Duplicado

Cuando el flujo actual genere:

```text
recibo_Original.pdf
recibo_Duplicado.pdf
```

deben mantenerse ambos documentos.

No cambiar:

* nombres;
* rutas;
* estados;
* URLs;
* comportamiento de descarga;

sin una razón explícita.

Si el Excel utiliza diferentes rangos de impresión para Original y Duplicado, deben conservarse.

Ejemplo histórico:

```text
Original:
B80:G153

Duplicado:
B2:G77
```

Estos rangos son ejemplos del comportamiento existente y deben verificarse contra el código actual antes de modificarlos.

---

# 18. Procesamiento Excel

Antes de modificar la lógica Excel:

1. identificar worksheets válidos;
2. identificar worksheets ignorados;
3. verificar detección de CUIL;
4. verificar deduplicación;
5. verificar matching con empleados;
6. verificar rangos Original/Duplicado;
7. verificar imágenes;
8. verificar gráficos;
9. verificar fórmulas;
10. verificar configuración de impresión.

No cambiar la lógica de negocio al cambiar el renderer.

Separar:

```text
Procesamiento Excel
        ↓
Datos / workbook
        ↓
PayrollPdfEngine
        ↓
PDF
        ↓
Firma
        ↓
Storage
        ↓
Envío / descarga
```

---

# 19. Jobs y operaciones largas

Las operaciones de procesamiento masivo deben diseñarse teniendo en cuenta los límites de ejecución de Vercel.

No asumir que una función serverless puede procesar indefinidamente.

Cuando el proceso pueda ser largo:

* dividir jobs;
* registrar progreso;
* utilizar `processing_jobs`;
* permitir reintentos;
* evitar duplicados;
* mantener idempotencia;
* registrar errores por recibo.

No perder todo el lote si falla un recibo individual.

---

# 20. API

No cambiar contratos API existentes innecesariamente.

Antes de modificar un endpoint verificar:

* método HTTP;
* parámetros;
* body;
* headers;
* respuesta;
* códigos HTTP;
* errores;
* frontend consumidor.

Si una modificación rompe el contrato, debe documentarse explícitamente.

---

# 21. Estados de recibos

Preservar los estados actuales.

No renombrar estados simplemente para "limpiar" el código.

No modificar transiciones existentes sin necesidad.

Toda transición nueva debe documentarse.

---

# 22. Almacenamiento

Los archivos permanentes deben almacenarse en almacenamiento persistente.

La arquitectura recomendada es:

```text
Supabase Storage
      ↓
metadata en PostgreSQL
      ↓
payslip/document
```

No depender de archivos locales de Vercel para almacenamiento permanente.

---

# 23. Manejo de errores

No ocultar errores.

No utilizar:

```js
catch (error) {
  return null;
}
```

cuando esto pueda ocultar una falla real.

Los errores deben:

* registrarse;
* clasificarse;
* retornar una respuesta controlada;
* conservar contexto suficiente para diagnóstico;
* no exponer secretos.

---

# 24. Pruebas de regresión

Toda corrección de bug debe intentar agregar una prueba de regresión.

Ejemplos:

```text
pdfService.vercel.test.js
payslip-processing.test.js
signature.test.js
excel-processing.test.js
```

Las pruebas deben comprobar el comportamiento relevante.

Una prueba que solamente comprueba:

```js
Buffer.isBuffer(pdf)
```

no es suficiente para validar fidelidad visual.

---

# 25. Regla especial para tareas ambiguas

Si el usuario solicita:

> "Haz que el PDF funcione en Vercel"

NO interpretar automáticamente que significa:

> "Haz que exista un Buffer PDF".

Primero determinar:

1. qué parte falla;
2. dónde falla;
3. cuál es el renderer;
4. qué requisitos visuales existen;
5. qué comportamiento debe mantenerse;
6. qué alternativa es compatible con Vercel;
7. qué riesgos introduce.

Después implementar.

---

# 26. Cambios mínimos

Preferir:

```text
cambio localizado
```

sobre:

```text
reescritura completa
```

No realizar refactors no relacionados.

No cambiar:

* nombres de variables;
* estructura de carpetas;
* librerías;
* arquitectura;
* UI;

si no es necesario para la tarea.

---

# 27. Dependencias

Antes de agregar una dependencia:

1. verificar si ya existe una alternativa instalada;
2. verificar compatibilidad con Vercel;
3. verificar tamaño;
4. verificar mantenimiento;
5. verificar licencia;
6. verificar compatibilidad Node.js;
7. evaluar impacto en cold starts;
8. evaluar seguridad.

No agregar librerías innecesarias.

---

# 28. Compatibilidad

El código debe considerar:

* Node.js utilizado por el proyecto;
* Vercel;
* Supabase;
* navegador;
* variables de entorno;
* límites de memoria;
* límites de ejecución;
* archivos grandes;
* concurrencia.

---

# 29. No crear soluciones dummy

Está prohibido dejar:

```text
TODO
FIXME
mock temporal
dummy
placeholder
return null
```

como solución final de una funcionalidad solicitada.

Si algo no puede implementarse correctamente, detenerse y explicar exactamente qué dependencia o información falta.

---

# 30. Criterio de finalización

Una tarea NO está terminada simplemente porque:

* compila;
* el endpoint responde 200;
* existe un PDF;
* el PDF es un Buffer;
* la UI carga.

Debe verificarse que:

1. la funcionalidad solicitada funciona;
2. las funcionalidades existentes siguen funcionando;
3. no se modificaron comportamientos no solicitados;
4. las pruebas relevantes pasan;
5. no existen errores evidentes;
6. los cambios son compatibles con la arquitectura;
7. los riesgos conocidos están documentados.

Para PDF, adicionalmente:

8. el PDF es visualmente fiel al Excel cuando esa es la exigencia;
9. firma, imágenes y gráficos permanecen;
10. Original y Duplicado siguen funcionando;
11. el resultado es compatible con el flujo de firma y almacenamiento.

---

# 31. Informe final obligatorio

Al terminar una tarea, informar:

### Cambios realizados

Lista concreta de archivos modificados.

### Problema encontrado

Explicación breve de la causa real.

### Solución

Qué se modificó y por qué.

### Compatibilidad

Indicar impacto en:

* Vercel;
* Supabase;
* frontend;
* Excel;
* PDF;
* firma;
* almacenamiento.

### Pruebas

Indicar exactamente qué se ejecutó.

### Regresiones

Indicar qué funcionalidades se verificaron.

### Riesgos

Indicar cualquier riesgo pendiente.

### Siguiente paso

Si existe una tarea adicional necesaria, indicarla claramente.

---

# 32. Regla final

La prioridad del agente es:

```text
NO ROMPER
   ↓
ENTENDER
   ↓
DIAGNOSTICAR
   ↓
CAMBIAR LO MÍNIMO
   ↓
VALIDAR
   ↓
REGRESIÓN
   ↓
DOCUMENTAR
```

En DocuMation, especialmente para recibos:

> **La apariencia existente del recibo es un requisito funcional, no un detalle cosmético.**

Por lo tanto:

> **Nunca reemplazar un mecanismo de generación de PDF por otro únicamente porque el nuevo funciona en Vercel.**

Primero debe demostrarse que el nuevo mecanismo conserva el comportamiento requerido.

---

# Definition of Done

Una implementación puede considerarse terminada únicamente cuando:

* [ ] Se inspeccionó el código existente.
* [ ] Se verificó la rama Git.
* [ ] Se verificó `git status`.
* [ ] Se respetó la arquitectura existente.
* [ ] No se eliminaron funcionalidades existentes.
* [ ] No se realizaron cambios no relacionados.
* [ ] Se respetó el esquema Supabase.
* [ ] Se respetó la seguridad multiempresa.
* [ ] No se expusieron secretos.
* [ ] Se agregaron pruebas cuando correspondía.
* [ ] Se ejecutaron las pruebas relevantes.
* [ ] Se verificó compatibilidad con Vercel cuando corresponde.
* [ ] Se verificó el flujo completo.
* [ ] En cambios de PDF se verificó fidelidad visual.
* [ ] Firma, imágenes y gráficos fueron preservados.
* [ ] Original y Duplicado fueron preservados.
* [ ] Se documentaron riesgos.
* [ ] Se informó exactamente qué cambió.
