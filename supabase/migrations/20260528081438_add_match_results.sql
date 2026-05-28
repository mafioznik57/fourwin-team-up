/*
  # Add Match Results

  ## Summary
  Records the outcome of every completed FourWin game for use in
  player stats and match history on the /profile page.

  ## New Tables
  - `match_results`
    - `id` (uuid, PK)
    - `room_id` (uuid, FK → rooms)
    - `winner_team` (text) — 'red' | 'blue' | 'draw'
    - `red_player_ids` (uuid[]) — ordered list of red team player auth IDs
    - `blue_player_ids` (uuid[]) — ordered list of blue team player auth IDs
    - `red_nicknames` (text[]) — snapshot for display without joins
    - `blue_nicknames` (text[]) — snapshot
    - `elo_changes` (jsonb) — map of user_id → elo delta
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Any authenticated user can read match results
  - No direct inserts allowed by clients (written by game end logic via anon key with service role on edge fn, or by client who is in the match)
*/

CREATE TABLE IF NOT EXISTS match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  winner_team text NOT NULL CHECK (winner_team IN ('red', 'blue', 'draw')),
  red_player_ids uuid[] NOT NULL DEFAULT '{}',
  blue_player_ids uuid[] NOT NULL DEFAULT '{}',
  red_nicknames text[] NOT NULL DEFAULT '{}',
  blue_nicknames text[] NOT NULL DEFAULT '{}',
  elo_changes jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_results_room_id_idx ON match_results(room_id);
CREATE INDEX IF NOT EXISTS match_results_created_at_idx ON match_results(created_at DESC);

ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read match results"
  ON match_results FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Participants can insert match results"
  ON match_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = ANY(red_player_ids) OR auth.uid() = ANY(blue_player_ids));
