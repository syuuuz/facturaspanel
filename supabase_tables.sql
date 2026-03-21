-- =============================================================================
-- CENTRO DE FACTURACIÓN — Script SQL completo para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONES Y RESET
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ⚠ IMPORTANTE: Esto borrará las tablas antiguas si existían
DROP TABLE IF EXISTS public.facturas CASCADE;
DROP TABLE IF EXISTS public.empresas CASCADE;
DROP TABLE IF EXISTS public.usuarios_autorizados CASCADE;


-- =============================================================================
-- 1. WHITELIST DE ACCESO AL PANEL
--    Solo el correo de abajo puede acceder al panel de facturación.
--    Nadie más, aunque se registre con Supabase Auth.
-- =============================================================================

CREATE TABLE public.usuarios_autorizados (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email      TEXT NOT NULL UNIQUE,
  nombre     TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ÚNICO CORREO AUTORIZADO ───────────────────────────────────────────────────
INSERT INTO public.usuarios_autorizados (email, nombre) VALUES
  ('dolcegustopanel@gmail.com', 'Administrador');

-- Para añadir alguien en el futuro:
-- INSERT INTO public.usuarios_autorizados (email, nombre) VALUES ('otro@correo.com', 'Nombre');

-- Para bloquear sin borrar:
-- UPDATE public.usuarios_autorizados SET activo = false WHERE email = 'correo@ejemplo.com';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FUNCIÓN: verifica si el usuario logueado está en la whitelist
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.usuario_autorizado()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_autorizados
    WHERE email  = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND activo = TRUE
  );
$$;


-- =============================================================================
-- 3. TABLA: empresas
--    NOTA: columna "logo" (no logo_url) para compatibilidad con el frontend
-- =============================================================================

CREATE TABLE public.empresas (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  nif            TEXT,
  direccion      TEXT,
  logo           TEXT,          -- base64 o URL — compatible con App.jsx
  config_diseno  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emp_select" ON public.empresas
  FOR SELECT USING (auth.uid() = user_id AND public.usuario_autorizado());

CREATE POLICY "emp_insert" ON public.empresas
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.usuario_autorizado());

CREATE POLICY "emp_update" ON public.empresas
  FOR UPDATE USING (auth.uid() = user_id AND public.usuario_autorizado());

CREATE POLICY "emp_delete" ON public.empresas
  FOR DELETE USING (auth.uid() = user_id AND public.usuario_autorizado());


-- =============================================================================
-- 4. TABLA: facturas
--    NOTAS:
--      · "empresa_id" (no id_empresa) — compatible con App.jsx
--      · "created_at" (no creado_en) — .order("created_at") en el código
-- =============================================================================

CREATE TABLE public.facturas (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero           TEXT NOT NULL,
  fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
  estado           TEXT NOT NULL DEFAULT 'Borrador'
                     CHECK (estado IN ('Borrador', 'Emitida')),
  cliente_nombre   TEXT,
  cliente_nif      TEXT,
  cliente_dir      TEXT,
  encabezado       TEXT,
  pie_pagina       TEXT,
  items            JSONB NOT NULL DEFAULT '[]',
  subtotal         NUMERIC(12,2) DEFAULT 0,
  iva              NUMERIC(12,2) DEFAULT 0,
  total            NUMERIC(12,2) DEFAULT 0,
  empresa_snapshot JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

-- Panel privado: solo dolcegustopanel@gmail.com
CREATE POLICY "fac_select_panel" ON public.facturas
  FOR SELECT USING (auth.uid() = user_id AND public.usuario_autorizado());

CREATE POLICY "fac_insert" ON public.facturas
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.usuario_autorizado());

CREATE POLICY "fac_update" ON public.facturas
  FOR UPDATE USING (auth.uid() = user_id AND public.usuario_autorizado());

CREATE POLICY "fac_delete" ON public.facturas
  FOR DELETE USING (auth.uid() = user_id AND public.usuario_autorizado());

-- Vista pública por QR: cualquier persona con el enlace ve la factura emitida.
-- No requiere login. No expira nunca.
CREATE POLICY "fac_public_qr" ON public.facturas
  FOR SELECT USING (estado = 'Emitida');


-- =============================================================================
-- 5. TRIGGERS: updated_at automático
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_empresas_updated
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_facturas_updated
  BEFORE UPDATE ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 6. ÍNDICES
-- =============================================================================

CREATE INDEX idx_empresas_user_id  ON public.empresas(user_id);
CREATE INDEX idx_facturas_user_id  ON public.facturas(user_id);
CREATE INDEX idx_facturas_empresa  ON public.facturas(empresa_id);
CREATE INDEX idx_facturas_estado   ON public.facturas(estado);
CREATE INDEX idx_autorizados_email ON public.usuarios_autorizados(email);
CREATE INDEX idx_facturas_emitidas ON public.facturas(id) WHERE estado = 'Emitida';


-- =============================================================================
-- RESUMEN
-- =============================================================================
--
--  PANEL (/dashboard)
--  → Solo dolcegustopanel@gmail.com
--  → RLS bloquea en BD + verificación en frontend
--
--  QR PÚBLICO (/f/:uuid)
--  → Cualquier persona con el enlace
--  → Solo facturas con estado = 'Emitida'
--  → Sin login, sin expiración, solo lectura
--
--  COMPATIBILIDAD CON App.jsx
--  → empresas.logo        (no logo_url)
--  → facturas.empresa_id  (no id_empresa)
--  → created_at           (para .order("created_at"))
--
-- =============================================================================
