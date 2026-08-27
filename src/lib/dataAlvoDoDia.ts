/**
 * src/lib/dataAlvoDoDia.ts
 * ---------------------------------------------------------------
 * Para onde a data-alvo vai quando o dia vira com o app aberto
 * (ago/2026).
 *
 * O CASO
 * -------
 * Cronograma e Pedido abrem no DIA SEGUINTE — é a decisão operacional da
 * padaria: as duas listas são montadas no fim do expediente, para amanhã.
 * Só que essa data era escolhida uma vez, na montagem da tela, e nunca
 * mais. No PC do caixa o app fica aberto a noite inteira; na quinta de
 * manhã ele ainda estava apontando para a quinta, que já tinha chegado.
 * Quem fosse montar a lista de sexta editava a de quinta sem nada na tela
 * dizer que aquilo estava acontecendo.
 *
 * A REGRA, E O QUE ELA PROTEGE
 * -----------------------------
 * Avançar sozinho é conveniente e perigoso ao mesmo tempo: às 23h59
 * alguém pode estar no meio da digitação, e virar a data ali apagaria o
 * trabalho da tela. Por isso três guardas, nesta ordem:
 *
 * 1. Já está em amanhã? Não faz nada.
 * 2. Tem coisa digitada e não gravada? NÃO MEXE. Trabalho na tela vale
 *    mais que data certa — o cabeçalho mostra a data, e quem está
 *    digitando está olhando para ela.
 * 3. A data-alvo ainda é FUTURA? Não mexe: quem escolheu planejar a
 *    sexta na quarta não quer ser jogado de volta para quinta.
 *
 * Sobra o caso que motivou tudo: tela parada, sem nada digitado, apontando
 * para um dia que já chegou ou já passou.
 *
 * Módulo puro (sem I/O) — ver scripts/verificar_logica.ts.
 */

import { somarDias } from "./data";

/**
 * Devolve a nova data-alvo, ou `null` quando nada deve mudar.
 *
 * @param dataAlvoAtual data que a tela está mostrando (ISO YYYY-MM-DD)
 * @param hoje          data de hoje, viva (ver useDiaCorrente.ts)
 * @param temTrabalhoNaTela há algo digitado que ainda não foi gravado
 */
export function proximaDataAlvo(
  dataAlvoAtual: string,
  hoje: string,
  temTrabalhoNaTela: boolean
): string | null {
  const amanha = somarDias(hoje, 1);
  if (dataAlvoAtual === amanha) return null;
  if (temTrabalhoNaTela) return null;
  // Comparação de string funciona para ISO YYYY-MM-DD: o formato foi
  // escolhido justamente por ordenar como texto.
  if (dataAlvoAtual > hoje) return null;
  return amanha;
}
