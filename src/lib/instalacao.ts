/**
 * src/lib/instalacao.ts
 * ---------------------------------------------------------------
 * Captura do convite de instalação do navegador (ago/2026).
 *
 * O DEFEITO QUE ISTO CORRIGE
 * ---------------------------
 * O Chrome dispara `beforeinstallprompt` UMA VEZ, logo depois que a
 * página carrega. Quem não estiver escutando naquele instante perde o
 * evento — e ele não volta enquanto a aba não for recarregada.
 *
 * O listener morava dentro do BannerInstalar, que só era montado DEPOIS
 * do login. Na prática: o evento disparava na tela de entrada, ninguém
 * escutava, e o botão "Instalar" nunca aparecia. Quem abria o link pelo
 * navegador ficava sem caminho para instalar o aplicativo — justamente a
 * primeira coisa que alguém faz ao receber o endereço.
 *
 * Agora a escuta começa no carregamento do módulo, antes do React
 * desenhar qualquer coisa, e o evento fica guardado até alguém usá-lo.
 *
 * O QUE NÃO DÁ PARA FAZER, E POR QUÊ
 * -----------------------------------
 * Não existe instalar sem toque. `prompt()` só é aceito dentro de um
 * gesto do usuário — é uma trava dos navegadores, não uma limitação
 * deste app: sem ela, qualquer site colocaria ícone na tela de início de
 * quem passasse por ele. No Safari do iPhone nem isso existe: a Apple não
 * implementa `beforeinstallprompt`, e o único caminho é o menu
 * Compartilhar. Por isso o banner tem dois modos.
 */

/**
 * `beforeinstallprompt` não faz parte do lib.dom padrão do TypeScript
 * (é uma extensão dos navegadores Chromium), então o tipo vem daqui.
 */
export interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let guardado: EventoInstalacao | null = null;
let jaInstalado = false;
const ouvintes = new Set<() => void>();

function avisar() {
  for (const ouvinte of ouvintes) ouvinte();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (evento) => {
    // Sem preventDefault o Chrome mostra o próprio mini-banner dele e
    // consome o evento — queremos o convite dentro do app, no momento em
    // que a pessoa estiver olhando para ele.
    evento.preventDefault();
    guardado = evento as EventoInstalacao;
    avisar();
  });

  window.addEventListener("appinstalled", () => {
    jaInstalado = true;
    guardado = null;
    avisar();
  });
}

/** True quando o app está aberto instalado, e não numa aba do navegador. */
export function estaRodandoInstalado(): boolean {
  if (jaInstalado) return true;
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // O Safari no iOS não suporta display-mode: standalone — usa esta
  // propriedade não-padrão, que só existe lá.
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

/** O navegador ofereceu instalação em um toque? */
export function podeInstalarEmUmToque(): boolean {
  return guardado !== null;
}

/** Avisa quando o convite chega ou o app é instalado. Devolve o cancelador. */
export function assinarInstalacao(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
  };
}

/**
 * Abre a caixa de instalação do navegador. Precisa ser chamada de dentro
 * de um toque do usuário.
 *
 * O evento serve UMA vez: depois de `prompt()` ele não vale mais,
 * independente da resposta. Por isso é descartado aqui, e não só quando a
 * pessoa aceita.
 */
export async function instalarAgora(): Promise<"aceito" | "recusado" | "indisponivel"> {
  if (!guardado) return "indisponivel";
  const evento = guardado;
  guardado = null;
  await evento.prompt();
  const escolha = await evento.userChoice;
  if (escolha.outcome === "accepted") jaInstalado = true;
  avisar();
  return escolha.outcome === "accepted" ? "aceito" : "recusado";
}
