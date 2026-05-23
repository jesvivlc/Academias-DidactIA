-- ============================================================
-- DidactIA · Centro de Demostración — IES Demo
-- Ejecutar en Supabase SQL Editor con rol service_role
-- Idempotente: elimina y regenera los datos demo en cada ejecución
-- PASO PREVIO: invitar demo@didactia.eu como admin desde la app
-- ============================================================

-- Tablas IB opcionales (se crean si no existen)
CREATE TABLE IF NOT EXISTS public.cas_actividades (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id    uuid        REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id    uuid        REFERENCES public.alumnos(id) ON DELETE CASCADE,
  titulo       text        NOT NULL,
  tipo         text        NOT NULL DEFAULT 'creatividad',
  descripcion  text,
  reflexion    text,
  fecha_inicio date,
  horas        int         DEFAULT 0,
  estado       text        NOT NULL DEFAULT 'en_curso',
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.cas_actividades ENABLE ROW LEVEL SECURITY;
DO $pol1$ BEGIN
  CREATE POLICY "centro_isolation" ON public.cas_actividades FOR ALL
    USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');
EXCEPTION WHEN duplicate_object THEN NULL; END $pol1$;

CREATE TABLE IF NOT EXISTS public.extended_essay (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id            uuid        REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id            uuid        REFERENCES public.alumnos(id) ON DELETE CASCADE,
  titulo               text,
  asignatura           text,
  supervisor_nombre    text,
  estado               text        NOT NULL DEFAULT 'en_proceso',
  fecha_entrega_limite date,
  palabras_actuales    int         DEFAULT 0,
  created_at           timestamptz DEFAULT now()
);
ALTER TABLE public.extended_essay ENABLE ROW LEVEL SECURITY;
DO $pol2$ BEGIN
  CREATE POLICY "centro_isolation" ON public.extended_essay FOR ALL
    USING (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
      OR (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin');
EXCEPTION WHEN duplicate_object THEN NULL; END $pol2$;

-- ============================================================
DO $$
DECLARE
  cid uuid := 'a0eedbc0-0001-4d52-8f00-000000000001';
BEGIN

-- 1. LIMPIEZA (orden FK inverso) ─────────────────────────────
DELETE FROM public.extended_essay      WHERE centro_id = cid;
DELETE FROM public.cas_actividades     WHERE centro_id = cid;
DELETE FROM public.asistencia_comedor  WHERE centro_id = cid;
DELETE FROM public.guardias_realizadas WHERE centro_id = cid;
DELETE FROM public.sustituciones       WHERE centro_id = cid;
DELETE FROM public.ausencias_profesor  WHERE centro_id = cid;
DELETE FROM public.plazos_ib           WHERE centro_id = cid;
DELETE FROM public.incidencias         WHERE centro_id = cid;
DELETE FROM public.reservas_espacios   WHERE centro_id = cid;
DELETE FROM public.horarios_grupo      WHERE centro_id = cid;
DELETE FROM public.familia_alumno
  WHERE alumno_id IN (SELECT id FROM public.alumnos WHERE centro_id = cid);
DELETE FROM public.alumnos    WHERE centro_id = cid;
DELETE FROM public.profesores WHERE centro_id = cid;
DELETE FROM public.info_centro WHERE centro_id = cid;
DELETE FROM public.centros    WHERE id = cid;

-- 2. CENTRO ──────────────────────────────────────────────────
INSERT INTO public.centros (id, nombre, slug, color_primario, modulos_activos) VALUES
  (cid, 'IES Demo', 'ies-demo', '#0f4c81',
   ARRAY['comedor','espacios','incidencias']);

INSERT INTO public.info_centro (centro_id, nombre_config, datos, visible_para) VALUES
  (cid, 'descripcion',
   '{"texto":"IES Demo es un centro de educación secundaria y bachillerato con Programa IB autorizado. Cuenta con 450 alumnos, 45 profesores y modernas instalaciones deportivas y 3 laboratorios equipados."}',
   'todos'),
  (cid, 'calendario',
   '{"texto":"Curso 2024-2025. Evaluaciones en enero, abril y junio. Exámenes IB mayo 2025. Semana blanca: 3-7 febrero."}',
   'todos'),
  (cid, 'contacto',
   '{"texto":"Secretaría: 963 000 000. Email: secretaria@iesdemo.es. Horario: L-V 9:00-14:00."}',
   'todos');

-- 3. PROFESORES (15) ─────────────────────────────────────────
INSERT INTO public.profesores
  (id, centro_id, nombre, especialidad, departamento, activo) VALUES
  ('b1000000-0001-4000-8000-000000000001',cid,'María García López',      'Matemáticas',          'Matemáticas',    true),
  ('b1000000-0001-4000-8000-000000000002',cid,'Juan Martínez Sánchez',   'Lengua Castellana',    'Lengua',         true),
  ('b1000000-0001-4000-8000-000000000003',cid,'Ana Rodríguez Fernández', 'Inglés',               'Idiomas',        true),
  ('b1000000-0001-4000-8000-000000000004',cid,'Carlos López Martínez',   'Geografía e Historia', 'CC. Sociales',   true),
  ('b1000000-0001-4000-8000-000000000005',cid,'Laura González Pérez',    'Biología y Geología',  'CC. Naturales',  true),
  ('b1000000-0001-4000-8000-000000000006',cid,'Miguel Hernández García', 'Física y Química',     'Ciencias',       true),
  ('b1000000-0001-4000-8000-000000000007',cid,'Isabel Martín López',     'Geografía e Historia', 'CC. Sociales',   true),
  ('b1000000-0001-4000-8000-000000000008',cid,'David Sánchez Martínez',  'Educación Física',     'Ed. Física',     true),
  ('b1000000-0001-4000-8000-000000000009',cid,'Elena Díaz González',     'Música',               'Artes',          true),
  ('b1000000-0001-4000-8000-000000000010',cid,'Francisco Jiménez López', 'Tecnología',           'Tecnología',     true),
  ('b1000000-0001-4000-8000-000000000011',cid,'Carmen Moreno Sánchez',   'Filosofía',            'Filosofía',      true),
  ('b1000000-0001-4000-8000-000000000012',cid,'Javier Ruiz García',      'Economía',             'CC. Sociales',   true),
  ('b1000000-0001-4000-8000-000000000013',cid,'Pilar Álvarez Martín',    'Lengua y Literatura',  'Lengua',         true),
  ('b1000000-0001-4000-8000-000000000014',cid,'Sergio Romero Fernández', 'Matemáticas',          'Matemáticas',    true),
  ('b1000000-0001-4000-8000-000000000015',cid,'Natalia Torres Díaz',     'Biología/CC. IB',      'IB',             true);

-- 4. ALUMNOS (80 en 13 grupos) ───────────────────────────────
INSERT INTO public.alumnos (id, centro_id, nombre, curso, grupo_horario) VALUES
-- 1ESOA (7)
  (gen_random_uuid(),cid,'Ana García López',           '1ESO','1ESOA'),
  (gen_random_uuid(),cid,'Carlos Martínez Sánchez',    '1ESO','1ESOA'),
  (gen_random_uuid(),cid,'Lucía Rodríguez Fernández',  '1ESO','1ESOA'),
  (gen_random_uuid(),cid,'Pablo González Pérez',       '1ESO','1ESOA'),
  (gen_random_uuid(),cid,'Sofía López Martínez',       '1ESO','1ESOA'),
  (gen_random_uuid(),cid,'Adrián Sánchez García',      '1ESO','1ESOA'),
  (gen_random_uuid(),cid,'Marta Hernández Díaz',       '1ESO','1ESOA'),
-- 1ESOB (7)
  (gen_random_uuid(),cid,'Diego Pérez Romero',         '1ESO','1ESOB'),
  (gen_random_uuid(),cid,'Sara Jiménez Alonso',        '1ESO','1ESOB'),
  (gen_random_uuid(),cid,'Marcos Moreno Navarro',      '1ESO','1ESOB'),
  (gen_random_uuid(),cid,'Elena Torres Ruiz',          '1ESO','1ESOB'),
  (gen_random_uuid(),cid,'Hugo Castro Ortega',         '1ESO','1ESOB'),
  (gen_random_uuid(),cid,'Irene Molina Rubio',         '1ESO','1ESOB'),
  (gen_random_uuid(),cid,'Luis Domínguez Vega',        '1ESO','1ESOB'),
-- 2ESOA (7)
  (gen_random_uuid(),cid,'Raquel Medina Herrero',      '2ESO','2ESOA'),
  (gen_random_uuid(),cid,'Iván Ramos Santos',          '2ESO','2ESOA'),
  (gen_random_uuid(),cid,'Alba Lorenzo Montoya',       '2ESO','2ESOA'),
  (gen_random_uuid(),cid,'Álvaro Suárez Marín',        '2ESO','2ESOA'),
  (gen_random_uuid(),cid,'Beatriz Iglesias Núñez',     '2ESO','2ESOA'),
  (gen_random_uuid(),cid,'Nicolás Calvo Reyes',        '2ESO','2ESOA'),
  (gen_random_uuid(),cid,'Claudia Blanco Serrano',     '2ESO','2ESOA'),
-- 2ESOB (6)
  (gen_random_uuid(),cid,'Eduardo Campos Vargas',      '2ESO','2ESOB'),
  (gen_random_uuid(),cid,'Natalia Ruiz Castro',        '2ESO','2ESOB'),
  (gen_random_uuid(),cid,'Rafael García Martínez',     '2ESO','2ESOB'),
  (gen_random_uuid(),cid,'Victoria López Sánchez',     '2ESO','2ESOB'),
  (gen_random_uuid(),cid,'Tomás González Rodríguez',   '2ESO','2ESOB'),
  (gen_random_uuid(),cid,'Patricia Hernández Díaz',    '2ESO','2ESOB'),
-- 3ESOA (6)
  (gen_random_uuid(),cid,'Gabriel Pérez Romero',       '3ESO','3ESOA'),
  (gen_random_uuid(),cid,'Silvia Jiménez López',       '3ESO','3ESOA'),
  (gen_random_uuid(),cid,'Rodrigo Alonso Moreno',      '3ESO','3ESOA'),
  (gen_random_uuid(),cid,'Verónica Navarro Torres',    '3ESO','3ESOA'),
  (gen_random_uuid(),cid,'Emilio Ruiz Castro',         '3ESO','3ESOA'),
  (gen_random_uuid(),cid,'Celia Ortega Molina',        '3ESO','3ESOA'),
-- 3ESOB (6)
  (gen_random_uuid(),cid,'Ignacio Rubio Domínguez',    '3ESO','3ESOB'),
  (gen_random_uuid(),cid,'Amanda Vega Medina',         '3ESO','3ESOB'),
  (gen_random_uuid(),cid,'Felipe Herrero Ramos',       '3ESO','3ESOB'),
  (gen_random_uuid(),cid,'Miriam Santos Lorenzo',      '3ESO','3ESOB'),
  (gen_random_uuid(),cid,'Gonzalo Montoya Suárez',     '3ESO','3ESOB'),
  (gen_random_uuid(),cid,'Rebeca Marín Iglesias',      '3ESO','3ESOB'),
-- 4ESOA (6)
  (gen_random_uuid(),cid,'Andrés Núñez Calvo',         '4ESO','4ESOA'),
  (gen_random_uuid(),cid,'Teresa Reyes Blanco',        '4ESO','4ESOA'),
  (gen_random_uuid(),cid,'Manuel Serrano Campos',      '4ESO','4ESOA'),
  (gen_random_uuid(),cid,'Daniela Vargas García',      '4ESO','4ESOA'),
  (gen_random_uuid(),cid,'Antonio Martínez López',     '4ESO','4ESOA'),
  (gen_random_uuid(),cid,'Sandra Sánchez González',    '4ESO','4ESOA'),
-- 4ESOB (6)
  (gen_random_uuid(),cid,'Jorge Rodríguez Hernández',  '4ESO','4ESOB'),
  (gen_random_uuid(),cid,'Cristina Díaz Pérez',        '4ESO','4ESOB'),
  (gen_random_uuid(),cid,'Mateo Romero Jiménez',       '4ESO','4ESOB'),
  (gen_random_uuid(),cid,'Yolanda Alonso Moreno',      '4ESO','4ESOB'),
  (gen_random_uuid(),cid,'Ricardo Navarro Torres',     '4ESO','4ESOB'),
  (gen_random_uuid(),cid,'Julia Ruiz Castro',          '4ESO','4ESOB'),
-- 1BACA (7)
  (gen_random_uuid(),cid,'Enrique Ortega Molina',      '1BAC','1BACA'),
  (gen_random_uuid(),cid,'Inés Rubio Domínguez',       '1BAC','1BACA'),
  (gen_random_uuid(),cid,'Alberto Vega Medina',        '1BAC','1BACA'),
  (gen_random_uuid(),cid,'Pilar Santos Lorenzo',       '1BAC','1BACA'),
  (gen_random_uuid(),cid,'Samuel Montoya Suárez',      '1BAC','1BACA'),
  (gen_random_uuid(),cid,'Rocío Marín Iglesias',       '1BAC','1BACA'),
  (gen_random_uuid(),cid,'Víctor Núñez Calvo',         '1BAC','1BACA'),
-- 1BACB (6)
  (gen_random_uuid(),cid,'Nuria Reyes Blanco',         '1BAC','1BACB'),
  (gen_random_uuid(),cid,'Fernando Serrano Campos',    '1BAC','1BACB'),
  (gen_random_uuid(),cid,'Laura Vargas García',        '1BAC','1BACB'),
  (gen_random_uuid(),cid,'Diego Martínez López',       '1BAC','1BACB'),
  (gen_random_uuid(),cid,'Alicia Sánchez González',    '1BAC','1BACB'),
  (gen_random_uuid(),cid,'Roberto Rodríguez Hernández','1BAC','1BACB'),
-- 2BACA (6)
  (gen_random_uuid(),cid,'Elena Díaz Pérez',           '2BAC','2BACA'),
  (gen_random_uuid(),cid,'Alejandro Romero Jiménez',   '2BAC','2BACA'),
  (gen_random_uuid(),cid,'Carmen Alonso Moreno',       '2BAC','2BACA'),
  (gen_random_uuid(),cid,'Mario Navarro Torres',       '2BAC','2BACA'),
  (gen_random_uuid(),cid,'Natalia Ruiz García',        '2BAC','2BACA'),
  (gen_random_uuid(),cid,'Pedro Castro Ortega',        '2BAC','2BACA'),
-- 1IB (5)
  (gen_random_uuid(),cid,'Sophie Martínez Williams',   '1IB','1IB'),
  (gen_random_uuid(),cid,'Lucas García Chen',          '1IB','1IB'),
  (gen_random_uuid(),cid,'Emma López Müller',          '1IB','1IB'),
  (gen_random_uuid(),cid,'Noah Rodríguez Kim',         '1IB','1IB'),
  (gen_random_uuid(),cid,'Isabela González Santos',    '1IB','1IB'),
-- 2IB (5)
  (gen_random_uuid(),cid,'Olivia Sánchez Brown',       '2IB','2IB'),
  (gen_random_uuid(),cid,'Ethan Hernández Tanaka',     '2IB','2IB'),
  (gen_random_uuid(),cid,'Valeria Díaz Andersen',      '2IB','2IB'),
  (gen_random_uuid(),cid,'Leo Pérez Yamamoto',         '2IB','2IB'),
  (gen_random_uuid(),cid,'Camila Romero Silva',        '2IB','2IB');

-- 5. HORARIOS (13 grupos × 5 días × 5 tramos = 325 filas) ───
INSERT INTO public.horarios_grupo
  (centro_id,grupo_horario,dia,tramo,hora_inicio,hora_fin,actividad_nombre,profesor_nombre,aula)
VALUES
-- ── 1ESOA ──
(cid,'1ESOA','lunes',    '1','08:00','09:00','Matemáticas',          'María García López',      'A101'),
(cid,'1ESOA','lunes',    '2','09:00','10:00','Lengua Castellana',    'Juan Martínez Sánchez',   'A101'),
(cid,'1ESOA','lunes',    '3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'A101'),
(cid,'1ESOA','lunes',    '4','11:30','12:30','Geografía e Historia', 'Carlos López Martínez',   'A101'),
(cid,'1ESOA','lunes',    '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'1ESOA','martes',   '1','08:00','09:00','Ciencias Naturales',   'Laura González Pérez',    'A101'),
(cid,'1ESOA','martes',   '2','09:00','10:00','Matemáticas',          'María García López',      'A101'),
(cid,'1ESOA','martes',   '3','10:00','11:00','Tecnología',           'Francisco Jiménez López', 'Taller'),
(cid,'1ESOA','martes',   '4','11:30','12:30','Lengua Castellana',    'Juan Martínez Sánchez',   'A101'),
(cid,'1ESOA','martes',   '5','12:30','13:30','Música',               'Elena Díaz González',     'Música'),
(cid,'1ESOA','miércoles','1','08:00','09:00','Inglés',               'Ana Rodríguez Fernández', 'A101'),
(cid,'1ESOA','miércoles','2','09:00','10:00','Ciencias Naturales',   'Laura González Pérez',    'A101'),
(cid,'1ESOA','miércoles','3','10:00','11:00','Matemáticas',          'María García López',      'A101'),
(cid,'1ESOA','miércoles','4','11:30','12:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'1ESOA','miércoles','5','12:30','13:30','Lengua Castellana',    'Juan Martínez Sánchez',   'A101'),
(cid,'1ESOA','jueves',   '1','08:00','09:00','Geografía e Historia', 'Carlos López Martínez',   'A101'),
(cid,'1ESOA','jueves',   '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'A101'),
(cid,'1ESOA','jueves',   '3','10:00','11:00','Lengua Castellana',    'Juan Martínez Sánchez',   'A101'),
(cid,'1ESOA','jueves',   '4','11:30','12:30','Matemáticas',          'María García López',      'A101'),
(cid,'1ESOA','jueves',   '5','12:30','13:30','Ciencias Naturales',   'Laura González Pérez',    'A101'),
(cid,'1ESOA','viernes',  '1','08:00','09:00','Música',               'Elena Díaz González',     'Música'),
(cid,'1ESOA','viernes',  '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'A101'),
(cid,'1ESOA','viernes',  '3','10:00','11:00','Matemáticas',          'María García López',      'A101'),
(cid,'1ESOA','viernes',  '4','11:30','12:30','Lengua Castellana',    'Juan Martínez Sánchez',   'A101'),
(cid,'1ESOA','viernes',  '5','12:30','13:30','Geografía e Historia', 'Carlos López Martínez',   'A101'),
-- ── 1ESOB ──
(cid,'1ESOB','lunes',    '1','08:00','09:00','Ciencias Naturales',   'Laura González Pérez',    'A102'),
(cid,'1ESOB','lunes',    '2','09:00','10:00','Matemáticas',          'María García López',      'A102'),
(cid,'1ESOB','lunes',    '3','10:00','11:00','Tecnología',           'Francisco Jiménez López', 'Taller'),
(cid,'1ESOB','lunes',    '4','11:30','12:30','Lengua Castellana',    'Juan Martínez Sánchez',   'A102'),
(cid,'1ESOB','lunes',    '5','12:30','13:30','Música',               'Elena Díaz González',     'Música'),
(cid,'1ESOB','martes',   '1','08:00','09:00','Matemáticas',          'María García López',      'A102'),
(cid,'1ESOB','martes',   '2','09:00','10:00','Lengua Castellana',    'Juan Martínez Sánchez',   'A102'),
(cid,'1ESOB','martes',   '3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'A102'),
(cid,'1ESOB','martes',   '4','11:30','12:30','Geografía e Historia', 'Carlos López Martínez',   'A102'),
(cid,'1ESOB','martes',   '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'1ESOB','miércoles','1','08:00','09:00','Geografía e Historia', 'Carlos López Martínez',   'A102'),
(cid,'1ESOB','miércoles','2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'A102'),
(cid,'1ESOB','miércoles','3','10:00','11:00','Lengua Castellana',    'Juan Martínez Sánchez',   'A102'),
(cid,'1ESOB','miércoles','4','11:30','12:30','Matemáticas',          'María García López',      'A102'),
(cid,'1ESOB','miércoles','5','12:30','13:30','Ciencias Naturales',   'Laura González Pérez',    'A102'),
(cid,'1ESOB','jueves',   '1','08:00','09:00','Música',               'Elena Díaz González',     'Música'),
(cid,'1ESOB','jueves',   '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'A102'),
(cid,'1ESOB','jueves',   '3','10:00','11:00','Matemáticas',          'María García López',      'A102'),
(cid,'1ESOB','jueves',   '4','11:30','12:30','Lengua Castellana',    'Juan Martínez Sánchez',   'A102'),
(cid,'1ESOB','jueves',   '5','12:30','13:30','Geografía e Historia', 'Carlos López Martínez',   'A102'),
(cid,'1ESOB','viernes',  '1','08:00','09:00','Inglés',               'Ana Rodríguez Fernández', 'A102'),
(cid,'1ESOB','viernes',  '2','09:00','10:00','Ciencias Naturales',   'Laura González Pérez',    'A102'),
(cid,'1ESOB','viernes',  '3','10:00','11:00','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'1ESOB','viernes',  '4','11:30','12:30','Matemáticas',          'María García López',      'A102'),
(cid,'1ESOB','viernes',  '5','12:30','13:30','Tecnología',           'Francisco Jiménez López', 'Taller'),
-- ── 2ESOA ──
(cid,'2ESOA','lunes',    '1','08:00','09:00','Matemáticas',          'María García López',      'A103'),
(cid,'2ESOA','lunes',    '2','09:00','10:00','Lengua Castellana',    'Juan Martínez Sánchez',   'A103'),
(cid,'2ESOA','lunes',    '3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'A103'),
(cid,'2ESOA','lunes',    '4','11:30','12:30','Ciencias Naturales',   'Laura González Pérez',    'A103'),
(cid,'2ESOA','lunes',    '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'2ESOA','martes',   '1','08:00','09:00','Geografía e Historia', 'Carlos López Martínez',   'A103'),
(cid,'2ESOA','martes',   '2','09:00','10:00','Matemáticas',          'María García López',      'A103'),
(cid,'2ESOA','martes',   '3','10:00','11:00','Lengua Castellana',    'Juan Martínez Sánchez',   'A103'),
(cid,'2ESOA','martes',   '4','11:30','12:30','Tecnología',           'Francisco Jiménez López', 'Taller'),
(cid,'2ESOA','martes',   '5','12:30','13:30','Música',               'Elena Díaz González',     'Música'),
(cid,'2ESOA','miércoles','1','08:00','09:00','Inglés',               'Ana Rodríguez Fernández', 'A103'),
(cid,'2ESOA','miércoles','2','09:00','10:00','Matemáticas',          'María García López',      'A103'),
(cid,'2ESOA','miércoles','3','10:00','11:00','Ciencias Naturales',   'Laura González Pérez',    'A103'),
(cid,'2ESOA','miércoles','4','11:30','12:30','Lengua Castellana',    'Juan Martínez Sánchez',   'A103'),
(cid,'2ESOA','miércoles','5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'2ESOA','jueves',   '1','08:00','09:00','Ciencias Naturales',   'Laura González Pérez',    'A103'),
(cid,'2ESOA','jueves',   '2','09:00','10:00','Geografía e Historia', 'Carlos López Martínez',   'A103'),
(cid,'2ESOA','jueves',   '3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'A103'),
(cid,'2ESOA','jueves',   '4','11:30','12:30','Matemáticas',          'María García López',      'A103'),
(cid,'2ESOA','jueves',   '5','12:30','13:30','Lengua Castellana',    'Juan Martínez Sánchez',   'A103'),
(cid,'2ESOA','viernes',  '1','08:00','09:00','Música',               'Elena Díaz González',     'Música'),
(cid,'2ESOA','viernes',  '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'A103'),
(cid,'2ESOA','viernes',  '3','10:00','11:00','Geografía e Historia', 'Carlos López Martínez',   'A103'),
(cid,'2ESOA','viernes',  '4','11:30','12:30','Ciencias Naturales',   'Laura González Pérez',    'A103'),
(cid,'2ESOA','viernes',  '5','12:30','13:30','Matemáticas',          'María García López',      'A103'),
-- ── 2ESOB ──
(cid,'2ESOB','lunes',    '1','08:00','09:00','Geografía e Historia', 'Carlos López Martínez',   'A104'),
(cid,'2ESOB','lunes',    '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'A104'),
(cid,'2ESOB','lunes',    '3','10:00','11:00','Matemáticas',          'María García López',      'A104'),
(cid,'2ESOB','lunes',    '4','11:30','12:30','Lengua Castellana',    'Juan Martínez Sánchez',   'A104'),
(cid,'2ESOB','lunes',    '5','12:30','13:30','Música',               'Elena Díaz González',     'Música'),
(cid,'2ESOB','martes',   '1','08:00','09:00','Ciencias Naturales',   'Laura González Pérez',    'A104'),
(cid,'2ESOB','martes',   '2','09:00','10:00','Matemáticas',          'María García López',      'A104'),
(cid,'2ESOB','martes',   '3','10:00','11:00','Tecnología',           'Francisco Jiménez López', 'Taller'),
(cid,'2ESOB','martes',   '4','11:30','12:30','Inglés',               'Ana Rodríguez Fernández', 'A104'),
(cid,'2ESOB','martes',   '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'2ESOB','miércoles','1','08:00','09:00','Matemáticas',          'María García López',      'A104'),
(cid,'2ESOB','miércoles','2','09:00','10:00','Lengua Castellana',    'Juan Martínez Sánchez',   'A104'),
(cid,'2ESOB','miércoles','3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'A104'),
(cid,'2ESOB','miércoles','4','11:30','12:30','Geografía e Historia', 'Carlos López Martínez',   'A104'),
(cid,'2ESOB','miércoles','5','12:30','13:30','Ciencias Naturales',   'Laura González Pérez',    'A104'),
(cid,'2ESOB','jueves',   '1','08:00','09:00','Lengua Castellana',    'Juan Martínez Sánchez',   'A104'),
(cid,'2ESOB','jueves',   '2','09:00','10:00','Ciencias Naturales',   'Laura González Pérez',    'A104'),
(cid,'2ESOB','jueves',   '3','10:00','11:00','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'2ESOB','jueves',   '4','11:30','12:30','Matemáticas',          'María García López',      'A104'),
(cid,'2ESOB','jueves',   '5','12:30','13:30','Tecnología',           'Francisco Jiménez López', 'Taller'),
(cid,'2ESOB','viernes',  '1','08:00','09:00','Inglés',               'Ana Rodríguez Fernández', 'A104'),
(cid,'2ESOB','viernes',  '2','09:00','10:00','Geografía e Historia', 'Carlos López Martínez',   'A104'),
(cid,'2ESOB','viernes',  '3','10:00','11:00','Lengua Castellana',    'Juan Martínez Sánchez',   'A104'),
(cid,'2ESOB','viernes',  '4','11:30','12:30','Música',               'Elena Díaz González',     'Música'),
(cid,'2ESOB','viernes',  '5','12:30','13:30','Matemáticas',          'María García López',      'A104'),
-- ── 3ESOA ──
(cid,'3ESOA','lunes',    '1','08:00','09:00','Matemáticas',          'Sergio Romero Fernández', 'B101'),
(cid,'3ESOA','lunes',    '2','09:00','10:00','Lengua Castellana',    'Pilar Álvarez Martín',    'B101'),
(cid,'3ESOA','lunes',    '3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'B101'),
(cid,'3ESOA','lunes',    '4','11:30','12:30','Geografía e Historia', 'Isabel Martín López',     'B101'),
(cid,'3ESOA','lunes',    '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'3ESOA','martes',   '1','08:00','09:00','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'3ESOA','martes',   '2','09:00','10:00','Matemáticas',          'Sergio Romero Fernández', 'B101'),
(cid,'3ESOA','martes',   '3','10:00','11:00','Tecnología',           'Francisco Jiménez López', 'Taller'),
(cid,'3ESOA','martes',   '4','11:30','12:30','Lengua Castellana',    'Pilar Álvarez Martín',    'B101'),
(cid,'3ESOA','martes',   '5','12:30','13:30','Biología y Geología',  'Laura González Pérez',    'Lab2'),
(cid,'3ESOA','miércoles','1','08:00','09:00','Inglés',               'Ana Rodríguez Fernández', 'B101'),
(cid,'3ESOA','miércoles','2','09:00','10:00','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'3ESOA','miércoles','3','10:00','11:00','Matemáticas',          'Sergio Romero Fernández', 'B101'),
(cid,'3ESOA','miércoles','4','11:30','12:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'3ESOA','miércoles','5','12:30','13:30','Lengua Castellana',    'Pilar Álvarez Martín',    'B101'),
(cid,'3ESOA','jueves',   '1','08:00','09:00','Geografía e Historia', 'Isabel Martín López',     'B101'),
(cid,'3ESOA','jueves',   '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'B101'),
(cid,'3ESOA','jueves',   '3','10:00','11:00','Lengua Castellana',    'Pilar Álvarez Martín',    'B101'),
(cid,'3ESOA','jueves',   '4','11:30','12:30','Matemáticas',          'Sergio Romero Fernández', 'B101'),
(cid,'3ESOA','jueves',   '5','12:30','13:30','Biología y Geología',  'Laura González Pérez',    'Lab2'),
(cid,'3ESOA','viernes',  '1','08:00','09:00','Biología y Geología',  'Laura González Pérez',    'Lab2'),
(cid,'3ESOA','viernes',  '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'B101'),
(cid,'3ESOA','viernes',  '3','10:00','11:00','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'3ESOA','viernes',  '4','11:30','12:30','Lengua Castellana',    'Pilar Álvarez Martín',    'B101'),
(cid,'3ESOA','viernes',  '5','12:30','13:30','Geografía e Historia', 'Isabel Martín López',     'B101'),
-- ── 3ESOB ──
(cid,'3ESOB','lunes',    '1','08:00','09:00','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'3ESOB','lunes',    '2','09:00','10:00','Matemáticas',          'Sergio Romero Fernández', 'B102'),
(cid,'3ESOB','lunes',    '3','10:00','11:00','Lengua Castellana',    'Pilar Álvarez Martín',    'B102'),
(cid,'3ESOB','lunes',    '4','11:30','12:30','Inglés',               'Ana Rodríguez Fernández', 'B102'),
(cid,'3ESOB','lunes',    '5','12:30','13:30','Biología y Geología',  'Laura González Pérez',    'Lab2'),
(cid,'3ESOB','martes',   '1','08:00','09:00','Geografía e Historia', 'Isabel Martín López',     'B102'),
(cid,'3ESOB','martes',   '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'B102'),
(cid,'3ESOB','martes',   '3','10:00','11:00','Matemáticas',          'Sergio Romero Fernández', 'B102'),
(cid,'3ESOB','martes',   '4','11:30','12:30','Lengua Castellana',    'Pilar Álvarez Martín',    'B102'),
(cid,'3ESOB','martes',   '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'3ESOB','miércoles','1','08:00','09:00','Matemáticas',          'Sergio Romero Fernández', 'B102'),
(cid,'3ESOB','miércoles','2','09:00','10:00','Biología y Geología',  'Laura González Pérez',    'Lab2'),
(cid,'3ESOB','miércoles','3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'B102'),
(cid,'3ESOB','miércoles','4','11:30','12:30','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'3ESOB','miércoles','5','12:30','13:30','Lengua Castellana',    'Pilar Álvarez Martín',    'B102'),
(cid,'3ESOB','jueves',   '1','08:00','09:00','Lengua Castellana',    'Pilar Álvarez Martín',    'B102'),
(cid,'3ESOB','jueves',   '2','09:00','10:00','Geografía e Historia', 'Isabel Martín López',     'B102'),
(cid,'3ESOB','jueves',   '3','10:00','11:00','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'3ESOB','jueves',   '4','11:30','12:30','Inglés',               'Ana Rodríguez Fernández', 'B102'),
(cid,'3ESOB','jueves',   '5','12:30','13:30','Tecnología',           'Francisco Jiménez López', 'Taller'),
(cid,'3ESOB','viernes',  '1','08:00','09:00','Inglés',               'Ana Rodríguez Fernández', 'B102'),
(cid,'3ESOB','viernes',  '2','09:00','10:00','Matemáticas',          'Sergio Romero Fernández', 'B102'),
(cid,'3ESOB','viernes',  '3','10:00','11:00','Geografía e Historia', 'Isabel Martín López',     'B102'),
(cid,'3ESOB','viernes',  '4','11:30','12:30','Biología y Geología',  'Laura González Pérez',    'Lab2'),
(cid,'3ESOB','viernes',  '5','12:30','13:30','Física y Química',     'Miguel Hernández García', 'Lab1'),
-- ── 4ESOA ──
(cid,'4ESOA','lunes',    '1','08:00','09:00','Matemáticas',          'Sergio Romero Fernández', 'B103'),
(cid,'4ESOA','lunes',    '2','09:00','10:00','Lengua Castellana',    'Pilar Álvarez Martín',    'B103'),
(cid,'4ESOA','lunes',    '3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'B103'),
(cid,'4ESOA','lunes',    '4','11:30','12:30','Historia de España',   'Isabel Martín López',     'B103'),
(cid,'4ESOA','lunes',    '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'4ESOA','martes',   '1','08:00','09:00','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'4ESOA','martes',   '2','09:00','10:00','Matemáticas',          'Sergio Romero Fernández', 'B103'),
(cid,'4ESOA','martes',   '3','10:00','11:00','Economía',             'Javier Ruiz García',      'B103'),
(cid,'4ESOA','martes',   '4','11:30','12:30','Lengua Castellana',    'Pilar Álvarez Martín',    'B103'),
(cid,'4ESOA','martes',   '5','12:30','13:30','Filosofía',            'Carmen Moreno Sánchez',   'B103'),
(cid,'4ESOA','miércoles','1','08:00','09:00','Inglés',               'Ana Rodríguez Fernández', 'B103'),
(cid,'4ESOA','miércoles','2','09:00','10:00','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'4ESOA','miércoles','3','10:00','11:00','Matemáticas',          'Sergio Romero Fernández', 'B103'),
(cid,'4ESOA','miércoles','4','11:30','12:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'4ESOA','miércoles','5','12:30','13:30','Lengua Castellana',    'Pilar Álvarez Martín',    'B103'),
(cid,'4ESOA','jueves',   '1','08:00','09:00','Historia de España',   'Isabel Martín López',     'B103'),
(cid,'4ESOA','jueves',   '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'B103'),
(cid,'4ESOA','jueves',   '3','10:00','11:00','Lengua Castellana',    'Pilar Álvarez Martín',    'B103'),
(cid,'4ESOA','jueves',   '4','11:30','12:30','Matemáticas',          'Sergio Romero Fernández', 'B103'),
(cid,'4ESOA','jueves',   '5','12:30','13:30','Economía',             'Javier Ruiz García',      'B103'),
(cid,'4ESOA','viernes',  '1','08:00','09:00','Filosofía',            'Carmen Moreno Sánchez',   'B103'),
(cid,'4ESOA','viernes',  '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'B103'),
(cid,'4ESOA','viernes',  '3','10:00','11:00','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'4ESOA','viernes',  '4','11:30','12:30','Lengua Castellana',    'Pilar Álvarez Martín',    'B103'),
(cid,'4ESOA','viernes',  '5','12:30','13:30','Historia de España',   'Isabel Martín López',     'B103'),
-- ── 4ESOB ──
(cid,'4ESOB','lunes',    '1','08:00','09:00','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'4ESOB','lunes',    '2','09:00','10:00','Matemáticas',          'Sergio Romero Fernández', 'B104'),
(cid,'4ESOB','lunes',    '3','10:00','11:00','Filosofía',            'Carmen Moreno Sánchez',   'B104'),
(cid,'4ESOB','lunes',    '4','11:30','12:30','Inglés',               'Ana Rodríguez Fernández', 'B104'),
(cid,'4ESOB','lunes',    '5','12:30','13:30','Historia de España',   'Isabel Martín López',     'B104'),
(cid,'4ESOB','martes',   '1','08:00','09:00','Lengua Castellana',    'Pilar Álvarez Martín',    'B104'),
(cid,'4ESOB','martes',   '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'B104'),
(cid,'4ESOB','martes',   '3','10:00','11:00','Matemáticas',          'Sergio Romero Fernández', 'B104'),
(cid,'4ESOB','martes',   '4','11:30','12:30','Economía',             'Javier Ruiz García',      'B104'),
(cid,'4ESOB','martes',   '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'4ESOB','miércoles','1','08:00','09:00','Historia de España',   'Isabel Martín López',     'B104'),
(cid,'4ESOB','miércoles','2','09:00','10:00','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'4ESOB','miércoles','3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'B104'),
(cid,'4ESOB','miércoles','4','11:30','12:30','Matemáticas',          'Sergio Romero Fernández', 'B104'),
(cid,'4ESOB','miércoles','5','12:30','13:30','Lengua Castellana',    'Pilar Álvarez Martín',    'B104'),
(cid,'4ESOB','jueves',   '1','08:00','09:00','Economía',             'Javier Ruiz García',      'B104'),
(cid,'4ESOB','jueves',   '2','09:00','10:00','Lengua Castellana',    'Pilar Álvarez Martín',    'B104'),
(cid,'4ESOB','jueves',   '3','10:00','11:00','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'4ESOB','jueves',   '4','11:30','12:30','Inglés',               'Ana Rodríguez Fernández', 'B104'),
(cid,'4ESOB','jueves',   '5','12:30','13:30','Física y Química',     'Miguel Hernández García', 'Lab1'),
(cid,'4ESOB','viernes',  '1','08:00','09:00','Matemáticas',          'Sergio Romero Fernández', 'B104'),
(cid,'4ESOB','viernes',  '2','09:00','10:00','Historia de España',   'Isabel Martín López',     'B104'),
(cid,'4ESOB','viernes',  '3','10:00','11:00','Lengua Castellana',    'Pilar Álvarez Martín',    'B104'),
(cid,'4ESOB','viernes',  '4','11:30','12:30','Filosofía',            'Carmen Moreno Sánchez',   'B104'),
(cid,'4ESOB','viernes',  '5','12:30','13:30','Inglés',               'Ana Rodríguez Fernández', 'B104'),
-- ── 1BACA ──
(cid,'1BACA','lunes',    '1','08:00','09:00','Matemáticas',          'María García López',      'C101'),
(cid,'1BACA','lunes',    '2','09:00','10:00','Lengua y Literatura',  'Pilar Álvarez Martín',    'C101'),
(cid,'1BACA','lunes',    '3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'C101'),
(cid,'1BACA','lunes',    '4','11:30','12:30','Historia de España',   'Carlos López Martínez',   'C101'),
(cid,'1BACA','lunes',    '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'1BACA','martes',   '1','08:00','09:00','Física',               'Miguel Hernández García', 'Lab1'),
(cid,'1BACA','martes',   '2','09:00','10:00','Matemáticas',          'María García López',      'C101'),
(cid,'1BACA','martes',   '3','10:00','11:00','Economía',             'Javier Ruiz García',      'C101'),
(cid,'1BACA','martes',   '4','11:30','12:30','Lengua y Literatura',  'Pilar Álvarez Martín',    'C101'),
(cid,'1BACA','martes',   '5','12:30','13:30','Filosofía',            'Carmen Moreno Sánchez',   'C101'),
(cid,'1BACA','miércoles','1','08:00','09:00','Inglés',               'Ana Rodríguez Fernández', 'C101'),
(cid,'1BACA','miércoles','2','09:00','10:00','Física',               'Miguel Hernández García', 'Lab1'),
(cid,'1BACA','miércoles','3','10:00','11:00','Matemáticas',          'María García López',      'C101'),
(cid,'1BACA','miércoles','4','11:30','12:30','Historia de España',   'Carlos López Martínez',   'C101'),
(cid,'1BACA','miércoles','5','12:30','13:30','Lengua y Literatura',  'Pilar Álvarez Martín',    'C101'),
(cid,'1BACA','jueves',   '1','08:00','09:00','Historia de España',   'Carlos López Martínez',   'C101'),
(cid,'1BACA','jueves',   '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'C101'),
(cid,'1BACA','jueves',   '3','10:00','11:00','Lengua y Literatura',  'Pilar Álvarez Martín',    'C101'),
(cid,'1BACA','jueves',   '4','11:30','12:30','Matemáticas',          'María García López',      'C101'),
(cid,'1BACA','jueves',   '5','12:30','13:30','Economía',             'Javier Ruiz García',      'C101'),
(cid,'1BACA','viernes',  '1','08:00','09:00','Filosofía',            'Carmen Moreno Sánchez',   'C101'),
(cid,'1BACA','viernes',  '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'C101'),
(cid,'1BACA','viernes',  '3','10:00','11:00','Física',               'Miguel Hernández García', 'Lab1'),
(cid,'1BACA','viernes',  '4','11:30','12:30','Lengua y Literatura',  'Pilar Álvarez Martín',    'C101'),
(cid,'1BACA','viernes',  '5','12:30','13:30','Historia de España',   'Carlos López Martínez',   'C101'),
-- ── 1BACB ──
(cid,'1BACB','lunes',    '1','08:00','09:00','Física',               'Miguel Hernández García', 'Lab1'),
(cid,'1BACB','lunes',    '2','09:00','10:00','Matemáticas',          'María García López',      'C102'),
(cid,'1BACB','lunes',    '3','10:00','11:00','Filosofía',            'Carmen Moreno Sánchez',   'C102'),
(cid,'1BACB','lunes',    '4','11:30','12:30','Inglés',               'Ana Rodríguez Fernández', 'C102'),
(cid,'1BACB','lunes',    '5','12:30','13:30','Historia de España',   'Carlos López Martínez',   'C102'),
(cid,'1BACB','martes',   '1','08:00','09:00','Lengua y Literatura',  'Pilar Álvarez Martín',    'C102'),
(cid,'1BACB','martes',   '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'C102'),
(cid,'1BACB','martes',   '3','10:00','11:00','Matemáticas',          'María García López',      'C102'),
(cid,'1BACB','martes',   '4','11:30','12:30','Economía',             'Javier Ruiz García',      'C102'),
(cid,'1BACB','martes',   '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'1BACB','miércoles','1','08:00','09:00','Historia de España',   'Carlos López Martínez',   'C102'),
(cid,'1BACB','miércoles','2','09:00','10:00','Física',               'Miguel Hernández García', 'Lab1'),
(cid,'1BACB','miércoles','3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'C102'),
(cid,'1BACB','miércoles','4','11:30','12:30','Matemáticas',          'María García López',      'C102'),
(cid,'1BACB','miércoles','5','12:30','13:30','Lengua y Literatura',  'Pilar Álvarez Martín',    'C102'),
(cid,'1BACB','jueves',   '1','08:00','09:00','Economía',             'Javier Ruiz García',      'C102'),
(cid,'1BACB','jueves',   '2','09:00','10:00','Lengua y Literatura',  'Pilar Álvarez Martín',    'C102'),
(cid,'1BACB','jueves',   '3','10:00','11:00','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'1BACB','jueves',   '4','11:30','12:30','Inglés',               'Ana Rodríguez Fernández', 'C102'),
(cid,'1BACB','jueves',   '5','12:30','13:30','Física',               'Miguel Hernández García', 'Lab1'),
(cid,'1BACB','viernes',  '1','08:00','09:00','Matemáticas',          'María García López',      'C102'),
(cid,'1BACB','viernes',  '2','09:00','10:00','Historia de España',   'Carlos López Martínez',   'C102'),
(cid,'1BACB','viernes',  '3','10:00','11:00','Lengua y Literatura',  'Pilar Álvarez Martín',    'C102'),
(cid,'1BACB','viernes',  '4','11:30','12:30','Filosofía',            'Carmen Moreno Sánchez',   'C102'),
(cid,'1BACB','viernes',  '5','12:30','13:30','Inglés',               'Ana Rodríguez Fernández', 'C102'),
-- ── 2BACA ──
(cid,'2BACA','lunes',    '1','08:00','09:00','Matemáticas',          'Sergio Romero Fernández', 'C103'),
(cid,'2BACA','lunes',    '2','09:00','10:00','Lengua y Literatura',  'Pilar Álvarez Martín',    'C103'),
(cid,'2BACA','lunes',    '3','10:00','11:00','Inglés',               'Ana Rodríguez Fernández', 'C103'),
(cid,'2BACA','lunes',    '4','11:30','12:30','Historia de España',   'Carlos López Martínez',   'C103'),
(cid,'2BACA','lunes',    '5','12:30','13:30','Educación Física',     'David Sánchez Martínez',  'Gimnasio'),
(cid,'2BACA','martes',   '1','08:00','09:00','Física',               'Miguel Hernández García', 'Lab1'),
(cid,'2BACA','martes',   '2','09:00','10:00','Matemáticas',          'Sergio Romero Fernández', 'C103'),
(cid,'2BACA','martes',   '3','10:00','11:00','Economía',             'Javier Ruiz García',      'C103'),
(cid,'2BACA','martes',   '4','11:30','12:30','Lengua y Literatura',  'Pilar Álvarez Martín',    'C103'),
(cid,'2BACA','martes',   '5','12:30','13:30','Literatura Universal', 'Pilar Álvarez Martín',    'C103'),
(cid,'2BACA','miércoles','1','08:00','09:00','Inglés',               'Ana Rodríguez Fernández', 'C103'),
(cid,'2BACA','miércoles','2','09:00','10:00','Física',               'Miguel Hernández García', 'Lab1'),
(cid,'2BACA','miércoles','3','10:00','11:00','Matemáticas',          'Sergio Romero Fernández', 'C103'),
(cid,'2BACA','miércoles','4','11:30','12:30','Historia de España',   'Carlos López Martínez',   'C103'),
(cid,'2BACA','miércoles','5','12:30','13:30','Lengua y Literatura',  'Pilar Álvarez Martín',    'C103'),
(cid,'2BACA','jueves',   '1','08:00','09:00','Historia de España',   'Carlos López Martínez',   'C103'),
(cid,'2BACA','jueves',   '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'C103'),
(cid,'2BACA','jueves',   '3','10:00','11:00','Lengua y Literatura',  'Pilar Álvarez Martín',    'C103'),
(cid,'2BACA','jueves',   '4','11:30','12:30','Matemáticas',          'Sergio Romero Fernández', 'C103'),
(cid,'2BACA','jueves',   '5','12:30','13:30','Economía',             'Javier Ruiz García',      'C103'),
(cid,'2BACA','viernes',  '1','08:00','09:00','Literatura Universal', 'Pilar Álvarez Martín',    'C103'),
(cid,'2BACA','viernes',  '2','09:00','10:00','Inglés',               'Ana Rodríguez Fernández', 'C103'),
(cid,'2BACA','viernes',  '3','10:00','11:00','Física',               'Miguel Hernández García', 'Lab1'),
(cid,'2BACA','viernes',  '4','11:30','12:30','Lengua y Literatura',  'Pilar Álvarez Martín',    'C103'),
(cid,'2BACA','viernes',  '5','12:30','13:30','Historia de España',   'Carlos López Martínez',   'C103'),
-- ── 1IB ──
(cid,'1IB','lunes',    '1','08:00','09:00','Mathematics AA HL',    'Sergio Romero Fernández', 'IB01'),
(cid,'1IB','lunes',    '2','09:00','10:00','Spanish A HL',         'Pilar Álvarez Martín',    'IB01'),
(cid,'1IB','lunes',    '3','10:00','11:00','English A HL',         'Ana Rodríguez Fernández', 'IB01'),
(cid,'1IB','lunes',    '4','11:30','12:30','Physics HL',           'Miguel Hernández García', 'Lab1'),
(cid,'1IB','lunes',    '5','12:30','13:30','History SL',           'Carlos López Martínez',   'IB01'),
(cid,'1IB','martes',   '1','08:00','09:00','Chemistry SL',         'Natalia Torres Díaz',     'Lab2'),
(cid,'1IB','martes',   '2','09:00','10:00','Mathematics AA HL',    'Sergio Romero Fernández', 'IB01'),
(cid,'1IB','martes',   '3','10:00','11:00','TOK',                  'Natalia Torres Díaz',     'IB01'),
(cid,'1IB','martes',   '4','11:30','12:30','Spanish A HL',         'Pilar Álvarez Martín',    'IB01'),
(cid,'1IB','martes',   '5','12:30','13:30','Physics HL',           'Miguel Hernández García', 'Lab1'),
(cid,'1IB','miércoles','1','08:00','09:00','English A HL',         'Ana Rodríguez Fernández', 'IB01'),
(cid,'1IB','miércoles','2','09:00','10:00','Chemistry SL',         'Natalia Torres Díaz',     'Lab2'),
(cid,'1IB','miércoles','3','10:00','11:00','Mathematics AA HL',    'Sergio Romero Fernández', 'IB01'),
(cid,'1IB','miércoles','4','11:30','12:30','History SL',           'Carlos López Martínez',   'IB01'),
(cid,'1IB','miércoles','5','12:30','13:30','Spanish A HL',         'Pilar Álvarez Martín',    'IB01'),
(cid,'1IB','jueves',   '1','08:00','09:00','Physics HL',           'Miguel Hernández García', 'Lab1'),
(cid,'1IB','jueves',   '2','09:00','10:00','English A HL',         'Ana Rodríguez Fernández', 'IB01'),
(cid,'1IB','jueves',   '3','10:00','11:00','Spanish A HL',         'Pilar Álvarez Martín',    'IB01'),
(cid,'1IB','jueves',   '4','11:30','12:30','Mathematics AA HL',    'Sergio Romero Fernández', 'IB01'),
(cid,'1IB','jueves',   '5','12:30','13:30','History SL',           'Carlos López Martínez',   'IB01'),
(cid,'1IB','viernes',  '1','08:00','09:00','TOK',                  'Natalia Torres Díaz',     'IB01'),
(cid,'1IB','viernes',  '2','09:00','10:00','Physics HL',           'Miguel Hernández García', 'Lab1'),
(cid,'1IB','viernes',  '3','10:00','11:00','English A HL',         'Ana Rodríguez Fernández', 'IB01'),
(cid,'1IB','viernes',  '4','11:30','12:30','Mathematics AA HL',    'Sergio Romero Fernández', 'IB01'),
(cid,'1IB','viernes',  '5','12:30','13:30','History SL',           'Carlos López Martínez',   'IB01'),
-- ── 2IB ──
(cid,'2IB','lunes',    '1','08:00','09:00','Mathematics AA HL',    'Sergio Romero Fernández', 'IB02'),
(cid,'2IB','lunes',    '2','09:00','10:00','English A HL',         'Ana Rodríguez Fernández', 'IB02'),
(cid,'2IB','lunes',    '3','10:00','11:00','Spanish A HL',         'Pilar Álvarez Martín',    'IB02'),
(cid,'2IB','lunes',    '4','11:30','12:30','History SL',           'Carlos López Martínez',   'IB02'),
(cid,'2IB','lunes',    '5','12:30','13:30','Physics HL',           'Miguel Hernández García', 'Lab1'),
(cid,'2IB','martes',   '1','08:00','09:00','Spanish A HL',         'Pilar Álvarez Martín',    'IB02'),
(cid,'2IB','martes',   '2','09:00','10:00','Mathematics AA HL',    'Sergio Romero Fernández', 'IB02'),
(cid,'2IB','martes',   '3','10:00','11:00','Chemistry SL',         'Natalia Torres Díaz',     'Lab2'),
(cid,'2IB','martes',   '4','11:30','12:30','English A HL',         'Ana Rodríguez Fernández', 'IB02'),
(cid,'2IB','martes',   '5','12:30','13:30','TOK',                  'Natalia Torres Díaz',     'IB02'),
(cid,'2IB','miércoles','1','08:00','09:00','Physics HL',           'Miguel Hernández García', 'Lab1'),
(cid,'2IB','miércoles','2','09:00','10:00','Spanish A HL',         'Pilar Álvarez Martín',    'IB02'),
(cid,'2IB','miércoles','3','10:00','11:00','Mathematics AA HL',    'Sergio Romero Fernández', 'IB02'),
(cid,'2IB','miércoles','4','11:30','12:30','English A HL',         'Ana Rodríguez Fernández', 'IB02'),
(cid,'2IB','miércoles','5','12:30','13:30','Chemistry SL',         'Natalia Torres Díaz',     'Lab2'),
(cid,'2IB','jueves',   '1','08:00','09:00','History SL',           'Carlos López Martínez',   'IB02'),
(cid,'2IB','jueves',   '2','09:00','10:00','Physics HL',           'Miguel Hernández García', 'Lab1'),
(cid,'2IB','jueves',   '3','10:00','11:00','English A HL',         'Ana Rodríguez Fernández', 'IB02'),
(cid,'2IB','jueves',   '4','11:30','12:30','Spanish A HL',         'Pilar Álvarez Martín',    'IB02'),
(cid,'2IB','jueves',   '5','12:30','13:30','Mathematics AA HL',    'Sergio Romero Fernández', 'IB02'),
(cid,'2IB','viernes',  '1','08:00','09:00','TOK',                  'Natalia Torres Díaz',     'IB02'),
(cid,'2IB','viernes',  '2','09:00','10:00','History SL',           'Carlos López Martínez',   'IB02'),
(cid,'2IB','viernes',  '3','10:00','11:00','Physics HL',           'Miguel Hernández García', 'Lab1'),
(cid,'2IB','viernes',  '4','11:30','12:30','Mathematics AA HL',    'Sergio Romero Fernández', 'IB02'),
(cid,'2IB','viernes',  '5','12:30','13:30','English A HL',         'Ana Rodríguez Fernández', 'IB02');

-- 6. SUSTITUCIONES (10: 5 cubiertas + 5 pendientes) ─────────
INSERT INTO public.sustituciones
  (centro_id,fecha,hora_inicio,hora_fin,tramo,grupo_horario,
   profesor_ausente,profesor_sustituto,observaciones,cubierta,creado_por)
VALUES
  (cid,CURRENT_DATE-6,'08:00','09:00','1','1ESOA','Laura González Pérez',  'Francisco Jiménez López','Baja médica',            true, 'Sistema'),
  (cid,CURRENT_DATE-5,'09:00','10:00','2','3ESOA','Miguel Hernández García','Carmen Moreno Sánchez',  'Permiso sindical',       true, 'Sistema'),
  (cid,CURRENT_DATE-4,'10:00','11:00','3','1BACA','Carlos López Martínez',  'Javier Ruiz García',     'Asunto propio',          true, 'Sistema'),
  (cid,CURRENT_DATE-3,'11:30','12:30','4','2ESOB','Juan Martínez Sánchez',  'Elena Díaz González',    'Formación externa',      true, 'Sistema'),
  (cid,CURRENT_DATE-2,'12:30','13:30','5','4ESOA','David Sánchez Martínez', 'Francisco Jiménez López','Guardia cubierta OK',    true, 'Sistema'),
  (cid,CURRENT_DATE,  '08:00','09:00','1','2BACA','Pilar Álvarez Martín',   NULL,                     'Baja médica — urgente',  false,'Sistema'),
  (cid,CURRENT_DATE,  '09:00','10:00','2','1IB',  'Sergio Romero Fernández',NULL,                     'Permiso personal',       false,'Sistema'),
  (cid,CURRENT_DATE,  '10:00','11:00','3','3ESOB','Isabel Martín López',    NULL,                     'Formación IB Valencia',  false,'Sistema'),
  (cid,CURRENT_DATE,  '11:30','12:30','4','4ESOB','Carmen Moreno Sánchez',  NULL,                     'Cita médica',            false,'Sistema'),
  (cid,CURRENT_DATE,  '12:30','13:30','5','1BACB','Natalia Torres Díaz',    NULL,                     'Sin asignar',            false,'Sistema');

-- 7. ASISTENCIA COMEDOR (30 días × alumnos, ~65% asistencia) ─
INSERT INTO public.asistencia_comedor (centro_id, alumno_id, fecha, se_queda)
SELECT
  cid,
  al.id,
  d.fecha::date,
  (hashtext(al.id::text || d.fecha::text) % 100 + 100) % 100 < 65
FROM public.alumnos al
CROSS JOIN (
  SELECT generate_series(
    CURRENT_DATE - INTERVAL '29 days',
    CURRENT_DATE,
    '1 day'::interval
  )::date AS fecha
) d
WHERE al.centro_id = cid
  AND EXTRACT(DOW FROM d.fecha) BETWEEN 1 AND 5;

-- 8. AUSENCIAS PROFESOR (5, mix de estados) ──────────────────
INSERT INTO public.ausencias_profesor
  (centro_id,profile_id,fecha,fecha_fin,tipo,motivo,estado,trimestre,curso_escolar)
VALUES
  (cid,NULL,CURRENT_DATE-10,CURRENT_DATE-8, 'baja_medica',  'Gastroenteritis aguda',        'aprobada',  'T3','2024-2025'),
  (cid,NULL,CURRENT_DATE-5, CURRENT_DATE-5, 'permiso',      'Nacimiento hijo',              'aprobada',  'T3','2024-2025'),
  (cid,NULL,CURRENT_DATE-2, CURRENT_DATE-2, 'asunto_propio','Gestión administrativa',        'rechazada', 'T3','2024-2025'),
  (cid,NULL,CURRENT_DATE,   CURRENT_DATE+2, 'formacion',    'Curso IB Category 1 — Valencia','pendiente', 'T3','2024-2025'),
  (cid,NULL,CURRENT_DATE+5, CURRENT_DATE+5, 'sindical',     'Reunión comité de empresa',    'pendiente', 'T3','2024-2025');

-- 9. PLAZOS IB (3) ───────────────────────────────────────────
INSERT INTO public.plazos_ib
  (centro_id,curso_escolar,titulo,descripcion,fecha_limite,tipo,afecta_a,estado)
VALUES
  (cid,'2024-2025',
   'Entrega borrador IA — Matemáticas',
   'Primer borrador del Internal Assessment de Mathematics AA HL. Mínimo 1500 palabras.',
   CURRENT_DATE + 4,
   'entrega_ia','alumnos 2IB','pendiente'),
  (cid,'2024-2025',
   'TOK Essay — Outline definitivo',
   'Entrega del esquema definitivo del ensayo TOK al supervisor antes de la redacción final.',
   CURRENT_DATE + 7,
   'tok','alumnos 1IB y 2IB','pendiente'),
  (cid,'2024-2025',
   'Registro horas CAS trimestre',
   'Los alumnos deben tener registradas un mínimo de 25 horas de actividades CAS en la plataforma antes de fin de trimestre.',
   CURRENT_DATE + 21,
   'cas','alumnos 1IB y 2IB','pendiente');

-- 10. ACTIVIDADES CAS (3 por alumno IB = 30 registros) ───────
INSERT INTO public.cas_actividades
  (centro_id, alumno_id, titulo, tipo, descripcion, fecha_inicio, horas, estado)
SELECT
  cid,
  al.id,
  act.titulo,
  act.tipo,
  act.descripcion,
  CURRENT_DATE - act.dias_inicio,
  act.horas,
  act.estado
FROM public.alumnos al
CROSS JOIN (VALUES
  ('Voluntariado banco de alimentos', 'servicio',
   'Colaboración semanal en el banco de alimentos municipal los sábados por la mañana.',
   45, 40, 'en_curso'),
  ('Club de teatro del instituto',    'creatividad',
   'Participación en la obra de teatro anual. Ensayos, diseño de vestuario y representación.',
   90, 30, 'completada'),
  ('Maratón solidaria 5K',            'actividad',
   'Entrenamiento durante 6 semanas y participación en carrera solidaria contra la leucemia.',
   20, 18, 'completada')
) AS act(titulo, tipo, descripcion, dias_inicio, horas, estado)
WHERE al.centro_id = cid
  AND al.grupo_horario IN ('1IB', '2IB');

-- 11. EXTENDED ESSAY (2 alumnos de 2IB) ─────────────────────
INSERT INTO public.extended_essay
  (centro_id, alumno_id, titulo, asignatura, supervisor_nombre,
   estado, fecha_entrega_limite, palabras_actuales)
SELECT
  cid,
  al.id,
  ee.titulo,
  ee.asignatura,
  ee.supervisor,
  ee.estado,
  CURRENT_DATE + ee.dias_limite,
  ee.palabras
FROM public.alumnos al
JOIN (VALUES
  (1, 'The Impact of Social Media on Political Polarization in Spain (2015-2023)',
      'History SL', 'Carlos López Martínez', 'borrador_final', 90, 3200),
  (2, 'Análisis termodinámico de la eficiencia de paneles solares en clima mediterráneo',
      'Physics HL', 'Miguel Hernández García', 'primer_borrador', 120, 1800)
) AS ee(rn, titulo, asignatura, supervisor, estado, dias_limite, palabras)
  ON ROW_NUMBER() OVER (ORDER BY al.nombre) = ee.rn
WHERE al.centro_id = cid
  AND al.grupo_horario = '2IB';

END $$;
