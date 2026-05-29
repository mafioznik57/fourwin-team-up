// Game logic + client helpers for FourWin
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

const NICK_KEY = "fourwin_nick";

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
  user_id: string;
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

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function teamOf(playerId: string, players: PlayerRow[]): Team | null {
  return players.find((p) => p.id === playerId)?.team ?? null;
}
