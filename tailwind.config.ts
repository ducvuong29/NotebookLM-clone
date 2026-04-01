import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "Inter", ...defaultTheme.fontFamily.sans],
        heading: ['"Playfair Display"', "Georgia", "serif"],
        mono: ["JetBrains Mono", ...defaultTheme.fontFamily.mono],
      },
      colors: {
        /* shadcn/ui core tokens */
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

        /* InsightsLM Material semantic tokens */
        "im-primary": "var(--im-primary)",
        "im-primary-hover": "var(--im-primary-hover)",
        "im-primary-light": "var(--im-primary-light)",
        "im-surface": "var(--im-surface)",
        "im-card-hover": "var(--im-card-hover)",
        "im-text-primary": "var(--im-text-primary)",
        "im-text-secondary": "var(--im-text-secondary)",
        "im-text-muted": "var(--im-text-muted)",
        "im-success": "var(--im-success)",
        "im-warning": "var(--im-warning)",
        "im-error": "var(--im-error)",
        "im-info": "var(--im-info)",

        /* Department palette */
        "dept-1": {
          bg: "var(--dept-1-bg)",
          fg: "var(--dept-1-fg)",
        },
        "dept-2": {
          bg: "var(--dept-2-bg)",
          fg: "var(--dept-2-fg)",
        },
        "dept-3": {
          bg: "var(--dept-3-bg)",
          fg: "var(--dept-3-fg)",
        },
        "dept-4": {
          bg: "var(--dept-4-bg)",
          fg: "var(--dept-4-fg)",
        },
        "dept-5": {
          bg: "var(--dept-5-bg)",
          fg: "var(--dept-5-fg)",
        },
        "dept-6": {
          bg: "var(--dept-6-bg)",
          fg: "var(--dept-6-fg)",
        },
        "dept-7": {
          bg: "var(--dept-7-bg)",
          fg: "var(--dept-7-fg)",
        },
        "dept-8": {
          bg: "var(--dept-8-bg)",
          fg: "var(--dept-8-fg)",
        },
        "dept-9": {
          bg: "var(--dept-9-bg)",
          fg: "var(--dept-9-fg)",
        },
        "dept-10": {
          bg: "var(--dept-10-bg)",
          fg: "var(--dept-10-fg)",
        },
      },
      spacing: {
        "space-xs": "var(--space-xs)",
        "space-sm": "var(--space-sm)",
        "space-md": "var(--space-md)",
        "space-lg": "var(--space-lg)",
        "space-xl": "var(--space-xl)",
        "space-2xl": "var(--space-2xl)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "elevation-sm": "var(--shadow-sm)",
        "elevation-md": "var(--shadow-md)",
        "elevation-lg": "var(--shadow-lg)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "skeleton-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "skeleton-pulse": "skeleton-pulse 1.5s ease-in-out infinite",
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
