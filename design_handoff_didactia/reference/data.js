/* Mock data for DidactIA prototype */

window.SCHOOL = {
  name: "Liceo Mediterráneo",
  campus: "Campus Norte · Castellón",
  year: "Curso 2025–26",
};

window.PROFESORES = [
  { id: "p01", nombre: "Sol Bernal",        rol: "Profesora", depto: "Matemáticas",  tone: "sand",   iniciales: "SB", ausente: true,  motivo: "Baja médica" },
  { id: "p02", nombre: "Marc Torralba",     rol: "Profesor",  depto: "Lengua",       tone: "cool",   iniciales: "MT" },
  { id: "p03", nombre: "Elena Ruiz",        rol: "Profesora", depto: "Ciencias",     tone: "green",  iniciales: "ER" },
  { id: "p04", nombre: "Diego Pinto",       rol: "Profesor",  depto: "Educación Física", tone: "sand", iniciales: "DP" },
  { id: "p05", nombre: "Laia Vicens",       rol: "Profesora", depto: "Arte",         tone: "purple", iniciales: "LV" },
  { id: "p06", nombre: "Adrián Cañas",      rol: "Profesor",  depto: "Historia",     tone: "cool",   iniciales: "AC" },
  { id: "p07", nombre: "Carla Mendoza",     rol: "Profesora", depto: "Inglés",       tone: "green",  iniciales: "CM" },
  { id: "p08", nombre: "Pablo Salas",       rol: "Profesor",  depto: "Tecnología",   tone: "purple", iniciales: "PS" },
];

window.ALUMNOS = [
  { id: "a01", nombre: "Lucía Marín Aragón",     curso: "3º ESO B", tutor: "Marc Torralba",   avg: 8.4, falt: 2, incid: 0, tone: "sand",   email: "lucia.marin@liceomed.es" },
  { id: "a02", nombre: "Hugo Vidal Sempere",     curso: "1º Bach A", tutor: "Elena Ruiz",      avg: 7.1, falt: 5, incid: 1, tone: "cool",   email: "hugo.vidal@liceomed.es" },
  { id: "a03", nombre: "Aitana Beltrán López",   curso: "2º ESO C", tutor: "Adrián Cañas",    avg: 9.2, falt: 0, incid: 0, tone: "green",  email: "aitana.beltran@liceomed.es" },
  { id: "a04", nombre: "Mateo Esparza Ribó",     curso: "4º ESO A", tutor: "Carla Mendoza",   avg: 6.3, falt: 8, incid: 2, tone: "purple", email: "mateo.esparza@liceomed.es" },
  { id: "a05", nombre: "Noa Almagro Tena",       curso: "1º ESO B", tutor: "Sol Bernal",      avg: 8.9, falt: 1, incid: 0, tone: "sand",   email: "noa.almagro@liceomed.es" },
  { id: "a06", nombre: "Iker Falcón Pradas",     curso: "3º ESO A", tutor: "Diego Pinto",     avg: 7.6, falt: 3, incid: 0, tone: "cool",   email: "iker.falcon@liceomed.es" },
  { id: "a07", nombre: "Sara Quirós Bauzá",      curso: "2º Bach B", tutor: "Laia Vicens",    avg: 9.5, falt: 0, incid: 0, tone: "green",  email: "sara.quiros@liceomed.es" },
  { id: "a08", nombre: "Pol Reverter Aguilá",    curso: "4º ESO C", tutor: "Pablo Salas",     avg: 5.8, falt: 12, incid: 3, tone: "purple", email: "pol.reverter@liceomed.es" },
  { id: "a09", nombre: "Vega Estela Romeu",      curso: "1º ESO A", tutor: "Marc Torralba",   avg: 8.2, falt: 1, incid: 0, tone: "sand",   email: "vega.estela@liceomed.es" },
  { id: "a10", nombre: "Bruno Llopis Casals",    curso: "3º ESO B", tutor: "Elena Ruiz",      avg: 7.4, falt: 4, incid: 1, tone: "cool",   email: "bruno.llopis@liceomed.es" },
  { id: "a11", nombre: "Carlota Mira Forner",    curso: "2º ESO A", tutor: "Adrián Cañas",    avg: 8.7, falt: 2, incid: 0, tone: "green",  email: "carlota.mira@liceomed.es" },
  { id: "a12", nombre: "Joel Sandoval Pérez",    curso: "1º Bach B", tutor: "Carla Mendoza",  avg: 6.9, falt: 6, incid: 1, tone: "purple", email: "joel.sandoval@liceomed.es" },
];

window.SUSTITUCIONES = [
  { id: "s01", hora: "08:15", franja: "1ª", aula: "Aula 204", grupo: "3º ESO B", asignatura: "Matemáticas", profesor: "Sol Bernal", sustituto: null,            estado: "pendiente" },
  { id: "s02", hora: "09:15", franja: "2ª", aula: "Aula 204", grupo: "1º Bach A", asignatura: "Matemáticas Aplicadas", profesor: "Sol Bernal", sustituto: "Diego Pinto",   estado: "asignada" },
  { id: "s03", hora: "10:15", franja: "3ª", aula: "Lab 1",   grupo: "2º Bach A", asignatura: "Cálculo", profesor: "Sol Bernal", sustituto: null,            estado: "pendiente" },
  { id: "s04", hora: "11:45", franja: "4ª", aula: "Aula 110", grupo: "4º ESO C", asignatura: "Geometría", profesor: "Sol Bernal", sustituto: "Pablo Salas",   estado: "asignada" },
  { id: "s05", hora: "12:45", franja: "5ª", aula: "Aula 204", grupo: "1º ESO B", asignatura: "Matemáticas", profesor: "Sol Bernal", sustituto: "Carla Mendoza", estado: "asignada" },
  { id: "s06", hora: "13:45", franja: "6ª", aula: "Aula 305", grupo: "3º ESO A", asignatura: "Matemáticas", profesor: "Sol Bernal", sustituto: null,            estado: "pendiente" },
];

window.INCIDENCIAS = [
  {
    id: "i01",
    titulo: "Material dañado — proyector Aula 204",
    categoria: "Mantenimiento",
    prioridad: "media",
    estado: "abierta",
    creada: "Hoy · 09:42",
    reportadoPor: "Marc Torralba",
    afectados: ["Aula 204"],
    descripcion: "El proyector pierde señal HDMI a los pocos minutos. Necesita revisión técnica o sustitución.",
    actividad: [
      { quien: "Marc Torralba", cuando: "Hoy · 09:42", texto: "Incidencia abierta." },
      { quien: "Conserjería", cuando: "Hoy · 10:15", texto: "Recibido. Asignamos a mantenimiento esta tarde." },
    ],
  },
  {
    id: "i02",
    titulo: "Conflicto entre alumnos — 4º ESO C",
    categoria: "Convivencia",
    prioridad: "alta",
    estado: "abierta",
    creada: "Hoy · 11:08",
    reportadoPor: "Pablo Salas",
    afectados: ["Pol Reverter", "Mateo Esparza"],
    descripcion: "Discusión durante el recreo. Sin agresión física. Requiere mediación con el equipo de orientación.",
    actividad: [
      { quien: "Pablo Salas", cuando: "Hoy · 11:08", texto: "Incidencia abierta tras el recreo." },
    ],
  },
  {
    id: "i03",
    titulo: "Solicitud de cambio de horario — Sara Quirós",
    categoria: "Académica",
    prioridad: "baja",
    estado: "en_revision",
    creada: "Ayer · 16:30",
    reportadoPor: "Familia (M. Quirós)",
    afectados: ["Sara Quirós Bauzá"],
    descripcion: "La familia solicita revisar la carga de optativas de tarde para conciliar con actividad deportiva federada.",
    actividad: [
      { quien: "Secretaría", cuando: "Ayer · 16:30", texto: "Solicitud recibida por email." },
      { quien: "Jefatura de Estudios", cuando: "Ayer · 18:00", texto: "Pasa a revisión académica." },
    ],
  },
  {
    id: "i04",
    titulo: "Comedor — alergia no registrada",
    categoria: "Salud",
    prioridad: "alta",
    estado: "abierta",
    creada: "Hoy · 13:20",
    reportadoPor: "Cocina",
    afectados: ["Noa Almagro Tena"],
    descripcion: "Familia notifica alergia a frutos secos no recogida en la ficha. Actualizar y comunicar a comedor.",
    actividad: [
      { quien: "Cocina", cuando: "Hoy · 13:20", texto: "Avisado por la familia en la entrada del comedor." },
    ],
  },
  {
    id: "i05",
    titulo: "Wifi inestable — planta 3",
    categoria: "Tecnología",
    prioridad: "media",
    estado: "abierta",
    creada: "Hoy · 08:55",
    reportadoPor: "Adrián Cañas",
    afectados: ["Aula 305", "Aula 307"],
    descripcion: "Cortes intermitentes desde las 8:30. Afecta a la conexión de los Chromebooks del aula.",
    actividad: [
      { quien: "Adrián Cañas", cuando: "Hoy · 08:55", texto: "Incidencia abierta." },
    ],
  },
  {
    id: "i06",
    titulo: "Retraso autobús ruta 4",
    categoria: "Transporte",
    prioridad: "baja",
    estado: "cerrada",
    creada: "Ayer · 07:50",
    reportadoPor: "Conserjería",
    afectados: ["Ruta 4 — 12 alumnos"],
    descripcion: "Retraso de 25 min. Familias informadas por SMS automático.",
    actividad: [
      { quien: "Conserjería", cuando: "Ayer · 07:50", texto: "Abierta." },
      { quien: "Sistema", cuando: "Ayer · 07:55", texto: "SMS enviado a 12 familias." },
      { quien: "Conserjería", cuando: "Ayer · 08:25", texto: "Autobús llegado. Cerrada." },
    ],
  },
];

window.HORARIO_HOY = [
  { hora: "08:15", franja: "1ª", asignatura: "Matemáticas", grupo: "3º ESO B", aula: "Aula 204" },
  { hora: "09:15", franja: "2ª", asignatura: "Tutoría",     grupo: "3º ESO B", aula: "Aula 204" },
  { hora: "10:15", franja: "3ª", asignatura: "Matemáticas", grupo: "1º Bach A", aula: "Aula 305" },
  { hora: "11:15", franja: "—",  asignatura: "Recreo",      grupo: "—",         aula: "—" },
  { hora: "11:45", franja: "4ª", asignatura: "Geometría",   grupo: "4º ESO A",  aula: "Aula 110" },
  { hora: "12:45", franja: "5ª", asignatura: "Libre",       grupo: "—",         aula: "—" },
  { hora: "13:45", franja: "6ª", asignatura: "Matemáticas", grupo: "2º Bach A", aula: "Lab 1" },
];

window.COMUNICADOS_RECIENTES = [
  { id: "c01", titulo: "Cierre por jornada festiva", fecha: "Hace 2 horas", autor: "Dirección", leido: false },
  { id: "c02", titulo: "Reunión claustro · jueves 18h", fecha: "Ayer", autor: "Jefatura de Estudios", leido: true },
  { id: "c03", titulo: "Resultados pruebas diagnósticas 4º ESO", fecha: "Lun 18", autor: "Departamento Pedagógico", leido: true },
];

window.CHAT_RECIENTES = [
  { id: "ch01", titulo: "Horario del profesor Sol Bernal", cuando: "Hoy · 11:24", preview: "El horario completo para Sol esta semana es…" },
  { id: "ch02", titulo: "Próxima reunión de departamento de Matemáticas", cuando: "Hoy · 10:02", preview: "La próxima reunión es el jueves a las 17:00 en…" },
  { id: "ch03", titulo: "Actividades extraescolares de tarde", cuando: "Ayer · 17:48", preview: "Hay 14 actividades activas. Las más demandadas…" },
  { id: "ch04", titulo: "Menú comedor semana 25 mayo", cuando: "Lun 18", preview: "Lunes: crema de calabacín, merluza al horno…" },
  { id: "ch05", titulo: "Alumnos con más faltas — 3º ESO", cuando: "Lun 18", preview: "5 alumnos superan el 10% de faltas justificadas…" },
];
