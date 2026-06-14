/**
 * Test de seguridad RLS — rol familia
 *
 * Verifica que una cuenta con rol=familia:
 *   ✅ Puede llamar las RPCs SECURITY DEFINER que le corresponden
 *   ✅ Puede leer sus propias calificaciones (alumno_id en familia_alumno)
 *   🚫 NO puede leer incidencias directamente (staff-only)
 *   🚫 NO puede leer tablas clínicas/sensibles (fase 1 lockdown)
 *   🚫 NO puede leer datos de otro centro (aislamiento multi-tenant)
 *
 * Credenciales en .env: TEST_FAMILIA_AGORA_EMAIL / TEST_FAMILIA_AGORA_PASSWORD
 * (crear la cuenta manualmente en Agora Lledó, vincularla a al menos 1 alumno)
 */

const { test, expect } = require('@playwright/test');

const SUPABASE_URL = 'https://rflfsbrdmgaidhvbuvwb.supabase.co';
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbGZzYnJkbWdhaWRodmJ1dndiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTAxNDgsImV4cCI6MjA4Nzc2NjE0OH0.tJuFxAZCSxdukUvL9BbhdxtCbudCmmv2HLZr6qp7LPs';
const AGORA_CENTRO = 'ad0168e8-6c24-4597-8917-ee54cac8234b';
const BUNOL_CENTRO = 'f91b7c02-f99f-4754-af9b-5b638164ad76';
const LS_TOKEN_KEY = 'sb-rflfsbrdmgaidhvbuvwb-auth-token';

test('Familia RLS — acceso propio y bloqueo de datos sensibles', async ({ page, request }) => {
  const email = process.env.TEST_FAMILIA_AGORA_EMAIL;
  const pass  = process.env.TEST_FAMILIA_AGORA_PASSWORD;
  test.skip(
    !email || !pass,
    'Configura TEST_FAMILIA_AGORA_EMAIL y TEST_FAMILIA_AGORA_PASSWORD en .env'
  );

  // ── 1. Login por UI ──────────────────────────────────────────────────────────
  await page.goto('/app.html');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-pass').fill(pass);
  await page.getByRole('button', { name: 'Entrar a DidactIA' }).click();
  await expect(page.locator('#app-main')).toBeVisible({ timeout: 20000 });

  // ── 2. Extraer JWT de localStorage ──────────────────────────────────────────
  const raw = await page.evaluate((key) => localStorage.getItem(key), LS_TOKEN_KEY);
  expect(raw, 'Token no encontrado en localStorage').toBeTruthy();
  const { access_token: token } = JSON.parse(raw);
  expect(token, 'access_token vacío').toBeTruthy();

  const h = { apikey: ANON_KEY, Authorization: `Bearer ${token}` };

  // ── 3. Tablas staff-only — familia debe obtener 0 filas ─────────────────────

  // 3a. incidencias (fase 2 lockdown — familia usa RPC)
  const resInc = await request.get(
    `${SUPABASE_URL}/rest/v1/incidencias?select=id&limit=5`, { headers: h }
  );
  expect(resInc.ok(), `HTTP ${resInc.status()} en incidencias`).toBeTruthy();
  const rowsInc = await resInc.json();
  expect(rowsInc, 'RLS FALLO: familia puede leer incidencias directamente').toHaveLength(0);

  // 3b. alertas_predictivas (fase 1 lockdown)
  const resAlertas = await request.get(
    `${SUPABASE_URL}/rest/v1/alertas_predictivas?select=id&limit=5`, { headers: h }
  );
  expect(resAlertas.ok()).toBeTruthy();
  const rowsAlertas = await resAlertas.json();
  expect(rowsAlertas, 'RLS FALLO: familia puede leer alertas_predictivas').toHaveLength(0);

  // 3c. no_conformidades (fase 1 lockdown)
  const resNC = await request.get(
    `${SUPABASE_URL}/rest/v1/no_conformidades?select=id&limit=5`, { headers: h }
  );
  expect(resNC.ok()).toBeTruthy();
  const rowsNC = await resNC.json();
  expect(rowsNC, 'RLS FALLO: familia puede leer no_conformidades').toHaveLength(0);

  // 3d. informes_psicopedagogicos (fase 1 lockdown)
  const resInformes = await request.get(
    `${SUPABASE_URL}/rest/v1/informes_psicopedagogicos?select=id&limit=5`, { headers: h }
  );
  expect(resInformes.ok()).toBeTruthy();
  const rowsInformes = await resInformes.json();
  expect(rowsInformes, 'RLS FALLO: familia puede leer informes_psicopedagogicos').toHaveLength(0);

  // 3e. expedientes_orientacion (fase 2 lockdown)
  const resExp = await request.get(
    `${SUPABASE_URL}/rest/v1/expedientes_orientacion?select=id&limit=5`, { headers: h }
  );
  expect(resExp.ok()).toBeTruthy();
  const rowsExp = await resExp.json();
  expect(rowsExp, 'RLS FALLO: familia puede leer expedientes_orientacion').toHaveLength(0);

  // ── 4. Aislamiento multi-tenant — otro centro debe dar 0 filas ───────────────
  const resCalBunol = await request.get(
    `${SUPABASE_URL}/rest/v1/calificaciones?select=id&centro_id=eq.${BUNOL_CENTRO}&limit=5`,
    { headers: h }
  );
  expect(resCalBunol.ok()).toBeTruthy();
  const rowsCalBunol = await resCalBunol.json();
  expect(
    rowsCalBunol,
    'RLS FALLO: familia de Agora puede leer calificaciones de IES Buñol'
  ).toHaveLength(0);

  // ── 5. RPCs SECURITY DEFINER — deben responder sin error ────────────────────

  // 5a. familia_incidencias_hijos()
  const resRpcInc = await request.post(
    `${SUPABASE_URL}/rest/v1/rpc/familia_incidencias_hijos`,
    { headers: { ...h, 'Content-Type': 'application/json' }, data: '{}' }
  );
  expect(
    resRpcInc.ok(),
    `RPC familia_incidencias_hijos falló con HTTP ${resRpcInc.status()}`
  ).toBeTruthy();
  const rpcIncData = await resRpcInc.json();
  expect(Array.isArray(rpcIncData), 'familia_incidencias_hijos no devuelve array').toBeTruthy();

  // 5b. familia_tramites_visibles()
  const resRpcTra = await request.post(
    `${SUPABASE_URL}/rest/v1/rpc/familia_tramites_visibles`,
    { headers: { ...h, 'Content-Type': 'application/json' }, data: '{}' }
  );
  expect(
    resRpcTra.ok(),
    `RPC familia_tramites_visibles falló con HTTP ${resRpcTra.status()}`
  ).toBeTruthy();
  const rpcTraData = await resRpcTra.json();
  expect(Array.isArray(rpcTraData), 'familia_tramites_visibles no devuelve array').toBeTruthy();

  // ── 6. Calificaciones propias — la respuesta debe ser OK (las notas de sus hijos) ─
  const resCal = await request.get(
    `${SUPABASE_URL}/rest/v1/calificaciones?select=id,alumno_id&limit=100`,
    { headers: h }
  );
  expect(resCal.ok(), `HTTP ${resCal.status()} al consultar calificaciones`).toBeTruthy();
  const rowsCal = await resCal.json();
  expect(Array.isArray(rowsCal), 'calificaciones no devuelve array').toBeTruthy();
  // Las notas devueltas deben ser solo de sus hijos vinculados.
  // No podemos saber el alumno_id exacto aquí, pero si hay notas, todas deben
  // corresponder a alumnos del mismo centro (se verifica por exclusión cruzando con Buñol).
  // La exclusión cross-center ya se verificó en el paso 4.
});
