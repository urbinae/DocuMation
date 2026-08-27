const { z } = require('zod');

// Regex de CUIL argentino (20-12345678-9 o 11 dígitos sin guiones)
const cuilRegex = /^(\d{2}-\d{8}-\d{1}|\d{11})$/;

// Regex de mes en formato YYYY-MM
const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

// -----------------------------------------------------------------------------
// 1. Esquema de Empleado (employees)
// -----------------------------------------------------------------------------
const employeeSchema = z.object({
  id: z.preprocess((val) => (val === null || val === '' ? undefined : val), z.string().uuid().optional().nullable()),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  cuil: z.string().regex(cuilRegex, 'Formato de CUIL inválido (ej: 20-12345678-9 o 20123456789)'),
  password: z.string().optional().nullable(),
  role: z.enum(['empleado', 'rrhh', 'comercial', 'admin']).default('empleado'),
  puesto: z.string().optional().nullable(),
  fecha_ingreso: z.string().optional().nullable(),
  fechaIngreso: z.string().optional().nullable(),
  archived: z.boolean().default(false),
  push_subscriptions: z.array(z.any()).default([]),
  created_at: z.string().optional()
});

// Esquema para importación masiva de empleados
const employeeImportSchema = z.object({
  employees: z.array(z.object({
    name: z.string().min(2, 'Nombre es obligatorio'),
    email: z.string().email('Email inválido'),
    cuil: z.string().regex(cuilRegex, 'CUIL inválido'),
    puesto: z.string().optional().nullable(),
    fecha_ingreso: z.string().optional().nullable(),
    fechaIngreso: z.string().optional().nullable()
  })).min(1, 'La lista de empleados no puede estar vacía')
});

// -----------------------------------------------------------------------------
// 2. Esquemas de Autenticación (auth)
// -----------------------------------------------------------------------------
const authLoginSchema = z.object({
  cuil: z.string().min(1, 'El CUIL es obligatorio'),
  password: z.string().min(1, 'La contraseña es obligatoria')
});

const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'El idToken de Google es obligatorio')
});

const pushSubscriptionSchema = z.object({
  employeeId: z.string().uuid('ID de empleado inválido'),
  subscription: z.object({
    endpoint: z.string().url('Endpoint inválido'),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string()
    }).optional()
  })
});

// -----------------------------------------------------------------------------
// 3. Esquema de Recibo de Sueldo (payslips)
// -----------------------------------------------------------------------------
const payslipSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  employee_id: z.string().uuid().optional().nullable(),
  detected_cuil: z.string().regex(cuilRegex, 'Formato de CUIL detectado inválido'),
  month: z.string().regex(monthRegex, 'Formato de mes inválido, debe ser YYYY-MM'),
  original_storage_path: z.string().min(1, 'El path original es obligatorio'),
  duplicado_storage_path: z.string().min(1, 'El path duplicado es obligatorio'),
  signed_storage_path: z.string().optional().nullable(),
  status: z.enum(['Cargado', 'Enviado', 'Firmado', 'Programado']).default('Cargado'),
  token: z.string().uuid().optional(),
  sent_at: z.string().optional().nullable(),
  signed_at: z.string().optional().nullable(),
  ip_address: z.string().optional().nullable(),
  user_agent: z.string().optional().nullable(),
  financial_data: z.record(z.any()).optional().nullable(),
  original_hash: z.string().length(64, 'Hash SHA-256 debe tener 64 caracteres').optional().nullable(),
  duplicado_hash: z.string().length(64, 'Hash SHA-256 debe tener 64 caracteres').optional().nullable(),
  analytics: z.object({
    readTime: z.number().default(0),
    downloads: z.number().default(0)
  }).default({ readTime: 0, downloads: 0 }),
  created_at: z.string().optional()
});

// -----------------------------------------------------------------------------
// 4. Esquema de Cliente B2B (clients)
// -----------------------------------------------------------------------------
const clientSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, 'El nombre del cliente es obligatorio'),
  email: z.string().email('Email del cliente inválido'),
  empresa: z.string().min(2, 'El nombre de la empresa es obligatorio'),
  role: z.string().default('cliente'),
  created_at: z.string().optional()
});

// -----------------------------------------------------------------------------
// 5. Esquema de Contrato Comercial B2B (contracts)
// -----------------------------------------------------------------------------
const contractSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(3, 'El título del contrato es obligatorio'),
  client_id: z.string().uuid().optional().nullable(),
  status: z.enum(['Pendiente', 'Firmado']).default('Pendiente'),
  original_storage_path: z.string().min(1, 'El path del contrato original es obligatorio'),
  signed_storage_path: z.string().optional().nullable(),
  file_hash: z.string().optional().nullable(),
  token: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional().nullable(),
  created_at: z.string().optional()
});

// -----------------------------------------------------------------------------
// 6. Esquema de Configuración (settings)
// -----------------------------------------------------------------------------
const settingsSchema = z.object({
  key: z.string().min(1, 'La clave de configuración es obligatoria').optional(),
  value: z.any().optional()
}).passthrough();

// Helper middleware de validación Express
const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Error de validación de datos',
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
    }
    return res.status(500).json({ error: 'Error interno en validación' });
  }
};

module.exports = {
  employeeSchema,
  employeeImportSchema,
  authLoginSchema,
  googleLoginSchema,
  pushSubscriptionSchema,
  payslipSchema,
  clientSchema,
  contractSchema,
  settingsSchema,
  validate
};
