-- ============================================================================
-- DidactIA Academias — Fase 10: Documentos y firma digital
-- Idempotente. RLS por academia.
--
-- Autorizaciones (imagen, salidas, RGPD), normas, hojas de matrícula y órdenes
-- de domiciliación firmadas por la familia desde el móvil, sin imprimir nada.
--
-- La familia firma en una página pública con un enlace de un solo uso
-- (token de 64 hex). Toda la interacción anónima pasa por RPCs SECURITY
-- DEFINER: las tablas no son accesibles con la anon key.
-- ============================================================================

create table if not exists public.documentos_plantilla (
  id         uuid primary key default gen_random_uuid(),
  centro_id  uuid not null references public.centros(id) on delete cascade,
  titulo     text not null,
  tipo       text not null default 'autorizacion',  -- autorizacion|rgpd|normas|matricula|sepa|otro
  cuerpo     text not null,                          -- admite {{alumno}} {{academia}} {{fecha}}
  activo     boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_doc_plant_cf on public.documentos_plantilla(centro_id, activo);

create table if not exists public.documentos_firma (
  id               uuid primary key default gen_random_uuid(),
  centro_id        uuid not null references public.centros(id) on delete cascade,
  alumno_id        uuid references public.alumnos(id) on delete cascade,
  plantilla_id     uuid references public.documentos_plantilla(id) on delete set null,
  titulo           text not null,
  cuerpo           text not null,        -- copia congelada en el momento del envío
  token            text not null unique,
  estado           text not null default 'pendiente',  -- pendiente|firmado|anulado
  firmante_nombre  text,
  firmante_nif     text,
  firma_img        text,                 -- data URL PNG del trazo
  firmado_en       timestamptz,
  hash             text,                 -- SHA-256 del contenido + firmante + sello de tiempo
  ip               text,
  user_agent       text,
  mandato_id       uuid references public.mandatos_sepa(id) on delete set null,
  expira_en        timestamptz not null default (now() + interval '30 days'),
  created_by       uuid,
  created_at       timestamptz not null default now()
);
create index if not exists idx_doc_firma_cf on public.documentos_firma(centro_id, estado);
create index if not exists idx_doc_firma_al on public.documentos_firma(alumno_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.documentos_plantilla enable row level security;
alter table public.documentos_firma     enable row level security;

drop policy if exists doc_plant_read  on public.documentos_plantilla;
drop policy if exists doc_plant_write on public.documentos_plantilla;
create policy doc_plant_read on public.documentos_plantilla for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);
create policy doc_plant_write on public.documentos_plantilla for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')));

drop policy if exists doc_firma_read     on public.documentos_firma;
drop policy if exists doc_firma_write    on public.documentos_firma;
drop policy if exists doc_firma_fam_read on public.documentos_firma;
create policy doc_firma_read on public.documentos_firma for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);
-- La familia ve los documentos de sus hijos (para consultarlos en su portal)
create policy doc_firma_fam_read on public.documentos_firma for select using (
  alumno_id in (select public._mis_alumnos())
);
create policy doc_firma_write on public.documentos_firma for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')));

-- ── Token de un solo uso ────────────────────────────────────────────────────
create or replace function public.nuevo_token_firma()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- ── RPC público 1: leer el documento a firmar ───────────────────────────────
create or replace function public.documento_para_firma(p_token text)
returns table(
  titulo text, cuerpo text, estado text,
  academia text, color_primario text, logo_url text,
  alumno text, firmante_nombre text, firmado_en timestamptz, caducado boolean
)
language sql stable security definer set search_path = public as $$
  select d.titulo, d.cuerpo, d.estado,
         c.nombre, c.color_primario, c.logo_url,
         nullif(btrim(coalesce(a.nombre,'') || ' ' || coalesce(a.apellidos,'')), ''),
         d.firmante_nombre, d.firmado_en,
         (d.expira_en < now())
  from public.documentos_firma d
  join public.centros c on c.id = d.centro_id
  left join public.alumnos a on a.id = d.alumno_id
  where d.token = p_token
  limit 1
$$;
revoke all on function public.documento_para_firma(text) from public;
grant execute on function public.documento_para_firma(text) to anon, authenticated;

-- ── RPC público 2: firmar ───────────────────────────────────────────────────
--    Sella el documento y calcula la huella del conjunto firmado. Una vez
--    firmado no se puede volver a firmar con el mismo enlace.
create or replace function public.firmar_documento(
  p_token   text,
  p_nombre  text,
  p_nif     text default null,
  p_firma   text default null,
  p_agente  text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare d public.documentos_firma; v_sello timestamptz := now(); v_hash text;
begin
  select * into d from public.documentos_firma where token = p_token;
  if d is null then return json_build_object('ok', false, 'error', 'Documento no encontrado'); end if;
  if d.estado = 'firmado' then return json_build_object('ok', false, 'error', 'Este documento ya está firmado'); end if;
  if d.estado = 'anulado' then return json_build_object('ok', false, 'error', 'Este documento ha sido anulado'); end if;
  if d.expira_en < now() then return json_build_object('ok', false, 'error', 'El enlace ha caducado'); end if;
  if coalesce(btrim(p_nombre), '') = '' then return json_build_object('ok', false, 'error', 'Indica tu nombre completo'); end if;
  if coalesce(p_firma, '') = '' then return json_build_object('ok', false, 'error', 'Falta la firma'); end if;

  v_hash := encode(sha256(convert_to(
    d.titulo || '|' || d.cuerpo || '|' || btrim(p_nombre) || '|' ||
    coalesce(p_nif, '') || '|' || v_sello::text || '|' || coalesce(p_firma, ''), 'UTF8')), 'hex');

  update public.documentos_firma
     set estado = 'firmado',
         firmante_nombre = left(btrim(p_nombre), 120),
         firmante_nif = nullif(btrim(coalesce(p_nif, '')), ''),
         firma_img = p_firma,
         firmado_en = v_sello,
         hash = upper(v_hash),
         user_agent = left(coalesce(p_agente, ''), 300)
   where id = d.id;

  return json_build_object('ok', true, 'hash', upper(v_hash), 'fecha', v_sello);
end $$;
revoke all on function public.firmar_documento(text,text,text,text,text) from public;
grant execute on function public.firmar_documento(text,text,text,text,text) to anon, authenticated;

-- ── Plantillas de arranque ──────────────────────────────────────────────────
-- Se siembran por academia la primera vez que se abre el módulo (desde la app),
-- no aquí, para no imponer texto legal a academias que ya tengan el suyo.
