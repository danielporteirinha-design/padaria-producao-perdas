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
 * Daí o som ser gerado aqui, com WebAudio: duas notas curtas, sem
 * arquivo de áudio para baixar (o app abre em conexão ruim) e sem
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
 * Duas notas curtas, subindo. Sobe de propósito: som descendente é lido
 * como erro, e isto aqui é chamado tanto para "saiu do forno" quanto
 * para "a filial pediu" — nenhum dos dois é problema.
 */
export function tocarAvisoSonoro(): void {
  try {
    prepararSom();
    if (!contexto || contexto.state !== "running") return;

    const inicio = contexto.currentTime;
    for (const [atraso, frequencia] of [
      [0, 880],
      [0.16, 1174.66],
    ] as const) {
      const oscilador = contexto.createOscillator();
      const volume = contexto.createGain();
      oscilador.type = "sine";
      oscilador.frequency.value = frequencia;

      // Envelope curto: sem a rampa, ligar e desligar o oscilador produz
      // um estalo alto — pior que não ter som nenhum num ambiente que já
      // é barulhento.
      const t = inicio + atraso;
      volume.gain.setValueAtTime(0.0001, t);
      volume.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

      oscilador.connect(volume).connect(contexto.destination);
      oscilador.start(t);
      oscilador.stop(t + 0.16);
    }
  } catch (erro) {
    console.warn("Não foi possível tocar o aviso sonoro:", erro);
  }
}
