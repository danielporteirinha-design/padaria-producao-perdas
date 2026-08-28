/**
 * src/lib/fornadasVistas.ts
 * ---------------------------------------------------------------
 * Quantas fornadas apareceram desde a última vez que esta pessoa abriu o
 * painel do forno (ago/2026).
 *
 * O contador ao lado do foguinho é do tipo "não lido", e não "total do
 * dia". Um número que nunca zera perde a função depois das primeiras
 * horas: às 10h da manhã ele já marca 20 e continua marcando 20 para
 * sempre, então parar de olhar para ele é a reação correta. Contando só o
 * que ainda não foi visto, um número na tela sempre significa novidade —
 * que é o contrário de ruído.
 *
 * A marca fica no APARELHO (localStorage), não na nuvem, e é isso que se
 * quer: cada celular tem seu próprio "já vi". A pessoa da filial que
 * abriu o painel no aparelho dela não deve zerar o contador do balconista
 * do outro turno, em outro celular.
 *
 * Guarda o INSTANTE da última fornada vista, não a contagem: contagem
 * quebraria se uma marcação fosse desfeita, e o instante continua
 * respondendo certo a "o que chegou depois disso?".
 */

import type { FornadaPronta } from "../types/fornada";

function chave(lojaId: string, data: string): string {
  return `padaria:fornadas-vistas:${lojaId}:${data}`;
}

export function marcarFornadasComoVistas(lojaId: string, data: string, fornadas: FornadaPronta[]): void {
  const doDia = fornadas.filter((f) => f.data === data);
  if (doDia.length === 0) return;
  const maisRecente = doDia.reduce(
    (maior, f) => (f.marcadaEm > maior ? f.marcadaEm : maior),
    ""
  );
  try {
    localStorage.setItem(chave(lojaId, data), maisRecente);
  } catch {
    // Navegador com armazenamento bloqueado: o contador passa a mostrar
    // o total do dia. Degradar é aceitável; quebrar a tela não.
  }
}

export function fornadasNaoVistas(
  lojaId: string,
  data: string,
  fornadas: FornadaPronta[]
): number {
  let marca = "";
  try {
    marca = localStorage.getItem(chave(lojaId, data)) ?? "";
  } catch {
    marca = "";
  }
  return fornadas.filter((f) => f.data === data && f.marcadaEm > marca).length;
}
