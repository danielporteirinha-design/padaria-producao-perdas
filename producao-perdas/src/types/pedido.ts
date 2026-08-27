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
}

/** Estado atual da reposição, tratando ausência como pendente. */
export function desfechoDaReposicao(pedido: PedidoFilial): DesfechoReposicao {
  return pedido.atendimento?.desfecho ?? "pendente";
}

export function reposicaoEstaPendente(pedido: PedidoFilial): boolean {
  return ehReposicao(pedido) && desfechoDaReposicao(pedido) === "pendente";
}

/**
 * Aplica a decisão da matriz. Cancelar sem motivo é recusado aqui, e não
 * só desabilitando o botão na tela: a regra é do domínio, e uma tela nova
 * amanhã não pode conseguir contornar.
 */
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
