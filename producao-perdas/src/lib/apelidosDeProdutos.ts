/**
 * src/lib/apelidosDeProdutos.ts
 * ---------------------------------------------------------------
 * O nome que o cliente fala não é o nome que está no cadastro
 * (ago/2026 — observação do dono do negócio: "pão de sal é igual pão
 * francês").
 *
 * O cadastro veio do PDV e usa o nome fiscal. O balcão usa o nome da
 * região. Em Minas ninguém pede "pão francês": pede pão de sal. Sem uma
 * tradução, o assistente de voz responde "não achei nenhum produto" para
 * o item mais vendido da casa — e o operador conclui, com razão, que a
 * ferramenta não serve.
 *
 * DUAS TRAVAS, PORQUE APELIDO ERRADO VIRA ENTREGA ERRADA
 * -------------------------------------------------------
 * 1. A troca só vale quando o que foi dito NÃO É, ele mesmo, um produto
 *    do catálogo. Se um dia existir um cadastro chamado "PÃO DE SAL", ele
 *    ganha do apelido — o cadastro é sempre a verdade.
 * 2. A troca só vale quando o destino EXISTE no catálogo. Apontar para um
 *    produto que não está cadastrado não ajudaria ninguém, e mascararia
 *    um cadastro faltando.
 *
 * COMO CRESCER ESTA LISTA: acrescente uma linha. Ela é deliberadamente
 * pequena e explícita — cada apelido aqui foi confirmado por quem atende
 * no balcão, e nenhum foi deduzido. Apelido inventado é pedido errado.
 */

import { paraBusca, radicalDaFrase } from "./texto";

export interface ApelidoDeProduto {
  /** Como se fala no balcão. */
  dito: string;
  /** Nome do catálogo para onde isso aponta. */
  catalogo: string;
}

export const APELIDOS: ApelidoDeProduto[] = [
  { dito: "PAO DE SAL", catalogo: "PAO FRANCES" },
  { dito: "PAOZINHO", catalogo: "PAO FRANCES" },
  { dito: "PAO CARECA", catalogo: "PAO FRANCES" },
];

/**
 * Conectivos que somem dos dois lados antes de comparar.
 *
 * O trecho falado chega aqui já sem eles (quem tira é `soONome`), então
 * o apelido precisa perder os seus também: senão "PAO DE SAL" nunca
 * encontraria "PAO SAL", que é o que sobra da frase.
 */
const CONECTIVOS = ["DE", "DO", "DA", "DOS", "DAS"];

/** Forma em que apelido e fala se encontram: radical, sem conectivo. */
function paraComparar(texto: string): string {
  return radicalDaFrase(paraBusca(texto))
    .split(/\s+/)
    .filter((p) => p.length > 0 && !CONECTIVOS.includes(p))
    .join(" ");
}

/**
 * Troca os apelidos ditos pelos nomes do catálogo.
 *
 * Recebe o trecho JÁ reduzido a radicais e sem conectivos, e a lista de
 * nomes do catálogo — que é quem decide se a troca vale. Os apelidos
 * mais longos vão primeiro: senão um apelido curto comeria um pedaço de
 * um mais longo e sobraria lixo no meio da frase.
 */
export function trocarApelidos(trecho: string, nomes: string[]): string {
  const doCatalogo = nomes.map((n) => paraComparar(n));
  const existe = (termo: string) => doCatalogo.includes(paraComparar(termo));

  const ordenados = [...APELIDOS]
    .map((a) => ({ dito: paraComparar(a.dito), catalogo: a.catalogo, cru: a.dito }))
    .sort((a, b) => b.dito.length - a.dito.length);

  let saida = ` ${trecho} `;
  for (const apelido of ordenados) {
    if (existe(apelido.cru)) continue; // trava 1: o cadastro sempre ganha
    if (!existe(apelido.catalogo)) continue; // trava 2: o destino tem de existir
    saida = saida.replace(
      new RegExp(`(^|\\s)${apelido.dito}(\\s|$)`, "g"),
      ` ${paraComparar(apelido.catalogo)} `
    );
  }
  return saida.replace(/\s+/g, " ").trim();
}
