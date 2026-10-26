/** @type {import('tailwindcss').Config} */

// Maps a CSS variable holding an "R G B" triplet to a Tailwind color that
// supports the /<alpha-value> opacity modifier (e.g. bg-accent-brand/10).
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "accent-brand": withAlpha("--accent-brand"),
        // Text safe versions, see textTokens in src/constants/theme.ts.
        "accent-text": withAlpha("--accent-text"),
        "warning-text": withAlpha("--warning-text"),
        "destructive-text": withAlpha("--destructive-text"),
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
        warning: withAlpha("--warning"),
        "terminal-bg": withAlpha("--terminal-bg"),
        overlay: "rgb(0 0 0 / 0.5)",
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
      // Core type scale (classic-layout): 10 labels, 11 meta, 12 body,
      // 13 row titles, 14 headings, 17 screen titles.
      fontSize: {
        "2xs": ["10px", "14px"],
        meta: ["11px", "15px"],
        xs: ["12px", "16px"],
        row: ["13px", "17px"],
        sm: ["14px", "20px"],
        title: ["17px", "22px"],
      },
      // Square corners everywhere like core. Only dots, avatars and
      // spinners use rounded-full.
      borderRadius: {
        none: "0px",
        sm: "0px",
        DEFAULT: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};
