/**
 * src/types/suprimento.ts
 * ---------------------------------------------------------------
 * Tipos e utilitários para a lista de suprimentos (embalagens e
 * material de limpeza) pedida pelas filiais à matriz (ago/2026).
 */

export interface Suprimento {
  id: string;
  nome: string;
  segmento: string;
  ativo: boolean;
  criadoPor: string;
  criadoEm: string;
}

export interface ItemPedidoSuprimento {
  suprimentoId: string;
  quantidade: number;
}

export interface AtendimentoSuprimento {
  desfecho: "confirmado" | "cancelado";
  por: string;
  em: string;
  motivo?: string;
}

export interface PedidoSuprimentos {
  id: string;
  lojaId: string;
  data: string;
  itens: ItemPedidoSuprimento[];
  status: "rascunho" | "enviado";
  atendimento?: AtendimentoSuprimento;
  criadoPor: string;
  criadoEm: string;
  enviadoEm?: string;
}

export const SEGMENTOS_SUPRIMENTO: { chave: string; rotulo: string }[] = [
  { chave: "embalagens", rotulo: "Embalagens" },
  { chave: "sacolas", rotulo: "Sacolas" },
  { chave: "limpeza", rotulo: "Material de Limpeza" },
];

export function idDoSuprimento(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function idDoPedidoSuprimentos(data: string, lojaId: string): string {
  return `suprimentos-${data}-${lojaId}`;
}

/**
 * Quantas variedades a loja está pedindo de verdade.
 *
 * CONTA SÓ O QUE TEM QUANTIDADE. Item zerado é campo que a pessoa abriu e
 * não preencheu — contá-lo faz o resumo prometer um item que não vai na
 * lista impressa, e a divergência aparece só na hora da conferência.
 */
export function variedadesDoPedidoSuprimentos(pedido: PedidoSuprimentos | undefined): number {
  return (pedido?.itens ?? []).filter((i) => i.quantidade > 0).length;
}

/**
 * A LISTA PEDIDA COM NOME, e não com id (set/2026, pedido do dono do
 * negócio: as notificações "devem ser enviadas para a matriz, com todos
 * os detalhes solicitados").
 *
 * O documento guarda `suprimentoId` porque é ele que sobrevive a uma
 * renomeação no catálogo. Mas ninguém no balcão reconhece
 * "saco-kraft-2kg" — e o aviso que chega no celular da matriz não tem o
 * catálogo à mão para traduzir. Traduzir aqui, uma vez só, evita que
 * cada tela invente o próprio jeito de fazer isso — e que uma delas
 * mostre o id cru quando o item saiu do catálogo.
 *
 * SÓ O QUE TEM QUANTIDADE, pelo mesmo motivo de
 * `variedadesDoPedidoSuprimentos`: item zerado não vai na lista.
 */
export function itensComNome(
  pedido: PedidoSuprimentos | undefined,
  catalogo: Suprimento[]
): { nome: string; quantidade: number }[] {
  const nomePorId = new Map(catalogo.map((s) => [s.id, s.nome]));
  return (pedido?.itens ?? [])
    .filter((i) => i.quantidade > 0)
    .map((i) => ({
      nome: nomePorId.get(i.suprimentoId) ?? i.suprimentoId,
      quantidade: i.quantidade,
    }));
}

export function desfechoDosSuprimentos(pedido: PedidoSuprimentos | undefined): "pendente" | "confirmado" | "cancelado" {
  if (!pedido || pedido.status !== "enviado") return "pendente";
  if (!pedido.atendimento) return "pendente";
  return pedido.atendimento.desfecho;
}

/** Chave do segmento sem depender de caixa — ver `agruparPorSegmento`. */
export function chaveDoSegmento(bruto: string | undefined): string {
  return (bruto ?? "").trim().toUpperCase();
}

/** "polpa de frutas" -> "Polpa De Frutas", só para exibir na tela. */
function rotuloDoSegmento(bruto: string): string {
  return bruto
    .trim()
    .split(/\s+/)
    .map((parte) => (parte.length > 0 ? parte[0].toUpperCase() + parte.slice(1).toLowerCase() : parte))
    .join(" ");
}

/** O balde de quem não pertence a nenhum segmento conhecido. */
const OUTROS = { chave: "OUTROS", rotulo: "Outros" };

/**
 * OS TRÊS SEGMENTOS FIXOS, MAIS QUALQUER SESSÃO NOVA CRIADA PELO
 * CAMINHO (set/2026, pedido do dono do negócio: "queria a opção de
 * salvar uma nova sanfona, com o nome de uma nova sessão").
 *
 * Não existe uma coleção separada de "segmentos" — o único lugar onde
 * um segmento fica registrado é no próprio suprimento cadastrado com
 * ele. Por isso quem decide quais sanfonas existem (aqui, e na tela de
 * Suprimentos) é sempre esta função: os três de sempre, na ordem de
 * sempre, e depois cada segmento diferente encontrado no catálogo, na
 * ordem em que apareceu pela primeira vez.
 */
export function segmentosExibidos(
  catalogo: Suprimento[]
): { chave: string; rotulo: string; personalizado: boolean }[] {
  const conhecidos = new Set(SEGMENTOS_SUPRIMENTO.map((s) => chaveDoSegmento(s.chave)));
  const extras: { chave: string; rotulo: string; personalizado: boolean }[] = [];
  const vistos = new Set<string>();

  for (const sup of catalogo) {
    const chave = chaveDoSegmento(sup.segmento);
    if (chave === "" || conhecidos.has(chave) || vistos.has(chave)) continue;
    vistos.add(chave);
    extras.push({ chave, rotulo: rotuloDoSegmento(sup.segmento), personalizado: true });
  }

  return [
    ...SEGMENTOS_SUPRIMENTO.map((s) => ({ ...s, personalizado: false })),
    ...extras,
  ];
}

export function agruparPorSegmento(
  itens: ItemPedidoSuprimento[],
  catalogo: Suprimento[]
): { chave: string; rotulo: string; itens: { nome: string; quantidade: number }[] }[] {
  const mapaCatalogo = new Map(catalogo.map((s) => [s.id, s]));
  const segmentos = segmentosExibidos(catalogo);

  /**
   * A COMPARAÇÃO IGNORA A CAIXA, E EXISTE UM "OUTROS" — as duas coisas
   * existem para o mesmo motivo: NADA PODE SUMIR DA LISTA DE COMPRA.
   *
   * Os segmentos já foram gravados em MAIÚSCULAS ("EMBALAGENS") e hoje
   * são declarados em minúsculas ("embalagens"). Sem normalizar, todo
   * suprimento salvo antes da mudança deixaria de casar com qualquer
   * grupo — e, como a montagem só percorre os grupos CONHECIDOS, o item
   * não ia para "Outros": ele desaparecia do papel, em silêncio, e a
   * loja ficaria sem o produto sem ninguém entender por quê.
   *
   * "OUTROS" agora só recebe item cujo id nem está mais no catálogo —
   * todo segmento que existe em algum suprimento cadastrado já ganha
   * grupo próprio via `segmentosExibidos`, sessão criada na hora
   * inclusa. Uma lista de compra que perde item é pior que uma lista
   * feia; e uma sessão nova que vira "Outros" no papel impresso é o
   * mesmo problema com outra cara.
   */
  const gruposMap = new Map<string, { nome: string; quantidade: number }[]>();
  for (const seg of segmentos) {
    gruposMap.set(chaveDoSegmento(seg.chave), []);
  }
  gruposMap.set(OUTROS.chave, []);

  for (const item of itens) {
    // Quantidade zero não é pedido: é campo aberto e não preenchido.
    if (item.quantidade <= 0) continue;
    const sup = mapaCatalogo.get(item.suprimentoId);
    const nome = sup?.nome ?? item.suprimentoId;
    const chave = chaveDoSegmento(sup?.segmento);
    const destino = gruposMap.has(chave) ? chave : OUTROS.chave;

    gruposMap.get(destino)!.push({ nome, quantidade: item.quantidade });
  }

  return [...segmentos, OUTROS]
    .map((seg) => ({
      chave: seg.chave,
      rotulo: seg.rotulo,
      itens: gruposMap.get(chaveDoSegmento(seg.chave)) ?? [],
    }))
    .filter((g) => g.itens.length > 0);
}