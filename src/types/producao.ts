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
 * Quantidade sempre em QUILOS — decisão operacional deliberada (ago/2026):
 * mesmo para os itens vendidos por unidade, a equipe planeja a produção
 * pesando a massa/porção, não contando unidades finais. Ver
 * src/lib/conversao.ts para a mesma convenção aplicada ao lado de Perdas.
 */
export interface ItemPlanoProducao {
  codigoPdv: number;
  quantidadeQuilos: number;
}

/**
 * Uma Sessão de Produção agrupa itens por categoria de produção (ver
 * src/lib/categorias.ts) — as 5 fixas mais "Encomendas e Especiais".
 * Cada sessão confirmada é impressa/exportada separadamente (um papel
 * por categoria, fixado separadamente no quadro de avisos).
 */
export interface SessaoProducao {
  id: string;
  categoria: string; // chave de CategoriaProducaoInfo, ou CHAVE_ESPECIAL
  itens: ItemPlanoProducao[];
}

/**
 * PlanoDeProducaoDiario é o documento salvo ao final do fluxo de
 * Cronograma -> Resumo -> Confirmar. Enquanto status = "rascunho",
 * o operador ainda está na tela de Resumo e pode voltar e editar.
 */
export interface PlanoDeProducaoDiario {
  id: string;
  data: string; // ISO 8601 (YYYY-MM-DD) — a data em que a produção efetivamente ocorre
  diaDaSemana: DiaDaSemana; // derivado de `data`, persistido para consultas agregadas rápidas
  sessoes: SessaoProducao[];
  status: StatusPlano;
  criadoPor: string;
  criadoEm: string; // ISO 8601 datetime
  confirmadoEm?: string;
}
