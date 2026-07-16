import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  server: {
    proxy: {
      // 127.0.0.1, not localhost: Windows resolves localhost to ::1 while Bun listens on IPv4
      "/ws": { target: "ws://127.0.0.1:3000", ws: true },
      "/healthz": "http://127.0.0.1:3000",
    },
  },
});
