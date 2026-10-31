import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Estudio de piezas sociales: solo corre en local, no se publica en ningún lado. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1" },
  resolve: { dedupe: ["react", "react-dom"] },
});
