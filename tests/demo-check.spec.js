// Pre-demo check para DidactIA.
// Verifica que los módulos clave están operativos antes de una reunión de ventas.
// Genera demo-check.html con capturas y estado de cada módulo (conteo dinámico).
// Ejecutar: npm run test:demo  (requiere DEMO_ADMIN_EMAIL y DEMO_ADMIN_PASSWORD en .env)

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const SHOTS_DIR   = path.join(__dirname, '..', 'demo-screenshots');
const REPORT_PATH = path.join(__dirname, '..', 'demo-check.html');
const EMAIL = process.env.DEMO_ADMIN_EMAIL;
const PASS  = process.env.DEMO_ADMIN_PASSWORD;

test('DidactIA — pre-demo check', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!EMAIL || !PASS,
    'Configura DEMO_ADMIN_EMAIL y DEMO_ADMIN_PASSWORD en .env antes de ejecutar');

  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

  // Captura errores de consola (excluye ruido de red habitual)
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  const results = [];

  async function shot(id) {
    const p = path.join(SHOTS_DIR, `${id}.png`);
    await page.screenshot({ path: p });
    return p;
  }

  // Ejecuta fn(), captura screenshot y registra resultado.
  // status: 'ok' | 'warn' (errores de consola) | 'fail' (excepción / assertion)
  async function check(id, label, fn) {
    const errsBefore = consoleErrors.length;
    let status = 'ok', error = '', shotPath = '';

    try {
      await fn();
    } catch (e) {
      status = 'fail';
      error = e.message.replace(/\n/g, ' ').slice(0, 300);
    }

    try { shotPath = await shot(id); } catch {}

    if (status === 'ok') {
      const newErrs = consoleErrors.slice(errsBefore)
        .filter(e => !e.includes('favicon') && !e.includes('net::ERR_ABORTED'));
      if (newErrs.length) {
        status = 'warn';
        error = newErrs.slice(0, 2).join(' | ');
      }
    }

    results.push({ id, label, status, error, shotPath });
  }

  // ── 1. Login ──────────────────────────────────────────────────────────────
  await check('01-login', 'Login', async () => {
    await page.goto('/app.html');
    await page.locator('#login-email').fill(EMAIL);
    await page.locator('#login-pass').fill(PASS);
    await page.getByRole('button', { name: 'Entrar a DidactIA' }).click();
    await expect(page.locator('#app-main')).toBeVisible({ timeout: 20_000 });
  });

  // ── 2. Dashboard — KPIs + nombre del centro ────────────────────────────────
  await check('02-dashboard', 'Dashboard — KPIs + centro', async () => {
    // Nombre del centro en la sidebar
    await expect(page.locator('#ctr-name-hdr'))
      .toContainText('IES Demo', { timeout: 10_000 });
    // Sección admin visible (updateBentoDashboard la muestra para rol admin)
    await expect(page.locator('#inicio-admin')).toBeVisible({ timeout: 8_000 });
    // Métricas accionables de la home (rediseño 2026-06-05; sustituyen a los #bento-*)
    for (const m of ['sust', 'com', 'inc']) {
      await expect(page.locator(`[data-metric="${m}"]`).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── 3. Chatbot — enviar pregunta y verificar respuesta ────────────────────
  await check('03-chat', 'Chatbot IA', async () => {
    // El chat vive en una burbuja flotante (rediseño 2026-06-05): hay que abrirla.
    await page.evaluate(() => {
      if (typeof openAsistente === 'function') openAsistente();
      else if (typeof toggleAsistente === 'function') toggleAsistente();
    });
    const inp = page.locator('#chat-inp');
    await expect(inp).toBeVisible({ timeout: 6_000 });
    const before = await page.locator('#chat-msgs')
      .evaluate(el => el.children.length);
    await inp.fill('¿Qué profesores hay disponibles?');
    await inp.press('Enter');
    // Espera respuesta: al menos 1 hijo nuevo en #chat-msgs
    await page.waitForFunction(
      n => (document.querySelector('#chat-msgs')?.children.length ?? 0) > n,
      before,
      { timeout: 35_000 }
    );
    const chatText = await page.locator('#chat-msgs').innerText();
    if (/error al|ha ocurrido un error|network error/i.test(chatText)) {
      throw new Error('El chatbot devolvió un mensaje de error');
    }
  });

  // ── Helper: navega a un módulo por JS y espera que el panel sea visible ───
  async function navTo(tab) {
    await page.evaluate(t => showTab(t), tab);
    await expect(page.locator(`#panel-${tab}`)).toBeVisible({ timeout: 6_000 });
    await page.waitForTimeout(1_500); // margen para que carguen los datos
  }

  // ── 4. Sustituciones ──────────────────────────────────────────────────────
  await check('04-sust', 'Sustituciones', () => navTo('sust'));

  // ── 5. Comedor ────────────────────────────────────────────────────────────
  await check('05-comedor', 'Comedor', () => navTo('comedor'));

  // ── 6. Incidencias ────────────────────────────────────────────────────────
  await check('06-incidencias', 'Incidencias', () => navTo('incidencias'));

  // ── 7. RRHH ───────────────────────────────────────────────────────────────
  await check('07-rrhh', 'RRHH', () => navTo('rrhh'));

  // ── 8. Planner ────────────────────────────────────────────────────────────
  await check('08-planner', 'Planner', () => navTo('planner'));

  // ── 9. Análisis (Dashboard CMI + Informes PDF) ────────────────────────────
  await check('09-analisis', 'Análisis (CMI + Informes)', () => navTo('analisis'));

  // ── 10. Calificaciones ────────────────────────────────────────────────────
  await check('10-calificaciones', 'Calificaciones', () => navTo('calificaciones'));

  // ── 11. Materiales ────────────────────────────────────────────────────────
  await check('11-materiales', 'Materiales', () => navTo('materiales'));

  // ── 12. Orientación ───────────────────────────────────────────────────────
  await check('12-orientacion', 'Orientación', () => navTo('orientacion'));

  // ── 13. Calidad (SGC) ─────────────────────────────────────────────────────
  await check('13-calidad', 'Calidad (SGC)', () => navTo('calidad'));

  // ── 14. Salidas didácticas ────────────────────────────────────────────────
  await check('14-salidas', 'Salidas didácticas', () => navTo('salidas'));

  // ── Generar demo-check.html ───────────────────────────────────────────────
  generateReport(results);

  const fails = results.filter(r => r.status === 'fail').length;
  if (fails > 0) {
    throw new Error(`${fails} módulo(s) roto(s). Ver demo-check.html para el detalle.`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

function generateReport(results) {
  const ok    = results.filter(r => r.status === 'ok').length;
  const warns = results.filter(r => r.status === 'warn').length;
  const fails = results.filter(r => r.status === 'fail').length;
  const now   = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

  const banner = fails
    ? `<div class="banner banner--fail">❌ ${fails} módulo(s) ROTO(S) — NO hagas la demo hasta resolverlo</div>`
    : warns
    ? `<div class="banner banner--warn">⚠️ ${warns} módulo(s) con errores de consola — revisar</div>`
    : `<div class="banner banner--ok">✅ Todo OK — ${ok}/${results.length} módulos operativos</div>`;

  const rows = results.map(r => {
    const icon = r.status === 'ok' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
    const cls  = r.status === 'fail' ? 'row--fail' : r.status === 'warn' ? 'row--warn' : '';
    const rel  = r.shotPath
      ? path.relative(path.dirname(REPORT_PATH), r.shotPath).replace(/\\/g, '/')
      : '';
    const img  = rel
      ? `<img src="${rel}" alt="Captura ${r.label}" loading="lazy">`
      : '<span class="no-shot">sin captura</span>';
    return `    <tr class="${cls}">
      <td class="col-mod">${icon} <strong>${r.label}</strong></td>
      <td class="col-det">${r.error || '<span class="ok-txt">OK</span>'}</td>
      <td class="col-shot">${img}</td>
    </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DidactIA pre-demo ${now}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #f4f2ee;
    color: #1a1a2e;
    padding: 32px 20px;
    min-height: 100vh;
  }
  .wrap { max-width: 1120px; margin: 0 auto; }
  .header { margin-bottom: 20px; }
  .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .header p  { color: #666; font-size: 13px; }
  .banner {
    padding: 14px 20px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 15px;
    margin-bottom: 24px;
  }
  .banner--ok   { background: #2e7d32; color: #fff; }
  .banner--warn { background: #e65100; color: #fff; }
  .banner--fail { background: #c62828; color: #fff; }
  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,.08);
  }
  thead th {
    background: #1a1a2e;
    color: #fff;
    padding: 11px 16px;
    text-align: left;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  td { padding: 10px 16px; font-size: 13px; vertical-align: middle; border-bottom: 1px solid #eee; }
  tr:last-child td { border-bottom: none; }
  tr.row--fail { background: #fff5f5; }
  tr.row--warn { background: #fffbf0; }
  .col-mod  { width: 200px; white-space: nowrap; }
  .col-det  { color: #555; font-size: 12px; word-break: break-word; max-width: 280px; }
  .col-shot { width: 360px; }
  tr.row--fail .col-det { color: #c62828; font-weight: 600; }
  tr.row--warn .col-det { color: #e65100; }
  .ok-txt   { color: #2e7d32; }
  .no-shot  { color: #bbb; font-style: italic; font-size: 12px; }
  .col-shot img {
    max-height: 190px;
    max-width: 340px;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
    display: block;
    cursor: zoom-in;
  }
  .col-shot img:hover { transform: scale(1.02); transition: transform .15s; }
  .footer { margin-top: 20px; color: #999; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>DidactIA — Pre-demo check</h1>
    <p>Ejecutado: <strong>${now}</strong> &nbsp;·&nbsp; Resultado: <strong>${ok}/${results.length}</strong> módulos OK</p>
  </div>
  ${banner}
  <table>
    <thead>
      <tr>
        <th>Módulo</th>
        <th>Detalle</th>
        <th>Captura</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <p class="footer">Generado automáticamente por <code>npm run test:demo</code></p>
</div>
</body>
</html>`;

  fs.writeFileSync(REPORT_PATH, html, 'utf8');
  console.log(`\n📋 Reporte: ${REPORT_PATH}`);
  console.log(`   ✅ ${ok} OK  ⚠️ ${warns} warn  ❌ ${fails} fail`);
}
