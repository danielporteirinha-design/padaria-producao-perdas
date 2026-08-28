/**
 * src/lib/producaoRealizada.ts
 * ---------------------------------------------------------------
 * Separa o que foi PLANEJADO do que foi REALMENTE PRODUZIDO.
 *
 * Gargalo levantado pela padaria (ago/2026): na rotina diária acontece de
 * um ou outro item da lista simplesmente não sair. Até então o app tratava
 * plano como realidade, e isso contamina justamente a métrica que o app
 * existe para medir:
 *
 * - taxa de perda = perdido ÷ produzido. Se o denominador é o planejado e
 *   nada foi produzido, a porcentagem não significa nada.
 * - a distribuição para as filiais promete uma quantidade que não existe.
 * - a sugestão por IA aprende com produção que nunca aconteceu.
 *
 * O plano NUNCA é reescrito — ele continua registrando a intenção. O que
 * aconteceu de fato entra à parte, em `PlanoDeProducaoDiario.producaoRealizada`,
 * para dar para comparar planejado × realizado depois.
 *
 * Decisão do dono do negócio sobre o formato: quando um item não é
 * produzido, "simplesmente não sai, e pronto" — não sai em quantidade
 * menor. Por isso a confirmação é binária (lista de códigos que não
 * saíram) em vez de uma quantidade real por item. Se um dia passar a
 * acontecer produção parcial, é aqui que o modelo muda.
 *
 * Módulo puro (sem I/O), testável isoladamente — ver scripts/verificar_logica.ts.
 */

import type { ItemPlanoProducao, PlanoDeProducaoDiario } from "../types/producao";

/**
 * Um item planejado conta como produzido a menos que a confirmação do dia
 * diga o contrário. Plano ainda não confirmado (`producaoRealizada`
 * ausente) conta tudo como produzido — é o palpite menos errado enquanto
 * ninguém informou nada, e o mesmo comportamento que o app tinha antes.
 */
export function naoFoiProduzido(plano: PlanoDeProducaoDiario, codigoPdv: number): boolean {
  return plano.producaoRealizada?.codigosNaoProduzidos.includes(codigoPdv) ?? false;
}

/** True quando alguém já confirmou o que saiu do forno neste plano. */
export function producaoFoiConfirmada(plano: PlanoDeProducaoDiario): boolean {
  return plano.producaoRealizada !== undefined;
}

/**
 * Itens do plano que efetivamente saíram, achatados (sem separação por
 * sessão). É a base de todo cálculo de "quanto foi produzido".
 */
export function itensProduzidos(plano: PlanoDeProducaoDiario): ItemPlanoProducao[] {
  const produzidos: ItemPlanoProducao[] = [];
  for (const sessao of plano.sessoes) {
    for (const item of sessao.itens) {
      if (naoFoiProduzido(plano, item.codigoPdv)) continue;
      produzidos.push(item);
    }
  }
  return produzidos;
}

/** Todos os itens planejados, achatados — inclusive os que não saíram. */
export function itensPlanejados(plano: PlanoDeProducaoDiario): ItemPlanoProducao[] {
  return plano.sessoes.flatMap((s) => s.itens);
}

/** Total de unidades que saíram de fato neste plano. */
export function unidadesProduzidas(plano: PlanoDeProducaoDiario): number {
  return itensProduzidos(plano).reduce((soma, i) => soma + i.quantidadeUnidades, 0);
}
