-- ============================================================================
-- DidactIA Academias — Fase 1: Datos maestros (matrícula, alumnos, grupos)
-- Ejecutar en Supabase SQL Editor (o vía Management API). Idempotente.
-- Reutiliza public._caller_rol() / public._caller_centro() de schema-fase0.sql.
-- ============================================================================

-- ── 1. Ampliación de la ficha de alumno ─────────────────────────────────────
alter table public.alumnos add column if not exists apellidos             text;
alter table public.alumnos add column if not exists fecha_nacimiento      date;
alter table public.alumnos add column if not exists telefono              text;
alter table public.alumnos add column if not exists email_contacto        text;
alter table public.alumnos add column if not exists direccion             text;
alter table public.alumnos add column if not exists nivel_educativo       text;   -- p.ej. '2º ESO', '1º Bach'
alter table public.alumnos add column if not exists centro_escolar        text;   -- colegio/instituto de procedencia
alter table public.alumnos add column if not exists nee                   boolean not null default false;
alter table public.alumnos add column if not exists nee_detalle           text;
alter table public.alumnos add column if not exists estado                text not null default 'activo'; -- activo | baja | prospecto
alter table public.alumnos add column if not exists fecha_alta            date not null default current_date;
alter table public.alumnos add column if not exists fecha_baja            date;
alter table public.alumnos add column if not exists motivo_baja           text;
alter table public.alumnos add column if not exists consentimiento_rgpd   boolean not null default false;
alter table public.alumnos add column if not exists consentimiento_imagen boolean not null default false;
alter table public.alumnos add column if not exists notas                 text;
create index if not exists idx_alumnos_estado on public.alumnos(centro_id, estado);

-- ── 2. Profesores ───────────────────────────────────────────────────────────
create table if not exists public.profesores (
  id           uuid primary key default gen_random_uuid(),
  centro_id    uuid not null references public.centros(id) on delete cascade,
  nombre       text not null,
  apellidos    text,
  email        text,
  telefono     text,
  especialidad text,
  tarifa_hora  numeric,
  activo       boolean not null default true,
  profile_id   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_profesores_centro on public.profesores(centro_id);

-- ── 3. Grupos (clase de una asignatura/nivel con un profesor) ───────────────
create table if not exists public.grupos (
  id            uuid primary key default gen_random_uuid(),
  centro_id     uuid not null references public.centros(id) on delete cascade,
  nombre        text not null,
  asignatura    text,
  nivel         text,
  profesor_id   uuid references public.profesores(id) on delete set null,
  aula          text,
  capacidad     integer,
  cuota_mensual numeric,
  color         text,
  curso_escolar text not null default '2025-26',
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_grupos_centro on public.grupos(centro_id, curso_escolar);

-- ── 4. Sesiones semanales de cada grupo (día + franja horaria) ──────────────
create table if not exists public.grupo_sesiones (
  id          uuid primary key default gen_random_uuid(),
  centro_id   uuid not null references public.centros(id) on delete cascade,
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  dia_semana  integer not null,           -- 1=lunes … 7=domingo
  hora_inicio time not null,
  hora_fin    time not null,
  aula        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_grupo_sesiones_grupo on public.grupo_sesiones(grupo_id);

-- ── 5. Matrículas (relación alumno ↔ academia con estado y cuota) ───────────
create table if not exists public.matriculas (
  id            uuid primary key default gen_random_uuid(),
  centro_id     uuid not null references public.centros(id) on delete cascade,
  alumno_id     uuid not null references public.alumnos(id) on delete cascade,
  estado        text not null default 'activa',   -- activa | baja | renovada | pendiente
  fecha_alta    date not null default current_date,
  fecha_baja    date,
  cuota_mensual numeric,
  descuento     numeric not null default 0,
  forma_pago    text,                              -- transferencia | efectivo | domiciliacion
  curso_escolar text not null default '2025-26',
  notas         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_matriculas_centro on public.matriculas(centro_id, estado);
create index if not exists idx_matriculas_alumno on public.matriculas(alumno_id);

-- ── 6. Grupos de cada matrícula (a qué clases va el alumno) ─────────────────
create table if not exists public.matricula_grupo (
  id           uuid primary key default gen_random_uuid(),
  centro_id    uuid not null references public.centros(id) on delete cascade,
  matricula_id uuid not null references public.matriculas(id) on delete cascade,
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (matricula_id, grupo_id)
);
create index if not exists idx_matricula_grupo_m on public.matricula_grupo(matricula_id);
create index if not exists idx_matricula_grupo_g on public.matricula_grupo(grupo_id);

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
-- Convención: lectura = personal de la academia (o superadmin); escritura =
-- dirección (admin/admin_institucional/director/jefatura) o superadmin.
do $$
declare t text;
begin
  foreach t in array array['profesores','grupos','grupo_sesiones','matriculas','matricula_grupo']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_read  on public.%I;', t, t);
    execute format('drop policy if exists %I_write on public.%I;', t, t);
    execute format($p$
      create policy %I_read on public.%I for select using (
        public._caller_rol() = 'superadmin'
        or (centro_id = public._caller_centro()
            and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
      );$p$, t, t);
    execute format($p$
      create policy %I_write on public.%I for all
        using (public._caller_rol() = 'superadmin'
               or (centro_id = public._caller_centro()
                   and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
        with check (public._caller_rol() = 'superadmin'
               or (centro_id = public._caller_centro()
                   and public._caller_rol() in ('admin','admin_institucional','director','jefatura')));$p$, t, t);
  end loop;
end $$;
