/**
 * src/data/repositorioFirestore.ts
 * ---------------------------------------------------------------
 * Implementação de produção do Repositorio, sobre o Cloud Firestore.
 * Substitui o RepositorioLocalStorage a partir de ago/2026, quando o app
 * passou a atender três lojas (matriz + duas filiais) — dados de
 * aparelhos diferentes precisam se encontrar em algum lugar.
 *
 * Escolhas que valem explicação:
 *
 * - **Sem `undefined` no Firestore.** O SDK recusa gravar campos com
 *   valor `undefined` (diferente de `null`). Como vários campos do
 *   modelo são opcionais (`pesoMedioUnitarioGramas`, `observacao`,
 *   `producaoRealizada`...), tudo passa por `limpar()` antes de ir para o
 *   banco. Sem isso, salvar um produto sem peso médio lança exceção em
 *   produção — e não em teste, se o teste sempre preencher tudo.
 *
 * - **Perdas carregam `lojaId`.** É o que permite saber onde a perda
 *   aconteceu (a filial descarta o que sobrou na loja dela, não na
 *   matriz). O repositório conhece a própria loja e carimba sozinho, para
 *   nenhuma tela precisar lembrar de passar isso.
 *
 * - **Catálogo e planos NÃO têm lojaId.** O catálogo é compartilhado
 *   pelas três lojas, e quem produz é só a matriz — ver src/lib/lojas.ts.
 *
 * - **Leitura completa, sem paginação.** O volume é pequeno (89 produtos,
 *   um plano por dia) e a persistência offline do Firestore já serve as
 *   leituras do cache local. Se um dia o histórico incomodar, o lugar de
 *   filtrar por data é aqui, não nas telas.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { gerarId } from "../lib/id";
import type { NovoProdutoInput, Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { LancamentoPerdaInput, RegistroPerda } from "../types/perda";
import type { Repositorio } from "./repositorio";

const COL_PRODUTOS = "produtos";
const COL_PLANOS = "planos";
const COL_PERDAS = "perdas";

/** Erro de domínio — sempre com mensagem apresentável ao operador. */
export class ErroRepositorio extends Error {}

/**
 * Remove chaves com valor `undefined` antes de gravar. O Firestore aceita
 * `null`, mas recusa `undefined` com erro em tempo de execução — e campos
 * opcionais do modelo chegam aqui como `undefined` o tempo todo.
 */
function limpar(objeto: object): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    if (valor !== undefined) saida[chave] = valor;
  }
  return saida;
}

export class RepositorioFirestore implements Repositorio {
  /** Loja desta sessão — carimbada nos registros que dependem de origem. */
  constructor(private readonly lojaId: string) {}

  // ----------------------------------------------------------- produtos

  async listarProdutos(): Promise<Produto[]> {
    const snap = await getDocs(collection(db, COL_PRODUTOS));
    return snap.docs
      .map((d) => d.data() as Produto)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async salvarNovoProduto(input: NovoProdutoInput): Promise<Produto> {
    const produtos = await this.listarProdutos();
    const proximoCodigo = produtos.reduce((max, p) => Math.max(max, p.codigoPdv), 0) + 1;
    const novo: Produto = {
      codigoPdv: proximoCodigo,
      nome: input.nome,
      categoria: input.categoria || "SEM_CATEGORIA",
      unidadeProducao: input.unidadeProducao,
      statusVenda: "Ativo",
      ativoNaProducao: input.ativoNaProducao,
      pesoMedioUnitarioGramas: input.pesoMedioUnitarioGramas,
      prazoValidadeDias: input.prazoValidadeDias,
    };
    await setDoc(doc(db, COL_PRODUTOS, String(novo.codigoPdv)), limpar(novo));
    return novo;
  }

  async atualizarProduto(produto: Produto): Promise<Produto> {
    await setDoc(doc(db, COL_PRODUTOS, String(produto.codigoPdv)), limpar(produto));
    return produto;
  }

  async excluirProdutos(codigosPdv: number[]): Promise<void> {
    // Sequencial de propósito: são dezenas de itens numa ação manual rara
    // (limpeza de escopo do catálogo), e uma falha no meio deixa um estado
    // parcial mais fácil de entender do que um lote atômico que some inteiro.
    for (const codigo of codigosPdv) {
      await deleteDoc(doc(db, COL_PRODUTOS, String(codigo)));
    }
  }

  // ------------------------------------------------------------- planos

  async listarPlanos(): Promise<PlanoDeProducaoDiario[]> {
    const snap = await getDocs(collection(db, COL_PLANOS));
    return snap.docs
      .map((d) => d.data() as PlanoDeProducaoDiario)
      .sort((a, b) => a.data.localeCompare(b.data));
  }

  async buscarPlanoPorData(dataIso: string): Promise<PlanoDeProducaoDiario | undefined> {
    const snap = await getDocs(query(collection(db, COL_PLANOS), where("data", "==", dataIso)));
    return snap.docs[0]?.data() as PlanoDeProducaoDiario | undefined;
  }

  async salvarPlano(plano: PlanoDeProducaoDiario): Promise<PlanoDeProducaoDiario> {
    await setDoc(doc(db, COL_PLANOS, plano.id), limpar(plano));
    return plano;
  }

  // ------------------------------------------------------------- perdas

  async listarPerdas(): Promise<RegistroPerda[]> {
    const snap = await getDocs(collection(db, COL_PERDAS));
    return snap.docs
      .map((d) => d.data() as RegistroPerda)
      .sort((a, b) => a.data.localeCompare(b.data));
  }

  async registrarPerda(
    input: LancamentoPerdaInput & {
      quantidadeUnidadesEstimada: number;
      diaDaSemana: RegistroPerda["diaDaSemana"];
      data: string;
    }
  ): Promise<RegistroPerda> {
    const registro: RegistroPerda = {
      id: gerarId(),
      codigoPdv: input.codigoPdv,
      planoDeProducaoId: input.planoDeProducaoId,
      data: input.data,
      diaDaSemana: input.diaDaSemana,
      quantidadeQuilos: input.quantidadeQuilos,
      pesoUnitarioGramasInformado: input.pesoUnitarioGramasInformado,
      quantidadeUnidadesEstimada: input.quantidadeUnidadesEstimada,
      motivo: input.motivo,
      observacao: input.observacao,
      registradoPor: input.registradoPor,
      registradoEm: new Date().toISOString(),
      lojaId: this.lojaId,
    };
    await setDoc(doc(db, COL_PERDAS, registro.id), limpar(registro));
    return registro;
  }

  /**
   * Anula um lançamento de perda (só a matriz — ver firestore.rules).
   * Não apaga: marca. Ver o comentário em RegistroPerda.cancelada sobre
   * por que o documento continua existindo.
   */
  async cancelarPerda(perdaId: string, canceladaPor: string, motivo: string): Promise<void> {
    await updateDoc(doc(db, COL_PERDAS, perdaId), {
      cancelada: true,
      canceladaPor,
      canceladaEm: new Date().toISOString(),
      motivoCancelamento: motivo,
    });
  }

  // ------------------------------------------------------------ migração

  /**
   * Envia para a nuvem os dados que ainda estavam só no aparelho
   * (localStorage), preservando ids para não duplicar nada se rodar duas
   * vezes. Usado uma única vez, na virada de localStorage para Firestore —
   * ver ImportarDadosLocais.tsx.
   *
   * Não apaga nada do aparelho: se algo der errado no meio, os dados
   * originais continuam onde estavam.
   */
  async importarDoDispositivo(dados: {
    produtos: Produto[];
    planos: PlanoDeProducaoDiario[];
    perdas: RegistroPerda[];
  }): Promise<{ produtos: number; planos: number; perdas: number }> {
    for (const produto of dados.produtos) {
      await setDoc(doc(db, COL_PRODUTOS, String(produto.codigoPdv)), limpar(produto));
    }
    for (const plano of dados.planos) {
      await setDoc(doc(db, COL_PLANOS, plano.id), limpar(plano));
    }
    for (const perda of dados.perdas) {
      // Perda antiga não tem lojaId — veio de quando existia uma loja só.
      await setDoc(
        doc(db, COL_PERDAS, perda.id),
        limpar({ ...perda, lojaId: perda.lojaId ?? this.lojaId })
      );
    }
    return {
      produtos: dados.produtos.length,
      planos: dados.planos.length,
      perdas: dados.perdas.length,
    };
  }

  /** True quando o catálogo na nuvem ainda está vazio (instalação nova). */
  async catalogoEstaVazio(): Promise<boolean> {
    const snap = await getDocs(collection(db, COL_PRODUTOS));
    return snap.empty;
  }

  /** Leitura pontual usada pela verificação pós-migração. */
  async contarDocumentos(colecao: "produtos" | "planos" | "perdas"): Promise<number> {
    const snap = await getDocs(collection(db, colecao));
    return snap.size;
  }
}
