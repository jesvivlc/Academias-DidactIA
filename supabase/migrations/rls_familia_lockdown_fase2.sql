-- RLS — Cierre de fugas a familias, FASE 2 (tablas CON lectura legítima de familia)
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ PENDIENTE DE APLICAR — requiere desplegar A LA VEZ los cambios de JS que
-- acompañan (ver bloque "CAMBIOS DE JS" al final), porque las familias dejan de
-- leer estas tablas directamente y pasan a usar RPCs SECURITY DEFINER.
--
-- Motivo del enfoque RPC: la RLS es a nivel de FILA, no de COLUMNA. Si dejáramos
-- a la familia leer una fila de expedientes_orientacion o incidencias, expondría
-- por la API campos internos (notas_internas, informe_borrador, normativa_ref,
-- medidas_propuestas…). Con un RPC SECURITY DEFINER devolvemos SOLO los campos
-- permitidos y filtrados por los hijos de la familia.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXPEDIENTES_ORIENTACION → staff-only (la familia ya no lee la tabla)
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "orientacion_centro" ON expedientes_orientacion;
CREATE POLICY "orientacion_centro" ON expedientes_orientacion FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TRAMITES_ORIENTACION → staff-only en tabla; familia vía RPC
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "tramites_centro" ON tramites_orientacion;
CREATE POLICY "tramites_centro" ON tramites_orientacion FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

-- RPC: trámites VISIBLES de los hijos de la familia (solo campos no clínicos)
CREATE OR REPLACE FUNCTION familia_tramites_visibles()
  RETURNS TABLE(tipo text, estado_tramite text, descripcion text, fecha_estimada date)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT t.tipo, t.estado_tramite, t.descripcion, t.fecha_estimada
    FROM tramites_orientacion t
    JOIN expedientes_orientacion e ON e.id = t.expediente_id
    JOIN familia_alumno fa ON fa.alumno_id = e.alumno_id
    WHERE t.visible_familia = true
      AND fa.profile_id = auth.uid()
    ORDER BY t.created_at DESC;
$$;
REVOKE ALL ON FUNCTION familia_tramites_visibles() FROM public;
GRANT EXECUTE ON FUNCTION familia_tramites_visibles() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. INCIDENCIAS → staff-only en tabla; familia (solo sus hijos) vía RPC
--    (la policy original usa profiles.user_id, no profiles.id → se mantiene)
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "centro_isolation" ON incidencias;
CREATE POLICY "centro_isolation" ON incidencias FOR ALL USING (
  (SELECT rol FROM profiles WHERE user_id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE user_id = auth.uid())
      AND (SELECT rol FROM profiles WHERE user_id = auth.uid()) <> 'familia')
);

-- RPC: incidencias de los hijos de la familia (campos visibles, sin informe interno)
CREATE OR REPLACE FUNCTION familia_incidencias_hijos()
  RETURNS TABLE(fecha text, gravedad text, descripcion text, alumno_nombre text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT i.fecha::text, i.gravedad, i.descripcion, i.alumno_nombre
    FROM incidencias i
    WHERE i.alumno_nombre IN (
      SELECT a.nombre FROM alumnos a
      JOIN familia_alumno fa ON fa.alumno_id = a.id
      WHERE fa.profile_id = auth.uid()
    )
    ORDER BY i.created_at DESC;
$$;
REVOKE ALL ON FUNCTION familia_incidencias_hijos() FROM public;
GRANT EXECUTE ON FUNCTION familia_incidencias_hijos() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FEEDBACK_FAMILIAS → familia solo el SUYO (lectura y escritura)
--    Política `feedback_centro` (ALL) ya restringe bien (staff o familia_user_id
--    propio). El leak está en `cal_fb_read` (SELECT) y `cal_fb_update` (UPDATE),
--    que usan `centro_id = mi_centro` a secas → una familia leía/actualizaba el
--    feedback de otras familias. Se restringen a staff; el acceso propio de la
--    familia sigue cubierto por `feedback_centro`.
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "cal_fb_read" ON feedback_familias;
CREATE POLICY "cal_fb_read" ON feedback_familias FOR SELECT USING (
  (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR familia_user_id = auth.uid()
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

DROP POLICY IF EXISTS "cal_fb_update" ON feedback_familias;
CREATE POLICY "cal_fb_update" ON feedback_familias FOR UPDATE USING (
  (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMBIOS DE JS QUE DEBEN DESPLEGARSE A LA VEZ (no aplicar SQL sin estos):
--
-- a) js/orientacion.js → oriRenderTramitesFamilia():
--    sustituir las consultas a expedientes_orientacion + tramites_orientacion por:
--      const { data: tramites } = await sb.rpc('familia_tramites_visibles');
--    (elimina la resolución manual de alumnoIds/expIds; el RPC ya filtra por hijos)
--
-- b) js/mejoras.js → renderHomeFamilia(), bloque "Incidencias recientes":
--    sustituir  sb.from('incidencias').ilike('alumno_nombre', …)  por:
--      const r = await sb.rpc('familia_incidencias_hijos');
--      // filtrar en cliente por alumno.nombre si hay varios hijos; limit 3
-- ═══════════════════════════════════════════════════════════════════════════
