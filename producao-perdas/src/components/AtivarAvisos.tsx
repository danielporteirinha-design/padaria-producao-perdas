/**
 * src/components/AtivarAvisos.tsx
 * ---------------------------------------------------------------
 * Liga os avisos de fornada pronta neste aparelho (ago/2026).
 *
 * O CARTÃO INTEIRO É O BOTÃO
 * ---------------------------
 * Não há um "Ativar" pequeno num canto: tocar em qualquer ponto do
 * cartão executa a ação. O alvo é o dedo de quem está com farinha na mão
 * às 6h da manhã, e um cartão que parece clicável mas só responde num
 * pedaço é a pior combinação possível.
 *
 * É um toque, e não um pedido automático ao abrir o app, por dois
 * motivos: alguns navegadores exigem gesto do usuário para conceder a
 * permissão, e pedir de saída cria o reflexo de negar sem ler.
 *
 * O QUE ACONTECE AO TOCAR — E O QUE NÃO DÁ PARA FAZER
 * ---------------------------------------------------
 * Se o aparelho ainda não decidiu, o toque abre DIRETO a caixa de
 * permissão do navegador. É o mais próximo de "ir para a tela de
 * permissão" que existe na web.
 *
 * Se o usuário já negou uma vez, acabou: o navegador não pergunta de
 * novo, e NENHUMA API da web abre a tela de configurações do sistema —
 * nem no Android, nem no iPhone, nem no desktop. Essa porta é fechada de
 * propósito pelos sistemas, para uma página não conseguir jogar o
 * usuário dentro dos ajustes do aparelho.
 *
 * Então o cartão faz o máximo que sobra: detecta o aparelho e mostra os
 * toques exatos, na ordem, com os nomes que aparecem na tela dele (ver
 * src/lib/plataforma.ts). "Libere nas configurações" é uma instrução que
 * ninguém completa; "toque e segure o ícone na tela inicial" é.
 */

import { useEffect, useState } from "react";
import type { Loja } from "../lib/lojas";
import {
  ativarAvisos,
  estadoDosAvisos,
  ErroNotificacao,
  type EstadoAviso,
} from "../lib/notificacoes";
import { comoLiberarNotificacao } from "../lib/plataforma";
import { IconeAtencao, IconeChama, IconeSeta } from "./Icones";

interface AtivarAvisosProps {
  loja: Loja;
  operador: string;
}

export function AtivarAvisos({ loja, operador }: AtivarAvisosProps) {
  const [estado, setEstado] = useState<EstadoAviso | null>(null);
  const [ativando, setAtivando] = useState(false);
  const [erro, setErro] = useState("");
  const [mostrarCaminho, setMostrarCaminho] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [dispensado, setDispensado] = useState(
    () => localStorage.getItem(`padaria:avisos-dispensados:${loja.id}`) === "1"
  );

  useEffect(() => {
    let cancelado = false;
    estadoDosAvisos().then((atual) => {
      if (!cancelado) setEstado(atual);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  async function ligar() {
    setAtivando(true);
    setErro("");
    try {
      await ativarAvisos(loja.id, operador);
      setEstado("ligado");
    } catch (e) {
      console.error("Falha ao ativar os avisos:", e);
      const novoEstado = await estadoDosAvisos();
      setEstado(novoEstado);
      // Se o motivo foi recusa, o caminho das configurações abre sozinho:
      // é exatamente o momento em que ele é útil, e cobrar mais um toque
      // aqui só adiaria a única coisa que resolve.
      if (novoEstado === "negado") setMostrarCaminho(true);
      else
        setErro(
          e instanceof ErroNotificacao
            ? e.message
            : "Não foi possível ativar os avisos neste aparelho."
        );
    } finally {
      setAtivando(false);
    }
  }

  function dispensar(evento: React.MouseEvent) {
    // Sem isto o clique subiria para o cartão e dispararia a ativação —
    // "agora não" acabaria pedindo a permissão.
    evento.stopPropagation();
    localStorage.setItem(`padaria:avisos-dispensados:${loja.id}`, "1");
    setDispensado(true);
  }

  async function copiarAtalho(evento: React.MouseEvent, endereco: string) {
    evento.stopPropagation();
    try {
      await navigator.clipboard.writeText(endereco);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não foi possível copiar. O endereço é: " + endereco);
    }
  }

  // Já ligado ou ainda checando: nada a mostrar. O aviso funcionando é
  // silencioso — só o que exige ação do operador aparece na tela.
  if (estado === null || estado === "ligado") return null;
  if (dispensado && estado !== "negado") return null;

  const caminho = comoLiberarNotificacao();

  /** Instruções passo a passo, iguais em todos os estados que precisam delas. */
  const blocoCaminho = mostrarCaminho && (
    <div className="caminho-permissao" onClick={(e) => e.stopPropagation()}>
      <strong>{caminho.titulo}</strong>
      <ol>
        {caminho.passos.map((passo, i) => (
          <li key={i}>{passo}</li>
        ))}
      </ol>
      {caminho.atalho && (
        <button
          type="button"
          className="secundario"
          onClick={(e) => copiarAtalho(e, caminho.atalho!)}
        >
          {copiado ? "copiado — cole na barra de endereço" : "copiar atalho das configurações"}
        </button>
      )}
    </div>
  );

  if (estado === "nao-configurado") {
    return (
      <div className="cartao-avisos alerta">
        <IconeAtencao tamanho={20} />
        <div className="texto-avisos">
          <strong>Avisos ainda não configurados</strong>
          <span>Falta uma chave no projeto. As fornadas continuam aparecendo ao abrir o app.</span>
        </div>
        <button type="button" className="link" onClick={dispensar}>
          ok
        </button>
      </div>
    );
  }

  /**
   * Recusado ou indisponível: aqui o toque não pede permissão nenhuma —
   * pedir seria mentir, porque o navegador não vai perguntar. O que o
   * cartão faz é abrir e fechar o passo a passo.
   */
  if (estado === "negado" || estado === "nao-suportado") {
    const bloqueado = estado === "negado";
    return (
      <div
        className="cartao-avisos alerta clicavel"
        role="button"
        tabIndex={0}
        aria-expanded={mostrarCaminho}
        onClick={() => setMostrarCaminho((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setMostrarCaminho((v) => !v);
        }}
      >
        <IconeAtencao tamanho={20} />
        <div className="texto-avisos">
          <strong>{bloqueado ? "Avisos bloqueados neste aparelho" : "Avisos indisponíveis aqui"}</strong>
          <span>
            {mostrarCaminho ? "Siga os passos abaixo." : "Toque para ver como liberar, passo a passo."}
          </span>
          {blocoCaminho}
        </div>
        <IconeSeta className={`seta-sessao ${mostrarCaminho ? "aberta" : ""}`} />
      </div>
    );
  }

  return (
    <div
      className="cartao-avisos clicavel"
      role="button"
      tabIndex={0}
      aria-label="Ativar avisos de fornada neste aparelho"
      onClick={() => !ativando && ligar()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !ativando) ligar();
      }}
    >
      <IconeChama tamanho={20} />
      <div className="texto-avisos">
        <strong>{ativando ? "Abrindo a permissão..." : "Receber aviso de fornada pronta"}</strong>
        <span>
          Toque aqui e confirme na caixa que o {loja.papel === "matriz" ? "computador" : "celular"} vai
          mostrar.
        </span>
        {erro && <span className="erro-conversao">{erro}</span>}
        {blocoCaminho}
      </div>
      <button type="button" className="link" onClick={dispensar}>
        agora não
      </button>
    </div>
  );
}
