/**
 * api/insights-catalogo.ts
 * ---------------------------------------------------------------
 * Função serverless (Vercel publica automaticamente qualquer arquivo em
 * /api). Segunda ponta que fala com o Gemini — mesma arquitetura de
 * api/sugestao-producao.ts (ver comentários lá para o porquê da chave só
 * existir no servidor e do alias de modelo "latest").
 *
 * Frontend chama este endpoint via src/lib/insightsCatalogo.ts — nunca
 * chama o Gemini diretamente do navegador.
 */

// Ver comentário completo sobre o alias "latest" e o retry para 429/503 em
// api/sugestao-producao.ts — mesma decisão, mesma lógica, duplicada aqui de
// propósito (funções serverless são arquivos independentes neste projeto).
const MODELO_GEMINI = "gemini-flash-latest";

export async function chamarGeminiComRetry(url: string, corpoRequisicao: unknown, maxTentativas = 2): Promise<Response> {
  let respostaMaisRecente: Response | undefined;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpoRequisicao),
    });
    if (resposta.ok) return resposta;

    respostaMaisRecente = resposta;
    const transitorio = resposta.status === 503 || resposta.status === 429;
    if (!transitorio || tentativa === maxTentativas) return resposta;

    await esperar(800 * tentativa); // 800ms na 1ª espera, cresce se maxTentativas for chamado com um valor maior
  }
  return respostaMaisRecente!;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ResumoProdutoParaInsights {
  codigoPdv: number;
  nome: string;
  categoria: string;
  diasDesdeUltimaProducao: number | null;
  totalProduzidoUnidades: number;
  totalPerdidoUnidades: number;
  perdaPorSobraUnidades: number;
  taxaPerdaPercentual: number | null;
}

interface RequisicaoInsights {
  resumo?: ResumoProdutoParaInsights[];
  padroes?: PadroesParaInsights;
}

// Tipagem mínima e deliberadamente solta (evita depender de @types/node ou
// @vercel/node só para isto) — o runtime do Vercel injeta req/res
// compatíveis com http.IncomingMessage / http.ServerResponse + helpers.
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido — use POST." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      erro:
        "Insights por IA ainda não configurados: falta a variável de ambiente GEMINI_API_KEY no Vercel " +
        "(Settings > Environment Variables, depois faça um novo deploy).",
    });
    return;
  }

  const corpo: RequisicaoInsights = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const { resumo, padroes } = corpo;

  if (!Array.isArray(resumo) || resumo.length === 0) {
    res.status(400).json({ erro: "Payload inválido — informe resumo (lista de produtos)." });
    return;
  }

  try {
    const prompt = montarPrompt(resumo, padroes);

    const respostaGemini = await chamarGeminiComRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }
    );

    if (!respostaGemini.ok) {
      const detalhe = await respostaGemini.text();
      const sobrecarregado = respostaGemini.status === 503 || respostaGemini.status === 429;
      res.status(502).json({
        erro: sobrecarregado
          ? "O serviço de IA do Gemini está temporariamente sobrecarregado (já tentamos de novo automaticamente) — tente novamente em alguns minutos."
          : `Gemini respondeu com erro (HTTP ${respostaGemini.status}).`,
        detalhe,
      });
      return;
    }

    const dados = await respostaGemini.json();
    const textoGerado: string | undefined = dados?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textoGerado) {
      res.status(502).json({ erro: "Resposta do Gemini veio sem conteúdo utilizável." });
      return;
    }

    let corpoResposta: unknown;
    try {
      corpoResposta = JSON.parse(textoGerado);
    } catch {
      res.status(502).json({ erro: "Não foi possível interpretar a resposta do Gemini como JSON.", bruto: textoGerado });
      return;
    }

    const insights = extrairInsights(corpoResposta);
    res.status(200).json({ insights });
  } catch (erro) {
    res.status(500).json({ erro: "Erro inesperado ao gerar insights.", detalhe: String(erro) });
  }
}

/**
 * Padrões calculados na tela e mandados junto (ago/2026). Sem eles a IA
 * só fala de produto isolado; a pergunta do dono do negócio é sobre
 * PADRÃO — que dia, que semana, e o que fazer a respeito.
 */
interface PadroesParaInsights {
  porDiaDaSemana?: { rotulo: string; valor: number | null; produzido: number; perdido: number }[];
  porSemanaDoMes?: { rotulo: string; valor: number | null; produzido: number; perdido: number }[];
  taxaGeral?: number | null;
  janelaDias?: number;
}

function montarPrompt(resumo: ResumoProdutoParaInsights[], padroes?: PadroesParaInsights): string {
  const blocoPadroes = padroes
    ? `
Padrões agregados que o dono do negócio está vendo na tela agora (janela de ${padroes.janelaDias ?? 30} dias,
taxa de perda geral do período: ${padroes.taxaGeral ?? "sem produção"}%):

Taxa de perda por DIA DA SEMANA (valor = percentual; null = sem produção naquele dia):
${JSON.stringify(padroes.porDiaDaSemana ?? [])}

Taxa de perda por SEMANA DO MÊS (1ª = dias 1-7, 2ª = 8-14, e assim por diante):
${JSON.stringify(padroes.porSemanaDoMes ?? [])}
`
    : "";

  return `Você é um analista de operações de uma padaria de bairro, revisando o catálogo de produtos e o
histórico recente de produção/perda para apontar padrões que ajudem o dono do negócio a decidir melhor
quanto produzir de cada item.
${blocoPadroes}

Resumo por produto (últimos ~60 dias, só produtos ativos das categorias de produção):
${JSON.stringify(resumo)}

Cada item tem: codigoPdv, nome, categoria, diasDesdeUltimaProducao (null = nunca apareceu num plano
confirmado no histórico disponível), totalProduzidoUnidades, totalPerdidoUnidades (todos os motivos),
perdaPorSobraUnidades (subconjunto de totalPerdidoUnidades com motivo "sobra não vendida" — indica
excesso de produção, não erro de forno) e taxaPerdaPercentual (null se não produzido no período).

Tarefa: gere até 8 insights ACIONÁVEIS e ESPECÍFICOS (cite o produto pelo nome), priorizando nesta ordem:
1) Produtos com perdaPorSobraUnidades alta relativa ao totalProduzidoUnidades — sinal de que está sendo
   produzido além do que vende, sobrando e sendo descartado.
2) Produtos ativos com diasDesdeUltimaProducao alto (ex.: acima de 14) — ativos no cronograma mas parados
   há muito tempo, o que pode ser esquecimento ou falta de demanda que ninguém formalizou.
3) DIA DA SEMANA ou SEMANA DO MÊS fora da curva, quando esses dados vierem. Se um dia desperdiça
   bem mais que os outros, o cronograma daquele dia provavelmente está superdimensionado — diga qual dia,
   a diferença em pontos percentuais, e sugira o ajuste (ex.: "reduzir a produção de terça em X%").
   Compare sempre com a média dos outros dias, nunca com o dia de menor perda isoladamente.
4) Qualquer outro padrão útil visível nos números (ex.: taxa de perda geral muito alta num produto mesmo
   sem ser por sobra, uma categoria inteira com comportamento fora do padrão).

Regras: baseie-se SOMENTE nos números fornecidos, nunca invente causa raiz (sugira hipóteses com
linguagem de possibilidade, não certeza). Sempre que apontar um problema, diga o que fazer a respeito —
um insight sem próximo passo não ajuda quem está tocando a padaria. Ignore dia ou semana com pouquíssima
produção: percentual sobre base pequena é ruído, não padrão. Se os dados forem insuficientes para qualquer insight
confiável, retorne uma lista vazia — não force insight artificial. Classifique cada insight como
"atencao" (pede alguma ação ou decisão do dono) ou "informativo" (só contexto útil, sem ação urgente).

Responda SOMENTE com um JSON válido, sem nenhum texto antes ou depois, no formato exato:
{"insights": [{"tipo": "atencao", "titulo": "frase curta", "detalhe": "1-2 frases explicando o padrão e uma sugestão"}]}`;
}

function extrairInsights(corpo: unknown): Array<{ tipo: "atencao" | "informativo"; titulo: string; detalhe: string }> {
  if (!corpo || typeof corpo !== "object" || !Array.isArray((corpo as any).insights)) {
    return [];
  }
  return (corpo as any).insights
    .filter((i: any) => i && typeof i.titulo === "string" && typeof i.detalhe === "string")
    .map((i: any) => ({
      tipo: i.tipo === "atencao" ? "atencao" : "informativo",
      titulo: i.titulo,
      detalhe: i.detalhe,
    }));
}
