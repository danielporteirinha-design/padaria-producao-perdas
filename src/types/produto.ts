/**
 * Modelo de dados — Produto
 * ---------------------------------------------------------------
 * Reflete os campos relevantes exportados do PDV (Produtos_881.xlsx)
 * mais os campos NOVOS necessários para o app de Produção e Perdas
 * (ainda não existem na planilha de origem).
 *
 * Campos fiscais do PDV (NCM, CFOP, ICMS, PIS, COFINS etc.) foram
 * DELIBERADAMENTE OMITIDOS deste modelo — pertencem ao sistema de
 * emissão fiscal, não ao controle de produção/perdas.
 */

/** Unidade de medida em que o produto é produzido, vendido e contado. */
export type UnidadeProducao = "un" | "kg" | "l";

/** Situação comercial herdada do PDV. */
export type StatusVenda = "Ativo" | "Pausado";

export interface Produto {
  /** Chave primária — reaproveita o "Cód. PDV" da planilha (único nas 881 linhas). */
  codigoPdv: number;

  nome: string;

  /**
   * Categoria original do PDV. 629 dos 881 produtos (71%) vieram sem
   * categoria ("...") — ver relatório de importação. Use "SEM_CATEGORIA"
   * como valor padrão e trate como pendência de cadastro, não como bug.
   */
  categoria: string;

  unidadeProducao: UnidadeProducao;

  precoCusto: number;
  precoVenda: number;

  statusVenda: StatusVenda;

  /**
   * Controla se o item aparece no Cronograma de Produção.
   * Independente do statusVenda do PDV: um item pode estar "Ativo" na
   * venda mas não fazer parte da produção diária (ex.: revenda pronta),
   * ou vice-versa (item em fase de teste, ainda não liberado para venda).
   */
  ativoNaProducao: boolean;

  // ---------------------------------------------------------------------
  // REGRA DE CONVERSÃO PESO <-> UNIDADE (registro de perdas)
  // ---------------------------------------------------------------------

  /**
   * Se true, a equipe tem permissão para lançar a perda deste produto
   * pesando na balança (em kg), mesmo que unidadeProducao seja "un".
   * Se false, a perda só pode ser lançada na própria unidadeProducao.
   */
  permiteRegistroPerdaPorPeso: boolean;

  /**
   * Peso médio de 1 unidade, em GRAMAS. Obrigatório quando
   * permiteRegistroPerdaPorPeso = true e unidadeProducao = "un".
   * É a base de toda a conversão kg <-> un (ver src/lib/conversao.ts).
   *
   * Deve ser recalibrado periodicamente (pesagem de amostra); manter
   * histórico de alterações é responsabilidade do módulo de auditoria
   * (ver ProdutoPesoHistorico, roadmap Fase 2).
   */
  pesoMedioUnitarioGramas?: number | null;
}

/** Payload mínimo para o cadastro rápido de um novo produto. */
export interface NovoProdutoInput {
  nome: string;
  categoria: string;
  unidadeProducao: UnidadeProducao;
  precoCusto: number;
  precoVenda: number;
  ativoNaProducao: boolean;
  permiteRegistroPerdaPorPeso: boolean;
  pesoMedioUnitarioGramas?: number | null;
}
