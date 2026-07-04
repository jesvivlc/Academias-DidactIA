-- ============================================================================
-- DidactIA Academias — Portal familia: lectura de pagos y eventos
-- Idempotente. Añade políticas SELECT de familia sin tocar las de staff.
-- ============================================================================

-- Pagos de sus hijos
drop policy if exists pagos_fam_read on public.pagos;
create policy pagos_fam_read on public.pagos for select using (
  alumno_id in (select public._mis_alumnos())
);

-- Eventos del centro de sus hijos (calendario). La familia ve los eventos del
-- centro en el que tiene algún hijo matriculado.
drop policy if exists eventos_fam_read on public.eventos;
create policy eventos_fam_read on public.eventos for select using (
  exists (
    select 1 from public.alumnos a
    where a.centro_id = eventos.centro_id
      and a.id in (select public._mis_alumnos())
  )
);
