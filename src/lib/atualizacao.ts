/**
 * src/lib/atualizacao.ts
 * ---------------------------------------------------------------
 * Aviso de versão nova do app (ago/2026).
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
 * A VERIFICAÇÃO PERIÓDICA
 * ------------------------
 * O navegador só procura service worker novo quando a página carrega. No
 * PC do caixa o app fica aberto o dia inteiro, e sem isso uma correção
 * publicada às 8h só apareceria no dia seguinte. Por isso a checagem de
 * hora em hora — barata (uma requisição condicional ao sw.js) e
 * suficiente para o ritmo de quem publica algumas vezes por dia.
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
    },
    onRegisteredSW(_url, registro) {
      if (!registro) return;
      // `update()` é o que faz o navegador ir conferir se o sw.js mudou.
      // Sem isto, um app aberto desde as 5h da manhã não descobre nada.
      setInterval(() => {
        void registro.update();
      }, INTERVALO_DE_CHECAGEM_MS);
    },
    onRegisterError(erro) {
      // Falhar aqui não pode derrubar o app: sem service worker ele
      // continua funcionando online, só perde o modo offline.
      console.warn("Service worker não registrado:", erro);
    },
  });

  return async () => {
    // `true` = ativa o service worker que está esperando e recarrega a
    // página. É o "reiniciar o aplicativo" que o operador precisaria
    // fazer na mão — e que, na mão, ninguém faz direito num PWA
    // instalado (fechar a janela não basta; o service worker antigo
    // continua no controle até todas as abas fecharem).
    await atualizar(true);
  };
}
