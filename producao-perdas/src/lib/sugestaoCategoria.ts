/**
 * src/lib/sugestaoCategoria.ts
 * ---------------------------------------------------------------
 * Assistente de categorização para os produtos importados como
 * "SEM_CATEGORIA" (629 dos 881 na planilha original).
 *
 * Decisão deliberada: SUGERIR, nunca aplicar automaticamente. Testei
 * um classificador por palavra-chave sobre o vocabulário real das 19
 * categorias existentes e o resultado é ambíguo demais para decidir
 * sozinho — palavras como "QUEIJO", "BOLO" e "MORANGO" aparecem em
 * várias categorias diferentes. Errar a categoria de um produto real
 * silenciosamente é pior do que deixá-lo pendente para revisão humana.
 */

import type { Produto } from "../types/produto";

export interface SugestaoCategoria {
  categoria: string;
  pontuacao: number; // 0-1, força da correspondência de palavras-chave
}

/** Constrói o vocabulário de palavras por categoria a partir dos produtos já categorizados. */
export function construirVocabularioPorCategoria(
  produtos: Produto[]
): Map<string, Map<string, number>> {
  const vocab = new Map<string, Map<string, number>>();
  for (const p of produtos) {
    if (p.categoria === "SEM_CATEGORIA") continue;
    const palavras = tokenizar(p.nome);
    const contagem = vocab.get(p.categoria) ?? new Map<string, number>();
    for (const palavra of palavras) {
      contagem.set(palavra, (contagem.get(palavra) ?? 0) + 1);
    }
    vocab.set(p.categoria, contagem);
  }
  return vocab;
}

/** Sugere até 3 categorias candidatas para um produto sem categoria, por sobreposição de palavras. */
export function sugerirCategorias(
  produto: Produto,
  vocabulario: Map<string, Map<string, number>>
): SugestaoCategoria[] {
  const palavrasProduto = tokenizar(produto.nome);
  if (palavrasProduto.length === 0) return [];

  const pontuacoes: SugestaoCategoria[] = [];
  for (const [categoria, contagem] of vocabulario) {
    let pontos = 0;
    for (const palavra of palavrasProduto) {
      if (contagem.has(palavra)) pontos += 1;
    }
    if (pontos > 0) {
      pontuacoes.push({ categoria, pontuacao: pontos / palavrasProduto.length });
    }
  }

  return pontuacoes.sort((a, b) => b.pontuacao - a.pontuacao).slice(0, 3);
}

function tokenizar(nome: string): string[] {
  return nome
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-ZÀ-Ú0-9]/g, ""))
    .filter((w) => w.length > 3);
}
