import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trophy, Globe2, Target, Sparkles, Users } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FourWin — Connect Four. Together." },
      { name: "description", content: "FourWin is a 2v2 team Connect Four game. Drop in, team up, and outsmart your opponents in real time." },
      { property: "og:title", content: "FourWin — Connect Four. Together." },
      { property: "og:description", content: "A 2v2 team Connect Four game. Play online with friends." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main className="px-6 max-w-6xl mx-auto">
        <section className="text-center py-16 md:py-24">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-[#ef4444] via-[#a855f7] to-[#3b82f6] bg-clip-text text-transparent">
              FourWin
            </span>
          </h1>
          <p className="mt-4 text-lg md:text-xl text-muted-foreground">
            Connect Four. Together.
          </p>
          <p className="mt-6 max-w-xl mx-auto text-muted-foreground">
            A real-time <span className="text-foreground font-medium">2v2 team Connect Four</span>.
            Two teammates alternate turns against the rival team — strategize, communicate, and beat the clock.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => navigate({ to: "/create" })} className="bg-[#a855f7] hover:bg-[#9333ea] text-white">
              Create Room
            </Button>
            <Button size="lg" variant="outline" onClick={() => setJoinOpen(true)}>
              Join Room
            </Button>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4 py-8">
          <FeatureCard icon={<Users className="text-[#ef4444]" />} title="2 vs 2 Teams" desc="Red team vs Blue team. Each player takes turns in a fixed random order." />
          <FeatureCard icon={<Sparkles className="text-[#a855f7]" />} title="Team Chess Clock" desc="5 minutes per team total. Run out of time and your team loses." />
          <FeatureCard icon={<Trophy className="text-[#3b82f6]" />} title="Quick Chat" desc="Tap preset phrases to hype teammates and trash-talk rivals." />
        </section>

        <section className="mt-12 mb-20">
          <Card className="p-6 bg-card border-border">
            <div className="text-sm uppercase tracking-wider text-[#a855f7] font-semibold mb-3">Coming Soon</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ComingSoon icon={<Trophy className="w-4 h-4" />} label="Tournaments 🏆" />
              <ComingSoon icon={<Globe2 className="w-4 h-4" />} label="Global Leaderboard 🌍" />
              <ComingSoon icon={<Target className="w-4 h-4" />} label="Matchmaking 🎯" />
            </div>
          </Card>
        </section>

        <footer className="py-8 text-center text-xs text-muted-foreground">
          Built for fun. © FourWin
        </footer>
      </main>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join a Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm text-muted-foreground">Enter the 6-character room code</label>
            <Input
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="ABCD12"
              className="uppercase text-center text-2xl tracking-widest font-bold"
            />
          </div>
          <DialogFooter>
            <Button
              disabled={code.length !== 6}
              onClick={() => navigate({ to: "/room/$code", params: { code } })}
              className="bg-[#a855f7] hover:bg-[#9333ea] text-white"
            >
              Join
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center gap-2 font-semibold">{icon}{title}</div>
      <p className="text-sm text-muted-foreground mt-2">{desc}</p>
    </Card>
  );
}

function ComingSoon({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-md bg-secondary/40 text-sm">
      {icon}
      <span>{label}</span>
    </div>
  );
}
