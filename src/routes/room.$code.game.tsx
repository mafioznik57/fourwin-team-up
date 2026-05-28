import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  COLS,
  ROWS,
  checkWin,
  dropPiece,
  emptyBoard,
  formatClock,
  getClientId,
  isBoardFull,
  resetGame,
  type Board,
  type GameStateRow,
  type PlayerRow,
  type RoomRow,
  type Team,
} from "@/lib/fourwin";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Lock, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/room/$code/game")({
  head: () => ({ meta: [{ title: "Game — FourWin" }] }),
  component: GamePage,
});

const FREE_CHAT = [
  "Good move! 👍",
  "Attack! ⚡",
  "Block! 🛡️",
  "Nice game! 🤝",
  "Let's go! 🔥",
];
const LOCKED_CHAT = ["💀 You're done!", "🔥 I'm on fire!", "🏆 Unbeatable!"];

interface ChatRow {
  id: string;
  room_id: string;
  player_id: string;
  message: string;
  created_at: string;
}

interface SuggestionRow {
  id: string;
  room_id: string;
  from_player_id: string;
  to_player_id: string;
  col: number;
  turn_index: number;
}

// ELO delta: +20 for win, -20 for loss, 0 for draw
function calcEloDelta(result: "win" | "loss" | "draw"): number {
  return result === "win" ? 20 : result === "loss" ? -20 : 0;
}

function GamePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const upperCode = code.toUpperCase();
  const { user } = useAuth();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [state, setState] = useState<GameStateRow | null>(null);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [bubbles, setBubbles] = useState<Record<string, { msg: string; id: number }>>({});
  const [lastDrop, setLastDrop] = useState<{ row: number; col: number } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  // Suggest move state
  const [suggestion, setSuggestion] = useState<SuggestionRow | null>(null);
  const [suggestPickOpen, setSuggestPickOpen] = useState(false);
  const matchRecordedRef = useRef(false);

  const me = useMemo(() => players.find((p) => p.client_id === getClientId()) || null, [players]);

  // Load room + players + state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: r } = await supabase.from("rooms").select("*").eq("code", upperCode).maybeSingle();
      if (cancelled || !r) return;
      setRoom(r as RoomRow);
      const [{ data: ps }, { data: gs }, { data: cs }] = await Promise.all([
        supabase.from("players").select("*").eq("room_id", r.id).order("slot_number"),
        supabase.from("game_state").select("*").eq("room_id", r.id).maybeSingle(),
        supabase.from("chat_messages").select("*").eq("room_id", r.id).order("created_at").limit(50),
      ]);
      if (cancelled) return;
      setPlayers((ps || []) as PlayerRow[]);
      if (gs) setState(gs as unknown as GameStateRow);
      setChats((cs || []) as ChatRow[]);
    })();
    return () => { cancelled = true; };
  }, [upperCode]);

  // Realtime
  useEffect(() => {
    if (!room) return;
    const channel = supabase
      .channel(`game:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` }, async () => {
        const { data } = await supabase.from("players").select("*").eq("room_id", room.id).order("slot_number");
        setPlayers((data || []) as PlayerRow[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "game_state", filter: `room_id=eq.${room.id}` }, (payload) => {
        const next = payload.new as unknown as GameStateRow;
        setState((prev) => {
          if (prev && next) {
            const oldBoard = prev.board;
            const newBoard = next.board;
            for (let r = 0; r < ROWS; r++) {
              for (let c = 0; c < COLS; c++) {
                if (oldBoard?.[r]?.[c] == null && newBoard?.[r]?.[c] != null) {
                  setLastDrop({ row: r, col: c });
                }
              }
            }
          }
          return next;
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, (payload) => {
        setRoom(payload.new as RoomRow);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${room.id}` }, (payload) => {
        const c = payload.new as ChatRow;
        setChats((prev) => [...prev.slice(-49), c]);
        const id = Date.now() + Math.random();
        setBubbles((b) => ({ ...b, [c.player_id]: { msg: c.message, id } }));
        setTimeout(() => {
          setBubbles((b) => {
            if (b[c.player_id]?.id === id) {
              const copy = { ...b };
              delete copy[c.player_id];
              return copy;
            }
            return b;
          });
        }, 3000);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "move_suggestions", filter: `room_id=eq.${room.id}` }, (payload) => {
        const s = payload.new as SuggestionRow;
        // Only show to the intended recipient
        if (me && s.to_player_id === me.id) {
          setSuggestion(s);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room, me]);

  // Presence channel for disconnection detection
  useEffect(() => {
    if (!room || !me) return;
    const channel = supabase.channel(`presence:${room.id}`, {
      config: { presence: { key: me.id } },
    });
    const syncPresence = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      setPresentIds(new Set(Object.keys(state)));
    };
    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ player_id: me.id, online_at: new Date().toISOString() });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [room, me]);

  const lastSeenRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const now = Date.now();
    for (const pid of presentIds) lastSeenRef.current[pid] = now;
  }, [presentIds]);

  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(i);
  }, []);

  const currentPlayerId: string | null = useMemo(() => {
    if (!room || !state) return null;
    const order = (room.turn_order || []) as string[];
    if (!order.length) return null;
    return order[state.current_turn_index % order.length] ?? null;
  }, [room, state]);

  const currentPlayer = useMemo(
    () => players.find((p) => p.id === currentPlayerId) || null,
    [currentPlayerId, players],
  );
  const currentTeam: Team | null = currentPlayer?.team ?? null;

  const abandoned = useMemo(
    () => new Set<string>((state?.abandoned_player_ids ?? []) as string[]),
    [state?.abandoned_player_ids],
  );

  const effectivePlayerId: string | null = useMemo(() => {
    if (!currentPlayerId || !currentPlayer) return currentPlayerId;
    if (!abandoned.has(currentPlayerId)) return currentPlayerId;
    const teammate = players.find(
      (p) => p.team === currentPlayer.team && p.id !== currentPlayerId,
    );
    return teammate && !abandoned.has(teammate.id) ? teammate.id : currentPlayerId;
  }, [currentPlayerId, currentPlayer, players, abandoned]);
  const effectivePlayer = useMemo(
    () => players.find((p) => p.id === effectivePlayerId) || null,
    [effectivePlayerId, players],
  );

  const elapsedSinceTick = state ? (Date.now() - new Date(state.last_tick).getTime()) / 1000 : 0;
  const redLeft = state ? (currentTeam === "red" && !state.winner ? state.red_time_left - elapsedSinceTick : state.red_time_left) : 300;
  const blueLeft = state ? (currentTeam === "blue" && !state.winner ? state.blue_time_left - elapsedSinceTick : state.blue_time_left) : 300;

  const timeoutCommittedRef = useRef(false);
  useEffect(() => {
    if (!state || state.winner) {
      timeoutCommittedRef.current = false;
      return;
    }
    if (!currentTeam || !me) return;
    if (currentPlayerId !== me.id) return;
    const left = currentTeam === "red" ? redLeft : blueLeft;
    if (left <= 0 && !timeoutCommittedRef.current) {
      timeoutCommittedRef.current = true;
      const winner = currentTeam === "red" ? "blue" : "red";
      supabase
        .from("game_state")
        .update({
          winner,
          red_time_left: Math.max(0, Math.floor(currentTeam === "red" ? 0 : redLeft)),
          blue_time_left: Math.max(0, Math.floor(currentTeam === "blue" ? 0 : blueLeft)),
        })
        .eq("room_id", state.room_id);
    }
  }, [redLeft, blueLeft, currentTeam, currentPlayerId, me, state]);

  const isMyTurn = !!me && effectivePlayerId === me?.id && !state?.winner;

  // Record match result when game ends — only one client does it (the one whose turn it is,
  // or the first red player as a fallback). Guard with matchRecordedRef to prevent duplication.
  useEffect(() => {
    if (!state?.winner || !room || players.length === 0) return;
    if (matchRecordedRef.current) return;
    // Only the "first" player in turn order (index 0) records the result to avoid races
    const order = (room.turn_order || []) as string[];
    if (!me || order[0] !== me.id) return;
    matchRecordedRef.current = true;

    (async () => {
      const redPlayers = players.filter((p) => p.team === "red");
      const bluePlayers = players.filter((p) => p.team === "blue");

      // Fetch auth user IDs for players (stored in players table as client_id which is sessionStorage UUID,
      // not auth.uid). We use the Supabase auth user ID from useAuth for the current user only.
      // For others, we leave their IDs blank (they'll record via their own client).
      // Instead, record with actual player row IDs and match them to auth users via profiles lookup.
      const redNicknames = redPlayers.map((p) => p.nickname);
      const blueNicknames = bluePlayers.map((p) => p.nickname);

      // We use player.id (UUID from players table) as the identifier in match_results.
      // The profile page queries by auth user ID — link them via a separate lookup.
      // For now, use the auth user IDs we can resolve from profiles.
      // Simple approach: store all 4 player nicknames; auth-linked ID only if the current user is in this game.
      const currentUserInRed = user && redPlayers.some((p) => p.client_id === getClientId());
      const currentUserInBlue = user && bluePlayers.some((p) => p.client_id === getClientId());

      const redPlayerIds: string[] = user && currentUserInRed ? [user.id] : [];
      const bluePlayerIds: string[] = user && currentUserInBlue ? [user.id] : [];

      const winnerTeam = state.winner === "draw" ? "draw" : state.winner as string;

      // Compute ELO changes
      const eloChanges: Record<string, number> = {};
      if (user) {
        const myTeam = currentUserInRed ? "red" : currentUserInBlue ? "blue" : null;
        if (myTeam) {
          const result =
            winnerTeam === "draw" ? "draw"
            : myTeam === winnerTeam ? "win"
            : "loss";
          eloChanges[user.id] = calcEloDelta(result);

          // Update ELO in profiles
          const { data: profile } = await supabase.from("profiles").select("elo").eq("id", user.id).maybeSingle();
          if (profile) {
            await supabase.from("profiles").update({ elo: profile.elo + eloChanges[user.id] }).eq("id", user.id);
          }
        }
      }

      await supabase.from("match_results").insert({
        room_id: room.id,
        winner_team: winnerTeam,
        red_player_ids: redPlayerIds,
        blue_player_ids: bluePlayerIds,
        red_nicknames: redNicknames,
        blue_nicknames: blueNicknames,
        elo_changes: eloChanges,
      });
    })();
  }, [state?.winner, room, players, me, user]);

  // Disconnect monitoring
  useEffect(() => {
    if (!state || state.winner || !room || !me) return;
    const interval = setInterval(async () => {
      const now = Date.now();
      const roomId = state.room_id;

      const redIds = players.filter((p) => p.team === "red").map((p) => p.id);
      const blueIds = players.filter((p) => p.team === "blue").map((p) => p.id);
      const redOut = redIds.length > 0 && redIds.every((id) => abandoned.has(id));
      const blueOut = blueIds.length > 0 && blueIds.every((id) => abandoned.has(id));
      if (redOut || blueOut) {
        const winner = redOut ? "blue" : "red";
        await supabase
          .from("game_state")
          .update({ winner } as never)
          .eq("room_id", roomId)
          .is("winner", null);
        return;
      }

      if (state.disconnected_player_id && state.disconnect_deadline) {
        const deadline = new Date(state.disconnect_deadline).getTime();
        const dcId = state.disconnected_player_id;
        if (presentIds.has(dcId) && now < deadline) {
          await supabase
            .from("game_state")
            .update({ disconnected_player_id: null, disconnect_deadline: null } as never)
            .eq("room_id", roomId)
            .eq("disconnected_player_id", dcId);
          return;
        }
        if (now >= deadline && !presentIds.has(dcId)) {
          const nextAbandoned = Array.from(new Set([...(state.abandoned_player_ids || []), dcId]));
          await supabase
            .from("game_state")
            .update({
              disconnected_player_id: null,
              disconnect_deadline: null,
              abandoned_player_ids: nextAbandoned as unknown as never,
            } as never)
            .eq("room_id", roomId)
            .eq("disconnected_player_id", dcId);
          const p = players.find((x) => x.id === dcId);
          if (p) toast(`${p.nickname} left. Their teammate will play alone.`);
          return;
        }
      } else {
        for (const p of players) {
          if (abandoned.has(p.id)) continue;
          if (presentIds.has(p.id)) continue;
          const lastSeen = lastSeenRef.current[p.id];
          if (!lastSeen) { lastSeenRef.current[p.id] = now; continue; }
          if (now - lastSeen >= 5000) {
            const deadline = new Date(now + 30_000).toISOString();
            await supabase
              .from("game_state")
              .update({ disconnected_player_id: p.id, disconnect_deadline: deadline } as never)
              .eq("room_id", roomId)
              .is("disconnected_player_id", null)
              .is("winner", null);
            break;
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state, room, me, players, presentIds, abandoned]);

  // Clear stale suggestions when turn changes
  useEffect(() => {
    if (suggestion && state && suggestion.turn_index !== state.current_turn_index) {
      setSuggestion(null);
    }
  }, [state?.current_turn_index, suggestion]);

  const handleDrop = useCallback(
    async (col: number) => {
      if (!state || !me || !currentTeam) return;
      if (!isMyTurn) { toast.error("Not your turn"); return; }
      const piece = currentTeam === "red" ? "R" : "B";
      const result = dropPiece(state.board as Board, col, piece);
      if (!result) { toast.error("Column is full"); return; }
      const elapsed = (Date.now() - new Date(state.last_tick).getTime()) / 1000;
      const newRed = currentTeam === "red" ? Math.max(0, state.red_time_left - elapsed) : state.red_time_left;
      const newBlue = currentTeam === "blue" ? Math.max(0, state.blue_time_left - elapsed) : state.blue_time_left;

      const win = checkWin(result.board);
      const draw = !win && isBoardFull(result.board);
      const order = (room?.turn_order || []) as string[];
      const nextIndex = (state.current_turn_index + 1) % Math.max(order.length, 1);

      setLastDrop({ row: result.row, col });
      setSuggestion(null);

      const update: Partial<GameStateRow> & { board: Board } = {
        board: result.board,
        current_turn_index: nextIndex,
        red_time_left: Math.floor(newRed),
        blue_time_left: Math.floor(newBlue),
        last_tick: new Date().toISOString() as unknown as string,
      };
      if (win) { update.winner = win.winner === "R" ? "red" : "blue"; update.winning_cells = win.cells; }
      else if (draw) { update.winner = "draw"; }
      const { error } = await supabase.from("game_state").update(update as never).eq("room_id", state.room_id);
      if (error) toast.error(error.message);
    },
    [state, me, currentTeam, isMyTurn, room],
  );

  const sendChat = async (msg: string) => {
    if (!me || !room) return;
    await supabase.from("chat_messages").insert({ room_id: room.id, player_id: me.id, message: msg });
  };

  // Suggest Move: find my teammate who is the active player
  const canSuggest = useMemo(() => {
    if (!me || !state || state.winner) return false;
    // I'm NOT the active player, but my teammate IS
    if (effectivePlayerId === me.id) return false;
    const myTeammate = players.find(
      (p) => p.team === me.team && p.id !== me.id
    );
    return myTeammate ? effectivePlayerId === myTeammate.id : false;
  }, [me, effectivePlayerId, players, state]);

  const sendSuggestion = async (col: number) => {
    if (!me || !room || !state || !effectivePlayerId) return;
    // Delete previous suggestion for this turn
    await supabase
      .from("move_suggestions")
      .delete()
      .eq("room_id", room.id)
      .eq("from_player_id", me.id);

    await supabase.from("move_suggestions").insert({
      room_id: room.id,
      from_player_id: me.id,
      to_player_id: effectivePlayerId,
      col,
      turn_index: state.current_turn_index,
    });
    setSuggestPickOpen(false);
    toast.success(`Suggested column ${col + 1}`);
  };

  const playAgain = async () => {
    if (!room) return;
    matchRecordedRef.current = false;
    await resetGame(room.id, players);
  };

  if (!room || !state) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        Loading game…
      </div>
    );
  }

  const board: Board = (state.board as Board) || emptyBoard();
  const winningSet = new Set<string>(((state.winning_cells as [number, number][]) || []).map(([r, c]) => `${r},${c}`));
  const order = (room.turn_order || []) as string[];

  const dcPlayer = state.disconnected_player_id
    ? players.find((p) => p.id === state.disconnected_player_id) || null
    : null;
  const dcSecondsLeft = state.disconnect_deadline
    ? Math.max(0, Math.ceil((new Date(state.disconnect_deadline).getTime() - Date.now()) / 1000))
    : 0;

  const redIds = players.filter((p) => p.team === "red").map((p) => p.id);
  const blueIds = players.filter((p) => p.team === "blue").map((p) => p.id);
  const redForfeit = redIds.length > 0 && redIds.every((id) => abandoned.has(id));
  const blueForfeit = blueIds.length > 0 && blueIds.every((id) => abandoned.has(id));
  const forfeitTeam: Team | null = redForfeit ? "red" : blueForfeit ? "blue" : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-3 py-4 md:py-6">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate({ to: "/" })} className="text-xs text-muted-foreground hover:text-foreground">
            Leave
          </button>
          <div className="text-xs text-muted-foreground">Room <span className="font-mono">{upperCode}</span></div>
        </div>

        {dcPlayer && !state.winner && (
          <div className="mb-3 p-3 rounded-md border border-amber-500/50 bg-amber-500/10 text-amber-200 text-sm text-center font-medium">
            Player <span className="font-bold">{dcPlayer.nickname}</span> disconnected. Waiting{" "}
            <span className="font-mono">{dcSecondsLeft}s</span>…
          </div>
        )}
        {abandoned.size > 0 && !dcPlayer && !state.winner && (
          <div className="mb-3 p-2 rounded-md border border-border bg-secondary/40 text-xs text-muted-foreground text-center">
            {players.filter((p) => abandoned.has(p.id)).map((p) => p.nickname).join(", ")}{" "}
            left — teammate plays alone.
          </div>
        )}

        {/* Suggestion banner */}
        {suggestion && isMyTurn && (
          <div className="mb-3 p-3 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-200 text-sm text-center font-medium animate-in fade-in">
            Teammate suggests <span className="font-bold">column {suggestion.col + 1}</span>
          </div>
        )}

        {/* Turn order bar */}
        <Card className="p-3 bg-card border-border">
          <div className="grid grid-cols-4 gap-2">
            {order.map((pid, idx) => {
              const p = players.find((x) => x.id === pid);
              if (!p) return <div key={pid} />;
              const isCurrentSlot = idx === state.current_turn_index && !state.winner;
              const active = isCurrentSlot && effectivePlayerId === p.id;
              const isAbandoned = abandoned.has(p.id);
              const isDisconnected = state.disconnected_player_id === p.id;
              return (
                <div
                  key={pid}
                  className={`relative p-2 rounded-md text-center transition ${
                    active ? "ring-2" : isAbandoned ? "opacity-30 line-through" : "opacity-60"
                  }`}
                  style={{
                    backgroundColor: `${p.team === "red" ? "#ef4444" : "#3b82f6"}1f`,
                    boxShadow: active ? `0 0 0 2px ${p.team === "red" ? "#ef4444" : "#3b82f6"}` : undefined,
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.team === "red" ? "#ef4444" : "#3b82f6" }} />
                    <div className="text-xs sm:text-sm font-medium truncate">{p.nickname}</div>
                    {isDisconnected && <span className="text-xs">⏳</span>}
                    {isAbandoned && <span className="text-xs">🚪</span>}
                  </div>
                  {bubbles[p.id] && (
                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-background border border-border px-2 py-1 rounded-md text-xs shadow-lg animate-in fade-in zoom-in">
                      {bubbles[p.id].msg}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Clocks */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <ClockBox team="red" left={redLeft} active={currentTeam === "red" && !state.winner} />
          <ClockBox team="blue" left={blueLeft} active={currentTeam === "blue" && !state.winner} />
        </div>

        {/* Board */}
        <div className="mt-4 flex justify-center">
          <div
            className="p-2 sm:p-3 rounded-xl"
            style={{ backgroundColor: "#1e1e4a", boxShadow: "0 12px 40px rgba(59,130,246,0.2)" }}
          >
            {/* Column headers — show suggestion glow */}
            <div className="grid mb-1" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: "6px" }}>
              {Array.from({ length: COLS }).map((_, c) => {
                const isSuggested = suggestion && isMyTurn && suggestion.col === c;
                return (
                  <div key={c} className="flex items-center justify-center h-2">
                    {isSuggested && (
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" style={{ boxShadow: "0 0 8px #3b82f6" }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: "6px" }}>
              {Array.from({ length: ROWS * COLS }).map((_, idx) => {
                const r = Math.floor(idx / COLS);
                const c = idx % COLS;
                const cell = board[r]?.[c];
                const isWin = winningSet.has(`${r},${c}`);
                const justDropped = lastDrop && lastDrop.row === r && lastDrop.col === c;
                const isSuggestedCol = suggestion && isMyTurn && suggestion.col === c;
                return (
                  <button
                    key={`${r}-${c}`}
                    onClick={() => handleDrop(c)}
                    disabled={!isMyTurn}
                    className={`relative aspect-square rounded-full flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 md:w-14 md:h-14 transition disabled:cursor-not-allowed ${
                      isSuggestedCol && !cell ? "bg-blue-900/40 hover:bg-blue-900/60" : "bg-[#0f0f1a] hover:bg-[#191932]"
                    }`}
                    aria-label={`Drop in column ${c + 1}`}
                  >
                    {isSuggestedCol && !cell && (
                      <div className="absolute inset-0 rounded-full border-2 border-blue-400/60 animate-pulse" />
                    )}
                    {cell && (
                      <div
                        className={`w-[82%] h-[82%] rounded-full ${justDropped ? "animate-piece-drop" : ""} ${isWin ? "animate-win-pulse" : ""}`}
                        style={{
                          background: cell === "R"
                            ? "radial-gradient(circle at 30% 30%, #ff8585, #ef4444 60%, #b91c1c)"
                            : "radial-gradient(circle at 30% 30%, #93c5fd, #3b82f6 60%, #1d4ed8)",
                          boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.4)",
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Turn status + suggest button */}
        <div className="text-center mt-3 text-sm flex items-center justify-center gap-3 flex-wrap">
          {state.winner ? (
            <span className="text-muted-foreground">Game over</span>
          ) : effectivePlayer ? (
            <span>
              Turn:{" "}
              <span style={{ color: effectivePlayer.team === "red" ? "#ef4444" : "#3b82f6" }} className="font-semibold">
                {effectivePlayer.nickname}
              </span>{" "}
              {isMyTurn ? "(your move)" : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Waiting…</span>
          )}
          {canSuggest && !state.winner && (
            <Button
              size="sm"
              variant="outline"
              className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
              onClick={() => setSuggestPickOpen(true)}
            >
              <Lightbulb className="w-3 h-3 mr-1" />
              Suggest Move
            </Button>
          )}
        </div>

        {/* Quick chat */}
        <Card className="mt-4 p-3 bg-card border-border">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Quick Chat</div>
          <div className="flex flex-wrap gap-2">
            {FREE_CHAT.map((c) => (
              <Button key={c} size="sm" variant="secondary" onClick={() => sendChat(c)} disabled={!me}>
                {c}
              </Button>
            ))}
            {LOCKED_CHAT.map((c) => (
              <Button key={c} size="sm" variant="outline" onClick={() => setShopOpen(true)}>
                <Lock className="w-3 h-3 mr-1" />
                {c}
              </Button>
            ))}
          </div>
          {chats.length > 0 && (
            <div className="mt-3 max-h-24 overflow-y-auto text-xs text-muted-foreground space-y-1">
              {chats.slice(-6).map((c) => {
                const p = players.find((x) => x.id === c.player_id);
                return (
                  <div key={c.id}>
                    <span style={{ color: p?.team === "red" ? "#ef4444" : "#3b82f6" }} className="font-medium">
                      {p?.nickname || "?"}
                    </span>
                    : {c.message}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Game over dialog */}
      <Dialog open={!!state.winner} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {state.winner === "draw" ? (
                "It's a draw!"
              ) : forfeitTeam && state.winner && state.winner !== "draw" ? (
                <span>
                  <span style={{ color: forfeitTeam === "red" ? "#ef4444" : "#3b82f6" }} className="font-bold">
                    Team {forfeitTeam === "red" ? "Red" : "Blue"}
                  </span>{" "}
                  forfeited.{" "}
                  <span style={{ color: state.winner === "red" ? "#ef4444" : "#3b82f6" }} className="font-bold">
                    {state.winner === "red" ? "Red" : "Blue"}
                  </span>{" "}
                  team wins!
                </span>
              ) : (
                <span>
                  <span style={{ color: state.winner === "red" ? "#ef4444" : "#3b82f6" }} className="font-bold">
                    {state.winner === "red" ? "Red" : "Blue"} Team
                  </span>{" "}
                  wins!
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {forfeitTeam ? "Both teammates disconnected." : state.winner && state.winner !== "draw" ? "Four in a row — well played." : "The board is full with no winner."}
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>Back to Home</Button>
            <Button onClick={playAgain} className="bg-blue-600 hover:bg-blue-700 text-white">Play Again</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shop locked dialog */}
      <Dialog open={shopOpen} onOpenChange={setShopOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Locked phrase</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This phrase is part of a paid pack. Visit the Shop to learn more.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShopOpen(false)}>Close</Button>
            <Button onClick={() => navigate({ to: "/shop" })} className="bg-blue-600 hover:bg-blue-700 text-white">Open Shop</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suggest move picker */}
      <Dialog open={suggestPickOpen} onOpenChange={setSuggestPickOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Suggest a Column</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Pick a column to suggest to your teammate. Only they will see it.</p>
          <div className="grid grid-cols-7 gap-2 mt-2">
            {Array.from({ length: COLS }).map((_, c) => (
              <button
                key={c}
                onClick={() => sendSuggestion(c)}
                className="h-10 rounded-md bg-secondary hover:bg-blue-600 hover:text-white transition text-sm font-bold"
              >
                {c + 1}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClockBox({ team, left, active }: { team: Team; left: number; active: boolean }) {
  const color = team === "red" ? "#ef4444" : "#3b82f6";
  const label = team === "red" ? "Team Red" : "Team Blue";
  const low = left <= 30;
  return (
    <div
      className="p-3 rounded-lg flex items-center justify-between"
      style={{
        backgroundColor: active ? `${color}22` : "var(--card)",
        border: `1px solid ${active ? color : "var(--border)"}`,
      }}
    >
      <div className="text-xs sm:text-sm font-medium">{label}</div>
      <div
        className={`font-mono text-lg sm:text-2xl font-bold ${low ? "animate-pulse" : ""}`}
        style={{ color: low ? "#fca5a5" : "var(--foreground)" }}
      >
        {formatClock(left)}
      </div>
    </div>
  );
}
