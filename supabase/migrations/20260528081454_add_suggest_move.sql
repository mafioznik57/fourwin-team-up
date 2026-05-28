/*
  # Add Suggest Move Feature

  ## Summary
  Allows a teammate to suggest a column during the active player's turn.
  The suggestion is stored temporarily and shown only to the active player
  as a glowing column highlight.

  ## New Tables
  - `move_suggestions`
    - `id` (uuid, PK)
    - `room_id` (uuid, FK → rooms)
    - `from_player_id` (uuid, FK → players) — who sent the suggestion
    - `to_player_id` (uuid, FK → players) — who should see it (active player)
    - `col` (int) — suggested column 0–6
    - `turn_index` (int) — game turn index when suggestion was made (auto-expires)
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Only authenticated users who are in the room can insert
  - Only the target player's client_id can read (enforced via join in app)
  - Rows are cleaned up by the app after a turn passes
*/

CREATE TABLE IF NOT EXISTS move_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  from_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  col integer NOT NULL CHECK (col >= 0 AND col <= 6),
  turn_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS move_suggestions_room_turn_idx ON move_suggestions(room_id, turn_index);

ALTER TABLE move_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read suggestions for their room"
  ON move_suggestions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.room_id = move_suggestions.room_id
        AND players.client_id = auth.uid()::text
    )
  );

CREATE POLICY "Players can insert suggestions"
  ON move_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.room_id = move_suggestions.room_id
        AND players.client_id = auth.uid()::text
    )
  );

CREATE POLICY "Players can delete own suggestions"
  ON move_suggestions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = move_suggestions.from_player_id
        AND players.client_id = auth.uid()::text
    )
  );
