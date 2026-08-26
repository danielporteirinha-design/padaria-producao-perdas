/**
 * Modelo de dados — Fornada pronta
 *
 * Correção de modelo pedida pelo dono do negócio (ago/2026): produto não
 * é "produzido ou não" no dia. Pão francês e biscoito de queijo saem
 * VÁRIAS VEZES ao longo do expediente, e cada fornada é um evento com
 * hora própria.
 *
 * Isso destrava a comunicação entre as lojas, que era o objetivo: a
 * filial fica sabendo que o item saiu do forno AGORA e pede reposição
 * enquanto ainda dá tempo de entregar hoje — informação que a conferência
 * do fim do expediente chega tarde demais para dar.
 *
 * NÃO TEM QUANTIDADE de propósito. Marcar é um toque, e um item que sai
 * seis vezes por dia viraria seis digitações — ninguém faria. O que a
 * filial precisa saber é que saiu e a que horas; quanto ela quer, ela
 * mesma informa no pedido de reposição.
 */

export interface FornadaPronta {
  id: string;
  /** Dia da produção (ISO YYYY-MM-DD) — separado da hora para consulta por dia. */
  data: string;
  codigoPdv: number;
  marcadaPor: string;
  marcadaEm: string; // ISO 8601 datetime — a HORA é o dado que interessa
}

/** Id único por marcação: o mesmo produto sai várias vezes no mesmo dia. */
export function idDaFornada(data: string, codigoPdv: number, marcadaEm: string): string {
  return `${data}_${codigoPdv}_${marcadaEm.replace(/[^0-9]/g, "")}`;
}

/** Fornadas de um produto num dia, da mais recente para a mais antiga. */
export function fornadasDoProduto(
  fornadas: FornadaPronta[],
  data: string,
  codigoPdv: number
): FornadaPronta[] {
  return fornadas
    .filter((f) => f.data === data && f.codigoPdv === codigoPdv)
    .sort((a, b) => b.marcadaEm.localeCompare(a.marcadaEm));
}

/** Hora da última fornada, como "09:12". Vazio se não saiu ainda. */
export function horaDaUltimaFornada(
  fornadas: FornadaPronta[],
  data: string,
  codigoPdv: number
): string {
  const ultima = fornadasDoProduto(fornadas, data, codigoPdv)[0];
  if (!ultima) return "";
  return new Date(ultima.marcadaEm).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Códigos que saíram do forno no dia — base do fechamento pré-marcado. */
export function codigosComFornadaNoDia(fornadas: FornadaPronta[], data: string): Set<number> {
  return new Set(fornadas.filter((f) => f.data === data).map((f) => f.codigoPdv));
}
