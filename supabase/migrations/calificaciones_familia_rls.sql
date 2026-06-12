-- Calificaciones — endurecer la lectura para familias (RGPD)
-- ───────────────────────────────────────────────────────────────────────────
-- PROBLEMA: la política original `cal_read` permitía a CUALQUIER usuario del
-- mismo centro leer TODAS las calificaciones (el filtro era solo `centro_id`).
-- Una cuenta `familia` tiene `centro_id`, así que podía leer por la API REST
-- las notas de todos los alumnos del centro.
--
-- ARREGLO: el staff mantiene la lectura completa de su centro; las familias
-- solo pueden leer las calificaciones de los alumnos vinculados a su cuenta
-- (`familia_alumno.profile_id = auth.uid()`). Superadmin: todo.
-- Cambio aditivo/restrictivo: NO afecta a insert/update/delete ni al staff.

DROP POLICY IF EXISTS "cal_read" ON calificaciones;

CREATE POLICY "cal_read" ON calificaciones
  FOR SELECT USING (
    -- superadmin (por uid histórico o por rol; superadmin no tiene centro_id)
    auth.uid() = '52e2d821-3b05-462b-b9e7-be2384c6cf2a'
    OR (SELECT rol FROM profiles WHERE id = auth.uid()) = 'superadmin'
    OR (
      centro_id = (SELECT centro_id FROM profiles WHERE id = auth.uid())
      AND (
        -- staff: lectura completa del centro
        (SELECT rol FROM profiles WHERE id = auth.uid()) <> 'familia'
        -- familia: solo las notas de sus hijos vinculados
        OR alumno_id IN (
          SELECT alumno_id FROM familia_alumno WHERE profile_id = auth.uid()
        )
      )
    )
  );
