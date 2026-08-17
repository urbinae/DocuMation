# 7. Documentación Técnica del Mockup (Hand-off a Desarrollo)

**Proyecto:** DocuMation
**Objetivo de este documento:** Brindar al equipo de Desarrollo (Frontend / Backend) la información necesaria para comprender cómo está estructurado el Mockup actual, qué tecnologías utiliza, y cómo transicionar este prototipo hacia el MVP funcional.

---

## 1. Stack Tecnológico del Mockup
El mockup ha sido construido como una aplicación **Frontend (SPA)** para validar rápidamente los flujos y la interfaz de usuario con los stakeholders.

- **Framework:** React 18
- **Tooling:** Vite
- **Estilos:** Tailwind CSS (configurado en `index.css`)
- **Iconografía:** Lucide React (`lucide-react`)
- **Componentes Base:** Componentes funcionales usando Hooks (`useState`, `useEffect`).

> **Nota para Desarrollo:** Actualmente, el mockup **no** está conectado a un Backend. Toda la persistencia de datos (listado de recibos, empleados, analíticas) es manejada en memoria o con variables estáticas temporales en el estado de React.

---

## 2. Estructura del Repositorio (Carpeta `client/src`)

El código fuente del mockup se encuentra dividido lógicamente para separar los dos dominios principales de la aplicación: el módulo de Recursos Humanos y el Portal del Empleado.

```text
client/src/
├── App.jsx                 # Enrutador/Orquestador principal temporal (cambia entre HR y Employee)
├── index.css               # Estilos globales y utilidades de Tailwind
├── hr/                     # Módulo de Administrador (RRHH)
│   ├── HRLogin.jsx         # Pantalla de acceso simulado para RRHH
│   ├── HRDashboard.jsx     # Contenedor principal (Sidebar + Área de contenido)
│   ├── DashboardTab.jsx    # Métricas y KPIs generales de RRHH
│   ├── EmployeesTab.jsx    # ABM de Empleados (Archivar/Restaurar)
│   ├── PayslipsTab.jsx     # Flujo crítico: Carga masiva de PDFs y Split
│   ├── ConfigTab.jsx       # Configuraciones de RRHH
│   ├── DebtorsTab.jsx      # Seguimiento de recibos pendientes
│   └── RiskTab.jsx         # Análisis de riesgos (opcional MVP)
├── employee/               # Módulo de Usuario Final (Empleado)
│   ├── EmployeeLogin.jsx   # Ingreso simulado (en MVP será por Token Link)
│   ├── EmployeePortal.jsx  # Visualizador de recibos y firma electrónica (Canvas/Foto)
│   ├── EmployeeDashboard.jsx # Histórico de recibos firmados y descargas
│   └── FinancialAnalyticsTab.jsx # Gráficos financieros del empleado
└── shared/                 # Componentes reutilizables (Botones, Modales, Cards, etc.)
```

---

## 3. Flujos Críticos a Integrar con el Backend

### 3.1. Carga y Split de Recibos (`PayslipsTab.jsx`)
- **Estado Actual:** Permite subir un archivo, simula una barra de progreso, y muestra un listado "resultado" de los recibos divididos.
- **Acción Backend:** Deberán crear un endpoint (`POST /api/payslips/upload`) que reciba el PDF Maestro y el Excel. El backend (ej. Node.js + `pdf-lib`) debe realizar el *split* utilizando el número de CUIL como ancla, y devolver un array de los recibos individuales asociados a cada empleado.

### 3.2. Firma Electrónica (`EmployeePortal.jsx`)
- **Estado Actual:** El empleado puede ver un PDF (mockup estático), firmar en un Canvas HTML5 o simular la subida de una foto de su firma. Al "Aceptar", simplemente se muestra un toast de éxito.
- **Acción Backend:** El frontend deberá capturar el base64 de la firma (del canvas o la foto subida) y enviarlo vía API (`POST /api/payslips/:id/sign`). El backend tomará el PDF original del empleado y le "estampará" la imagen de la firma junto con el bloque de auditoría (Timestamp, IP, Navegador).

### 3.3. Gestión de Nómina (`EmployeesTab.jsx`)
- **Estado Actual:** Muestra una tabla hardcodeada. Permite interactuar con botones de "Archivar" o "Restaurar".
- **Acción Backend:** Reemplazar el estado local con llamadas a una API REST (CRUD de empleados persistido en JSON local para el MVP, o base de datos según se determine en Evaluación de Factibilidad).

---

## 4. Instrucciones para Ejecutar el Mockup Localmente
Si el equipo de desarrollo desea levantar el mockup en sus máquinas para revisarlo interactivo:

1. Abrir una terminal en la carpeta `client`.
2. Ejecutar `npm install` para instalar las dependencias (React, Vite, Tailwind, Lucide).
3. Ejecutar `npm run dev` (o el script configurado en el package.json).
4. Abrir `http://localhost:5173` en el navegador.

---
**Entregable generado por:** MVP Creator AI (Agente)
