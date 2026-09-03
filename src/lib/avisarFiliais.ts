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
  /** Resposta do botão de teste: conta os aparelhos e não dispara nada. */
  conferencia?: boolean;
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
    if (!resposta.ok) {
      /**
       * O MOTIVO DO SERVIDOR VAI PARA A TELA (set/2026).
       *
       * "Falha ao enviar aviso de teste" já custou várias rodadas de
       * investigação: ela é idêntica para credencial expirada (401),
       * função quebrada (500) e endereço errado (404), que pedem
       * providências completamente diferentes. O servidor sempre disse
       * qual era — a mensagem é que jogava fora.
       */
      const detalhe = await resposta.text().catch(() => "");
      let motivo = detalhe.slice(0, 200);
      try {
        motivo = (JSON.parse(detalhe) as { erro?: string }).erro ?? motivo;
      } catch {
        /* corpo não é JSON — vale o texto cru */
      }
      throw new ErroAviso(`Servidor recusou (${resposta.status}): ${motivo || "sem detalhe"}`);
    }
    return (await resposta.json()) as ResultadoDoAviso;
  } catch (erro) {
    console.warn("Falha ao enviar aviso:", erro);
    if (erro instanceof ErroAviso) throw erro;
    throw new ErroAviso(
      erro instanceof Error ? `Não consegui falar com o servidor: ${erro.message}` : "Falha no aviso."
    );
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

/**
 * QUANTOS ITENS VIAJAM DENTRO DO AVISO.
 *
 * O aviso carrega a lista para o servidor montar o texto — mas carregar
 * uma lista inteira de trinta embalagens não serviria para nada: a
 * notificação mostra os primeiros e resume o resto. O corte aqui é o que
 * impede uma lista grande de virar uma requisição grande numa conexão
 * de padaria, justo no momento em que a pessoa está esperando o envio
 * terminar. A contagem correta vai separada, em `variedades`.
 */
const ITENS_QUE_VIAJAM_NO_AVISO = 12;

/**
 * Filial -> matriz: lista de embalagens e material de limpeza.
 *
 * MANDA OS ITENS, e não só a contagem (set/2026, pedido do dono do
 * negócio: "com todos os detalhes solicitados"). "5 itens" obrigava a
 * matriz a abrir o app só para descobrir se dava para separar agora — e
 * o aviso existe justamente para poupar essa abertura.
 */
export async function avisarListaDeSuprimentos(
  itens: { nome: string; quantidade: number }[]
): Promise<void> {
  await tentarAviso({
    suprimentos: true,
    // A contagem é de TODOS os itens; a lista pode vir cortada.
    variedades: itens.length,
    itensSuprimentos: itens.slice(0, ITENS_QUE_VIAJAM_NO_AVISO),
  });
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
