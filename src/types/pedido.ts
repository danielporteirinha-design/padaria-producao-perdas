/**
 * Modelo de dados — Pedido de Filial
 *
 * Modelo operacional confirmado com o dono do negócio (ago/2026): as
 * filiais NÃO produzem, elas PEDEM. Cada filial informa, no fim do
 * expediente, a quantidade de que vai precisar no dia seguinte; a matriz
 * soma tudo, produz o total e separa por loja de manhã.
 *
 * Um pedido por filial por dia. O id é derivado da data e da loja
 * (`2026-08-27_FILIAL_ARTHUR_BERNARDES`) em vez de aleatório: assim
 * gravar duas vezes atualiza o mesmo documento, e um envio duplicado por
 * toque repetido ou por reconexão offline não vira dois pedidos somados.
 */

import type { ItemPlanoProducao } from "./producao";

export type StatusPedido = "rascunho" | "enviado";

/**
 * Dois pedidos com urgências diferentes (ago/2026):
 *
 * - `diario`     — o de sempre, um por filial por dia, para o dia seguinte
 * - `reposicao`  — extra, para HOJE, disparado quando a filial vê que um
 *                  item saiu do forno e ela está sem ele no balcão
 *
 * São separados de propósito. Misturar reposição no pedido de amanhã
 * esconderia a urgência: a matriz precisa ver na hora que uma loja está
 * pedindo agora, e não descobrir junto com o planejamento do dia seguinte.
 */
export type TipoPedido = "diario" | "reposicao";

/**
 * Desfecho de uma reposição, decidido pela matriz (ago/2026).
 *
 * Nasceu do uso real: a filial pedia e ficava no escuro — sem saber se
 * alguém viu, se está separando, ou se não vai vir. Um pedido urgente sem
 * resposta é pior que nenhum pedido, porque a loja para de procurar
 * alternativa enquanto espera algo que talvez nunca chegue.
 *
 * `pendente` é o estado de quem acabou de chegar. Não existe campo para
 * "recusado sem motivo": cancelar EXIGE o motivo, porque é ele que diz à
 * filial o que fazer em seguida — esperar a próxima fornada é uma coisa,
 * acabou a matéria-prima é outra.
 */
export type DesfechoReposicao = "pendente" | "confirmado" | "cancelado";

export interface AtendimentoReposicao {
  desfecho: DesfechoReposicao;
  decididoPor?: string;
  decididoEm?: string; // ISO 8601 datetime
  /** Obrigatório quando o desfecho é `cancelado`. */
  motivo?: string;
}

/**
 * O que a matriz mudou na lista que a filial mandou (ago/2026, decisão do
 * dono do negócio).
 *
 * ANTES ISSO ERA PROIBIDO, DE PROPÓSITO. As regras do Firestore travavam
 * a quantidade pedida com o argumento de que o número tinha que continuar
 * sendo o que a loja mandou. O uso mostrou o outro lado: a matriz nem
 * sempre consegue produzir o que foi pedido — faltou matéria-prima, o
 * forno atrasou, a soma das três lojas não cabe no dia — e sem poder
 * ajustar ela produzia um número e entregava outro, sem registro nenhum.
 *
 * O que torna o ajuste seguro é `itensOriginais`: o pedido da filial não é
 * apagado, é GUARDADO. A tela dela mostra a quantidade confirmada com a
 * marca "ajustado pela matriz" e o número que ela havia pedido, então a
 * loja descobre a diferença na véspera — não no caminhão, no dia seguinte.
 *
 * Ajustar duas vezes não perde o original: ver ajustarPedidoPelaMatriz.
 */
export interface AjusteDaMatriz {
  por: string;
  em: string; // ISO 8601 datetime
  /** O que a filial havia enviado, antes de qualquer ajuste. */
  itensOriginais: ItemPlanoProducao[];
}

export interface PedidoFilial {
  id: string;
  lojaId: string;
  /** Dia para o qual o pedido vale — normalmente amanhã (ISO YYYY-MM-DD). */
  data: string;
  itens: ItemPlanoProducao[];
  status: StatusPedido;
  /** Ausente em pedidos anteriores a ago/2026 — todos eram diários. */
  tipo?: TipoPedido;
  criadoPor: string;
  criadoEm: string; // ISO 8601 datetime
  enviadoEm?: string;

  /**
   * Só em reposições. Ausente = ainda não decidido — inclusive nas
   * reposições anteriores a esta versão, que continuam válidas e
   * aparecem como pendentes.
   */
  atendimento?: AtendimentoReposicao;
  /**
   * A DECISÃO É POR ITEM (set/2026 — defeito relatado em produção).
   *
   * Uma fala da filial vira UM documento com vários itens: "20 pão
   * francês, 10 broa e 6 sonho" é um pedido só. A decisão da matriz,
   * porém, era gravada no documento inteiro — recusar a broa porque a
   * fornada não deu certo cancelava também o pão e o sonho, que estavam
   * prontos. A filial ficava sem nove itens por causa de um.
   *
   * Agora cada produto guarda o próprio desfecho, na chave do código do
   * PDV. O campo `atendimento` acima continua existindo e valendo como
   * padrão: pedidos decididos antes desta mudança continuam sendo lidos
   * do jeito que foram gravados.
   */
  atendimentoPorItem?: Record<string, AtendimentoReposicao>;

  /**
   * Presente só quando a matriz mexeu na lista. Ausente = o que está em
   * `itens` é exatamente o que a filial mandou.
   */
  ajusteDaMatriz?: AjusteDaMatriz;
}

/** Estado atual da reposição, tratando ausência como pendente. */
export function desfechoDaReposicao(pedido: PedidoFilial): DesfechoReposicao {
  return pedido.atendimento?.desfecho ?? "pendente";
}

/** Uma linha das sanfonas de reposição da filial. */
export interface LinhaDeReposicao {
  /** Documento de origem — duas linhas do mesmo envio compartilham. */
  pedidoId: string;
  codigoPdv: number;
  unidades: number;
  /** Instante ISO do envio. */
  quando: string;
  situacao: DesfechoReposicao;
  /** Motivo da recusa, quando a matriz recusou. */
  motivo?: string;
}

/**
 * TUDO QUE ESTA LOJA PEDIU HOJE, uma linha por produto por envio
 * (ago/2026, pedido do dono do negócio).
 *
 * A tela separa isto em duas sanfonas — PEDIDOS SEM RESPOSTA e PEDIDOS
 * CONCLUÍDOS — porque as duas listas respondem a perguntas diferentes:
 * uma diz de quem a filial ainda está esperando, a outra é histórico do
 * dia. Misturadas, a pergunta que importa ("o que ainda não foi
 * respondido?") exigia ler tudo.
 *
 * NÃO AGRUPA POR PRODUTO. Dois envios do mesmo produto podem ter
 * desfechos diferentes — a matriz aceita o das 9h e recusa o das 11h — e
 * somar as quantidades esconderia justamente a recusa.
 *
 * Ordena do MAIS RECENTE para o mais antigo, como o resto do app.
 */
export function linhasDeReposicaoDoDia(
  pedidos: PedidoFilial[],
  hoje: string,
  lojaId: string
): LinhaDeReposicao[] {
  const linhas: LinhaDeReposicao[] = [];

  for (const pedido of pedidos) {
    if (pedido.data !== hoje || pedido.lojaId !== lojaId || !ehReposicao(pedido)) continue;
    const situacao = desfechoDaReposicao(pedido);
    const quando = pedido.enviadoEm ?? pedido.criadoEm ?? "";
    for (const item of pedido.itens) {
      linhas.push({
        pedidoId: pedido.id,
        codigoPdv: item.codigoPdv,
        unidades: item.quantidadeUnidades,
        quando,
        situacao,
        motivo:
          situacao === "cancelado"
            ? pedido.atendimento?.motivo || "sem motivo informado"
            : undefined,
      });
    }
  }

  return linhas.sort((a, b) => b.quando.localeCompare(a.quando));
}

/** Pedido que a matriz ainda não aceitou nem recusou. */
export function semRespostaDaMatriz(linha: LinhaDeReposicao): boolean {
  return linha.situacao === "pendente";
}

export function reposicaoEstaPendente(pedido: PedidoFilial): boolean {
  return ehReposicao(pedido) && desfechoDaReposicao(pedido) === "pendente";
}

/**
 * Aplica a decisão da matriz. Cancelar sem motivo é recusado aqui, e não
 * só desabilitando o botão na tela: a regra é do domínio, e uma tela nova
 * amanhã não pode conseguir contornar.
 */
/**
 * O desfecho de UM item — o do item, quando existe; senão o do documento.
 *
 * A ordem importa: um pedido antigo tem só a decisão do documento, e um
 * pedido novo pode ter os dois (o documento por uma decisão anterior, o
 * item pela mais recente). Vale sempre a mais específica.
 */
export function desfechoDoItem(
  pedido: PedidoFilial,
  codigoPdv: number
): DesfechoReposicao {
  return pedido.atendimentoPorItem?.[String(codigoPdv)]?.desfecho ?? desfechoDaReposicao(pedido);
}

/** O motivo da recusa de UM item, pela mesma regra. */
export function motivoDoItem(pedido: PedidoFilial, codigoPdv: number): string | undefined {
  const doItem = pedido.atendimentoPorItem?.[String(codigoPdv)];
  if (doItem) return doItem.motivo;
  return pedido.atendimento?.motivo;
}

/**
 * Aplica a decisão da matriz a UM item, sem tocar nos outros.
 *
 * Cancelar sem motivo é recusado aqui, e não só desabilitando o botão na
 * tela: a regra é do domínio, e uma tela nova amanhã não pode conseguir
 * contornar.
 */
export function decidirItemDaReposicao(
  pedido: PedidoFilial,
  codigoPdv: number,
  desfecho: "confirmado" | "cancelado",
  decididoPor: string,
  motivo?: string
): PedidoFilial {
  const limpo = (motivo ?? "").trim();
  if (desfecho === "cancelado" && limpo.length === 0) {
    throw new Error("Recusar um item exige o motivo.");
  }
  return {
    ...pedido,
    atendimentoPorItem: {
      ...(pedido.atendimentoPorItem ?? {}),
      [String(codigoPdv)]: {
        desfecho,
        decididoPor,
        decididoEm: new Date().toISOString(),
        ...(desfecho === "cancelado" ? { motivo: limpo } : {}),
      },
    },
  };
}

/**
 * Todo item do pedido já foi decidido? É o que diz se o pedido, como um
 * todo, saiu da fila da matriz.
 */
export function reposicaoTotalmenteDecidida(pedido: PedidoFilial): boolean {
  return pedido.itens.every((i) => desfechoDoItem(pedido, i.codigoPdv) !== "pendente");
}

/**
 * ACEITA DE UMA VEZ TODOS OS ITENS AINDA PENDENTES DO PEDIDO (set/2026,
 * pedido do dono do negócio: imprimir o comprovante de reposição de uma
 * filial deve aceitar o pedido inteiro, não item por item).
 *
 * Só "confirmado" — recusar exige motivo por item (ver
 * `decidirItemDaReposicao`), e não faz sentido recusar vários itens
 * diferentes com um motivo só. Item já decidido (confirmado ou
 * recusado antes) fica como está: só o que ainda espera resposta muda.
 *
 * UMA ESCRITA SÓ NO DOCUMENTO, e não N chamadas de
 * `decidirItemDaReposicao` em sequência — cada chamada parte do mesmo
 * `pedido` recebido por parâmetro, e chamar a função várias vezes com o
 * MESMO pedido base faria a última escrita apagar as decisões das
 * anteriores (cada uma monta `atendimentoPorItem` a partir do pedido
 * original, não do resultado da chamada anterior).
 */
export function decidirItensPendentesDaReposicao(
  pedido: PedidoFilial,
  decididoPor: string
): PedidoFilial {
  const agora = new Date().toISOString();
  const atendimentoPorItem = { ...(pedido.atendimentoPorItem ?? {}) };
  for (const item of pedido.itens) {
    if (desfechoDoItem(pedido, item.codigoPdv) !== "pendente") continue;
    atendimentoPorItem[String(item.codigoPdv)] = {
      desfecho: "confirmado",
      decididoPor,
      decididoEm: agora,
    };
  }
  return { ...pedido, atendimentoPorItem };
}

export function decidirReposicao(
  pedido: PedidoFilial,
  desfecho: "confirmado" | "cancelado",
  decididoPor: string,
  motivo?: string
): PedidoFilial {
  const limpo = (motivo ?? "").trim();
  if (desfecho === "cancelado" && limpo.length === 0) {
    throw new Error("Cancelar uma reposição exige o motivo.");
  }
  return {
    ...pedido,
    atendimento: {
      desfecho,
      decididoPor,
      decididoEm: new Date().toISOString(),
      ...(desfecho === "cancelado" ? { motivo: limpo } : {}),
    },
  };
}

export function idDoPedido(data: string, lojaId: string): string {
  return `${data}_${lojaId}`;
}

/**
 * Reposição pode acontecer mais de uma vez no mesmo dia (a filial pode
 * ficar sem pão às 9h e sem biscoito às 15h), então o id leva o instante
 * do envio — diferente do pedido diário, que é único por dia e sobrescreve.
 */
export function idDaReposicao(data: string, lojaId: string, enviadoEm: string): string {
  return `${data}_${lojaId}_rep_${enviadoEm.replace(/[^0-9]/g, "")}`;
}

export function ehReposicao(pedido: PedidoFilial): boolean {
  return pedido.tipo === "reposicao";
}

/** Pedido que entra no planejamento do dia — reposição não entra. */
export function ehPedidoDiario(pedido: PedidoFilial): boolean {
  return pedido.tipo !== "reposicao";
}

export function pedidoFoiEnviado(pedido: PedidoFilial | undefined): boolean {
  return pedido?.status === "enviado";
}

/** Total de unidades pedidas — usado no resumo e no indicador da matriz. */
export function totalDoPedido(pedido: PedidoFilial | undefined): number {
  return (pedido?.itens ?? []).reduce((soma, i) => soma + i.quantidadeUnidades, 0);
}


/**
 * A matriz confirma a lista de uma filial, possivelmente com outras
 * quantidades.
 *
 * DUAS REGRAS QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. O ORIGINAL É GUARDADO UMA VEZ SÓ. Ajustar de novo compara sempre com
 *    o que a FILIAL mandou, nunca com o ajuste anterior. Sem isso, dois
 *    ajustes seguidos fariam o "pedido: 150" virar "pedido: 100" — a
 *    própria correção da matriz viraria o pedido da loja, e a diferença
 *    que a filial precisa enxergar sumiria em silêncio.
 *
 * 2. VOLTAR AO ORIGINAL LIMPA A MARCA. Se a matriz desfaz o que mudou, o
 *    pedido não pode continuar dizendo "ajustado" — a filial leria um
 *    aviso sobre uma diferença que não existe, e alarme que aparece sem
 *    motivo é alarme que se aprende a ignorar.
 *
 * Quantidade zero ou item ausente significam "não vem". O item some de
 * `itens`, mas continua em `itensOriginais` — é assim que a filial fica
 * sabendo que aquilo que ela pediu não virá.
 */
export function ajustarPedidoPelaMatriz(
  pedido: PedidoFilial,
  novosItens: ItemPlanoProducao[],
  por: string,
  em: string
): PedidoFilial {
  const originais = pedido.ajusteDaMatriz?.itensOriginais ?? pedido.itens;
  const itens = novosItens.filter((i) => i.quantidadeUnidades > 0);

  if (itensIguais(itens, originais)) {
    const { ajusteDaMatriz: _descartado, ...semAjuste } = pedido;
    return { ...semAjuste, itens: originais };
  }

  return {
    ...pedido,
    itens,
    ajusteDaMatriz: { por, em, itensOriginais: originais },
  };
}

/** Mesmos códigos, mesmas quantidades — a ordem não importa. */
export function itensIguais(a: ItemPlanoProducao[], b: ItemPlanoProducao[]): boolean {
  if (a.length !== b.length) return false;
  const mapa = new Map(a.map((i) => [i.codigoPdv, i.quantidadeUnidades]));
  return b.every((i) => mapa.get(i.codigoPdv) === i.quantidadeUnidades);
}

export interface DiferencaDoAjuste {
  codigoPdv: number;
  /** O que a filial pediu. */
  pedido: number;
  /** O que a matriz confirmou. Zero = não vem. */
  confirmado: number;
}

/**
 * O que mudou entre o pedido da filial e o que a matriz confirmou.
 *
 * Vazio quando não houve ajuste. Só entram os itens que REALMENTE mudaram
 * — a tela da filial marca esses, e marcar o que ficou igual seria ruído
 * na lista inteira.
 */
export function diferencasDoAjuste(pedido: PedidoFilial): DiferencaDoAjuste[] {
  const ajuste = pedido.ajusteDaMatriz;
  if (!ajuste) return [];

  const confirmados = new Map(pedido.itens.map((i) => [i.codigoPdv, i.quantidadeUnidades]));
  const originais = new Map(ajuste.itensOriginais.map((i) => [i.codigoPdv, i.quantidadeUnidades]));
  const codigos = new Set([...originais.keys(), ...confirmados.keys()]);

  const diferencas: DiferencaDoAjuste[] = [];
  for (const codigoPdv of codigos) {
    const pedidoOriginal = originais.get(codigoPdv) ?? 0;
    const confirmado = confirmados.get(codigoPdv) ?? 0;
    if (pedidoOriginal !== confirmado) {
      diferencas.push({ codigoPdv, pedido: pedidoOriginal, confirmado });
    }
  }
  return diferencas.sort((a, b) => a.codigoPdv - b.codigoPdv);
}
