/// <reference types="vite/client" />

/**
 * Carimbo de versão injetado no build (ver `define` em vite.config.ts).
 * Formato: "26/08 03:40" localmente, ou "26/08 03:40 · a1b2c3d" no Vercel,
 * onde o hash do commit está disponível.
 */
declare const __VERSAO_APP__: string;
