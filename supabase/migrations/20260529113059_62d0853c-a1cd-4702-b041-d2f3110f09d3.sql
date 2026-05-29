
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL UNIQUE,
  avatar_id INTEGER NOT NULL DEFAULT 1,
  elo_rating INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_auth ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Updates go through server functions (service_role), but allow self-update as a safety.
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup, deriving a unique nickname from metadata or email.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_nick TEXT;
  candidate TEXT;
  suffix INT := 0;
BEGIN
  base_nick := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'nickname'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(COALESCE(NEW.email, 'player'), '@', 1)
  );
  -- sanitize to allowed characters (letters/numbers/space/_-.!?), trim to 16
  base_nick := REGEXP_REPLACE(base_nick, '[^\w \-\.!?]', '', 'g');
  IF base_nick IS NULL OR LENGTH(base_nick) < 3 THEN
    base_nick := 'player' || SUBSTR(NEW.id::text, 1, 6);
  END IF;
  base_nick := SUBSTR(base_nick, 1, 16);

  candidate := base_nick;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE nickname = candidate) LOOP
    suffix := suffix + 1;
    candidate := SUBSTR(base_nick, 1, 16 - LENGTH(suffix::text) - 1) || '_' || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, nickname) VALUES (NEW.id, candidate);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
