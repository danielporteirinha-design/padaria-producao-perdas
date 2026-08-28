/**
 * Modelo de dados — Anúncio encerrado
 * ---------------------------------------------------------------
 * A matriz retira um produto da vitrine do dia (ago/2026).
 *
 * O CASO QUE ISTO RESOLVE
 * ------------------------
 * A matriz anunciava uma fornada e depois precisava desfazer o convite:
 * o produto acabou, ou o toque foi sem querer. Tirar o item da lista dela
 * resolvia metade do problema — parava de aparecer no caminho do dedo —,
 * mas a filial continuava vendo "PÃO FRANCÊS · saiu às 9h12" e pedindo em
 * cima de mercadoria que não existe mais.
 *
 * É por isso que este registro mora na NUVEM, e não no aparelho: quem
 * decide o que está disponível é a matriz, e a decisão precisa chegar às
 * três lojas. A lista de "não me mostre mais isso" da filial continua
 * sendo dela e local (ver src/lib/fornadasDispensadas.ts) — são coisas
 * diferentes: uma é disponibilidade, a outra é arrumação da própria tela.
 *
 * NÃO APAGA FORNADA NENHUMA
 * --------------------------
 * As marcações continuam gravadas, com a hora em que cada uma saiu, e
 * continuam alimentando o relatório do forno em Análises. O que este
 * documento diz é "não ofereça mais hoje", não "isto nunca aconteceu".
 * Uma padaria que apagasse o histórico para parar de vender perderia
 * justamente o dado que ela produziu de mais valioso.
 *
 * UM POR PRODUTO POR DIA. O id é derivado da data e do código, então
 * encerrar duas vezes atualiza o mesmo documento em vez de criar dois — e
 * reabrir é apagar esse documento, o que devolve o produto à vitrine.
 */

export interface AnuncioEncerrado {
  id: string;
  /** Dia a que o encerramento se aplica (ISO YYYY-MM-DD). */
  data: string;
  codigoPdv: number;
  encerradoPor: string;
  encerradoEm: string; // ISO 8601 datetime
}

/** Id previsível: encerrar de novo sobrescreve em vez de duplicar. */
export function idDoEncerramento(data: string, codigoPdv: number): string {
  return `${data}_${codigoPdv}`;
}

/** Os códigos que estão fora da vitrine hoje. */
export function codigosEncerrados(anuncios: AnuncioEncerrado[], data: string): Set<number> {
  return new Set(anuncios.filter((a) => a.data === data).map((a) => a.codigoPdv));
}
