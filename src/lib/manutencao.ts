/**
 * src/lib/manutencao.ts
 * ---------------------------------------------------------------
 * O app pergunta ao servidor se o modo de manutenção está ligado.
 *
 * POR QUE A TELA PRECISA SABER
 * -----------------------------
 * A chave da manutenção mora numa variável de ambiente da Vercel, longe
 * de quem usa o app — que é o que se quer. O efeito colateral é que
 * NINGUÉM VÊ que ela está ligada: os avisos simplesmente param de
 * chegar, e ninguém liga uma coisa à outra. Passa um dia, passa uma
 * semana, e a padaria conclui que o recurso quebrou.
 *
 * Por isso a faixa no topo. Enquanto a manutenção estiver ligada, todo
 * aparelho mostra que os avisos estão suspensos — inclusive o do
 * colaborador, que assim entende por que o celular parou de tocar.
 *
 * DEGRADA EM SILÊNCIO. Sem rede, com erro ou com resposta inesperada,
 * devolve `false` — o app se comporta como se estivesse tudo normal, que
 * é o que ele faria se este arquivo não existisse. Uma faixa informativa
 * não pode ser motivo de tela quebrada.
 */

export interface EstadoDaManutencao {
  ativa: boolean;
  /** Nomes que continuam recebendo aviso — vazio quando ninguém recebe. */
  aparelhosDeTeste: string[];
}

export async function lerManutencao(): Promise<EstadoDaManutencao> {
  try {
    const resposta = await fetch("/api/manutencao");
    if (!resposta.ok) return { ativa: false, aparelhosDeTeste: [] };
    const dados = (await resposta.json()) as {
      manutencao?: boolean;
      aparelhosDeTeste?: string[];
    };
    return {
      ativa: Boolean(dados.manutencao),
      aparelhosDeTeste: Array.isArray(dados.aparelhosDeTeste) ? dados.aparelhosDeTeste : [],
    };
  } catch {
    return { ativa: false, aparelhosDeTeste: [] };
  }
}

/**
 * A frase da faixa.
 *
 * Distingue os dois estados porque eles têm consequências diferentes, e
 * quem está testando precisa saber em qual está: com lista, os aparelhos
 * de teste recebem; sem lista, NINGUÉM recebe — inclusive quem está
 * testando, que ficaria esperando um aviso que nunca vem.
 */
export function fraseDaManutencao(estado: EstadoDaManutencao): string {
  if (!estado.ativa) return "";
  if (estado.aparelhosDeTeste.length === 0) {
    return "Modo de manutenção: nenhum aparelho está recebendo aviso.";
  }
  return `Modo de manutenção: só os aparelhos de ${estado.aparelhosDeTeste.join(", ")} recebem aviso.`;
}
