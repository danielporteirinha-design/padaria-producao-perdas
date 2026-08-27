/**
 * api/interpretar-busca.ts
 * ---------------------------------------------------------------
 * Traduz o que a pessoa FALOU no nome de um produto do catálogo
 * (ago/2026).
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * O reconhecimento de voz do navegador entrega o que ouviu, não o que a
 * padaria chama as coisas. Ele devolve "pão de queijo grande", "pãozinho
 * francês", "fubá com goiabada" — e a busca por texto, que compara letra
 * por letra, não acha nenhum desses no catálogo, onde estão gravados como
 * "PAO DE QUEIJO CONGELADO GRANDE", "PAO FRANCES" e "BOLO DE FUBA COM
 * GOIABADA". O operador fala certo e o app responde "nenhum produto
 * encontrado", que é a pior resposta possível: parece defeito do
 * operador.
 *
 * O Gemini recebe a transcrição e a lista de nomes REAIS, e escolhe. Não
 * inventa: só pode devolver um dos nomes que mandamos, ou vazio.
 *
 * DEGRADA EM SILÊNCIO, DE PROPÓSITO
 * ----------------------------------
 * Sem chave, com erro, com o serviço fora do ar ou com resposta
 * inesperada, isto devolve `{ termo: "" }` e HTTP 200. O app então usa a
 * transcrição crua como termo de busca, que é o que aconteceria se este
 * endpoint não existisse. Falar continua funcionando; só perde o acerto
 * fino. Um recurso de conveniência não pode derrubar uma busca.
 */

import { chamarGeminiComRetry } from "./sugestao-producao";

const MODELO_GEMINI = "gemini-flash-latest";

/** Teto de nomes enviados ao modelo — o catálogo tem centenas. */
const MAXIMO_CANDIDATOS = 250;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido — use POST." });
    return;
  }

  const corpo: { falado?: string; nomes?: string[] } =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
  const falado = (corpo.falado ?? "").trim();
  const nomes = Array.isArray(corpo.nomes) ? corpo.nomes.slice(0, MAXIMO_CANDIDATOS) : [];

  if (!falado || nomes.length === 0) {
    res.status(200).json({ termo: "" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  // Sem chave não é erro para quem está falando: é só a busca comum.
  if (!apiKey) {
    res.status(200).json({ termo: "", motivo: "sem-chave" });
    return;
  }

  try {
    const resposta = await chamarGeminiComRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: montarPrompt(falado, nomes) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }
    );

    if (!resposta.ok) {
      res.status(200).json({ termo: "", motivo: `http-${resposta.status}` });
      return;
    }

    const dados = await resposta.json();
    const texto: string | undefined = dados?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) {
      res.status(200).json({ termo: "", motivo: "sem-conteudo" });
      return;
    }

    const escolhido = extrairNome(texto);
    // A trava contra invenção: só vale se for EXATAMENTE um dos nomes
    // que mandamos. Modelo que devolve um produto que a padaria não tem
    // levaria a busca a zero resultados, pior que não ter tentado.
    res.status(200).json({ termo: nomes.includes(escolhido) ? escolhido : "" });
  } catch (erro) {
    res.status(200).json({ termo: "", motivo: "excecao", detalhe: String(erro) });
  }
}

function extrairNome(texto: string): string {
  try {
    const objeto = JSON.parse(texto);
    const valor = objeto?.nome;
    return typeof valor === "string" ? valor.trim() : "";
  } catch {
    return "";
  }
}

function montarPrompt(falado: string, nomes: string[]): string {
  return `Você ajuda funcionários de uma padaria a encontrar um produto no catálogo pelo que eles falaram em voz alta, em português do Brasil.

O que a pessoa falou (transcrito automaticamente, pode ter erro de reconhecimento):
"${falado}"

Nomes EXATOS dos produtos cadastrados:
${JSON.stringify(nomes)}

Escolha o produto que a pessoa quis dizer. Considere que:
- o transcritor erra acento, junta e separa palavras;
- a fala é coloquial ("pãozinho", "fubá com goiabada") e o cadastro é formal e em maiúsculas;
- pode faltar parte do nome ("pão de queijo" para "PAO DE QUEIJO CONGELADO GRANDE").

Responda SOMENTE com JSON no formato {"nome": "..."}.
O valor de "nome" tem que ser copiado LETRA POR LETRA de um dos nomes da lista acima.
Se nenhum produto corresponder com clareza, responda {"nome": ""} — é melhor não escolher do que escolher errado.`;
}
