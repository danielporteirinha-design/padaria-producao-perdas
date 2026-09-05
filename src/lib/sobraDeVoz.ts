/**
 * src/lib/sobraDeVoz.ts
 * ---------------------------------------------------------------
 * Sugestões de nome e quantidade a partir de um trecho que o microfone
 * ouviu e não bateu com nenhum item do catálogo (herdado de Suprimentos,
 * set/2026; extraído para cá quando o mesmo cadastro relâmpago passou a
 * valer também na Lista de Produção — filial e matriz).
 *
 * Compartilhado porque a regra é sempre a mesma, em qualquer tela que
 * ofereça "cadastrar direto do que a voz não reconheceu": tirar número e
 * palavra de medida do trecho ditado deixa só o nome do item, pronto
 * para sugerir no campo de cadastro — sem obrigar quem falou a repetir
 * escrevendo.
 */
import { ehNumeroValidoPositivo, paraNumero } from "./numeros";

const PALAVRAS_DE_QUANTIDADE = [
  "UNIDADES",
  "UNIDADE",
  "UN",
  "PECAS",
  "PECA",
  "ITENS",
  "ITEM",
  "DUZIA",
  "DUZIAS",
];

/** "polpa de frutas" -> "Polpa De Frutas" — só para sugerir um nome
 * legível a partir do que o microfone ouviu. */
export function capitalizarNome(bruto: string): string {
  return bruto
    .trim()
    .split(/\s+/)
    .map((parte) => (parte.length > 0 ? parte[0].toUpperCase() + parte.slice(1).toLowerCase() : parte))
    .join(" ");
}

/**
 * SÓ O QUE MEDE, PARA SUGERIR O NOME. Tira número e palavra de
 * quantidade do que o microfone ouviu, mas MANTÉM "de/da/do": o texto
 * vira o nome do item que vai para o catálogo, e sem a preposição "saco
 * de papel" viraria o errado "saco papel".
 */
export function nomeSugeridoDaSobra(trecho: string): string {
  const palavras = trecho
    .replace(/\d+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0 && !PALAVRAS_DE_QUANTIDADE.includes(p.toUpperCase()));
  return capitalizarNome(palavras.join(" "));
}

/** A quantidade já foi dita — não pedir de novo. */
export function quantidadeSugeridaDaSobra(trecho: string): number | null {
  const encontrado = trecho.match(/\d+(?:[.,]\d+)?/);
  if (!encontrado || !ehNumeroValidoPositivo(encontrado[0])) return null;
  return paraNumero(encontrado[0]);
}
