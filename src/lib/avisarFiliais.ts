/**
 * src/lib/avisarFiliais.ts
 * ---------------------------------------------------------------
 * Cliente do endpoint que dispara o aviso de fornada pronta.
 *
 * O envio em si acontece no servidor (api/notificar-fornada.ts) porque
 * exige a chave de serviço do Firebase — que ignora as regras do banco e
 * jamais pode ir para o bundle do app.
 *
 * Manda junto o token de identidade do Firebase para o servidor conferir
 * que quem está pedindo é mesmo a matriz. Sem isso, um endereço público
 * conseguiria disparar notificação para os celulares da padaria inteira.
 */

import { auth } from "./firebase";

export class ErroAviso extends Error {}

/**
 * O que o servidor conseguiu fazer. `enviados: 0` NÃO é erro — quer dizer
 * que nenhum aparelho de filial está registrado ainda. Precisa voltar para
 * a tela porque, sem isso, o caso mais comum de "marquei e não chegou
 * nada" acontece em silêncio absoluto: a chamada dá certo, o servidor não
 * tem para quem mandar, e a matriz não tem como saber disso.
 */
export interface ResultadoAviso {
  enviados: number;
  falharam?: number;
  removidos?: number;
  /** Quantos aparelhos de filial estavam registrados na hora do envio. */
  registrados?: number;
  /** Códigos de erro do FCM, sem repetição — a causa real da falha. */
  motivos?: string[];
  aviso?: string;
}

/**
 * Traduz o código do FCM para o que fazer a respeito. O código cru
 * ("messaging/third-party-auth-error") não diz nada para quem está com o
 * celular na mão às 6h; o que resolve é a frase seguinte.
 */
export function explicarFalhaDeEnvio(codigo: string): string {
  if (codigo.includes("registration-token-not-registered"))
    return "o aparelho da filial desinstalou o app ou limpou os dados — precisa ativar de novo";
  if (codigo.includes("invalid-registration-token") || codigo.includes("invalid-argument"))
    return "o registro do aparelho está inválido — a filial precisa ativar de novo";
  if (codigo.includes("third-party-auth-error"))
    return "a chave VAPID do projeto não confere com a que o app está usando";
  if (codigo.includes("sender-id-mismatch"))
    return "o aparelho foi registrado em outro projeto do Firebase";
  if (codigo.includes("quota-exceeded") || codigo.includes("unavailable"))
    return "o serviço do Google recusou o envio agora — dá para tentar de novo";
  return codigo;
}

export async function avisarFiliais(
  nomeProduto: string,
  codigoPdv: number,
  vezesHoje: number
): Promise<ResultadoAviso> {
  return enviar({ nomeProduto, codigoPdv, vezesHoje });
}

/**
 * Avisa a MATRIZ que esta filial acabou de pedir reposição. Quem decide o
 * destino é o servidor, a partir do e-mail verificado da conta — o app não
 * escolhe para quem o aviso vai, só informa o que aconteceu.
 */
export async function avisarMatriz(
  nomeProduto: string,
  codigoPdv: number,
  quantidade: number
): Promise<ResultadoAviso> {
  return enviar({ nomeProduto, codigoPdv, quantidade });
}

/**
 * Avisa a MATRIZ que esta filial acabou de enviar a lista do dia
 * seguinte (ago/2026).
 *
 * É planejamento, não urgência — mas a matriz monta o cronograma no fim
 * do expediente e, se uma filial atrasa, a produção sai sem ela e a loja
 * abre no dia seguinte sem mercadoria. O aviso dá fim conhecido a essa
 * espera, em vez de a matriz ficar reabrindo a tela para ver se chegou.
 *
 * Manda VARIEDADES, não unidades: "12 produtos" dá a dimensão da lista
 * que vai chegar para separar; "195 unidades" não diz nada a quem lê de
 * relance na tela bloqueada.
 */
export async function avisarListaEnviada(variedades: number): Promise<ResultadoAviso> {
  return enviar({ listaDiaria: true, variedades });
}

/**
 * Avisa a filial que pediu qual foi o desfecho da reposição. Só a matriz
 * consegue endereçar uma loja específica — o servidor confere isso pela
 * conta de quem chamou, não por este parâmetro.
 */
export async function avisarDesfechoReposicao(
  paraLojaId: string,
  nomeProduto: string,
  codigoPdv: number,
  desfecho: "confirmado" | "cancelado",
  motivo?: string
): Promise<ResultadoAviso> {
  return enviar({ paraLojaId, nomeProduto, codigoPdv, desfecho, motivo });
}

/**
 * Dispara um aviso de teste para os aparelhos das filiais, sem marcar
 * fornada nenhuma. Existe porque a alternativa para conferir se o push
 * funciona é marcar uma fornada de mentira — que entra no histórico do dia
 * e suja o número que o app existe para medir.
 */
export async function testarAvisos(): Promise<ResultadoAviso> {
  return enviar({ teste: true });
}

/**
 * Quanto esperar o servidor de avisos antes de desistir.
 *
 * Existe por um defeito real (ago/2026): `fetch` sem limite espera para
 * sempre, e uma função serverless hibernada acordando devagar — ou uma
 * conexão que trava sem fechar — deixava a chamada pendurada. Quem
 * esperava por ela nunca era liberado. Doze segundos cobrem com folga o
 * pior início de função frio; mais que isso, o aviso já perdeu a hora de
 * qualquer forma.
 */
const SEGUNDOS_ATE_DESISTIR_DO_AVISO = 12_000;

async function enviar(corpo: Record<string, unknown>): Promise<ResultadoAviso> {
  const usuario = auth.currentUser;
  if (!usuario) throw new ErroAviso("Sessão não encontrada para avisar as filiais.");

  const token = await usuario.getIdToken();
  const desistir = new AbortController();
  const relogio = setTimeout(() => desistir.abort(), SEGUNDOS_ATE_DESISTIR_DO_AVISO);
  let resposta: Response;
  try {
    resposta = await fetch("/api/notificar-fornada", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpo),
      signal: desistir.signal,
    });
  } catch (erro) {
    throw new ErroAviso(
      desistir.signal.aborted
        ? "O servidor de avisos não respondeu a tempo. O que você fez já está gravado."
        : "Não foi possível falar com o servidor de avisos."
    );
  } finally {
    clearTimeout(relogio);
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new ErroAviso(corpo.erro ?? `Falha ao avisar as filiais (HTTP ${resposta.status}).`);
  }

  return (await resposta.json().catch(() => ({ enviados: 0 }))) as ResultadoAviso;
}
