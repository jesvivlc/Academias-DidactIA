-- ============================================================================
-- DidactIA Academias — Fase 3 · inc.1: RLS de FAMILIA (solo lectura)
-- Añade políticas SELECT para que una familia lea SOLO los datos de sus hijos
-- (vía familia_alumno). NO toca las políticas de staff existentes. Idempotente.
-- ============================================================================

-- Helper: ids de alumnos vinculados al usuario familia autenticado.
create or replace function public._mis_alumnos()
returns setof uuid language sql stable security definer set search_path = public as $$
  select alumno_id from public.familia_alumno where profile_id = auth.uid()
$$;
grant execute on function public._mis_alumnos() to authenticated;

-- asistencia / calificaciones / incidencias / matriculas → por alumno_id
do $$
declare t text;
begin
  foreach t in array array['asistencia','calificaciones','incidencias','matriculas']
  loop
    execute format('drop policy if exists %I_fam_read on public.%I;', t, t);
    execute format($p$
      create policy %I_fam_read on public.%I for select using (
        alumno_id in (select public._mis_alumnos())
      );$p$, t, t);
  end loop;
end $$;

-- tareas → grupos de los hijos (vía matricula_grupo/matriculas)
drop policy if exists tareas_fam_read on public.tareas;
create policy tareas_fam_read on public.tareas for select using (
  grupo_id in (
    select mg.grupo_id from public.matricula_grupo mg
    join public.matriculas m on m.id = mg.matricula_id
    where m.alumno_id in (select public._mis_alumnos())
  )
);

-- grupos / grupo_sesiones → los grupos de los hijos (para ver horario)
drop policy if exists grupos_fam_read on public.grupos;
create policy grupos_fam_read on public.grupos for select using (
  id in (
    select mg.grupo_id from public.matricula_grupo mg
    join public.matriculas m on m.id = mg.matricula_id
    where m.alumno_id in (select public._mis_alumnos())
  )
);
drop policy if exists grupo_sesiones_fam_read on public.grupo_sesiones;
create policy grupo_sesiones_fam_read on public.grupo_sesiones for select using (
  grupo_id in (
    select mg.grupo_id from public.matricula_grupo mg
    join public.matriculas m on m.id = mg.matricula_id
    where m.alumno_id in (select public._mis_alumnos())
  )
);
