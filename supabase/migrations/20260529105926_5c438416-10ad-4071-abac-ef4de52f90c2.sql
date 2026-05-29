
-- Wipe legacy in-flight games that were keyed off client_id (sessionStorage).
-- They have no user_id and would be inaccessible after the auth migration anyway.
DELETE FROM public.chat_messages;
DELETE FROM public.game_state;
DELETE FROM public.players;
DELETE FROM public.rooms;

-- Replace anonymous sessionStorage identity with Supabase auth.uid().
ALTER TABLE public.players ADD COLUMN user_id uuid;
ALTER TABLE public.players ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.players DROP COLUMN client_id;
CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON public.players(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_players_room_user ON public.players(room_id, user_id);

-- Security-definer helper for participation checks (avoids RLS recursion).
CREATE OR REPLACE FUNCTION public.is_room_participant(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players
    WHERE room_id = _room_id AND user_id = _user_id
  )
$$;

-- Drop the old wide-open policies.
DROP POLICY IF EXISTS chat_all       ON public.chat_messages;
DROP POLICY IF EXISTS rooms_all      ON public.rooms;
DROP POLICY IF EXISTS players_all    ON public.players;
DROP POLICY IF EXISTS game_state_all ON public.game_state;

-- Reads: authenticated users only. Nicknames + boards aren't sensitive,
-- and realtime postgres_changes needs SELECT to deliver events.
-- All writes are blocked at the policy AND grant level — they must go
-- through server functions that validate identity and game rules.
CREATE POLICY rooms_select_auth      ON public.rooms          FOR SELECT TO authenticated USING (true);
CREATE POLICY players_select_auth    ON public.players        FOR SELECT TO authenticated USING (true);
CREATE POLICY game_state_select_auth ON public.game_state     FOR SELECT TO authenticated USING (true);
CREATE POLICY chat_select_auth       ON public.chat_messages  FOR SELECT TO authenticated USING (true);

-- Lock down grants: SELECT only for anon/authenticated, full access for service_role.
REVOKE INSERT, UPDATE, DELETE ON public.rooms          FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.players        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_state     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_messages  FROM anon, authenticated;

GRANT SELECT ON public.rooms          TO authenticated;
GRANT SELECT ON public.players        TO authenticated;
GRANT SELECT ON public.game_state     TO authenticated;
GRANT SELECT ON public.chat_messages  TO authenticated;

GRANT ALL ON public.rooms          TO service_role;
GRANT ALL ON public.players        TO service_role;
GRANT ALL ON public.game_state     TO service_role;
GRANT ALL ON public.chat_messages  TO service_role;
