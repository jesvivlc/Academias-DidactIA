-- Push notification subscriptions (Web Push API)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  centro_id    uuid REFERENCES public.centros(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  created_at   timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo ve y gestiona la suya propia
CREATE POLICY "push_own" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Superadmin ve todas
CREATE POLICY "push_superadmin" ON public.push_subscriptions
  FOR ALL USING (
    (SELECT rol FROM public.profiles WHERE user_id = auth.uid()) = 'superadmin'
  );

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions (user_id);
CREATE INDEX idx_push_subscriptions_centro ON public.push_subscriptions (centro_id);
