const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { validate, authLoginSchema, googleLoginSchema, pushSubscriptionSchema } = require('../lib/zodSchemas');

// Helper para formatear empleado hacia el cliente React
function formatEmployee(emp) {
  if (!emp) return null;
  return {
    ...emp,
    fechaIngreso: emp.fecha_ingreso || emp.fechaIngreso || null
  };
}

// Helper para decodificar un JWT de Google sin librerías externas pesadas
function decodeJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  } catch (err) {
    return null;
  }
}

// -----------------------------------------------------------------------------
// POST /api/auth/login o /api/employee/login - Login por CUIL / Password
// -----------------------------------------------------------------------------
const handleLogin = async (req, res) => {
  try {
    const { cuil, password } = req.body;
    if (!cuil || !password) {
      return res.status(400).json({ error: 'CUIL y contraseña son obligatorios' });
    }

    const cleanInputCuil = cuil.replace(/\D/g, '');

    // Buscar empleado por CUIL tal como está o sanitizado
    const { data: employees, error } = await supabase
      .from('employees')
      .select('*')
      .eq('archived', false);

    if (error) throw error;

    const employee = (employees || []).find(e => {
      const dbCleanCuil = (e.cuil || '').replace(/\D/g, '');
      return dbCleanCuil === cleanInputCuil || e.cuil === cuil;
    });

    if (!employee) {
      return res.status(401).json({ error: 'CUIL o contraseña incorrectos' });
    }

    // Validación de contraseña:
    // 1. Si existe contraseña guardada en el registro del empleado
    // 2. Fallback: la contraseña por defecto es el CUIL sin guiones
    const expectedPassword = employee.password || cleanInputCuil;

    if (password !== expectedPassword && password !== cleanInputCuil) {
      return res.status(401).json({ error: 'CUIL o contraseña incorrectos' });
    }

    res.json({
      success: true,
      message: 'Autenticación exitosa',
      employee: formatEmployee(employee)
    });
  } catch (err) {
    console.error('Error en login de empleado:', err);
    res.status(500).json({ error: 'Error interno en autenticación', details: err.message });
  }
};

router.post('/login', validate(authLoginSchema), handleLogin);

// -----------------------------------------------------------------------------
// POST /api/auth/google-login o /api/employee/google-login
// -----------------------------------------------------------------------------
const handleGoogleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    const decoded = decodeJwtPayload(idToken);

    if (!decoded || !decoded.email) {
      return res.status(400).json({ error: 'Token de Google inválido o sin email' });
    }

    const googleEmail = decoded.email.toLowerCase();

    // 1. Validar el GOOGLE_CLIENT_ID si está configurado en process.env
    const configuredClientId = process.env.GOOGLE_CLIENT_ID;
    if (configuredClientId && configuredClientId !== '...' && configuredClientId.trim() !== '') {
      if (decoded.aud !== configuredClientId && decoded.azp !== configuredClientId) {
        return res.status(401).json({
          error: 'Autenticación rechazada: El token de Google no corresponde al GOOGLE_CLIENT_ID configurado.'
        });
      }
    }

    // 2. Restringir el acceso únicamente a los correos cuyo dominio coincida con GOOGLE_ALLOWED_DOMAIN
    const allowedDomain = (process.env.GOOGLE_ALLOWED_DOMAIN || 'e-abc.com').toLowerCase().trim();
    const emailDomain = googleEmail.split('@')[1]?.toLowerCase();

    if (emailDomain !== allowedDomain) {
      return res.status(403).json({
        error: `Acceso denegado: El correo '${googleEmail}' pertenece al dominio '${emailDomain}'. Únicamente se permite el ingreso a cuentas del dominio '${allowedDomain}'.`
      });
    }

    // 3. Buscar empleado por email corporativo en Supabase
    const { data: employee, error } = await supabase
      .from('employees')
      .select('*')
      .eq('email', googleEmail)
      .eq('archived', false)
      .maybeSingle();

    if (error) throw error;

    if (!employee) {
      return res.status(404).json({
        error: `No se encontró una cuenta de empleado activa vinculada al email ${googleEmail}. Contacte a RRHH.`
      });
    }

    res.json({
      success: true,
      message: 'Autenticación con Google exitosa',
      employee: formatEmployee(employee)
    });
  } catch (err) {
    console.error('Error en Google Login:', err);
    res.status(500).json({ error: 'Error al procesar login de Google', details: err.message });
  }
};

router.post('/google-login', validate(googleLoginSchema), handleGoogleLogin);

// -----------------------------------------------------------------------------
// GET /api/auth/google-config - Obtener configuración pública de Google Client ID
// -----------------------------------------------------------------------------
router.get('/google-config', async (req, res) => {
  try {
    let googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    let googleAllowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN || 'e-abc.com';

    // Fallback a tabla settings si process.env está vacío
    if (!googleClientId || googleClientId === '...') {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('*')
        .in('key', ['googleClientId', 'googleAllowedDomain']);

      if (settingsData) {
        settingsData.forEach(row => {
          if (row.key === 'googleClientId' && row.value) googleClientId = row.value;
          if (row.key === 'googleAllowedDomain' && row.value) googleAllowedDomain = row.value;
        });
      }
    }

    res.json({
      googleClientId,
      googleAllowedDomain
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuración de Google', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// GET /api/auth/vapid-public-key - Obtener clave pública Web Push
// -----------------------------------------------------------------------------
router.get('/vapid-public-key', async (req, res) => {
  try {
    const { data: settingRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'vapidPublicKey')
      .maybeSingle();

    const publicKey = (settingRow && settingRow.value) || process.env.VAPID_PUBLIC_KEY || '';

    res.json({ publicKey });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clave VAPID', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/auth/push-subscription - Registrar suscripción Web Push
// -----------------------------------------------------------------------------
const handlePushSubscription = async (req, res) => {
  try {
    const { employeeId, subscription } = req.body;

    const { data: employee, error: fetchErr } = await supabase
      .from('employees')
      .select('id, push_subscriptions')
      .eq('id', employeeId)
      .single();

    if (fetchErr || !employee) {
      return res.status(404).json({ error: 'Empleado no encontrado para suscripción Push' });
    }

    const currentSubs = Array.isArray(employee.push_subscriptions) ? employee.push_subscriptions : [];
    
    // Evitar duplicados por endpoint
    const exists = currentSubs.some(s => s.endpoint === subscription.endpoint);
    let updatedSubs = currentSubs;
    if (!exists) {
      updatedSubs = [...currentSubs, subscription];
    }

    const { error: updateErr } = await supabase
      .from('employees')
      .update({ push_subscriptions: updatedSubs })
      .eq('id', employeeId);

    if (updateErr) throw updateErr;

    res.json({ success: true, message: 'Suscripción Web Push registrada correctamente' });
  } catch (err) {
    console.error('Error al guardar suscripción Push:', err);
    res.status(500).json({ error: 'Error al registrar suscripción Push', details: err.message });
  }
};

router.post('/push-subscription', validate(pushSubscriptionSchema), handlePushSubscription);

module.exports = {
  authRouter: router,
  handleLogin,
  handleGoogleLogin,
  handlePushSubscription
};
