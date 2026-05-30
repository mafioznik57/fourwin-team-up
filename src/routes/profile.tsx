import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — FourWin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition">
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold mb-6">Your profile</h1>
        {loading || !profile ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <Card className="p-6 bg-card border-border space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#a855f7] to-[#3b82f6] flex items-center justify-center text-2xl font-bold text-white">
                {profile.nickname.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="text-2xl font-bold">{profile.nickname}</div>
                <div className="text-sm text-muted-foreground">{user?.email}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
              <Stat label="ELO" value={profile.elo_rating} />
              <Stat label="Wins" value={profile.wins} />
              <Stat label="Losses" value={profile.losses} />
              <Stat label="Draws" value={profile.draws} />
            </div>

            <div className="pt-4 flex gap-2">
              <Button variant="outline" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-md bg-secondary/40 text-center">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}