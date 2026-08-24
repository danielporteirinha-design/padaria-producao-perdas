/**
 * Modelo de dados — Cronograma de Produção
 */

export type DiaDaSemana =
  | "segunda"
  | "terca"
  | "quarta"
  | "quinta"
  | "sexta"
  | "sabado"
  | "domingo";

/**
 * Fixa   -> rotina diária recorrente (o "padrão" daquele dia da semana).
 * Especial -> encomendas, testes de receita, eventos pontuais (Páscoa,
 *             Natal, Dia das Mães, contratos institucionais avulsos).
 * Ver [[sistema-de-gestao]]: contratos recorrentes de entrega (ex.: Dona
 * Maria, Gamma Moda Livre) alimentam Sessões Fixas por dia da semana.
 */
export type TipoSessao = "fixa" | "especial";

export type StatusPlano = "rascunho" | "confirmado";

/** Um item dentro do plano de produção de uma sessão. */
export interface ItemPlanoProducao {
  codigoPdv: number;
  quantidadePlanejada: number; // sempre em unidadeProducao do produto — apenas número, sem foto
}

/**
 * Uma Sessão de Produção é o agrupamento operacional do dia
 * (ex.: "Fornada da manhã" fixa, ou "Encomenda aniversário Fulano" especial).
 */
export interface SessaoProducao {
  id: string;
  tipo: TipoSessao;
  nome: string; // ex.: "Fornada Padrão - Quinta" | "Encomenda - Bolo Aniversário Maria"
  itens: ItemPlanoProducao[];
  observacoes?: string;
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
