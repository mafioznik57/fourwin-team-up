// Game logic + client helpers for FourWin
import { supabase } from "@/integrations/supabase/client";

export const ROWS = 6;
export const COLS = 7;
export type Cell = "R" | "B" | null;
export type Board = Cell[][]; // [row][col], row 0 = top

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function dropPiece(
  board: Board,
  col: number,
  piece: "R" | "B",
): { board: Board; row: number } | null {
  if (col < 0 || col >= COLS) return null;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) {
      const next = board.map((row) => row.slice());
      next[r][col] = piece;
      return { board: next, row: r };
    }
  }
  return null;
}

export function checkWin(board: Board): { winner: "R" | "B"; cells: [number, number][] } | null {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (!v) continue;
      for (const [dr, dc] of dirs) {
        const cells: [number, number][] = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (board[nr][nc] !== v) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return { winner: v, cells };
      }
    }
  }
  return null;
}

export function isBoardFull(board: Board): boolean {
  return board.every((row) => row.every((c) => c !== null));
}

export function genRoomCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const CLIENT_ID_KEY = "fourwin_client_id";
const NICK_KEY = "fourwin_nick";

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  // Use sessionStorage so each browser tab is a distinct player.
  // This lets you test 2v2 by opening multiple tabs in the same browser
  // (instead of needing 4 separate incognito windows).
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getSavedNick(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NICK_KEY) || "";
}
export function saveNick(n: string) {
  if (typeof window !== "undefined") localStorage.setItem(NICK_KEY, n);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type Team = "red" | "blue";

export interface PlayerRow {
  id: string;
  room_id: string;
  client_id: string;
  nickname: string;
  team: Team;
  slot_number: number;
  connected: boolean;
  ready: boolean;
}

export interface RoomRow {
  id: string;
  code: string;
  status: string;
  turn_order: string[]; // player ids
}

export interface GameStateRow {
  room_id: string;
  board: Board;
  current_turn_index: number;
  red_time_left: number;
  blue_time_left: number;
  last_tick: string;
  winner: string | null;
  winning_cells: [number, number][] | null;
  updated_at: string;
  disconnected_player_id: string | null;
  disconnect_deadline: string | null;
  abandoned_player_ids: string[];
}

/** Find or create a room by code, ensure current client is joined as a player. */
export async function joinRoomByCode(code: string, nickname: string, preferredTeam?: Team) {
  const clientId = getClientId();
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (roomErr) throw roomErr;
  if (!room) throw new Error("Room not found");

  const { data: players } = await supabase
    .from("players")
    .select("*")
    .eq("room_id", room.id)
    .order("slot_number");

  const existing = (players || []).find((p) => p.client_id === clientId);
  if (existing) return { room, player: existing };

  const slots = new Set((players || []).map((p) => p.slot_number));
  const redCount = (players || []).filter((p) => p.team === "red").length;
  const blueCount = (players || []).filter((p) => p.team === "blue").length;
  let team: Team = preferredTeam ?? (redCount <= blueCount ? "red" : "blue");
  // Force balance if preferred full
  if (team === "red" && redCount >= 2) team = "blue";
  if (team === "blue" && blueCount >= 2) team = "red";
  if ((team === "red" && redCount >= 2) || (team === "blue" && blueCount >= 2)) {
    throw new Error("Room is full");
  }
  // Slot numbers: red = 0,1  blue = 2,3
  const base = team === "red" ? 0 : 2;
  const slotNumber = !slots.has(base) ? base : base + 1;

  const { data: created, error: insErr } = await supabase
    .from("players")
    .insert({
      room_id: room.id,
      client_id: clientId,
      nickname,
      team,
      slot_number: slotNumber,
    })
    .select()
    .single();
  if (insErr) throw insErr;
  return { room, player: created };
}

export async function createRoom(nickname: string, team: Team) {
  const clientId = getClientId();
  // try a few times in case of code collision
  let code = genRoomCode();
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code, status: "waiting" })
      .select()
      .single();
    if (!error && data) {
      const slotNumber = team === "red" ? 0 : 2;
      const { data: player, error: pErr } = await supabase
        .from("players")
        .insert({
          room_id: data.id,
          client_id: clientId,
          nickname,
          team,
          slot_number: slotNumber,
        })
        .select()
        .single();
      if (pErr) throw pErr;
      return { room: data, player };
    }
    code = genRoomCode();
  }
  throw new Error("Failed to create room");
}

export async function startGame(roomId: string, players: PlayerRow[]) {
  // randomize turn order across all 4 players
  const order = shuffle(players.map((p) => p.id));
  const { error: stateError } = await supabase.from("game_state").upsert(
    {
      room_id: roomId,
      board: emptyBoard() as unknown as never,
      current_turn_index: 0,
      red_time_left: 300,
      blue_time_left: 300,
      last_tick: new Date().toISOString(),
      winner: null,
      winning_cells: null,
    },
    { onConflict: "room_id" },
  );
  if (stateError) throw stateError;

  const { error: roomError } = await supabase
    .from("rooms")
    .update({ status: "playing", turn_order: order })
    .eq("id", roomId);
  if (roomError) throw roomError;
}

export async function resetGame(roomId: string, players: PlayerRow[]) {
  const order = shuffle(players.map((p) => p.id));
  const { error: stateError } = await supabase.from("game_state").upsert(
    {
      room_id: roomId,
      board: emptyBoard() as unknown as never,
      current_turn_index: 0,
      red_time_left: 300,
      blue_time_left: 300,
      last_tick: new Date().toISOString(),
      winner: null,
      winning_cells: null,
    },
    { onConflict: "room_id" },
  );
  if (stateError) throw stateError;

  const { error: roomError } = await supabase
    .from("rooms")
    .update({ status: "playing", turn_order: order })
    .eq("id", roomId);
  if (roomError) throw roomError;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function teamOf(playerId: string, players: PlayerRow[]): Team | null {
  return players.find((p) => p.id === playerId)?.team ?? null;
}
