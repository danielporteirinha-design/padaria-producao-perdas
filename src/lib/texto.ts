/**
 * src/lib/texto.ts
 * ---------------------------------------------------------------
 * Comparação de texto para BUSCA (ago/2026).
 *
 * O defeito que motivou este arquivo: a busca de produtos era sensível a
 * acento. Digitar "pao" não achava "PÃO FRANCÊS", e "fuba" não achava
 * "BOLO DE FUBÁ" — a tela respondia "nenhum produto encontrado" para um
 * produto que estava lá.
 *
 * Ninguém digita acento procurando às pressas. No teclado do celular o
 * "ã" exige segurar a tecla e escolher numa listinha, com a mão ocupada,
 * no meio do expediente. Exigir isso na busca é o mesmo que não ter
 * busca — e o operador conclui, com razão, que o recurso não funciona.
 */

/**
 * Deixa o texto comparável: sem acento, em maiúsculas, sem espaço
 * sobrando nas pontas.
 *
 * `normalize("NFD")` separa a letra do acento ("ã" vira "a" + "~"), e o
 * replace remove os acentos soltos. É o caminho padrão, sem tabela de
 * substituição para manter — vale para ç, ü, â e o que mais aparecer.
 */
export function paraBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Um passo de singularização, nas regras de plural do português.
 *
 * Roda sobre o texto JÁ sem acento (é `paraBusca` quem tira), por isso as
 * regras olham "AES" e não "ÃES".
 *
 * A ordem importa: "PAES" termina em "ES", mas é a regra do "ÃES" que
 * vale — senão viraria "PAE" em vez de "PAO".
 */
function umPasso(palavra: string): string {
  if (palavra.length < 4) return palavra;

  // pães→pão, aviões→avião, irmãos→irmão
  if (/(OES|AES|AOS)$/.test(palavra)) return `${palavra.slice(0, -3)}AO`;

  // pastéis→pastel, papéis→papel. Mínimo de 5 letras para não pegar
  // "REIS", que é plural de "REI" e não de "REL".
  if (palavra.length >= 5 && /EIS$/.test(palavra)) return `${palavra.slice(0, -3)}EL`;

  // funis→funil, barris→barril
  if (/IS$/.test(palavra)) return `${palavra.slice(0, -2)}IL`;

  // pudins→pudim, armazéns→armazém
  if (/NS$/.test(palavra)) return `${palavra.slice(0, -2)}M`;

  // flores→flor, luzes→luz, franceses→frances. Só depois de R, Z ou S:
  // "DOCES" tem C antes do "ES" e vira "DOCE", não "DOC".
  if (/[RZS]ES$/.test(palavra)) return palavra.slice(0, -2);

  // sovados→sovado, bolos→bolo
  if (/S$/.test(palavra)) return palavra.slice(0, -1);

  return palavra;
}

/**
 * O RADICAL de uma palavra — a forma em que singular e plural coincidem.
 *
 * O DEFEITO QUE ISTO RESOLVE (ago/2026): quem pede fala no plural.
 * "pães sovados" não achava "PÃO SOVADO", e "queijos" não achava "PÃO DE
 * QUEIJO" — nem por voz nem digitando. Para a pessoa no balcão o produto
 * simplesmente não existia.
 *
 * NÃO É DICIONÁRIO, E NÃO PRECISA SER. O radical é aplicado NOS DOIS
 * LADOS da comparação, então ele não precisa produzir uma palavra que
 * exista: precisa só levar singular e plural ao MESMO lugar. "LAPIS"
 * virar "LAPIL" é inofensivo, porque o cadastro vira "LAPIL" também.
 *
 * O passo roda duas vezes por causa do plural duplo: "FRANCESES" vira
 * "FRANCES" no primeiro e "FRANCE" no segundo — que é onde "FRANCES"
 * também chega. Sem a segunda passada, "pães franceses" não acharia
 * "PÃO FRANCÊS", que é o produto mais vendido da casa.
 */
export function radical(palavra: string): string {
  return umPasso(umPasso(palavra));
}

/** Frase inteira reduzida a radicais, palavra por palavra. */
export function radicalDaFrase(texto: string): string {
  return texto
    .split(/\s+/)
    .map((palavra) => radical(palavra))
    .join(" ");
}

/**
 * True quando `termo` aparece em `texto`, ignorando acento, caixa E
 * número (singular/plural).
 *
 * A comparação é feita sobre os radicais dos dois lados, então "pães"
 * acha "PÃO FRANCÊS" e "queijos" acha "PÃO DE QUEIJO" — sem que a busca
 * por trecho pare de funcionar: quem digita "franc" continua achando,
 * porque "FRANC" não é plural de nada e passa intacto.
 */
export function contemBusca(texto: string, termo: string): boolean {
  const alvo = paraBusca(texto);
  const procurado = paraBusca(termo);
  if (alvo.includes(procurado)) return true;
  return radicalDaFrase(alvo).includes(radicalDaFrase(procurado));
}
