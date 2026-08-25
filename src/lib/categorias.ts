/**
 * src/lib/categorias.ts
 * ---------------------------------------------------------------
 * As únicas categorias que o app de Produção & Perdas exibe/trabalha
 * (decisão do dono do negócio — ago/2026). O catálogo importado tem 19
 * categorias originais do PDV (a maioria é revenda: refrigerante,
 * laticínio, mercearia...) — fora do escopo deste app, que é só sobre o
 * que é PRODUZIDO na padaria.
 *
 * `chave` usa exatamente a grafia already presente em Produto.categoria
 * (vinda da planilha original, maiúscula) — não precisa remapear os
 * dados existentes, só filtrar por ela. `rotulo` é o texto exibido.
 */

export interface CategoriaProducaoInfo {
  chave: string;
  rotulo: string;
}

export const CATEGORIAS_PRODUCAO: CategoriaProducaoInfo[] = [
  { chave: "PÃES E ROSCAS", rotulo: "Pães e Roscas" },
  { chave: "BISCOITOS", rotulo: "Biscoitos" },
  { chave: "BOLOS", rotulo: "Bolos" },
  { chave: "SALGADOS", rotulo: "Salgados" },
  { chave: "CONFEITARIA", rotulo: "Confeitaria" },
];

/**
 * Sessão extra (sugestão nossa, não pedida explicitamente) para cobrir o
 * caso original de "Sessões Especiais" — encomendas e testes que não
 * pertencem a nenhuma das 5 categorias fixas. Usa busca livre em todo o
 * catálogo em vez de uma lista fixa de produtos.
 */
export const CHAVE_ESPECIAL = "ENCOMENDAS_E_ESPECIAIS";
export const ROTULO_ESPECIAL = "Encomendas e Especiais";

export function rotuloDaCategoria(chave: string): string {
  if (chave === CHAVE_ESPECIAL) return ROTULO_ESPECIAL;
  return CATEGORIAS_PRODUCAO.find((c) => c.chave === chave)?.rotulo ?? chave;
}

/**
 * Prazo de validade sugerido (dias), por categoria — só um ponto de
 * partida ao cadastrar um produto novo, sempre editável por produto (ver
 * Produto.prazoValidadeDias). "Pães e Roscas" é uma categoria só para
 * produção, mas pão e rosca têm validade bem diferente — o valor abaixo
 * é o de pão (o item mais comum da categoria); ajuste manualmente para
 * 2 ao cadastrar uma rosca especificamente.
 */
export const VALIDADE_SUGERIDA_DIAS: Record<string, number> = {
  "PÃES E ROSCAS": 1,
  BISCOITOS: 15,
  BOLOS: 3,
  SALGADOS: 2,
  CONFEITARIA: 5,
};
