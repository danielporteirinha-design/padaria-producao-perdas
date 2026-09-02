/**
 * src/lib/reposicaoDoDia.ts
 * ---------------------------------------------------------------
 * O DIA DA FILIAL NA ABA REPOSIÇÃO, em duas listas (ago/2026, decisão do
 * dono do negócio).
 *
 * AS DUAS SANFONAS TÊM AS DUAS DIREÇÕES
 * --------------------------------------
 * O que circula nesta aba não é só o que a filial pede. A matriz também
 * manda coisa para cá: o aviso de fornada é um "pedido" dela — saiu do
 * forno, quem quiser peça. As duas coisas esperam a mesma resposta ("e
 * aí, resolvido ou não?"), e por isso vivem na mesma separação:
 *
 *   SEM RESPOSTA  — de quem eu ainda estou esperando:
 *                   · o que EU pedi e a matriz não respondeu
 *                   · o que a MATRIZ anunciou e eu ainda não decidi
 *   CONCLUÍDOS    — o que já foi decidido hoje, dos dois lados
 *
 * Separadas por direção, a pessoa teria que ler as duas listas para
 * responder a pergunta que importa. Separadas por RESPOSTA, a de cima é
 * exatamente a lista de pendências do dia.
 *
 * QUANDO UM AVISO DA MATRIZ SAI DE "SEM RESPOSTA"
 * -----------------------------------------------
 * Quando a filial pede aquele produto hoje (a resposta natural ao aviso),
 * ou quando ela dispensa o aviso — que é dizer "vi e não preciso". As
 * duas são resposta; o que não pode é o aviso ficar pendente para sempre
 * e afogar o que ainda precisa de decisão.
 *
 * Módulo PURO, sem I/O — ver scripts/verificar_logica.ts.
 */

import type { FornadaPronta } from "../types/fornada";
import type { PedidoFilial } from "../types/pedido";
import { desfechoDoItem, ehReposicao, motivoDoItem } from "../types/pedido";

export type OrigemDaLinha = "filial" | "matriz";

export type SituacaoDaLinha =
  /** Esperando: a matriz não respondeu meu pedido, ou eu não respondi o aviso dela. */
  | "pendente"
  /** A matriz separou o que pedi. */
  | "confirmado"
  /** A matriz recusou o que pedi (sempre com motivo). */
  | "cancelado"
  /** Aviso da matriz que eu respondi pedindo o produto. */
  | "atendido"
  /** Aviso da matriz que eu tirei da frente sem pedir. */
  | "dispensado";

export interface LinhaDoDia {
  /** Única na lista — serve de `key` na tela. */
  chave: string;
  origem: OrigemDaLinha;
  codigoPdv: number;
  /** Unidades pedidas. Ausente no aviso de fornada, que não tem quantidade. */
  unidades?: number;
  /** Instante ISO — usado só para ordenar e mostrar a hora. */
  quando: string;
  situacao: SituacaoDaLinha;
  /** Motivo da recusa da matriz. */
  motivo?: string;
  /** Quantas fornadas do produto saíram hoje (linhas da matriz). */
  vezes?: number;
}

export interface EntradaDoDia {
  fornadas: FornadaPronta[];
  pedidos: PedidoFilial[];
  hoje: string;
  lojaId: string;
  /** Produtos que a matriz tirou da vitrine — o aviso deixa de valer. */
  encerrados: Set<number>;
  /**
   * Avisos que ESTA loja tirou da própria tela, com a hora de cada um.
   * A hora é o que permite uma fornada NOVA do mesmo produto voltar a
   * pedir decisão — ver src/lib/fornadasDispensadas.ts.
   */
  dispensadas: Map<number, string>;
}

export function montarLinhasDoDia({
  fornadas,
  pedidos,
  hoje,
  lojaId,
  encerrados,
  dispensadas,
}: EntradaDoDia): LinhaDoDia[] {
  const linhas: LinhaDoDia[] = [];
  /** Produto -> instante do pedido MAIS RECENTE que esta loja fez hoje. */
  const pedidosMeus = new Map<number, string>();

  // ---- o que a FILIAL pediu ----
  for (const pedido of pedidos) {
    if (pedido.data !== hoje || pedido.lojaId !== lojaId || !ehReposicao(pedido)) continue;
    const quando = pedido.enviadoEm ?? pedido.criadoEm ?? "";
    for (const item of pedido.itens) {
      // O DESFECHO É DO ITEM, e não do documento: um pedido com dez
      // produtos pode ter nove confirmados e um recusado.
      const desfecho = desfechoDoItem(pedido, item.codigoPdv);
      const jaPedido = pedidosMeus.get(item.codigoPdv);
      if (!jaPedido || quando > jaPedido) pedidosMeus.set(item.codigoPdv, quando);
      linhas.push({
        chave: `p-${pedido.id}-${item.codigoPdv}`,
        origem: "filial",
        codigoPdv: item.codigoPdv,
        unidades: item.quantidadeUnidades,
        quando,
        // NÃO AGRUPA POR PRODUTO: dois envios do mesmo item podem ter
        // desfechos diferentes, e somar esconderia justamente a recusa.
        situacao: desfecho === "pendente" ? "pendente" : desfecho,
        motivo:
          desfecho === "cancelado"
            ? motivoDoItem(pedido, item.codigoPdv) || "sem motivo informado"
            : undefined,
      });
    }
  }

  // ---- o que a MATRIZ anunciou ----
  const porProduto = new Map<number, FornadaPronta[]>();
  for (const fornada of fornadas) {
    if (fornada.data !== hoje) continue;
    // Encerrado pela matriz: o produto acabou, e o aviso não vale mais
    // para ninguém — some das duas listas, não vira histórico.
    if (encerrados.has(fornada.codigoPdv)) continue;
    porProduto.set(fornada.codigoPdv, [...(porProduto.get(fornada.codigoPdv) ?? []), fornada]);
  }

  for (const [codigoPdv, doDia] of porProduto) {
    const ordenadas = [...doDia].sort((a, b) => b.marcadaEm.localeCompare(a.marcadaEm));
    linhas.push({
      chave: `f-${codigoPdv}`,
      origem: "matriz",
      codigoPdv,
      quando: ordenadas[0].marcadaEm,
      vezes: ordenadas.length,
      /**
       * A DECISÃO VALE ATÉ A PRÓXIMA FORNADA (set/2026).
       *
       * Pedir ou recusar responde o anúncio que estava na tela naquele
       * momento — não o produto para sempre. Pão francês sai seis vezes
       * por dia, e cada saída é uma decisão nova: recusar a das 7h não
       * pode fazer a das 11h nascer recusada, com o aviso chegando no
       * celular e a linha já em "concluídos", sem como pedir.
       *
       * Por isso a comparação é de HORA: a resposta só vale enquanto for
       * mais recente que a última fornada.
       */
      situacao: (() => {
        const ultimaFornada = ordenadas[0].marcadaEm;
        const meuPedido = pedidosMeus.get(codigoPdv);
        if (meuPedido && meuPedido > ultimaFornada) return "atendido";
        const dispensa = dispensadas.get(codigoPdv);
        if (dispensa && dispensa > ultimaFornada) return "dispensado";
        return "pendente";
      })(),
    });
  }

  return linhas.sort((a, b) => b.quando.localeCompare(a.quando));
}

/** Ainda espera decisão — de quem quer que seja. */
export function estaPendente(linha: LinhaDoDia): boolean {
  return linha.situacao === "pendente";
}


/**
 * O MESMO DIA, VISTO DA MATRIZ (ago/2026, decisão do dono do negócio: a
 * aba dela "é para ficar no mesmo estilo da aba das filiais").
 *
 * A matriz também tem duas listas, e a pergunta é a mesma: quem ainda
 * deve resposta?
 *
 *   SEM RESPOSTA — anunciei e nenhuma loja pediu ainda
 *   CONCLUÍDOS   — alguma loja pediu, ou eu tirei o produto da vitrine
 *
 * Isto substituiu a lista pronta do cronograma e a pastilha de "mostrar
 * escondidos". A lista pronta oferecia dezenas de itens que ainda não
 * saíram do forno, e anunciar é sobre o que ACABOU de sair; a pastilha
 * escondia o que já tinha sido tirado atrás de um ícone que ninguém
 * associava a "ver de novo". Nas duas sanfonas, cada estado tem lugar
 * próprio e nome escrito.
 */
export interface LinhaDaMatriz {
  chave: string;
  /**
   * De onde veio a linha (set/2026).
   *
   * "anuncio"     — fornada que a MATRIZ anunciou; espera as lojas pedirem
   * "pedido"      — reposição que uma FILIAL pediu; espera a matriz responder
   * "suprimentos" — lista de embalagens/limpeza de uma filial
   *
   * As três esperam decisão de alguém, e é por isso que dividem as duas
   * mesmas sanfonas. Sem a origem na linha, a matriz não saberia de quem
   * é a vez — e é ela quem responde duas das três.
   */
  tipo: "anuncio" | "pedido" | "suprimentos";
  /** Loja que pediu (linhas de filial). */
  lojaId?: string;
  /** O documento a decidir — devolvido inteiro para a tela responder. */
  pedido?: PedidoFilial;
  /** Unidades pedidas por uma filial. */
  pedidoUnidades?: number;
  codigoPdv: number;
  /** Instante da fornada mais recente do produto hoje. */
  quando: string;
  vezes: number;
  /** Unidades anunciadas na fornada mais recente, quando informadas. */
  unidades?: number;
  situacao: "pendente" | "pedido" | "encerrado";
  /** Motivo da recusa, quando a matriz recusou um pedido de filial. */
  motivo?: string;
  /** Quantas lojas já pediram este produto hoje. */
  lojasQuePediram: number;
}

export interface EntradaDaMatriz {
  fornadas: FornadaPronta[];
  pedidos: PedidoFilial[];
  hoje: string;
  encerrados: Set<number>;
}

/** Uma reposição pedida por uma filial, do ponto de vista da matriz. */
function linhaDoPedidoDaFilial(pedido: PedidoFilial): LinhaDaMatriz[] {
  const quando = pedido.enviadoEm ?? pedido.criadoEm ?? "";
  return pedido.itens.map((item, indice) => {
    // Cada item tem o próprio desfecho — ver `decidirItemDaReposicao`.
    const desfecho = desfechoDoItem(pedido, item.codigoPdv);
    return {
    chave: `pf-${pedido.id}-${item.codigoPdv}-${indice}`,
    tipo: "pedido" as const,
    lojaId: pedido.lojaId,
    pedido,
    pedidoUnidades: item.quantidadeUnidades,
    codigoPdv: item.codigoPdv,
    quando,
    vezes: 1,
    lojasQuePediram: 1,
      situacao: (desfecho === "confirmado"
        ? "pedido"
        : desfecho === "cancelado"
          ? "encerrado"
          : "pendente") as LinhaDaMatriz["situacao"],
      motivo: desfecho === "cancelado" ? motivoDoItem(pedido, item.codigoPdv) : undefined,
    };
  });
}

export function montarLinhasDaMatriz({
  fornadas,
  pedidos,
  hoje,
  encerrados,
}: EntradaDaMatriz): LinhaDaMatriz[] {
  /** Quantas lojas diferentes pediram cada produto hoje. */
  const lojasPorProduto = new Map<number, Set<string>>();
  for (const pedido of pedidos) {
    if (pedido.data !== hoje || !ehReposicao(pedido)) continue;
    for (const item of pedido.itens) {
      const lojas = lojasPorProduto.get(item.codigoPdv) ?? new Set<string>();
      lojas.add(pedido.lojaId);
      lojasPorProduto.set(item.codigoPdv, lojas);
    }
  }

  const porProduto = new Map<number, FornadaPronta[]>();
  for (const fornada of fornadas) {
    if (fornada.data !== hoje) continue;
    porProduto.set(fornada.codigoPdv, [...(porProduto.get(fornada.codigoPdv) ?? []), fornada]);
  }

  const linhas: LinhaDaMatriz[] = [];

  /**
   * O QUE AS FILIAIS PEDIRAM ENTRA AQUI (set/2026).
   *
   * Antes isto vivia num card separado, acima da tela — o único lugar
   * onde a matriz confirmava ou recusava uma reposição. O card repetia,
   * num formato antigo, o que estas sanfonas já mostram, e ter dois
   * lugares para o mesmo assunto fazia a matriz responder num e conferir
   * no outro. Agora é um lugar só: o que espera resposta fica junto,
   * venha de onde vier.
   */
  for (const pedido of pedidos) {
    if (pedido.data !== hoje || !ehReposicao(pedido)) continue;
    linhas.push(...linhaDoPedidoDaFilial(pedido));
  }

  for (const [codigoPdv, doDia] of porProduto) {
    const ordenadas = [...doDia].sort((a, b) => b.marcadaEm.localeCompare(a.marcadaEm));
    const pediram = lojasPorProduto.get(codigoPdv)?.size ?? 0;
    linhas.push({
      chave: `m-${codigoPdv}`,
      tipo: "anuncio",
      codigoPdv,
      quando: ordenadas[0].marcadaEm,
      vezes: ordenadas.length,
      unidades: ordenadas[0].quantidade,
      lojasQuePediram: pediram,
      // ENCERRADO GANHA DE PEDIDO: tirar da vitrine é a decisão mais
      // recente da matriz, e é ela que a tela precisa mostrar.
      situacao: encerrados.has(codigoPdv) ? "encerrado" : pediram > 0 ? "pedido" : "pendente",
    });
  }

  return linhas.sort((a, b) => b.quando.localeCompare(a.quando));
}

export function anuncioPendente(linha: LinhaDaMatriz): boolean {
  return linha.situacao === "pendente";
}
