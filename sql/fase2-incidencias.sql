-- ============================================================================
-- DidactIA Academias — Fase 2 · inc.2: Incidencias
-- Idempotente. RLS por centro (staff read + write).
-- ============================================================================
create table if not exists public.incidencias (
  id                 uuid primary key default gen_random_uuid(),
  centro_id          uuid not null references public.centros(id) on delete cascade,
  alumno_id          uuid references public.alumnos(id) on delete set null,
  grupo_id           uuid references public.grupos(id) on delete set null,
  fecha              date not null default current_date,
  tipo               text not null default 'conducta',   -- conducta | academica | material | retraso | otro
  gravedad           text not null default 'leve',        -- leve | moderada | grave
  descripcion        text,
  estado             text not null default 'abierta',     -- abierta | en_seguimiento | cerrada
  registrado_por     uuid,
  notificado_familia boolean not null default false,
  created_at         timestamptz not null default now()
);
create index if not exists idx_incidencias_cf on public.incidencias(centro_id, estado);
create index if not exists idx_incidencias_al on public.incidencias(alumno_id);

alter table public.incidencias enable row level security;
drop policy if exists incidencias_read  on public.incidencias;
drop policy if exists incidencias_write on public.incidencias;
create policy incidencias_read on public.incidencias for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);
create policy incidencias_write on public.incidencias for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador')));
