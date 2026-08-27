/**
 * Modelo de dados — Fila de impressão no caixa
 *
 * A impressora térmica do caixa é USB, ligada ao PC — não tem rede.
 * O celular não consegue falar com ela diretamente: o Safari do iPhone
 * bloqueia uma página HTTPS de chamar um endereço `http://192.168.x.x`
 * da rede local, sem contorno confiável (verificado ago/2026).
 *
 * Então o caminho é indireto: o celular grava o trabalho aqui, e um
 * programinha rodando no PC do caixa busca, imprime e marca como feito.
 * Como o Firestore já existe para as três lojas, a fila mora nele — não
 * há serviço novo para contratar nem manter.
 *
 * UM DOCUMENTO POR IMAGEM. O Firestore limita cada documento a 1 MiB, e
 * a imagem viaja em base64 (que engorda ~33%): uma fita de 260KB vira
 * ~350KB, com folga, mas uma fita dividida em três partes estouraria se
 * fosse tudo num documento só. Além disso, dividir deixa cada parte
 * imprimir e falhar por conta própria.
 */

export type StatusImpressao = "pendente" | "impresso" | "erro";

/** Acima disto o documento se aproxima do limite do Firestore. */
export const LIMITE_BASE64_BYTES = 700_000;

export interface TrabalhoImpressao {
  id: string;
  /** Loja que mandou imprimir — hoje sempre a matriz (é onde fica a impressora). */
  lojaId: string;
  /** Nome do documento, exibido no log do agente: "Lista de Produção", "Separação — ...". */
  documento: string;
  nomeArquivo: string;
  parte: number;
  totalPartes: number;
  /** PNG em base64, SEM o prefixo "data:image/png;base64,". */
  imagemBase64: string;
  status: StatusImpressao;
  criadoPor: string;
  criadoEm: string; // ISO 8601 datetime
  impressoEm?: string;
  erro?: string;
}

/** Erro de domínio — sempre com mensagem apresentável ao operador. */
/**
 * O que o agente do caixa respondeu sobre um trabalho enviado. Só os
 * campos que a tela precisa — a imagem em base64 é grande e não tem uso
 * nenhum depois de enviada.
 */
export interface EstadoTrabalhoImpressao {
  id: string;
  status: StatusImpressao;
  /** Preenchido pelo agente quando a impressão falha. */
  erro?: string;
}

/**
 * Traduz o desfecho do conjunto de trabalhos para uma frase de operador.
 *
 * O caso `null` é o que mais importa e o menos óbvio: nada respondeu
 * dentro do tempo. Na prática isso quer dizer que o programa do caixa
 * está fechado — foi exatamente o que aconteceu no primeiro dia de uso, e
 * ninguém tinha como saber olhando a tela.
 */
export function resumoDaImpressao(
  estados: EstadoTrabalhoImpressao[],
  total: number
): { pronto: boolean; sucesso: boolean; texto: string } {
  const comErro = estados.filter((e) => e.status === "erro");
  const impressos = estados.filter((e) => e.status === "impresso");

  if (comErro.length > 0) {
    const motivo = comErro[0].erro?.trim();
    return {
      pronto: true,
      sucesso: false,
      texto: motivo
        ? `A impressora do caixa recusou: ${motivo}`
        : "A impressora do caixa recusou o trabalho.",
    };
  }

  if (impressos.length >= total) {
    return {
      pronto: true,
      sucesso: true,
      texto: total > 1 ? `Impresso no caixa — ${total} partes.` : "Impresso no caixa.",
    };
  }

  return { pronto: false, sucesso: false, texto: "" };
}

export class ErroImpressao extends Error {}

/**
 * Extrai o base64 puro de um data URL de canvas e recusa o que não
 * caberia no documento. Falhar aqui, com mensagem clara, é muito melhor
 * que deixar o Firestore recusar a gravação com um erro genérico depois
 * que o operador já achou que mandou imprimir.
 */
export function base64DoDataUrl(dataUrl: string, nomeArquivo: string): string {
  const separador = dataUrl.indexOf(",");
  if (separador < 0) {
    throw new ErroImpressao("Não foi possível preparar a imagem para impressão.");
  }
  const base64 = dataUrl.slice(separador + 1);
  if (base64.length > LIMITE_BASE64_BYTES) {
    throw new ErroImpressao(
      `A imagem "${nomeArquivo}" ficou grande demais para a fila de impressão. Envie por WhatsApp desta vez e me avise.`
    );
  }
  return base64;
}
