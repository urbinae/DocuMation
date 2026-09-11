# Guía de Despliegue de DocuMation

Esta guía detalla los pasos necesarios para desplegar DocuMation en **Vercel** (Frontend y Backend Serverless) y configurar **Supabase** (Base de Datos PostgreSQL y Storage).

---

## 1. Requisitos Previos

Antes de comenzar, asegúrate de tener:

- Una cuenta en [Vercel](https://vercel.com/)
- Una cuenta en [Supabase](https://supabase.com/)
- Acceso al repositorio de código de DocuMation (GitHub, GitLab o Bitbucket).

---

## 2. Configuración de Supabase

DocuMation utiliza Supabase para la base de datos relacional (PostgreSQL) y el almacenamiento de archivos (Storage).

### Paso 2.1: Crear el proyecto
1. Ingresa a [Supabase](https://supabase.com/dashboard) y haz clic en **"New Project"**.
2. Selecciona tu organización, ingresa un nombre para la base de datos y define una contraseña segura.
3. Haz clic en **"Create new project"**. Esto tomará un par de minutos.

### Paso 2.2: Inicializar la Base de Datos
1. Ve a la sección **SQL Editor** en el panel izquierdo.
2. Haz clic en **"New Query"**.
3. Copia el contenido del archivo `supabase_schema.sql` (ubicado en la raíz del proyecto) y pégalo en el editor.
4. Haz clic en **"Run"** para crear todas las tablas, relaciones y políticas necesarias.

### Paso 2.3: Configurar el Storage
1. Ve a la sección **Storage** en el panel izquierdo.
2. Haz clic en **"New Bucket"**.
3. Crea los buckets necesarios (por ejemplo, `recibos`, `documentos`).
4. Asegúrate de configurar las políticas de acceso (públicas o privadas según corresponda en el script `supabase_schema.sql`).

### Paso 2.4: Obtener Credenciales
1. Ve a **Project Settings** (icono de engranaje) > **API**.
2. Copia y guarda los siguientes valores:
   - **Project URL** (`SUPABASE_URL`)
   - **Project API Keys -> service_role** (`SUPABASE_SERVICE_ROLE_KEY` - *¡No usar la anon key para el backend!*)

---

## 3. Despliegue en Vercel

Vercel alojará tanto el frontend (React/Vite) como el backend (Node.js/Express en modo Serverless).

### Paso 3.1: Importar el Proyecto
1. Ingresa a tu dashboard de [Vercel](https://vercel.com/dashboard).
2. Haz clic en **"Add New..."** > **"Project"**.
3. Selecciona el repositorio de DocuMation desde tu proveedor Git y haz clic en **"Import"**.

### Paso 3.2: Configurar el Proyecto
Vercel detectará la configuración automáticamente gracias al archivo `vercel.json` incluido en el proyecto. 

Verifica que la configuración de Build sea la siguiente (aunque por defecto ya viene así):
- **Framework Preset:** `Other`
- **Build Command:** `cd client && npm install && npm run build`
- **Output Directory:** `client/dist`

### Paso 3.3: Configurar Variables de Entorno
En la misma pantalla de configuración, despliega la sección **"Environment Variables"** y añade las siguientes variables basándote en el archivo `.env.example`:

| Nombre Variable | Valor (Ejemplo) | Descripción |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Entorno de ejecución |
| `SUPABASE_URL` | `https://tu-proyecto.supabase.co` | URL de tu proyecto Supabase (Paso 2.4) |
| `SUPABASE_SERVICE_ROLE_KEY`| `eyJhbGciOi...` | Clave secreta service_role (Paso 2.4) |
| `COMPANY_NAME` | `e-ABC Learning` | Nombre de la compañía |
| `GROQ_API_KEY` | `gsk_tu_clave` | Clave de Groq para módulo de IA (Opcional) |
| `SMTP_HOST` | `smtp.proveedor.com` | Host SMTP para envío de correos |
| `SMTP_PORT` | `587` | Puerto SMTP |
| `SMTP_USER` | `usuario@dominio.com` | Usuario SMTP |
| `SMTP_PASS` | `tu_contraseña` | Contraseña SMTP |
| `SMTP_FROM` | `no-reply@dominio.com` | Remitente de los correos |
| `GOOGLE_CLIENT_ID` | `tu-cliente-id...` | ID de cliente OAuth2 de Google |
| `GOOGLE_ALLOWED_DOMAIN`| `tudominio.com` | Dominio permitido para login con Google |
| `RECIBOS_SERVICE_URL` | `https://recibos.e-abc.com` | URL del microservicio procesador de recibos de sueldo (Python/LibreOffice) |

*Nota: No es necesario configurar `BASE_URL` o `FRONTEND_URL` ya que Vercel se encarga del ruteo en el mismo dominio a través de `/api` para el backend.*

### Paso 3.4: Desplegar
1. Haz clic en el botón **"Deploy"**.
2. Vercel comenzará a instalar las dependencias y hacer el build de la aplicación.
3. Una vez finalizado, podrás acceder a la aplicación a través de la URL proporcionada por Vercel (ej: `https://documation-app.vercel.app`).

---

## 4. Despliegue del Microservicio de Recibos (Python + LibreOffice)

El procesamiento y generación masiva de PDFs a partir de los Excel de RRHH se realiza de forma asíncrona mediante un microservicio de Python que utiliza `LibreOffice Calc` bajo el capó (gracias a un contenedor Docker basado en Linux).

### Paso 4.1: Preparar el entorno de contenedores
1. El equipo de Infraestructura debe disponer de un servidor Linux o servicio administrado compatible con contenedores (ej. AWS ECS, Google Cloud Run, o un servidor con Docker y docker-compose instalado).

### Paso 4.2: Desplegar el servicio mediante Docker
1. Clona el código del microservicio.
2. Utiliza el `Dockerfile` provisto en su repositorio (basado en Debian `bookworm-slim`, que incluye las dependencias necesarias de LibreOffice y fuentes tipográficas).
3. Haz el build y ejecuta la imagen:
   ```bash
   docker build -t documation-recibos-api .
   docker run -d -p 10000:10000 --name recibos-api documation-recibos-api
   ```
4. El servicio levantará el servidor web Uvicorn escuchando por defecto en el puerto 10000.

### Paso 4.3: Conectar con DocuMation
1. Configura un dominio o IP estática accesible y con soporte HTTPS/SSL (ej: `https://recibos.e-abc.com`).
2. Ve a las variables de entorno de tu proyecto en Vercel (Paso 3.3) e ingresa esta URL exacta en la variable `RECIBOS_SERVICE_URL`.

---

## 5. Verificación Post-Despliegue

1. Ingresa a la URL proporcionada por Vercel.
2. Intenta iniciar sesión (con Google o con un usuario de prueba en tu base de datos Supabase).
3. Sube un documento de prueba para verificar que la conexión a **Supabase Storage** es correcta.
4. Si algo falla, puedes revisar los registros en el dashboard de Vercel en la pestaña **"Logs"**.

---
*Fin de la guía.*
