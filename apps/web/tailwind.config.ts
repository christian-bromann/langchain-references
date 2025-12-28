import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", "[data-theme='dark']"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // LangChain brand colors from Mintlify docs.json
        primary: {
          DEFAULT: "#2F6868",
          light: "#84C4C0",
          dark: "#1C3C3C",
        },
        accent: {
          gold: "#D4A574",
        },
        background: {
          DEFAULT: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          code: "var(--bg-code)",
        },
        foreground: {
          DEFAULT: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        border: {
          DEFAULT: "var(--border-light)",
          medium: "var(--border-medium)",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      spacing: {
        sidebar: "18rem", // 288px - matches Mintlify
        toc: "240px",
        header: "64px",
      },
      maxWidth: {
        content: "768px",
      },
    },
  },
};

export default config;
