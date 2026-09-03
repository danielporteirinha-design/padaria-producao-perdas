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
let loopToque: number | null = null; // Guarda a referência do loop contínuo

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
 * Interrompe a campainha imediatamente. Chamado quando o usuário 
 * clica para fechar o aviso na tela.
 */
export function pararAvisoSonoro(): void {
  if (loopToque !== null) {
    window.clearInterval(loopToque);
    loopToque = null;
  }
}

/**
 * Uma badalada de campainha, e não dois bipes (ago/2026, pedido do dono
 * do negócio: no PC do balcão o aviso precisa soar como campainha).
 *
 * TOCA EM LOOP ATÉ ALGUÉM ABRIR A NOTIFICAÇÃO (set/2026, de volta por
 * pedido do dono do negócio).
 *
 * Chegou a ganhar um teto de repetições, por um defeito relatado no
 * celular: sem nada que avisasse o app de que a notificação tinha sido
 * aberta, a campainha tocava para sempre em segundo plano, e a única
 * forma de calar era abrir a notificação mesmo — o que, para quem não
 * via o celular na hora, virava um alarme sem fim.
 *
 * O teto resolvia isso escondendo o problema: um aviso que para sozinho
 * em poucos segundos também deixa de cumprir o papel dele, que é
 * insistir até alguém perceber. A correção de verdade é a notificação
 * do sistema avisar o app quando é aberta — ver `notificationclick` em
 * public/firebase-messaging-sw.js, que manda `parar-aviso` para as
 * janelas abertas — e é isso, não um teto de repetições, que faz a
 * campainha parar. Fechar o aviso dentro do app (ver AvisoGlobal em
 * App.tsx) também para, para quem está com a janela em primeiro plano.
 */
export function tocarAvisoSonoro(): void {
  try {
    prepararSom();
    if (!contexto) return;

    // Se já estiver tocando, cancela o anterior para não encavalar
    pararAvisoSonoro();

    const iniciarToqueContinuo = () => {
      if (!contexto || contexto.state !== "running") return;
      
      // Toca a primeira vez imediatamente
      badaladas(contexto);
      
      // A cada 3 segundos (tempo suficiente para o som decair), sem
      // teto — só para com `pararAvisoSonoro()` (clique na notificação,
      // ou fechar o aviso dentro do app).
      loopToque = window.setInterval(() => {
        if (contexto && contexto.state === "running") {
          badaladas(contexto);
        }
      }, 3000);
    };

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
      iniciarToqueContinuo();
      return;
    }
    void contexto.resume().then(() => {
      iniciarToqueContinuo();
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

/**
 * O SOM DE ERRO DO MICROFONE (set/2026, pedido do dono do negócio).
 *
 * Duas notas DESCENDO, curtas e graves — o oposto da campainha, que
 * sobe. A diferença tem de ser audível sem prestar atenção: quem fala
 * está de costas para a tela metade das vezes, e o som é a única
 * resposta que chega. Uma nota só seria confundida com a campainha; duas
 * descendo, não.
 *
 * Não repete e não usa o loop da campainha: é resposta a um gesto, não
 * um chamado. Some em meio segundo.
 */
export function tocarErroSonoro(): void {
  try {
    prepararSom();
    if (!contexto || contexto.state !== "running") return;

    const agora = contexto.currentTime;
    // 440 Hz depois 330 Hz — uma quarta abaixo, o intervalo que o ouvido
    // lê como "não" sem precisar de aprendizado.
    for (const [indice, frequencia] of [440, 330].entries()) {
      const inicio = agora + indice * 0.14;
      const oscilador = contexto.createOscillator();
      const volume = contexto.createGain();
      oscilador.type = "triangle";
      oscilador.frequency.setValueAtTime(frequencia, inicio);
      volume.gain.setValueAtTime(0.0001, inicio);
      volume.gain.exponentialRampToValueAtTime(0.28, inicio + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.13);
      oscilador.connect(volume).connect(contexto.destination);
      oscilador.start(inicio);
      oscilador.stop(inicio + 0.15);
    }
  } catch {
    // Sem áudio disponível: a cor e o ícone do botão continuam dizendo.
  }
}
