-- 1. Deshabilitar Row Level Security (RLS) en la tabla employees
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;

-- 2. Asegurar los permisos de lectura y escritura a los roles de Supabase
GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO anon, authenticated, service_role;

-- ========================================================
-- TABLA: payslips
-- ========================================================
-- 1. Deshabilitar RLS
ALTER TABLE payslips DISABLE ROW LEVEL SECURITY;

-- 2. Conceder permisos
GRANT SELECT, INSERT, UPDATE, DELETE ON payslips TO anon, authenticated, service_role;

-- ========================================================
-- TABLA: settings
-- ========================================================
-- 1. Deshabilitar RLS
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- 2. Conceder permisos
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO anon, authenticated, service_role;

-- ========================================================
-- TABLA: clients
-- ========================================================
-- 1. Deshabilitar RLS
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;

-- 2. Conceder permisos
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO anon, authenticated, service_role;


-- ========================================================
-- TABLA: contracts
-- ========================================================
-- 1. Deshabilitar RLS
ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;

-- 2. Conceder permisos
GRANT SELECT, INSERT, UPDATE, DELETE ON contracts TO anon, authenticated, service_role;

--- Opción 2: Crear Políticas de Acceso (Policies) con RLS Activo
--- Si prefieres mantener RLS activado por seguridad, ejecuta el siguiente script para otorgar los permisos necesarios:
-- 1. Habilitar RLS en la tabla employees
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- 2. Conceder permisos de tabla a los roles de Supabase
GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO anon, authenticated, service_role;

-- 3. Crear política para permitir lectura pública/anon (GET /api/employees)
DROP POLICY IF EXISTS "Allow anon select on employees" ON employees;
CREATE POLICY "Allow anon select on employees" ON employees
  FOR SELECT
  TO anon
  USING (true);

-- 4. Crear política de acceso completo para usuarios autenticados
DROP POLICY IF EXISTS "Allow authenticated full access on employees" ON employees;
CREATE POLICY "Allow authenticated full access on employees" ON employees
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Crear política de acceso total explícita para service_role (Backend API)
DROP POLICY IF EXISTS "Service role full access on employees" ON employees;
CREATE POLICY "Service role full access on employees" ON employees
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
