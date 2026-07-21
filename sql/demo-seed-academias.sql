-- ============================================================================
-- DidactIA Academias — SEED DEMO VIVO para Academia Demo DidactIA (academia de repaso ESO)
-- Idempotente: borra y regenera los datos demo del centro (NO toca los admins).
-- Ejecutar como postgres (Management API / PAT).
-- centro_id Academia Demo DidactIA = 6a4837ac-85f7-4a79-811d-e31694e08e48
-- ============================================================================

-- ── 0. LIMPIEZA (scoped al centro demo) ─────────────────────────────────────
do $$
declare cid uuid := '6a4837ac-85f7-4a79-811d-e31694e08e48';
begin
  delete from asistencia      where centro_id=cid;
  delete from calificaciones  where centro_id=cid;
  delete from pagos           where centro_id=cid;
  delete from incidencias     where centro_id=cid;
  delete from tareas          where centro_id=cid;
  delete from eventos         where centro_id=cid;
  delete from matricula_grupo where centro_id=cid;
  delete from matriculas      where centro_id=cid;
  delete from grupo_sesiones  where centro_id=cid;
  delete from familia_alumno  where alumno_id in (select id from alumnos where centro_id=cid);
  delete from alumnos         where centro_id=cid;
  delete from grupos          where centro_id=cid;
  delete from profesores      where centro_id=cid;
  -- familias demo (auth) — cascada limpia profiles + familia_alumno
  delete from auth.users      where email like '%@demo.didactia.eu';
end $$;

-- ── 1. PROFESORES ───────────────────────────────────────────────────────────
insert into public.profesores (centro_id, nombre, apellidos, email, telefono, especialidad, tarifa_hora, activo) values
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Laura','Giménez Roca','laura.gimenez@demo.didactia.eu','600100201','Matemáticas',18,true),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Carlos','Ruiz Bernad','carlos.ruiz@demo.didactia.eu','600100202','Física y Química',18,true),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Marta','Sánchez Vidal','marta.sanchez@demo.didactia.eu','600100203','Lengua y Literatura',17,true),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','David','Torres Alcázar','david.torres@demo.didactia.eu','600100204','Inglés',17,true),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Ana Belén','Ortega Ferrer','ana.ortega@demo.didactia.eu','600100205','Biología y Geología',17,true),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Javier','Moreno Prats','javier.moreno@demo.didactia.eu','600100206','Geografía e Historia',16,true),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Nuria','Campos Selma','nuria.campos@demo.didactia.eu','600100207','Técnicas de estudio',16,true);

-- ── 2. GRUPOS (clase = asignatura + nivel + profe) ──────────────────────────
insert into public.grupos (centro_id, nombre, asignatura, nivel, profesor_id, aula, capacidad, cuota_mensual, color, curso_escolar, activo)
select '6a4837ac-85f7-4a79-811d-e31694e08e48', g.nombre, g.asignatura, g.nivel,
       (select id from profesores where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48' and email=g.prof_email),
       g.aula, g.cap, g.cuota, g.color, '2025-26', true
from (values
  ('Matemáticas 1º ESO','Matemáticas','1º ESO','laura.gimenez@demo.didactia.eu','Aula 1',8,55,'#4D6FA8'),
  ('Matemáticas 2º ESO','Matemáticas','2º ESO','laura.gimenez@demo.didactia.eu','Aula 1',8,55,'#4D6FA8'),
  ('Matemáticas 3º ESO','Matemáticas','3º ESO','laura.gimenez@demo.didactia.eu','Aula 2',8,60,'#4D6FA8'),
  ('Matemáticas 4º ESO','Matemáticas','4º ESO','laura.gimenez@demo.didactia.eu','Aula 2',8,65,'#4D6FA8'),
  ('Física y Química 3º ESO','Física y Química','3º ESO','carlos.ruiz@demo.didactia.eu','Aula 3',7,60,'#C76B3D'),
  ('Física y Química 4º ESO','Física y Química','4º ESO','carlos.ruiz@demo.didactia.eu','Aula 3',7,65,'#C76B3D'),
  ('Lengua 1º ESO','Lengua y Literatura','1º ESO','marta.sanchez@demo.didactia.eu','Aula 1',8,55,'#3F9367'),
  ('Lengua 3º ESO','Lengua y Literatura','3º ESO','marta.sanchez@demo.didactia.eu','Aula 2',8,60,'#3F9367'),
  ('Inglés 2º ESO','Inglés','2º ESO','david.torres@demo.didactia.eu','Aula 4',8,55,'#7A5C9E'),
  ('Inglés 4º ESO','Inglés','4º ESO','david.torres@demo.didactia.eu','Aula 4',8,65,'#7A5C9E'),
  ('Biología 4º ESO','Biología y Geología','4º ESO','ana.ortega@demo.didactia.eu','Aula 3',7,60,'#1F7A8C'),
  ('Técnicas de estudio','Técnicas de estudio',null,'nuria.campos@demo.didactia.eu','Aula 5',10,45,'#D69540')
) g(nombre, asignatura, nivel, prof_email, aula, cap, cuota, color);

-- ── 3. SESIONES SEMANALES (2 por grupo: L-X o M-J; técnicas = Viernes) ──────
insert into public.grupo_sesiones (centro_id, grupo_id, dia_semana, hora_inicio, hora_fin, aula)
select g.centro_id, g.id, dd.dia, x.hi, (x.hi + interval '90 minutes')::time, g.aula
from public.grupos g
cross join lateral (
  select case when g.asignatura='Técnicas de estudio' then array[5]
              when (abs(hashtext(g.id::text)) % 2)=0 then array[1,3]
              else array[2,4] end as dias,
         case when (abs(hashtext(g.id::text)) % 2)=0 then time '17:00' else time '18:30' end as hi
) x
cross join lateral unnest(x.dias) as dd(dia)
where g.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48';

-- ── 4. ALUMNOS (~42 ESO) ────────────────────────────────────────────────────
do $$
declare
  cid uuid := '6a4837ac-85f7-4a79-811d-e31694e08e48';
  nombres text[] := array['Lucía','Martín','Paula','Hugo','Sofía','Daniel','Valeria','Marcos','Carla','Álvaro','Emma','Pablo','Noa','Izan','Julia','Diego','Alba','Adrián','Sara','Mario','Vega','Bruno','Nerea','Gonzalo','Claudia','Aitor','Irene','Rubén','Marina','Óscar','Elena','Iván','Candela','Sergio','Lola','Nicolás','Ainara','Jorge','Alma','Raúl','Daniela','Guille'];
  ap1 text[] := array['García','Martínez','López','Sánchez','Ferrer','Gómez','Blasco','Navarro','Beltrán','Ortiz','Ripoll','Aparici','Fabra','Museros','Salvador','Adell','Barberá','Cardona','Escrig','Falcó'];
  ap2 text[] := array['Vidal','Roca','Prats','Serra','Bernad','Selma','Alcázar','Camps','Mateu','Peris','Company','Grau','Fandos','Bou','Querol','Tirado','Ciscar','Vives','Nebot','Segarra'];
  colegios text[] := array['IES Serra d''Espadà','IES Bovalar','Colegio San Vicente','IES Penyagolosa','IES Politècnic'];
  niveles text[] := array['1º ESO','2º ESO','3º ESO','4º ESO'];
  i int; nm text; ape text; niv text; nee_b boolean; est text; falta date;
begin
  for i in 1..42 loop
    nm  := nombres[1 + (i*7)  % array_length(nombres,1)];
    ape := ap1[1 + (i*13) % array_length(ap1,1)] || ' ' || ap2[1 + (i*5) % array_length(ap2,1)];
    niv := niveles[1 + (i % 4)];
    nee_b := (i % 11 = 0);
    est := case when i=42 then 'baja' when i in (40,41) then 'prospecto' else 'activo' end;
    falta := current_date - ((i*23) % 500);
    insert into public.alumnos
      (centro_id, nombre, apellidos, nivel_educativo, curso, grupo_horario, nee, nee_detalle,
       estado, fecha_alta, fecha_baja, motivo_baja, consentimiento_rgpd, consentimiento_imagen,
       email_contacto, telefono, centro_escolar, fecha_nacimiento)
    values
      (cid, nm, ape, niv, niv, niv, nee_b,
       case when nee_b then 'Adaptación metodológica en Matemáticas y Lengua' else null end,
       est, falta,
       case when est='baja' then current_date - 20 else null end,
       case when est='baja' then 'Cambio de ciudad' else null end,
       true, (i % 3 <> 0),
       lower(regexp_replace(nm,'[^a-z]','','g'))||'.familia'||i||'@example.com',
       '6'||lpad(((i*137) % 100000000)::text,8,'0'),
       colegios[1 + (i % array_length(colegios,1))],
       (date '2011-01-01' - ((i%4)*365) + ((i*29)%330))
      );
  end loop;
end $$;

-- ── 5. MATRÍCULAS (una por alumno activo/baja) ──────────────────────────────
insert into public.matriculas (centro_id, alumno_id, estado, fecha_alta, fecha_baja, cuota_mensual, descuento, forma_pago, curso_escolar)
select a.centro_id, a.id,
       case when a.estado='baja' then 'baja' when a.estado='prospecto' then 'pendiente' else 'activa' end,
       a.fecha_alta, a.fecha_baja,
       (case a.nivel_educativo when '1º ESO' then 55 when '2º ESO' then 58 when '3º ESO' then 62 else 68 end),
       case when (abs(hashtext(a.id::text)) % 7)=0 then 10 else 0 end,
       (array['transferencia','domiciliacion','domiciliacion','efectivo'])[1 + (abs(hashtext(a.id::text)) % 4)],
       '2025-26'
from public.alumnos a
where a.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48' and a.estado in ('activo','baja');

-- ── 6. MATRÍCULA ↔ GRUPOS (1-2 grupos del nivel del alumno) ─────────────────
insert into public.matricula_grupo (centro_id, matricula_id, grupo_id)
select m.centro_id, m.id, g.id
from public.matriculas m
join public.alumnos a on a.id=m.alumno_id
join lateral (
  select gr.id from public.grupos gr
  where gr.centro_id=m.centro_id and gr.nivel=a.nivel_educativo and gr.activo
  order by abs(hashtext(m.id::text || gr.id::text))
  limit (1 + (abs(hashtext(a.id::text)) % 2))
) g on true
where m.estado='activa' and m.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48';

-- técnicas de estudio: apuntar ~8 alumnos activos
insert into public.matricula_grupo (centro_id, matricula_id, grupo_id)
select m.centro_id, m.id, (select id from public.grupos where centro_id=m.centro_id and asignatura='Técnicas de estudio' limit 1)
from public.matriculas m
where m.estado='activa' and m.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48'
  and (abs(hashtext(m.alumno_id::text)) % 5)=0
on conflict (matricula_id, grupo_id) do nothing;

-- ── 7. ASISTENCIA (últimas ~10 semanas; sesgo de faltas en alumnos en riesgo) ─
insert into public.asistencia (centro_id, alumno_id, grupo_id, fecha, estado, notificado_familia)
select mg.centro_id, m.alumno_id, mg.grupo_id, gs.d::date,
  case
    when (abs(hashtext(m.alumno_id::text || gs.d::text)) % 100)
         < (case when abs(hashtext(m.alumno_id::text)) % 9 = 0 then 34 else 8 end) then 'ausente'
    when (abs(hashtext(m.alumno_id::text || gs.d::text)) % 100) < 15 then 'retraso'
    when (abs(hashtext(m.alumno_id::text || gs.d::text)) % 100) < 18 then 'justificada'
    else 'presente'
  end,
  true
from public.matricula_grupo mg
join public.matriculas m on m.id=mg.matricula_id and m.estado='activa'
join public.grupo_sesiones s on s.grupo_id=mg.grupo_id
cross join lateral generate_series(current_date - 70, current_date, interval '1 day') gs(d)
where extract(isodow from gs.d) = s.dia_semana
  and mg.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48'
on conflict (centro_id, alumno_id, fecha, grupo_id) do nothing;

-- ── 8. CALIFICACIONES (3 pruebas por grupo; notas bajas en riesgo) ──────────
insert into public.calificaciones (centro_id, alumno_id, grupo_id, evaluacion, nota, fecha, observacion)
select mg.centro_id, m.alumno_id, mg.grupo_id, ev.name,
  greatest(1.0, least(10.0, round(
    ((case when abs(hashtext(m.alumno_id::text)) % 9 = 0 then 3.6 else 6.6 end)
      + (abs(hashtext(m.alumno_id::text || ev.name)) % 30)/10.0 - 1.4)::numeric, 1))),
  current_date - ev.daysago,
  case when abs(hashtext(m.alumno_id::text)) % 9 = 0 and ev.name='1ª Evaluación'
       then 'Necesita reforzar los contenidos base. Recomendado plan de recuperación.' else null end
from public.matricula_grupo mg
join public.matriculas m on m.id=mg.matricula_id and m.estado='activa'
cross join (values ('Prueba tema 1',52),('Prueba tema 2',26),('1ª Evaluación',9)) ev(name, daysago)
where mg.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48';

-- ── 9. PAGOS (últimos 4 meses; impagos en el mes en curso) ──────────────────
insert into public.pagos (centro_id, alumno_id, matricula_id, concepto, importe, fecha, metodo, estado, periodo)
select m.centro_id, m.alumno_id, m.id,
  'Cuota mensual',
  round((coalesce(m.cuota_mensual,55) * (1 - coalesce(m.descuento,0)/100.0))::numeric, 2),
  (date_trunc('month', mo.d) + interval '4 days')::date,
  coalesce(m.forma_pago,'transferencia'),
  case when mo.d >= date_trunc('month', current_date)
       then (case when (abs(hashtext(m.alumno_id::text)) % 5) < 2 then 'pendiente' else 'pagado' end)
       else 'pagado' end,
  to_char(mo.d, 'YYYY-MM')
from public.matriculas m
cross join lateral generate_series(
  date_trunc('month', current_date) - interval '3 months',
  date_trunc('month', current_date), interval '1 month') mo(d)
where m.estado='activa' and m.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48';

-- ── 10. INCIDENCIAS (~12) ───────────────────────────────────────────────────
insert into public.incidencias (centro_id, alumno_id, grupo_id, fecha, tipo, gravedad, descripcion, estado, notificado_familia)
select a.centro_id, a.id,
  (select mg.grupo_id from public.matricula_grupo mg join public.matriculas mm on mm.id=mg.matricula_id where mm.alumno_id=a.id limit 1),
  current_date - ((abs(hashtext(a.id::text)) % 40)),
  (array['conducta','academica','retraso','material'])[1 + (abs(hashtext(a.id::text)) % 4)],
  (array['leve','leve','moderada','grave'])[1 + (abs(hashtext(a.id::text||'g')) % 4)],
  (array[
    'No ha traído el material de trabajo a clase.',
    'Interrumpe reiteradamente durante la sesión.',
    'Llega tarde de forma habitual a la clase de la tarde.',
    'No ha entregado las tareas de la última semana.',
    'Falta de concentración; se recomienda seguimiento.',
    'Conflicto leve con un compañero, resuelto en el aula.'
  ])[1 + (abs(hashtext(a.id::text||'d')) % 6)],
  (array['abierta','en_seguimiento','cerrada'])[1 + (abs(hashtext(a.id::text||'e')) % 3)],
  true
from public.alumnos a
where a.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48' and a.estado='activo'
  and (abs(hashtext(a.id::text||'inc')) % 3)=0
limit 12;

-- ── 11. EVENTOS (próximas semanas) ──────────────────────────────────────────
insert into public.eventos (centro_id, titulo, fecha, hora, tipo, descripcion) values
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Reunión de profesores', current_date + 3, '19:30','reunion','Coordinación de la evaluación y seguimiento de alumnos en riesgo.'),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Cierre de cobros del mes', current_date + 5, '20:00','pago','Revisar recibos pendientes y enviar recordatorios.'),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Reunión con familias 4º ESO', current_date + 8, '18:00','reunion','Orientación académica y preparación de la EBAU.'),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Simulacro de examen 3º ESO', current_date + 12, '17:00','otro','Prueba conjunta de Matemáticas y Física y Química.'),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Renovación de matrículas', current_date + 20, null,'renovacion','Apertura del plazo de renovación para el próximo curso.'),
  ('6a4837ac-85f7-4a79-811d-e31694e08e48','Puertas abiertas', current_date + 26, '18:30','otro','Jornada de captación de nuevo alumnado.');

-- ── 12. TAREAS (una próxima por grupo activo) ───────────────────────────────
insert into public.tareas (centro_id, grupo_id, titulo, descripcion, tipo, fecha_entrega)
select g.centro_id, g.id,
  case when g.asignatura='Matemáticas' then 'Ejercicios de ecuaciones'
       when g.asignatura='Física y Química' then 'Problemas de formulación'
       when g.asignatura='Lengua y Literatura' then 'Comentario de texto'
       when g.asignatura='Inglés' then 'Writing: opinion essay'
       when g.asignatura='Biología y Geología' then 'Esquema del aparato circulatorio'
       else 'Ficha de repaso' end,
  'Preparar para la próxima sesión.',
  case when (abs(hashtext(g.id::text)) % 3)=0 then 'examen' else 'deber' end,
  current_date + (2 + abs(hashtext(g.id::text)) % 10)
from public.grupos g
where g.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48' and g.activo;

-- ── 13. FAMILIAS DEMO (auth + perfil + vínculo) ─────────────────────────────
-- Password de todas: Familia2026!
do $$
declare
  cid uuid := '6a4837ac-85f7-4a79-811d-e31694e08e48';
  fam record; uid uuid;
begin
  for fam in
    select * from (values
      ('Familia González','familia1@demo.didactia.eu',2),
      ('Familia López','familia2@demo.didactia.eu',1),
      ('Familia Ferrer','familia3@demo.didactia.eu',1)
    ) as t(nombre, email, nchildren)
  loop
    uid := gen_random_uuid();
    insert into auth.users
      (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,
       raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
    values
      ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',fam.email,
       crypt('Familia2026!', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}',
       json_build_object('full_name', fam.nombre)::jsonb, '','','','');
    insert into auth.identities
      (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values
      (gen_random_uuid(), uid, uid::text,
       json_build_object('sub',uid::text,'email',fam.email)::jsonb, 'email', now(), now(), now());
    insert into public.profiles (id,user_id,full_name,email,rol,centro_id)
    values (uid, uid, fam.nombre, fam.email, 'familia', cid);
    insert into public.familia_alumno (profile_id, alumno_id, relacion)
    select uid, a.id, 'padre/madre'
    from (select id from public.alumnos where centro_id=cid and estado='activo'
          order by abs(hashtext(id::text || fam.email)) limit fam.nchildren) a;
  end loop;
end $$;

-- ── RESUMEN ─────────────────────────────────────────────────────────────────
select
  (select count(*) from public.profesores    where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as profesores,
  (select count(*) from public.grupos         where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as grupos,
  (select count(*) from public.grupo_sesiones where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as sesiones,
  (select count(*) from public.alumnos        where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as alumnos,
  (select count(*) from public.matriculas     where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as matriculas,
  (select count(*) from public.asistencia     where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as asistencia,
  (select count(*) from public.calificaciones where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as notas,
  (select count(*) from public.pagos          where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as pagos,
  (select count(*) from public.incidencias    where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as incidencias,
  (select count(*) from public.eventos        where centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as eventos,
  (select count(*) from public.familia_alumno fa join public.alumnos a on a.id=fa.alumno_id where a.centro_id='6a4837ac-85f7-4a79-811d-e31694e08e48') as vinculos_familia;
