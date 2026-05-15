export const theme = {
  fonts: {
    headline: '"Manrope", "IBM Plex Sans", "Segoe UI", sans-serif',
    body: '"Inter", "IBM Plex Sans", "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", Consolas, monospace',
  },
  colors: {
    ink: "#0b1c30",
    inkSoft: "#425267",
    surface: "#f8f9ff",
    surfaceLow: "#eff4ff",
    surfaceHigh: "#ffffff",
    line: "#d3e4fe",
    navy: "#00263f",
    steel: "#0b3c5d",
    sky: "#7fa7cd",
    red: "#e32636",
    redSoft: "#fde3e7",
    green: "#1f7a4d",
    amber: "#d68910",
    white: "#ffffff",
    shadow: "rgba(11, 60, 93, 0.18)",
  },
  gradients: {
    bg: "linear-gradient(180deg, #f8f9ff 0%, #eef4ff 100%)",
    hero: "radial-gradient(circle at top left, rgba(127, 167, 205, 0.28), transparent 42%), radial-gradient(circle at bottom right, rgba(227, 38, 54, 0.14), transparent 30%)",
    overlay: "linear-gradient(135deg, rgba(0,38,63,0.92), rgba(11,60,93,0.82))",
  },
  radii: {
    panel: 28,
    card: 20,
    pill: 999,
  },
  shadows: {
    panel: "0 30px 80px rgba(11, 60, 93, 0.18)",
    card: "0 18px 46px rgba(11, 60, 93, 0.12)",
    glow: "0 0 0 1px rgba(127, 167, 205, 0.18), 0 24px 60px rgba(11, 60, 93, 0.12)",
  },
};

export const aspectTheme = {
  landscape: {
    framePadding: 72,
    maxTextWidth: 620,
    screenshotHeight: 640,
  },
  vertical: {
    framePadding: 52,
    maxTextWidth: 760,
    screenshotHeight: 840,
  },
} as const;
