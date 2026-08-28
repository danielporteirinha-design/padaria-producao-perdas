/**
 * src/lib/producaoDeHoje.ts
 * ---------------------------------------------------------------
 * Entrada de item na produção do dia a partir de uma reposição
 * confirmada (ago/2026).
 *
 * O CASO QUE ISTO RESOLVE
 * ------------------------
 * A filial pede reposição de um produto que NÃO estava no cronograma —
 * porque a matriz assou um item fora da lista, anunciou pela busca da
 * aba Nova Fornada, e a filial se interessou. A matriz confirma o
 * pedido, produz e entrega.
 *
 * Sem isto, esse produto some da contabilidade do dia: ele foi produzido
 * e entregue, mas o plano de hoje não o conhece. E o plano de hoje é
 * justamente o DENOMINADOR da taxa de perda (ver producaoRealizada.ts).
 * Uma perda lançada amanhã sobre um item que "nunca foi produzido"
 * apareceria como perda sem produção — número que não fecha, e que
 * ninguém consegue explicar depois.
 *
 * DUAS REGRAS QUE VALEM A PENA FIXAR
 * -----------------------------------
 * 1. Só entra o que AINDA NÃO ESTÁ na lista. Se o item já foi planejado,
 *    a quantidade planejada fica intacta — a reposição é atendida com o
 *    que já foi produzido, e somar as duas inflaria a produção do dia
 *    com mercadoria que não existiu.
 * 2. O plano NÃO é reescrito em mais nada. A sessão da categoria recebe
 *    o item novo e pronto: status, autoria, horário de confirmação e o
 *    registro de `producaoRealizada` continuam como estavam. Item novo
 *    não citado em `codigosNaoProduzidos` conta como produzido, que é
 *    exatamente o que aconteceu.
 *
 * Módulo puro (sem I/O) — ver scripts/verificar_logica.ts.
 */

import type { ItemPlanoProducao, PlanoDeProducaoDiario, SessaoProducao } from "../types/producao";

/** O plano já conhece este produto? Vale para qualquer sessão. */
export function planoContemItem(plano: PlanoDeProducaoDiario, codigoPdv: number): boolean {
  return plano.sessoes.some((sessao) => sessao.itens.some((item) => item.codigoPdv === codigoPdv));
}

/**
 * Devolve o plano com o item incluído na sessão da categoria dele, ou
 * `null` quando não há nada a fazer — o item já estava lá, ou a
 * quantidade não é positiva.
 *
 * `novoId` é injetado em vez de importado para o módulo continuar puro:
 * uma sessão criada aqui precisa de id, e gerar id dentro tornaria a
 * função impossível de verificar com resultado previsível.
 */
export function incluirItemProduzido(
  plano: PlanoDeProducaoDiario,
  item: ItemPlanoProducao,
  categoria: string,
  novoId: () => string
): PlanoDeProducaoDiario | null {
  if (item.quantidadeUnidades <= 0) return null;
  if (planoContemItem(plano, item.codigoPdv)) return null;

  const existente = plano.sessoes.find((sessao) => sessao.categoria === categoria);
  const sessoes: SessaoProducao[] = existente
    ? plano.sessoes.map((sessao) =>
        sessao.categoria === categoria ? { ...sessao, itens: [...sessao.itens, item] } : sessao
      )
    : [...plano.sessoes, { id: novoId(), categoria, itens: [item] }];

  return { ...plano, sessoes };
}

/**
 * Plano novo para HOJE, contendo só este item.
 *
 * Existe para o dia em que a matriz assa e entrega sem ter montado
 * cronograma nenhum — acontece em feriado e em dia de movimento
 * imprevisto. Nasce `confirmado` porque não é intenção: o produto já
 * saiu do forno e já foi pedido. Deixá-lo como rascunho o excluiria das
 * análises (elas só contam plano confirmado), que é o mesmo buraco que
 * este módulo existe para tapar.
 */
export function planoDeHojeCom(
  data: string,
  diaDaSemana: PlanoDeProducaoDiario["diaDaSemana"],
  item: ItemPlanoProducao,
  categoria: string,
  operador: string,
  agora: string,
  novoId: () => string
): PlanoDeProducaoDiario {
  return {
    id: novoId(),
    data,
    diaDaSemana,
    sessoes: [{ id: novoId(), categoria, itens: [item] }],
    status: "confirmado",
    criadoPor: operador,
    criadoEm: agora,
    confirmadoEm: agora,
  };
}
