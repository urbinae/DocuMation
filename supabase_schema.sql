-- =============================================================================
-- DocuMation - Supabase PostgreSQL Database Schema (DDL & Initial Seed Data)
-- =============================================================================

-- Habilitar extensión pgcrypto / uuid-ossp para gen_random_uuid() / uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. TABLA: employees
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cuil VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'employee',
    puesto VARCHAR(150),
    fecha_ingreso DATE,
    archived BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_cuil ON public.employees(cuil);
CREATE INDEX IF NOT EXISTS idx_employees_archived ON public.employees(archived);

-- -----------------------------------------------------------------------------
-- 2. TABLA: payslips
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    periodo VARCHAR(20) NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT,
    status VARCHAR(50) DEFAULT 'pendiente' NOT NULL,
    signed_at TIMESTAMPTZ,
    signature_image_path TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payslips_employee_id ON public.payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_status ON public.payslips(status);
CREATE INDEX IF NOT EXISTS idx_payslips_periodo ON public.payslips(periodo);

-- -----------------------------------------------------------------------------
-- 3. TABLA: push_subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_employee_id ON public.push_subscriptions(employee_id);

-- -----------------------------------------------------------------------------
-- 4. PERMISOS Y RLS (Row Level Security)
-- -----------------------------------------------------------------------------
-- Otorgar permisos sobre el esquema public a los roles de Supabase
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Deshabilitar RLS o crear políticas permisivas para backend API con Service Role
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions DISABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 5. BUCKETS DE STORAGE (SUPABASE)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. DATOS DE PRUEBA (SEEDING OPCIONAL)
-- -----------------------------------------------------------------------------
INSERT INTO public.employees (cuil, email, name, password_hash, role, puesto, fecha_ingreso, archived)
VALUES 
  ('20-12345678-9', 'empleado@documation.com', 'Juan Pérez', '123456', 'employee', 'Analista de Sistemas', '2023-01-15', false),
  ('27-98765432-1', 'admin@documation.com', 'María Gómez', 'admin123', 'admin', 'Gerente RRHH', '2021-05-10', false)
ON CONFLICT (cuil) DO NOTHING;
