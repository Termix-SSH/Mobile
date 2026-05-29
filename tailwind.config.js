/** @type {import('tailwindcss').Config} */

// Maps a CSS variable holding an "R G B" triplet to a Tailwind color that
// supports the /<alpha-value> opacity modifier (e.g. bg-accent-brand/10).
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "accent-brand": withAlpha("--accent-brand"),
        background: withAlpha("--background"),
        foreground: withAlpha("--foreground"),
        card: {
          DEFAULT: withAlpha("--card"),
          foreground: withAlpha("--card-foreground"),
        },
        popover: {
          DEFAULT: withAlpha("--popover"),
          foreground: withAlpha("--popover-foreground"),
        },
        primary: {
          DEFAULT: withAlpha("--primary"),
          foreground: withAlpha("--primary-foreground"),
        },
        secondary: {
          DEFAULT: withAlpha("--secondary"),
          foreground: withAlpha("--secondary-foreground"),
        },
        muted: {
          DEFAULT: withAlpha("--muted"),
          foreground: withAlpha("--muted-foreground"),
        },
        accent: {
          DEFAULT: withAlpha("--accent"),
          foreground: withAlpha("--accent-foreground"),
        },
        destructive: withAlpha("--destructive"),
        border: withAlpha("--border"),
        input: withAlpha("--input"),
        ring: withAlpha("--ring"),
        surface: {
          DEFAULT: withAlpha("--surface"),
          dim: withAlpha("--surface-dim"),
        },
        chart: {
          1: withAlpha("--chart-1"),
          2: withAlpha("--chart-2"),
          3: withAlpha("--chart-3"),
          4: withAlpha("--chart-4"),
          5: withAlpha("--chart-5"),
        },
        sidebar: {
          DEFAULT: withAlpha("--sidebar"),
          foreground: withAlpha("--sidebar-foreground"),
          primary: withAlpha("--sidebar-primary"),
          "primary-foreground": withAlpha("--sidebar-primary-foreground"),
          accent: withAlpha("--sidebar-accent"),
          "accent-foreground": withAlpha("--sidebar-accent-foreground"),
          border: withAlpha("--sidebar-border"),
          ring: withAlpha("--sidebar-ring"),
        },
      },
      fontFamily: {
        mono: ["JetBrainsMono", "monospace"],
        sans: ["JetBrainsMono", "monospace"],
      },
      borderRadius: {
        // Square corners everywhere — matches the web redesign.
        none: "0px",
        sm: "0px",
        DEFAULT: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        // The two intentional exceptions in the web design:
        check: "4px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};
