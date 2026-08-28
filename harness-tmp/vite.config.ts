import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ root: __dirname, plugins: [react()],
  define: { __VERSAO_APP__: JSON.stringify("teste") }, server: { port: 5200, strictPort: true } });
