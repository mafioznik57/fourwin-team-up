/*
  # Add User Profiles (idempotent)

  ## Summary
  Creates the user profiles system tied to Supabase Auth.

  ## New Tables
  - `profiles`
    - `id` (uuid, PK) — matches auth.users.id
    - `nickname` (text) — display name, unique
    - `avatar_id` (text) — preset avatar key
    - `elo` (int) — matchmaking rating, default 1000
    - `created_at` / `updated_at` (timestamptz)

  ## Security
  - RLS enabled; read by any authenticated user, write only by owner

  ## Notes
  - Trigger auto-creates profile row on new auth.users row
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text UNIQUE NOT NULL,
  avatar_id text NOT NULL DEFAULT 'default',
  elo integer NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Anyone can read profiles'
  ) THEN
    CREATE POLICY "Anyone can read profiles"
      ON profiles FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile"
      ON profiles FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  base_nick text;
  final_nick text;
  counter int := 0;
BEGIN
  base_nick := split_part(NEW.email, '@', 1);
  IF base_nick = '' THEN
    base_nick := 'player';
  END IF;
  final_nick := base_nick;
  LOOP
    BEGIN
      INSERT INTO public.profiles (id, nickname)
      VALUES (NEW.id, final_nick);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      counter := counter + 1;
      final_nick := base_nick || counter::text;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
