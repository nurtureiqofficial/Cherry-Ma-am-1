export type SessionState = "disconnected" | "connecting" | "idle" | "listening" | "speaking" | "error";

export type TeachingPhase = "intro" | "concept" | "example" | "doubt" | "transition";

export interface ToolCallPayload {
  id: string;
  name: string;
  args: any;
}

export interface LiveTranscription {
  text: string;
  finished: boolean;
  id?: string;
}

export type ThemeType = "cherry" | "matrix" | "cyber" | "sunset" | "slate" | "ivory";

export interface ThemeColors {
  primary: string; // Tailwind colors like 'indigo-600' or hex
  accent: string;
  glow: string;
  bgGradient: string;
  waveColors: string[];
}

export const THEME_CONFIGS: Record<ThemeType, ThemeColors> = {
  cherry: {
    primary: "#0c201a", // Deep dark teal/forest green board
    accent: "#c4f500",  // Sassy lime neon
    glow: "rgba(196, 245, 0, 0.35)",
    bgGradient: "from-[#f7f9f6] via-[#f7f9f6] to-[#eff2ee]",
    waveColors: ["#0a3641", "#c4f500", "#124e5d", "#a8d400"],
  },
  matrix: {
    primary: "#020a05", // Deep pitch dark terminal board
    accent: "#00ff66",  // Matrix code lime neon green
    glow: "rgba(0, 255, 102, 0.35)",
    bgGradient: "from-[#020a05] via-[#05140b] to-[#010502]",
    waveColors: ["#003311", "#00ff66", "#006622", "#33ff99"],
  },
  cyber: {
    primary: "#120924", // Cyberpunk sleek deep violet indigo board
    accent: "#00f0ff",  // Electric neon cyan
    glow: "rgba(0, 240, 255, 0.35)",
    bgGradient: "from-[#120924] via-[#1a0c30] to-[#0d061c]",
    waveColors: ["#1a0b36", "#00f0ff", "#a100ff", "#ff007f"],
  },
  sunset: {
    primary: "#240a0a", // Fiery twilight dark red-burgundy board
    accent: "#ffaa00",  // Hot amber-gold glow
    glow: "rgba(255, 170, 0, 0.35)",
    bgGradient: "from-[#240a0a] via-[#2f1010] to-[#1a0505]",
    waveColors: ["#300f0f", "#ffaa00", "#ff3300", "#ffea00"],
  },
  slate: {
    primary: "#1e293b", // Professional modern graphite/slate gray board
    accent: "#38bdf8",  // Clean crisp neon sky blue
    glow: "rgba(56, 189, 248, 0.35)",
    bgGradient: "from-[#1e293b] via-[#334155] to-[#0f172a]",
    waveColors: ["#0f172a", "#38bdf8", "#1e293b", "#7dd3fc"],
  },
  ivory: {
    primary: "#ffffff", // Pure Snow White board matching screenshots
    accent: "#0f172a",  // High-contrast deep slate/charcoal for premium text/controls
    glow: "rgba(15, 23, 42, 0.15)",
    bgGradient: "from-white via-white to-[#fafafa]",
    waveColors: ["#b4b1e4", "#fbbfb5", "#b3e5df", "#fcdcb2"],
  },
};
