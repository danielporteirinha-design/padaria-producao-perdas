/**
 * src/lib/avisarFiliais.ts
 * ---------------------------------------------------------------
 * Disparo de avisos push, nos dois sentidos (matriz <-> filiais).
 *
 * DEFEITO CORRIGIDO NESTA VERSÃO (ago/2026) — LEIA ANTES DE MEXER
 * ---------------------------------------------------------------
 * A versão anterior deste arquivo chamava CINCO endereços que não
 * existem no projeto: `/api/notificar-matriz`, `/api/notificar-desfecho`,
 * `/api/notificar-ajuste` e `/api/testar-aviso`. Só
 * `/api/notificar-fornada` existe.
 *
 * O modo de falhar era o pior possível: cada chamada dava 404, o `catch`
 * engolia com um `console.warn`, e a tela seguia como se tivesse dado
 * certo. Na prática, a filial mandava a lista e a matriz não era avisada;
 * a matriz confirmava a reposição e a filial não ficava sabendo; o botão
 * de testar aviso não testava nada. Tudo em silêncio.
 *
 * TUDO PASSA POR UM ENDEREÇO SÓ, e é de propósito. `/api/notificar-fornada`
 * é o único ponto que confere QUEM está chamando (token do Firebase) antes
 * de disparar — o tipo de aviso é decidido por bandeiras no corpo. Criar
 * um endereço por tipo multiplicaria a verificação de identidade por
 * cinco, e é assim que um deles acaba sem verificação nenhuma.
 *
 * TODA CHAMADA TEM PRAZO. Sem `AbortController`, uma rede ruim deixa o
 * botão girando para sempre — e no balcão isso é indistinguível de app
 * travado.
 */

import { auth } from "./firebase";

export class ErroAviso extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroAviso";
  }
}

/**
 * Quanto esperar antes de desistir do aviso.
 *
 * Generoso o bastante para uma conexão de padaria confirmar de verdade,
 * curto o bastante para o operador não achar que o app morreu.
 */
export const SEGUNDOS_ATE_DESISTIR_DO_AVISO = 12;

export interface ResultadoDoAviso {
  enviados: number;
  registrados: number;
  /** Quantos o FCM recusou, e por quê — a tela mostra os dois. */
  falharam?: number;
  /** Tokens vencidos que o servidor removeu neste envio. */
  removidos?: number;
  motivos?: string[];
  /** Modo de manutenção ligado — ver api/manutencao.ts. */
  manutencao?: boolean;
  silenciados?: number;
  aviso?: string;
}

/**
 * O disparo, com identidade e prazo.
 *
 * O token vai no cabeçalho porque o servidor decide o DESTINO a partir de
 * quem chamou: matriz avisa filiais, filial avisa matriz. Se o app
 * pudesse declarar o destino no corpo, qualquer conta conseguiria
 * disparar aviso para todos os celulares da padaria.
 */
async function dispararAviso(corpo: Record<string, unknown>): Promise<ResultadoDoAviso> {
  const relogio = new AbortController();
  const prazo = setTimeout(() => relogio.abort(), SEGUNDOS_ATE_DESISTIR_DO_AVISO * 1000);
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new ErroAviso("Sessão expirada — entre de novo para enviar avisos.");

    const resposta = await fetch("/api/notificar-fornada", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpo),
      signal: relogio.signal,
    });
    if (!resposta.ok) throw new Error(`Servidor respondeu ${resposta.status}`);
    return (await resposta.json()) as ResultadoDoAviso;
  } catch (erro) {
    console.warn("Falha ao enviar aviso:", erro);
    throw new ErroAviso("Não foi possível enviar o aviso agora.");
  } finally {
    clearTimeout(prazo);
  }
}

/**
 * Os avisos que NÃO podem derrubar a ação que os gerou.
 *
 * Gravar o pedido é o que importa; avisar é consequência. Um aviso que
 * falha não pode desfazer uma lista que já foi enviada — por isso estes
 * engolem o erro, enquanto os que a tela mostra (`avisarFiliais`,
 * `testarAvisos`) o propagam.
 */
async function tentarAviso(corpo: Record<string, unknown>): Promise<void> {
  try {
    await dispararAviso(corpo);
  } catch {
    /* já registrado no console por dispararAviso */
  }
}

/** Teste manual: dispara um aviso que não cria pedido nenhum. */
export async function testarAvisos(destino: "matriz" | "filial"): Promise<ResultadoDoAviso> {
  // O destino real vem de quem está autenticado; o parâmetro fica para a
  // tela saber o que dizer, e para o servidor registrar a intenção.
  return dispararAviso({ teste: true, destino });
}

/** Matriz -> filiais: saiu do forno. */
export async function avisarFiliais(
  nomeProduto: string,
  codigoPdv: number,
  vezesHoje: number,
  quantidade?: number
): Promise<ResultadoDoAviso> {
  return dispararAviso({ nomeProduto, codigoPdv, vezesHoje, quantidade });
}

/** Filial -> matriz: pedido de reposição. */
export async function avisarMatriz(
  nomeProduto: string,
  codigoPdv: number,
  quantidade: number,
  variedades: number
): Promise<void> {
  await tentarAviso({ nomeProduto, codigoPdv, quantidade, itensNoPedido: variedades });
}

/** Filial -> matriz: a lista de amanhã foi enviada. */
export async function avisarListaEnviada(variedades: number): Promise<void> {
  await tentarAviso({ listaDiaria: true, variedades });
}

/** Filial -> matriz: lista de embalagens e material de limpeza. */
export async function avisarListaDeSuprimentos(variedades: number): Promise<void> {
  await tentarAviso({ suprimentos: true, variedades });
}

/** Matriz -> filial: resposta ao pedido de reposição. */
export async function avisarDesfechoReposicao(
  lojaId: string,
  nomeProduto: string,
  codigoPdv: number,
  desfecho: "confirmado" | "cancelado",
  motivo?: string
): Promise<void> {
  await tentarAviso({ paraLojaId: lojaId, nomeProduto, codigoPdv, desfecho, motivo });
}

/** Matriz -> filial: resposta à lista de suprimentos. */
export async function avisarDesfechoSuprimentos(
  lojaId: string,
  desfecho: "confirmado" | "cancelado",
  motivo?: string
): Promise<void> {
  await tentarAviso({ paraLojaId: lojaId, suprimentos: true, desfecho, motivo });
}

/** Matriz -> filial: a lista de amanhã foi confirmada com mudanças. */
export async function avisarListaAjustada(lojaId: string, diferencas: number): Promise<void> {
  await tentarAviso({ paraLojaId: lojaId, listaAjustada: true, itensAlterados: diferencas });
}

/**
 * Traduz o código de erro do FCM para algo que a padaria entenda.
 *
 * O código cru ("messaging/registration-token-not-registered") não ajuda
 * ninguém no balcão, e é justamente ele que aparece quando alguém
 * desinstalou o app e o registro ficou para trás.
 */
export function explicarFalhaDeEnvio(motivo: string): string {
  if (motivo.includes("registration-token-not-registered")) {
    return "um aparelho desinstalou o app";
  }
  if (motivo.includes("invalid-argument") || motivo.includes("token")) {
    return "aparelho sem registro válido";
  }
  if (motivo.includes("network") || motivo.includes("unavailable")) {
    return "sem conexão com o serviço de avisos";
  }
  return motivo;
}
