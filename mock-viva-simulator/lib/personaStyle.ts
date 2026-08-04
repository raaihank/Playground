// Pure, hook-free persona styling helpers. Kept separate from useSpeech.ts so
// server components (e.g. the Summary view via Transcript) can import the color
// and avatar helpers without pulling React client hooks into a server module.
import type { Persona } from "@/lib/types";

// Stable seed per panel persona so each member keeps a consistent voice/color.
export function seedForPersona(personaId: string): number {
  if (personaId === "chair") return 0;
  if (personaId === "m1") return 1;
  if (personaId === "m2") return 2;
  return 0;
}

// A consistent accent per panelist, keyed by the same seed as the voice, so the
// orb gradient, avatar, and transcript dot all read as the *same* person. Colors
// are picked to hold up in both light and dark mode.
export type PersonaColor = {
  from: string; // orb gradient start
  to: string; // orb gradient end
  glow: string; // soft halo while speaking
  accent: string; // solid accent for avatars / dots / text
};

const PERSONA_COLORS: PersonaColor[] = [
  { from: "#6366f1", to: "#8b5cf6", glow: "rgba(99,102,241,0.55)", accent: "#6366f1" }, // chair — indigo/violet
  { from: "#14b8a6", to: "#06b6d4", glow: "rgba(20,184,166,0.55)", accent: "#0d9488" }, // member 1 — teal/cyan
  { from: "#f59e0b", to: "#f97316", glow: "rgba(245,158,11,0.55)", accent: "#d97706" }, // member 2 — amber/orange
];

export function colorForSeed(seed: number): PersonaColor {
  const n = PERSONA_COLORS.length;
  return PERSONA_COLORS[((seed % n) + n) % n];
}

export function colorForPersona(personaId: string): PersonaColor {
  return colorForSeed(seedForPersona(personaId));
}

// First letters of a name, for avatar fallbacks (e.g. "Md. Karim" -> "MK").
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Convenience: the seed for a Persona object.
export function seedForPanelMember(p: Persona): number {
  return seedForPersona(p.id);
}
