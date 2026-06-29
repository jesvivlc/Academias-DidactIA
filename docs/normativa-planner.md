# Restricciones normativas del Planner — DidactIA (Agora Lledó)

> Documento de referencia destilado de 4 fuentes legales. **No hace falta volver a leer los PDFs originales.**
> Fuentes: (1) Resolución 7 jul 2025 organización ESO+Bach 25-26 CV; (2) XI Convenio Colectivo enseñanza
> privada sin nivel concertado; (3) Decreto 107/2022 (ESO); (4) Decreto 108/2022 (Bachillerato).
> Agora = centro privado **sin nivel concertado** → aplica el convenio (2).

---

## 1. Estructura de la jornada (Resolución 7 jul 2025, §4.2.1.2.a)

- **5 a 8** sesiones lectivas al día, de lunes a viernes.
- Duración de sesión: **mínimo 55 min** (los 45 min solo aplican a bachillerato nocturno modelo B; no es el caso).
- **Descanso** tras cada 2 o 3 sesiones; el primer descanso ≥ **20 min**.
- Horario del alumnado dentro de la franja **8:00–18:00**.
- Los horarios se suben a **ITACA 3 antes del 30 de septiembre**.

⚠️ **Flag a verificar con Salva:** los tramos actuales de Agora son de **50 min** (08:50–09:40, etc.), por debajo
del mínimo legal de 55. O Agora tiene horario especial autorizado por la dirección territorial, o las horas
reales difieren. Confirmar antes de subir horarios a ITACA.

## 2. Límites del profesorado (XI Convenio enseñanza privada no concertada)

Restricciones **duras** que el motor puede validar por profesor (jornada completa):

- **Máx. 27 horas lectivas/semana** (art. 28). Cómputo anual: 1089 h lectivas + 237 complementarias + 50 formación (art. 33).
- **Máx. 8 horas/día** (lectivas + complementarias incluidas) (art. 28).
- **Sesión lectiva ≤ 60 min** (Anexo II). → Combinado con la Resolución: sesión entre **55 y 60 min**.
- **≥ 12 horas** entre el fin de una jornada y el inicio de la siguiente (art. 31).
- Cargos (Director, Subdirector, Jefe de Estudios, Jefe de Departamento): dedican **+5 h/sem** a su función
  → tienen menos horas lectivas disponibles (art. 30).
- **Tiempo parcial:** la disponibilidad se define por contrato → es un *input* del Planner, no una regla fija.

## 3. Horas lectivas por materia — ESO (Decreto 107/2022, Anexo V)

| Materia | 1º | 2º | 3º | 4º |
|---|----|----|----|----|
| Valenciano: Lengua y Literatura | 3 | 3 | 3 | 3 |
| Lengua Castellana y Literatura | 3 | 3 | 3 | 3 |
| Lengua Extranjera | 3 | 4 | 4 | 3 |
| Geografía e Historia | 3 | 3 | 3 | 3 |
| Educación Física | 2 | 2 | 2 | 2 |
| Matemáticas | 3 | 4 | 4 | 4 (A o B) |
| Proyectos Interdisciplinarios | 2 | 2 | 2 | — |
| Educación en Valores Cívicos y Éticos | — | — | — | 2 |
| Biología y Geología | 3 | — | 2 | opción |
| Física y Química | — | 3 | 2 | opción |
| Educación Plástica, Visual y Audiovisual | — | 2 | 2 | opción (Expresión Artística) |
| Música | 2 | 2 | — | opción |
| Tecnología y Digitalización | 2 | — | 2 | — |
| Materias de opción (4º: elegir 3) | — | — | — | 3 c/u |
| 1 optativa | 2 | 2 | 2 | 2 |
| Tutoría | 1 | 1 | 1 | 1 |
| Religión (opcional) | 1 | 1 | 1 | 1 |

## 4. Horas lectivas por materia — Bachillerato (Decreto 108/2022, Anexo IV)

Comunes idénticas en todas las modalidades:

**1º Bach — comunes:** Educación Física 3 · Filosofía 3 · Valenciano LL I 3 · Lengua Castellana LL I 3 · Lengua Extranjera I 3.
**2º Bach — comunes:** Historia de la Filosofía 3 · Historia de España 3 · Valenciano LL II 3 · Lengua Castellana LL II 3 · Lengua Extranjera II 3.

En ambos cursos, además:
- **Tutoría:** 1 h · **Religión (opcional):** 1 h.
- **De modalidad:** 1 obligatoria (4 h) + 2 a elegir (4 h c/u) = **3 materias × 4 h**.
- **Optativa:** elegir una (**4 h**).

Carga típica de un alumno de Bach ≈ 5 comunes×3 (15) + tutoría 1 + 3 modalidad×4 (12) + 1 optativa×4 (4) = **~32 h/sem**.

## 5. Lo que NO está en ninguna norma — input de Salva

Estas restricciones no salen de ningún PDF; las define el centro y deben estructurarse como entrada del Planner:

- **Incompatibilidades de materias** (p. ej. Dibujo y Latín no pueden coincidir; profes que deben coincidir 1 h para tutoría).
- **Bloques dobles** (laboratorios, etc.).
- **Disponibilidad de cada profesor** (días/franjas, especialmente media jornada).
- **Criterios pedagógicos del PEC/NOFC** del centro.

## Notas y matices

- **Decreto 66/2024** modifica el 107/2022 (ESO). La tabla §3 procede del texto original de 2022;
  si alguna hora concreta cambió, verificar contra el 66/2024 antes de usarla como validación estricta.
- **Agora es centro IB:** su distribución horaria responde también a requisitos del IB Diploma y a su PEC,
  además de a los mínimos valencianos. Como centro privado tiene flexibilidad.
- **Regla "máx. N sesiones de una materia por día":** NO es mandato legal de la Resolución; es autonomía
  pedagógica del centro. Se añade como buena práctica (ceil(horas_semanales/5)), no como obligación.
- Para el motor, lo realmente nuevo aquí son los **límites del profesorado** (§2) como validación; el resto
  (estructura de jornada §1, horas por materia §3-4) ya viene reflejado en los tramos y en las necesidades.
