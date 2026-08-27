/**
 * src/lib/rascunhoLocal.ts
 * ---------------------------------------------------------------
 * O básico de guardar rascunho no aparelho (ago/2026).
 *
 * POR QUE UM MÓDULO SÓ
 * ---------------------
 * Duas telas montam listas que só existem enquanto ninguém confirmou: o
 * Cronograma da matriz e a Programação da filial. As duas sofreram o
 * MESMO defeito — trocar de aba desmonta o componente, e ao voltar a tela
 * era reconstruída a partir do documento gravado, apagando em silêncio
 * tudo que tinha sido digitado ou removido desde então.
 *
 * O relato veio duas vezes, com meses de distância e nas mesmas palavras
 * ("excluí, saí da aba, voltei, e voltou tudo"). A segunda vez foi porque
 * a correção da primeira ficou dentro de um arquivo específico do
 * Cronograma. Aqui ficam as partes que não têm dono: ler, gravar, apagar
 * e vencer. Cada tela por cima disso define só o que é seu — o formato do
 * conteúdo e o que entra na chave.
 *
 * O acesso ao localStorage é sempre protegido: navegador com
 * armazenamento cheio ou bloqueado (aba anônima, política corporativa)
 * lança exceção na leitura E na escrita. Sem o try/catch a tela inteira
 * quebraria por causa de um recurso que é uma rede de proteção — o
 * trabalho continua na memória, como era antes.
 *
 * As funções de expiração são PURAS — ver scripts/verificar_logica.ts.
 */

import { diasEntreDatas } from "./data";

/**
 * Por quantos dias um rascunho não confirmado ainda vale a pena guardar.
 *
 * Dois: cobre o esquecimento de uma noite e o feriado emendado, sem
 * deixar lixo acumulando no aparelho por meses. Rascunho de data futura
 * nunca vence — planejar a semana que vem é uso legítimo.
 */
export const DIAS_ATE_VENCER = 2;

/**
 * Quais chaves de um prefixo já passaram do prazo, dado o dia de hoje.
 *
 * A DATA É O PRIMEIRO CAMPO depois do prefixo — `<prefixo><data>` ou
 * `<prefixo><data>:<loja>`. Chave de outro prefixo é ignorada: o
 * localStorage é compartilhado com o resto do app, e apagar por engano o
 * registro de outra coisa seria um estrago silencioso.
 */
export function chavesVencidas(chaves: string[], hoje: string, prefixo: string): string[] {
  return chaves.filter((chave) => {
    if (!chave.startsWith(prefixo)) return false;
    const data = chave.slice(prefixo.length).split(":")[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return true; // chave estragada: pode ir
    // Positivo = a data do rascunho ficou para trás.
    return diasEntreDatas(data, hoje) > DIAS_ATE_VENCER;
  });
}

export function lerObjeto<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;
    const valor = JSON.parse(bruto);
    return valor && typeof valor === "object" ? (valor as T) : null;
  } catch {
    return null;
  }
}

export function gravarObjeto(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Armazenamento cheio ou bloqueado: a montagem segue na memória, como
    // era antes. Perde-se a proteção, não a tela.
  }
}

export function apagarChave(chave: string): void {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* nada a fazer */
  }
}

/** Varre o aparelho e remove os rascunhos vencidos de um prefixo. */
export function limparVencidos(hoje: string, prefixo: string): void {
  try {
    const chaves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave) chaves.push(chave);
    }
    for (const vencida of chavesVencidas(chaves, hoje, prefixo)) localStorage.removeItem(vencida);
  } catch {
    /* nada a fazer */
  }
}
