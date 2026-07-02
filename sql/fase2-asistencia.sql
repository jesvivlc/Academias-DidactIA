-- ============================================================================
-- DidactIA Academias — Fase 2 · inc.1: Control de asistencia
-- Idempotente. RLS por centro (staff read, dirección+profesorado write).
-- ============================================================================
create table if not exists public.asistencia (
  id                 uuid primary key default gen_random_uuid(),
  centro_id          uuid not null references public.centros(id) on delete cascade,
  alumno_id          uuid not null references public.alumnos(id) on delete cascade,
  grupo_id           uuid references public.grupos(id) on delete set null,
  fecha              date not null default current_date,
  estado             text not null default 'presente',   -- presente | ausente | retraso | justificada
  observacion        text,
  registrado_por     uuid,
  notificado_familia boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (centro_id, alumno_id, fecha, grupo_id)
);
create index if not exists idx_asistencia_cf on public.asistencia(centro_id, fecha);
create index if not exists idx_asistencia_al on public.asistencia(alumno_id);

alter table public.asistencia enable row level security;
drop policy if exists asistencia_read  on public.asistencia;
drop policy if exists asistencia_write on public.asistencia;
create policy asistencia_read on public.asistencia for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);
-- El profesorado también pasa lista, así que puede escribir su asistencia.
create policy asistencia_write on public.asistencia for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')));
