# Guía de prueba — Portal familia: PWA instalable + notificaciones push

> Valida de extremo a extremo lo construido en la sesión 2026-06-16/17:
> instalar la app en el móvil + recibir avisos push + descargar el boletín PDF.

## Estado de la infraestructura (verificado 2026-06-17)

- ✅ Tabla `push_subscriptions` operativa (RLS `push_own` + `push_superadmin`).
- ✅ `VAPID_PUBLIC_KEY` real en `js/config.js`; secrets VAPID configurados en la EF `send-push`.
- ✅ EF `send-push` desplegada.
- ℹ️ **0 suscripciones** ahora mismo → nadie ha activado push todavía. Esta prueba crea la primera.

## Requisitos

1. Una **cuenta familia** del centro de pruebas (Agora o Buñol) **vinculada a ≥1 alumno**.
   - Si no tienes una: Usuarios → Invitar → rol **Familia** → vincular un alumno.
   - (Para el RLS hay una cuenta de test: `test-familia-agora@didactia.eu`, creada por `npm run setup:test-users`.)
2. Un **móvil** (o navegador de escritorio Chrome/Edge/Firefox para una primera prueba rápida).
3. Acceso a **https://didactia.eu/app.html** (el push **requiere HTTPS** — no funciona en `file://` ni `http://`).

---

## Parte 1 — Instalar la PWA

### Android (Chrome)
1. Abre **https://didactia.eu/app.html** e inicia sesión como familia.
2. En la home aparece el banner **"📲 Instala DidactIA en tu móvil…"** → botón **Instalar** → acepta el diálogo del sistema.
   - Alternativa: menú ⋮ de Chrome → "Instalar aplicación" / "Añadir a pantalla de inicio".
3. La app aparece en el cajón de aplicaciones y abre **directamente el portal** (`start_url` = `/app.html`), sin barra del navegador.

### iPhone / iPad (Safari) — **obligatorio para recibir push en iOS**
> iOS solo permite Web Push si la app está **instalada en la pantalla de inicio** (iOS 16.4+).
1. Abre **https://didactia.eu/app.html** en **Safari** (no Chrome iOS).
2. El banner muestra la instrucción: pulsa **Compartir** (cuadro con flecha) → **Añadir a pantalla de inicio** → Añadir.
3. Abre DidactIA **desde el icono de la pantalla de inicio** (no desde Safari) para el resto de la prueba.

---

## Parte 2 — Activar las notificaciones push

1. Con sesión de familia abierta (en la PWA instalada si es iOS), en la home aparece el banner **"🔔 Activa las notificaciones para recibir avisos del centro"** → **Activar**.
2. Acepta el permiso de notificaciones del navegador/sistema.
3. Toast **"✅ Notificaciones activadas"** → se ha creado la suscripción.

**Comprobar que la suscripción se guardó** (opcional, SQL Editor de Supabase o Management API):
```sql
select ps.created_at, p.full_name, p.rol
from push_subscriptions ps join profiles p on p.id = ps.user_id
order by ps.created_at desc;
```
Debe aparecer 1 fila para la cuenta familia.

> Si no sale el banner: puede que ya estés suscrito, que lo cerraras antes
> (localStorage `push_dismissed_<userId>`), que el navegador no soporte push, o
> (iOS) que no hayas abierto la app desde el icono instalado.

---

## Parte 3 — Disparar y verificar cada aviso

Con **otra cuenta** (profesor/admin del mismo centro, en otro dispositivo o navegador),
provoca cada evento y comprueba que llega la notificación al móvil de la familia
(con la app **cerrada o en segundo plano** es la prueba más realista). Al tocar la
notificación debe abrir/enfocar `/app.html`.

| Evento | Cómo dispararlo (cuenta staff) | Notificación esperada |
|--------|-------------------------------|------------------------|
| 📢 **Comunicado** | Comunicados → escribir → destinatarios **Todos** o el **grupo del alumno** → Enviar | "📢 Nuevo comunicado" + título |
| 📝 **Nueva nota** | Calificaciones (profesor) → grupo/asignatura/evaluación del alumno → **cambiar su nota** → Guardar | "📝 Nueva calificación" + nombre + asignatura |
| ⚠️ **Incidencia** | Incidencias (admin) → registrar una del alumno → botón **📧 Familia** | "⚠️ Comunicación del centro" |
| 🚌 **Salida** | Salidas → crear/publicar una salida que incluya el **grupo del alumno** | push al publicar |
| 📋 **Asistencia** | Pasar lista → marcar al alumno **Ausente** | "⚠️ Ausencia en clase" |
| 🍽️ **Comedor** | Comedor → marcar que el alumno **no se queda** (o esperar al workflow n8n) | aviso de comedor |

**Mínimo recomendado para validar el canal:** prueba **Comunicado (Todos)** y **Nueva nota** — son los más rápidos.

---

## Parte 4 — Boletín de notas en PDF

1. Cuenta **familia** → pestaña **Calificaciones** → botón **⬇ Boletín PDF**.
2. Se descarga `boletin_<nombre>_<fecha>.pdf` con cabecera del centro (logo+color) y la tabla de notas por asignatura/evaluación.
3. (Dirección) En Calificaciones → abrir un alumno → **⬇ Boletín PDF** en su ficha hace lo mismo para cualquier alumno.

---

## Resolución de problemas

- **Push se activa pero no llega nada:**
  1. Confirma que hay fila en `push_subscriptions` para la familia (SQL de arriba).
  2. Confirma que la familia es **destinataria** del evento (p.ej. el comunicado a "solo_profesores" NO le llega; la nota solo si **cambió**).
  3. La EF `send-push` borra automáticamente suscripciones caducadas (410/404); si cambiaste de dispositivo, vuelve a Activar.
- **iOS no recibe nada:** asegúrate de haber **instalado** la app (Parte 1) y de abrirla **desde el icono**; iOS no soporta push en Safari normal.
- **No aparece el banner de instalar:** ya está instalada (modo standalone), o el navegador no ofrece instalación, o lo cerraste antes (localStorage `pwa_banner_dismissed`). En escritorio, el icono de instalar suele estar en la barra de direcciones.
- **El icono se ve genérico en iOS:** los iconos son SVG; iOS prefiere PNG. Funcionalmente la instalación va; para iconos perfectos en iOS habría que añadir PNGs al repo.

## Limitaciones conocidas

- **iOS**: push solo con la PWA instalada (iOS 16.4+). En Safari normal no hay push.
- **Iconos**: SVG inline (no hay PNG en el repo) → Android OK; iOS puede usar una captura como icono.
- **Push = "hay novedad", no el contenido sensible**: por privacidad, las notificaciones avisan (p.ej. "nueva calificación") pero **no** muestran el valor/detalle; el dato real queda tras login con su RLS.
