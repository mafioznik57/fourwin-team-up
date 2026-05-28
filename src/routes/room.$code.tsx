import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  getClientId,
  getSavedNick,
  saveNick,
  joinRoomByCode,
  startGame,
  type PlayerRow,
  type RoomRow,
  type Team,
} from "@/lib/fourwin";
import { toast } from "sonner";
import { Copy, Link as LinkIcon, Check, Hourglass } from "lucide-react";

export const Route = createFileRoute("/room/$code")({
  head: () => ({ meta: [{ title: "Room — FourWin" }] }),
  component: RoomRoute,
});

function RoomRoute() {
  const location = useLocation();
  if (location.pathname.toLowerCase().endsWith("/game")) {
    return <Outlet />;
  }
  return <RoomLobby />;
}

function RoomLobby() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const upperCode = code.toUpperCase();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [nick, setNick] = useState(getSavedNick());
  const [joining, setJoining] = useState(false);
  const [me, setMe] = useState<PlayerRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const roomId = room?.id;
  const roomStatus = room?.status;

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: r } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", upperCode)
        .maybeSingle();
      if (cancelled) return;
      if (!r) {
        setNotFound(true);
        return;
      }
      setRoom(r as RoomRow);
      const { data: ps } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", r.id)
        .order("slot_number");
      if (cancelled) return;
      setPlayers((ps || []) as PlayerRow[]);
      const clientId = getClientId();
      const mine = (ps || []).find((p) => p.client_id === clientId);
      if (mine) setMe(mine as PlayerRow);
      // If game already started and I'm a player, go there.
      if (r.status === "playing" && mine) {
        navigate({ to: "/room/$code/game", params: { code: upperCode } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [upperCode, navigate]);

  // Realtime subscriptions for this room
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`lobby:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          // If a player left, reset ready status for everyone remaining
          if (payload.eventType === "DELETE") {
            await supabase.from("players").update({ ready: false }).eq("room_id", roomId);
          }
          const { data: ps } = await supabase
            .from("players")
            .select("*")
            .eq("room_id", roomId)
            .order("slot_number");
          setPlayers((ps || []) as PlayerRow[]);
          const clientId = getClientId();
          const mine = (ps || []).find((p) => p.client_id === clientId);
          if (mine) setMe(mine as PlayerRow);

          // Auto-start when all 4 players are ready
          if (ps && ps.length === 4 && ps.every((p) => p.ready)) {
            // Re-check current room status from DB to avoid stale closure
            const { data: freshRoom } = await supabase
              .from("rooms")
              .select("status")
              .eq("id", roomId)
              .maybeSingle();
            if (freshRoom?.status === "waiting") {
              try {
                await startGame(roomId, ps as PlayerRow[]);
              } catch (e) {
                console.warn("startGame failed (likely race):", e);
              }
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as RoomRow;
          setRoom(updated);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Navigate to game whenever room becomes "playing" (covers both realtime updates
  // and the case where the player joins a room that's already started).
  useEffect(() => {
    if (roomStatus === "playing" && me) {
      navigate({ to: "/room/$code/game", params: { code: upperCode } });
    }
  }, [roomStatus, me, navigate, upperCode]);

  // Safety net: poll room status every 2s in case Realtime drops the UPDATE event.
  useEffect(() => {
    if (!roomId || roomStatus !== "waiting") return;
    const interval = setInterval(async () => {
      const { data } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
      if (data && data.status !== roomStatus) {
        setRoom(data as RoomRow);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [roomId, roomStatus]);

  const join = async () => {
    if (!nick.trim()) {
      toast.error("Enter a nickname");
      return;
    }
    setJoining(true);
    try {
      saveNick(nick.trim());
      const { player } = await joinRoomByCode(upperCode, nick.trim());
      setMe(player as PlayerRow);
      toast.success(`Joined ${player.team} team`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const switchTeam = async (team: Team) => {
    if (!me) return;
    const sameTeamCount = players.filter((p) => p.team === team && p.id !== me.id).length;
    if (sameTeamCount >= 2) {
      toast.error("That team is full");
      return;
    }
    const base = team === "red" ? 0 : 2;
    const usedSlots = new Set(players.filter((p) => p.id !== me.id).map((p) => p.slot_number));
    const slotNumber = !usedSlots.has(base) ? base : base + 1;
    // Switching team resets ready for everyone
    const { error } = await supabase
      .from("players")
      .update({ team, slot_number: slotNumber, ready: false })
      .eq("id", me.id);
    if (!error && room) {
      await supabase.from("players").update({ ready: false }).eq("room_id", room.id);
    }
    if (error) toast.error(error.message);
  };

  const toggleReady = async () => {
    if (!me) return;
    const { error } = await supabase.from("players").update({ ready: !me.ready }).eq("id", me.id);
    if (error) toast.error(error.message);
  };

  const copyLink = () => {
    const url = `${window.location.origin}/room/${upperCode}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };
  const copyCode = () => {
    navigator.clipboard.writeText(upperCode);
    toast.success("Code copied");
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <Card className="p-6 max-w-md w-full text-center bg-card border-border">
          <h1 className="text-xl font-bold">Room not found</h1>
          <p className="text-sm text-muted-foreground mt-2">
            No room with code <span className="font-mono">{upperCode}</span>.
          </p>
          <Button onClick={() => navigate({ to: "/" })} className="mt-4">
            Back home
          </Button>
        </Card>
      </div>
    );
  }

  const redPlayers = players.filter((p) => p.team === "red");
  const bluePlayers = players.filter((p) => p.team === "blue");

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate({ to: "/" })}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <div className="text-sm text-muted-foreground">Lobby</div>
        </div>

        <Card className="p-6 bg-card border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Room code
              </div>
              <div className="text-4xl font-extrabold tracking-widest">{upperCode}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyCode}>
                <Copy className="w-4 h-4 mr-1" />
                Code
              </Button>
              <Button variant="outline" size="sm" onClick={copyLink}>
                <LinkIcon className="w-4 h-4 mr-1" />
                Link
              </Button>
            </div>
          </div>

          {!me ? (
            <div className="mt-6 space-y-3">
              <label className="text-sm font-medium">Pick your nickname</label>
              <div className="flex gap-2">
                <Input
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  maxLength={16}
                  placeholder="Your name"
                />
                <Button
                  onClick={join}
                  disabled={joining}
                  className="bg-[#a855f7] hover:bg-[#9333ea] text-white"
                >
                  {joining ? "Joining…" : "Join"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                You'll be auto-assigned to the team with fewer players.
              </p>
            </div>
          ) : (
            <div className="mt-4 text-sm text-muted-foreground">
              You're <span className="text-foreground font-semibold">{me.nickname}</span> on{" "}
              <span
                style={{ color: me.team === "red" ? "#ef4444" : "#3b82f6" }}
                className="font-semibold"
              >
                {me.team === "red" ? "Red" : "Blue"}
              </span>{" "}
              team.
            </div>
          )}
        </Card>

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <TeamPanel
            color="#ef4444"
            label="Red Team"
            players={redPlayers}
            me={me}
            onSwitch={() => switchTeam("red")}
          />
          <TeamPanel
            color="#3b82f6"
            label="Blue Team"
            players={bluePlayers}
            me={me}
            onSwitch={() => switchTeam("blue")}
          />
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          {me ? (
            <Button
              size="lg"
              onClick={toggleReady}
              className={
                me.ready
                  ? "bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                  : "bg-[#a855f7] hover:bg-[#9333ea] text-white w-full sm:w-auto"
              }
            >
              {me.ready ? "✅ Ready — Click to cancel" : "Click when ready"}
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {players.length < 4
              ? `Waiting for players (${players.length}/4)`
              : players.every((p) => p.ready)
                ? "Starting game…"
                : `Ready: ${players.filter((p) => p.ready).length}/4`}
          </p>
        </div>
      </div>
    </div>
  );
}

function TeamPanel({
  color,
  label,
  players,
  me,
  onSwitch,
}: {
  color: string;
  label: string;
  players: PlayerRow[];
  me: PlayerRow | null;
  onSwitch: () => void;
}) {
  const meIsHere = me && players.some((p) => p.id === me.id);
  const canSwitch = me && !meIsHere && players.length < 2;
  return (
    <Card className="p-5 bg-card border-border" style={{ borderTop: `3px solid ${color}` }}>
      <div className="flex items-center justify-between">
        <div className="font-bold" style={{ color }}>
          {label}
        </div>
        {canSwitch && (
          <Button size="sm" variant="outline" onClick={onSwitch}>
            Switch here
          </Button>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {[0, 1].map((i) => {
          const p = players[i];
          return (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-md bg-secondary/40 min-h-[48px]"
            >
              {p ? (
                <>
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: color }} />
                  <div className="flex-1 truncate">
                    {p.nickname}{" "}
                    {me?.id === p.id && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                  </div>
                  {p.ready ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-500">
                      <Check className="w-4 h-4" /> Ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Hourglass className="w-3.5 h-3.5" /> Waiting
                    </span>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground italic">Empty slot</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
