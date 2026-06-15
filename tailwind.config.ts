import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn semantic tokens (brand-blue values live in globals.css).
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        brand: {
          50: "#eff5ff",
          100: "#dbe7fe",
          200: "#bcd4fd",
          300: "#8eb6fb",
          400: "#5a8ef7",
          500: "#3b71f0",
          600: "#1877f2",
          700: "#166fe5",
          800: "#1554b3",
          900: "#143f8a",
        },
        surface: {
          DEFAULT: "#ffffff",
          subtle: "#f8fafc",
          muted: "#f1f5f9",
          sunken: "#e2e8f0",
        },
        ink: {
          DEFAULT: "#0f172a",
          soft: "#1e293b",
          muted: "#64748b",
          subtle: "#94a3b8",
          faint: "#cbd5e1",
        },
        line: {
          DEFAULT: "#e2e8f0",
          strong: "#cbd5e1",
        },
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      },
      fontFamily: {
        sans: ["var(--font-encode-sans)", "system-ui", "sans-serif"],
        display: [
          "var(--font-display)",
          "var(--font-encode-sans)",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "monospace",
        ],
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      boxShadow: {
        // Hairline shadow + tiny lift. The 0 0 0 1px ring substitutes for a
        // visible border on rounded surfaces (borders anti-alias unevenly at
        // rounded corners; box-shadow does not).
        card: "0 0 0 1px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
        "card-hover":
          "0 0 0 1px rgba(15, 23, 42, 0.08), 0 8px 24px -8px rgba(15, 23, 42, 0.12), 0 2px 4px rgba(15, 23, 42, 0.04)",
        hairline: "0 0 0 1px rgba(15, 23, 42, 0.08)",
        "hairline-strong": "0 0 0 1px rgba(15, 23, 42, 0.16)",
        ring: "0 0 0 4px rgba(24, 119, 242, 0.18)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "value-pop": {
          "0%": { transform: "scale(0.94)", opacity: "0.5" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "caret-blink": {
          "0%, 60%": { opacity: "1" },
          "61%, 100%": { opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "fade-up": "fade-up 0.4s ease-out both",
        "fade-down": "fade-down 0.4s ease-out both",
        "scale-in": "scale-in 0.4s ease-out both",
        "soft-pulse": "soft-pulse 1.6s ease-in-out infinite",
        "value-pop": "value-pop 0.4s ease-out both",
        "caret-blink": "caret-blink 1s step-end infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
