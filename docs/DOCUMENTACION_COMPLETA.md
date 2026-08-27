# Documentación Técnica Completa - DocuMation

**Proyecto:** DocuMation (Portal de Gestión y Firma de Recibos de Sueldo + Módulo Comercial B2B)  
**Versión:** 2.0.1  
**Fecha:** Agosto 2026  
**Estado:** MVP Funcional - En Desarrollo Activo  

---

## 1. VISIÓN GENERAL DEL PROYECTO

### 1.1 Propósito
DocuMation es una plataforma digital (MVP) diseñada para **automatizar la distribución y firma de recibos de sueldo**, reemplazando el proceso manual basado en papel. Además, incluye un **módulo comercial B2B** para la gestión de contratos y acuerdos con clientes externos.

### 1.2 Problema que Resuelve
- **Procesos manuales lentos** en la generación y distribución de recibos de sueldo
- **Uso excesivo de papel** y falta de trazabilidad legal
- **Falta de automatización** en la división masiva de PDFs (original/duplicado)
- **Necesidad de firma electrónica** con validez legal y auditoría completa
- **Gestión comercial descentralizada** de contratos B2B

### 1.3 Usuarios Objetivo (Personas)
| Rol | Descripción | Acceso |
|-----|-------------|--------|
| **RRHH / Administrador** | Gestión de nómina, carga masiva, envío de invitaciones, métricas | Portal RRHH (`/hr`) |
| **Empleado** | Visualización, firma y descarga de recibos | Portal Empleado (`/employee`) / Link directo por token |
| **Comercial / Admin B2B** | Gestión de clientes, contratos, plantillas, firma comercial | Portal Comercial (`/commercial`) |
| **Cliente Externo (B2B)** | Revisión y firma de contratos comerciales | Portal Cliente (`/b2b-portal`) |

---

## 2. ARQUITECTURA DEL SISTEMA

### 2.1 Stack Tecnológico

#### Frontend (Client)
```
React 19 + Vite 8
├── Tailwind CSS (estilos utilitarios + variables CSS custom)
├── Lucide React (iconografía)
├── React-PDF / PDF.js (visualización de PDFs en navegador)
├── Service Worker (notificaciones push Web Push)
└── Arquitectura SPA con Hash Router
```

#### Backend (Server)
```
Node.js + Express 4
├── PDF-Lib (manipulación, split, firma de PDFs)
├── pdf-parse + Tesseract.js (OCR) (extracción de texto)
├── Multer (multipart/form-data uploads)
├── Nodemailer (SMTP + simulación local)
├── Archiver (ZIP de descargas masivas)
├── ExcelJS (procesamiento Excel)
├── PowerShell (excel_to_pdf.ps1 - renderizado nativo Excel→PDF)
├── Zod v3/v4 (validación de esquemas)
├── Web-Push (VAPID push notifications)
├── Groq SDK / OpenAI SDK (IA para extracción metadatos B2B)
├── Google Auth Library (OAuth2 login empleados)
└── UUID + Crypto (tokens, hashing SHA-256/MD5)
```

#### Persistencia (MVP)
```
JSON File-based Database (db.json)
├── employees[] (nómina, roles, push subscriptions)
├── payslips[] (recibos: original/duplicado/firmado, metadatos, tokens)
├── clients[] (clientes B2B)
├── contracts[] (contratos comerciales, metadatos IA)
└── settings{} (configuración global: SMTP, Google, IA, empresa, umbrales)
```

#### Infraestructura
- **Desarrollo:** Concurrently (cliente:5173 + servidor:5000)
- **Producción:** Servidor Express sirve `client/dist` estático
- **Almacenamiento archivos:** Sistema de archivos local (`/uploads/`)
- **Autenticación:** JWT-like tokens (UUID v4) + Google OAuth2 + Credenciales (CUIL/Password)

---

## 3. ESTRUCTURA DEL REPOSITORIO

```
DocuMation/
├── client/                          # Frontend React + Vite
│   ├── public/
│   │   ├── favicon.svg
│   │   ├── icons.svg
│   │   └── sw.js                    # Service Worker (Push)
│   ├── src/
│   │   ├── App.jsx                  # Router principal + Estado global
│   │   ├── index.css                # Tailwind + Variables CSS + Temas
│   │   ├── main.jsx                 # Entry point
│   │   ├── Commercial.jsx           # Módulo B2B (Login + Dashboard)
│   │   ├── ClientPortal.jsx         # Portal firma cliente externo
│   │   ├── employee/                # Módulo Empleado
│   │   │   ├── EmployeeLogin.jsx
│   │   │   ├── EmployeeDashboard.jsx
│   │   │   ├── EmployeePortal.jsx   # Firma + Visualización PDF
│   │   │   └── FinancialAnalyticsTab.jsx
│   │   ├── hr/                      # Módulo RRHH
│   │   │   ├── HRLogin.jsx
│   │   │   ├── HRDashboard.jsx      # Contenedor tabs
│   │   │   ├── DashboardTab.jsx     # KPIs
│   │   │   ├── PayslipsTab.jsx      # Carga masiva/individual
│   │   │   ├── EmployeesTab.jsx     # ABM nómina
│   │   │   ├── ConfigTab.jsx        # Configuración
│   │   │   ├── DebtorsTab.jsx       # Seguimiento pendientes
│   │   │   └── RiskTab.jsx          # Análisis riesgo
│   │   └── shared/
│   │       ├── AccessHub.jsx        # Landing / Selector de rol
│   │       └── ThemeToggle.jsx
│   └── package.json
├── server/                          # Backend Express
│   ├── index.js                     # Servidor principal (2200+ líneas)
│   ├── db.js                        # Adaptador JSON file-based
│   ├── pdfService.js                # Análisis PDF/Imagen + Firma + OCR
│   ├── emailService.js              # Nodemailer + Templates HTML
│   ├── aiService.js                 # Extracción metadatos B2B (Groq/OpenAI)
│   ├── excel_to_pdf.ps1             # PowerShell Excel→PDF nativo
│   ├── .env                         # Variables entorno
│   ├── db.json                      # Base de datos runtime
│   ├── uploads/                     # Archivos físicos
│   │   ├── temp/                    # Temporales + excel_export/
│   │   ├── originals/               # PDFs Original (mitad inferior)
│   │   ├── duplicados/              # PDFs Duplicado (mitad superior)
│   │   ├── signed/                  # PDFs Firmados
│   │   │   └── contracts/           # Contratos B2B firmados
│   │   └── contracts/               # Contratos B2B originales
│   ├── mail-logs/                   # Logs emails (modo test)
│   └── package.json
├── Documentacion_MVP/               # Documentación proceso MVP Creator
├── Contratos_Nuevos/                # PDFs referencia contratos
├── images/                          # Assets gráficos
├── recibos_generados/               # Recibos de prueba
├── recibos_mock/                    # Mocks recibos
├── package.json                     # Workspace root (scripts concurrently)
└── .gitignore
```

---

## 4. MÓDULOS FUNCIONALES DETALLADOS

### 4.1 MÓDULO RRHH (Portal Administrador) - `/hr`

#### 4.1.1 Autenticación (`HRLogin.jsx`)
- Login simulado (usuario/contraseña) con persistencia 30 min + renovación por actividad
- Roles: `rrhh` (admin) / `empleado` (acceso cruzado)
- Sesión en `localStorage` con expiración (`hrSession`)

#### 4.1.2 Dashboard KPIs (`DashboardTab.jsx`)
- **Métricas:** Total recibos, Firmados, Pendientes, % Avance
- **Gráficos:** Estado por mes, Top empleados pendientes
- **Acciones rápidas:** Envío masivo recordatorios, descarga ZIP firmados

#### 4.1.3 Recibos de Sueldo (`PayslipsTab.jsx`) - **FLUJO CRÍTICO**
**Carga Individual:**
- Upload PDF (original/duplicado) + selección mes
- Auto-detección CUIL + clasificación tipo (original/duplicado)
- Deduplicación global por hash SHA-256
- Matcheo automático con empleado por CUIL
- Consolidación: un registro = original + duplicado

**Carga Masiva (Excel):**
- PowerShell `excel_to_pdf.ps1` → convierte cada hoja a PDF (preserva formato)
- **SSE (Server-Sent Events)** para progreso en tiempo real
- Split geométrico: página A4 → Mitad Superior (Duplicado/Firma Empleado) + Mitad Inferior (Original/Firma Empleador)
- Validación estricta: **CUIL obligatorio** en cada hoja
- Prevención sobrescritura: omite si ya existe recibo completo para empleado/mes

#### 4.1.4 Nómina de Empleados (`EmployeesTab.jsx`)
- CRUD completo: Crear, Editar, Archivar/Restaurar (soft delete)
- Importación masiva JSON
- Campos: Nombre, Email, CUIL, Rol, Puesto, Fecha Ingreso, Password opcional
- Validación CUIL (Módulo 11 Argentina)

#### 4.1.5 Configuración (`ConfigTab.jsx`)
- **Empresa:** Nombre, Branding
- **SMTP:** Host, Puerto, Usuario, Pass, From
- **Google OAuth2:** Client ID, Dominio permitido (@empresa.com)
- **Umbrales Riesgo:** Segundos lectura, Descargas múltiples
- **Detección duplicados:** On/Off
- **Recordatorios:** Días inicial, Días recurrente

#### 4.1.6 Deudores (`DebtorsTab.jsx`)
- Lista recibos `status !== 'Firmado'`
- Filtros: Mes, Empleado, Estado
- Acciones: Reenviar invitación individual/bulk, Descargar original

#### 4.1.7 Riesgo (`RiskTab.jsx`)
- Detección anomalías: Lectura rápida (< umbral seg), Múltiples descargas
- Scoring por empleado/mes
- Exportación reporte

---

### 4.2 MÓDULO EMPLEADO (Portal Usuario Final) - `/employee`

#### 4.2.1 Autenticación (`EmployeeLogin.jsx`)
- **Opción A:** CUIL/Email + Password (default: CUIL sin guiones)
- **Opción B:** Google OAuth2 (dominio corporativo validado)
- **Opción C:** Magic Link por token (email)
- Cambio de contraseña obligatorio opcional
- Sesión 30 min + Web Push registration

#### 4.2.2 Dashboard Empleado (`EmployeeDashboard.jsx`)
- Historial recibos por mes (tabs)
- Estados: Pendiente, Firmado, Descargado
- Acciones: Ver Original, Ver Duplicado, Firmar, Descargar
- **Analytics Financiero:** Promedio Bruto/Neto, Tabla histórica, Gráfico evolución

#### 4.2.3 Portal de Firma (`EmployeePortal.jsx`) - **FLUJO CRÍTICO**
**Acceso:** Token URL (`/#firmar?token=XYZ`) o desde Dashboard

**Visualización PDF:**
- React-PDF viewer (Original / Duplicado tabs)
- Renderizado lazy, sin text layer (performance)

**Firma Electrónica:**
1. **Canvas HTML5** - Dibujo manual (mouse/touch)
2. **Subida imagen** - Foto firma (input file → canvas)
3. **Arrastre y redimensionamiento** interactivo sobre el PDF
4. **Posicionamiento por defecto:** Esquina inferior izquierda (línea "Firma Empleado")
5. **Consentimiento legal obligatorio** (checkbox Declaración Jurada)

**Proceso de Firma:**
- Captura Base64 canvas → POST `/api/sign/:token` o `/api/sign-by-id/:id`
- Backend: `pdfService.signPDF()` estampa:
  - Imagen firma (PNG embebido)
  - Recuadro semi-transparente con bordes
  - Metadatos auditoría: **Nombre, CUIL, IP, Timestamp (UTC-3 AR), User Agent, Geolocalización estimada**
- Actualiza BD: `status=Firmado`, `signedPath`, `signedAt`, `ip`, `userAgent`
- Email confirmación con **ambos PDFs adjuntos** (Original + Duplicado Firmado)
- Push Notification opcional

---

### 4.3 MÓDULO COMERCIAL B2B - `/commercial`

#### 4.3.1 Autenticación (`CommercialLogin.jsx`)
- Login Email/Password (roles: `admin`, `comercial`)
- Sesión separada (`commercialSession`)

#### 4.3.2 Dashboard Comercial (`CommercialDashboard.jsx`)
**KPIs Comerciales:**
- Total Clientes, Total Contratos, Activos, Pendientes
- **Conversion Rate %**
- **Pipeline Total** (suma montos)
- **Pareto Top 5 Clientes** por monto

**Gestión de Contratos (`/api/contracts`):**
- Subida PDF + Extracción metadatos IA (Groq/OpenAI)
- **Campos IA:** Empresa cliente, Duración (meses), Vencimiento explícito, Monto total
- **Fuzzy Matching** (string-similarity) auto-vincula/crea cliente
- Deduplicación por hash MD5
- Estados: `Pendiente` → `Firmado`
- Edición metadata (empresa, monto, duración)
- Reasignación cliente
- Envío individual/bulk invitaciones firma

**Gestión de Clientes (`/api/clients`):**
- CRUD: Empresa, Contacto, Email
- Validación: No eliminar si tiene contratos

**Configuración Comercial (`/api/commercial/settings`):**
- Proveedor IA: Groq / OpenAI
- API Keys
- Umbral Fuzzy Match (default 80%)

**Usuarios Comerciales (`/api/commercial-users`):**
- ABM usuarios rol `comercial`

#### 4.3.3 Portal Cliente Externo (`ClientPortal.jsx`)
- Acceso por token único (`/#b2b-portal?token=XYZ`)
- Visualizador PDF (react-pdf)
- **Firma digital arrastrable/redimensionable** (igual que empleado)
- Checkbox: "Estampar en todas las páginas"
- Consentimiento legal obligatorio
- Descarga copia firmada
- Auditoría: IP, Timestamp, Certificado único

---

## 5. FLUJOS TÉCNICOS CRÍTICOS

### 5.1 Flujo Carga Masiva Excel → Split → Persistencia

```
1. POST /api/payslips/upload-excel (multipart: file + month + jobId)
2. Multer → temp/
3. PowerShell excel_to_pdf.ps1 (COM Excel.Application)
   ├─ Abre .xls/.xlsx
   ├─ Itera worksheets (excluye: Modelo, SICOSS, Resumen, CUSS, numéricos)
   ├─ ExportAsFixedFormat(0=xlTypePDF) → temp/excel_export/{sheetName}.pdf
   └─ Retorna JSON [{sheetName, pdfPath}, ...]
4. SSE /api/payslips/upload-progress/:jobId (polling 500ms)
5. Para cada PDF generado:
   a. pdfService.analyzeFile() → extrae texto (pdf-parse) + CUIL (regex + validación Módulo 11)
   b. Si NO CUIL válido → error silencioso, continua siguiente
   c. Hash SHA-256 → deduplicación global
   d. Busca empleado por CUIL en DB
   e. Verifica no existe recibo empleado/mes (prevención sobrescritura)
   f. **Split Geométrico (pdf-lib):**
      - load PDF → get page 0 → width, height
      - halfHeight = height / 2
      - Original (mitad inferior): cropBox(0, 0, width, halfHeight)
      - Duplicado (mitad superior): cropBox(0, halfHeight, width, halfHeight)
      - Guarda en originals/ y duplicados/ con UUID names
   g. Crea registro Payslip con ambos paths + hashes + financialData + token UUID
   h. status = "Cargado"
6. Limpieza: borra temp Excel + temp PDFs hoja completa
7. Retorna summary {total, success, failed, skipped, errors[]}
```

### 5.2 Flujo Firma Electrónica (Empleado / Cliente B2B)

```
1. Usuario accede por token → GET /api/sign/token/:token (valida token, retorna metadata)
2. Frontend renderiza PDF (react-pdf) → onLoadSuccess captura width/height
3. Usuario dibuja firma (canvas) O sube imagen → Base64 PNG
4. Usuario posiciona/redimensiona recuadro sobre PDF (coordenadas UI)
5. Checkbox consentimiento obligatorio
6. POST /api/sign/:token { signatureImage, consent, position{}, analytics{} }
7. Backend:
   a. Valida token + payslip + empleado
   b. pdfService.signPDF(inputPath, outputPath, signatureBase64, metadata)
      - embedPng(signatureBuffer)
      - Calcula posición PDF desde coordenadas UI (escala + eje Y invertido)
      - Dibuja rectángulo fondo + imagen firma + textos auditoría
      - Guarda signed_<uuid>.pdf en /uploads/signed/
   c. Actualiza payslip: status=Firmado, signedPath, signedAt, ip, userAgent
   d. emailService.sendSignedConfirmation(emp, month, originalPath, signedPath)
      - Adjunta Original + Duplicado Firmado
   e. (Opcional) Web Push notification
8. Frontend muestra success screen + botones descarga
```

### 5.3 Extracción Metadatos IA (Contratos B2B)

```
1. POST /api/contracts/upload (PDF)
2. pdfParse extrae texto (primeros 15000 chars)
3. Prompt estructurado → Groq (llama-3.1-8b-instant) o OpenAI (gpt-4o-mini)
   - Reglas estrictas: NO inventar, solo extraer explícito
   - Identificar CLIENTE (no proveedor)
   - Duración en meses (convertir años)
   - Vencimiento explícito DD-MM-YYYY o null
   - Monto total (calcular si pagos periódicos)
   - JSON obligatorio válido
4. Fallback: Mock simulator heurístico (regex montos, patrones empresa, fechas)
5. Retorna: { empresa, duracionMeses, fechaVencimientoExplicita, monto }
6. Fuzzy Matching (string-similarity) vs clients[] → auto-link o create
7. Guarda contrato con metadata IA inyectada
```

---

## 6. MODELO DE DATOS (db.json)

### 6.1 Employee
```json
{
  "id": "uuid",
  "name": "Juan Pérez",
  "email": "juan@empresa.com",
  "cuil": "20-12345678-9",
  "role": "empleado|rrhh|comercial|admin",
  "password": "hash|cuil_sin_guiones",  // opcional
  "puesto": "Desarrollador",
  "fechaIngreso": "2023-01-15",
  "archived": false,
  "pushSubscriptions": [{ endpoint, keys: {p256dh, auth} }]
}
```

### 6.2 Payslip (Recibo de Sueldo)
```json
{
  "id": "uuid",
  "employeeId": "uuid",
  "detectedCuil": "20-12345678-9",
  "month": "2026-05",
  "originalPath": "C:\\...\\originals\\uuid_original.pdf",
  "originalFilename": "Recibo original.pdf",
  "duplicadoPath": "C:\\...\\duplicados\\uuid_duplicado.pdf",
  "duplicadoFilename": "Recibo duplicado.pdf",
  "signedPath": "C:\\...\\signed\\uuid_signed.pdf",
  "status": "Cargado|Enviado|Firmado|Programado",
  "token": "uuid-magic-link",
  "sentAt": "2026-05-15T10:30:00.000Z",
  "signedAt": "2026-05-16T14:22:00.000Z",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "financialData": {
    "netPay": 150000.00,
    "grossPay": 180000.00,
    "retirement": 19800.00,
    "healthInsurance": 5400.00,
    "basicSalary": 120000.00
  },
  "originalHash": "sha256...",
  "duplicadoHash": "sha256...",
  "uploadedAt": "2026-05-15T10:00:00.000Z",
  "scheduledAt": null,
  "reminderSentAt": null,
  "reminderCount": 0,
  "analytics": { "readTime": 45, "downloads": 1 }
}
```

### 6.3 Client (B2B)
```json
{
  "id": "uuid",
  "name": "Carlos López",
  "email": "carlos@cliente.com",
  "empresa": "Acme Corp",
  "role": "cliente"
}
```

### 6.4 Contract (B2B)
```json
{
  "id": "uuid",
  "title": "Contrato Servicios Acme Corp",
  "clientId": "uuid",
  "status": "Pendiente|Firmado",
  "originalPath": "C:\\...\\contracts\\uuid.pdf",
  "signedPath": "C:\\...\\signed\\contracts\\signed_uuid.pdf",
  "fileHash": "md5...",
  "token": "uuid-magic-link",
  "uploadedAt": "2026-05-15T10:00:00.000Z",
  "metadata": {
    "empresa": "Acme Corp",
    "duracionMeses": 12,
    "fechaVencimientoExplicita": "31-12-2026",
    "monto": 3500000,
    "fechaFirmaDocumento": "2026-05-16T14:22:00.000Z",
    "vencimiento": "2027-05-16T14:22:00.000Z"
  }
}
```

### 6.5 Settings
```json
{
  "companyName": "e-ABC Learning",
  "smtpHost": "smtp.mailtrap.io",
  "smtpPort": "2525",
  "smtpUser": "...",
  "smtpPass": "...",
  "smtpFrom": "no-reply@miempresa.com",
  "googleClientId": "...",
  "googleAllowedDomain": "e-abc.com",
  "riskThresholdSeconds": 120,
  "riskThresholdDownloads": 2,
  "duplicateDetectionEnabled": true,
  "initialReminderDays": 3,
  "recurringReminderDays": 2,
  "fuzzyMatchThreshold": 80,
  "aiProvider": "groq",
  "groqApiKey": "gsk_...",
  "openaiApiKey": "",
  "vapidPublicKey": "...",
  "vapidPrivateKey": "..."
}
```

---

## 7. API ENDPOINTS REFERENCIA

### 7.1 Empleados (`/api/employees`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Listar todos |
| POST | `/` | Crear/Actualizar (upsert por id/cuil) |
| POST | `/import` | Importación masiva JSON |
| DELETE | `/:id` | Eliminar (hard + archivos) |
| PATCH | `/:id/archive` | Archivar/Desarchivar |

### 7.2 Configuración (`/api/settings`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Obtener config activa (merge env + db) |
| POST | `/` | Guardar config (actualiza env en memoria) |
| POST | `/run-reminders` | Ejecutar recordatorios manual |
| GET | `/google-config` | Config pública Google OAuth |
| GET | `/vapid-public-key` | Clave VAPID para Push |
| POST | `/employee/push-subscription` | Registrar suscripción Push |
| POST | `/employee/google-login` | Login Google OAuth2 |
| POST | `/employee/login` | Login CUIL/Email + Password |
| GET | `/employee/payslips/:employeeId` | Recibos del empleado |
| POST | `/employee/change-password` | Cambio password |

### 7.3 Recibos RRHH (`/api/payslips`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Listar todos (enriquecido con employee) |
| POST | `/upload` | Carga individual PDF (multer) |
| GET | `/upload-progress/:jobId` | SSE progreso carga masiva |
| POST | `/upload-excel` | Carga masiva Excel + split |
| POST | `/match` | Asociación manual payslip-empleado |
| POST | `/send/:id` | Enviar invitación firma individual |
| POST | `/send-bulk` | Envío masivo invitaciones |
| DELETE | `/:id` | Eliminar recibo + archivos |
| POST | `/delete-bulk` | Eliminación masiva |
| POST | `/schedule` | Programar/Cancelar envío |

### 7.4 Portal Firma Empleado (`/api/sign`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/token/:token` | Validar token + metadata |
| GET | `/view/:token/:type` | Stream PDF (original/duplicado/firmado) |
| POST | `/:token` | Firmar duplicado (token) |
| POST | `/sign-by-id/:id` | Firmar duplicado (ID + sesión empleado) |

### 7.5 Descargas RRHH (`/api/download`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/:type/:id` | Descarga individual (original/duplicado/signed) |
| GET | `/download-zip/:month` | ZIP todos firmados del mes |

### 7.6 Comercial B2B (`/api/commercial`, `/api/clients`, `/api/contracts`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/commercial/settings` | Config IA + Fuzzy |
| POST | `/commercial/settings` | Guardar config comercial |
| GET/POST/PUT/DELETE | `/commercial-users` | ABM usuarios comerciales |
| GET/POST/DELETE | `/clients` | ABM clientes |
| GET/POST | `/contracts` | Listar / Subir contrato + IA |
| PUT | `/contracts/:id/metadata` | Editar metadata |
| GET | `/contracts/verify/:token` | Validar token portal cliente |
| GET | `/contracts/pdf/:id` | Stream PDF contrato |
| POST | `/contracts/sign` | Firmar contrato (portal cliente) |
| POST | `/contracts/:id/reassign` | Reasignar cliente |
| POST | `/contracts/:id/send` | Enviar invitación individual |
| POST | `/contracts/send-bulk` | Envío masivo |
| DELETE | `/contracts/:id` | Eliminar contrato + archivos |
| POST | `/contracts/delete-bulk` | Eliminación masiva |
| GET | `/commercial/kpis` | KPIs dashboard comercial |

### 7.7 Portal Empleado (autenticado) (`/api/employee`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/payslips/:employeeId` | Recibos enriquecidos |
| POST | `/change-password` | Cambio contraseña |
| POST | `/sign-by-id/:id` | Firma desde dashboard |

---

## 8. SERVICIOS CORE (BACKEND)

### 8.1 `db.js` - Adaptador JSON File-Based
- `readDb()` / `writeDb()` - Lectura/escritura atómica con `initDb()` lazy
- CRUD genérico por entidad: employees, payslips, clients, contracts, settings
- Métodos especializados: `getEmployeeByCuil`, `getPayslipByToken`, `deletePayslipOnly` (sin borrar archivos), `deletePayslipsBulk`
- **Nota:** No transaccional, no concurrente (MVP single-instance)

### 8.2 `pdfService.js` - Núcleo Procesamiento PDF
- **`isValidCUIL(cuil)`** - Algoritmo Módulo 11 Argentina (prefijos 20,23,24,27,30,32,33,34)
- **`analyzeFile(filePath, filename)`** - Dispatcher PDF vs Imagen (OCR Tesseract)
- **`analyzePDF()`** - pdf-parse + regex CUIL + clasificación original/duplicado (filename + contenido) + `extractFinancialData()` + `extractEmployeeData()` (fecha ingreso, puesto)
- **`extractFinancialData(text)`** - Regex español (neto, bruto, jubilación 11%, obra social 3%, básico) + fallbacks lógicos
- **`extractEmployeeData(text)`** - Parsing tabular (headers/values) + fallback regex inline
- **`signPDF(input, output, signatureBase64, metadata)`** - pdf-lib: embedPng + drawImage + drawText (auditoría) + posicionamiento interactivo (coordenadas UI → PDF)
- **`signPdfWithData()`** - Variante B2B (sello verde, certificado ID, timestamp, IP, estampa multi-página opcional)

### 8.3 `emailService.js` - Notificaciones
- **Transporter:** Nodemailer (SMTP real) o **Null Transport** (logs HTML en `/mail-logs/`)
- **Templates HTML responsivos** con branding e-ABC Learning
- `sendSigningInvitation(emp, month, token)` - Link firma + botón CTA
- `sendSignedConfirmation(emp, month, originalPath, signedPath)` - **Adjunta ambos PDFs**
- `sendContractInvitation(contract, client, token)` - Portal B2B
- `sendReminderEmail(emp, month, token)` - Recordatorio configurable

### 8.4 `aiService.js` - IA Metadatos B2B
- Proveedores: **Groq** (llama-3.1-8b-instant) / **OpenAI** (gpt-4o-mini)
- Prompt legal senior (15000 chars contexto) → JSON estructurado
- Validación post-procesamiento (tipos, rangos)
- Fallback: `runMockSimulator()` heurístico (regex montos, patrones empresa, fechas)

### 8.5 `excel_to_pdf.ps1` - Renderizado Nativo Excel
- COM `Excel.Application` invisible
- Excluye hojas: Modelo, SICOSS, Resumen, CUSS, Hoja6, SAC_VAC, nombres personas
- `ExportAsFixedFormat(0=xlTypePDF)` - Preserva diseño impresión exacto
- Retorna JSON array `[{sheetName, pdfPath}]` por stdout

---

## 9. FRONTEND - DETALLES DE IMPLEMENTACIÓN

### 9.1 `App.jsx` - Orquestador Principal
- **Estado global:** `view` (hub, hr-login, hr, employee-login, employee, direct-sign, commercial, commercial-login, b2b-portal)
- **Sesiones:** `hrSession`, `employeeSession`, `commercialSession` (localStorage + expiración 30min + heartbeat actividad)
- **Tema:** Dark/Light (CSS variables + `data-theme` en documentElement)
- **Service Worker:** Registro `/sw.js` + VAPID Push subscription al login empleado
- **Token URL handling:** `?token=` + `#?token=` + `hashchange` listener

### 9.2 `index.css` - Sistema de Diseño
```css
:root[data-theme="dark"] {
  --bg-main: #0f172a;
  --bg-panel: #1e293b;
  --bg-card: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --primary: #1d8fd4;      /* e-ABC Blue */
  --success: #22c55e;
  --warning: #eab308;      /* B2B Gold */
  --danger: #ef4444;
  --border-color: #334155;
  --font-title: 'Segoe UI', system-ui;
}
:root[data-theme="light"] { /* inverso */ }
```
- **Componentes:** `.glass-panel`, `.btn/.btn-primary/.btn-secondary`, `.form-group/.form-control`, `.nav-link`, `.alert/.alert-error`, `.stat-card`, `.pdf-tab-btn`, `.signature-canvas`

### 9.3 `EmployeePortal.jsx` - Firma Interactiva
- **Canvas firma:** 400x200px, stroke #0f172a, lineWidth 3, lineCap round
- **Drag & Drop recuadro sobre PDF:** `pointerdown/move/up` + `setPointerCapture`
- **Resize handle:** Esquina inferior derecha (clip-path triangle), mantiene aspect ratio 1.6:1
- **Coordenadas UI → PDF:** `scaleX = pdfWidth / uiWidth`, `pdfY = height - uiY - boxHeight`
- **Posición default:** `x: 140, y: height - sigHeight - 30` (línea firma empleado)

### 9.4 `ClientPortal.jsx` - Firma B2B
- Similar a EmployeePortal pero:
  - Checkbox "Estampar en todas las páginas" (`stampAllPages`)
  - Posición default: `x: 100, y: 500`
  - Firma representada como rectángulo amarillo "Firma del Representante Legal"

---

## 10. SEGURIDAD Y AUDITORÍA

### 10.1 Autenticación y Autorización
- **Tokens UUID v4** (128-bit entropy) para magic links - no JWT (sin expiración nativa, controlada por BD)
- **Google OAuth2** - Validación `hd` (hosted domain) + email domain match
- **Password default:** CUIL sin guiones (fuerza cambio recomendado)
- **Roles:** `empleado`, `rrhh`, `comercial`, `admin`, `cliente` (B2B)
- **Sesiones:** localStorage + timestamp expiración + heartbeat (mousemove, keydown, click, scroll) cada 5s throttled

### 10.2 Firma Electrónica - Validez Legal
- **Cumplimiento Ley 25.506 (Argentina) / eIDAS principios:**
  - ✅ Identificación del firmante (CUIL + Email + Token único)
  - ✅ Intención de firma (Checkbox Declaración Jurada obligatorio)
  - ✅ Integridad del documento (PDF sellado inalterable post-firma)
  - ✅ Trazabilidad: **IP, Timestamp (UTC-3), User Agent, Geolocalización estimada**
  - ✅ Certificado de firma embebido en PDF (metadatos visibles)
- **Dual copy:** Original (empleador) + Duplicado Firmado (empleado + RRHH)

### 10.3 Deduplicación y Integridad
- **SHA-256** hash contenido archivo (payslips)
- **MD5** hash contenido archivo (contratos B2B)
- Verificación global antes de procesar (ahorra CPU/IO)
- Prevención sobrescritura accidental (configurable)

### 10.4 Notificaciones Push (Web Push API)
- **VAPID** keys auto-generadas al inicio (persistidas en settings)
- Subscription por empleado (endpoint + p256dh + auth)
- Payload: título, body, url de redirección
- Limpieza automática suscripciones inválidas (410/404)

---

## 11. CONFIGURACIÓN Y DESPLIEGUE

### 11.1 Variables de Entorno (`.env`)
```env
PORT=5000
BASE_URL=http://localhost:5000
COMPANY_NAME=e-ABC Learning
GROQ_API_KEY=gsk_...

# SMTP (opcional - si no configurado usa simulación local)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM=no-reply@miempresa.com

# Google OAuth2 (opcional)
GOOGLE_CLIENT_ID=...
GOOGLE_ALLOWED_DOMAIN=e-abc.com
```

### 11.2 Scripts Disponibles
```json
// Root package.json
"install-all": "npm run install:server && npm run install:client"
"dev": "concurrently \"npm run dev:server\" \"npm run dev:client\""
"dev:server": "cd server && npm run dev"      // nodemon
"dev:client": "cd client && npm run dev"      // vite
"build:client": "cd client && npm run build"  // vite build → client/dist
"start": "cd server && npm start"             // node index.js (sirve dist si existe)
```

### 11.3 Requisitos del Sistema
- **Node.js** ≥ 18
- **Windows** (requerido para `excel_to_pdf.ps1` + COM Excel)
- **Microsoft Excel** instalado en servidor (para conversión masiva)
- **PowerShell** ExecutionPolicy Bypass (para script conversión)
- **Tesseract.js** traineddata (`spa.traineddata` 3.3MB en server/)

### 11.4 Puertos
- **5000** - Backend API + Frontend estático (producción)
- **5173** - Vite Dev Server (desarrollo)

---

## 12. TAREAS PROGRAMADAS (CRON JOBS)

### 12.1 Recordatorios Firma (Diario - 24h)
```javascript
setInterval(async () => { await executeReminders(); }, 24*60*60*1000);
```
- Config: `initialReminderDays` (default 3), `recurringReminderDays` (default 2)
- Solo `status !== 'Firmado'`
- Log: `[REMINDERS] Ejecución finalizada. Se enviaron X correos.`

### 12.2 Scheduler Envíos Programados (Cada 15 seg)
```javascript
setInterval(async () => { ... }, 15000);
```
- Busca `payslips` con `status === 'Programado'` y `scheduledAt <= now`
- Ejecuta envío email + push + actualiza `status='Enviado'`, `sentAt=now`

### 12.3 VAPID Keys Auto-Generación
- Al inicio si no existen en settings → `webpush.generateVAPIDKeys()` → guarda en BD

---

## 13. PUNTOS CRÍTICOS Y GOTCHAS (MANTENIBILIDAD)

| Área | Problema | Solución Implementada |
|------|----------|----------------------|
| **Windows File Locks (EBUSY)** | `pdf-lib` / PowerShell bloquean archivos | `fs.copyFileSync(src, dest)` + `fs.unlinkSync(src)` en try-catch |
| **Encoding filenames (multer)** | Tildes/ñ corruptas en `originalname` | `Buffer.from(name, 'latin1').toString('utf8')` |
| **PowerShell ExecutionPolicy** | Script bloqueado por OS | `-ExecutionPolicy Bypass` en spawn |
| **PDF Coordinates** | UI (top-left) vs PDF (bottom-left) | `pdfY = height - uiY - boxHeight` |
| **SSE Connection Leaks** | Conexiones no cerradas | `req.on('close', () => clearInterval)` |
| **Concurrent DB Writes** | JSON file corruption risk | Single-instance MVP; `readDb()`/`writeDb()` síncronos |
| **OCR Performance** | Tesseract.js lento en CPU | Solo para imágenes; PDFs usan pdf-parse (rápido) |
| **IA Hallucination** | LLM inventa datos | Prompt estricto "NO inventes" + validación post + mock fallback |
| **CUIL Validation** | Formatos variables (guiones, puntos, 10/11 dígitos) | Normalización + Módulo 11 + prefixes válidos |
| **Excel Sheet Names** | Hojas sistema/contabilidad contaminan | `excludedNames` array + regex `^\d+$` |

---

## 14. ROADMAP Y DEUDA TÉCNICA IDENTIFICADA

### 14.1 Deuda Técnica Actual
1. **Base de datos JSON** - No transaccional, no concurrente, I/O bloqueante. **Migrar a SQLite/PostgreSQL.**
2. **Autenticación** - Tokens sin expiración nativa, sin refresh, sin JWT. **Implementar JWT + Refresh Tokens.**
3. **Archivos locales** - No escalable, sin backup, sin CDN. **Implementar Storage Interface (S3/Drive/Azure Blob).**
4. **Testing** - Ausencia total de tests unitarios/integración/e2e. **Implementar Vitest + Playwright.**
5. **TypeScript** - Código JS plano. **Migración gradual a TS.**
6. **Error Handling** - Try/catch genéricos, logs console. **Centralizar error handling + logging estructurado (Pino/Winston).**
7. **Rate Limiting** - Ausente en APIs públicas. **Agregar express-rate-limit.**
8. **Validación Input** - Parcial (Zod en algunos lados). **Esquemas Zod completos en todos los endpoints.**

### 14.2 Próximas Funcionalidades (Post-MVP)
| Prioridad | Funcionalidad | Esfuerzo | Dependencias |
|-----------|---------------|----------|--------------|
| **Alta** | Migración BD SQLite + Prisma | M | Refactor db.js |
| **Alta** | JWT Auth + Refresh Tokens | M | Auth middleware |
| **Alta** | Tests automatizados (CI/CD) | M | Vitest, Playwright |
| **Media** | Storage Abstraction (S3/Drive) | M | Interface + Adapters |
| **Media** | Dashboard Gerencial B2B | L | Recharts/Chart.js |
| **Media** | Conector Google Drive (plantillas) | M | Google Drive API |
| **Media** | Integración IA Generativa nativa | L | Refactor aiService |
| **Baja** | Multi-tenant / White-label | XL | Arquitectura multi-org |
| **Baja** | App Mobile (React Native / PWA) | XL | Capacitor / PWA |

---

## 15. COMANDOS ÚTILES DESARROLLO

```bash
# Instalación completa
cd DocuMation
npm run install-all

# Desarrollo (terminal 1)
npm run dev

# Solo backend
cd server && npm run dev

# Solo frontend
cd client && npm run dev

# Build producción
npm run build:client

# Producción
npm start

# Ver logs emails (modo test)
ls server/mail-logs/

# Ver base de datos actual
cat server/db.json | jq .

# Limpiar uploads temporales
rm -rf server/uploads/temp/*

# Regenerar VAPID keys (borrar de db.json y reiniciar server)
```

---

## 16. ANEXOS

### 16.1 Archivos de Documentación MVP Creator (en `/Documentacion_MVP/`)
| Archivo | Contenido |
|---------|-----------|
| `0_BITACORA_MAESTRA.md` | Tracking fases (Descubrimiento ✅, Diseño ✅, Validación ✅, Planificación ⏳) |
| `1_Definicion_Producto.md` | Problema, Personas, Stakeholders, Métricas éxito |
| `2_Benchmarking_Metricas.md` | As-Is, Benchmarking (DocuSign, Adobe Sign), KPIs |
| `3_Diseno_Conceptual.md` | Modelo plantillas, Integración IA, Storage Abstracto |
| `4_Alcance_MVP.md` | Must/Should/Nice to Have (v1.0/v2.0/v3.0+) |
| `5_Flujos_Usuario.md` | Flujo A (Setup plantillas), Flujo B (Operativa diaria) |
| `6_Documento_Funcional_v1.0.md` | **Alcance congelado aprobado** - RRHH + Empleado + Stack + Criterios aceptación |
| `7_Documentacion_Tecnica_Mockup.md` | Hand-off dev: Stack, Estructura, Flujos críticos, Instrucciones ejecución |
| `8_Evaluacion_Factibilidad.md` | Viabilidad técnica/económica |
| `10_Documentacion_Tecnica_Backend_Recibos.md` | **Detalle técnico backend:** Flujos upload, split, matcheo, db schema, gotchas |
| `MVP_Creator_Guia_Uso.md` | Guía uso agente MVP Creator |
| `build_docs.js` | Script generación HTML consolidado |

### 16.2 Contratos de Referencia (en `/Contratos_Nuevos/`)
- Carta Oferta LinkedIn - CLARO - e-ABC Learning
- Contrato Centro Médico Amenábar + Sync Technologies
- Contrato Licencias LinkedIn - Las Camelias
- Contrato LinkedIn - Grupo San Cristóbal

---

## 17. CONTACTOS Y RESPONSABLES

| Rol | Nombre | Email |
|-----|--------|-------|
| **Product Owner / Sponsor** | Germán Torres Nieto | gtorresnieto@e-abclearning.com |
| **Tech Lead / Desarrollador** | [Equipo Interno] | - |
| **Stakeholders** | CEO, CCO/CMO, Gerente Comercial | - |

---

*Documentación generada automáticamente mediante análisis de código y archivos .md del proyecto DocuMation. Última actualización: Agosto 2026.*