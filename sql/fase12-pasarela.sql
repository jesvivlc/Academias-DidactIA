-- ============================================================================
-- DidactIA Academias — Fase 12: Pasarela de pago online (Stripe)
-- Idempotente.
--
-- Cada academia cobra en SU cuenta de Stripe: las claves se guardan por centro
-- en `pasarela_config`, una tabla con RLS activada y SIN NINGUNA POLÍTICA.
-- Eso significa que ni la anon key ni un usuario autenticado pueden leerla ni
-- escribirla nunca: solo la service_role (las Edge Functions) la ve. La
-- dirección la configura a través de RPCs que escriben pero jamás devuelven
-- el secreto.
-- ============================================================================

create table if not exists public.pasarela_config (
  centro_id      uuid primary key references public.centros(id) on delete cascade,
  proveedor      text not null default 'stripe',
  secret_key     text,
  public_key     text,
  webhook_secret text,
  activo         boolean not null default false,
  updated_at     timestamptz not null default now()
);

alter table public.pasarela_config enable row level security;
-- Sin políticas a propósito: acceso exclusivo de service_role.
drop policy if exists pasarela_read  on public.pasarela_config;
drop policy if exists pasarela_write on public.pasarela_config;
revoke all on public.pasarela_config from anon, authenticated;

alter table public.pagos add column if not exists stripe_session_id text;
alter table public.pagos add column if not exists pagado_online boolean not null default false;

-- ── Guardar credenciales (escribe, nunca devuelve el secreto) ───────────────
create or replace function public.guardar_pasarela(
  p_centro  uuid,
  p_secret  text default null,
  p_public  text default null,
  p_webhook text default null,
  p_activo  boolean default true
) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not (public._caller_rol() = 'superadmin'
          or (p_centro = public._caller_centro()
              and public._caller_rol() in ('admin','admin_institucional','director'))) then
    raise exception 'no autorizado';
  end if;

  insert into public.pasarela_config (centro_id, secret_key, public_key, webhook_secret, activo, updated_at)
  values (p_centro, nullif(btrim(coalesce(p_secret,'')),''), nullif(btrim(coalesce(p_public,'')),''),
          nullif(btrim(coalesce(p_webhook,'')),''), p_activo, now())
  on conflict (centro_id) do update set
    -- Un campo vacío significa "no lo toques", para poder editar sin re-pegar
    secret_key     = coalesce(nullif(btrim(coalesce(p_secret,'')),''),  public.pasarela_config.secret_key),
    public_key     = coalesce(nullif(btrim(coalesce(p_public,'')),''),  public.pasarela_config.public_key),
    webhook_secret = coalesce(nullif(btrim(coalesce(p_webhook,'')),''), public.pasarela_config.webhook_secret),
    activo         = p_activo,
    updated_at     = now();

  return json_build_object('ok', true);
end $$;
revoke all on function public.guardar_pasarela(uuid,text,text,text,boolean) from public, anon;
grant execute on function public.guardar_pasarela(uuid,text,text,text,boolean) to authenticated;

-- ── Estado de la configuración (enmascarado) ────────────────────────────────
create or replace function public.estado_pasarela(p_centro uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare c public.pasarela_config;
begin
  if not (public._caller_rol() = 'superadmin'
          or (p_centro = public._caller_centro()
              and public._caller_rol() in ('admin','admin_institucional','director','jefatura'))) then
    raise exception 'no autorizado';
  end if;

  select * into c from public.pasarela_config where centro_id = p_centro;
  if c is null then
    return json_build_object('configurada', false, 'activo', false);
  end if;
  return json_build_object(
    'configurada', c.secret_key is not null,
    'activo', c.activo and c.secret_key is not null,
    'proveedor', c.proveedor,
    'secret_pista', case when c.secret_key is null then null
                         else left(c.secret_key, 7) || '…' || right(c.secret_key, 4) end,
    'webhook_configurado', c.webhook_secret is not null,
    'actualizada', c.updated_at
  );
end $$;
revoke all on function public.estado_pasarela(uuid) from public, anon;
grant execute on function public.estado_pasarela(uuid) to authenticated;

-- ── ¿Puede esta academia cobrar online? (para pintar el botón "Pagar") ──────
--    Visible también para la familia, sin exponer ningún dato de la cuenta.
create or replace function public.pasarela_activa(p_centro uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.activo and c.secret_key is not null
      from public.pasarela_config c where c.centro_id = p_centro
  ), false)
$$;
revoke all on function public.pasarela_activa(uuid) from public;
grant execute on function public.pasarela_activa(uuid) to authenticated;
