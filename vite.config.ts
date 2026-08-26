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

/**
 * Carimbo de versão, montado no momento do build e embutido no bundle.
 *
 * Serve a um problema concreto: o app instalado se atualiza sozinho em
 * segundo plano, então não havia como olhar a tela e saber se a versão
 * nova já entrou — nem para o operador ("já atualizou?"), nem para mim
 * quando ele relata um defeito ("qual código você está rodando?").
 *
 * A data é formatada no fuso de São Paulo de propósito: o build roda no
 * servidor do Vercel, em UTC, e um horário três horas adiantado no
 * rodapé só geraria dúvida.
 *
 * O hash curto do commit vem das variáveis que o Vercel injeta no build;
 * rodando localmente ele não existe e o carimbo fica só com a data.
 */
function carimboDeVersao(): string {
  const agora = new Date()
    .toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    // toLocaleString devolve "26/08, 00:37"; a vírgula sobra numa linha
    // que já começa com "versão de".
    .replace(",", "");
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return commit ? `${agora} · ${commit}` : agora;
}

export default defineConfig({
  define: {
    __VERSAO_APP__: JSON.stringify(carimboDeVersao()),
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Separa as bibliotecas do app em pedaços próprios.
         *
         * O motivo é o cache do service worker, não o tamanho total: o
         * Firebase sozinho responde por ~190KB (gzip) do bundle, e sem
         * essa separação QUALQUER alteração no código do app invalidaria
         * esses 190KB também — a cada `git push`, todo celular baixaria
         * o Firebase de novo. Com o pedaço separado, uma correção de
         * tela faz o aparelho baixar só a tela.
         */
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          react: ["react", "react-dom"],
        },
      },
    },
    // O pedaço do Firebase passa de 500KB antes da compressão e não há o
    // que fazer quanto a isso (a versão "lite" do Firestore não tem
    // persistência offline, que é justamente por que ele foi escolhido).
    // O aviso padrão só geraria ruído a cada build.
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-32x32.png", "apple-touch-icon.png"],
      manifest: {
        name: "Produção e Perdas — Padaria Pão de Mel",
        short_name: "Pão de Mel",
        description:
          "Cronograma de produção diária e registro de perdas da Padaria Pão de Mel.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#fffff0",
        // Cor da logomarca — vale para a tela de abertura e para a barra
        // do sistema com o app instalado. A paleta interna do app não muda.
        theme_color: "#c40027",
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
