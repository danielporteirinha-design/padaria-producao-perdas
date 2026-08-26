/**
 * Modelo de dados — Cronograma de Produção
 *
 * Decisão operacional (ago/2026): o cronograma de um dia é sempre
 * montado no FINAL DO EXPEDIENTE DO DIA ANTERIOR, para o dia seguinte —
 * ver dataDeAmanhaIso() em src/lib/data.ts. `PlanoDeProducaoDiario.data`
 * continua sendo "o dia em que a produção acontece" (não o dia em que
 * foi montado); é esse campo que a tela de Perdas usa no dia seguinte.
 */

export type DiaDaSemana =
  | "segunda"
  | "terca"
  | "quarta"
  | "quinta"
  | "sexta"
  | "sabado"
  | "domingo";

export type StatusPlano = "rascunho" | "confirmado";

/**
 * Um item dentro do plano de produção de uma sessão.
 * Quantidade sempre em UNIDADES — decisão operacional (ago/2026): os 89
 * produtos das 5 categorias de produção já são vendidos por unidade no
 * PDV, então planejar em unidade é o formato nativo da operação (revisado
 * da decisão anterior de planejar em quilos). O lado de Perdas continua
 * pesando na balança — ver src/lib/conversao.ts para como as duas pontas
 * se conectam (peso unitário informado no lançamento de perda).
 */
export interface ItemPlanoProducao {
  codigoPdv: number;
  quantidadeUnidades: number;
}

/**
 * Uma Sessão de Produção agrupa itens por categoria de produção (ver
 * src/lib/categorias.ts) — as 5 categorias fixas de produção.
 * Cada sessão confirmada é impressa/exportada separadamente (um papel
 * por categoria, fixado separadamente no quadro de avisos).
 */
export interface SessaoProducao {
  id: string;
  categoria: string; // chave de CategoriaProducaoInfo (CHAVE_ESPECIAL só em planos antigos)
  itens: ItemPlanoProducao[];
}

/**
 * PlanoDeProducaoDiario é o documento salvo ao final do fluxo de
 * Cronograma -> Resumo -> Confirmar. Enquanto status = "rascunho",
 * o operador ainda está na tela de Resumo e pode voltar e editar.
 */
/**
 * O que REALMENTE saiu do forno, registrado no fim do expediente (decisão
 * do dono do negócio, ago/2026 — ver src/lib/producaoRealizada.ts).
 *
 * Fica separado das sessões de propósito: o plano continua registrando a
 * INTENÇÃO, sem ser reescrito, e isto registra o RESULTADO. Assim dá para
 * comparar planejado × realizado depois, em vez de perder a informação de
 * que algo foi planejado e não saiu.
 */
export interface ConfirmacaoProducao {
  confirmadoPor: string;
  confirmadoEm: string; // ISO 8601 datetime
  /**
   * Códigos PDV que estavam na lista e NÃO saíram. Vazio significa
   * "produzi tudo conforme a lista" — que é o caso da maioria dos dias.
   */
  codigosNaoProduzidos: number[];
}

export interface PlanoDeProducaoDiario {
  id: string;
  data: string; // ISO 8601 (YYYY-MM-DD) — a data em que a produção efetivamente ocorre
  diaDaSemana: DiaDaSemana; // derivado de `data`, persistido para consultas agregadas rápidas
  sessoes: SessaoProducao[];
  status: StatusPlano;
  criadoPor: string;
  criadoEm: string; // ISO 8601 datetime
  confirmadoEm?: string;
  /** Ausente enquanto ninguém confirmou o que saiu — nesse caso tudo conta como produzido. */
  producaoRealizada?: ConfirmacaoProducao;
}
