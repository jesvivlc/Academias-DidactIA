-- Mensajería familia ↔ centro (sobre un alumno). Hilo por (alumno_id, familia_id).
CREATE TABLE IF NOT EXISTS public.mensajes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id     uuid NOT NULL REFERENCES public.centros(id) ON DELETE CASCADE,
  alumno_id     uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  alumno_nombre text,
  familia_id    uuid NOT NULL REFERENCES public.profiles(id),
  remitente_id  uuid NOT NULL REFERENCES public.profiles(id),
  de_familia    boolean NOT NULL,        -- true: familia→centro · false: centro→familia
  texto         text NOT NULL,
  leido         boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;

-- Familia: solo su propio hilo
CREATE POLICY "msg_familia" ON public.mensajes FOR ALL
  USING (familia_id = auth.uid())
  WITH CHECK (familia_id = auth.uid() AND remitente_id = auth.uid() AND de_familia = true);

-- Staff del centro (no familia): acceso completo a los hilos del centro
CREATE POLICY "msg_staff" ON public.mensajes FOR ALL
  USING (
    (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
    OR (centro_id = (SELECT centro_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT rol FROM public.profiles WHERE id = auth.uid()) <> 'familia')
  );

CREATE INDEX IF NOT EXISTS idx_msg_hilo   ON public.mensajes (centro_id, alumno_id, familia_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_familia ON public.mensajes (familia_id, created_at);
