import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type Team } from "@/lib/fourwin";
import { createRoomFn } from "@/lib/fourwin.functions";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { toast } from "sonner";

export const Route = createFileRoute("/create")({
  head: () => ({ meta: [{ title: "Create Room — FourWin" }] }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: CreatePage,
});

function CreatePage() {
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team>("red");
  const [loading, setLoading] = useState(false);
  const createRoomCall = useServerFn(createRoomFn);

  const submit = async () => {
    setLoading(true);
    try {
      const { code } = await createRoomCall({ data: { team } });
      navigate({ to: "/room/$code", params: { code } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md p-6 bg-card border-border">
        <h1 className="text-2xl font-bold mb-1">Create a Room</h1>
        <p className="text-sm text-muted-foreground mb-6">Pick a team. We'll generate a code to share.</p>

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