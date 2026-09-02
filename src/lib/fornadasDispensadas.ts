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

/**
 * A DISPENSA GUARDA A HORA (set/2026 — defeito relatado em produção:
 * "quando um item é anunciado mais de uma vez, as filiais não recebem
 * corretamente, impossibilitando pedir ou recusar").
 *
 * A versão anterior guardava só o código do produto. Pão francês sai
 * seis vezes por dia: a loja recusava a fornada das 7h — o produto
 * entrava na lista de dispensados — e a fornada das 11h, que é OUTRA
 * fornada e OUTRA decisão, nascia dispensada. O aviso chegava no
 * celular, a linha aparecia em "concluídos" com a recusa da manhã, e não
 * havia como pedir nem recusar. Para quem estava olhando, o app tinha
 * perdido o anúncio.
 *
 * Agora a marca leva o INSTANTE. A dispensa vale para o que já tinha
 * sido anunciado até ali; fornada mais nova que a marca volta a pedir
 * decisão, como tem que ser.
 *
 * COMPATÍVEL COM O QUE JÁ ESTÁ GRAVADO: o formato antigo (uma lista de
 * números) é lido como dispensa sem hora, e uma dispensa sem hora não
 * segura anúncio nenhum. Errar para o lado de MOSTRAR é o certo aqui:
 * mostrar de novo custa um toque, esconder custa uma entrega.
 */
function chave(lojaId: string, data: string): string {  return `padaria:fornadas-dispensadas:${lojaId}:${data}`;
}

/** Código do produto -> instante ISO em que a loja dispensou. */
export type Dispensas = Map<number, string>;

function ler(lojaId: string, data: string): Dispensas {
  const mapa: Dispensas = new Map();
  try {
    const bruto = localStorage.getItem(chave(lojaId, data));
    if (!bruto) return mapa;
    const lido = JSON.parse(bruto);

    // Formato antigo: lista de códigos, sem hora. Vira dispensa vazia —
    // que não segura anúncio nenhum. Ver o comentário do topo.
    if (Array.isArray(lido)) {
      for (const codigo of lido) if (typeof codigo === "number") mapa.set(codigo, "");
      return mapa;
    }
    if (lido && typeof lido === "object") {
      for (const [codigo, quando] of Object.entries(lido as Record<string, unknown>)) {
        const numero = Number(codigo);
        if (Number.isFinite(numero) && typeof quando === "string") mapa.set(numero, quando);
      }
    }
    return mapa;
  } catch {
    return mapa;
  }
}

/** O que esta loja tirou da lista hoje, com a hora de cada dispensa. */
export function fornadasDispensadas(lojaId: string, data: string): Dispensas {
  return ler(lojaId, data);
}

/** Tira um produto da lista de avisos desta loja, neste aparelho, hoje. */
export function dispensarFornada(lojaId: string, data: string, codigoPdv: number): Dispensas {
  const atual = ler(lojaId, data);
  atual.set(codigoPdv, new Date().toISOString());
  try {
    localStorage.setItem(chave(lojaId, data), JSON.stringify(Object.fromEntries(atual)));
  } catch {
    // Armazenamento bloqueado: o aviso continua na tela. Errar para o
    // lado de mostrar demais é melhor que esconder o que não deveria.
  }
  return new Map(atual);
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
export function devolverFornada(lojaId: string, data: string, codigoPdv: number): Dispensas {
  const restante = ler(lojaId, data);
  restante.delete(codigoPdv);
  try {
    if (restante.size === 0) localStorage.removeItem(chave(lojaId, data));
    else localStorage.setItem(chave(lojaId, data), JSON.stringify(Object.fromEntries(restante)));
  } catch {
    /* nada a fazer */
  }
  return new Map(restante);
}

/** Devolve todos os avisos dispensados hoje — o desfazer da dispensa. */
export function restaurarFornadas(lojaId: string, data: string): Dispensas {
  try {
    localStorage.removeItem(chave(lojaId, data));
  } catch {
    /* nada a fazer */
  }
  return new Map();
}
