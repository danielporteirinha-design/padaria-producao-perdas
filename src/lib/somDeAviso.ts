/**
 * src/lib/somDeAviso.ts
 * ---------------------------------------------------------------
 * Som de aviso gerado pelo próprio app (ago/2026).
 *
 * POR QUE NÃO BASTA A NOTIFICAÇÃO DO SISTEMA
 * -------------------------------------------
 * A Web Notifications API NÃO deixa escolher o som — quem toca é o canal
 * padrão do sistema, e o sistema decide se toca. Com o app em primeiro
 * plano, Android e Chrome no PC frequentemente mostram o aviso em
 * silêncio: a janela está aberta, então o sistema assume que a pessoa
 * está olhando. No balcão da padaria ela não está — a janela fica atrás
 * do PDV, e um aviso mudo é um aviso que não existe.
 *
 * Daí o som ser gerado aqui, com WebAudio: uma campainha sintetizada,
 * sem arquivo de áudio para baixar (o app abre em conexão ruim) e sem
 * depender de o sistema decidir tocar alguma coisa.
 *
 * O DESBLOQUEIO
 * --------------
 * Navegador não deixa tocar áudio antes de a pessoa interagir com a
 * página. Por isso `prepararSom()` é chamada no primeiro toque/tecla —
 * ela só cria e destrava o contexto, sem emitir nada. Sem esse passo, o
 * primeiro aviso do dia sairia mudo e os seguintes não.
 */

let contexto: AudioContext | null = null;

type ConstrutorDeContexto = typeof AudioContext;

function construtor(): ConstrutorDeContexto | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: ConstrutorDeContexto }).webkitAudioContext
  );
}

/**
 * Cria e destrava o contexto de áudio. Chamar no primeiro gesto do
 * usuário — é barato e idempotente.
 */
export function prepararSom(): void {
  try {
    const Construtor = construtor();
    if (!Construtor) return;
    contexto = contexto ?? new Construtor();
    if (contexto.state === "suspended") void contexto.resume();
  } catch (erro) {
    // Som é acessório: sem ele o aviso visual continua valendo, e a
    // operação não pode parar por causa disso.
    console.warn("Áudio de aviso indisponível:", erro);
  }
}

/**
 * Uma badalada de campainha, e não dois bipes (ago/2026, pedido do dono
 * do negócio: no PC do balcão o aviso precisa soar como campainha).
 *
 * COMO UM SINO SOA, E POR QUE O BIPE NÃO SERVIA
 * ---------------------------------------------
 * Duas notas de onda senoidal eram um alarme de eletrodoméstico. O que
 * faz o ouvido reconhecer um sino são duas coisas que o bipe não tinha:
 *
 * 1. HARMÔNICOS NÃO INTEIROS. Um sino soa a nota fundamental junto de
 *    parciais que não são múltiplos exatos dela — é o que dá o brilho
 *    metálico. As razões abaixo (2,76 / 5,40 / 8,93) vêm da física de
 *    sinos reais.
 * 2. ATAQUE INSTANTÂNEO E CAUDA LONGA. O badalo bate e o metal decai por
 *    quase dois segundos. Cada parcial mais agudo decai MAIS RÁPIDO que
 *    o grave, senão o som fica estridente do começo ao fim.
 *
 */
export function tocarAvisoSonoro(): void {
  try {
    prepararSom();
    if (!contexto) return;

    /**
     * ESPERAR O CONTEXTO VOLTAR, EM VEZ DE DESISTIR (ago/2026).
     *
     * `resume()` é assíncrono. A versão anterior chamava `prepararSom()`
     * e, no mesmo instante, desistia se o estado ainda não fosse
     * "running" — e um contexto suspenso ainda não é. Resultado: a
     * primeira badalada depois de qualquer suspensão saía muda, que é
     * justamente a que importa. No PC do balcão, com a janela horas
     * atrás do PDV, era quase sempre a primeira.
     */
    if (contexto.state === "running") {
      badaladas(contexto);
      return;
    }
    void contexto.resume().then(() => {
      if (contexto && contexto.state === "running") badaladas(contexto);
    });
  } catch (erro) {
    console.warn("Não foi possível tocar o aviso sonoro:", erro);
  }
}

/** Duas badaladas com folga: uma se perde no barulho, três viram alarme. */
function badaladas(ctx: AudioContext): void {
  const agora = ctx.currentTime;
  for (const atraso of [0, 0.42]) badalada(ctx, agora + atraso);
}

/** Nota fundamental da campainha, em hertz (Ré#6 — clara sem ser aguda demais). */
const FUNDAMENTAL = 1244.5;

/**
 * As parciais de um sino: razão em relação à fundamental, peso no volume
 * e quanto tempo cada uma leva para sumir. O grave sustenta, os agudos
 * dão o brilho do ataque e saem primeiro.
 */
const PARCIAIS: { razao: number; peso: number; duracao: number }[] = [
  { razao: 0.5, peso: 0.32, duracao: 1.9 },
  { razao: 1.0, peso: 0.5, duracao: 1.5 },
  { razao: 2.76, peso: 0.22, duracao: 0.9 },
  { razao: 5.4, peso: 0.12, duracao: 0.5 },
  { razao: 8.93, peso: 0.07, duracao: 0.28 },
];

function badalada(ctx: AudioContext, quando: number): void {
  const mestre = ctx.createGain();
  // Volume total num nível de aviso, não de susto: o PC fica ao lado de
  // quem atende, e sobressalto no balcão é pior que aviso perdido.
  mestre.gain.value = 0.32;
  mestre.connect(ctx.destination);

  for (const { razao, peso, duracao } of PARCIAIS) {
    const oscilador = ctx.createOscillator();
    const volume = ctx.createGain();
    oscilador.type = "sine";
    oscilador.frequency.value = FUNDAMENTAL * razao;

    // Ataque de 4ms: rápido o bastante para soar como batida, longo o
    // bastante para não estalar. Ligar o oscilador direto no volume
    // cheio produz um clique que o alto-falante do PC exagera.
    volume.gain.setValueAtTime(0.0001, quando);
    volume.gain.exponentialRampToValueAtTime(peso, quando + 0.004);
    volume.gain.exponentialRampToValueAtTime(0.0001, quando + duracao);

    oscilador.connect(volume).connect(mestre);
    oscilador.start(quando);
    oscilador.stop(quando + duracao + 0.05);
  }
}
