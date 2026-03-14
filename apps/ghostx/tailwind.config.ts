import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ghost: {
          purple: "#7c3aed",
          dark:   "#0a0a14",
        },
      },
    },
  },
  plugins: [],
};

export default config;
