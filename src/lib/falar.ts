/**
 * src/lib/falar.ts
 * ---------------------------------------------------------------
 * O app falando com quem está de mãos ocupadas (ago/2026).
 *
 * POR QUE O APP PRECISA FALAR
 * ----------------------------
 * O anúncio de fornada por voz é um diálogo: o app pergunta, a pessoa
 * responde. Se as perguntas só aparecessem escritas, o padeiro teria que
 * OLHAR a tela a cada passo — e olhar a tela com as mãos na massa é
 * exatamente o custo que o modo por voz existe para eliminar. Um diálogo
 * de mãos livres com perguntas mudas é meio diálogo.
 *
 * O texto continua na tela, sempre. A fala é o canal adicional, não o
 * único: navegador sem síntese de voz, aparelho no mudo ou padaria
 * barulhenta continuam funcionando pela leitura.
 *
 * CANCELAR ANTES DE FALAR é obrigatório. A fala é enfileirada pelo
 * navegador: sem o `cancel()`, uma pergunta nova entra na fila atrás da
 * anterior e o app responde com atraso crescente — em quatro passos, já
 * está falando a pergunta errada.
 */

function sintetizador(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

export function falaDisponivel(): boolean {
  return sintetizador() !== null;
}

/**
 * Fala uma frase em português. Devolve quando a fala TERMINA — quem
 * chama precisa esperar para só então abrir o microfone, senão o
 * reconhecedor escuta a própria voz do aparelho e responde a si mesmo.
 *
 * Nunca rejeita: fala é acessório, e um erro de síntese não pode
 * interromper o anúncio.
 */
export function falar(texto: string): Promise<void> {
  return new Promise((resolve) => {
    const sintese = sintetizador();
    if (!sintese) {
      resolve();
      return;
    }
    try {
      sintese.cancel();
      const fala = new SpeechSynthesisUtterance(texto);
      fala.lang = "pt-BR";
      // Um pouco mais devagar que o padrão: a frase é curta e vai ser
      // ouvida com barulho de forno em volta.
      fala.rate = 0.98;
      let encerrado = false;
      const terminar = () => {
        if (encerrado) return;
        encerrado = true;
        resolve();
      };
      fala.onend = terminar;
      fala.onerror = terminar;
      /**
       * Rede de segurança: há navegadores em que `onend` não dispara se a
       * aba perde o foco no meio da fala. Sem isto o diálogo ficaria
       * parado para sempre esperando uma fala que já acabou.
       */
      setTimeout(terminar, 1000 + texto.length * 90);
      sintese.speak(fala);
    } catch {
      resolve();
    }
  });
}

/** Interrompe qualquer fala em andamento — usado ao sair do diálogo. */
export function calar(): void {
  try {
    sintetizador()?.cancel();
  } catch {
    /* nada a fazer */
  }
}
