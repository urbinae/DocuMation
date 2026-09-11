# DocuMation

DocuMation es una plataforma integral para la gestión documental, firmas electrónicas, automatización de recibos de sueldo y flujos comerciales B2B. Está diseñada con una arquitectura serverless moderna y altamente escalable.

## 🚀 Arquitectura del Proyecto

El proyecto se compone de los siguientes elementos de arquitectura:

1.  **Backend (API Serverless)**: Desarrollado en Node.js (Express), preparado para ser desplegado como funciones Serverless en Vercel. Se encarga de la orquestación, procesamiento de PDFs, notificaciones push, envío de correos y la interacción con la base de datos.
2.  **Microservicio de Recibos (Worker)**: Contenedor Docker basado en Linux que ejecuta una API en Python junto con LibreOffice. Se utiliza para generar asíncronamente los recibos en formato PDF a partir de archivos Excel, sorteando las limitaciones ofimáticas del entorno Serverless.
3.  **Frontend (Client)**: Aplicación SPA desarrollada con React y Vite, alojada en el directorio `/client`.
4.  **Base de Datos y Almacenamiento**: Utiliza Supabase (PostgreSQL) para la persistencia de datos estructurados y Supabase Storage para los documentos, firmas y recibos en PDF.

### Tecnologías Clave
*   **Backend**: Node.js, Express, Vercel Serverless Functions.
*   **Frontend**: React, Vite.
*   **Base de Datos**: Supabase (PostgreSQL & Storage).
*   **Procesamiento de Documentos**: `pdf-lib`, `pdf-parse`, `exceljs`, `adm-zip`, `archiver`.
*   **Comunicaciones**: `nodemailer` (Emails SMTP), `web-push` (Notificaciones Push).

## 📂 Estructura de Directorios

```text
DocuMation/
├── api/                  # Rutas y lógica de la API Express (Backend Serverless)
│   ├── lib/              # Librerías y utilidades
│   ├── routes/           # Controladores de rutas
│   └── services/         # Servicios (Supabase, Nodemailer)
├── client/               # Código fuente del Frontend (React + Vite)
├── docs/                 # Documentación técnica adicional y especificaciones
├── src/                  # Código compartido o utilidades adicionales
├── supabase/             # Scripts de migración y configuración de base de datos
│   └── supabase_schema.sql # Esquema principal de PostgreSQL
├── .env.example          # Plantilla de variables de entorno
├── server.js             # Punto de entrada local del backend
└── vercel.json           # Configuración de despliegue para Vercel
```

## ⚙️ Variables de Entorno

Para ejecutar el proyecto, necesitas configurar las siguientes variables de entorno. Puedes copiar el archivo `.env.example` a un nuevo archivo `.env` en la raíz del proyecto.

```env
# Configuración del Servidor y Dominio
PORT=5000
BASE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173
APP_URL=http://localhost:5173
COMPANY_NAME=e-ABC Learning

# Supabase (PostgreSQL & Storage)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Módulo de Inteligencia Artificial (Groq SDK)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Módulo de Email (Nodemailer - SMTP)
# Si no están configuradas las credenciales SMTP, se activa la simulación local por consola
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM=no-reply@e-abc.com

# Módulo de Autenticación Google OAuth2
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_ALLOWED_DOMAIN=e-abc.com

RECIBOS_SERVICE_URL=https://recibos.e-abc.com
```

## 🛠️ Instalación y Ejecución Local

### Prerrequisitos
*   Node.js v18.0.0 o superior (`node -v`).
*   NPM o Yarn (`npm -v`).
*   Un proyecto activo en Supabase.

### Paso a paso

1.  **Clonar el repositorio**:
    ```bash
    git clone <url-del-repositorio>
    cd DocuMation
    ```

2.  **Instalar dependencias del Backend**:
    ```bash
    npm install
    ```

3.  **Instalar dependencias del Frontend**:
    ```bash
    cd client
    npm install
    cd ..
    ```

4.  **Configurar Variables de Entorno**:
    Copia `.env.example` a `.env` y completa los valores con tus credenciales de Supabase, Groq y SMTP.
    ```bash
    cp .env.example .env
    ```

5.  **Ejecutar el proyecto en desarrollo**:
    Si tienes Vercel CLI instalado, puedes usar:
    ```bash
    npm run dev
    ```
    Alternativamente, puedes iniciar el backend y el frontend por separado:
    *   **Backend**: `npm start` (inicia en `http://localhost:5000`)
    *   **Frontend**: `cd client && npm run dev` (inicia en `http://localhost:5173`)

## 🧪 Pruebas

Para ejecutar la suite de pruebas del backend (utilizando el test runner nativo de Node.js):

```bash
npm test
```

## 📦 Despliegue (Build)

Para construir la versión de producción del frontend:

```bash
npm run build
```
Esto generará los archivos estáticos en `client/dist`. El despliegue en Vercel manejará automáticamente tanto la API serverless como el frontend estático basándose en el archivo `vercel.json` y la configuración del dashboard.
