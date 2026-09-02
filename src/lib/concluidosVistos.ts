/**
 * src/lib/concluidosVistos.ts
 * ---------------------------------------------------------------
 * O que a pessoa JÁ VIU na sanfona "Pedidos concluídos" (set/2026,
 * pedido do dono do negócio).
 *
 * O PROBLEMA
 * -----------
 * A resposta chega e não avisa. A filial pede, a matriz confirma — e a
 * confirmação cai numa sanfona fechada, sem nada dizendo que ela mudou.
 * Quem pediu fica olhando "Pedidos sem resposta", que esvaziou, e não
 * descobre que a resposta existe. O mesmo vale do outro lado: a matriz
 * confirma um pedido e não sabe quais desfechos ela ainda não conferiu.
 *
 * O sino resolve, mas só se souber o que é novo — e "novo" aqui é uma
 * informação DESTE APARELHO, não do banco: duas pessoas na mesma loja
 * podem estar em pontos diferentes da leitura, e marcar como lido na
 * nuvem faria a leitura de uma apagar o aviso da outra.
 *
 * Por isso fica no aparelho, com a mesma expiração dos outros rascunhos
 * (ver src/lib/rascunhoLocal.ts): a lista é do dia, e amanhã recomeça.
 */

import { apagarChave, chavesVencidas, gravarObjeto, lerObjeto, limparVencidos } from "./rascunhoLocal";

const PREFIXO = "padaria:concluidos-vistos:";

export function chaveDosConcluidosVistos(lojaId: string, data: string): string {
  return `${PREFIXO}${data}:${lojaId}`;
}

export function concluidosVistosVencidos(chaves: string[], hoje: string): string[] {
  return chavesVencidas(chaves, hoje, PREFIXO);
}

/** As chaves de linha que esta pessoa já leu hoje. */
export function lerConcluidosVistos(lojaId: string, data: string): Set<string> {
  const lido = lerObjeto<string[]>(chaveDosConcluidosVistos(lojaId, data));
  return new Set(Array.isArray(lido) ? lido : []);
}

export function marcarConcluidosVistos(
  lojaId: string,
  data: string,
  chaves: string[]
): Set<string> {
  const atual = lerConcluidosVistos(lojaId, data);
  for (const chave of chaves) atual.add(chave);
  gravarObjeto(chaveDosConcluidosVistos(lojaId, data), [...atual]);
  return new Set(atual);
}

export function limparConcluidosVistos(lojaId: string, data: string): void {
  apagarChave(chaveDosConcluidosVistos(lojaId, data));
}

/** Marcações de dias que já passaram não servem para nada. */
export function limparConcluidosVistosAntigos(hoje: string): void {
  limparVencidos(hoje, PREFIXO);
}

/**
 * Quantos itens concluídos ainda NÃO foram lidos.
 *
 * É este número que o sino mostra — e ele zera quando a pessoa abre a
 * sanfona, que é o gesto de ler.
 */
export function naoVistos(linhas: { chave: string }[], vistos: Set<string>): number {
  return linhas.filter((l) => !vistos.has(l.chave)).length;
}
