/**
 * src/lib/ordemDaReposicao.ts
 * ---------------------------------------------------------------
 * A ordem da lista de anúncios da aba Reposição (ago/2026).
 *
 * O QUE MUDOU, E POR QUÊ
 * -----------------------
 * A lista da matriz saía na ordem do cronograma — a ordem em que a
 * padaria produz. Faz sentido para quem MONTA a lista; não faz para quem
 * ANUNCIA: depois de tocar num item, ele continuava no meio da lista,
 * misturado com o que ainda não saiu, e conferir "já avisei o pão
 * francês?" exigia varrer a tela inteira.
 *
 * Do mais recente para o mais antigo (pedido do dono do negócio), o que
 * acabou de sair fica onde o olho já está — no topo — e a tela passa a
 * contar o expediente na ordem em que ele aconteceu.
 *
 * A tela da FILIAL já ordenava assim desde o começo (ver
 * PainelFornadasFilial.tsx). Duas telas que mostram os mesmos produtos em
 * ordens diferentes fazem a matriz e a filial falarem de listas que não
 * batem — "o terceiro da lista" deixa de ser a mesma coisa nas duas.
 *
 * O QUE AINDA NÃO SAIU FICA EMBAIXO, na ordem do cronograma. Não é um
 * detalhe de desempate: item sem fornada não tem hora nenhuma para
 * comparar, e jogá-lo para o fim mantém a metade de cima da tela sendo só
 * o que já aconteceu. A ordem de produção continua valendo entre eles,
 * que é a ordem em que eles tendem a sair.
 *
 * Função PURA — ver scripts/verificar_logica.ts.
 */

import type { FornadaPronta } from "../types/fornada";

/** A hora da última fornada de cada produto no dia (ISO, comparável como texto). */
export function ultimaSaidaPorProduto(
  fornadas: FornadaPronta[],
  data: string
): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const fornada of fornadas) {
    if (fornada.data !== data) continue;
    const anterior = mapa.get(fornada.codigoPdv);
    if (!anterior || fornada.marcadaEm > anterior) mapa.set(fornada.codigoPdv, fornada.marcadaEm);
  }
  return mapa;
}

/**
 * Reordena os códigos: anunciados primeiro, do mais recente para o mais
 * antigo; depois os que ainda não saíram, na ordem recebida.
 *
 * Não filtra nem acrescenta nada — entra e sai a mesma lista, só que em
 * outra ordem. Quem decide o que entra continua sendo a tela.
 */
export function ordenarPorAnuncioRecente(
  codigos: number[],
  fornadas: FornadaPronta[],
  data: string
): number[] {
  const saidas = ultimaSaidaPorProduto(fornadas, data);
  return codigos
    .map((codigo, posicao) => ({ codigo, posicao, saiuEm: saidas.get(codigo) }))
    .sort((a, b) => {
      if (a.saiuEm && b.saiuEm) {
        if (a.saiuEm === b.saiuEm) return a.posicao - b.posicao;
        return a.saiuEm > b.saiuEm ? -1 : 1;
      }
      if (a.saiuEm) return -1;
      if (b.saiuEm) return 1;
      return a.posicao - b.posicao;
    })
    .map((entrada) => entrada.codigo);
}
