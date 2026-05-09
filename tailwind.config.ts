import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0a0a0a",
          panel: "#111111",
          border: "#1f1f1f",
          accent: "#22c55e",
          warn: "#f59e0b",
          danger: "#ef4444",
          text: "#e5e5e5",
          muted: "#737373",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "slide-in": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-once": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "slide-in": "slide-in 0.25s ease-out",
        "pulse-once": "pulse-once 0.6s ease-in-out 1",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
