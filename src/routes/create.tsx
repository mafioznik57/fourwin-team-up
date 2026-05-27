import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createRoom, getSavedNick, saveNick, type Team } from "@/lib/fourwin";
import { toast } from "sonner";

export const Route = createFileRoute("/create")({
  head: () => ({ meta: [{ title: "Create Room — FourWin" }] }),
  component: CreatePage,
});

function CreatePage() {
  const navigate = useNavigate();
  const [nick, setNick] = useState(getSavedNick());
  const [team, setTeam] = useState<Team>("red");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!nick.trim()) {
      toast.error("Pick a nickname");
      return;
    }
    setLoading(true);
    try {
      saveNick(nick.trim());
      const { room } = await createRoom(nick.trim(), team);
      navigate({ to: "/room/$code", params: { code: room.code } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-6 bg-card border-border">
        <h1 className="text-2xl font-bold mb-1">Create a Room</h1>
        <p className="text-sm text-muted-foreground mb-6">Pick your name and team. We'll generate a code to share.</p>

        <label className="text-sm font-medium">Nickname</label>
        <Input
          maxLength={16}
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          placeholder="Your name"
          className="mt-1 mb-4"
        />

        <label className="text-sm font-medium">Team</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <TeamButton color="#ef4444" label="Red" active={team === "red"} onClick={() => setTeam("red")} />
          <TeamButton color="#3b82f6" label="Blue" active={team === "blue"} onClick={() => setTeam("blue")} />
        </div>

        <Button
          disabled={loading}
          onClick={submit}
          className="w-full mt-6 bg-[#a855f7] hover:bg-[#9333ea] text-white"
        >
          {loading ? "Creating…" : "Create Room"}
        </Button>

        <Button variant="ghost" className="w-full mt-2" onClick={() => navigate({ to: "/" })}>
          Back
        </Button>
      </Card>
    </div>
  );
}

function TeamButton({ color, label, active, onClick }: { color: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition flex items-center gap-3 ${
        active ? "border-white/80" : "border-border hover:border-white/30"
      }`}
      style={{ backgroundColor: active ? `${color}22` : "transparent" }}
    >
      <div className="w-6 h-6 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-semibold">{label}</span>
    </button>
  );
}