/**
 * src/lib/importarProdutos.ts
 * ---------------------------------------------------------------
 * Mapeamento de uma linha da planilha do PDV para o modelo Produto do app.
 * Espelha exatamente scripts/importar_produtos.py — qualquer mudança de
 * regra deve ser replicada nos dois lugares (ou, melhor, extraída para um
 * schema compartilhado quando o backend for definido — ver README).
 *
 * Uso pretendido: tela "Cadastro de Produtos -> Importar Planilha", lendo
 * o arquivo no navegador com a biblioteca `xlsx` (SheetJS) e chamando
 * mapearLinhaParaProduto() linha a linha.
 */

import type { Produto, UnidadeProducao } from "../types/produto";

const CATEGORIA_PADRAO = "SEM_CATEGORIA";

/** Formato bruto de uma linha lida da planilha (colunas relevantes apenas). */
export interface LinhaPlanilhaProduto {
  categoria: unknown;
  nome: unknown;
  precoCusto: unknown;
  precoVenda: unknown;
  medida: unknown;
  statusVenda: unknown;
  codigoPdv: unknown;
}

export interface ResultadoLinha {
  ok: boolean;
  produto?: Produto;
  erro?: string;
}

function normalizarUnidade(medidaRaw: unknown, avisos: string[], nomeProduto: string): UnidadeProducao {
  const m = String(medidaRaw ?? "").trim().toLowerCase();
  if (m === "un" || m === "kg" || m === "l") return m;
  avisos.push(`"${nomeProduto}": unidade "${medidaRaw}" não reconhecida, usando "un"`);
  return "un";
}

export interface RelatorioImportacao {
  totalLinhas: number;
  importados: number;
  semCategoria: number;
  codigosPdvDuplicados: number[];
  unidadesNaoReconhecidas: string[];
  erros: string[];
}

/** Importa um lote de linhas já parseadas da planilha (agnóstico da lib de parsing usada). */
export function importarProdutos(linhas: LinhaPlanilhaProduto[]): {
  produtos: Produto[];
  relatorio: RelatorioImportacao;
} {
  const relatorio: RelatorioImportacao = {
    totalLinhas: 0,
    importados: 0,
    semCategoria: 0,
    codigosPdvDuplicados: [],
    unidadesNaoReconhecidas: [],
    erros: [],
  };

  const codigosVistos = new Set<number>();
  const produtos: Produto[] = [];

  for (const linha of linhas) {
    if (linha.nome == null || linha.codigoPdv == null) continue; // linha vazia
    relatorio.totalLinhas += 1;

    const codigoPdv = Number(linha.codigoPdv);
    if (!Number.isFinite(codigoPdv)) {
      relatorio.erros.push(`Código PDV inválido na linha do produto "${linha.nome}"`);
      continue;
    }
    if (codigosVistos.has(codigoPdv)) {
      relatorio.codigosPdvDuplicados.push(codigoPdv);
      continue;
    }
    codigosVistos.add(codigoPdv);

    const nome = String(linha.nome).trim();
    const categoriaRaw = String(linha.categoria ?? "").trim();
    const categoria = categoriaRaw && categoriaRaw !== "..." ? categoriaRaw : CATEGORIA_PADRAO;
    if (categoria === CATEGORIA_PADRAO) relatorio.semCategoria += 1;

    const unidadeProducao = normalizarUnidade(linha.medida, relatorio.unidadesNaoReconhecidas, nome);
    const statusVenda = linha.statusVenda === "Pausado" ? "Pausado" : "Ativo";

    produtos.push({
      codigoPdv,
      nome,
      categoria,
      unidadeProducao,
      precoCusto: Number(linha.precoCusto) || 0,
      precoVenda: Number(linha.precoVenda) || 0,
      statusVenda,
      ativoNaProducao: statusVenda === "Ativo",
      // Campos novos do app — nunca existem na planilha de origem, entram
      // com padrão seguro (perda por peso desabilitada) e ficam pendentes
      // de revisão manual no Cadastro de Produtos.
      permiteRegistroPerdaPorPeso: false,
      pesoMedioUnitarioGramas: undefined,
    });
    relatorio.importados += 1;
  }

  return { produtos, relatorio };
}
