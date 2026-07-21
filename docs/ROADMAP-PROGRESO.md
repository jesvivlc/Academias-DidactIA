# DidactIA Academias — Bitácora del roadmap

> Backend: Supabase `izdqpsenrjcqtuhjhqxo` · Producción: https://didactia-academias.vercel.app
> Demo pública: `demo@didactia.eu` / `DemoAcademias2026!` (academia «Academia Demo DidactIA»).
>
> **Histórico completo en `docs/ROADMAP-ARCHIVE.md`** — no se carga automáticamente; consúltalo
> a mano para rastrear una decisión pasada. Protocolo de rotación en CLAUDE.md →
> "Mantenimiento de la documentación".

## Estado actual

- **Fases 1–6 + backlog #1–#12: COMPLETOS**, desplegados y verificados. 19 módulos, IA con Gemini
  y email real con Resend. → detalle y resumen de cierre en `ROADMAP-ARCHIVE.md`.
- **Fases 8–14 (sesión 2026-07-21): paridad competitiva y capa de negocio.** Facturación
  Verifactu + remesas SEPA, captación con embudo, firma digital, check-in QR, pasarela Stripe,
  campus virtual, gastos/resultados/fichaje y panel de operador. → detalle módulo a módulo en
  `CLAUDE.md` (§ Estructura de archivos JS) y origen de las decisiones en
  `docs/BENCHMARK-COMPETENCIA.md`.
- **Auditoría RLS (2026-07-14):** fuga en `alumnos` y en los códigos de `centros`, corregida en
  `sql/fix-rls-alumnos-registro.sql` y **ya aplicada en producción**. → detalle en `ROADMAP-ARCHIVE.md`.
- **Estado por fases y los 28 incrementos del registro** (fase 1 · inc.1 → auditoría 2026-07-14):
  archivados verbatim. → `ROADMAP-ARCHIVE.md`.

## Pendiente

1. **Seguridad — rotar credenciales compartidas en chat:** el PAT `sbp_…` usado el 2026-07-21, la
   `service_role`, la secret key, y las claves de **Gemini** y **Resend**. La contraseña del admin
   ya se rotó (la de `CLAUDE.md` está obsoleta).
2. **Stripe:** el circuito está completo y las dos Edge Functions desplegadas, pero inerte hasta
   que cada academia pegue sus claves en Facturación → Pago online.
3. **Verifactu:** el registro de facturación es conforme y está listo para remitirse; el envío
   efectivo a la AEAT exige el certificado digital de cada academia.
4. **WhatsApp / Instagram / Facebook:** asistente de WhatsApp y autopublicación requieren
   WhatsApp Business API / Meta Graph API → sigue como hook.
5. **VAPID** → notificaciones push, sin configurar.
6. **Sin pruebas en navegador real** de lo construido el 2026-07-21: arrastrar tarjetas del embudo,
   la cámara del check-in y el lienzo de firma en móvil están verificados solo contra la base.

> **CI/CD:** repo conectado a Vercel (rama `main` → producción). Cada `git push` despliega solo.
