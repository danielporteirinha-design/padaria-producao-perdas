/**
 * src/lib/sugestaoProducao.ts
 * ---------------------------------------------------------------
 * Cliente da sugestão de lista de produção via IA (Gemini). A chamada
 * real ao modelo acontece do lado do servidor (api/sugestao-producao.ts,
 * função serverless do Vercel) — este módulo nunca vê nem manuseia a
 * chave da API; ela fica só no ambiente do servidor. Ver README, seção
 * "Sugestão de produção com IA".
 *
 * Comportamento sempre ASSISTIDO, nunca automático: este módulo só monta
 * o histórico e retorna sugestões — quem decide aplicar (e o operador
 * ainda revisa/ajusta) é a tela de Cronograma.
 */

import type { DiaDaSemana, PlanoDeProducaoDiario } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import { ehPedidoDiario, type PedidoFilial } from "../types/pedido";
import { diaDaSemanaDeData } from "./data";
import { LOJA_MATRIZ } from "./lojas";

export interface ItemHistoricoProducao {
  codigoPdv: number;
  nome: string;
  data: string;
  diaDaSemana: DiaDaSemana;
  quantidadeProduzida: number; // unidades
  quantidadePerdidaUnidades: number; // unidades (estimadas)
}

export interface SugestaoProduto {
  codigoPdv: number;
  quantidadeSugerida: number;
  justificativa?: string;
}

/** Erro de domínio — sempre com mensagem apresentável ao operador, nunca um "undefined" silencioso. */
export class ErroSugestaoProducao extends Error {}

/**
 * Monta o histórico local (planos + perdas já carregados no app) para UMA
 * categoria — é o payload enviado à IA. Roda inteiramente no navegador,
 * sem chamada de rede — só agrega dados que o app já tem.
 */
export function montarHistoricoPorCategoria(
  categoria: string,
  produtos: { codigoPdv: number; nome: string; categoria: string }[],
  planos: PlanoDeProducaoDiario[],
  perdas: RegistroPerda[],
  limiteDias = 60
): ItemHistoricoProducao[] {
  const codigosDaCategoria = new Set(produtos.filter((p) => p.categoria === categoria).map((p) => p.codigoPdv));
  const nomePorCodigo = new Map(produtos.map((p) => [p.codigoPdv, p.nome]));

  const perdidoPorDiaProduto = new Map<string, number>();
  for (const perda of perdas) {
    if (!codigosDaCategoria.has(perda.codigoPdv)) continue;
    const chave = `${perda.data}::${perda.codigoPdv}`;
    perdidoPorDiaProduto.set(chave, (perdidoPorDiaProduto.get(chave) ?? 0) + perda.quantidadeUnidadesEstimada);
  }

  const planosOrdenados = [...planos]
    .filter((p) => p.status === "confirmado")
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, limiteDias);

  const historico: ItemHistoricoProducao[] = [];
  for (const plano of planosOrdenados) {
    const sessao = plano.sessoes.find((s) => s.categoria === categoria);
    if (!sessao) continue;
    for (const item of sessao.itens) {
      if (!codigosDaCategoria.has(item.codigoPdv)) continue;
      historico.push({
        codigoPdv: item.codigoPdv,
        nome: nomePorCodigo.get(item.codigoPdv) ?? `#${item.codigoPdv}`,
        data: plano.data,
        diaDaSemana: plano.diaDaSemana,
        quantidadeProduzida: item.quantidadeUnidades,
        quantidadePerdidaUnidades: arred(perdidoPorDiaProduto.get(`${plano.data}::${item.codigoPdv}`) ?? 0),
      });
    }
  }
  return historico;
}

/**
 * O mesmo histórico, do ponto de vista de uma FILIAL (ago/2026).
 *
 * A filial não produz — ela pede. O que ela decide todo fim de expediente
 * é quanto pedir de cada item para o dia seguinte, e a pergunta que a IA
 * tem que responder é a mesma da matriz com dois números trocados:
 *
 *   - no lugar de "quanto produzi", entra "quanto PEDI";
 *   - no lugar da perda da padaria inteira, entra a perda DESTA loja.
 *
 * Usar o histórico da matriz aqui seria pior que não sugerir nada: a
 * produção total inclui o que foi para as outras lojas, e a sugestão sairia
 * várias vezes maior que o balcão desta filial consegue vender. Pedido
 * inflado vira perda no dia seguinte — o número que o app existe para
 * derrubar.
 *
 * Só pedido DIÁRIO e ENVIADO: rascunho a filial ainda estava mexendo, e
 * reposição é entrega extra de um dia atípico, que puxaria a média para
 * cima sem representar rotina.
 */
export function montarHistoricoDaFilial(
  categoria: string,
  lojaId: string,
  produtos: { codigoPdv: number; nome: string; categoria: string }[],
  pedidos: PedidoFilial[],
  perdas: RegistroPerda[],
  limiteDias = 60
): ItemHistoricoProducao[] {
  const codigosDaCategoria = new Set(
    produtos.filter((p) => p.categoria === categoria).map((p) => p.codigoPdv)
  );
  const nomePorCodigo = new Map(produtos.map((p) => [p.codigoPdv, p.nome]));

  const perdidoPorDiaProduto = new Map<string, number>();
  for (const perda of perdas) {
    if (!codigosDaCategoria.has(perda.codigoPdv)) continue;
    // Só a perda DESTA loja. Registro antigo, anterior às filiais, não
    // tem loja e conta como matriz — não é desta filial.
    if ((perda.lojaId ?? LOJA_MATRIZ.id) !== lojaId) continue;
    const chave = `${perda.data}::${perda.codigoPdv}`;
    perdidoPorDiaProduto.set(
      chave,
      (perdidoPorDiaProduto.get(chave) ?? 0) + perda.quantidadeUnidadesEstimada
    );
  }

  const meusPedidos = pedidos
    .filter((p) => p.lojaId === lojaId && p.status === "enviado" && ehPedidoDiario(p))
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, limiteDias);

  const historico: ItemHistoricoProducao[] = [];
  for (const pedido of meusPedidos) {
    for (const item of pedido.itens) {
      if (!codigosDaCategoria.has(item.codigoPdv)) continue;
      historico.push({
        codigoPdv: item.codigoPdv,
        nome: nomePorCodigo.get(item.codigoPdv) ?? `#${item.codigoPdv}`,
        data: pedido.data,
        diaDaSemana: diaDaSemanaDeData(pedido.data),
        quantidadeProduzida: item.quantidadeUnidades,
        quantidadePerdidaUnidades: arred(
          perdidoPorDiaProduto.get(`${pedido.data}::${item.codigoPdv}`) ?? 0
        ),
      });
    }
  }
  return historico;
}

/**
 * Pede à IA uma sugestão de quantidades para o dia/categoria informados,
 * com base no histórico já agregado por montarHistoricoPorCategoria().
 * Lança ErroSugestaoProducao com mensagem apresentável em qualquer
 * cenário de falha (chave não configurada, rede fora do ar, resposta
 * inesperada) — a tela de Cronograma nunca trava nem finge sucesso.
 */
export async function buscarSugestaoProducao(
  diaDaSemana: DiaDaSemana,
  categoria: string,
  historico: ItemHistoricoProducao[]
): Promise<SugestaoProduto[]> {
  let resposta: Response;
  try {
    resposta = await fetch("/api/sugestao-producao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diaDaSemana, categoria, historico }),
    });
  } catch {
    throw new ErroSugestaoProducao("Não foi possível conectar ao serviço de sugestão. Verifique sua internet.");
  }

  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new ErroSugestaoProducao(
      (dados && typeof dados.erro === "string" && dados.erro) || `Erro ao buscar sugestão (HTTP ${resposta.status}).`
    );
  }
  if (!dados || !Array.isArray(dados.sugestoes)) {
    throw new ErroSugestaoProducao("A resposta da IA veio em formato inesperado.");
  }
  return dados.sugestoes as SugestaoProduto[];
}

function arred(valor: number): number {
  return Math.round(valor * 100) / 100;
}
