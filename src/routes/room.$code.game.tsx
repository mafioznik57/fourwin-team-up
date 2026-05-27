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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Lock } from "lucide-react";

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

function GamePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const upperCode = code.toUpperCase();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [state, setState] = useState<GameStateRow | null>(null);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [bubbles, setBubbles] = useState<Record<string, { msg: string; id: number }>>({});
  const [lastDrop, setLastDrop] = useState<{ row: number; col: number } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

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
    return () => {
      cancelled = true;
    };
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
            // detect new drop for animation
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room]);

  // Compute effective remaining time for active team (ticks down locally)
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

  const elapsedSinceTick = state ? (Date.now() - new Date(state.last_tick).getTime()) / 1000 : 0;
  const redLeft = state ? (currentTeam === "red" && !state.winner ? state.red_time_left - elapsedSinceTick : state.red_time_left) : 300;
  const blueLeft = state ? (currentTeam === "blue" && !state.winner ? state.blue_time_left - elapsedSinceTick : state.blue_time_left) : 300;

  // Timeout detection — only the current player's client commits the timeout to avoid races
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

  const isMyTurn = !!me && currentPlayerId === me?.id && !state?.winner;

  const handleDrop = useCallback(
    async (col: number) => {
      if (!state || !me || !currentTeam) return;
      if (!isMyTurn) {
        toast.error("Not your turn");
        return;
      }
      const piece = currentTeam === "red" ? "R" : "B";
      const result = dropPiece(state.board as Board, col, piece);
      if (!result) {
        toast.error("Column is full");
        return;
      }
      // Update clocks: subtract elapsed from current team
      const elapsed = (Date.now() - new Date(state.last_tick).getTime()) / 1000;
      const newRed = currentTeam === "red" ? Math.max(0, state.red_time_left - elapsed) : state.red_time_left;
      const newBlue = currentTeam === "blue" ? Math.max(0, state.blue_time_left - elapsed) : state.blue_time_left;

      const win = checkWin(result.board);
      const draw = !win && isBoardFull(result.board);
      const order = (room?.turn_order || []) as string[];
      const nextIndex = (state.current_turn_index + 1) % Math.max(order.length, 1);

      setLastDrop({ row: result.row, col });
      const update: Partial<GameStateRow> & { board: Board } = {
        board: result.board,
        current_turn_index: nextIndex,
        red_time_left: Math.floor(newRed),
        blue_time_left: Math.floor(newBlue),
        last_tick: new Date().toISOString() as unknown as string,
      };
      if (win) {
        update.winner = win.winner === "R" ? "red" : "blue";
        update.winning_cells = win.cells;
      } else if (draw) {
        update.winner = "draw";
      }
      const { error } = await supabase
        .from("game_state")
        .update(update as never)
        .eq("room_id", state.room_id);
      if (error) toast.error(error.message);
    },
    [state, me, currentTeam, isMyTurn, room],
  );

  const sendChat = async (msg: string) => {
    if (!me || !room) return;
    await supabase.from("chat_messages").insert({ room_id: room.id, player_id: me.id, message: msg });
  };

  const playAgain = async () => {
    if (!room) return;
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-3 py-4 md:py-6">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate({ to: "/" })} className="text-xs text-muted-foreground hover:text-foreground">
            ← Leave
          </button>
          <div className="text-xs text-muted-foreground">Room <span className="font-mono">{upperCode}</span></div>
        </div>

        {/* Turn order bar */}
        <Card className="p-3 bg-card border-border">
          <div className="grid grid-cols-4 gap-2">
            {order.map((pid, idx) => {
              const p = players.find((x) => x.id === pid);
              if (!p) return <div key={pid} />;
              const active = idx === state.current_turn_index && !state.winner;
              return (
                <div
                  key={pid}
                  className={`relative p-2 rounded-md text-center transition ${
                    active ? "ring-2" : "opacity-50"
                  }`}
                  style={{
                    backgroundColor: `${p.team === "red" ? "#ef4444" : "#3b82f6"}1f`,
                    boxShadow: active ? `0 0 0 2px ${p.team === "red" ? "#ef4444" : "#3b82f6"}` : undefined,
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: p.team === "red" ? "#ef4444" : "#3b82f6" }}
                    />
                    <div className="text-xs sm:text-sm font-medium truncate">{p.nickname}</div>
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
            style={{ backgroundColor: "#1e1e4a", boxShadow: "0 12px 40px rgba(168,85,247,0.25)" }}
          >
            <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: "6px" }}>
              {Array.from({ length: ROWS * COLS }).map((_, idx) => {
                const r = Math.floor(idx / COLS);
                const c = idx % COLS;
                const cell = board[r]?.[c];
                const isWin = winningSet.has(`${r},${c}`);
                const justDropped = lastDrop && lastDrop.row === r && lastDrop.col === c;
                return (
                  <button
                    key={`${r}-${c}`}
                    onClick={() => handleDrop(c)}
                    disabled={!isMyTurn}
                    className="relative aspect-square rounded-full bg-[#0f0f1a] flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 md:w-14 md:h-14 transition hover:bg-[#191932] disabled:cursor-not-allowed"
                    aria-label={`Drop in column ${c + 1}`}
                  >
                    {cell && (
                      <div
                        className={`w-[82%] h-[82%] rounded-full ${justDropped ? "animate-piece-drop" : ""} ${
                          isWin ? "animate-win-pulse" : ""
                        }`}
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

        {/* Turn status */}
        <div className="text-center mt-3 text-sm">
          {state.winner ? (
            <span className="text-muted-foreground">Game over</span>
          ) : currentPlayer ? (
            <span>
              Turn:{" "}
              <span style={{ color: currentTeam === "red" ? "#ef4444" : "#3b82f6" }} className="font-semibold">
                {currentPlayer.nickname}
              </span>{" "}
              {isMyTurn ? "(your move)" : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Waiting…</span>
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
              ) : (
                <span>
                  <span style={{ color: state.winner === "red" ? "#ef4444" : "#3b82f6" }} className="font-bold">
                    {state.winner === "red" ? "Red" : "Blue"} Team
                  </span>{" "}
                  wins! 🎉
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {state.winner && state.winner !== "draw"
              ? "Four in a row — well played."
              : "The board is full with no winner."}
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Back to Home
            </Button>
            <Button onClick={playAgain} className="bg-[#a855f7] hover:bg-[#9333ea] text-white">
              Play Again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shopOpen} onOpenChange={setShopOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Locked phrase 🔒</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This phrase is part of a paid pack. Visit the Shop to learn more.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShopOpen(false)}>Close</Button>
            <Button onClick={() => navigate({ to: "/shop" })} className="bg-[#a855f7] hover:bg-[#9333ea] text-white">
              Open Shop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClockBox({ team, left, active }: { team: Team; left: number; active: boolean }) {
  const color = team === "red" ? "#ef4444" : "#3b82f6";
  const label = team === "red" ? "🔴 Team Red" : "🔵 Team Blue";
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