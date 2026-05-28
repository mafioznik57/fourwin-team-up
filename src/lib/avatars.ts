export interface AvatarOption {
  id: string;
  label: string;
  emoji: string;
  bg: string;
}

export const AVATARS: AvatarOption[] = [
  { id: "default", label: "Ghost", emoji: "👻", bg: "#6b7280" },
  { id: "fox",     label: "Fox",   emoji: "🦊", bg: "#f97316" },
  { id: "bear",    label: "Bear",  emoji: "🐻", bg: "#92400e" },
  { id: "wolf",    label: "Wolf",  emoji: "🐺", bg: "#64748b" },
  { id: "lion",    label: "Lion",  emoji: "🦁", bg: "#ca8a04" },
  { id: "shark",   label: "Shark", emoji: "🦈", bg: "#0ea5e9" },
  { id: "eagle",   label: "Eagle", emoji: "🦅", bg: "#7c3aed" },
  { id: "dragon",  label: "Dragon",emoji: "🐉", bg: "#dc2626" },
];

export function getAvatar(id: string): AvatarOption {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
