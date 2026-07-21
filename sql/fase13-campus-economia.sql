-- ============================================================================
-- DidactIA Academias — Fase 13: Campus virtual + gastos, resultados y fichaje
-- Idempotente. RLS por academia.
--
--  · recursos  → material compartido con alumnos y familias (campus virtual)
--  · gastos    → la otra mitad de la cuenta de resultados
--  · fichajes  → registro de jornada del profesorado (art. 34.9 ET)
-- ============================================================================

-- ── 1. Campus virtual ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('recursos', 'recursos', false)
on conflict (id) do nothing;

create table if not exists public.recursos (
  id                uuid primary key default gen_random_uuid(),
  centro_id         uuid not null references public.centros(id) on delete cascade,
  grupo_id          uuid references public.grupos(id) on delete cascade,  -- null = toda la academia
  titulo            text not null,
  descripcion       text,
  tipo              text not null default 'archivo',   -- archivo | enlace
  path              text,                               -- ruta en el bucket 'recursos'
  url               text,                               -- si tipo = enlace
  mime              text,
  tamano            bigint,
  visible_familias  boolean not null default true,
  subido_por        uuid,
  created_at        timestamptz not null default now()
);
create index if not exists idx_recursos_cf on public.recursos(centro_id, created_at desc);
create index if not exists idx_recursos_gr on public.recursos(grupo_id);

alter table public.recursos enable row level security;
drop policy if exists recursos_read     on public.recursos;
drop policy if exists recursos_write    on public.recursos;
drop policy if exists recursos_fam_read on public.recursos;
create policy recursos_read on public.recursos for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);
-- La familia ve el material de la academia de sus hijos: el general y el de los
-- grupos en los que están matriculados.
create policy recursos_fam_read on public.recursos for select using (
  visible_familias = true
  and (
    grupo_id is null and exists (
      select 1 from public.alumnos a
       where a.centro_id = recursos.centro_id and a.id in (select public._mis_alumnos())
    )
    or grupo_id in (
      select mg.grupo_id from public.matricula_grupo mg
        join public.matriculas m on m.id = mg.matricula_id
       where m.alumno_id in (select public._mis_alumnos())
    )
  )
);
create policy recursos_write on public.recursos for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')));

-- Acceso al bucket: los ficheros viven bajo <centro_id>/…, así que basta con
-- comparar la primera carpeta con el centro del llamante.
drop policy if exists recursos_obj_read  on storage.objects;
drop policy if exists recursos_obj_write on storage.objects;
drop policy if exists recursos_obj_del   on storage.objects;
create policy recursos_obj_read on storage.objects for select to authenticated using (
  bucket_id = 'recursos' and (storage.foldername(name))[1] = public._caller_centro()::text
);
create policy recursos_obj_write on storage.objects for insert to authenticated with check (
  bucket_id = 'recursos'
  and (storage.foldername(name))[1] = public._caller_centro()::text
  and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','superadmin')
);
create policy recursos_obj_del on storage.objects for delete to authenticated using (
  bucket_id = 'recursos'
  and (storage.foldername(name))[1] = public._caller_centro()::text
  and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional','superadmin')
);

-- ── 2. Gastos ───────────────────────────────────────────────────────────────
create table if not exists public.gastos (
  id         uuid primary key default gen_random_uuid(),
  centro_id  uuid not null references public.centros(id) on delete cascade,
  fecha      date not null default current_date,
  concepto   text not null,
  categoria  text not null default 'otros',  -- alquiler|nominas|suministros|material|marketing|software|asesoria|impuestos|otros
  importe    numeric not null,
  proveedor  text,
  metodo     text default 'transferencia',
  periodico  boolean not null default false, -- gasto fijo mensual
  nota       text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_gastos_cf on public.gastos(centro_id, fecha desc);

alter table public.gastos enable row level security;
drop policy if exists gastos_read  on public.gastos;
drop policy if exists gastos_write on public.gastos;
create policy gastos_read on public.gastos for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura'))
);
create policy gastos_write on public.gastos for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura')));

-- ── 3. Registro de jornada del profesorado ──────────────────────────────────
create table if not exists public.fichajes (
  id          uuid primary key default gen_random_uuid(),
  centro_id   uuid not null references public.centros(id) on delete cascade,
  profesor_id uuid not null references public.profesores(id) on delete cascade,
  fecha       date not null default current_date,
  entrada     time,
  salida      time,
  nota        text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (centro_id, profesor_id, fecha, entrada)
);
create index if not exists idx_fichajes_cf on public.fichajes(centro_id, fecha desc);

alter table public.fichajes enable row level security;
drop policy if exists fichajes_read  on public.fichajes;
drop policy if exists fichajes_write on public.fichajes;
create policy fichajes_read on public.fichajes for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional'))
);
create policy fichajes_write on public.fichajes for all
  using (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')))
  with check (public._caller_rol() = 'superadmin'
         or (centro_id = public._caller_centro()
             and public._caller_rol() in ('admin','admin_institucional','director','jefatura','profesional')));
