// Aplica las 4 migraciones del portátil que faltan en producción.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/ejecutar-migraciones-laptop.mjs
// O con service role:
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/ejecutar-migraciones-laptop.mjs

const REF   = 'rflfsbrdmgaidhvbuvwb';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token && !srKey) {
  console.error('❌  Falta SUPABASE_ACCESS_TOKEN o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  console.error('    Uso: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/ejecutar-migraciones-laptop.mjs');
  process.exit(1);
}

const MIGRACIONES = [
  {
    nombre: 'asistencia_comedor_tupper',
    sql: `ALTER TABLE public.asistencia_comedor
  ADD COLUMN IF NOT EXISTS tupper boolean NOT NULL DEFAULT false;`
  },
  {
    nombre: 'profiles_idioma',
    sql: `ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS idioma text NOT NULL DEFAULT 'es';`
  },
  {
    nombre: 'mensajes',
    sql: `CREATE TABLE IF NOT EXISTS public.mensajes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id     uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id     uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  alumno_nombre text,
  familia_id    uuid NOT NULL REFERENCES public.profiles(id),
  remitente_id  uuid NOT NULL REFERENCES public.profiles(id),
  de_familia    boolean NOT NULL,
  texto         text NOT NULL,
  leido         boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mensajes' AND policyname='msg_familia'
  ) THEN
    CREATE POLICY "msg_familia" ON public.mensajes FOR ALL
      USING (familia_id = auth.uid())
      WITH CHECK (familia_id = auth.uid() AND remitente_id = auth.uid() AND de_familia = true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mensajes' AND policyname='msg_staff'
  ) THEN
    CREATE POLICY "msg_staff" ON public.mensajes FOR ALL
      USING (
        (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
        OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
            AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia')
      );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_msg_hilo   ON public.mensajes (centro_id, alumno_id, familia_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_familia ON public.mensajes (familia_id, created_at);`
  },
  {
    nombre: 'personas_autorizadas',
    sql: `CREATE TABLE IF NOT EXISTS public.personas_autorizadas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id  uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id  uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  nombre     text NOT NULL,
  relacion   text,
  dni        text,
  telefono   text,
  creado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.personas_autorizadas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='personas_autorizadas' AND policyname='pa_familia'
  ) THEN
    CREATE POLICY "pa_familia" ON public.personas_autorizadas FOR ALL
      USING (alumno_id IN (SELECT alumno_id FROM public.familia_alumno WHERE profile_id = auth.uid()))
      WITH CHECK (alumno_id IN (SELECT alumno_id FROM public.familia_alumno WHERE profile_id = auth.uid()));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='personas_autorizadas' AND policyname='pa_staff'
  ) THEN
    CREATE POLICY "pa_staff" ON public.personas_autorizadas FOR ALL
      USING (
        (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
        OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
            AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia')
      );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pa_alumno ON public.personas_autorizadas (centro_id, alumno_id);`
  }
];

async function ejecutar(nombre, sql) {
  console.log(`\n▶  [${nombre}] Ejecutando…`);

  // Management API (token sbp_xxx)
  if (token) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query: sql })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`❌  Error HTTP ${res.status}:`, JSON.stringify(body));
      return false;
    }
    console.log(`✅  [${nombre}] OK`);
    return true;
  }

  // Service role vía pg_query RPC (si existe)
  const SB_URL = `https://${REF}.supabase.co`;
  const res = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${srKey}`,
      'apikey': srKey
    },
    body: JSON.stringify({ query: sql })
  });
  if (!res.ok) {
    // exec_sql no existe — usa pg_query de postgrest-admin si está habilitado
    console.warn(`⚠  exec_sql RPC no disponible. Usa SUPABASE_ACCESS_TOKEN=sbp_xxx en su lugar.`);
    return false;
  }
  console.log(`✅  [${nombre}] OK via service role`);
  return true;
}

let ok = 0, fail = 0;
for (const m of MIGRACIONES) {
  const res = await ejecutar(m.nombre, m.sql);
  res ? ok++ : fail++;
}

console.log(`\n── Resultado: ${ok} OK · ${fail} fallidas ──`);
if (fail > 0) {
  console.log('\nPara ejecutar manualmente, pega el SQL de cada migración en:');
  console.log('  https://app.supabase.com/project/rflfsbrdmgaidhvbuvwb/sql/new');
}
