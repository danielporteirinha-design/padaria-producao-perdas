/**
 * src/lib/vozRespostas.ts
 * ---------------------------------------------------------------
 * Entender o que a pessoa respondeu ao microfone (ago/2026).
 *
 * O ANÚNCIO DE MÃOS LIVRES
 * -------------------------
 * Anunciar uma fornada é a ação mais repetida do dia na matriz, e é feita
 * com as mãos ocupadas: massa, farinha, forma quente. Cada toque na tela
 * é um par de mãos que precisa parar, limpar e voltar. Por isso existe um
 * diálogo em que o app pergunta e a pessoa responde falando — do nome do
 * produto até o "pode enviar".
 *
 * Para isso funcionar, três coisas precisam ser entendidas do jeito que
 * as pessoas realmente falam, e não do jeito que um formulário aceita.
 * São as três funções deste arquivo, todas PURAS — ver
 * scripts/verificar_logica.ts.
 *
 * NADA AQUI ADIVINHA. Quando a resposta não é reconhecível, todas
 * devolvem `null` e quem chamou pergunta de novo. Numa operação em que a
 * resposta dispara um aviso para três lojas, chutar é pior que repetir a
 * pergunta.
 */

import { paraBusca } from "./texto";

/** Palavras que valem "sim". Curtas de propósito: fala rápida, com ruído. */
const SIM = [
  "SIM",
  "ISSO",
  "ISSO MESMO",
  "CONFIRMA",
  "CONFIRMADO",
  "CONFIRMAR",
  "CORRETO",
  "CERTO",
  "EXATO",
  "POSITIVO",
  "PODE",
  "PODE SER",
  "OK",
  "TA",
  "TA CERTO",
  "E ESSE",
  "E ESSE MESMO",
  "AHAM",
  "UHUM",
];

const NAO = [
  "NAO",
  "NAO E",
  "NEGATIVO",
  "ERRADO",
  "NAO E ESSE",
  "OUTRO",
  "TROCA",
  "TROCAR",
  "CANCELA",
  "CANCELAR",
  "DESCARTA",
  "DESCARTAR",
  "DE NOVO",
  "REPETE",
  "REPETIR",
];

/**
 * `true` para sim, `false` para não, `null` para o que não dá para
 * afirmar.
 *
 * Compara a frase INTEIRA normalizada antes de procurar palavra solta:
 * "não é esse" contém "é esse", e uma busca ingênua por conteúdo leria
 * uma negação como confirmação — trocando o produto anunciado para as
 * três lojas.
 */
export function entenderSimOuNao(falado: string): boolean | null {
  const texto = paraBusca(falado).replace(/[.,!?]/g, "").trim();
  if (!texto) return null;

  if (NAO.includes(texto)) return false;
  if (SIM.includes(texto)) return true;

  // A negação é procurada primeiro: quem diz "não, é o outro" está
  // negando, e a palavra "é" apareceria como confirmação.
  const palavras = texto.split(/\s+/);
  if (palavras.some((p) => p === "NAO" || p === "ERRADO" || p === "NEGATIVO")) return false;
  if (palavras.some((p) => SIM.includes(p))) return true;
  return null;
}

/** Palavras que encerram o diálogo sem enviar nada. */
const DESCARTE = ["DESCARTA", "DESCARTAR", "CANCELA", "CANCELAR", "ESQUECE", "PARA", "PARAR", "SAIR"];

/** Palavras que mandam enviar. */
/**
 * "SIM" NÃO ESTÁ AQUI, de propósito. A pergunta é "enviar ou descartar?",
 * e "sim" não responde a nenhuma das duas — mas o reconhecedor devolve
 * "sim" com frequência para qualquer resmungo. Aceitá-lo faria um "acho
 * que sim, né" disparar aviso para as três lojas.
 */
const ENVIO = ["ENVIA", "ENVIAR", "MANDA", "MANDAR", "AVISA", "AVISAR", "PODE ENVIAR"];

/**
 * A última pergunta do diálogo: enviar ou descartar.
 *
 * É deliberadamente uma pergunta SEPARADA do "sim/não" acima. Aqui a
 * resposta dispara um aviso para as três lojas, e "sim" a uma pergunta
 * mal ouvida não pode significar "envie". Só palavra de envio envia.
 */
export function entenderEnvioOuDescarte(falado: string): "enviar" | "descartar" | null {
  const texto = paraBusca(falado).replace(/[.,!?]/g, "").trim();
  if (!texto) return null;
  const palavras = texto.split(/\s+/);
  if (DESCARTE.includes(texto) || palavras.some((p) => DESCARTE.includes(p))) return "descartar";
  if (palavras.some((p) => p === "NAO")) return "descartar";
  if (ENVIO.includes(texto) || palavras.some((p) => ENVIO.includes(p))) return "enviar";
  return null;
}

/** Números por extenso, do jeito que se fala uma quantidade de fornada. */
const UNIDADES: Record<string, number> = {
  UM: 1, UMA: 1, DOIS: 2, DUAS: 2, TRES: 3, QUATRO: 4, CINCO: 5, SEIS: 6, MEIA: 6,
  SETE: 7, OITO: 8, NOVE: 9, DEZ: 10, ONZE: 11, DOZE: 12, TREZE: 13, CATORZE: 14,
  QUATORZE: 14, QUINZE: 15, DEZESSEIS: 16, DEZESSETE: 17, DEZOITO: 18, DEZENOVE: 19,
};
const DEZENAS: Record<string, number> = {
  VINTE: 20, TRINTA: 30, QUARENTA: 40, CINQUENTA: 50, SESSENTA: 60, SETENTA: 70,
  OITENTA: 80, NOVENTA: 90,
};
const CENTENAS: Record<string, number> = {
  CEM: 100, CENTO: 100, DUZENTOS: 200, TREZENTOS: 300, QUATROCENTOS: 400,
  QUINHENTOS: 500, SEISCENTOS: 600, SETECENTOS: 700, OITOCENTOS: 800, NOVECENTOS: 900,
};

/**
 * A quantidade dita, em número inteiro. `null` quando não há número
 * reconhecível.
 *
 * O reconhecedor do navegador às vezes devolve "40", às vezes "quarenta",
 * e quase sempre com companhia: "quarenta unidades", "são quarenta",
 * "quarenta pães". As duas formas são aceitas, e o texto em volta é
 * ignorado.
 *
 * SÓ INTEIRO POSITIVO. Fornada é contagem de peças; "meia dúzia" tem
 * atalho ("meia" = 6) mas fração não existe aqui, e um zero seria um
 * anúncio de nada.
 */
export function entenderQuantidade(falado: string): number | null {
  const texto = paraBusca(falado).replace(/[.,!?]/g, " ").trim();
  if (!texto) return null;

  // Dígitos vencem: quando o navegador já transcreveu como número, é o
  // que a pessoa viu na tela e é o que ela espera que valha.
  const digitos = texto.match(/\d+/g);
  if (digitos) {
    const valor = Number(digitos.join(""));
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }

  const palavras = texto.split(/\s+/).filter((p) => p !== "E");

  /**
   * "MEIA DÚZIA" é seis, não setenta e dois.
   *
   * `MEIA` sozinha vale 6 (é como se dita a hora e a quantidade no
   * balcão: "meia de pão"), mas diante de "dúzia" ela é METADE. Sem este
   * caso à parte, a soma pegava o 6 e a dúzia multiplicava por 12 — o
   * pedido mais comum da padaria viraria doze vezes o que foi dito.
   */
  const ondeDuzia = palavras.findIndex((p) => p === "DUZIA" || p === "DUZIAS");
  if (ondeDuzia >= 0) {
    const antes = palavras.slice(0, ondeDuzia).filter((p) => p !== "DE");
    const anterior = antes[antes.length - 1];
    if (anterior === "MEIA" || anterior === "MEIO") return 6;
    const quantas = anterior ? (UNIDADES[anterior] ?? 1) : 1;
    return quantas * 12;
  }

  let total = 0;
  let achou = false;
  for (const palavra of palavras) {
    const valor = CENTENAS[palavra] ?? DEZENAS[palavra] ?? UNIDADES[palavra];
    if (valor === undefined) continue;
    total += valor;
    achou = true;
  }
  return achou && total > 0 ? total : null;
}
