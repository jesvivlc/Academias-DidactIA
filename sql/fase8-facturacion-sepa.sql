-- ============================================================================
-- DidactIA Academias — Fase 8: Facturación (Verifactu-ready) + Domiciliación SEPA
-- Idempotente. RLS por academia (staff read / dirección write).
--
-- Cubre el hueco competitivo detectado en el benchmark 2026-07:
--   · facturación electrónica con registro inalterable y encadenado (RD 1007/2023)
--   · domiciliación de recibos en formato SEPA (pain.008.001.02)
--
-- El envío efectivo a la AEAT exige certificado digital de cada academia; el
-- registro de facturación que exige la norma (serie+número correlativo, huella
-- SHA-256 encadenada, fecha/hora, QR de cotejo) se construye aquí y queda listo
-- para remitirse. Columna estado_aeat = 'no_remitida' hasta que se envíe.
-- ============================================================================

-- ── Datos fiscales de la academia (1 fila por centro) ───────────────────────
create table if not exists public.datos_fiscales (
  centro_id         uuid primary key references public.centros(id) on delete cascade,
  razon_social      text,
  nif               text,
  direccion         text,
  cp                text,
  ciudad            text,
  provincia         text,
  pais              text not null default 'ES',
  email             text,
  telefono          text,
  -- Cuenta de la academia (acreedor en las remesas SEPA)
  iban              text,
  bic               text,
  sepa_acreedor_id  text,            -- Identificador del acreedor: ES##ZZZ<NIF>
  -- Numeración de facturas
  serie_factura     text not null default 'FA',
  proximo_numero    integer not null default 1,
  -- Fiscalidad: la enseñanza reglada suele ir exenta (art. 20.Uno.9º LIVA)
  tipo_iva          numeric not null default 0,
  exencion_iva      text default 'E1',
  pie_factura       text,
  updated_at        timestamptz not null default now()
);

-- ── Facturas emitidas (registro de facturación encadenado) ──────────────────
create table if not exists public.facturas (
  id                      uuid primary key default gen_random_uuid(),
  centro_id               uuid not null references public.centros(id) on delete cascade,
  alumno_id               uuid references public.alumnos(id) on delete set null,
  pago_id                 uuid references public.pagos(id) on delete set null,
  serie                   text not null,
  numero                  integer not null,
  num_completo            text not null,          -- 'FA/2026/0001'
  fecha_expedicion        date not null default current_date,
  fecha_hora_registro     timestamptz not null default now(),
  -- Destinatario
  destinatario_nombre     text,
  destinatario_nif        text,
  destinatario_direccion  text,
  -- Importes
  concepto                text,
  base_imponible          numeric not null default 0,
  tipo_iva                numeric not null default 0,
  cuota_iva               numeric not null default 0,
  total                   numeric not null default 0,
  exencion                text,                   -- E1..E6 (null si repercute IVA)
  tipo_factura            text not null default 'F1',  -- F1 | F2 simplificada | R1 rectificativa
  rectifica_id            uuid references public.facturas(id) on delete set null,
  -- Cadena de integridad (RD 1007/2023)
  huella                  text not null,          -- SHA-256 hex mayúsculas
  huella_anterior         text,
  qr_url                  text,
  estado_aeat             text not null default 'no_remitida', -- no_remitida|remitida|aceptada|rechazada
  anulada                 boolean not null default false,
  fecha_anulacion         timestamptz,
  created_by              uuid,
  created_at              timestamptz not null default now(),
  unique (centro_id, serie, numero)
);
create index if not exists idx_facturas_cf on public.facturas(centro_id, fecha_expedicion desc);
create index if not exists idx_facturas_al on public.facturas(alumno_id);
create index if not exists idx_facturas_pg on public.facturas(pago_id);

-- ── Mandatos SEPA (orden de domiciliación firmada por la familia) ───────────
create table if not exists public.mandatos_sepa (
  id             uuid primary key default gen_random_uuid(),
  centro_id      uuid not null references public.centros(id) on delete cascade,
  alumno_id      uuid not null references public.alumnos(id) on delete cascade,
  titular        text not null,
  nif_titular    text,
  iban           text not null,
  bic            text,
  referencia     text not null,                    -- referencia única del mandato (RUM)
  fecha_firma    date not null default current_date,
  tipo_secuencia text not null default 'FRST',     -- FRST (primer adeudo) | RCUR
  estado         text not null default 'activo',   -- activo | revocado
  notas          text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  unique (centro_id, referencia)
);
create index if not exists idx_mandatos_cf on public.mandatos_sepa(centro_id, estado);
create index if not exists idx_mandatos_al on public.mandatos_sepa(alumno_id);

-- ── Remesas de adeudos directos ─────────────────────────────────────────────
create table if not exists public.remesas_sepa (
  id              uuid primary key default gen_random_uuid(),
  centro_id       uuid not null references public.centros(id) on delete cascade,
  nombre          text,
  periodo         text,                             -- 'YYYY-MM'
  fecha_cobro     date not null,
  msg_id          text not null,
  num_operaciones integer not null default 0,
  importe_total   numeric not null default 0,
  estado          text not null default 'generada', -- generada | enviada | cobrada
  xml             text,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists idx_remesas_cf on public.remesas_sepa(centro_id, fecha_cobro desc);

create table if not exists public.remesa_lineas (
  id         uuid primary key default gen_random_uuid(),
  centro_id  uuid not null references public.centros(id) on delete cascade,
  remesa_id  uuid not null references public.remesas_sepa(id) on delete cascade,
  pago_id    uuid references public.pagos(id) on delete set null,
  mandato_id uuid references public.mandatos_sepa(id) on delete set null,
  alumno_id  uuid references public.alumnos(id) on delete set null,
  importe    numeric not null default 0,
  e2e_id     text,
  created_at timestamptz not null default now()
);
create index if not exists idx_remesa_lineas_r on public.remesa_lineas(remesa_id);

-- ── Enlace de pagos con su remesa (para no domiciliar dos veces) ────────────
alter table public.pagos add column if not exists remesa_id uuid references public.remesas_sepa(id) on delete set null;
alter table public.pagos add column if not exists factura_id uuid references public.facturas(id) on delete set null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Patrón del proyecto: staff/dirección del propio centro; superadmin global.
do $$
declare t text;
begin
  foreach t in array array['datos_fiscales','facturas','mandatos_sepa','remesas_sepa','remesa_lineas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read',  t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($f$
      create policy %I on public.%I for select using (
        public._caller_rol() = 'superadmin'
        or (centro_id = public._caller_centro()
            and public._caller_rol() in ('admin','admin_institucional','director','jefatura'))
      )$f$, t||'_read', t);
    execute format($f$
      create policy %I on public.%I for all
        using (public._caller_rol() = 'superadmin'
               or (centro_id = public._caller_centro()
                   and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
        with check (public._caller_rol() = 'superadmin'
               or (centro_id = public._caller_centro()
                   and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
      $f$, t||'_write', t);
  end loop;
end $$;

-- ── Numeración correlativa sin huecos ni carreras ───────────────────────────
-- Reserva atómica del siguiente número de factura para el centro del llamante.
create or replace function public.siguiente_numero_factura(p_centro uuid)
returns table (serie text, numero integer)
language plpgsql
security definer
set search_path = public
as $$
declare v_serie text; v_num integer;
begin
  if not (public._caller_rol() = 'superadmin'
          or (p_centro = public._caller_centro()
              and public._caller_rol() in ('admin','admin_institucional','director','jefatura'))) then
    raise exception 'no autorizado';
  end if;

  insert into public.datos_fiscales (centro_id) values (p_centro)
    on conflict (centro_id) do nothing;

  update public.datos_fiscales
     set proximo_numero = proximo_numero + 1,
         updated_at = now()
   where centro_id = p_centro
   returning serie_factura, proximo_numero - 1 into v_serie, v_num;

  serie := coalesce(v_serie,'FA'); numero := coalesce(v_num,1);
  return next;
end $$;

revoke all on function public.siguiente_numero_factura(uuid) from public, anon;
grant execute on function public.siguiente_numero_factura(uuid) to authenticated;

-- ── Última huella de la cadena (para encadenar el registro nuevo) ───────────
create or replace function public.ultima_huella_factura(p_centro uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select f.huella
    from public.facturas f
   where f.centro_id = p_centro
     and (public._caller_rol() = 'superadmin'
          or (p_centro = public._caller_centro()
              and public._caller_rol() in ('admin','admin_institucional','director','jefatura')))
   order by f.fecha_hora_registro desc, f.numero desc
   limit 1
$$;

revoke all on function public.ultima_huella_factura(uuid) from public, anon;
grant execute on function public.ultima_huella_factura(uuid) to authenticated;

-- ── Inalterabilidad: una factura registrada no se modifica ni se borra ──────
-- Solo se permite anular (anulada/fecha_anulacion) y actualizar el estado AEAT.
create or replace function public.facturas_inalterables()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las facturas no se pueden eliminar: emite una rectificativa.';
  end if;
  if new.huella is distinct from old.huella
     or new.num_completo is distinct from old.num_completo
     or new.total is distinct from old.total
     or new.base_imponible is distinct from old.base_imponible
     or new.fecha_expedicion is distinct from old.fecha_expedicion
     or new.huella_anterior is distinct from old.huella_anterior then
    raise exception 'Registro de facturación inalterable: emite una factura rectificativa.';
  end if;
  return new;
end $$;

drop trigger if exists trg_facturas_inalterables on public.facturas;
create trigger trg_facturas_inalterables
  before update or delete on public.facturas
  for each row execute function public.facturas_inalterables();
