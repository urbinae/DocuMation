import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    '[Supabase Config Warning]: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están definidas en el entorno.'
  );
}

/**
 * Cliente de Supabase utilizando la Service Role Key para operaciones de backend con privilegios administrativos.
 * Ignora las políticas RLS para operaciones del servidor (altas, bajas, firma de recibos, etc.).
 */
export const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Cliente de Supabase público utilizando la Anon Key.
 */
export const supabasePublic = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: false,
  },
});

// Exportación por defecto utilizando el cliente administrativo para backend
export default supabaseAdmin;
