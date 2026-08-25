/**
 * api/sugestao-producao.ts
 * ---------------------------------------------------------------
 * Função serverless (Vercel detecta e publica automaticamente qualquer
 * arquivo dentro de /api — nenhuma configuração extra é necessária).
 *
 * Único ponto do sistema que fala com a API do Gemini. A chave
 * (GEMINI_API_KEY) fica só aqui, como variável de ambiente do servidor
 * (Vercel > Settings > Environment Variables) — NUNCA prefixada com
 * VITE_, porque qualquer env var com esse prefixo é embutida no bundle
 * público do front-end. Se a chave estiver ausente, a função responde
 * com um erro claro em vez de tentar chamar o Gemini sem credencial.
 *
 * Frontend chama este endpoint via src/lib/sugestaoProducao.ts — nunca
 * chama o Gemini diretamente do navegador.
 */

const MODELO_GEMINI = "gemini-2.0-flash";

interface ItemHistoricoProducao {
  codigoPdv: number;
  nome: string;
  data: string;
  diaDaSemana: string;
  quantidadeProduzida: number;
  quantidadePerdidaUnidades: number;
}

interface RequisicaoSugestao {
  diaDaSemana?: string;
  categoria?: string;
  historico?: ItemHistoricoProducao[];
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
        "Sugestão por IA ainda não configurada: falta a variável de ambiente GEMINI_API_KEY no Vercel " +
        "(Settings > Environment Variables, depois faça um novo deploy).",
    });
    return;
  }

  const corpo: RequisicaoSugestao = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const { diaDaSemana, categoria, historico } = corpo;

  if (!diaDaSemana || !categoria || !Array.isArray(historico)) {
    res.status(400).json({ erro: "Payload inválido — informe diaDaSemana, categoria e historico." });
    return;
  }

  try {
    const prompt = montarPrompt(diaDaSemana, categoria, historico);

    const respostaGemini = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      }
    );

    if (!respostaGemini.ok) {
      const detalhe = await respostaGemini.text();
      res.status(502).json({ erro: `Gemini respondeu com erro (HTTP ${respostaGemini.status}).`, detalhe });
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

    const sugestoes = extrairSugestoes(corpoResposta);
    res.status(200).json({ sugestoes });
  } catch (erro) {
    res.status(500).json({ erro: "Erro inesperado ao gerar sugestão.", detalhe: String(erro) });
  }
}

function montarPrompt(diaDaSemana: string, categoria: string, historico: ItemHistoricoProducao[]): string {
  return `Você é um assistente de planejamento de produção de uma padaria de bairro.

Categoria de produtos: ${categoria}
Dia da semana a planejar (produção de amanhã): ${diaDaSemana}

Histórico recente de produção e perda desta categoria (um item por produto/dia, mais recente primeiro):
${JSON.stringify(historico)}

Cada item do histórico tem: codigoPdv, nome, data, diaDaSemana, quantidadeProduzida (unidades planejadas
naquele dia) e quantidadePerdidaUnidades (unidades perdidas/descartadas naquele dia, estimadas a partir do
peso pesado na balança).

Tarefa: para cada produto que aparece no histórico desta categoria, sugira a quantidade em UNIDADES
INTEIRAS a produzir amanhã (${diaDaSemana}). Priorize:
1) dias da semana iguais a "${diaDaSemana}" no histórico (padrão de demanda semanal);
2) reduzir a perda percentual média observada, sem faltar produto (não zere a produção de um item só
   porque ele perdeu alguma coisa — ajuste a quantidade, não elimine o item, a menos que o histórico
   mostre perda de 100% consistentemente).

Se não houver dados suficientes para um produto, não o inclua na resposta (não invente número).

Responda SOMENTE com um JSON válido, sem nenhum texto antes ou depois, no formato exato:
{"sugestoes": [{"codigoPdv": 123, "quantidadeSugerida": 40, "justificativa": "frase curta"}]}`;
}

function extrairSugestoes(corpo: unknown): Array<{ codigoPdv: number; quantidadeSugerida: number; justificativa?: string }> {
  if (!corpo || typeof corpo !== "object" || !Array.isArray((corpo as any).sugestoes)) {
    return [];
  }
  return (corpo as any).sugestoes
    .filter((s: any) => s && Number.isFinite(s.codigoPdv) && Number.isFinite(s.quantidadeSugerida))
    .map((s: any) => ({
      codigoPdv: Number(s.codigoPdv),
      quantidadeSugerida: Math.max(0, Math.round(Number(s.quantidadeSugerida))),
      justificativa: typeof s.justificativa === "string" ? s.justificativa : undefined,
    }));
}
