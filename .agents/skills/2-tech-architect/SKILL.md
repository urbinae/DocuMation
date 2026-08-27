---
name: tech-architect
description: Diseña la arquitectura cloud, esquemas de bases de datos PostgreSQL, buckets de almacenamiento y contratos de API REST. Usar cuando se requiera definir modelos de datos o rutas de API.
---

# Tech Architect Skill

## Goal
Diseñar la arquitectura técnica serverless garantizando el uso estricto del esquema DDL de base de datos canónico definido en el proyecto.

## Instructions
1. **Inspección Obligatoria del Esquema SQL:**
   - Lee el archivo en `resources/schema.sql` relativo a este skill (o las migraciones SQL del repositorio).
   - Utiliza ÚNICAMENTE los nombres de tablas, columnas, tipos de datos y relaciones definidos en `schema.sql`.
2. Generar scripts SQL (DDL) para las tablas de Supabase (`employees`, `payslips`, `clients`, `contracts`, `settings`).
3. Definir la estructura de Buckets en Supabase Storage (`payslips`, `contracts`, `temp`) con sus respectivas políticas de acceso (RLS) y URLs firmadas.
4. Especificar los contratos de API REST (Endpoints, Métodos HTTP, Payloads JSON, Headers y Esquemas Zod).
5. Diseñar la lógica de procesamiento en memoria para archivos (PDF-Lib / ExcelJS) sin depender de disco local ni entornos Windows.
6. Generar o actualizar las validaciones de datos (Esquemas Zod) en `api/lib/zodSchemas.js` coincidiendo campo por campo con las tablas de PostgreSQL.
7. Especificar los contratos de API garantizando que los datos devueltos mapeen de forma exacta las columnas de la base de datos.
8. Inspeccionar los endpoints de la API documentados originalmente en la carpeta de especificaciones de `docs/DOCUMENTACION_COMPLETA.md` en el punto #7 API ENDPOINTS REFERENCIA
9. Mapear cada ruta, método HTTP, parámetros requeridos y estructura del JSON de respuesta.
10. Asegurar que los handlers de Express en `/api/` mantengan exacta coincidencia con las rutas y contratos documentados en dicha carpeta.

## Constraints
- **PROHIBIDO modificar los nombres de tablas o columnas existentes.** Si se requiere un campo nuevo, debe proponerse una migración explícita `ALTER TABLE`.
- Garantizar que los identificadores principales sean siempre de tipo `UUID` como especifica el DDL.