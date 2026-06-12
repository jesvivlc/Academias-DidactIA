-- RLS — Cierre de fugas a familias, FASE 1 (tablas SIN lectura legítima de familia)
-- ───────────────────────────────────────────────────────────────────────────
-- PROBLEMA SISTÉMICO: muchas políticas usan solo `centro_id = mi_centro` para la
-- lectura. Como las cuentas `familia` tienen `centro_id`, podían leer por la API
-- REST datos sensibles de TODOS los alumnos del centro.
--
-- FASE 1: tablas que NINGUNA vista de familia consume (verificado en el JS). Se
-- restringe el acceso a staff del centro (rol <> 'familia') + superadmin. Cero
-- impacto en familias (no las usaban) y el staff conserva acceso completo.
--
-- Las tablas con lectura legítima de familia (expedientes/tramites_orientacion,
-- incidencias, feedback_familias) se tratan aparte en una fase 2 cuidada.

-- Helper de patrón: superadmin (uid histórico o rol) OR (centro propio Y no familia)

-- ── Orientación: informes psicopedagógicos ──
DROP POLICY IF EXISTS "informes_centro" ON informes_psicopedagogicos;
CREATE POLICY "informes_centro" ON informes_psicopedagogicos FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

-- ── Orientación: medidas de atención ──
DROP POLICY IF EXISTS "medidas_centro" ON medidas_atencion;
CREATE POLICY "medidas_centro" ON medidas_atencion FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

-- ── Orientación: cuestionarios docentes ──
DROP POLICY IF EXISTS "cuestionarios_centro" ON cuestionarios_docentes;
CREATE POLICY "cuestionarios_centro" ON cuestionarios_docentes FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

-- ── Orientación: alertas ──
DROP POLICY IF EXISTS "alertas_centro" ON alertas_orientacion;
CREATE POLICY "alertas_centro" ON alertas_orientacion FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

-- ── Analytics: alertas predictivas ──
DROP POLICY IF EXISTS "centro_isolation" ON alertas_predictivas;
CREATE POLICY "centro_isolation" ON alertas_predictivas FOR ALL USING (
  (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

-- ── Calidad: no conformidades (dos políticas otorgan lectura → ambas) ──
DROP POLICY IF EXISTS "nc_centro" ON no_conformidades;
CREATE POLICY "nc_centro" ON no_conformidades FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);
DROP POLICY IF EXISTS "cal_nc_read" ON no_conformidades;
CREATE POLICY "cal_nc_read" ON no_conformidades FOR SELECT USING (
  (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);

-- ── Calidad: acciones CAPA (dos políticas otorgan lectura → ambas) ──
DROP POLICY IF EXISTS "capa_centro" ON acciones_capa;
CREATE POLICY "capa_centro" ON acciones_capa FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);
DROP POLICY IF EXISTS "cal_capa_read" ON acciones_capa;
CREATE POLICY "cal_capa_read" ON acciones_capa FOR SELECT USING (
  (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
  OR (centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia')
);
