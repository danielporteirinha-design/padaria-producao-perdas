/**
 * src/data/repositorio.ts
 * ---------------------------------------------------------------
 * Interface de persistência. As telas (src/components) só conhecem
 * esta interface — nunca localStorage ou Firestore diretamente. Isso
 * é o que permite trocar o backend (ver repositorioFirestore.ts) sem
 * reescrever nenhuma tela.
 */

import type { NovoProdutoInput, Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { LancamentoPerdaInput, RegistroPerda } from "../types/perda";
import type { PedidoFilial } from "../types/pedido";
import type { TrabalhoImpressao } from "../types/impressao";
import type { FornadaPronta } from "../types/fornada";

export interface Repositorio {
  listarProdutos(): Promise<Produto[]>;
  salvarNovoProduto(input: NovoProdutoInput): Promise<Produto>;
  atualizarProduto(produto: Produto): Promise<Produto>;
  /** Remove definitivamente os produtos informados do catálogo (ex.: itens fora das categorias de produção). */
  excluirProdutos(codigosPdv: number[]): Promise<void>;

  listarPlanos(): Promise<PlanoDeProducaoDiario[]>;
  buscarPlanoPorData(dataIso: string): Promise<PlanoDeProducaoDiario | undefined>;
  salvarPlano(plano: PlanoDeProducaoDiario): Promise<PlanoDeProducaoDiario>;

  listarPerdas(): Promise<RegistroPerda[]>;
  registrarPerda(
    input: LancamentoPerdaInput & {
      quantidadeUnidadesEstimada: number;
      diaDaSemana: RegistroPerda["diaDaSemana"];
      data: string;
    }
  ): Promise<RegistroPerda>;
  /** Anula um lançamento errado (só a matriz). Marca, nunca apaga. */
  cancelarPerda(perdaId: string, canceladaPor: string, motivo: string): Promise<void>;

  /**
   * Pedidos das filiais. A matriz lê os de todas as lojas; a filial só os
   * próprios (é o que as regras do Firestore permitem — passar `lojaId`
   * não é otimização, é o que faz a consulta ser aceita).
   */
  listarPedidos(lojaId?: string): Promise<PedidoFilial[]>;
  salvarPedido(pedido: PedidoFilial): Promise<PedidoFilial>;

  /**
   * Avisa sempre que os pedidos mudarem no servidor, sem precisar
   * recarregar a página. Devolve a função que desliga a escuta.
   *
   * Existe por um defeito de uso real (ago/2026): a filial pedia
   * reposição e a matriz só via ao dar F5 — num pedido que existe
   * justamente porque é urgente. Carregar uma vez na abertura tratava
   * dados que mudam durante o expediente como se fossem estáticos.
   */
  observarPedidos(lojaId: string | undefined, aoMudar: (pedidos: PedidoFilial[]) => void): () => void;

  /**
   * Enfileira imagens para a impressora térmica do caixa. Um documento
   * por imagem — ver src/types/impressao.ts.
   */
  enviarParaImpressao(trabalhos: TrabalhoImpressao[]): Promise<void>;

  /** Fornadas prontas do dia — marcadas pela matriz ao longo do expediente. */
  listarFornadas(data: string): Promise<FornadaPronta[]>;
  /** Mesma ideia de observarPedidos, para as fornadas do dia. */
  observarFornadas(data: string, aoMudar: (fornadas: FornadaPronta[]) => void): () => void;
  marcarFornada(fornada: FornadaPronta): Promise<void>;
  /** Desfaz uma marcação feita por engano. */
  desmarcarFornada(fornadaId: string): Promise<void>;
}
