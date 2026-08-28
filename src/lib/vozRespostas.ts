/**
 * src/lib/vozRespostas.ts
 * ---------------------------------------------------------------
 * Entender a QUANTIDADE dita, do jeito que as pessoas falam (ago/2026).
 *
 * Já foi maior: havia aqui também o "sim/não" e o "enviar/descartar" de
 * um diálogo em que o app perguntava em voz alta e esperava resposta
 * falada. Esse diálogo foi retirado — era lento e o microfone abria e
 * fechava cinco vezes numa operação só. Hoje a pessoa fala UMA frase e
 * confirma com um toque, e o único trecho de fala que ainda precisa ser
 * interpretado é o número.
 *
 * Função PURA — ver scripts/verificar_logica.ts.
 *
 * NÃO ADIVINHA: sem número reconhecível, devolve `null` e a tela pede o
 * número. Numa operação que dispara pedido para a matriz, chutar a
 * quantidade é pior que perguntar.
 */

import { paraBusca } from "./texto";

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
