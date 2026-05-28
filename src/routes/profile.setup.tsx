import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AVATARS } from "@/lib/avatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/profile/setup")({
  head: () => ({ meta: [{ title: "Set Up Profile — FourWin" }] }),
  component: ProfileSetup,
});

function ProfileSetup() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [avatarId, setAvatarId] = useState(profile?.avatar_id ?? "default");
  const [saving, setSaving] = useState(false);

  if (!user) {
    navigate({ to: "/login" });
    return null;
  }

  const save = async () => {
    if (!nickname.trim()) {
      toast.error("Nickname is required");
      return;
    }
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
      toast.success("Profile saved!");
      navigate({ to: "/" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 bg-card border-border">
        <h1 className="text-2xl font-bold mb-1">Set Up Your Profile</h1>
        <p className="text-sm text-muted-foreground mb-6">Choose how you appear to other players.</p>

        <label className="text-sm font-medium block mb-1">Nickname</label>
        <Input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
          placeholder="Your display name"
          className="mb-5"
        />

        <label className="text-sm font-medium block mb-2">Avatar</label>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {AVATARS.map((av) => (
            <button
              key={av.id}
              onClick={() => setAvatarId(av.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition ${
                avatarId === av.id ? "border-blue-500 bg-blue-500/10" : "border-border hover:border-border/80"
              }`}
            >
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                style={{ backgroundColor: av.bg }}
              >
                {av.emoji}
              </span>
              <span className="text-xs text-muted-foreground">{av.label}</span>
            </button>
          ))}
        </div>

        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </Card>
    </div>
  );
}
