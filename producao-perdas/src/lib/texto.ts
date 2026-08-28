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

/** True quando `termo` aparece em `texto`, ignorando acento e caixa. */
export function contemBusca(texto: string, termo: string): boolean {
  return paraBusca(texto).includes(paraBusca(termo));
}
