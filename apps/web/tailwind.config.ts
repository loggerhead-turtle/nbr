import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // National Baseball Ratings brand palette — deep navy + diamond red.
        navy: {
          50: "#eef2f9",
          100: "#d3ddef",
          600: "#1e3a8a",
          700: "#1b3478",
          800: "#162a60",
          900: "#0f1f47",
          950: "#0a1531",
        },
        diamond: {
          500: "#dc2626",
          600: "#c1121f",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,31,71,0.08), 0 8px 24px rgba(15,31,71,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
