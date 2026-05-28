import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getAvatar, AVATARS } from "@/lib/avatars";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type MatchResult = Database["public"]["Tables"]["match_results"]["Row"];

export const Route = createFileRoute("/profile/")({
  head: () => ({ meta: [{ title: "Profile — FourWin" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [avatarId, setAvatarId] = useState("default");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname);
      setAvatarId(profile.avatar_id);
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("match_results")
      .select("*")
      .or(`red_player_ids.cs.{${user.id}},blue_player_ids.cs.{${user.id}}`)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setMatches(data ?? []));
  }, [user]);

  const save = async () => {
    if (!user || !nickname.trim()) { toast.error("Nickname required"); return; }
    if (nickname.trim().length < 2 || nickname.trim().length > 16) {
      toast.error("Nickname must be 2–16 characters");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ nickname: nickname.trim(), avatar_id: avatarId })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      setEditing(false);
      toast.success("Profile updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile || !user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        Loading...
      </div>
    );
  }

  const wins   = matches.filter((m) => {
    const onRed  = m.red_player_ids.includes(user.id);
    const onBlue = m.blue_player_ids.includes(user.id);
    return (onRed && m.winner_team === "red") || (onBlue && m.winner_team === "blue");
  }).length;
  const losses = matches.filter((m) => {
    const onRed  = m.red_player_ids.includes(user.id);
    const onBlue = m.blue_player_ids.includes(user.id);
    return (onRed && m.winner_team === "blue") || (onBlue && m.winner_team === "red");
  }).length;
  const draws  = matches.filter((m) => m.winner_team === "draw").length;

  const av = getAvatar(editing ? avatarId : profile.avatar_id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate({ to: "/" })} className="text-sm text-muted-foreground hover:text-foreground">
            Back
          </button>
          <Button size="sm" variant="ghost" onClick={signOut} className="text-muted-foreground">
            Sign Out
          </Button>
        </div>

        {/* Profile card */}
        <Card className="p-6 bg-card border-border mb-6">
          <div className="flex items-start gap-5">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-3xl shrink-0"
              style={{ backgroundColor: av.bg }}
            >
              {av.emoji}
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-3">
                  <Input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={16}
                    className="text-lg font-bold"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    {AVATARS.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setAvatarId(a.id)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition ${
                          avatarId === a.id ? "border-blue-500 bg-blue-500/10" : "border-border"
                        }`}
                      >
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                          style={{ backgroundColor: a.bg }}
                        >
                          {a.emoji}
                        </span>
                        <span className="text-xs text-muted-foreground">{a.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={save} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(false); setNickname(profile.nickname); setAvatarId(profile.avatar_id); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">{profile.nickname}</h1>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-sm font-medium">
                    <span className="text-yellow-400">ELO</span>
                    <span className="font-mono font-bold">{profile.elo}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatBox label="Wins" value={wins} color="#22c55e" />
          <StatBox label="Losses" value={losses} color="#ef4444" />
          <StatBox label="Draws" value={draws} color="#94a3b8" />
        </div>

        {/* Match history */}
        <h2 className="text-lg font-bold mb-3">Match History</h2>
        {matches.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground bg-card border-border">
            No matches played yet.
          </Card>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => {
              const onRed  = m.red_player_ids.includes(user.id);
              const onBlue = m.blue_player_ids.includes(user.id);
              const myTeam = onRed ? "red" : onBlue ? "blue" : null;
              const result =
                m.winner_team === "draw" ? "draw"
                : myTeam === m.winner_team ? "win"
                : "loss";
              return (
                <MatchRow key={m.id} match={m} result={result} userId={user.id} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card className="p-4 bg-card border-border text-center">
      <div className="text-3xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{label}</div>
    </Card>
  );
}

function MatchRow({ match, result, userId }: { match: MatchResult; result: "win" | "loss" | "draw"; userId: string }) {
  const resultColor = result === "win" ? "#22c55e" : result === "loss" ? "#ef4444" : "#94a3b8";
  const resultLabel = result === "win" ? "WIN" : result === "loss" ? "LOSS" : "DRAW";
  const date = new Date(match.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const eloChanges = match.elo_changes as Record<string, number> ?? {};
  const eloChange = eloChanges[userId];

  return (
    <Card className="p-4 bg-card border-border flex items-center gap-4">
      <div
        className="text-xs font-bold w-12 text-center px-2 py-1 rounded"
        style={{ color: resultColor, backgroundColor: `${resultColor}22` }}
      >
        {resultLabel}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex gap-2 text-sm flex-wrap">
          <span style={{ color: "#ef4444" }} className="font-medium">
            {match.red_nicknames.join(" & ")}
          </span>
          <span className="text-muted-foreground">vs</span>
          <span style={{ color: "#3b82f6" }} className="font-medium">
            {match.blue_nicknames.join(" & ")}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{date}</div>
      </div>
      {eloChange !== undefined && (
        <div
          className="text-sm font-mono font-bold"
          style={{ color: eloChange >= 0 ? "#22c55e" : "#ef4444" }}
        >
          {eloChange >= 0 ? "+" : ""}{eloChange}
        </div>
      )}
    </Card>
  );
}
