// Server-validated mutations for FourWin.
// All writes to rooms / players / game_state / chat_messages go through
// these functions. They authenticate the caller via requireSupabaseAuth
// and use the service-role admin client to commit validated state.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  checkWin,
  dropPiece,
  emptyBoard,
  genRoomCode,
  isBoardFull,
  shuffle,
  type Board,
  type Team,
} from "@/lib/fourwin";

function dbFail(err: { message?: string; code?: string } | null | undefined): never {
  // Log raw DB error server-side; surface a generic message to clients.
  console.error("[fourwin] db error:", err);
  throw new Error("Something went wrong. Please try again.");
}


const teamSchema = z.enum(["red", "blue"]);
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/);
const uuidSchema = z.string().uuid();
const colSchema = z.number().int().min(0).max(6);
const chatSchema = z.string().trim().min(1).max(120);

type PlayerLite = {
  id: string;
  room_id: string;
  user_id: string;
  team: Team;
  slot_number: number;
  nickname: string;
  ready: boolean;
  connected: boolean;
};

async function assertParticipant(roomId: string, userId: string): Promise<PlayerLite> {
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("id, room_id, user_id, team, slot_number, nickname, ready, connected")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) dbFail(error);
  if (!data) throw new Error("Not a participant of this room");
  return data as PlayerLite;
}

async function loadPlayers(roomId: string): Promise<PlayerLite[]> {
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("id, room_id, user_id, team, slot_number, nickname, ready, connected")
    .eq("room_id", roomId)
    .order("slot_number");
  if (error) dbFail(error);
  return (data || []) as PlayerLite[];
}

async function getProfileNickname(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("nickname")
    .eq("id", userId)
    .maybeSingle();
  if (error) dbFail(error);
  if (!data?.nickname) throw new Error("Profile not found. Please sign in again.");
  return data.nickname as string;
}

async function startNewRound(roomId: string, players: PlayerLite[]) {
  const order = shuffle(players.map((p) => p.id));
  const { error: stateErr } = await supabaseAdmin.from("game_state").upsert(
    {
      room_id: roomId,
      board: emptyBoard() as unknown as never,
      current_turn_index: 0,
      red_time_left: 300,
      blue_time_left: 300,
      last_tick: new Date().toISOString(),
      winner: null,
      winning_cells: null,
      disconnected_player_id: null,
      disconnect_deadline: null,
      abandoned_player_ids: [] as unknown as never,
    },
    { onConflict: "room_id" },
  );
  if (stateErr) dbFail(stateErr);
  const { error: roomErr } = await supabaseAdmin
    .from("rooms")
    .update({ status: "playing", turn_order: order as unknown as never })
    .eq("id", roomId);
  if (roomErr) dbFail(roomErr);
}

/* -------------------------------------------------------------------------- */
/* Room lifecycle                                                              */
/* -------------------------------------------------------------------------- */

export const createRoomFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ team: teamSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const nickname = await getProfileNickname(userId);
    for (let i = 0; i < 5; i++) {
      const code = genRoomCode();
      const { data: room, error } = await supabaseAdmin
        .from("rooms")
        .insert({ code, status: "waiting" })
        .select("id, code")
        .single();
      if (error) continue;
      const slot = data.team === "red" ? 0 : 2;
      const { error: pErr } = await supabaseAdmin.from("players").insert({
        room_id: room.id,
        user_id: userId,
        nickname,
        team: data.team,
        slot_number: slot,
      });
      if (pErr) {
        await supabaseAdmin.from("rooms").delete().eq("id", room.id);
        dbFail(pErr);
      }
      return { code: room.code as string };
    }
    throw new Error("Failed to create room");
  });

export const joinRoomFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        code: codeSchema,
        preferredTeam: teamSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const nickname = await getProfileNickname(userId);
    const { data: room, error: roomErr } = await supabaseAdmin
      .from("rooms")
      .select("id, code, status")
      .eq("code", data.code)
      .maybeSingle();
    if (roomErr) dbFail(roomErr);
    if (!room) throw new Error("Room not found");

    const players = await loadPlayers(room.id);
    const mine = players.find((p) => p.user_id === userId);
    if (mine) return { roomId: room.id, code: room.code, playerId: mine.id };

    if (room.status !== "waiting") throw new Error("Game already in progress");

    const slots = new Set(players.map((p) => p.slot_number));
    const redCount = players.filter((p) => p.team === "red").length;
    const blueCount = players.filter((p) => p.team === "blue").length;
    let team: Team = data.preferredTeam ?? (redCount <= blueCount ? "red" : "blue");
    if (team === "red" && redCount >= 2) team = "blue";
    if (team === "blue" && blueCount >= 2) team = "red";
    if ((team === "red" && redCount >= 2) || (team === "blue" && blueCount >= 2)) {
      throw new Error("Room is full");
    }
    const base = team === "red" ? 0 : 2;
    const slot = !slots.has(base) ? base : base + 1;

    const { data: created, error: insErr } = await supabaseAdmin
      .from("players")
      .insert({
        room_id: room.id,
        user_id: userId,
        nickname,
        team,
        slot_number: slot,
      })
      .select("id")
      .single();
    if (insErr) dbFail(insErr);

    // New player joined a lobby — reset everyone's ready flag.
    await supabaseAdmin
      .from("players")
      .update({ ready: false })
      .eq("room_id", room.id);

    return { roomId: room.id, code: room.code, playerId: created.id };
  });

/* -------------------------------------------------------------------------- */
/* Lobby                                                                       */
/* -------------------------------------------------------------------------- */

export const switchTeamFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: uuidSchema, team: teamSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await assertParticipant(data.roomId, context.userId);
    if (me.team === data.team) return { ok: true };
    const players = await loadPlayers(data.roomId);
    const sameTeam = players.filter((p) => p.team === data.team && p.id !== me.id);
    if (sameTeam.length >= 2) throw new Error("That team is full");
    const base = data.team === "red" ? 0 : 2;
    const usedSlots = new Set(
      players.filter((p) => p.id !== me.id).map((p) => p.slot_number),
    );
    const slot = !usedSlots.has(base) ? base : base + 1;
    const { error: updErr } = await supabaseAdmin
      .from("players")
      .update({ team: data.team, slot_number: slot, ready: false })
      .eq("id", me.id);
    if (updErr) dbFail(updErr);
    await supabaseAdmin
      .from("players")
      .update({ ready: false })
      .eq("room_id", data.roomId);
    return { ok: true };
  });

export const toggleReadyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roomId: uuidSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await assertParticipant(data.roomId, context.userId);
    const { error: updErr } = await supabaseAdmin
      .from("players")
      .update({ ready: !me.ready })
      .eq("id", me.id);
    if (updErr) dbFail(updErr);

    // If all 4 are now ready and the room is still waiting, start the game.
    const players = await loadPlayers(data.roomId);
    if (players.length === 4 && players.every((p) => p.ready)) {
      const { data: room } = await supabaseAdmin
        .from("rooms")
        .select("status")
        .eq("id", data.roomId)
        .maybeSingle();
      if (room?.status === "waiting") {
        await startNewRound(data.roomId, players);
      }
    }
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Gameplay                                                                    */
/* -------------------------------------------------------------------------- */

export const makeMoveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: uuidSchema, col: colSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await assertParticipant(data.roomId, context.userId);

    const [{ data: room }, { data: state }] = await Promise.all([
      supabaseAdmin
        .from("rooms")
        .select("status, turn_order")
        .eq("id", data.roomId)
        .maybeSingle(),
      supabaseAdmin
        .from("game_state")
        .select("*")
        .eq("room_id", data.roomId)
        .maybeSingle(),
    ]);
    if (!room || room.status !== "playing") throw new Error("Game not active");
    if (!state) throw new Error("Game state missing");
    if (state.winner) throw new Error("Game already over");

    const order = (room.turn_order || []) as string[];
    if (!order.length) throw new Error("Turn order missing");
    const slotPlayerId = order[state.current_turn_index % order.length];

    const players = await loadPlayers(data.roomId);
    const slotPlayer = players.find((p) => p.id === slotPlayerId);
    if (!slotPlayer) throw new Error("Slot player missing");
    const abandoned = new Set<string>((state.abandoned_player_ids as string[]) || []);

    // If the slot owner is abandoned, control passes to their teammate.
    let effectivePlayerId = slotPlayerId;
    if (abandoned.has(slotPlayerId)) {
      const teammate = players.find(
        (p) => p.team === slotPlayer.team && p.id !== slotPlayerId && !abandoned.has(p.id),
      );
      if (teammate) effectivePlayerId = teammate.id;
    }
    if (effectivePlayerId !== me.id) throw new Error("Not your turn");

    const team = slotPlayer.team;
    const piece: "R" | "B" = team === "red" ? "R" : "B";
    const board = state.board as unknown as Board;
    const result = dropPiece(board, data.col, piece);
    if (!result) throw new Error("Column is full");

    // Chess clock: subtract elapsed from the team that just moved.
    const elapsed = (Date.now() - new Date(state.last_tick).getTime()) / 1000;
    const newRed = team === "red" ? Math.max(0, state.red_time_left - elapsed) : state.red_time_left;
    const newBlue = team === "blue" ? Math.max(0, state.blue_time_left - elapsed) : state.blue_time_left;

    // Out of time? Opposing team wins instead of recording the move.
    if (team === "red" && newRed <= 0) {
      await supabaseAdmin
        .from("game_state")
        .update({ winner: "blue", red_time_left: 0 } as never)
        .eq("room_id", data.roomId)
        .is("winner", null);
      return { ok: true, timedOut: true };
    }
    if (team === "blue" && newBlue <= 0) {
      await supabaseAdmin
        .from("game_state")
        .update({ winner: "red", blue_time_left: 0 } as never)
        .eq("room_id", data.roomId)
        .is("winner", null);
      return { ok: true, timedOut: true };
    }

    const win = checkWin(result.board);
    const draw = !win && isBoardFull(result.board);
    const nextIndex = (state.current_turn_index + 1) % order.length;

    const update: Record<string, unknown> = {
      board: result.board,
      current_turn_index: nextIndex,
      red_time_left: Math.floor(newRed),
      blue_time_left: Math.floor(newBlue),
      last_tick: new Date().toISOString(),
    };
    if (win) {
      update.winner = win.winner === "R" ? "red" : "blue";
      update.winning_cells = win.cells;
    } else if (draw) {
      update.winner = "draw";
    }
    const { error } = await supabaseAdmin
      .from("game_state")
      .update(update as never)
      .eq("room_id", data.roomId)
      .is("winner", null);
    if (error) dbFail(error);
    return { ok: true };
  });

export const reportTimeoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roomId: uuidSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertParticipant(data.roomId, context.userId);
    const [{ data: room }, { data: state }] = await Promise.all([
      supabaseAdmin.from("rooms").select("turn_order, status").eq("id", data.roomId).maybeSingle(),
      supabaseAdmin.from("game_state").select("*").eq("room_id", data.roomId).maybeSingle(),
    ]);
    if (!room || !state || state.winner || room.status !== "playing") return { ok: false };
    const order = (room.turn_order || []) as string[];
    if (!order.length) return { ok: false };
    const players = await loadPlayers(data.roomId);
    const slotPlayer = players.find(
      (p) => p.id === order[state.current_turn_index % order.length],
    );
    if (!slotPlayer) return { ok: false };
    const team = slotPlayer.team;
    const elapsed = (Date.now() - new Date(state.last_tick).getTime()) / 1000;
    const left = team === "red" ? state.red_time_left - elapsed : state.blue_time_left - elapsed;
    if (left > 0) return { ok: false };
    const winner = team === "red" ? "blue" : "red";
    await supabaseAdmin
      .from("game_state")
      .update({
        winner,
        red_time_left: team === "red" ? 0 : state.red_time_left,
        blue_time_left: team === "blue" ? 0 : state.blue_time_left,
      } as never)
      .eq("room_id", data.roomId)
      .is("winner", null);
    return { ok: true };
  });

export const sendChatFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: uuidSchema, message: chatSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await assertParticipant(data.roomId, context.userId);
    const { error } = await supabaseAdmin.from("chat_messages").insert({
      room_id: data.roomId,
      player_id: me.id,
      message: data.message,
    });
    if (error) dbFail(error);
    return { ok: true };
  });

export const playAgainFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roomId: uuidSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertParticipant(data.roomId, context.userId);
    const { data: state } = await supabaseAdmin
      .from("game_state")
      .select("winner")
      .eq("room_id", data.roomId)
      .maybeSingle();
    if (state && !state.winner) {
      throw new Error("Game is still in progress");
    }
    const players = await loadPlayers(data.roomId);
    if (players.length !== 4) throw new Error("Need 4 players to start a new round");
    await startNewRound(data.roomId, players);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Disconnect lifecycle                                                        */
/* -------------------------------------------------------------------------- */

export const reportDisconnectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: uuidSchema, playerId: uuidSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertParticipant(data.roomId, context.userId);
    const deadline = new Date(Date.now() + 30_000).toISOString();
    const { error } = await supabaseAdmin
      .from("game_state")
      .update({
        disconnected_player_id: data.playerId,
        disconnect_deadline: deadline,
      } as never)
      .eq("room_id", data.roomId)
      .is("disconnected_player_id", null)
      .is("winner", null);
    if (error) dbFail(error);
    return { ok: true };
  });

export const clearDisconnectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: uuidSchema, playerId: uuidSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertParticipant(data.roomId, context.userId);
    const { error } = await supabaseAdmin
      .from("game_state")
      .update({
        disconnected_player_id: null,
        disconnect_deadline: null,
      } as never)
      .eq("room_id", data.roomId)
      .eq("disconnected_player_id", data.playerId);
    if (error) dbFail(error);
    return { ok: true };
  });

export const markAbandonedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: uuidSchema, playerId: uuidSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertParticipant(data.roomId, context.userId);
    const { data: state } = await supabaseAdmin
      .from("game_state")
      .select("abandoned_player_ids, disconnected_player_id, disconnect_deadline, winner")
      .eq("room_id", data.roomId)
      .maybeSingle();
    if (!state || state.winner) return { ok: false };
    if (state.disconnected_player_id !== data.playerId) return { ok: false };
    if (!state.disconnect_deadline) return { ok: false };
    if (Date.now() < new Date(state.disconnect_deadline).getTime()) return { ok: false };
    const next = Array.from(
      new Set([...((state.abandoned_player_ids as string[]) || []), data.playerId]),
    );
    await supabaseAdmin
      .from("game_state")
      .update({
        disconnected_player_id: null,
        disconnect_deadline: null,
        abandoned_player_ids: next as unknown as never,
      } as never)
      .eq("room_id", data.roomId)
      .eq("disconnected_player_id", data.playerId);

    // If both members of one team are abandoned, forfeit to the other team.
    const players = await loadPlayers(data.roomId);
    const reds = players.filter((p) => p.team === "red").map((p) => p.id);
    const blues = players.filter((p) => p.team === "blue").map((p) => p.id);
    const abandoned = new Set(next);
    const redOut = reds.length > 0 && reds.every((id) => abandoned.has(id));
    const blueOut = blues.length > 0 && blues.every((id) => abandoned.has(id));
    if (redOut || blueOut) {
      await supabaseAdmin
        .from("game_state")
        .update({ winner: redOut ? "blue" : "red" } as never)
        .eq("room_id", data.roomId)
        .is("winner", null);
    }
    return { ok: true };
  });
