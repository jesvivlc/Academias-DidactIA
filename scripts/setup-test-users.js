#!/usr/bin/env node
// Crea o verifica los 4 usuarios de test para los tests de RLS de Playwright.
// Idempotente: si el usuario ya existe en auth, actualiza su profile; no falla.
// Uso: node scripts/setup-test-users.js

const SB_URL = 'https://rflfsbrdmgaidhvbuvwb.supabase.co';
const SR_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SR_KEY) {
  console.error('ERROR: Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  'apikey':        SR_KEY,
  'Authorization': `Bearer ${SR_KEY}`,
};

const AGORA = 'ad0168e8-6c24-4597-8917-ee54cac8234b';
const BUNOL  = 'f91b7c02-f99f-4754-af9b-5b638164ad76';

const TEST_USERS = [
  {
    email:     'test-admin-agora@didactia.eu',
    password:  'RlsT3st#AgorAdmin26',
    full_name: 'Admin Test Agora',
    rol:       'admin',
    centro_id: AGORA,
    envKey:    'TEST_ADMIN_AGORA',
  },
  {
    email:     'test-prof-agora@didactia.eu',
    password:  'RlsT3st#AgorProf26',
    full_name: 'Profe Test Agora',
    rol:       'profesional',
    centro_id: AGORA,
    envKey:    'TEST_PROF_AGORA',
  },
  {
    email:     'test-admin-bunol@didactia.eu',
    password:  'RlsT3st#BunolAdmin26',
    full_name: 'Admin Test Buñol',
    rol:       'admin',
    centro_id: BUNOL,
    envKey:    'TEST_ADMIN_BUNOL',
  },
  {
    email:     'test-prof-bunol@didactia.eu',
    password:  'RlsT3st#BunolProf26',
    full_name: 'Profe Test Buñol',
    rol:       'profesional',
    centro_id: BUNOL,
    envKey:    'TEST_PROF_BUNOL',
  },
  {
    email:      'test-familia-agora@didactia.eu',
    password:   'RlsT3st#AgorFam26',
    full_name:  'Familia Test Agora',
    rol:        'familia',
    centro_id:  AGORA,
    envKey:     'TEST_FAMILIA_AGORA',
    linkAlumno: true,   // se vincula a un alumno de Agora (preferentemente con notas)
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createAuthUser(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method:  'POST',
    headers: AUTH_HEADERS,
    body:    JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json();
  if (res.ok) return { id: body.id, created: true };
  if (res.status === 422 || (body.msg || body.message || '').toLowerCase().includes('already')) {
    return { id: null, created: false, alreadyExists: true };
  }
  throw new Error(`Auth create failed [${res.status}]: ${JSON.stringify(body)}`);
}

async function findAuthUserByEmail(email) {
  // Supabase admin users list — paginar hasta encontrar el email
  let page = 1;
  while (true) {
    const res = await fetch(
      `${SB_URL}/auth/v1/admin/users?page=${page}&per_page=200`,
      { headers: AUTH_HEADERS }
    );
    if (!res.ok) throw new Error(`Admin users list failed [${res.status}]`);
    const body = await res.json();
    const users = body.users ?? body;
    if (!Array.isArray(users) || users.length === 0) break;
    const found = users.find(u => u.email === email);
    if (found) return found.id;
    if (users.length < 200) break;
    page++;
  }
  return null;
}

async function upsertProfile(id, { email, full_name, rol, centro_id }) {
  const res = await fetch(`${SB_URL}/rest/v1/profiles`, {
    method:  'POST',
    headers: {
      ...AUTH_HEADERS,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      id, user_id: id, email, full_name, rol, centro_id, activo: true,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Profile upsert failed [${res.status}]: ${txt}`);
  }
}

// Devuelve el id de un alumno del centro, preferentemente uno que tenga
// calificaciones (para que el test "la familia ve sus notas" sea significativo).
async function findAlumnoForCentro(centro_id) {
  // 1) alumno con calificaciones
  const rCal = await fetch(
    `${SB_URL}/rest/v1/calificaciones?centro_id=eq.${centro_id}&select=alumno_id&limit=1`,
    { headers: AUTH_HEADERS }
  );
  if (rCal.ok) {
    const c = await rCal.json();
    if (Array.isArray(c) && c[0] && c[0].alumno_id) return c[0].alumno_id;
  }
  // 2) cualquier alumno del centro
  const rAl = await fetch(
    `${SB_URL}/rest/v1/alumnos?centro_id=eq.${centro_id}&select=id&limit=1`,
    { headers: AUTH_HEADERS }
  );
  if (rAl.ok) {
    const a = await rAl.json();
    if (Array.isArray(a) && a[0] && a[0].id) return a[0].id;
  }
  return null;
}

// Vincula familia↔alumno de forma idempotente (no duplica si ya existe).
async function ensureFamiliaLink(profile_id, alumno_id) {
  const exists = await fetch(
    `${SB_URL}/rest/v1/familia_alumno?profile_id=eq.${profile_id}&alumno_id=eq.${alumno_id}&select=alumno_id`,
    { headers: AUTH_HEADERS }
  );
  if (exists.ok) {
    const rows = await exists.json();
    if (Array.isArray(rows) && rows.length) return false; // ya vinculado
  }
  const res = await fetch(`${SB_URL}/rest/v1/familia_alumno`, {
    method:  'POST',
    headers: { ...AUTH_HEADERS, 'Prefer': 'return=minimal' },
    body:    JSON.stringify({ profile_id, alumno_id }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`familia_alumno insert failed [${res.status}]: ${txt}`);
  }
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function provision(user) {
  let { id, created, alreadyExists } = await createAuthUser(user.email, user.password);

  if (alreadyExists) {
    id = await findAuthUserByEmail(user.email);
    if (!id) throw new Error(`No se encontró UUID para ${user.email} en auth.users`);
  }

  await upsertProfile(id, user);

  const tag = created ? '✅ creado' : '🔄 ya existía → profile sincronizado';
  console.log(`  ${tag}: ${user.email}  (${user.rol} · ${user.centro_id.slice(0, 8)}...)`);

  // Vincular un alumno si procede (cuentas familia)
  if (user.linkAlumno) {
    const alumnoId = await findAlumnoForCentro(user.centro_id);
    if (!alumnoId) {
      console.warn(`     ⚠️ No se encontró ningún alumno en el centro para vincular a ${user.email}`);
    } else {
      const nuevo = await ensureFamiliaLink(id, alumnoId);
      console.log(`     ${nuevo ? '🔗 vinculado' : '🔗 ya vinculado'} a alumno ${alumnoId.slice(0, 8)}...`);
    }
  }

  return { ...user, id };
}

async function main() {
  console.log('\n🔧 Provisionando usuarios de test RLS...\n');
  const results = [];
  for (const user of TEST_USERS) {
    try {
      const r = await provision(user);
      results.push({ ok: true, ...r });
    } catch (err) {
      console.error(`  ❌ Error con ${user.email}: ${err.message}`);
      results.push({ ok: false, ...user });
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log('\n─────────────────────────────────────────────────────');
  if (failed.length === 0) {
    console.log('✅ Todos los usuarios listos.\n');
    console.log('Variables para .env:');
    for (const r of results) {
      console.log(`${r.envKey}_EMAIL=${r.email}`);
      console.log(`${r.envKey}_PASSWORD=${r.password}`);
    }
  } else {
    console.log(`❌ Fallaron ${failed.length} usuarios. Revisar errores arriba.`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
