// Test de aislamiento multi-tenant: un admin de Agora Lledó no puede ver datos de IES Buñol.
// Credenciales en .env (ver .env.example). La anon key es pública (ya está en js/config.js).
const { test, expect } = require('@playwright/test');

const SUPABASE_URL  = 'https://rflfsbrdmgaidhvbuvwb.supabase.co';
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbGZzYnJkbWdhaWRodmJ1dndiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTAxNDgsImV4cCI6MjA4Nzc2NjE0OH0.tJuFxAZCSxdukUvL9BbhdxtCbudCmmv2HLZr6qp7LPs';
const AGORA_CENTRO  = 'ad0168e8-6c24-4597-8917-ee54cac8234b';
const BUNOL_CENTRO  = 'f91b7c02-f99f-4754-af9b-5b638164ad76';
const LS_TOKEN_KEY  = 'sb-rflfsbrdmgaidhvbuvwb-auth-token';

test('Admin de Agora no puede leer alumnos de IES Buñol (RLS multi-tenant)', async ({ page, request }) => {
  const email = process.env.AGORA_ADMIN_EMAIL;
  const pass  = process.env.AGORA_ADMIN_PASSWORD;
  test.skip(
    !email || !pass,
    'Configura AGORA_ADMIN_EMAIL y AGORA_ADMIN_PASSWORD en .env antes de ejecutar'
  );

  // ── a) Login por UI ──────────────────────────────────────────────────────────
  await page.goto('/app.html');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-pass').fill(pass);
  await page.getByRole('button', { name: 'Entrar a DidactIA' }).click();

  // ── b) Verificar contenido propio de Agora ───────────────────────────────────
  // #app-main pasa de display:none a display:flex tras loadUserProfile
  await expect(page.locator('#app-main')).toBeVisible({ timeout: 20000 });
  // #ctr-name-hdr se rellena con ctrName del centro (auth.js línea 329/343)
  await expect(page.locator('#ctr-name-hdr')).toContainText(/Agora|Lledó/i, { timeout: 15000 });

  // ── c) Extraer access_token desde localStorage ───────────────────────────────
  const raw = await page.evaluate((key) => localStorage.getItem(key), LS_TOKEN_KEY);
  expect(raw, 'Token de sesión no encontrado en localStorage').toBeTruthy();
  const { access_token: accessToken } = JSON.parse(raw);
  expect(accessToken, 'access_token vacío en la sesión').toBeTruthy();

  const authHeaders = {
    apikey:        ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  };

  // ── d) Cross-tenant: alumnos de IES Buñol → 0 filas (RLS debe bloquear) ─────
  const resBunol = await request.get(
    `${SUPABASE_URL}/rest/v1/alumnos?select=id&centro_id=eq.${BUNOL_CENTRO}`,
    { headers: authHeaders }
  );
  expect(resBunol.ok(), `HTTP ${resBunol.status()} al consultar alumnos de Buñol`).toBeTruthy();
  const rowsBunol = await resBunol.json();
  expect(
    rowsBunol,
    'RLS FALLO: un admin de Agora puede leer alumnos de IES Buñol'
  ).toHaveLength(0);

  // ── e) Sanidad: alumnos propios de Agora → >0 filas (el token funciona) ──────
  const resAgora = await request.get(
    `${SUPABASE_URL}/rest/v1/alumnos?select=id&centro_id=eq.${AGORA_CENTRO}`,
    { headers: authHeaders }
  );
  expect(resAgora.ok(), `HTTP ${resAgora.status()} al consultar alumnos de Agora`).toBeTruthy();
  const rowsAgora = await resAgora.json();
  expect(
    rowsAgora.length,
    'Sanidad fallida: el token no devuelve alumnos del propio centro Agora'
  ).toBeGreaterThan(0);
});
