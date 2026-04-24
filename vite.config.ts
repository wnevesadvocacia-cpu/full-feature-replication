import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  // GitHub Pages serves the app from /full-feature-replication/.
  // Vite needs this base so built asset URLs (/assets/...) resolve correctly there.
  // Other deployments (Lovable preview/published) work fine at the subpath too.
  base: process.env.GITHUB_ACTIONS ? "/full-feature-replication/" : "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
