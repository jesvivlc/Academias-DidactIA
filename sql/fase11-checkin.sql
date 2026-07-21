-- ============================================================================
-- DidactIA Academias — Fase 11: Check-in por QR
-- Idempotente. RLS por academia.
--
-- Carnet con QR por alumno + pantalla de recepción que lo lee con la cámara:
-- registra la entrada, marca la asistencia del grupo que toca a esa hora y
-- avisa al mostrador si el alumno arrastra recibos pendientes.
-- ============================================================================

-- Código del carnet: corto, legible y sin caracteres ambiguos
alter table public.alumnos add column if not exists codigo_qr text;
create unique index if not exists idx_alumnos_codigo_qr
  on public.alumnos(centro_id, codigo_qr) where codigo_qr is not null;

create table if not exists public.checkins (
  id             uuid primary key default gen_random_uuid(),
  centro_id      uuid not null references public.centros(id) on delete cascade,
  alumno_id      uuid not null references public.alumnos(id) on delete cascade,
  grupo_id       uuid references public.grupos(id) on delete set null,
  fecha          date not null default current_date,
  hora           time not null default (now() at time zone 'Europe/Madrid')::time,
  tipo           text not null default 'entrada',   -- entrada | salida
  origen         text not null default 'qr',        -- qr | manual
  registrado_por uuid,
  created_at     timestamptz not null default now()
);
create index if not exists idx_checkins_cf on public.checkins(centro_id, fecha);
create index if not exists idx_checkins_al on public.checkins(alumno_id, fecha);

alter table public.checkins enable row level security;
drop policy if exists checkins_read  on public.checkins;
drop policy if exists checkins_write on public.checkins;
drop policy if exists checkins_fam_read on public.checkins;
create policy checkins_read on public.checkins for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);
-- La familia ve las entradas y salidas de sus hijos
create policy checkins_fam_read on public.checkins for select using (
  alumno_id in (select public._mis_alumnos())
);
create policy checkins_write on public.checkins for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')));

-- ── Asignación de códigos a los alumnos que aún no tienen ───────────────────
-- Alfabeto sin 0/O ni 1/I/L para que el código sea dictable por teléfono.
create or replace function public.generar_codigos_qr(p_centro uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_n int := 0; r record; v_cod text; i int;
begin
  if not (public._caller_rol() = 'superadmin'
          or (p_centro = public._caller_centro()
              and public._caller_rol() in ('admin','admin_institucional','director','jefatura'))) then
    raise exception 'no autorizado';
  end if;

  for r in select id from public.alumnos where centro_id = p_centro and codigo_qr is null loop
    loop
      v_cod := '';
      for i in 1..10 loop
        v_cod := v_cod || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
      end loop;
      exit when not exists (
        select 1 from public.alumnos a where a.centro_id = p_centro and a.codigo_qr = v_cod
      );
    end loop;
    update public.alumnos set codigo_qr = v_cod where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.generar_codigos_qr(uuid) from public, anon;
grant execute on function public.generar_codigos_qr(uuid) to authenticated;

-- ── Resolución del carnet en el mostrador ───────────────────────────────────
-- Devuelve el alumno, el grupo que le toca ahora y su deuda pendiente, en una
-- sola llamada para que el escaneo sea instantáneo.
create or replace function public.checkin_por_codigo(p_codigo text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_centro uuid := public._caller_centro();
  a public.alumnos;
  v_grupo uuid; v_grupo_nombre text; v_deuda numeric; v_recibos int;
  v_ya boolean; v_checkin uuid;
  v_ahora time := (now() at time zone 'Europe/Madrid')::time;
  v_dia int := extract(isodow from (now() at time zone 'Europe/Madrid'))::int;
begin
  if not (public._caller_rol() in
          ('admin','admin_institucional','director','jefatura','profesional','superadmin')) then
    raise exception 'no autorizado';
  end if;

  select * into a from public.alumnos
   where centro_id = v_centro and codigo_qr = upper(btrim(p_codigo));
  if a is null then
    return json_build_object('ok', false, 'error', 'Carnet no reconocido');
  end if;

  -- Grupo del alumno cuya sesión está en curso (con 20 min de cortesía)
  select g.id, g.nombre into v_grupo, v_grupo_nombre
    from public.grupo_sesiones s
    join public.grupos g on g.id = s.grupo_id
    join public.matricula_grupo mg on mg.grupo_id = g.id
    join public.matriculas m on m.id = mg.matricula_id and m.alumno_id = a.id and m.estado = 'activa'
   where g.centro_id = v_centro
     and s.dia_semana = v_dia
     and v_ahora between (s.hora_inicio - interval '20 minutes') and s.hora_fin
   order by s.hora_inicio
   limit 1;

  select coalesce(sum(p.importe), 0), count(*) into v_deuda, v_recibos
    from public.pagos p
   where p.centro_id = v_centro and p.alumno_id = a.id and p.estado = 'pendiente';

  select exists (
    select 1 from public.checkins c
     where c.centro_id = v_centro and c.alumno_id = a.id
       and c.fecha = current_date and c.tipo = 'entrada'
  ) into v_ya;

  insert into public.checkins (centro_id, alumno_id, grupo_id, tipo, origen, registrado_por)
  values (v_centro, a.id, v_grupo, case when v_ya then 'salida' else 'entrada' end, 'qr', auth.uid())
  returning id into v_checkin;

  -- Si hay clase en curso, la entrada vale como asistencia
  if v_grupo is not null and not v_ya then
    insert into public.asistencia (centro_id, alumno_id, grupo_id, fecha, estado, registrado_por)
    values (v_centro, a.id, v_grupo, current_date, 'presente', auth.uid())
    on conflict (centro_id, alumno_id, fecha, grupo_id) do nothing;
  end if;

  return json_build_object(
    'ok', true,
    'checkin_id', v_checkin,
    'alumno', json_build_object(
      'id', a.id,
      'nombre', btrim(coalesce(a.nombre,'') || ' ' || coalesce(a.apellidos,'')),
      'nivel', a.nivel_educativo,
      'estado', a.estado
    ),
    'tipo', case when v_ya then 'salida' else 'entrada' end,
    'grupo', v_grupo_nombre,
    'asistencia_marcada', (v_grupo is not null and not v_ya),
    'deuda', v_deuda,
    'recibos_pendientes', v_recibos
  );
end $$;
revoke all on function public.checkin_por_codigo(text) from public, anon;
grant execute on function public.checkin_por_codigo(text) to authenticated;
