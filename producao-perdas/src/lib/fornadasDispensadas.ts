/**
 * src/lib/fornadasDispensadas.ts
 * ---------------------------------------------------------------
 * Avisos de fornada que ESTA loja já resolveu e não quer mais ver
 * (ago/2026).
 *
 * O QUE ISTO É — E O QUE NÃO É
 * -----------------------------
 * Não apaga nada da nuvem. A fornada continua registrada: ela é a
 * matriz dizendo "isto saiu do forno às 9h12", faz parte do histórico do
 * dia e alimenta o relatório do forno em Análises. Quem marca desmarca, e
 * as regras do Firestore só deixam a MATRIZ apagar uma marcação.
 *
 * O que some é o AVISO na lista daquela filial, naquele aparelho. Ao
 * longo do dia essa lista chega a dezenas de itens, a maioria já
 * resolvida — pediu, ou não precisa. Sem uma forma de tirar o que já foi
 * tratado, o que ainda precisa de decisão fica enterrado no meio, e a
 * tela deixa de servir para o que existe.
 *
 * POR APARELHO, E POR DIA
 * ------------------------
 * Fica no localStorage, como o contador de não-lidas: o balconista de um
 * turno não deve limpar a tela do outro, em outro celular. E a chave leva
 * a data, então amanhã tudo volta — dispensa não vira configuração
 * permanente por acidente.
 */

function chave(lojaId: string, data: string): string {
  return `padaria:fornadas-dispensadas:${lojaId}:${data}`;
}

function ler(lojaId: string, data: string): number[] {
  try {
    const bruto = localStorage.getItem(chave(lojaId, data));
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

/** Códigos que esta loja tirou da lista hoje. */
export function fornadasDispensadas(lojaId: string, data: string): Set<number> {
  return new Set(ler(lojaId, data));
}

/** Tira um produto da lista de avisos desta loja, neste aparelho, hoje. */
export function dispensarFornada(lojaId: string, data: string, codigoPdv: number): Set<number> {
  const atual = ler(lojaId, data);
  if (!atual.includes(codigoPdv)) atual.push(codigoPdv);
  try {
    localStorage.setItem(chave(lojaId, data), JSON.stringify(atual));
  } catch {
    // Armazenamento bloqueado: o aviso continua na tela. Errar para o
    // lado de mostrar demais é melhor que esconder o que não deveria.
  }
  return new Set(atual);
}

/**
 * Devolve UM item à lista.
 *
 * Chamado quando alguém anuncia de novo um produto que tinha tirado da
 * lista (ago/2026): tirar da lista é sobre não tocar por engano, não
 * sobre esconder o produto para sempre. Se a matriz procurou o item e
 * anunciou, ela voltou a trabalhar com ele — e a linha volta com a
 * contagem de fornadas e a hora da última, que nunca saíram do banco.
 */
export function devolverFornada(lojaId: string, data: string, codigoPdv: number): Set<number> {
  const restante = ler(lojaId, data).filter((codigo) => codigo !== codigoPdv);
  try {
    if (restante.length === 0) localStorage.removeItem(chave(lojaId, data));
    else localStorage.setItem(chave(lojaId, data), JSON.stringify(restante));
  } catch {
    /* nada a fazer */
  }
  return new Set(restante);
}

/** Devolve todos os avisos dispensados hoje — o desfazer da dispensa. */
export function restaurarFornadas(lojaId: string, data: string): Set<number> {
  try {
    localStorage.removeItem(chave(lojaId, data));
  } catch {
    /* nada a fazer */
  }
  return new Set();
}
