import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f5ff",
          100: "#dbe6ff",
          500: "#3457d5",
          600: "#2a46b0",
          700: "#21378a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
