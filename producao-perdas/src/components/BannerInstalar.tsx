/**
 * src/components/BannerInstalar.tsx
 * ---------------------------------------------------------------
 * Convite para instalar o app (atalho na tela de início do celular ou na
 * área de trabalho no PC). O manifest e o service worker estão em
 * vite.config.ts — este componente é só a interface.
 *
 * A CAPTURA DO EVENTO NÃO MORA MAIS AQUI (ago/2026)
 * --------------------------------------------------
 * O Chrome dispara `beforeinstallprompt` uma única vez, logo depois do
 * carregamento. Como este componente só era montado DEPOIS do login, o
 * evento passava sem ninguém escutando e o botão "Instalar" nunca
 * aparecia. A escuta foi para src/lib/instalacao.ts, que começa a
 * trabalhar no carregamento do módulo — antes de o React desenhar
 * qualquer coisa.
 *
 * DOIS MODOS, PORQUE SÃO DOIS MUNDOS
 * -----------------------------------
 * - Chrome/Edge (Android e computador): existe instalação em um toque.
 *   O botão chama a caixa do próprio navegador.
 * - Safari no iPhone/iPad: a Apple não implementa a API. Não existe
 *   instalação programática, e o caminho é o menu Compartilhar. Aqui
 *   aparecem as instruções escritas, com os nomes que estão na tela dele.
 *
 * Rodando já instalado, não mostra nada: convidar a instalar de dentro do
 * app instalado é ruído.
 */

import { useEffect, useState } from "react";
import {
  assinarInstalacao,
  estaRodandoInstalado,
  instalarAgora,
  podeInstalarEmUmToque,
} from "../lib/instalacao";
import { plataformaAtual } from "../lib/plataforma";

const CHAVE_DISPENSADO = "padaria:banner-instalar-dispensado";

interface BannerInstalarProps {
  /**
   * Primeira tela de quem chega pelo link. Aí o convite é o assunto — não
   * um lembrete no meio do trabalho —, então ele ganha destaque e não
   * oferece "agora não": quem abriu o endereço veio justamente para pôr o
   * aplicativo no aparelho.
   */
  emDestaque?: boolean;
}

export function BannerInstalar({ emDestaque = false }: BannerInstalarProps) {
  const [, forcarDesenho] = useState(0);
  const [dispensado, setDispensado] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_DISPENSADO) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => assinarInstalacao(() => forcarDesenho((n) => n + 1)), []);

  function dispensar() {
    setDispensado(true);
    try {
      localStorage.setItem(CHAVE_DISPENSADO, "1");
    } catch {
      /* armazenamento bloqueado: o banner volta na próxima abertura */
    }
  }

  if (estaRodandoInstalado()) return null;
  // Em destaque o convite ignora o "agora não": ele é a primeira tela de
  // quem acabou de receber o link, e some sozinho depois da instalação.
  if (dispensado && !emDestaque) return null;

  const umToque = podeInstalarEmUmToque();
  const ehIos = plataformaAtual() === "ios";
  // Sem convite do navegador e fora do iPhone não há o que dizer: o
  // navegador ou não suporta instalação, ou o app já está instalado.
  if (!umToque && !ehIos) return null;

  return (
    <div className={`banner-instalar ${emDestaque ? "destaque" : ""}`}>
      <div className="texto-banner-instalar">
        <strong>{emDestaque ? "Instale o aplicativo" : "Deixe o app na tela de início"}</strong>
        {umToque ? (
          <span>
            Um toque e o ícone fica no aparelho. Abre direto, em janela própria, sem procurar o
            link no navegador.
          </span>
        ) : (
          <span>
            No iPhone o atalho é criado pelo Safari: toque em <strong>Compartilhar</strong> (o
            quadrado com a seta para cima), role e escolha <strong>Adicionar à Tela de Início</strong>.
            {emDestaque && " No iPhone os avisos só funcionam com o aplicativo instalado assim."}
          </span>
        )}
      </div>
      <div className="acoes-banner-instalar">
        {umToque && (
          <button type="button" className="primario" onClick={() => void instalarAgora()}>
            Instalar
          </button>
        )}
        {!emDestaque && (
          <button type="button" className="link" onClick={dispensar}>
            agora não
          </button>
        )}
      </div>
    </div>
  );
}
