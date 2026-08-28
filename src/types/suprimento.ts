/**
 * Modelo de dados — Suprimentos
 * ---------------------------------------------------------------
 * O que a loja consome para PODER vender, e que não é produto de padaria
 * (ago/2026, pedido do dono do negócio).
 *
 * POR QUE NÃO ENTRA NO CATÁLOGO DE PRODUTOS
 * ------------------------------------------
 * Saco de pão e detergente não têm nada em comum com pão francês, exceto
 * o fato de acabarem. Não têm peso unitário, não têm validade de fornada,
 * não entram na taxa de perda, não saem do forno e não viram análise de
 * produção. Enfiá-los na tabela de produtos contaminaria todo relatório
 * que hoje responde "quanto se produziu e quanto se perdeu" — e essa
 * conta é a razão de o app existir.
 *
 * São, portanto, uma coleção própria, com um pedido próprio.
 *
 * O CATÁLOGO CRESCE SOZINHO. A filial digita um item que não está na
 * lista, escolhe o segmento, e ele passa a existir para as próximas
 * vezes (item 3 do pedido). O id vem do NOME NORMALIZADO justamente por
 * isso: sem essa normalização, "Saco Kraft 1kg", "SACO KRAFT 1KG" e
 * "saco kraft 1kg" virariam três itens diferentes no mesmo mês, e o
 * catálogo — que existe para poupar digitação — viraria uma lista suja
 * que ninguém encontra nada.
 */

import { paraBusca } from "../lib/texto";

export interface SegmentoSuprimento {
  chave: string;
  rotulo: string;
}

/**
 * Dois segmentos, e não uma lista aberta. São as duas naturezas de
 * compra que a padaria faz: o que embala o que ela vende, e o que
 * mantém a loja limpa. Um terceiro segmento aparecerá quando existir uma
 * terceira natureza — não antes.
 */
export const SEGMENTOS_SUPRIMENTO: SegmentoSuprimento[] = [
  { chave: "EMBALAGENS", rotulo: "Embalagens" },
  { chave: "LIMPEZA", rotulo: "Materiais de limpeza" },
];

export function rotuloDoSegmento(chave: string): string {
  return SEGMENTOS_SUPRIMENTO.find((s) => s.chave === chave)?.rotulo ?? "Outros";
}

export interface Suprimento {
  /** Nome normalizado — ver idDoSuprimento. */
  id: string;
  nome: string;
  segmento: string;
  /**
   * Item fora de uso não some do catálogo: ele sai das listas novas e
   * continua existindo nos pedidos antigos, que precisam continuar
   * legíveis. Apagar o item apagaria o histórico junto.
   */
  ativo: boolean;
  criadoPor?: string;
  criadoEm?: string; // ISO 8601 datetime
}

/**
 * Id derivado do nome, sem acento e sem caixa: cadastrar o mesmo item de
 * novo ATUALIZA em vez de duplicar.
 *
 * Os espaços viram `_` e o que não for letra, número ou espaço sai fora —
 * id de documento do Firestore não aceita `/`, e "SACO 1/2 KG" é um nome
 * perfeitamente normal de embalagem.
 */
export function idDoSuprimento(nome: string): string {
  return paraBusca(nome)
    .replace(/[^A-Z0-9 ]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

export interface ItemPedidoSuprimento {
  suprimentoId: string;
  quantidade: number;
}

export interface PedidoSuprimentos {
  /** `<data>_<loja>` — reenviar no mesmo dia atualiza em vez de duplicar. */
  id: string;
  lojaId: string;
  /** Dia em que a lista foi montada (ISO YYYY-MM-DD). */
  data: string;
  itens: ItemPedidoSuprimento[];
  status: "rascunho" | "enviado";
  criadoPor: string;
  criadoEm: string; // ISO 8601 datetime
  enviadoEm?: string;
}

export function idDoPedidoSuprimentos(data: string, lojaId: string): string {
  return `${data}_${lojaId}`;
}

/** Quantos itens diferentes a lista pede. Zero conta como ausente. */
export function variedadesDoPedidoSuprimentos(pedido: PedidoSuprimentos | undefined): number {
  return (pedido?.itens ?? []).filter((i) => i.quantidade > 0).length;
}

/**
 * Os itens do pedido agrupados por segmento, na ordem de
 * SEGMENTOS_SUPRIMENTO — que é a ordem em que a compra é feita.
 *
 * Item cujo suprimento sumiu do catálogo não desaparece: cai em "Outros"
 * com o próprio id no lugar do nome. Uma lista de compra que esconde uma
 * linha é pior que uma lista com uma linha estranha.
 */
export function agruparPorSegmento(
  itens: ItemPedidoSuprimento[],
  catalogo: Suprimento[]
): { chave: string; rotulo: string; itens: { nome: string; quantidade: number }[] }[] {
  const porId = new Map(catalogo.map((s) => [s.id, s]));
  const grupos = new Map<string, { nome: string; quantidade: number }[]>();

  for (const item of itens) {
    if (item.quantidade <= 0) continue;
    const suprimento = porId.get(item.suprimentoId);
    const chave = suprimento?.segmento ?? "OUTROS";
    const lista = grupos.get(chave) ?? [];
    lista.push({ nome: suprimento?.nome ?? item.suprimentoId, quantidade: item.quantidade });
    grupos.set(chave, lista);
  }

  const ordenadas = [...SEGMENTOS_SUPRIMENTO.map((s) => s.chave), "OUTROS"];
  return ordenadas
    .filter((chave) => (grupos.get(chave) ?? []).length > 0)
    .map((chave) => ({
      chave,
      rotulo: chave === "OUTROS" ? "Outros" : rotuloDoSegmento(chave),
      itens: (grupos.get(chave) ?? []).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    }));
}
