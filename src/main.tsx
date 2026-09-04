import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AvisoDeAtualizacao } from "./components/AvisoDeAtualizacao";
import { NovidadesDoApp } from "./components/NovidadesDoApp";
import "./index.css";

/**
 * O aviso de versão nova fica FORA do App de propósito (ago/2026): ele
 * precisa valer também na tela de login e na de carregamento. Uma versão
 * publicada não pode depender de alguém já estar logado para ser
 * anunciada — e é justamente na abertura do dia que o app costuma
 * encontrar a atualização da noite.
 *
 * É ele quem registra o service worker; ver src/lib/atualizacao.ts.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AvisoDeAtualizacao />
    <NovidadesDoApp />
    <App />
  </React.StrictMode>
);
