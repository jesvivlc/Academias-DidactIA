# DidactIA — Módulos implementados

> Ver @CLAUDE-TABLAS.md para el esquema de BD.

## Chatbot (chat.js + EF chat)
- Contexto inyectado: info_centro, horario usuario, hijos vinculados
- Resolución directa (sin Gemini) para consultas horario alumno/grupo/profesor
- Búsqueda fuzzy profesor: `normalizeText()` + prefijos diminutivos + `_ultimoProfesor` entre turnos
- `extractDiaHora`: ordinales ("tercera hora"→10:40) + horas numéricas
- Flujo sustitución: detecta profesor → inyecta horario → Gemini llama `crear_sustitucion`
- Herramientas function calling: `crear_sustitucion`, `crear_incidencia`, `consultar_profesor_libre` (auto), `registrar_ausencia_profesor`, `avisar_comedor`, `listar_tramos_centro` (auto), `crear_tramos_centro`
- Confirmación UI: `_showToolCard()` → usuario confirma → `window._confirmTool()` → EF
- `READ_ONLY`: consultar_profesor_libre + listar_tramos_centro (auto-ejecutan sin card)

## Comedor (comedor.js)
- Toggle 3 estados: ✗ No come / 🥡 Tupper / ✓ Menú (`asistencia_comedor.tupper`)
- Detección contextual profesor: `_detectarContextoProfesor()` → tramo activo → grupo en ese tramo
- Histórico 30 días, limit 50000. `comedorFecha` controla el día (nunca `new Date()` en toggle)
- Alergias/dietas: badges por alumno, `_comedorEditarNota`, toast rojo si alérgico asiste
- Informe contable mensual: PDF/Excel con subtotales por grupo y total facturado
- Export Excel: SheetJS, hoja histórico + hoja desglose por grupo
- `_cEsc()`: helper XSS local

## Sustituciones (admin.js)
**Vista admin**: registro, selector sustitutos por equidad, toggle cubierta, filtros Hoy/Semana/Todo
- `initSustPanel()`: auto-detecta tramo, pre-rellena fecha hoy, puebla select desde `tramos_centro`
- Botón "+ Asignar" en fila pendiente → UPDATE sobre la misma fila (no crea nueva)
- Helpers: `_justPath`, `_rrhhIdFromObs`, `_instrLimpias`, `_sustNombreNorm`, `_sustDedupeNombres`
- Notificaciones: `notify-sustitucion{asignacion|cobertura}` fire-and-forget

**Vista profesional**: formulario ausencia unificado → dual-write `ausencias_profesor` + `sustituciones`
- Multi-día: oculta selector tramos, genera fila por cada día lectivo del rango
- Justificante: Storage bucket `documentos`, path `justificantes/{ctrId}/{sustId}.{ext}`, marcado `§JUST§`
- Historial: join `§RRHH§{ausencia_id}` para estado administrativo

## Guardias (guardias.js)
- `loadBolsaGuardias()`: ranking profesores por guardias trimestre, barra progreso + badge color
- `getGuardiaCountsByName()`: mapa nombre→count para ordenar selector sustitutos
- `registrarGuardiaEnBD(nombre, fecha, tramo, grupo)`: INSERT `guardias_realizadas`
- Helpers: `_guardiaTrimActual()`, `_guardiaTrimDates()`, `_guardiaCursoActual()`

## Dashboard (mejoras.js)
- `renderMiHorarioHoy()`: horario del día cruzando `horarios_grupo` por tokens normalizados, resalta clase activa AHORA
- `renderHomeMetrics()`: sustituciones hoy / comunicados nuevos / incidencias abiertas (staff)
- `renderHomeFamilia()`: 7 bloques async fire-and-forget (avisos, horario, comedor, incidencias, salidas, comunicados, menú)
- `_fhSelectHijo(idx)`: cambia hijo activo y fuerza recarga
- `_fhAvisoManana()`: upsert `asistencia_comedor` se_queda=false para mañana
- Búsqueda alumno debounce 280ms, historial localStorage, voz Web Speech API

## Usuarios (users.js)
- Admin: solo su centro. Superadmin: todos los centros
- Modal Invitar: nombre/email/rol/centro/alumnos vinculados → EF `invite-user`
- Modal Editar: nombre/rol/alumnos → llama `notify-role` si cambia rol
- Eliminar: solo usuarios pendientes (sin `email_confirmed_at`)
- Desactivar/Reactivar: campo `activo` en profiles
- Sin toggles de módulos: todos activos siempre. Solo IB es opcional

## RRHH (rrhh.js)
- Vista profesor: solo historial readonly + banner "notifica desde Sustituciones"
- Vista admin: lista solicitudes, filtros, Aprobar/Rechazar
- `aprobarAusencia()`: `_crearSustituciones()` → filas por cada tramo del rango
- `rechazarAusencia()`: prompt motivo → UPDATE estado+motivo_rechazo
- Copiloto legal IA: `_rrhhEvaluarConIA()` → Gemini analiza contra EBEP/convenio → panel expandible antes de actuar
- `_rrhhAplicar(id, accion, mensaje)`: núcleo compartido por modal individual y agente RRHH
- IMPORTANTE: `ausencias_profesor` NO tiene `trabajo_alumnos` ni `justificante_url`

## Incidencias (incidencias.js)
**Vista admin**: formulario completo + "✨ Tipificar IA" → EF `tipificar-incidencia`
- `_incTipData`: estado del módulo con resultado tipificación
- `registrarIncidencia()`: guarda `informe_borrador`, `normativa_ref`, `medidas_propuestas[]`, `protocolo_previ`
- Panel detalle lateral `_incAbrirDetalle(id)`: resalta fila, panel derecho con metadatos+acciones
- `_incLastData` cachea última carga. `_incSelectedId` persiste selección entre filtros

**Vista profesional**: solo alumnos de sus grupos, gravedad=leve, notify-jefatura automático

## Comunicados (comunicados.js)
- `enviarComunicado()`: INSERT + EF `send-comunicado` + `_comPushFamilias()` fire-and-forget
- Destinatarios: todos/solo_profesores/solo_familias/grupo:XXXX
- Badge no leídos: `_comUpdateTabBadge()` localStorage + Realtime INSERT suscripción
- Registro lecturas: UPSERT `comunicado_lecturas` al abrir modal (UNIQUE comunicado_id+user_id)
- Multi-idioma: Gemini traduce al vuelo al abrir si `profiles.idioma` ≠ 'es' (no persiste)
- `_comPushFamilias()`: suite push completo (comedor/asistencia/salidas/orientación/notas/incidencias/comunicados)

## Planner (planner.js)
- 6 sub-paneles: Materias · Necesidades · Tablero · Publicar · Tramos · Dictar
- Motor CSP `_generarHorario`: backtracking, más-restringidas primero, cross-group conflict prevention
- Hard constraints `_esHardValido()`: HC-1 slot ocupado / HC-MATERIA-DIA / HC-VENTANA (máx 8 tramos/día) / HC-INICIO-FIN (sin huecos) / HC-3 disponibilidad profesor
- Soft constraints `_scoreSoft()`: carga cognitiva, dinámica, horas extremas
- Modo sin profesores: CSP omite HC-3, slots `sin_asignar:true`, asignación posterior por chat/tablero
- Tablero: drag&drop con `_ejecutarDrop` simular-validar-revertir, zona Aparcados (localStorage)
- Persistencia: `_guardarHorarioGenerado()` tras cada drop
- Sprint 2 vista profesor: `_renderProfesorView()` grid cross-grupo, panel carga semanal
- Sprint 3 viabilidad: `_validarViabilidad()` + `plannerVerificar()` modal pre-generación
- Sprint 4 cobertura: `_calcCobertura()` + `plannerCobertura()` modal + badges en selector grupo
- Publicar: DELETE filtrado por `centro_id+curso_escolar+grupo_horario` → INSERT con `curso_escolar`
- Tab Dictar: voz/texto/audio → EF `parse-restricciones` → checkboxes → Supabase
- Motor H-MRV-SA: 3 Web Workers paralelos, variantes Pareto, `teacherOccupancy Map<tid,Set<slot>>`
- TRAMOS_DEFAULT: genérico si `tramos_centro` vacío → banner ámbar `#planner-tramos-warn`
- `IMPORT_CENTRO=ctrId`, curso escolar en selector Publicar, aviso si coincide con `cursoActivo`

## Análisis — CMI + Informes (analytics.js + informes.js)
- Módulo fusionado: nav "📊 Análisis", 2 pills internas (Dashboard / Informes PDF)
- CMI: 6 KPIs tiempo real + gráficos Chart.js (tendencia incidencias, guardias por profesor, tipos ausencia)
- Alertas predictivas: EF `alerta-psicosocial` → `alertas_predictivas` (tabla en producción)
- Informes PDF: selector periodo → jsPDF+autotable, 6 secciones, logo+color del centro

## Salidas Didácticas (salidas.js)
- 4 tabs en detalle: Dashboard (contadores+checkboxes) / Cocina (alergenos RGPD) / Autobús (formulario+lista embarque) / Administración (económico+estados+push)
- Vista familia: autorización por hijo, picnic, alergias confirmadas → push al responsable
- Excel 3 hojas: Participantes / Cocina / Económico
- Push familias al publicar vía EF `send-push`
- `_salidasAlumnosPorGrupo`: cache grupo→[alumno_ids]

## Calidad (calidad.js)
- Dashboard: 5 KPIs + semáforo + 3 listas resumen
- No Conformidades: NC-ID formato `NC-{año}-{6HEX}`, modal voz+IA, detalle con 5 Porqués, CAPA inline
- CAPA: causa raíz, plan, responsable, fechas; eficacia → cierra NC si todas eficaces
- Feedback: análisis IA asíncrono no bloqueante tras INSERT, email familia lazy load, respuesta IA
- Helper `_calGemini(systemPrompt, userMsg)`: wrapper EF `chat`, nunca lanza
- `_calVoz`: SpeechRecognition continuo, try/catch completo
- IMPORTANTE: `#calidad-cont` (NO `cal-container` — ese es de calificaciones)

## Orientación (orientacion.js)
- Lista expedientes: JOIN alumnos, medida más grave activa, nivel riesgo, export XLSX
- Expediente 4 pestañas: Resumen / Informes / Adaptaciones / Trámites
- Informe: `texto_final` nunca sobreescribe si `firmado=true`
- Panel riesgo: detección académica determinista (asistencia+notas+incidencias) + IA psicosocial
- Exportación RGPD: PDF único jsPDF+autotable, portada legal Art.15 RGPD/LOPDGDD
- Portal familias: `oriRenderTramitesFamilia()` vía RPC `familia_tramites_visibles()` SECURITY DEFINER
- Push `_oriPush`: 4 momentos (cuestionario/alerta/informe validado/trámite visible familia)
- Responsive CSS inyectado una vez (no tocar styles.css)

## Calificaciones (calificaciones.js)
- Vista admin: split layout `cal-list-panel` (58%) + `cal-detail-panel` (flex:1)
- `_calAbrirAlumno(nombre, grupo)`: resalta fila, stat media, tabla pivote asignatura×evaluación
- `_calSelectedAlumno`: persiste selección entre re-renders
- Vista profesor: UPSERT `onConflict: centro_id,alumno_id,asignatura,evaluacion`
- Vista familia: solo lectura, tabla pivote, botón "⬇ Boletín PDF" → `_calBoletinPDF()`
- Push al guardar: `_calNotificarFamilias` diffa notas originales, solo avisa si cambió
- Comentarios IA: `_calComentariosIA()` lotes 20, empareja por índice alumno
- Competencial LOMLOE: `_calGenCompetencial()` modal por alumno, 8 competencias `_CAL_COMP_MAP`
  - Auto-comentario al cambiar nivel: `_calCompAutoComment()` sin llamar Gemini
  - `data-manualEdit='1'` bloquea auto-comentario si usuario editó manualmente
  - UPSERT `comentarios_competenciales`, "📋 Copiar para Alexia"
  - PDF incluye sección competencial si hay datos
  - Vista admin: pills coloreados `_calLoadCompetencialAdmin()` (danger/warning/info/success)
- Boletín PDF: cabecera logo+color + tabla pivote + observaciones + sección competencial
- CSS: `#panel-calificaciones` flex-direction:column; `#cal-container` flex:1 min-height:0
- MIGRACIÓN PENDIENTE: `supabase/migrations/calificaciones_competenciales.sql`

## Asistencia de Aula (asistencia.js)
- Modal `abrirPasarLista(grupo, tramo, fecha)`: clase activa AHORA + clases ya comenzadas del día
- Push familias: ausente → inmediato; retraso → al confirmar
- Tab `initAsistenciaVista`: toggle Pasar lista / Informe
- Informe: rango fechas, tabla por alumno, % coloreado (≥90 verde/≥75 ámbar/<75 rojo), export Excel
- Tabla: `asistencia_clase` UNIQUE(centro_id,alumno_id,fecha,tramo)
- `_aEnsureStyles()` idempotente, `_aEsc()` XSS, `_argAttr()` escapa onclick

## Tutorías (tutoria.js)
- Tablas: `tutoria_disponibilidad` + `tutoria_citas` UNIQUE(disp_id,fecha,hora_inicio) + `tutoria_espera`
- Vista profesional: Mis citas (confirmar/cancelar/realizada, notas_tutor) + Mi disponibilidad CRUD
- Vista familia: disponibilidad tutor → date picker → sub-slots cliente → solicitar
- Error 23505 doble reserva → toast explicativo
- Lista de espera: push automático a primera en cola al cancelarse una cita
- Acta PDF: jsPDF on-demand, helpers de `informes.js`
- Push: `_tutPush()` → EF `send-push` fire-and-forget
- `_tutEnsureStyles()` idempotente

## Agenda (agenda.js)
- Split-view: grilla mensual 340px + panel día derecho
- 5 fuentes: sustituciones/tutorías/salidas/ausencias/eventos_centro
- Colores: danger(sust sin cubrir)/ok(cubiertas)/#7A5C9E(tut)/info(salidas)/warning(ausencias)
- `_agFetchEvents(from, to)`: 4 queries paralelas, ausencias multi-día expandidas en cliente
- RLS filtra automáticamente por rol (familia solo ve lo suyo)
- Exportación .ics compatible Google/Outlook/Apple Calendar
- `_agEsc(s)` XSS, `_agEnsureStyles()` idempotente

## Alumnos (alumnos.js)
- Split layout: lista `.al-split` + drawer 3 tabs (Perfil/Horario/Actividad)
- 5 bloques async fire-and-forget: familias, horario mini-grid, comedor dots, incidencias, calificaciones
- `_alSelectedId` persiste entre búsquedas
- Export Excel: SheetJS lista filtrada
- Export PDF ficha: jsPDF+autotable, reutiliza helpers `informes.js`
- Integración ⌘K: `window.alumnosVerFicha(id)` para staff
- `_alEsc()` XSS, `_alArg()` escapa onclick con UUIDs

## Materiales (materiales.js)
- Subida multi-grupo (select multiple), signed URL 1h, toggle Mis materiales/Todos
- Bucket privado `materiales`, path `{centro_id}/…`

## Mensajería (mensajes.js)
- Split: lista hilos 300px + conversación burbujas
- Hilos por alumno_id. Staff ve todos; familia ve los suyos
- Push `_msgPush()` en cada mensaje → EF `send-push`
- Tabla `mensajes`: centro_id, alumno_id, remitente_id, destinatario_ids[], mensaje, leido
- `_msgEsc(s)` XSS

## Encuestas (encuestas.js)
- Tipos: escala(1-5)/opcion/si_no/texto
- Publicar → estado abierta + push familias
- Anti-doble-respuesta: UNIQUE por familia_id+encuesta_id (anónimas: familia_id=NULL)
- `_encGestiona()`: roles que pueden crear/publicar

## Menú comedor (menu.js)
- `window.renderMenuComedor(el, opts)` exportable para home familias
- Edición inline admin: clic celda → textarea → UPSERT
- Tabla `menu_comedor` UNIQUE(centro_id, fecha)

## Recursos (recursos.js)
- Tabs: Préstamos (activos/vencidos/historial) · Inventario CRUD
- Estado vencido: rojo si `fecha_devolucion < hoy`
- Sincroniza `recursos.estado` al prestar/devolver
- Export Excel préstamos histórico (`_recExportar`)
- `_recEsc(s)` XSS

## Actas (actas.js)
- Dictado voz + "✨ Resumir con IA" → JSON acuerdos/pendientes/próximos_pasos
- `_actParseJson`: strip backticks antes de JSON.parse
- Export PDF reutiliza helpers `informes.js`
- `_actEsc(s)` XSS

## Documentos (documentos.js)
- Bucket `documentos-centro`, path `{centro_id}/{uuid}.{ext}`, signed URL 1h
- Familia: solo `visible_para IN ('todos','familias')`
- Categorías: Circular/Normativa/PGA/Calendario/Formulario/Otro
- `_docEsc(s)` XSS

## Agentes IA (agente.js + agentes.js)
- Panel central: 4 tarjetas con dato en vivo + botón lanzar
- Agente sustituciones: plan global, prioriza guardia→libres por equidad, confirmar aplica todo
- Agente RRHH: evalúa solicitudes pendientes vs EBEP/convenio, nunca actúa solo
- Agente comunicación: orden breve → Gemini redacta → preview → confirmar → envío multi-idioma
- Agente orientación: cruza asistencia+notas+incidencias → borradores alerta → orientador confirma
- Agente programado `agente-cobertura-diaria`: pg_cron 06:00 UTC L-V, solo informa (no asigna)

## Plan de cobertura (plancobertura.js)
- `window.planCoberturaDia(fecha)`: modal tabla por tramo, asignación individual
- Diferencia agente: manual (uno a uno) vs agente (plan completo de golpe)
- `_pcEsc(s)` XSS

## Previsión cobertura (prevision.js)
- `window.preverCobertura(dias=14)`: sustituciones sin cubrir próximos N días + sustituto sugerido
- `_prevEsc(s)` XSS

## Participación familiar (participacion.js)
- 6 métricas: push activado / encuestas respondidas / tutorías / autorizaciones salidas / comunicados leídos / promedio global
- Gráfico barras por encuesta (Chart.js inline)
- Tabla `comunicado_lecturas` UNIQUE(comunicado_id, user_id)

## Módulos IB (ib.js)
- Plazos IB, CAS, Extended Essay
- Tablas: `ib_tok`, `ee_borradores`, `ib_resultados`, `extended_essay.nota`
- Solo visible si módulo IB activo en el centro