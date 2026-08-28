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
import { desfechoDaReposicao, ehReposicao } from "../types/pedido";

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
  /** Avisos que ESTA loja tirou da própria tela. */
  dispensadas: Set<number>;
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
  const pedidosMeus = new Set<number>();

  // ---- o que a FILIAL pediu ----
  for (const pedido of pedidos) {
    if (pedido.data !== hoje || pedido.lojaId !== lojaId || !ehReposicao(pedido)) continue;
    const desfecho = desfechoDaReposicao(pedido);
    const quando = pedido.enviadoEm ?? pedido.criadoEm ?? "";
    for (const item of pedido.itens) {
      pedidosMeus.add(item.codigoPdv);
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
            ? pedido.atendimento?.motivo || "sem motivo informado"
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
      situacao: pedidosMeus.has(codigoPdv)
        ? "atendido"
        : dispensadas.has(codigoPdv)
          ? "dispensado"
          : "pendente",
    });
  }

  return linhas.sort((a, b) => b.quando.localeCompare(a.quando));
}

/** Ainda espera decisão — de quem quer que seja. */
export function estaPendente(linha: LinhaDoDia): boolean {
  return linha.situacao === "pendente";
}
