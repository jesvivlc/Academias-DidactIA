-- ============================================================================
-- DidactIA Academias — schema-fase0.sql
-- ----------------------------------------------------------------------------
-- Esquema mínimo (Fase 0) para el NÚCLEO limpio del producto.
-- Contiene SOLO las tablas, claves foráneas, políticas RLS y funciones que el
-- código conservado (js/config.js, utils.js, auth.js, users.js, chat.js) usa
-- realmente: autenticación multi-tenant, tematización por academia, gestión de
-- usuarios/roles y el chat base.
--
-- CÓMO EJECUTARLO:
--   1. Supabase → SQL Editor → New query.
--   2. Pega TODO este archivo y pulsa "Run" (se ejecuta como service_role).
--   3. Está pensado para una base VACÍA. Es idempotente (usa IF NOT EXISTS /
--      DROP POLICY IF EXISTS), así que puede reejecutarse sin romper nada.
--
-- Tenant = "academia". Internamente la tabla se sigue llamando `centros` (cada
-- fila es una academia) para no tocar el código. Solo cambian los textos de UI.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ────────────────────────────────────────────────────────────────────────────

-- Academias (tenant). Lectura pública: el registro y la tematización del login
-- consultan códigos/marca antes de autenticar.
create table if not exists public.centros (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  slug                text not null unique,
  codigo_familia      text,
  codigo_profesional  text,
  codigo_acceso       text,
  modulos_activos     text[] not null default '{}',
  color_primario      text,
  logo_url            text,
  institucion_id      uuid,
  created_at          timestamptz not null default now()
);

-- Perfiles de usuario. Extiende auth.users: id = user_id = UUID de auth.users.
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  full_name      text,
  email          text,
  rol            text not null default 'familia',
  centro_id      uuid references public.centros(id) on delete set null,
  institucion_id uuid,
  activo         boolean not null default true,
  idioma         text default 'es',
  created_at     timestamptz not null default now(),
  unique (user_id)
);
create index if not exists idx_profiles_centro on public.profiles(centro_id);

-- Alumnado de la academia (vinculado a familias vía familia_alumno).
create table if not exists public.alumnos (
  id              uuid primary key default gen_random_uuid(),
  centro_id       uuid not null references public.centros(id) on delete cascade,
  nombre          text not null,
  curso           text,
  grupo_horario   text,
  alergias        text,
  dieta_especial  text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_alumnos_centro on public.alumnos(centro_id);

-- Relación N:M familia ↔ alumno.
create table if not exists public.familia_alumno (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  alumno_id   uuid not null references public.alumnos(id) on delete cascade,
  relacion    text default 'familiar',
  created_at  timestamptz not null default now(),
  unique (profile_id, alumno_id)
);
create index if not exists idx_familia_alumno_profile on public.familia_alumno(profile_id);
create index if not exists idx_familia_alumno_alumno  on public.familia_alumno(alumno_id);

-- Contexto del chatbot + curso activo por academia.
create table if not exists public.info_centro (
  id            uuid primary key default gen_random_uuid(),
  centro_id     uuid not null references public.centros(id) on delete cascade,
  nombre_config text not null,
  datos         jsonb,
  visible_para  text default 'todos',
  curso_activo  text not null default '2025-26',
  created_at    timestamptz not null default now()
);
create index if not exists idx_info_centro_centro on public.info_centro(centro_id);

-- Horario por grupo (tabla principal que consulta el chat).
create table if not exists public.horarios_grupo (
  id               uuid primary key default gen_random_uuid(),
  centro_id        uuid not null references public.centros(id) on delete cascade,
  grupo_horario    text,
  curso_escolar    text not null default '2025-26',
  dia              text,
  tramo            integer,
  hora_inicio      time,
  hora_fin         time,
  actividad_nombre text,
  profesor_nombre  text,
  aula             text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_hg_curso on public.horarios_grupo(centro_id, curso_escolar);

-- Horario legacy (fallback de búsqueda por apellido en el chat).
create table if not exists public.horarios (
  id         uuid primary key default gen_random_uuid(),
  centro_id  uuid not null references public.centros(id) on delete cascade,
  dia        text,
  hora       text,
  profesor   text,
  actividad  text
);
create index if not exists idx_horarios_centro on public.horarios(centro_id);

-- Tramos horarios configurables por academia (resolución de "primera hora", etc.).
create table if not exists public.tramos_centro (
  id          uuid primary key default gen_random_uuid(),
  centro_id   uuid not null references public.centros(id) on delete cascade,
  numero      integer,
  hora_inicio time,
  hora_fin    time,
  nombre      text,
  es_descanso boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_tramos_centro on public.tramos_centro(centro_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. HELPERS RLS (SECURITY DEFINER, evitan recursión al leer profiles)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public._caller_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.profiles where user_id = auth.uid() limit 1
$$;

create or replace function public._caller_centro()
returns uuid language sql stable security definer set search_path = public as $$
  select centro_id from public.profiles where user_id = auth.uid() limit 1
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ────────────────────────────────────────────────────────────────────────────
alter table public.centros        enable row level security;
alter table public.profiles       enable row level security;
alter table public.alumnos        enable row level security;
alter table public.familia_alumno enable row level security;
alter table public.info_centro    enable row level security;
alter table public.horarios_grupo enable row level security;
alter table public.horarios       enable row level security;
alter table public.tramos_centro  enable row level security;

-- centros: lectura pública (registro + tematización pre-login). Escritura: superadmin.
drop policy if exists centros_read   on public.centros;
drop policy if exists centros_write  on public.centros;
create policy centros_read  on public.centros for select using (true);
create policy centros_write on public.centros for all
  using (public._caller_rol() = 'superadmin')
  with check (public._caller_rol() = 'superadmin');

-- profiles: cada usuario ve/edita el suyo; dirección ve/gestiona los de su academia;
-- superadmin todo. INSERT: crear el propio perfil al registrarse (id = auth.uid()).
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_select on public.profiles for select using (
  user_id = auth.uid()
  or public._caller_rol() = 'superadmin'
  or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro())
);
create policy profiles_insert on public.profiles for insert with check (
  id = auth.uid() and user_id = auth.uid()
);
create policy profiles_update on public.profiles for update using (
  user_id = auth.uid()
  or public._caller_rol() = 'superadmin'
  or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro())
);
create policy profiles_delete on public.profiles for delete using (
  public._caller_rol() = 'superadmin'
  or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro())
);

-- alumnos: lectura amplia (el registro vincula alumnos antes de autenticar).
-- Escritura: dirección de la academia + superadmin.
-- ⚠️ Fase 0: lectura permisiva para no bloquear el registro. Endurecer cuando se
--    implemente el módulo de alumnos definitivo.
drop policy if exists alumnos_read  on public.alumnos;
drop policy if exists alumnos_write on public.alumnos;
create policy alumnos_read  on public.alumnos for select using (true);
create policy alumnos_write on public.alumnos for all
  using (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()))
  with check (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()));

-- familia_alumno: la familia gestiona sus vínculos; dirección los de su academia.
drop policy if exists fa_own   on public.familia_alumno;
drop policy if exists fa_staff on public.familia_alumno;
create policy fa_own on public.familia_alumno for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy fa_staff on public.familia_alumno for all
  using (public._caller_rol() = 'superadmin'
         or public._caller_rol() in ('admin','admin_institucional'))
  with check (public._caller_rol() = 'superadmin'
         or public._caller_rol() in ('admin','admin_institucional'));

-- info_centro / horarios_grupo / horarios / tramos_centro:
-- lectura para usuarios autenticados de la academia (+ superadmin); escritura dirección.
drop policy if exists info_read  on public.info_centro;
drop policy if exists info_write on public.info_centro;
create policy info_read  on public.info_centro for select using (
  public._caller_rol() = 'superadmin' or centro_id = public._caller_centro()
);
create policy info_write on public.info_centro for all
  using (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()))
  with check (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()));

drop policy if exists hg_read  on public.horarios_grupo;
drop policy if exists hg_write on public.horarios_grupo;
create policy hg_read  on public.horarios_grupo for select using (
  public._caller_rol() = 'superadmin' or centro_id = public._caller_centro()
);
create policy hg_write on public.horarios_grupo for all
  using (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()))
  with check (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()));

drop policy if exists hor_read  on public.horarios;
drop policy if exists hor_write on public.horarios;
create policy hor_read  on public.horarios for select using (
  public._caller_rol() = 'superadmin' or centro_id = public._caller_centro()
);
create policy hor_write on public.horarios for all
  using (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()))
  with check (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()));

drop policy if exists tramos_read  on public.tramos_centro;
drop policy if exists tramos_write on public.tramos_centro;
create policy tramos_read  on public.tramos_centro for select using (
  public._caller_rol() = 'superadmin' or centro_id = public._caller_centro()
);
create policy tramos_write on public.tramos_centro for all
  using (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()))
  with check (public._caller_rol() = 'superadmin'
         or (public._caller_rol() in ('admin','admin_institucional') and centro_id = public._caller_centro()));

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC get_users_with_auth  (panel de Usuarios)
--    Une profiles + auth.users + centros. Admin ve su academia; superadmin todas.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.get_users_with_auth(p_centro_id uuid default null)
returns table (
  id                uuid,
  user_id           uuid,
  full_name         text,
  email             text,
  rol               text,
  centro_id         uuid,
  centro_nombre     text,
  activo            boolean,
  email_confirmed_at timestamptz,
  last_sign_in_at   timestamptz,
  created_at        timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.user_id, p.full_name, coalesce(p.email, u.email) as email,
    p.rol, p.centro_id, c.nombre as centro_nombre, p.activo,
    u.email_confirmed_at, u.last_sign_in_at, p.created_at
  from public.profiles p
  join auth.users u  on u.id = p.user_id
  left join public.centros c on c.id = p.centro_id
  where
    -- superadmin ve todos (o filtra por academia si se le pasa p_centro_id)
    (public._caller_rol() = 'superadmin' and (p_centro_id is null or p.centro_id = p_centro_id))
    -- admin de academia: solo la suya
    or (public._caller_rol() in ('admin','admin_institucional') and p.centro_id = public._caller_centro())
  order by p.created_at desc;
$$;

grant execute on function public.get_users_with_auth(uuid) to authenticated;
grant execute on function public._caller_rol()   to authenticated, anon;
grant execute on function public._caller_centro() to authenticated, anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. SEED — academia de prueba "Academia Demo DidactIA"
--    color_primario y logo_url a NULL (usa la marca DidactIA por defecto).
--    Código de registro general: DEMO-2026 (rol profesional/general).
-- ────────────────────────────────────────────────────────────────────────────
insert into public.centros (nombre, slug, codigo_familia, codigo_profesional, codigo_acceso, modulos_activos, color_primario, logo_url)
values ('Academia Demo DidactIA', 'demo', 'DEMO-FAM', 'DEMO-PRO', 'DEMO-2026', '{}', null, null)
on conflict (slug) do nothing;

-- ============================================================================
-- SIGUIENTE PASO MANUAL (no se puede hacer por SQL):
--   El primer usuario admin debe crearse desde Supabase → Authentication → Users
--   → "Add user" (email + contraseña). Luego, en el SQL Editor, crea su perfil:
--
--     insert into public.profiles (id, user_id, full_name, email, rol, centro_id)
--     select u.id, u.id, 'Admin Academia Demo DidactIA', u.email, 'admin', c.id
--     from auth.users u, public.centros c
--     where u.email = 'TU_EMAIL_ADMIN' and c.slug = 'demo';
--
--   (o usa rol 'superadmin' con centro_id NULL para acceso global).
-- ============================================================================
