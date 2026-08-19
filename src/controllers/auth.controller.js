import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Controller para autenticación de empleados
 * POST /api/employee/login
 */
export const loginEmployee = async (req, res) => {
  try {
    const { cuil, password } = req.body;

    if (!cuil || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'El CUIL y la contraseña son obligatorios.',
      });
    }

    // Normalizar CUIL (quitar guiones o espacios)
    const normalizedCuil = String(cuil).trim();

    // Consultar la tabla employees filtrando por CUIL
    const { data: employee, error } = await supabaseAdmin
      .from('employees')
      .select('*')
      .eq('cuil', normalizedCuil)
      .single();

    if (error || !employee) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Credenciales inválidas. CUIL no encontrado.',
      });
    }

    // Validar si el empleado está archivado / dado de baja
    if (employee.archived) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'La cuenta del empleado se encuentra inactiva o archivada.',
      });
    }

    // Validar contraseña (compatible con bcrypt y texto plano para pruebas)
    let isPasswordValid = false;
    if (employee.password_hash.startsWith('$2a$') || employee.password_hash.startsWith('$2b$')) {
      isPasswordValid = await bcrypt.compare(password, employee.password_hash);
    } else {
      isPasswordValid = password === employee.password_hash;
    }

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Credenciales inválidas. Contraseña incorrecta.',
      });
    }

    // Omitir el hash de contraseña en la respuesta
    const { password_hash, ...employeeData } = employee;

    return res.status(200).json({
      message: 'Inicio de sesión exitoso',
      employee: employeeData,
    });
  } catch (err) {
    console.error('Error en loginEmployee:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ocurrió un error inesperado al procesar el inicio de sesión.',
      details: err.message,
    });
  }
};

/**
 * Obtener configuración pública de autenticación con Google
 * GET /api/auth/google-config
 */
export const getGoogleConfig = async (req, res) => {
  return res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    googleAllowedDomain: process.env.GOOGLE_ALLOWED_DOMAIN || null,
  });
};

/**
 * Inicio de sesión mediante Google ID Token
 * POST /api/employee/google-login
 */
export const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Bad Request', message: 'Token de Google requerido.' });
    }
    // Para entornos donde no está configurado un Client ID real, retornamos error o mock
    return res.status(501).json({
      error: 'Not Implemented',
      message: 'Autenticación con Google no configurada en este entorno.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

