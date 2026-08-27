/**
 * src/lib/rota.ts
 * ---------------------------------------------------------------
 * Qual aba abrir quando alguém toca num aviso (ago/2026).
 *
 * O PROBLEMA
 * -----------
 * Tocar no push abria o app na última aba usada. A filial recebia "PÃO
 * FRANCÊS — disponível para pedidos", tocava, e caía no Cronograma. O
 * aviso avisava e não levava a lugar nenhum: quem quisesse pedir tinha
 * que descobrir sozinho onde era.
 *
 * Agora o servidor manda o destino junto do aviso (`data.url`), o service
 * worker repassa, e isto traduz a URL em aba. Módulo puro para o
 * mapeamento poder ser verificado sem navegador — ver
 * scripts/verificar_logica.ts.
 */

/** As abas que um aviso pode endereçar. Nem toda aba é destino válido. */
const ABAS_ENDERECAVEIS = ["fornada", "cronograma", "perdas", "pedido", "analises"] as const;

export type AbaEnderecavel = (typeof ABAS_ENDERECAVEIS)[number];

/**
 * Lê `?aba=` de uma URL (absoluta ou relativa) e devolve a aba, ou `null`
 * quando não há destino reconhecível.
 *
 * Devolver `null` para valor desconhecido é deliberado: um aviso antigo
 * na bandeja, ou uma URL adulterada, não pode levar o app a um estado que
 * ele não sabe renderizar. Sem destino, fica onde estava.
 */
export function abaDaUrl(url: string): AbaEnderecavel | null {
  const consulta = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  if (!consulta) return null;
  const valor = new URLSearchParams(consulta).get("aba");
  if (!valor) return null;
  return (ABAS_ENDERECAVEIS as readonly string[]).includes(valor)
    ? (valor as AbaEnderecavel)
    : null;
}

/** Caminho que o servidor manda no aviso para levar a uma aba. */
export function urlDaAba(aba: AbaEnderecavel): string {
  return `/?aba=${aba}`;
}
