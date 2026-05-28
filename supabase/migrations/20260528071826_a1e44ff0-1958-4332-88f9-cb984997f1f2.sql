ALTER TABLE public.game_state
  ADD COLUMN IF NOT EXISTS disconnected_player_id uuid,
  ADD COLUMN IF NOT EXISTS disconnect_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS abandoned_player_ids jsonb NOT NULL DEFAULT '[]'::jsonb;