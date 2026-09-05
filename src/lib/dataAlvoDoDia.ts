/**
 * src/lib/dataAlvoDoDia.ts
 * ---------------------------------------------------------------
 * Para onde a data-alvo vai quando o dia vira com o app aberto
 * (ago/2026; set/2026 — "amanhã" virou "o próximo dia útil", ver
 * src/lib/feriados.ts: a filial não abre domingo nem feriado, e a
 * matriz só fecha 1º de janeiro, então quem chama esta função já entra
 * com o dia certo calculado, em vez de "amanhã" no calendário puro).
 *
 * O CASO
 * -------
 * Cronograma e Pedido abrem no PRÓXIMO DIA ÚTIL — é a decisão
 * operacional da padaria: as duas listas são montadas no fim do
 * expediente, para a próxima abertura. Só que essa data era escolhida
 * uma vez, na montagem da tela, e nunca mais. No PC do caixa o app fica
 * aberto a noite inteira; na quinta de manhã ele ainda estava apontando
 * para a quinta, que já tinha chegado. Quem fosse montar a lista de
 * sexta editava a de quinta sem nada na tela dizer que aquilo estava
 * acontecendo.
 *
 * A REGRA, E O QUE ELA PROTEGE
 * -----------------------------
 * Avançar sozinho é conveniente e perigoso ao mesmo tempo: às 23h59
 * alguém pode estar no meio da digitação, e virar a data ali apagaria o
 * trabalho da tela. Por isso três guardas, nesta ordem:
 *
 * 1. Já está no próximo dia útil? Não faz nada.
 * 2. Tem coisa digitada e não gravada? NÃO MEXE. Trabalho na tela vale
 *    mais que data certa — o cabeçalho mostra a data, e quem está
 *    digitando está olhando para ela.
 * 3. A data-alvo ainda é FUTURA? Não mexe: quem já estava vendo uma
 *    data mais à frente não quer ser jogado de volta.
 *
 * Sobra o caso que motivou tudo: tela parada, sem nada digitado, apontando
 * para um dia que já chegou ou já passou.
 *
 * Módulo puro (sem I/O) — ver scripts/verificar_logica.ts.
 */

/**
 * Devolve a nova data-alvo, ou `null` quando nada deve mudar.
 *
 * @param dataAlvoAtual data que a tela está mostrando (ISO YYYY-MM-DD)
 * @param hoje          data de hoje, viva (ver useDiaCorrente.ts)
 * @param proximoDiaAlvo o próximo dia útil desta loja (matriz ou
 *                       filial — ver src/lib/feriados.ts), já calculado
 *                       por quem chama, para este módulo continuar puro
 *                       e sem precisar saber a regra de quem abre quando
 * @param temTrabalhoNaTela há algo digitado que ainda não foi gravado
 */
export function proximaDataAlvo(
  dataAlvoAtual: string,
  hoje: string,
  proximoDiaAlvo: string,
  temTrabalhoNaTela: boolean
): string | null {
  if (dataAlvoAtual === proximoDiaAlvo) return null;
  if (temTrabalhoNaTela) return null;
  // Comparação de string funciona para ISO YYYY-MM-DD: o formato foi
  // escolhido justamente por ordenar como texto.
  if (dataAlvoAtual > hoje) return null;
  return proximoDiaAlvo;
}
