import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, Crown, Flame, Sparkles, Zap } from "lucide-react";

export const Route = createFileRoute("/shop")({
  head: () => ({ meta: [{ title: "Shop — FourWin" }] }),
  component: ShopPage,
});

function ShopPage() {
  const navigate = useNavigate();
  const buy = (label: string) => toast(`${label} — Coming Soon`, { description: "Payments aren't enabled yet." });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <button onClick={() => navigate({ to: "/" })} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <h1 className="text-xl font-bold">FourWin Store</h1>
        <div className="w-10" />
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-16 space-y-10">
        <Section title="Quick Chat Packs" subtitle="Spice up team chat with extra phrases.">
          <div className="grid sm:grid-cols-2 gap-4">
            <ProductCard
              icon={<Sparkles />}
              title="Trash Talk Pack"
              price="$1.99"
              items={["💀 You're done!", "😈 No mercy!", "👑 King of the board", "🎯 Calculated…"]}
              onBuy={() => buy("Trash Talk Pack")}
            />
            <ProductCard
              icon={<Zap />}
              title="Hype Pack"
              price="$1.99"
              items={["🔥 I'm on fire!", "⚡ Speed demon!", "🏆 Unbeatable!", "😤 Too easy"]}
              onBuy={() => buy("Hype Pack")}
            />
          </div>
        </Section>

        <Section title="Piece Skins" subtitle="Style up your pieces.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SkinCard label="Default" free preview={<DefaultSkin />} onBuy={() => toast("Default skin is free")} />
            <SkinCard label="Fire Pack" price="$2.99" preview={<FireSkin />} onBuy={() => buy("Fire Pack")} />
            <SkinCard label="Galaxy Pack" price="$2.99" preview={<GalaxySkin />} onBuy={() => buy("Galaxy Pack")} />
            <SkinCard label="Neon Pack" price="$2.99" preview={<NeonSkin />} onBuy={() => buy("Neon Pack")} />
          </div>
        </Section>

        <Section title="FourWin Pro" subtitle="Everything, all unlocked.">
          <Card className="p-6 bg-gradient-to-br from-[#a855f7]/30 to-[#3b82f6]/20 border-[#a855f7]/40">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold">
                  <Crown className="text-yellow-300" /> FourWin Pro
                </div>
                <ul className="mt-3 text-sm text-muted-foreground space-y-1">
                  <li>• Unlocks ALL current and future items</li>
                  <li>• Remove ads (future)</li>
                  <li>• Pro badge next to your username</li>
                </ul>
              </div>
              <div className="text-center">
                <div className="text-3xl font-extrabold">$4.99<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                <Button onClick={() => buy("FourWin Pro")} className="mt-3 bg-[#a855f7] hover:bg-[#9333ea] text-white">
                  <Lock className="w-4 h-4 mr-1" /> Buy
                </Button>
              </div>
            </div>
          </Card>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>}
      {children}
    </section>
  );
}

function ProductCard({
  icon, title, price, items, onBuy,
}: { icon: React.ReactNode; title: string; price: string; items: string[]; onBuy: () => void }) {
  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">{icon}{title}</div>
        <div className="text-sm font-mono">{price}</div>
      </div>
      <ul className="mt-3 text-sm text-muted-foreground space-y-1">
        {items.map((i) => <li key={i}>• {i}</li>)}
      </ul>
      <Button onClick={onBuy} className="w-full mt-4 bg-[#a855f7] hover:bg-[#9333ea] text-white">
        <Lock className="w-4 h-4 mr-1" /> Buy
      </Button>
    </Card>
  );
}

function SkinCard({
  label, price, free, preview, onBuy,
}: { label: string; price?: string; free?: boolean; preview: React.ReactNode; onBuy: () => void }) {
  return (
    <Card className="p-4 bg-card border-border text-center">
      <div className="flex justify-center gap-1 mb-3">{preview}</div>
      <div className="font-semibold">{label}</div>
      <div className="text-sm font-mono text-muted-foreground">{free ? "Free" : price}</div>
      <Button onClick={onBuy} size="sm" variant={free ? "secondary" : "default"} className={free ? "w-full mt-3" : "w-full mt-3 bg-[#a855f7] hover:bg-[#9333ea] text-white"}>
        {free ? "Equipped" : <><Lock className="w-3 h-3 mr-1" /> Buy</>}
      </Button>
    </Card>
  );
}

function Piece({ style }: { style: React.CSSProperties }) {
  return <div className="w-7 h-7 rounded-full" style={style} />;
}
function DefaultSkin() {
  return (
    <>
      <Piece style={{ background: "radial-gradient(circle at 30% 30%, #ff8585, #ef4444 60%, #b91c1c)" }} />
      <Piece style={{ background: "radial-gradient(circle at 30% 30%, #93c5fd, #3b82f6 60%, #1d4ed8)" }} />
    </>
  );
}
function FireSkin() {
  return (
    <>
      <Piece style={{ background: "radial-gradient(circle at 30% 30%, #fde68a, #f97316, #b91c1c)", boxShadow: "0 0 10px #f97316" }} />
      <Piece style={{ background: "radial-gradient(circle at 30% 30%, #fef3c7, #f59e0b, #7c2d12)", boxShadow: "0 0 10px #f59e0b" }} />
    </>
  );
}
function GalaxySkin() {
  return (
    <>
      <Piece style={{ background: "radial-gradient(circle at 30% 30%, #f0abfc, #a855f7, #581c87)", boxShadow: "0 0 10px #a855f7" }} />
      <Piece style={{ background: "radial-gradient(circle at 30% 30%, #67e8f9, #06b6d4, #155e75)", boxShadow: "0 0 10px #06b6d4" }} />
    </>
  );
}
function NeonSkin() {
  return (
    <>
      <Piece style={{ background: "#ef4444", boxShadow: "0 0 14px #ef4444, inset 0 0 6px #fff" }} />
      <Piece style={{ background: "#3b82f6", boxShadow: "0 0 14px #3b82f6, inset 0 0 6px #fff" }} />
    </>
  );
}
// keep imports used
const _ = Flame;
void _;