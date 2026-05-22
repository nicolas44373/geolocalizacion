-- Schema para el Sistema de Rastreo de Folleteros

-- 1. Tabla de folleteros (personal de campo)
CREATE TABLE IF NOT EXISTS folleteros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    activo BOOLEAN DEFAULT true,
    estado TEXT DEFAULT 'finalizado' CHECK (estado IN ('activo', 'pausado', 'finalizado')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de ubicaciones recibidas por GPS
CREATE TABLE IF NOT EXISTS ubicaciones (
    id BIGSERIAL PRIMARY KEY,
    folletero_id UUID REFERENCES folleteros(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    precision_m REAL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Vista de última posición de folleteros activos
-- Esta vista une las tablas y devuelve el último punto de cada folletero
CREATE OR REPLACE VIEW ultima_posicion AS
SELECT DISTINCT ON (u.folletero_id)
    u.id,
    u.folletero_id,
    u.lat,
    u.lng,
    u.precision_m,
    u.created_at,
    f.nombre,
    f.activo,
    f.estado
FROM ubicaciones u
JOIN folleteros f ON u.folletero_id = f.id
WHERE f.activo = true
ORDER BY u.folletero_id, u.created_at DESC;

-- 4. Habilitar Realtime en la tabla 'ubicaciones'
-- Para Supabase, agregamos la tabla al canal de realtime
alter publication supabase_realtime add table ubicaciones;

-- 5. Configurar Row Level Security (RLS)
-- Habilitar RLS en las tablas
ALTER TABLE folleteros ENABLE ROW LEVEL SECURITY;
ALTER TABLE ubicaciones ENABLE ROW LEVEL SECURITY;

-- Crear políticas para permitir acceso al cliente anon/service_role
-- El panel de administración utiliza realtime para escuchar cambios en 'ubicaciones' utilizando la clave anon.
-- Por lo tanto, permitimos SELECT para todos (público) en ubicaciones.
CREATE POLICY "Permitir lectura publica de ubicaciones para realtime"
ON ubicaciones FOR SELECT USING (true);

-- Permitir todas las operaciones al service_role (usado por nuestras API routes de Next.js)
CREATE POLICY "Permitir todo al service_role en folleteros"
ON folleteros TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo al service_role en ubicaciones"
ON ubicaciones TO service_role USING (true) WITH CHECK (true);
