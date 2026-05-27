
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting',
  turn_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_all" ON public.rooms FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  team TEXT NOT NULL,
  slot_number INT NOT NULL,
  connected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, slot_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO anon, authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players_all" ON public.players FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.game_state (
  room_id UUID NOT NULL PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  board JSONB NOT NULL,
  current_turn_index INT NOT NULL DEFAULT 0,
  red_time_left INT NOT NULL DEFAULT 300,
  blue_time_left INT NOT NULL DEFAULT 300,
  last_tick TIMESTAMPTZ NOT NULL DEFAULT now(),
  winner TEXT,
  winning_cells JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_state TO anon, authenticated;
GRANT ALL ON public.game_state TO service_role;
ALTER TABLE public.game_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_state_all" ON public.game_state FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO anon, authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_all" ON public.chat_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.game_state REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
