/**
 * src/lib/rascunhoCronograma.ts
 * ---------------------------------------------------------------
 * O que está sendo montado na tela do Cronograma, guardado no aparelho
 * (ago/2026).
 *
 * O DEFEITO QUE ISTO CORRIGE
 * ---------------------------
 * A montagem vivia só na memória do componente. Trocar de aba desmonta a
 * tela, e ao voltar ela era reconstruída a partir do plano GRAVADO — ou
 * seja, tudo que tinha sido digitado desde a última confirmação
 * desaparecia sem aviso.
 *
 * O relato veio pela limpeza de uma sessão inteira ("apaguei Pães e
 * Roscas, saí da aba, voltei, e ela estava lá de novo"), mas o problema
 * era maior: acrescentar item, corrigir quantidade, remover um produto —
 * qualquer edição se perdia do mesmo jeito. E se perdia em silêncio, que
 * é o pior: a tela voltava com números plausíveis, e o operador seguia
 * achando que tinha montado.
 *
 * POR QUE NO APARELHO, E NÃO NA NUVEM
 * ------------------------------------
 * Gravar cada tecla no Firestore reescreveria um plano que pode estar
 * CONFIRMADO — quem separa de manhã leria uma lista que ninguém
 * confirmou. A confirmação continua sendo o único momento em que o plano
 * muda de verdade; até lá, o rascunho é da pessoa que está montando, no
 * aparelho em que ela está montando.
 *
 * A chave leva a DATA. Assim o rascunho de sexta não contamina a
 * montagem de sábado, e trocar de data na tela carrega o rascunho
 * daquele dia — ou o plano gravado, quando não há rascunho.
 *
 * As funções de comparação e de expiração são PURAS — ver
 * scripts/verificar_logica.ts.
 */

import type { ItemPlanoProducao, PlanoDeProducaoDiario } from "../types/producao";
import { diasEntreDatas } from "./data";

/** Itens em montagem, agrupados pela chave da categoria. */
export type MapaDeItens = Record<string, ItemPlanoProducao[]>;

const PREFIXO = "padaria:rascunho-cronograma:";

/**
 * Por quantos dias um rascunho não confirmado ainda vale a pena guardar.
 *
 * Dois: cobre o esquecimento de uma noite e o feriado emendado, sem
 * deixar lixo acumulando no aparelho por meses. Rascunho de data futura
 * nunca vence — planejar a semana que vem é uso legítimo.
 */
const DIAS_ATE_VENCER = 2;

export function chaveDoRascunho(data: string): string {
  return `${PREFIXO}${data}`;
}

/** O mapa que o plano gravado representa — o ponto de partida da tela. */
export function mapaDoPlano(plano: PlanoDeProducaoDiario | undefined): MapaDeItens {
  if (!plano) return {};
  const mapa: MapaDeItens = {};
  for (const sessao of plano.sessoes) mapa[sessao.categoria] = sessao.itens;
  return mapa;
}

/**
 * Os dois mapas dizem a mesma coisa?
 *
 * Compara por CONTEÚDO, não por referência, e ignora tanto a ordem das
 * categorias quanto a ordem dos itens dentro delas — remover e re-adicionar
 * o mesmo produto muda a ordem sem mudar o pedido. Categoria vazia conta
 * como ausente: `{ BOLOS: [] }` e `{}` descrevem o mesmo cronograma.
 *
 * É o que decide se a tela mostra "alterações não confirmadas". Um falso
 * positivo aqui seria pior que não avisar: o operador aprenderia a
 * ignorar um alerta que aparece sempre.
 */
export function mapasIguais(a: MapaDeItens, b: MapaDeItens): boolean {
  const normalizar = (mapa: MapaDeItens) => {
    const saida = new Map<string, string>();
    for (const [categoria, itens] of Object.entries(mapa)) {
      if (!itens || itens.length === 0) continue;
      const ordenados = [...itens]
        .sort((x, y) => x.codigoPdv - y.codigoPdv)
        .map((i) => `${i.codigoPdv}:${i.quantidadeUnidades}`)
        .join(",");
      saida.set(categoria, ordenados);
    }
    return saida;
  };

  const mapaA = normalizar(a);
  const mapaB = normalizar(b);
  if (mapaA.size !== mapaB.size) return false;
  for (const [categoria, itens] of mapaA) {
    if (mapaB.get(categoria) !== itens) return false;
  }
  return true;
}

/**
 * Quais chaves de rascunho já passaram do prazo, dado o dia de hoje.
 *
 * Chave que não é de rascunho é ignorada — o localStorage é compartilhado
 * com o resto do app, e apagar por engano o registro de outra coisa seria
 * um estrago silencioso.
 */
export function rascunhosVencidos(chaves: string[], hoje: string): string[] {
  return chaves.filter((chave) => {
    if (!chave.startsWith(PREFIXO)) return false;
    const data = chave.slice(PREFIXO.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return true; // chave estragada: pode ir
    // Positivo = a data do rascunho ficou para trás.
    return diasEntreDatas(data, hoje) > DIAS_ATE_VENCER;
  });
}

export function lerRascunho(data: string): MapaDeItens | null {
  try {
    const bruto = localStorage.getItem(chaveDoRascunho(data));
    if (!bruto) return null;
    const mapa = JSON.parse(bruto);
    return mapa && typeof mapa === "object" && !Array.isArray(mapa) ? (mapa as MapaDeItens) : null;
  } catch {
    return null;
  }
}

export function gravarRascunho(data: string, mapa: MapaDeItens): void {
  try {
    localStorage.setItem(chaveDoRascunho(data), JSON.stringify(mapa));
  } catch {
    // Armazenamento cheio ou bloqueado: a montagem segue na memória, como
    // era antes. Perde-se a proteção, não a tela.
  }
}

export function apagarRascunho(data: string): void {
  try {
    localStorage.removeItem(chaveDoRascunho(data));
  } catch {
    /* nada a fazer */
  }
}

/** Varre o aparelho e remove os rascunhos vencidos. */
export function limparRascunhosAntigos(hoje: string): void {
  try {
    const chaves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave) chaves.push(chave);
    }
    for (const vencida of rascunhosVencidos(chaves, hoje)) localStorage.removeItem(vencida);
  } catch {
    /* nada a fazer */
  }
}
