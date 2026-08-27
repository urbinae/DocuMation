---
name: developer
description: Implementa código fuente Serverless en Node.js, Express, React y Supabase. Usar para escribir o refactorizar controladores de API, handlers, librerías en memoria o componentes UI reutilizando el código base existente.
---

# Fullstack Developer Skill

## Goal
Implementar código limpio y modular reutilizando la estructura, diseño y componentes del código base actual en `/src` para el Frontend, e integrándolo con la API Serverless de `/api`.
Implementar la lógica backend en `/api` y la integración frontend en `/src` respetando al 100% la estructura de tablas y campos PostgreSQL canónica.
Modifica la logica del frontend si es necesario para que se adapte a la logica del backend, manteniendo el diseño.

## Instructions
1. **Inspección Previa del Código Base (Frontend Mandatory Step):**
   - Antes de crear cualquier componente UI nuevo, analiza el directorio `/src` (incluyendo `/src/employee/`, `/src/hr/`, `/src/commercial/` y `/src/shared/`).
   - Reutiliza el diseño CSS (`index.css`), clases Tailwind, componentes de UI y lógica de enrutamiento existentes en `App.jsx`.
   - Modifica únicamente las llamadas a API (fetch/axios) para conectarlas a los nuevos endpoints de `/api/` manteniendo el estado visual del Front.
   - Para toda operación de lectura/escritura con `@supabase/supabase-js`, utiliza únicamente los nombres de tablas y columnas del archivo `schema.sql` del proyecto (`employees`, `payslips`, `clients`, `contracts`, `settings`).
   - Ejemplo de consulta válida:
     `supabase.from('payslips').select('*, employees(name, email)').eq('status', 'Cargado')`
   - Mapea las propiedades consumidas en `/src` con los nombres exactos retornados por Supabase (ej. `employee_id`, `signed_storage_path`, `detected_cuil`).
2. **Backend Serverless:**
   - Crear Handlers Express exportables en `/api` (sin `app.listen()`).
   - Usar asincronía con `@supabase/supabase-js`.
   - Procesar PDFs/Excel en memoria (Buffers con `pdf-lib` y `exceljs`).
   - Antes de escribir lógica de negocio para recibos, inspecciona el archivo de arquitectura en `.agents/skills/3-developer/resources/backend_payslip_rules.md` para verificar la precisión de los métodos.
   - Crea o refactoriza los endpoints en `/api/routes/payslips.js` utilizando la lógica descrita sin alterar las firmas ni las respuestas JSON estándar.

## Constraints
- **PROHIBIDO reescribir o rehacer el Frontend desde cero.** Todo desarrollo debe basarse en el código fuente de la carpeta `/src`.
- NO usar escrituras síncronas a disco local (`fs.writeFileSync`).
- NO dejar bloques `// TODO`, soluciones a medias o código dummy.
- NO asumir nombres de columnas distintos (ej. usar `employee_id` en lugar de `id_empleado`, `cuil` en lugar de `tax_id`).
- NO intentar realizar operaciones sobre tablas que no estén declaradas en el esquema oficial.