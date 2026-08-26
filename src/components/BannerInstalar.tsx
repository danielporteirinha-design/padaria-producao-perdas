/**
 * src/components/BannerInstalar.tsx
 * ---------------------------------------------------------------
 * Convite para instalar o app (atalho na tela de início do celular ou
 * na área de trabalho no PC). O manifest e o service worker estão
 * configurados em vite.config.ts — este componente é só a interface.
 *
 * Os dois caminhos de instalação são bem diferentes e por isso o
 * componente tem dois modos:
 *
 * - Chrome/Edge (Android e desktop): o navegador dispara o evento
 *   `beforeinstallprompt`. Guardamos esse evento e mostramos um botão
 *   "Instalar" que chama prompt() de verdade — instalação em 1 toque.
 *
 * - Safari no iPhone/iPad: a Apple não implementa `beforeinstallprompt`.
 *   Não existe instalação programática — o usuário PRECISA usar o menu
 *   Compartilhar do Safari. Nesse caso mostramos as instruções escritas
 *   em vez de um botão que não funcionaria.
 *
 * Se o app já está rodando instalado (display-mode: standalone), não
 * mostra nada — não faz sentido convidar a instalar de dentro do app
 * instalado.
 */

import { useEffect, useState } from "react";

/**
 * `beforeinstallprompt` não faz parte do lib.dom padrão do TypeScript
 * (é uma extensão de navegadores Chromium), então o tipo é declarado aqui.
 */
interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const CHAVE_DISPENSADO = "padaria:banner-instalar-dispensado";

function estaRodandoInstalado(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // Safari no iOS não suporta display-mode: standalone — usa esta
  // propriedade não-padrão, que só existe lá.
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function ehIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function BannerInstalar() {
  const [eventoInstalacao, setEventoInstalacao] = useState<EventoInstalacao | null>(null);
  const [dispensado, setDispensado] = useState(
    () => localStorage.getItem(CHAVE_DISPENSADO) === "1"
  );
  const [instalado, setInstalado] = useState(estaRodandoInstalado);

  useEffect(() => {
    function aoPoderInstalar(evento: Event) {
      // Sem preventDefault o Chrome mostra o próprio mini-banner dele e o
      // evento é consumido — queremos o botão dentro do app, no momento
      // em que o operador estiver olhando para ele.
      evento.preventDefault();
      setEventoInstalacao(evento as EventoInstalacao);
    }
    function aoInstalar() {
      setInstalado(true);
      setEventoInstalacao(null);
    }
    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  function dispensar() {
    setDispensado(true);
    localStorage.setItem(CHAVE_DISPENSADO, "1");
  }

  async function instalar() {
    if (!eventoInstalacao) return;
    await eventoInstalacao.prompt();
    const escolha = await eventoInstalacao.userChoice;
    // O evento só pode ser usado uma vez — depois de prompt() ele não
    // serve mais, independente da resposta.
    setEventoInstalacao(null);
    if (escolha.outcome === "accepted") setInstalado(true);
  }

  if (instalado || dispensado) return null;

  const podeInstalarDireto = eventoInstalacao !== null;
  const mostrarInstrucoesIos = !podeInstalarDireto && ehIos();
  if (!podeInstalarDireto && !mostrarInstrucoesIos) return null;

  return (
    <div className="banner-instalar">
      <div className="texto-banner-instalar">
        <strong>Deixe o app na tela de início</strong>
        {podeInstalarDireto ? (
          <span>Abre direto no ícone, sem procurar o link no navegador.</span>
        ) : (
          <span>
            No iPhone: toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima) e
            depois em <strong>Adicionar à Tela de Início</strong>.
          </span>
        )}
      </div>
      <div className="acoes-banner-instalar">
        {podeInstalarDireto && (
          <button type="button" className="primario" onClick={instalar}>
            Instalar
          </button>
        )}
        <button type="button" className="link" onClick={dispensar}>
          agora não
        </button>
      </div>
    </div>
  );
}
