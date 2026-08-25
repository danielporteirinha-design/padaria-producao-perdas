/**
 * src/data/repositorioLocalStorage.ts
 * ---------------------------------------------------------------
 * Implementação MVP do Repositorio usando localStorage. Suficiente para
 * validar o fluxo completo das telas num único dispositivo, sem depender
 * de nenhuma conta de serviço externa. NÃO é multiusuário/multi-dispositivo
 * — ver src/data/repositorioFirestore.ts para o caminho de produção.
 */

import { normalizarQuantidadePerda } from "../lib/conversao";
import { gerarId } from "../lib/id";
import type { NovoProdutoInput, Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { LancamentoPerdaInput, RegistroPerda } from "../types/perda";
import produtosSeed from "../../data/produtos.seed.json";
import type { Repositorio } from "./repositorio";

const CHAVE_PRODUTOS = "padaria:produtos";
const CHAVE_PLANOS = "padaria:planos";
const CHAVE_PERDAS = "padaria:perdas";

function ler<T>(chave: string, valorInicial: T): T {
  const bruto = localStorage.getItem(chave);
  if (!bruto) return valorInicial;
  try {
    return JSON.parse(bruto) as T;
  } catch {
    console.warn(`Não foi possível ler "${chave}" do localStorage — usando valor inicial.`);
    return valorInicial;
  }
}

function escrever<T>(chave: string, valor: T): void {
  localStorage.setItem(chave, JSON.stringify(valor));
}

export class RepositorioLocalStorage implements Repositorio {
  async listarProdutos(): Promise<Produto[]> {
    return ler<Produto[]>(CHAVE_PRODUTOS, produtosSeed as Produto[]);
  }

  async salvarNovoProduto(input: NovoProdutoInput): Promise<Produto> {
    const produtos = await this.listarProdutos();
    const proximoCodigo = produtos.reduce((max, p) => Math.max(max, p.codigoPdv), 0) + 1;
    const novo: Produto = {
      codigoPdv: proximoCodigo,
      nome: input.nome,
      categoria: input.categoria || "SEM_CATEGORIA",
      unidadeProducao: input.unidadeProducao,
      precoCusto: input.precoCusto,
      precoVenda: input.precoVenda,
      statusVenda: "Ativo",
      ativoNaProducao: input.ativoNaProducao,
      pesoMedioUnitarioGramas: input.pesoMedioUnitarioGramas,
    };
    escrever(CHAVE_PRODUTOS, [...produtos, novo]);
    return novo;
  }

  async atualizarProduto(produto: Produto): Promise<Produto> {
    const produtos = await this.listarProdutos();
    const atualizados = produtos.map((p) => (p.codigoPdv === produto.codigoPdv ? produto : p));
    escrever(CHAVE_PRODUTOS, atualizados);
    return produto;
  }

  async listarPlanos(): Promise<PlanoDeProducaoDiario[]> {
    return ler<PlanoDeProducaoDiario[]>(CHAVE_PLANOS, []);
  }

  async buscarPlanoPorData(dataIso: string): Promise<PlanoDeProducaoDiario | undefined> {
    const planos = await this.listarPlanos();
    return planos.find((p) => p.data === dataIso);
  }

  async salvarPlano(plano: PlanoDeProducaoDiario): Promise<PlanoDeProducaoDiario> {
    const planos = await this.listarPlanos();
    const semEsse = planos.filter((p) => p.id !== plano.id);
    escrever(CHAVE_PLANOS, [...semEsse, plano]);
    return plano;
  }

  async listarPerdas(): Promise<RegistroPerda[]> {
    return ler<RegistroPerda[]>(CHAVE_PERDAS, []);
  }

  async registrarPerda(
    input: LancamentoPerdaInput & {
      quantidadeNormalizada: number;
      unidadeNormalizada: string;
      fatorConversaoAplicado: boolean;
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
      entradaBruta: { valor: input.valor, unidade: input.unidade },
      quantidadeNormalizada: input.quantidadeNormalizada,
      unidadeNormalizada: input.unidadeNormalizada as RegistroPerda["unidadeNormalizada"],
      fatorConversaoAplicado: input.fatorConversaoAplicado,
      motivo: input.motivo,
      observacao: input.observacao,
      registradoPor: input.registradoPor,
      registradoEm: new Date().toISOString(),
    };
    const perdas = await this.listarPerdas();
    escrever(CHAVE_PERDAS, [...perdas, registro]);
    return registro;
  }
}

// Reexportado para as telas poderem pré-visualizar a conversão sem duplicar import.
export { normalizarQuantidadePerda };
