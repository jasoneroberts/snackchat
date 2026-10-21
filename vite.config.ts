import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin runs the Worker inside Vite's dev server, with local
// copies of D1 and KV, so `npm run dev` behaves like production.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
