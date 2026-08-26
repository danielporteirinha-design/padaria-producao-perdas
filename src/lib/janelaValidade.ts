/**
 * src/lib/janelaValidade.ts
 * ---------------------------------------------------------------
 * Resolve um gargalo real da operação: a etiqueta do produto não traz uma
 * data de fabricação confiável o bastante para saber sozinho de qual dia
 * de produção uma perda lançada HOJE realmente veio — um pão dura só 1
 * dia, mas uma confeitaria pode ter sido produzida até 5 dias atrás e só
 * agora ser descartada.
 *
 * IMPORTANTE — perda NÃO é sinônimo de vencimento (correção conceitual
 * pedida pela padaria, ago/2026): um produto pode sair do forno queimado
 * ou fora do padrão e virar perda no mesmo dia em que foi feito, sem ter
 * nada a ver com prazo de validade. O prazo serve só para dizer de QUAL
 * fornada a perda provavelmente veio, nunca para autorizar ou barrar o
 * lançamento.
 *
 * Por isso este módulo devolve duas camadas:
 *
 * 1. `origens` — fornadas confirmadas ainda dentro do prazo do produto
 *    (inclui a fornada de HOJE, `diasDesdeProducao === 0`). O operador
 *    escolhe qual, com a mais antiga pré-selecionada (FIFO).
 * 2. Produtos que já foram produzidos em alguma ocasião mas não têm
 *    nenhuma fornada dentro do prazo agora: entram na lista com `origens`
 *    vazio. A perda é registrada sem fornada de origem identificada.
 *
 * A única trava é a regra do dono do negócio: para lançar perda, o
 * produto precisa ter sido produzido em alguma oportunidade. Produto que
 * nunca apareceu em cronograma confirmado não entra na lista — não existe
 * fornada nenhuma da qual ele pudesse ter vindo.
 *
 * Produto sem prazoValidadeDias cadastrado cai no comportamento anterior,
 * mais restritivo (só considera o plano do próprio dia) — nunca inventa
 * um prazo que ninguém confirmou.
 *
 * Módulo puro (sem I/O), testável isoladamente — ver scripts/verificar_logica.ts.
 */

import type { PlanoDeProducaoDiario } from "../types/producao";
import type { Produto } from "../types/produto";
import { diasEntreDatas } from "./data";

export interface OrigemCandidata {
  planoDeProducaoId: string;
  data: string; // data do plano de produção de origem (ISO)
  diasDesdeProducao: number;
}

export interface ProdutoComOrigens {
  produto: Produto;
  /**
   * Fornadas ainda dentro do prazo, da mais antiga para a mais nova (FIFO).
   * Pode vir VAZIO: o produto já foi produzido antes, mas nenhuma fornada
   * está dentro do prazo hoje. A perda continua podendo ser lançada — só
   * fica sem fornada de origem identificada.
   */
  origens: OrigemCandidata[];
  /** Data da fornada confirmada mais recente, mesmo fora do prazo. */
  ultimaProducao: string;
}

export function calcularCandidatosPerda(
  dataReferencia: string,
  produtos: Produto[],
  planos: PlanoDeProducaoDiario[]
): ProdutoComOrigens[] {
  const produtoPorCodigo = new Map(produtos.map((p) => [p.codigoPdv, p]));
  const origensPorProduto = new Map<number, OrigemCandidata[]>();
  // Todo produto já produzido alguma vez entra aqui, mesmo fora do prazo —
  // é o que autoriza o lançamento (regra: precisa ter sido produzido).
  const ultimaProducaoPorProduto = new Map<number, string>();

  for (const plano of planos) {
    if (plano.status !== "confirmado") continue;
    const diasDesdeProducao = diasEntreDatas(plano.data, dataReferencia);
    if (diasDesdeProducao < 0) continue; // plano com data no futuro em relação à referência — ignora

    for (const sessao of plano.sessoes) {
      for (const item of sessao.itens) {
        const produto = produtoPorCodigo.get(item.codigoPdv);
        if (!produto) continue;

        const anterior = ultimaProducaoPorProduto.get(item.codigoPdv);
        if (!anterior || plano.data > anterior) {
          ultimaProducaoPorProduto.set(item.codigoPdv, plano.data);
        }

        const prazo = produto.prazoValidadeDias;
        const dentroDoPrazo = prazo && prazo > 0 ? diasDesdeProducao < prazo : diasDesdeProducao === 0;
        if (!dentroDoPrazo) continue;

        const lista = origensPorProduto.get(item.codigoPdv) ?? [];
        // Evita duplicar a mesma origem se o produto aparecer em mais de uma sessão do mesmo plano.
        if (!lista.some((o) => o.planoDeProducaoId === plano.id)) {
          lista.push({ planoDeProducaoId: plano.id, data: plano.data, diasDesdeProducao });
        }
        origensPorProduto.set(item.codigoPdv, lista);
      }
    }
  }

  const resultado: ProdutoComOrigens[] = [];
  for (const [codigoPdv, ultimaProducao] of ultimaProducaoPorProduto) {
    const produto = produtoPorCodigo.get(codigoPdv);
    if (!produto) continue;
    const origens = origensPorProduto.get(codigoPdv) ?? [];
    origens.sort((a, b) => b.diasDesdeProducao - a.diasDesdeProducao); // mais antigo primeiro
    resultado.push({ produto, origens, ultimaProducao });
  }

  // Produtos com fornada dentro do prazo primeiro — são o caso comum e
  // ficam no topo; depois os que só têm produção mais antiga.
  return resultado.sort((a, b) => {
    const aTem = a.origens.length > 0;
    const bTem = b.origens.length > 0;
    if (aTem !== bTem) return aTem ? -1 : 1;
    return a.produto.nome.localeCompare(b.produto.nome, "pt-BR");
  });
}
