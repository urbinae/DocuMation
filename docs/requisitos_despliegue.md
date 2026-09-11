Para poder avanzar con el despliegue del proyecto DocuMation a producción, necesitamos gestionar los siguientes accesos y requerimientos de infraestructura:

1. Accesos a Plataformas (Cloud & Backend)

Vercel: Creación de cuenta o acceso al equipo de la empresa para alojar el Frontend y Backend Serverless. (Se vinculará con nuestro repositorio).
Supabase: Cuenta o acceso a la organización para crear la base de datos (PostgreSQL) y configurar los buckets de almacenamiento de archivos (Storage).
Repositorio Git: Asegurar que la cuenta de Vercel tenga los permisos necesarios para leer el código fuente (GitHub / GitLab / Bitbucket).
2. Opciones de Infraestructura (Microservicio de Recibos) El proyecto incluye un microservicio (basado en Docker, Linux, Python y LibreOffice) encargado de transformar los Excel a PDF. Para alojarlo, tenemos dos opciones a definir:

Opción 1 (PaaS Cloud - Render.com): Utilizar la plataforma Render.com (como estamos probando actualmente). Costos estimados:
Plan Básico: 0.5 CPU / 512MB RAM por $7 / mes.
Plan Recomendado (más rápido para Excels pesados): 1 CPU / 2GB RAM por $25 / mes.
Opción 2 (On-Premise / IaaS Propio): Crear un entorno compatible con Docker en alguno de los servidores actuales de e-ABC. El equipo de Infraestructura solo debe proveer la IP/Subdominio (ej: recibos.e-abc.com) con puerto abierto para que Vercel pueda comunicarse con el contenedor.
3. Credenciales y API Keys (Servicios de Terceros) Se requiere que nos provean las siguientes claves de producción para inyectarlas en las variables de entorno:

Servicio de Email (SMTP): Host, puerto, usuario y contraseña para el envío de notificaciones.
Google OAuth2: Client ID configurado en Google Cloud Console para habilitar el inicio de sesión con cuentas de Google.