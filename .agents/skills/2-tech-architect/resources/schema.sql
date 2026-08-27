-- =============================================================================
-- DDL Oficial del Proyecto DocuMation (Supabase PostgreSQL + Storage RLS)
-- =============================================================================

-- Habilitar extensión para UUID gen_random_uuid() si no está presente
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABLA: employees (Nómina de Empleados)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  cuil VARCHAR(13) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'empleado',
  puesto VARCHAR(200),
  fecha_ingreso DATE,
  archived BOOLEAN DEFAULT false,
  push_subscriptions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de consulta rápida para employees
CREATE INDEX IF NOT EXISTS idx_employees_cuil ON employees(cuil);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);

-- -----------------------------------------------------------------------------
-- 2. TABLA: payslips (Recibos de Sueldo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  detected_cuil VARCHAR(13) NOT NULL,
  month VARCHAR(7) NOT NULL, -- Formato YYYY-MM
  original_storage_path TEXT NOT NULL,
  duplicado_storage_path TEXT NOT NULL,
  signed_storage_path TEXT,
  status VARCHAR(50) DEFAULT 'Cargado',
  token UUID UNIQUE DEFAULT gen_random_uuid(),
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  ip_address VARCHAR(45),
  user_agent TEXT,
  financial_data JSONB,
  original_hash VARCHAR(64),
  duplicado_hash VARCHAR(64),
  analytics JSONB DEFAULT '{"readTime": 0, "downloads": 0}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de consulta para payslips
CREATE INDEX IF NOT EXISTS idx_payslips_employee_id ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_token ON payslips(token);
CREATE INDEX IF NOT EXISTS idx_payslips_month ON payslips(month);
CREATE INDEX IF NOT EXISTS idx_payslips_status ON payslips(status);
CREATE INDEX IF NOT EXISTS idx_payslips_detected_cuil ON payslips(detected_cuil);

-- -----------------------------------------------------------------------------
-- 3. TABLA: clients (Clientes B2B)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  empresa VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'cliente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para clients
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_empresa ON clients(empresa);

-- -----------------------------------------------------------------------------
-- 4. TABLA: contracts (Contratos Comerciales B2B)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'Pendiente',
  original_storage_path TEXT NOT NULL,
  signed_storage_path TEXT,
  file_hash VARCHAR(64),
  token UUID UNIQUE DEFAULT gen_random_uuid(),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para contracts
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_token ON contracts(token);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- -----------------------------------------------------------------------------
-- 5. TABLA: settings (Configuración Global Clave-Valor)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para mantener updated_at en settings
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_settings_updated_at ON settings;
CREATE TRIGGER set_settings_updated_at
BEFORE UPDATE ON settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- POLÍTICAS DE SEGURIDAD RLS (ROW LEVEL SECURITY)
-- =============================================================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Políticas para Service Role (Servidor / API Handler en Vercel)
-- Nota: En Supabase, 'service_role' omite el RLS por defecto, pero se agregan políticas explícitas.

CREATE POLICY "Service role full access on employees" ON employees
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on payslips" ON payslips
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on clients" ON clients
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on contracts" ON contracts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on settings" ON settings
  FOR ALL USING (auth.role() = 'service_role');

-- Lectura pública / token para firma de payslips y contracts
CREATE POLICY "Public token access on payslips" ON payslips
  FOR SELECT USING (token IS NOT NULL);

CREATE POLICY "Public token access on contracts" ON contracts
  FOR SELECT USING (token IS NOT NULL);

-- =============================================================================
-- CONFIGURACIÓN DE SUPABASE STORAGE BUCKETS Y POLÍTICAS DE ACCESO
-- =============================================================================

-- Registro de Buckets en el esquema storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('payslips', 'payslips', false, 15728640, ARRAY['application/pdf']),
  ('contracts', 'contracts', false, 20971520, ARRAY['application/pdf']),
  ('temp', 'temp', false, 52428800, ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas de Seguridad RLS en storage.objects
CREATE POLICY "Service role full storage access on payslips" ON storage.objects
  FOR ALL USING (bucket_id = 'payslips' AND auth.role() = 'service_role');

CREATE POLICY "Service role full storage access on contracts" ON storage.objects
  FOR ALL USING (bucket_id = 'contracts' AND auth.role() = 'service_role');

CREATE POLICY "Service role full storage access on temp" ON storage.objects
  FOR ALL USING (bucket_id = 'temp' AND auth.role() = 'service_role');
