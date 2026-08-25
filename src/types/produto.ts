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

/** Unidade de medida em que o produto é vendido no PDV (histórico/fiscal). */
export type UnidadeProducao = "un" | "kg" | "l";

/** Situação comercial herdada do PDV. */
export type StatusVenda = "Ativo" | "Pausado";

export interface Produto {
  /** Chave primária — reaproveita o "Cód. PDV" da planilha (único nas 881 linhas). */
  codigoPdv: number;

  nome: string;

  /**
   * Categoria original do PDV. Só as 5 categorias de produção (ver
   * src/lib/categorias.ts) aparecem nas telas de Cronograma/Perdas — as
   * demais (revenda: refrigerante, laticínio, mercearia...) ficam de
   * fora, fora do escopo deste app. 629 dos 881 produtos importados
   * vieram sem categoria ("...") — usam "SEM_CATEGORIA", pendência de
   * cadastro em Produtos > Sem categoria.
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
  // PESO MÉDIO — base da conversão unidade -> quilos em Registro de Perdas
  // ---------------------------------------------------------------------

  /**
   * Peso médio de 1 unidade, em GRAMAS. Opcional — quando ausente, a
   * tela de Perdas só aceita lançamento direto em quilos (balança); quando
   * cadastrado, também libera lançar contando unidades quebradas/sobras,
   * convertido automaticamente para quilos (unidade canônica de todas as
   * métricas de produção/perda deste app — ver src/lib/conversao.ts).
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
  pesoMedioUnitarioGramas?: number | null;
}
