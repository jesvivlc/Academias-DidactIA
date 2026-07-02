-- ============================================================================
-- DidactIA Academias — Fase 2 · inc.5: Calendario / eventos
-- Idempotente. RLS por centro (staff read/write).
-- ============================================================================
create table if not exists public.eventos (
  id          uuid primary key default gen_random_uuid(),
  centro_id   uuid not null references public.centros(id) on delete cascade,
  titulo      text not null,
  fecha       date not null,
  hora        time,
  tipo        text not null default 'otro',  -- reunion|pago|vacaciones|inicio_trimestre|renovacion|recordatorio|otro
  descripcion text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_eventos_cf on public.eventos(centro_id, fecha);

alter table public.eventos enable row level security;
drop policy if exists eventos_read  on public.eventos;
drop policy if exists eventos_write on public.eventos;
create policy eventos_read on public.eventos for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);
create policy eventos_write on public.eventos for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')));
