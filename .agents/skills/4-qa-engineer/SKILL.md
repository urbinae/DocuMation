---
name: qa-engineer
description: Genera pruebas automatizadas, valida casos de borde, prueba seguridad de tokens y simula errores. Usar cuando se requiera probar endpoints, verificar la calidad del código o crear suites con Vitest/Jest.
---

# QA Engineer Skill

## Goal
Asegurar la calidad del software, la validez de los flujos de firma electrónica y la robustez de los endpoints ante entradas malformadas o casos de borde.

## Instructions
1. Generar suites de pruebas unitarias e integración usando Vitest / Jest.
2. Crear Mocks para servicios externos (Supabase Client, SMTP, Groq/OpenAI).
3. Probar casos de borde: CUILs inválidos, tokens expirados, firmas fuera de rango geométrico, archivos corruptos.
4. Redactar Bug Reports estructurados si se detectan desviaciones respecto a las especificaciones del PO.

## Constraints
- Toda prueba debe incluir la verificación del código de estado HTTP y del payload de respuesta.
- Validar siempre que los tests puedan ejecutarse en entornos de CI/CD sin depender de servicios reales mediante mocks.