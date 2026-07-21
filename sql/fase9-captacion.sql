-- ============================================================================
-- DidactIA Academias — Fase 9: Captación (inscripciones online + CRM de leads)
-- Idempotente. RLS por academia.
--
-- Embudo comercial completo, que es lo que el benchmark 2026-07 detectó que
-- falta frente a Acadesoft (CRM) y Kydemy (inscripciones online):
--   interesado → contactado → clase de prueba → matriculado (o perdido)
--
-- La captación pública (formulario web sin login) entra por RPCs SECURITY
-- DEFINER: la tabla `leads` NO es accesible con la anon key.
-- ============================================================================

create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  centro_id      uuid not null references public.centros(id) on delete cascade,
  nombre         text not null,
  apellidos      text,
  email          text,
  telefono       text,
  origen         text not null default 'web',    -- web|telefono|presencial|recomendacion|rrss|otro
  interes        text,                            -- qué busca (asignatura, nivel, objetivo)
  nivel          text,                            -- curso escolar del interesado
  mensaje        text,
  estado         text not null default 'nuevo',   -- nuevo|contactado|prueba|matriculado|perdido
  fecha_prueba   date,
  hora_prueba    time,
  grupo_id       uuid references public.grupos(id) on delete set null,
  alumno_id      uuid references public.alumnos(id) on delete set null,
  motivo_perdida text,
  notas          text,
  valor_estimado numeric,                          -- cuota mensual prevista
  responsable    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_leads_cf on public.leads(centro_id, estado);
create index if not exists idx_leads_fecha on public.leads(centro_id, created_at desc);

-- Grupos que la academia decide mostrar en su formulario público
alter table public.grupos add column if not exists publicado boolean not null default false;
alter table public.grupos add column if not exists descripcion_web text;

-- ── RLS: staff de la academia ───────────────────────────────────────────────
alter table public.leads enable row level security;
drop policy if exists leads_read  on public.leads;
drop policy if exists leads_write on public.leads;
create policy leads_read on public.leads for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);
create policy leads_write on public.leads for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')));

-- ── RPC público 1: ficha de la academia para el formulario ──────────────────
create or replace function public.academia_publica(p_slug text)
returns table(id uuid, nombre text, color_primario text, logo_url text)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.color_primario, c.logo_url
  from public.centros c
  where lower(c.slug) = lower(p_slug)
  limit 1
$$;
revoke all on function public.academia_publica(text) from public;
grant execute on function public.academia_publica(text) to anon, authenticated;

-- ── RPC público 2: catálogo de clases publicadas ────────────────────────────
--    Solo grupos marcados como `publicado`. No expone profesor, aula ni alumnos.
create or replace function public.catalogo_publico(p_slug text)
returns table(
  id uuid, nombre text, asignatura text, nivel text,
  descripcion text, cuota_mensual numeric, plazas_libres integer, horario text
)
language sql stable security definer set search_path = public as $$
  select g.id, g.nombre, g.asignatura, g.nivel,
         g.descripcion_web,
         g.cuota_mensual,
         case when g.capacidad is null then null
              else greatest(0, g.capacidad - (
                select count(*)::int from public.matricula_grupo mg where mg.grupo_id = g.id))
         end,
         (select string_agg(
             case s.dia_semana when 1 then 'L' when 2 then 'M' when 3 then 'X'
                               when 4 then 'J' when 5 then 'V' when 6 then 'S' else 'D' end
             || ' ' || to_char(s.hora_inicio,'HH24:MI') || '-' || to_char(s.hora_fin,'HH24:MI'),
             ' · ' order by s.dia_semana, s.hora_inicio)
          from public.grupo_sesiones s where s.grupo_id = g.id)
  from public.grupos g
  join public.centros c on c.id = g.centro_id
  where lower(c.slug) = lower(p_slug)
    and g.activo = true
    and g.publicado = true
  order by g.asignatura nulls last, g.nombre
$$;
revoke all on function public.catalogo_publico(text) from public;
grant execute on function public.catalogo_publico(text) to anon, authenticated;

-- ── RPC público 3: alta de solicitud desde la web ───────────────────────────
--    Único punto de escritura anónima. Valida, limita y no devuelve datos.
create or replace function public.crear_lead_publico(
  p_slug     text,
  p_nombre   text,
  p_email    text default null,
  p_telefono text default null,
  p_interes  text default null,
  p_nivel    text default null,
  p_mensaje  text default null,
  p_grupo    uuid default null
) returns json
language plpgsql security definer set search_path = public as $$
declare v_centro uuid; v_recientes int;
begin
  select c.id into v_centro from public.centros c where lower(c.slug) = lower(p_slug) limit 1;
  if v_centro is null then
    return json_build_object('ok', false, 'error', 'Academia no encontrada');
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    return json_build_object('ok', false, 'error', 'Indica tu nombre');
  end if;
  if coalesce(btrim(p_email), '') = '' and coalesce(btrim(p_telefono), '') = '' then
    return json_build_object('ok', false, 'error', 'Necesitamos un email o un teléfono para responderte');
  end if;

  -- Freno básico anti-abuso: nada de ráfagas del mismo contacto
  select count(*) into v_recientes
    from public.leads l
   where l.centro_id = v_centro
     and l.created_at > now() - interval '5 minutes'
     and (
       (coalesce(btrim(p_email),'') <> '' and lower(l.email) = lower(btrim(p_email)))
       or (coalesce(btrim(p_telefono),'') <> '' and l.telefono = btrim(p_telefono))
     );
  if v_recientes > 0 then
    return json_build_object('ok', true, 'duplicado', true);
  end if;

  -- El grupo debe pertenecer a esta academia y estar publicado
  if p_grupo is not null and not exists (
    select 1 from public.grupos g
     where g.id = p_grupo and g.centro_id = v_centro and g.publicado = true
  ) then
    p_grupo := null;
  end if;

  insert into public.leads (centro_id, nombre, email, telefono, origen, interes, nivel, mensaje, grupo_id, valor_estimado)
  values (
    v_centro, left(btrim(p_nombre), 120),
    nullif(lower(btrim(p_email)), ''), nullif(btrim(p_telefono), ''),
    'web', left(coalesce(p_interes, ''), 200), left(coalesce(p_nivel, ''), 80),
    left(coalesce(p_mensaje, ''), 1000), p_grupo,
    (select g.cuota_mensual from public.grupos g where g.id = p_grupo)
  );

  return json_build_object('ok', true);
end $$;
revoke all on function public.crear_lead_publico(text,text,text,text,text,text,text,uuid) from public;
grant execute on function public.crear_lead_publico(text,text,text,text,text,text,text,uuid) to anon, authenticated;

-- ── Conversión de lead a alumno matriculado ─────────────────────────────────
--    Crea alumno + matrícula (+ asignación al grupo de interés) en una sola
--    transacción y deja el lead marcado como matriculado.
create or replace function public.convertir_lead(p_lead uuid, p_cuota numeric default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.leads; v_alumno uuid; v_matricula uuid; v_cuota numeric;
begin
  select * into l from public.leads where id = p_lead;
  if l is null then raise exception 'Lead no encontrado'; end if;

  if not (public._caller_rol() = 'superadmin'
          or (l.centro_id = public._caller_centro()
              and public._caller_rol() in ('admin','admin_institucional','director','jefatura'))) then
    raise exception 'no autorizado';
  end if;

  if l.alumno_id is not null then return l.alumno_id; end if;

  insert into public.alumnos (centro_id, nombre, apellidos, email_contacto, telefono, nivel_educativo, estado, notas)
  values (l.centro_id, l.nombre, l.apellidos, l.email, l.telefono, l.nivel, 'activo',
          'Alta desde captación web' || coalesce(' · ' || l.interes, ''))
  returning id into v_alumno;

  v_cuota := coalesce(p_cuota, l.valor_estimado,
                      (select g.cuota_mensual from public.grupos g where g.id = l.grupo_id));

  insert into public.matriculas (centro_id, alumno_id, estado, cuota_mensual)
  values (l.centro_id, v_alumno, 'activa', v_cuota)
  returning id into v_matricula;

  if l.grupo_id is not null then
    insert into public.matricula_grupo (centro_id, matricula_id, grupo_id)
    values (l.centro_id, v_matricula, l.grupo_id)
    on conflict do nothing;
  end if;

  update public.leads
     set estado = 'matriculado', alumno_id = v_alumno, updated_at = now()
   where id = p_lead;

  return v_alumno;
end $$;
revoke all on function public.convertir_lead(uuid, numeric) from public, anon;
grant execute on function public.convertir_lead(uuid, numeric) to authenticated;
