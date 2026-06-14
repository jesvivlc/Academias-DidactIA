-- RLS — Cierre de fugas a familias, FASE 3
-- ───────────────────────────────────────────────────────────────────────────
-- Tablas con acceso legítimo de familia pero con política demasiado permisiva
-- (centro_id = mi_centro FOR ALL → familia puede leer TODO el centro e incluso
--  INSERT/UPDATE/DELETE por API REST directa).
--
-- TABLAS CORREGIDAS:
--   sustituciones     → familia: SELECT solo de grupos de sus hijos
--   comunicados       → familia: SELECT excluyendo destinatarios='solo_profesores'
--   salidas_didacticas → familia: SELECT solo salidas publicadas
--   participantes_salida → familia: SELECT+UPDATE solo de sus hijos
--   notificaciones_salida → staff-only (familia no la consume)
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SUSTITUCIONES
-- ═══════════════════════════════════════════════════════════════════════════
-- Familia la lee desde renderHomeFamilia bloque 0 (cambios en clase hoy del
-- grupo del hijo). No necesita ver observaciones de RRHH, pero RLS no puede
-- filtrar columnas, así que la restricción es a nivel de fila (grupo del hijo).
-- El staff necesita acceso completo (INSERT/UPDATE/DELETE).

DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies
            WHERE tablename = 'sustituciones' AND schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.sustituciones';
  END LOOP;
END $$;

-- Staff y superadmin: acceso completo
CREATE POLICY "sust_staff" ON public.sustituciones FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia'
  )
);

-- Familia: solo lectura, solo grupos de sus hijos
CREATE POLICY "sust_familia_read" ON public.sustituciones FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'familia'
  AND centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
  AND grupo_horario IN (
    SELECT a.grupo_horario
    FROM public.alumnos a
    JOIN public.familia_alumno fa ON fa.alumno_id = a.id
    WHERE fa.profile_id = auth.uid()
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. COMUNICADOS
-- ═══════════════════════════════════════════════════════════════════════════
-- Familia debe ver comunicados dirigidos a todos o a familias, y los de
-- grupo:XXXX (el JS ya filtra por grupo del hijo en cliente).
-- NO debe ver comunicados de destinatarios='solo_profesores'.
-- El admin puede leer también borradores (estado='borrador'); familia solo enviados.

DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies
            WHERE tablename = 'comunicados' AND schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.comunicados';
  END LOOP;
END $$;

-- Staff y superadmin: acceso completo
CREATE POLICY "com_staff" ON public.comunicados FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia'
  )
);

-- Familia: solo lectura, solo comunicados enviados y no exclusivos de profesores
CREATE POLICY "com_familia_read" ON public.comunicados FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'familia'
  AND centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
  AND estado = 'enviado'
  AND destinatarios <> 'solo_profesores'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SALIDAS_DIDACTICAS
-- ═══════════════════════════════════════════════════════════════════════════
-- Política original "salidas_centro" era FOR ALL con solo centro_id:
-- familia podía crear/borrar salidas por API. Se separa en staff (ALL) y
-- familia (SELECT solo publicadas).

DROP POLICY IF EXISTS "salidas_centro" ON public.salidas_didacticas;

-- Staff y superadmin: acceso completo
CREATE POLICY "salidas_staff" ON public.salidas_didacticas FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia'
  )
);

-- Familia: solo lectura de salidas publicadas de su centro
CREATE POLICY "salidas_familia_read" ON public.salidas_didacticas FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'familia'
  AND centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
  AND estado = 'publicada'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. PARTICIPANTES_SALIDA
-- ═══════════════════════════════════════════════════════════════════════════
-- Familia necesita: SELECT (ver si su hijo está autorizado) y UPDATE (autorizar).
-- NO debe ver los participantes de otros alumnos.

DROP POLICY IF EXISTS "participantes_centro" ON public.participantes_salida;

-- Staff y superadmin: acceso completo
CREATE POLICY "partic_staff" ON public.participantes_salida FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia'
  )
);

-- Familia: lectura solo de sus hijos
CREATE POLICY "partic_familia_read" ON public.participantes_salida FOR SELECT USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'familia'
  AND alumno_id IN (
    SELECT alumno_id FROM public.familia_alumno WHERE profile_id = auth.uid()
  )
);

-- Familia: actualización (autorización) solo de sus hijos
CREATE POLICY "partic_familia_update" ON public.participantes_salida FOR UPDATE USING (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'familia'
  AND alumno_id IN (
    SELECT alumno_id FROM public.familia_alumno WHERE profile_id = auth.uid()
  )
) WITH CHECK (
  (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'familia'
  AND alumno_id IN (
    SELECT alumno_id FROM public.familia_alumno WHERE profile_id = auth.uid()
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. NOTIFICACIONES_SALIDA
-- ═══════════════════════════════════════════════════════════════════════════
-- Tabla interna de log de notificaciones enviadas. Familia no la consume.

DROP POLICY IF EXISTS "notif_salidas_centro" ON public.notificaciones_salida;

CREATE POLICY "notif_salidas_staff" ON public.notificaciones_salida FOR ALL USING (
  auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
  OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  OR (
    centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia'
  )
);
