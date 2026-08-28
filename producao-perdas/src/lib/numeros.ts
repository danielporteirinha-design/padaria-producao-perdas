/**
 * src/lib/numeros.ts
 * ---------------------------------------------------------------
 * Sanitização de entrada numérica — protege as textboxes de quantidade
 * contra erro de digitação (letras, símbolos, múltiplos separadores
 * decimais). Usado com <input type="text" inputMode="decimal"> em vez de
 * type="number" porque o comportamento de type="number" varia entre
 * navegadores/teclados mobile (aceita "e", "+", "-" em alguns).
 */

/** Filtra a string digitada, mantendo só dígitos e UM separador decimal. */
export function sanitizarEntradaNumerica(valor: string): string {
  let limpo = valor.replace(/[^0-9.,]/g, "");
  const posSeparador = limpo.search(/[.,]/);
  if (posSeparador !== -1) {
    const antes = limpo.slice(0, posSeparador + 1);
    const depois = limpo.slice(posSeparador + 1).replace(/[.,]/g, "");
    limpo = antes + depois;
  }
  return limpo;
}

export function paraNumero(valor: string): number {
  return Number(valor.replace(",", "."));
}

export function ehNumeroValidoPositivo(valor: string): boolean {
  if (valor.trim() === "") return false;
  const n = paraNumero(valor);
  return Number.isFinite(n) && n > 0;
}
