-- ============================================================================
-- DidactIA Academias — Fase 4 · inc.1: Cobros (pagos)
-- Idempotente. RLS por centro (staff read / dirección write).
-- ============================================================================
create table if not exists public.pagos (
  id           uuid primary key default gen_random_uuid(),
  centro_id    uuid not null references public.centros(id) on delete cascade,
  alumno_id    uuid not null references public.alumnos(id) on delete cascade,
  matricula_id uuid references public.matriculas(id) on delete set null,
  concepto     text,
  importe      numeric not null,
  fecha        date not null default current_date,
  metodo       text not null default 'transferencia',  -- transferencia | efectivo | domiciliacion
  estado       text not null default 'pagado',          -- pagado | pendiente
  periodo      text,                                     -- 'YYYY-MM'
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists idx_pagos_cf on public.pagos(centro_id, periodo);
create index if not exists idx_pagos_al on public.pagos(alumno_id);

alter table public.pagos enable row level security;
drop policy if exists pagos_read  on public.pagos;
drop policy if exists pagos_write on public.pagos;
create policy pagos_read on public.pagos for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura'))
);
create policy pagos_write on public.pagos for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')));
