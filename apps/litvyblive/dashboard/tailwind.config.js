/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: "#7B2FBE",
          gold:   "#FFD700",
          pink:   "#FF2D78",
          blue:   "#00D4FF",
        },
        dark: {
          bg:   "#0A0A12",
          card: "#13131E",
          border: "#1E1E2E",
        },
      },
    },
  },
  plugins: [],
};
