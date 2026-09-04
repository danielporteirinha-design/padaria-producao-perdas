/**
 * src/lib/atualizacao.ts
 * ---------------------------------------------------------------
 * Aviso de versão nova do app (ago/2026; checagem ao reabrir, set/2026).
 *
 * O QUE MUDOU E POR QUÊ
 * ----------------------
 * O app era `registerType: "autoUpdate"`: o service worker novo assumia
 * sozinho no carregamento seguinte. Nunca ficava versão velha presa —
 * mas também ninguém sabia que a versão tinha mudado. Isso produziu duas
 * conversas repetidas na padaria: "a correção já entrou aqui?" e, pior,
 * telas que mudavam de comportamento no meio do expediente sem
 * explicação.
 *
 * Agora o service worker novo BAIXA e ESPERA. Quando ele está pronto,
 * `observarAtualizacao` chama de volta, o app mostra a faixa e o
 * operador toca em "Atualizar agora" — que ativa o service worker novo e
 * recarrega a página. O reinício deixou de ser algo que a pessoa precisa
 * saber fazer: é o próprio botão.
 *
 * A VERIFICAÇÃO PERIÓDICA — E POR QUE ELA SOZINHA NÃO BASTAVA
 * ----------------------------------------------------------------
 * O navegador só procura service worker novo quando a página carrega. No
 * PC do caixa o app fica aberto o dia inteiro, e sem isso uma correção
 * publicada às 8h só apareceria no dia seguinte. Por isso a checagem de
 * hora em hora — barata (uma requisição condicional ao sw.js) e
 * suficiente para o ritmo de quem publica algumas vezes por dia.
 *
 * NO CELULAR, "hora em hora" não se cumpre: o sistema operacional pausa
 * o `setInterval` de uma aba em segundo plano assim que a tela apaga ou
 * o app vai para trás. É esse o motivo de "hoje para ter o botão de
 * atualizar disponível o usuário precisa reiniciar o app" (set/2026,
 * relatado pelo dono do negócio) — reabrir o app de um jeito comum
 * (tocar no ícone de novo, sem fechar de verdade) não disparava nenhuma
 * checagem nova, e a pessoa só via a versão nova horas depois, se a hora
 * batesse com o app aberto e em primeiro plano bem naquele minuto.
 *
 * A CORREÇÃO: checar também quando a ABA VOLTA a ficar visível
 * ----------------------------------------------------------------
 * `visibilitychange` dispara toda vez que o app volta para a frente —
 * inclusive quando ele nunca foi de fato fechado, só ficou minimizado.
 * Isso cobre exatamente o caso que faltava, sem esperar a próxima hora
 * cheia: quem abre o app de manhã já encontra a checagem rodando na
 * hora, e o aviso aparece sem precisar de reinício nenhum.
 */

import { registerSW } from "virtual:pwa-register";

/** De quanto em quanto tempo procurar versão nova com o app aberto. */
const INTERVALO_DE_CHECAGEM_MS = 60 * 60 * 1000;

export type Recarregar = () => Promise<void>;

/**
 * Registra o service worker e avisa quando houver versão nova esperando.
 *
 * Devolve a função que ATIVA a versão nova e recarrega a página — é o
 * que o botão da faixa chama. Chamá-la é seguro mesmo sem atualização
 * pendente; nesse caso ela não faz nada.
 */
export function observarAtualizacao(aoTerVersaoNova: () => void): Recarregar {
  const atualizar = registerSW({
    onNeedRefresh() {
      aoTerVersaoNova();
      armarAplicacaoSozinha();
    },
    onRegisteredSW(_url, registro) {
      if (!registro) return;
      // `update()` é o que faz o navegador ir conferir se o sw.js mudou.
      // Sem isto, um app aberto desde as 5h da manhã não descobre nada.
      setInterval(() => {
        void registro.update();
      }, INTERVALO_DE_CHECAGEM_MS);

      /**
       * A CHECAGEM QUE FALTAVA (set/2026): assim que o app volta a
       * ficar visível — reaberto, trazido de volta do fundo, tela
       * ligada de novo —, confere na hora, em vez de esperar o próximo
       * intervalo de uma hora. `document.hidden` de saída ignora o
       * evento de quando a aba SAI de vista; só importa a volta.
       */
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          void registro.update();
        }
      });
    },
    onRegisterError(erro) {
      // Falhar aqui não pode derrubar o app: sem service worker ele
      // continua funcionando online, só perde o modo offline.
      console.warn("Service worker não registrado:", erro);
    },
  });

  /**
   * APLICA SOZINHO, SÓ QUANDO NINGUÉM ESTÁ OLHANDO (set/2026, pedido do
   * dono do negócio: atualizar sem exigir o toque no botão da faixa).
   *
   * A ideia da faixa continua de pé — "não some sozinha" é sobre NÃO
   * trocar de versão embaixo dos dedos de alguém no meio de uma tela.
   * O que muda é que a pessoa não precisa mais tocar em nada: assim que
   * a aba fica em segundo plano — troca de aplicativo, tela apaga,
   * minimiza —, ninguém está olhando, e é a hora de trocar de versão.
   * O botão "Atualizar agora" continua funcionando, para quem quer
   * forçar na hora (ex.: uma correção urgente).
   *
   * O ATRASO DE 3s depois de ficar oculta evita recarregar no meio de
   * um alt-tab de um segundo: se a pessoa voltar antes disso, o
   * temporizador é cancelado e a tentativa seguinte espera a aba sair
   * de vista de novo.
   */
  function armarAplicacaoSozinha() {
    const aoMudarVisibilidade = () => {
      if (document.visibilityState !== "hidden") return;
      const temporizador = setTimeout(() => {
        void atualizar(true);
      }, 3000);
      const cancelarSeVoltou = () => {
        if (document.visibilityState !== "visible") return;
        clearTimeout(temporizador);
        document.removeEventListener("visibilitychange", cancelarSeVoltou);
      };
      document.addEventListener("visibilitychange", cancelarSeVoltou);
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
  }

  return async () => {
    // `true` = ativa o service worker que está esperando e recarrega a
    // página. É o "reiniciar o aplicativo" que o operador precisaria
    // fazer na mão — e que, na mão, ninguém faz direito num PWA
    // instalado (fechar a janela não basta; o service worker antigo
    // continua no controle até todas as abas fecharem). Também é o que
    // `armarAplicacaoSozinha` chama sozinha, sem esperar o toque.
    await atualizar(true);
  };
}
