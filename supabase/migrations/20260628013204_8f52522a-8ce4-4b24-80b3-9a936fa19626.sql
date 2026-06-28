
CREATE TYPE public.app_role AS ENUM ('customer','worker','admin');
CREATE TYPE public.request_status AS ENUM ('open','matched','arrived','in_progress','completed','canceled');
CREATE TYPE public.payment_status AS ENUM ('pending','paid','refunded','partially_refunded','failed');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  rating NUMERIC(3,2) DEFAULT 5.00,
  rating_count INT DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  stripe_account_id TEXT,
  stripe_account_ready BOOLEAN DEFAULT false,
  id_photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- requests
CREATE TABLE public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  store_address TEXT,
  desired_time TIMESTAMPTZ,
  notes TEXT,
  status public.request_status NOT NULL DEFAULT 'open',
  is_peak BOOLEAN NOT NULL DEFAULT false,
  base_fee INT NOT NULL DEFAULT 800,
  peak_fee INT NOT NULL DEFAULT 0,
  extra_fee INT NOT NULL DEFAULT 0,
  time_fee INT NOT NULL DEFAULT 0,
  total_fee INT NOT NULL DEFAULT 800,
  estimated_wait_minutes INT DEFAULT 30,
  actual_wait_minutes INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;

-- matches
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  arrival_time TIMESTAMPTZ,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  rating INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

-- checkins
CREATE TABLE public.checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  location_lat NUMERIC(10,7),
  location_lng NUMERIC(10,7),
  wait_time INT,
  photo_url TEXT,
  note TEXT
);
GRANT SELECT, INSERT ON public.checkins TO authenticated;
GRANT ALL ON public.checkins TO service_role;

-- payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  platform_fee INT NOT NULL DEFAULT 0,
  worker_payout INT NOT NULL DEFAULT 0,
  refund_amount INT NOT NULL DEFAULT 0,
  status public.payment_status NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  stripe_client_secret TEXT,
  kind TEXT NOT NULL DEFAULT 'main',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

-- Now enable RLS and policies (all tables exist)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select all auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles select own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests select" ON public.requests FOR SELECT TO authenticated USING (
  auth.uid() = customer_id
  OR public.has_role(auth.uid(),'admin')
  OR (public.has_role(auth.uid(),'worker') AND status = 'open')
  OR (public.has_role(auth.uid(),'worker') AND EXISTS (SELECT 1 FROM public.matches m WHERE m.request_id = requests.id AND m.worker_id = auth.uid()))
);
CREATE POLICY "requests insert" ON public.requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "requests update" ON public.requests FOR UPDATE TO authenticated USING (
  auth.uid() = customer_id
  OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.matches m WHERE m.request_id = requests.id AND m.worker_id = auth.uid())
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches select" ON public.matches FOR SELECT TO authenticated USING (
  auth.uid() = worker_id
  OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = matches.request_id AND r.customer_id = auth.uid())
);
CREATE POLICY "matches insert" ON public.matches FOR INSERT TO authenticated WITH CHECK (auth.uid() = worker_id AND public.has_role(auth.uid(),'worker'));
CREATE POLICY "matches update" ON public.matches FOR UPDATE TO authenticated USING (
  auth.uid() = worker_id
  OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = matches.request_id AND r.customer_id = auth.uid())
);

ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkins select" ON public.checkins FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.matches m JOIN public.requests r ON r.id = m.request_id
          WHERE m.id = checkins.match_id AND (m.worker_id = auth.uid() OR r.customer_id = auth.uid()))
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "checkins insert" ON public.checkins FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.matches m WHERE m.id = checkins.match_id AND m.worker_id = auth.uid())
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments select" ON public.payments FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = payments.request_id AND r.customer_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.matches m WHERE m.request_id = payments.request_id AND m.worker_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
