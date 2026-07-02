-- ============================================================================
-- DidactIA Academias — Fase 3 · inc.2: Comunicaciones (cola)
-- Idempotente. RLS por centro (staff read/write). SIN envío real: el envío por
-- email/push/WhatsApp se activará al configurar Resend/VAPID/WhatsApp.
-- ============================================================================
create table if not exists public.comunicaciones (
  id              uuid primary key default gen_random_uuid(),
  centro_id       uuid not null references public.centros(id) on delete cascade,
  titulo          text not null,
  cuerpo          text,
  destinatario    text not null default 'todos',   -- todos | grupo | alumno
  destinatario_ref uuid,                            -- grupo_id o alumno_id según destinatario
  canal           text not null default 'email',    -- email | push | whatsapp
  estado          text not null default 'pendiente',-- pendiente | enviada | error
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists idx_comunicaciones_cf on public.comunicaciones(centro_id, created_at desc);

alter table public.comunicaciones enable row level security;
drop policy if exists comunicaciones_read  on public.comunicaciones;
drop policy if exists comunicaciones_write on public.comunicaciones;
create policy comunicaciones_read on public.comunicaciones for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);
create policy comunicaciones_write on public.comunicaciones for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')));
