/**
 * src/data/repositorioLocalStorage.ts
 * ---------------------------------------------------------------
 * Implementação MVP do Repositorio usando localStorage. Suficiente para
 * validar o fluxo completo das telas num único dispositivo, sem depender
 * de nenhuma conta de serviço externa. NÃO é multiusuário/multi-dispositivo
 * — ver src/data/repositorioFirestore.ts para o caminho de produção.
 */

import { calcularPerdaEmUnidades } from "../lib/conversao";
import { gerarId } from "../lib/id";
import type { NovoProdutoInput, Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { LancamentoPerdaInput, RegistroPerda } from "../types/perda";
import type { PedidoFilial } from "../types/pedido";
import type { FornadaPronta } from "../types/fornada";
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
      statusVenda: "Ativo",
      ativoNaProducao: input.ativoNaProducao,
      pesoMedioUnitarioGramas: input.pesoMedioUnitarioGramas,
      prazoValidadeDias: input.prazoValidadeDias,
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

  async excluirProdutos(codigosPdv: number[]): Promise<void> {
    const produtos = await this.listarProdutos();
    const remover = new Set(codigosPdv);
    escrever(CHAVE_PRODUTOS, produtos.filter((p) => !remover.has(p.codigoPdv)));
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
    };
    const perdas = await this.listarPerdas();
    escrever(CHAVE_PERDAS, [...perdas, registro]);
    return registro;
  }

  async listarPedidos(lojaId?: string): Promise<PedidoFilial[]> {
    const todos = ler<PedidoFilial[]>("padaria:pedidos", []);
    return lojaId ? todos.filter((p) => p.lojaId === lojaId) : todos;
  }

  async salvarPedido(pedido: PedidoFilial): Promise<PedidoFilial> {
    const todos = await this.listarPedidos();
    escrever("padaria:pedidos", [...todos.filter((p) => p.id !== pedido.id), pedido]);
    return pedido;
  }

  async listarFornadas(data: string): Promise<FornadaPronta[]> {
    return ler<FornadaPronta[]>("padaria:fornadas", []).filter((f) => f.data === data);
  }

  async marcarFornada(fornada: FornadaPronta): Promise<void> {
    const todas = ler<FornadaPronta[]>("padaria:fornadas", []);
    escrever("padaria:fornadas", [...todas.filter((f) => f.id !== fornada.id), fornada]);
  }

  async desmarcarFornada(fornadaId: string): Promise<void> {
    const todas = ler<FornadaPronta[]>("padaria:fornadas", []);
    escrever("padaria:fornadas", todas.filter((f) => f.id !== fornadaId));
  }

  async enviarParaImpressao(): Promise<void> {
    // Sem Firestore não há agente do outro lado — o caminho de impressão
    // no caixa só existe na implementação de produção.
    throw new Error("A impressão no caixa exige o backend na nuvem.");
  }

  async cancelarPerda(perdaId: string, canceladaPor: string, motivo: string): Promise<void> {
    const perdas = await this.listarPerdas();
    escrever(
      CHAVE_PERDAS,
      perdas.map((p) =>
        p.id === perdaId
          ? {
              ...p,
              cancelada: true,
              canceladaPor,
              canceladaEm: new Date().toISOString(),
              motivoCancelamento: motivo,
            }
          : p
      )
    );
  }
}

// Reexportado para as telas poderem pré-visualizar o cálculo sem duplicar import.
export { calcularPerdaEmUnidades };
