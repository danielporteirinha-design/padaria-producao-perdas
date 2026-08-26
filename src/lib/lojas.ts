/**
 * src/lib/lojas.ts
 * ---------------------------------------------------------------
 * As três lojas da Padaria Pão de Mel (ago/2026) e o mapeamento entre a
 * conta de acesso e a loja que ela representa.
 *
 * Modelo operacional confirmado com o dono do negócio: as filiais NÃO
 * produzem — elas PEDEM. Cada filial informa a quantidade de que vai
 * precisar no dia seguinte, a matriz produz tudo e distribui. Por isso
 * só a matriz monta cronograma; a filial manda pedido e lança as próprias
 * perdas.
 *
 * A identificação da loja vem do e-mail da conta autenticada, e não de um
 * documento no banco: são três contas fixas, criadas à mão no console do
 * Firebase, e resolver isso em memória evita uma leitura extra a cada
 * abertura do app. As regras de segurança do Firestore usam exatamente o
 * mesmo mapeamento (ver firestore.rules) — se um dia entrar uma quarta
 * loja, os dois lugares mudam juntos.
 */

export type PapelLoja = "matriz" | "filial";

export interface Loja {
  id: string;
  nome: string;
  /** Nome curto para caber no cabeçalho da lista impressa. */
  nomeCurto: string;
  papel: PapelLoja;
  email: string;
}

export const LOJAS: Loja[] = [
  {
    id: "MATRIZ",
    nome: "Matriz",
    nomeCurto: "Matriz",
    papel: "matriz",
    email: "matriz@paodemel.local",
  },
  {
    id: "FILIAL_ARTHUR_BERNARDES",
    nome: "Filial Arthur Bernardes",
    nomeCurto: "Arthur Bernardes",
    papel: "filial",
    email: "arthur@paodemel.local",
  },
  {
    id: "FILIAL_BENJAMIN_CONSTANT",
    nome: "Filial Benjamin Constant",
    nomeCurto: "Benjamin Constant",
    papel: "filial",
    email: "benjamin@paodemel.local",
  },
];

export const LOJA_MATRIZ = LOJAS[0];

/** Só as filiais, na ordem em que aparecem nas telas e nos romaneios. */
export const FILIAIS = LOJAS.filter((l) => l.papel === "filial");

/**
 * Resolve a loja a partir do e-mail da conta autenticada. Comparação em
 * minúsculas porque o Firebase preserva a caixa que o usuário digitou no
 * login, e ninguém deveria ficar trancado do lado de fora por ter digitado
 * "Matriz@..." em vez de "matriz@...".
 */
export function lojaPorEmail(email: string | null | undefined): Loja | undefined {
  if (!email) return undefined;
  const normalizado = email.trim().toLowerCase();
  return LOJAS.find((l) => l.email.toLowerCase() === normalizado);
}

export function lojaPorId(id: string): Loja | undefined {
  return LOJAS.find((l) => l.id === id);
}

/** Rótulo exibível de uma loja pelo id, com fallback para o próprio id. */
export function nomeDaLoja(id: string): string {
  return lojaPorId(id)?.nome ?? id;
}
