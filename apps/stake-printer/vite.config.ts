import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  server: { host: "127.0.0.1", port: 8000, strictPort: true },
  preview: { host: "127.0.0.1", port: 8001, strictPort: true },
  build: { target: "es2023" },
});
