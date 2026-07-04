-- ============================================================================
-- DidactIA Academias — #2: Mensajería familia <-> centro (por alumno)
-- Idempotente. RLS: familia solo hilos de sus hijos; staff todos los del centro.
-- ============================================================================
create table if not exists public.mensajes (
  id           uuid primary key default gen_random_uuid(),
  centro_id    uuid not null references public.centros(id) on delete cascade,
  alumno_id    uuid not null references public.alumnos(id) on delete cascade,
  remitente_id uuid,
  de_familia   boolean not null default false,   -- true = escrito por la familia
  texto        text not null,
  leido        boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_mensajes_cf on public.mensajes(centro_id, alumno_id, created_at);

alter table public.mensajes enable row level security;
drop policy if exists mensajes_staff on public.mensajes;
drop policy if exists mensajes_fam_read on public.mensajes;
drop policy if exists mensajes_fam_ins  on public.mensajes;

-- Staff del centro: lectura y escritura de todos los hilos del centro.
create policy mensajes_staff on public.mensajes for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador')));

-- Familia: lee los mensajes de sus hijos e inserta como familia (remitente propio).
create policy mensajes_fam_read on public.mensajes for select using (
  alumno_id in (select public._mis_alumnos())
);
create policy mensajes_fam_ins on public.mensajes for insert with check (
  alumno_id in (select public._mis_alumnos()) and de_familia = true and remitente_id = auth.uid()
);
