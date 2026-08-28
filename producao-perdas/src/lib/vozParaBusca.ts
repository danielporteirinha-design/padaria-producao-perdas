/**
 * src/lib/vozParaBusca.ts
 * ---------------------------------------------------------------
 * Ditar o nome do produto em vez de digitar (ago/2026).
 *
 * POR QUE ISTO IMPORTA NESTA PADARIA
 * -----------------------------------
 * Quem usa a busca está com a mão suja de farinha, com a bandeja na
 * outra mão, ou com o celular apoiado no balcão. Digitar "BISCOITO DE
 * QUEIJO ASSADO NA HORA" no teclado do celular nessas condições é o
 * caminho mais lento que existe. Falar é um toque e três segundos.
 *
 * DOIS PASSOS, E O SEGUNDO É OPCIONAL
 * ------------------------------------
 * 1. O navegador transcreve o que foi dito (Web Speech API).
 * 2. O Gemini traduz a transcrição no nome real do catálogo — ver
 *    api/interpretar-busca.ts.
 *
 * O passo 2 pode falhar inteiro sem consequência: nesse caso a busca
 * recebe a transcrição crua, que é o que aconteceria se ele não
 * existisse. `contemBusca` já ignora acento e caixa, então "pao frances"
 * acha "PÃO FRANCÊS" sozinho. O Gemini entra para os casos que o texto
 * não resolve — fala coloquial e nome parcial.
 *
 * ONDE FUNCIONA
 * -------------
 * A Web Speech API existe no Chrome (Android e computador) e no Safari
 * recente. Onde não existe, `vozDisponivel()` devolve false e o botão do
 * microfone nem aparece — melhor não oferecer que oferecer e falhar.
 * O reconhecimento também exige permissão de microfone e internet.
 */

interface ResultadoFala {
  isFinal: boolean;
  0: { transcript: string };
}

interface EventoFala extends Event {
  results: { length: number; [i: number]: ResultadoFala };
}

interface Reconhecedor extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((evento: EventoFala) => void) | null;
  onerror: ((evento: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type ConstrutorReconhecedor = new () => Reconhecedor;

function construtor(): ConstrutorReconhecedor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorReconhecedor;
    webkitSpeechRecognition?: ConstrutorReconhecedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Este navegador transcreve fala? */
export function vozDisponivel(): boolean {
  return construtor() !== undefined;
}

export class ErroDeVoz extends Error {}

/**
 * Traduz o código de erro da API em uma frase que diz o que fazer. O
 * código cru ("not-allowed") não ajuda quem está com a mão na massa.
 */
function explicar(codigo: string | undefined): string {
  switch (codigo) {
    case "not-allowed":
    case "service-not-allowed":
      return "O microfone está bloqueado para este app. Libere nas permissões do navegador.";
    case "no-speech":
      return "Não ouvi nada. Toque no microfone e fale o nome do produto.";
    case "audio-capture":
      return "Nenhum microfone encontrado neste aparelho.";
    case "network":
      return "O reconhecimento de voz precisa de internet e ela falhou agora.";
    case "aborted":
      return "";
    default:
      return "Não consegui entender o áudio. Tente de novo ou digite o nome.";
  }
}

/**
 * Ouve uma frase e devolve a transcrição.
 *
 * Devolve string vazia quando a pessoa cancelou — cancelar não é erro e
 * não deve produzir mensagem na tela.
 */
export function ouvirUmaFrase(): { promessa: Promise<string>; cancelar: () => void } {
  const Construtor = construtor();
  if (!Construtor) {
    return {
      promessa: Promise.reject(new ErroDeVoz("Este navegador não reconhece voz.")),
      cancelar: () => {},
    };
  }

  const reconhecedor = new Construtor();
  reconhecedor.lang = "pt-BR";
  // Uma frase só: o operador fala o nome do produto e para. `continuous`
  // deixaria o microfone aberto esperando mais, e no balcão isso captura
  // a conversa do cliente.
  reconhecedor.continuous = false;
  reconhecedor.interimResults = false;
  reconhecedor.maxAlternatives = 1;

  let resolvido = false;

  const promessa = new Promise<string>((resolve, reject) => {
    reconhecedor.onresult = (evento) => {
      const texto = evento.results?.[0]?.[0]?.transcript ?? "";
      resolvido = true;
      resolve(texto.trim());
    };
    reconhecedor.onerror = (evento) => {
      if (resolvido) return;
      resolvido = true;
      const mensagem = explicar(evento.error);
      // Cancelamento devolve vazio em vez de erro: quem desistiu não
      // precisa ler nada.
      if (mensagem === "") resolve("");
      else reject(new ErroDeVoz(mensagem));
    };
    reconhecedor.onend = () => {
      // Fim sem resultado e sem erro acontece quando o silêncio estoura o
      // tempo. Devolver vazio deixa a tela como estava.
      if (!resolvido) {
        resolvido = true;
        resolve("");
      }
    };
  });

  try {
    reconhecedor.start();
  } catch (erro) {
    return {
      promessa: Promise.reject(new ErroDeVoz("Não foi possível ligar o microfone.")),
      cancelar: () => {},
    };
  }

  return { promessa, cancelar: () => reconhecedor.abort() };
}

/**
 * Pede ao servidor que case a transcrição com um nome do catálogo.
 *
 * Nunca lança: qualquer falha vira string vazia, e quem chama usa a
 * transcrição crua. O recurso é conveniência sobre a busca, não a busca.
 */
export async function afinarComIA(falado: string, nomes: string[]): Promise<string> {
  try {
    const resposta = await fetch("/api/interpretar-busca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ falado, nomes }),
    });
    if (!resposta.ok) return "";
    const dados = await resposta.json();
    return typeof dados?.termo === "string" ? dados.termo : "";
  } catch {
    return "";
  }
}
