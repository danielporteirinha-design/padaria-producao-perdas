/**
 * vite.config.ts
 * ---------------------------------------------------------------
 * Além do plugin do React, configura o app como PWA instalável
 * ("Adicionar à tela de início" no celular / "Instalar" no desktop),
 * para o operador abrir o cronograma por um ícone próprio em vez de
 * procurar o link no navegador.
 *
 * Duas decisões importantes aqui, ambas sobre NÃO servir versão velha:
 *
 * 1. registerType "autoUpdate": a cada `git push` o Vercel publica uma
 *    versão nova. Com autoUpdate o service worker baixa a nova versão em
 *    segundo plano e assume no próximo carregamento, sem o operador
 *    precisar limpar cache. Sem isso, um app instalado pode ficar preso
 *    numa versão antiga indefinidamente — o erro clássico de PWA.
 *
 * 2. As rotas /api/* ficam FORA do cache do service worker. Elas chamam
 *    o Gemini (sugestão e insights) e não podem ser respondidas por uma
 *    resposta guardada de outro dia — precisam sempre ir à rede.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-32x32.png", "apple-touch-icon.png"],
      manifest: {
        name: "Produção e Perdas — Padaria Pão de Mel",
        short_name: "Produção",
        description:
          "Cronograma de produção diária e registro de perdas da Padaria Pão de Mel.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#faf7f2",
        theme_color: "#a8642a",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,json}"],
        // Limpa caches de versões antigas do app a cada atualização.
        cleanupOutdatedCaches: true,
        // SPA de tela única: qualquer navegação cai no index.html...
        navigateFallback: "index.html",
        // ...menos /api/*, que precisa sempre ir à rede de verdade.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
