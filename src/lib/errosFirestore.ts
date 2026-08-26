/**
 * src/lib/errosFirestore.ts
 * ---------------------------------------------------------------
 * Traduz falhas de gravação para uma frase que o operador da padaria
 * entenda, sem código técnico.
 *
 * Isto passou a ser necessário em ago/2026, na virada para o Firestore.
 * Com localStorage nenhuma gravação falhava — salvar era instantâneo e
 * sempre dava certo. Com um banco na nuvem, salvar pode ser negado por
 * permissão, cair por falta de rede ou estourar tempo. O primeiro
 * sintoma real em produção foi um botão preso em "Salvando..." para
 * sempre, sem mensagem nenhuma: a promessa era rejeitada e ninguém
 * tratava a rejeição.
 */

/** Códigos vêm em `error.code` no formato "firestore/permission-denied". */
function codigoDoErro(erro: unknown): string {
  const bruto = (erro as { code?: string })?.code ?? "";
  return bruto.includes("/") ? bruto.split("/")[1] : bruto;
}

export function mensagemDeFalhaAoSalvar(erro: unknown): string {
  switch (codigoDoErro(erro)) {
    case "permission-denied":
      return "Esta loja não tem permissão para essa alteração. O catálogo e o cronograma são mantidos pela matriz.";
    case "unavailable":
    case "deadline-exceeded":
      return "Sem conexão com o servidor agora. O lançamento fica guardado no aparelho e sobe sozinho quando a internet voltar.";
    case "unauthenticated":
      return "Sua sessão expirou. Saia e entre de novo na loja.";
    case "resource-exhausted":
      return "O limite diário do banco de dados foi atingido. Me avise para eu verificar.";
    case "failed-precondition":
      return "O app está aberto em outra aba ou janela e isso atrapalhou a gravação. Feche as outras e tente de novo.";
    default:
      return "Não foi possível salvar. Tente de novo — se continuar, me avise para eu investigar.";
  }
}

/**
 * True quando a falha é só ausência de rede. Nesse caso o Firestore já
 * guardou a escrita na fila local e vai sincronizar sozinho — o aviso
 * ao operador é informativo, não um pedido para refazer o trabalho.
 */
export function ehFalhaTemporariaDeRede(erro: unknown): boolean {
  const codigo = codigoDoErro(erro);
  return codigo === "unavailable" || codigo === "deadline-exceeded";
}
