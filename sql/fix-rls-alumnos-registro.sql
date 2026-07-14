-- ════════════════════════════════════════════════════════════════════════════
-- FIX RLS (2026-07-14) — cierra dos fugas de datos detectadas en auditoría:
--
--  1) `alumnos_read` era `using (true)` (placeholder de Fase 0 que nunca se
--     endureció): CUALQUIER usuario autenticado —p.ej. una cuenta familia, o un
--     usuario de otra academia— podía leer TODAS las fichas de alumnos
--     (teléfono, email, fecha de nacimiento, NEE, RGPD…).
--  2) `centros_read` (using true) expone los códigos de registro
--     (codigo_familia/profesional/acceso) a cualquiera con la anon key.
--
-- El registro pre-login (validar código + listar alumnos para vincular hijos) y
-- la tematización por código pasan a hacerse vía RPCs SECURITY DEFINER que
-- exigen conocer un código válido y devuelven solo campos mínimos.
-- El frontend (js/auth.js) ya usa estos RPCs con fallback a las consultas
-- antiguas, por lo que este SQL puede aplicarse antes o después del deploy.
--
-- Idempotente. Aplicar en Supabase → SQL Editor (o Management API).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. RPC: validar código de registro (paso 1 del registro + tematización) ──
create or replace function public.verificar_codigo_registro(p_codigo text)
returns table(centro_id uuid, nombre text, rol text, color_primario text, logo_url text)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre,
         case when upper(coalesce(c.codigo_familia,'')) = upper(p_codigo)
              then 'familia' else 'profesional' end,
         c.color_primario, c.logo_url
  from public.centros c
  where upper(coalesce(c.codigo_familia,''))     = upper(p_codigo)
     or upper(coalesce(c.codigo_profesional,'')) = upper(p_codigo)
     or upper(coalesce(c.codigo_acceso,''))      = upper(p_codigo)
  limit 1
$$;
revoke all on function public.verificar_codigo_registro(text) from public;
grant execute on function public.verificar_codigo_registro(text) to anon, authenticated;

-- ── 2. RPC: lista mínima de alumnos para vincular en el registro (paso 2) ────
--    Solo con el código de FAMILIA del centro; devuelve id+nombre+curso de activos.
create or replace function public.alumnos_para_registro(p_codigo text)
returns table(id uuid, nombre text, curso text)
language sql stable security definer set search_path = public as $$
  select a.id, a.nombre, a.curso
  from public.alumnos a
  join public.centros c on c.id = a.centro_id
  where upper(coalesce(c.codigo_familia,'')) = upper(p_codigo)
    and coalesce(a.estado,'activo') = 'activo'
  order by a.curso, a.nombre
$$;
revoke all on function public.alumnos_para_registro(text) from public;
grant execute on function public.alumnos_para_registro(text) to anon, authenticated;

-- ── 3. Endurecer lectura de alumnos ──────────────────────────────────────────
--    Staff: solo su centro (mismo patrón que el resto de tablas de Fase 1).
--    Familia: solo sus hijos vía _mis_alumnos().
drop policy if exists alumnos_read     on public.alumnos;
drop policy if exists alumnos_fam_read on public.alumnos;

create policy alumnos_read on public.alumnos for select using (
  public._caller_rol() = 'superadmin'
  or (centro_id = public._caller_centro()
      and public._caller_rol() in
          ('admin','admin_institucional','director','jefatura','profesional','orientador'))
);

create policy alumnos_fam_read on public.alumnos for select using (
  id in (select public._mis_alumnos())
);

-- ── 4. Ocultar los códigos de registro en la lectura de centros ──────────────
--    Grants a nivel de columna: se retira SELECT de tabla y se re-otorga sobre
--    todas las columnas EXCEPTO los códigos. PostgREST expande `select=*` según
--    los grants, así que las consultas existentes del frontend siguen funcionando.
--    ⚠ Si en el futuro se añade una columna a `centros`, hay que re-otorgarle
--      SELECT (o re-ejecutar este bloque, que es idempotente).
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
  into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'centros'
    and column_name not in ('codigo_familia','codigo_profesional','codigo_acceso');

  execute 'revoke select on public.centros from anon, authenticated';
  execute format('grant select (%s) on public.centros to anon, authenticated', cols);
end $$;

-- ── Verificación rápida (opcional) ───────────────────────────────────────────
-- select policyname, qual from pg_policies where tablename = 'alumnos';
-- Como familia (JWT familia): select count(*) from alumnos;  → nº de hijos, no 42.
-- Como anon: select codigo_familia from centros;             → permission denied.
