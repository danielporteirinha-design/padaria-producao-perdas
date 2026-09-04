/**
 * src/data/novidades.ts
 * ---------------------------------------------------------------
 * Registro do que mudou no app, entrega por entrega (set/2026, pedido
 * do dono do negócio: "informar ao usuário as melhorias realizadas").
 *
 * CADA ENTREGA GANHA UMA ENTRADA AQUI, escrita junto com o commit que a
 * traz. É o que torna o aviso "automático" do ponto de vista de quem
 * opera o caixa — ninguém digita nada na hora — sem depender do build
 * do Vercel enxergar o histórico do git, que pode chegar raso conforme
 * a configuração de clone e quebraria a lista em silêncio.
 *
 * MAIS RECENTE PRIMEIRO. `id` é só uma chave crescente (data + sequência
 * do dia) — é até onde o aparelho já viu (ver NovidadesDoApp.tsx).
 */
export interface EntradaDeNovidade {
  id: string;
  data: string; // YYYY-MM-DD
  itens: string[];
}

export const NOVIDADES: EntradaDeNovidade[] = [
  {
    id: "2026-09-04-1",
    data: "2026-09-04",
    itens: [
      "Matriz pode imprimir o comprovante de reposição de uma filial — imprimir já aceita o pedido, e dá para imprimir vários de uma vez, um comprovante por filial.",
      "Depois de aceitar o pedido de uma filial, o app pergunta se você quer imprimir o comprovante na hora.",
      "Nos pedidos concluídos, dá para marcar itens confirmados de qualquer filial e imprimir uma lista personalizada, tudo num comprovante só.",
    ],
  },
];
