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
import type { EstadoTrabalhoImpressao, TrabalhoImpressao } from "../types/impressao";
import type { FornadaPronta } from "../types/fornada";
import type { AnuncioEncerrado } from "../types/anuncio";

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

  /**
   * Acompanha os trabalhos enviados até o agente do caixa dar o desfecho.
   *
   * Existe porque quem apertava "Imprimir no caixa" não recebia NADA em
   * seguida (ago/2026): nem "saiu", nem "o programa do caixa está
   * fechado". No primeiro dia de uso a fila ficou parada horas, e a
   * descoberta veio de abrir o log do PC — coisa que o padeiro não vai
   * fazer. Recurso em que não se confia não é usado.
   *
   * Devolve a função que desliga a escuta.
   */
  observarImpressao(
    ids: string[],
    aoMudar: (estados: EstadoTrabalhoImpressao[]) => void
  ): () => void;

  /** Fornadas prontas do dia — marcadas pela matriz ao longo do expediente. */
  listarFornadas(data: string): Promise<FornadaPronta[]>;
  /**
   * Fornadas de um intervalo, para as análises.
   *
   * Separado de `listarFornadas` de propósito: o dia a dia carrega SÓ o
   * dia corrente (fornadas acumulam rápido e a tela do forno só olha
   * hoje). O período só é buscado quando alguém abre Análises — quem
   * consulta relatório aceita esperar; quem está marcando fornada às 5h
   * da manhã, não.
   */
  listarFornadasNoPeriodo(dataInicio: string, dataFim: string): Promise<FornadaPronta[]>;
  /** Mesma ideia de observarPedidos, para as fornadas do dia. */
  observarFornadas(data: string, aoMudar: (fornadas: FornadaPronta[]) => void): () => void;
  marcarFornada(fornada: FornadaPronta): Promise<void>;
  /** Desfaz uma marcação feita por engano. */
  desmarcarFornada(fornadaId: string): Promise<void>;

  /**
   * Anúncios que a matriz encerrou hoje — ver src/types/anuncio.ts.
   *
   * Mora na nuvem porque é DISPONIBILIDADE: a matriz retira o produto da
   * vitrine do dia e as três lojas precisam parar de oferecer. A lista de
   * avisos que cada filial esconde da própria tela continua local.
   */
  listarAnunciosEncerrados(data: string): Promise<AnuncioEncerrado[]>;
  observarAnunciosEncerrados(
    data: string,
    aoMudar: (anuncios: AnuncioEncerrado[]) => void
  ): () => void;
  encerrarAnuncio(anuncio: AnuncioEncerrado): Promise<void>;
  /** Devolve o produto à vitrine — apagar o encerramento é reabrir. */
  reabrirAnuncio(anuncioId: string): Promise<void>;
}
