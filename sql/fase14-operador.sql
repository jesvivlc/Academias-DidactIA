-- ============================================================================
-- DidactIA Academias — Fase 14: Panel de operador (alta y cartera de clientes)
-- Idempotente.
--
-- La capa de negocio del SaaS: qué academias han contratado, en qué plan, qué
-- facturan al mes, cuánto consumen frente a su límite y en qué estado están.
-- Todo restringido a `superadmin`: es la consola del dueño de la plataforma,
-- no de las academias.
-- ============================================================================

-- Estado comercial del inquilino (suspender por impago sin borrar sus datos)
alter table public.centros add column if not exists estado text not null default 'activa';

create table if not exists public.suscripciones (
  centro_id        uuid primary key references public.centros(id) on delete cascade,
  plan             text not null default 'esencial',   -- esencial|academia|pro|amedida
  precio_mensual   numeric not null default 0,
  ciclo            text not null default 'mensual',    -- mensual|anual
  estado           text not null default 'trial',      -- trial|activa|suspendida|baja
  fecha_alta       date not null default current_date,
  trial_hasta      date,
  fecha_baja       date,
  motivo_baja      text,
  contacto_nombre  text,
  contacto_email   text,
  contacto_tel     text,
  notas            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.suscripciones enable row level security;
drop policy if exists suscripciones_sa   on public.suscripciones;
drop policy if exists suscripciones_read on public.suscripciones;
-- Solo el operador de la plataforma escribe
create policy suscripciones_sa on public.suscripciones for all
  using (public._caller_rol() = 'superadmin')
  with check (public._caller_rol() = 'superadmin');
-- La dirección de una academia puede consultar su propio plan (solo lectura)
create policy suscripciones_read on public.suscripciones for select using (
  centro_id = public._caller_centro()
  and public._caller_rol() in ('admin','admin_institucional','director')
);

-- Límite de alumnos incluido en cada plan
create or replace function public.limite_plan(p_plan text)
returns integer language sql immutable as $$
  select case p_plan
    when 'esencial' then 100
    when 'academia' then 300
    when 'pro'      then 600
    else null end
$$;

-- ── Cartera completa en una sola llamada ────────────────────────────────────
-- Hacerlo desde el cliente exigiría N consultas por academia; aquí sale todo
-- agregado de una vez.
-- Niega explícitamente en vez de devolver una lista vacía: así el error se ve
-- en la interfaz en lugar de aparentar una cartera sin clientes.
create or replace function public.panel_operador()
returns json
language plpgsql stable security definer set search_path = public as $$
declare v json;
begin
  if public._caller_rol() <> 'superadmin' then
    raise exception 'no autorizado';
  end if;
  select coalesce(json_agg(f order by f.nombre), '[]'::json) into v from (
    select
      c.id, c.nombre, c.slug, c.color_primario, c.estado,
      c.created_at,
      s.plan, s.precio_mensual, s.ciclo, s.estado as estado_suscripcion,
      s.fecha_alta, s.trial_hasta, s.contacto_nombre, s.contacto_email, s.contacto_tel, s.notas,
      public.limite_plan(s.plan) as limite,
      (select count(*)::int from public.alumnos a
        where a.centro_id = c.id and coalesce(a.estado,'activo') = 'activo') as alumnos_activos,
      (select count(*)::int from public.alumnos a where a.centro_id = c.id) as alumnos_total,
      (select count(*)::int from public.profiles p
        where p.centro_id = c.id and p.rol <> 'familia') as staff,
      (select count(*)::int from public.profiles p
        where p.centro_id = c.id and p.rol = 'familia') as familias,
      (select count(*)::int from public.grupos g
        where g.centro_id = c.id and g.activo) as grupos,
      (select coalesce(sum(pg.importe),0) from public.pagos pg
        where pg.centro_id = c.id and pg.estado = 'pagado'
          and coalesce(pg.periodo, to_char(pg.fecha,'YYYY-MM')) = to_char(current_date,'YYYY-MM')) as cobrado_mes,
      (select coalesce(sum(pg.importe),0) from public.pagos pg
        where pg.centro_id = c.id and pg.estado = 'pendiente') as pendiente,
      greatest(
        (select max(a.fecha) from public.asistencia a where a.centro_id = c.id),
        (select max(pg.fecha) from public.pagos pg where pg.centro_id = c.id),
        (select max(al.fecha_alta) from public.alumnos al where al.centro_id = c.id)
      ) as ultima_actividad
    from public.centros c
    left join public.suscripciones s on s.centro_id = c.id
  ) f;
  return v;
end $$;
revoke all on function public.panel_operador() from public, anon;
grant execute on function public.panel_operador() to authenticated;

-- ── Alta de una academia nueva ──────────────────────────────────────────────
-- Crea centro + suscripción en una sola operación, con slug único garantizado
-- y códigos de registro generados si no se indican.
create or replace function public.alta_academia(
  p_nombre    text,
  p_slug      text default null,
  p_plan      text default 'academia',
  p_precio    numeric default null,
  p_ciclo     text default 'mensual',
  p_trial     integer default 14,
  p_color     text default null,
  p_contacto_nombre text default null,
  p_contacto_email  text default null,
  p_contacto_tel    text default null,
  p_notas     text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_slug text; v_base text; v_i int := 2; v_id uuid;
  v_cod_fam text; v_cod_pro text; v_cod_acc text;
  v_precio numeric;
  v_alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_pre text;
begin
  if public._caller_rol() <> 'superadmin' then
    raise exception 'no autorizado';
  end if;
  if coalesce(btrim(p_nombre),'') = '' then
    return json_build_object('ok', false, 'error', 'El nombre es obligatorio');
  end if;

  -- Slug: el indicado o derivado del nombre, siempre único
  v_base := lower(regexp_replace(
              translate(coalesce(nullif(btrim(p_slug),''), btrim(p_nombre)),
                        'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                        'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'),
              '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'academia'; end if;
  v_slug := v_base;
  while exists (select 1 from public.centros c where c.slug = v_slug) loop
    v_slug := v_base || '-' || v_i; v_i := v_i + 1;
  end loop;

  -- Códigos de registro: prefijo legible + 5 caracteres sin ambigüedades
  v_pre := upper(left(regexp_replace(v_base, '[^a-z0-9]', '', 'g'), 5));
  if v_pre = '' then v_pre := 'ACAD'; end if;
  select v_pre || '-' || string_agg(substr(v_alfabeto, 1 + floor(random()*length(v_alfabeto))::int, 1), '')
    into v_cod_fam from generate_series(1,5);
  select v_pre || '-' || string_agg(substr(v_alfabeto, 1 + floor(random()*length(v_alfabeto))::int, 1), '')
    into v_cod_pro from generate_series(1,5);
  select v_pre || '-' || string_agg(substr(v_alfabeto, 1 + floor(random()*length(v_alfabeto))::int, 1), '')
    into v_cod_acc from generate_series(1,5);

  insert into public.centros (nombre, slug, codigo_familia, codigo_profesional, codigo_acceso,
                              modulos_activos, color_primario, estado)
  values (btrim(p_nombre), v_slug, v_cod_fam, v_cod_pro, v_cod_acc, '{}',
          nullif(btrim(coalesce(p_color,'')),''), 'activa')
  returning id into v_id;

  -- Precio por defecto según plan si no se indica otro
  v_precio := coalesce(p_precio, case p_plan
    when 'esencial' then 39 when 'academia' then 79 when 'pro' then 139 else 0 end);

  insert into public.suscripciones (centro_id, plan, precio_mensual, ciclo, estado,
                                    trial_hasta, contacto_nombre, contacto_email, contacto_tel, notas)
  values (v_id, p_plan, v_precio, p_ciclo,
          case when coalesce(p_trial,0) > 0 then 'trial' else 'activa' end,
          case when coalesce(p_trial,0) > 0 then current_date + p_trial else null end,
          nullif(btrim(coalesce(p_contacto_nombre,'')),''),
          nullif(lower(btrim(coalesce(p_contacto_email,''))),''),
          nullif(btrim(coalesce(p_contacto_tel,'')),''),
          nullif(btrim(coalesce(p_notas,'')),''));

  return json_build_object('ok', true, 'centro_id', v_id, 'slug', v_slug,
    'codigo_familia', v_cod_fam, 'codigo_profesional', v_cod_pro, 'codigo_acceso', v_cod_acc);
end $$;
revoke all on function public.alta_academia(text,text,text,numeric,text,integer,text,text,text,text,text) from public, anon;
grant execute on function public.alta_academia(text,text,text,numeric,text,integer,text,text,text,text,text) to authenticated;

-- ── Cambios sobre una academia ya dada de alta ──────────────────────────────
create or replace function public.actualizar_suscripcion(
  p_centro uuid,
  p_plan   text default null,
  p_precio numeric default null,
  p_ciclo  text default null,
  p_estado text default null,
  p_notas  text default null,
  p_motivo_baja text default null
) returns json
language plpgsql security definer set search_path = public as $$
begin
  if public._caller_rol() <> 'superadmin' then raise exception 'no autorizado'; end if;

  insert into public.suscripciones (centro_id) values (p_centro) on conflict (centro_id) do nothing;

  update public.suscripciones s set
    plan           = coalesce(nullif(btrim(coalesce(p_plan,'')),''), s.plan),
    precio_mensual = coalesce(p_precio, s.precio_mensual),
    ciclo          = coalesce(nullif(btrim(coalesce(p_ciclo,'')),''), s.ciclo),
    estado         = coalesce(nullif(btrim(coalesce(p_estado,'')),''), s.estado),
    notas          = coalesce(p_notas, s.notas),
    motivo_baja    = case when p_estado = 'baja' then coalesce(p_motivo_baja, s.motivo_baja) else s.motivo_baja end,
    fecha_baja     = case when p_estado = 'baja' then current_date else null end,
    trial_hasta    = case when p_estado = 'activa' then null else s.trial_hasta end,
    updated_at     = now()
  where s.centro_id = p_centro;

  -- El estado del centro es lo que corta o abre el acceso a la aplicación
  if p_estado is not null then
    update public.centros
       set estado = case when p_estado in ('suspendida','baja') then 'suspendida' else 'activa' end
     where id = p_centro;
  end if;

  return json_build_object('ok', true);
end $$;
revoke all on function public.actualizar_suscripcion(uuid,text,numeric,text,text,text,text) from public, anon;
grant execute on function public.actualizar_suscripcion(uuid,text,numeric,text,text,text,text) to authenticated;

-- ── Estado del inquilino, para el corte de acceso en el arranque de la app ──
-- Cualquier usuario autenticado puede preguntar por SU centro (no por otros).
create or replace function public.centro_suspendido(p_centro uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.estado = 'suspendida' from public.centros c
     where c.id = p_centro and (p_centro = public._caller_centro() or public._caller_rol() = 'superadmin')
  ), false)
$$;
revoke all on function public.centro_suspendido(uuid) from public, anon;
grant execute on function public.centro_suspendido(uuid) to authenticated;

-- ── Alta retroactiva: las academias que ya existían entran como activas ─────
insert into public.suscripciones (centro_id, plan, precio_mensual, ciclo, estado, fecha_alta)
select c.id, 'academia', 79, 'mensual', 'activa', c.created_at::date
  from public.centros c
 where not exists (select 1 from public.suscripciones s where s.centro_id = c.id);
