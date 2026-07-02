-- ============================================================================
-- DidactIA Academias — Fase 2 · inc.3: Calificaciones + Tareas/Exámenes
-- Idempotente. RLS por centro (staff read/write). Familias leerán en Fase 3.
-- ============================================================================
create table if not exists public.calificaciones (
  id           uuid primary key default gen_random_uuid(),
  centro_id    uuid not null references public.centros(id) on delete cascade,
  alumno_id    uuid not null references public.alumnos(id) on delete cascade,
  grupo_id     uuid references public.grupos(id) on delete set null,
  evaluacion   text,                                   -- p.ej. '1ª', '2ª', 'Final', o nombre de prueba
  nota         numeric,                                -- 0–10
  observacion  text,
  fecha        date not null default current_date,
  created_at   timestamptz not null default now()
);
create index if not exists idx_calif_cf on public.calificaciones(centro_id);
create index if not exists idx_calif_al on public.calificaciones(alumno_id);
create index if not exists idx_calif_gr on public.calificaciones(grupo_id);

create table if not exists public.tareas (
  id            uuid primary key default gen_random_uuid(),
  centro_id     uuid not null references public.centros(id) on delete cascade,
  grupo_id      uuid references public.grupos(id) on delete cascade,
  titulo        text not null,
  descripcion   text,
  tipo          text not null default 'deber',         -- deber | examen | proyecto
  fecha_entrega date,
  created_at    timestamptz not null default now()
);
create index if not exists idx_tareas_cf on public.tareas(centro_id, fecha_entrega);
create index if not exists idx_tareas_gr on public.tareas(grupo_id);

do $$
declare t text;
begin
  foreach t in array array['calificaciones','tareas']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_read  on public.%I;', t, t);
    execute format('drop policy if exists %I_write on public.%I;', t, t);
    execute format($p$
      create policy %I_read on public.%I for select using (
        public._caller_rol() = 'superadmin'
        or (centro_id = public._caller_centro()
            and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador')));$p$, t, t);
    execute format($p$
      create policy %I_write on public.%I for all
        using (public._caller_rol() = 'superadmin'
               or (centro_id = public._caller_centro()
                   and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')))
        with check (public._caller_rol() = 'superadmin'
               or (centro_id = public._caller_centro()
                   and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')));$p$, t, t);
  end loop;
end $$;
