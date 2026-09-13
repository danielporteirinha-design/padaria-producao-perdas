/**
 * src/lib/diagnosticoAvisos.ts
 * ---------------------------------------------------------------
 * Diagnóstico de avisos (set/2026): confirma, por aparelho, se o push
 * está chegando de verdade — mesmo com o app fechado.
 *
 * POR QUE NÃO ENTRA EM avisarFiliais.ts
 * ---------------------------------------
 * Aquele arquivo dispara UM push e devolve UMA contagem — todo o desenho
 * gira em torno de `/api/notificar-fornada`. Este teste é outra coisa:
 * cria um registro de execução (`testeId`), dispara um push que NÃO tem
 * bloco `notification` (só assim o service worker roda código próprio
 * quando o app está fechado — ver o comentário grande em
 * public/firebase-messaging-sw.js e em api/testar-avisos.ts) e depois
 * ACOMPANHA em tempo real quem respondeu, pelo Firestore. Forçar isso no
 * formato de `ResultadoDoAviso` complicaria os dois sem necessidade.
 *
 * QUEM PODE VER A CONFIRMAÇÃO
 * ----------------------------
 * Só a matriz — ver firestore.rules, coleção confirmacoes_teste_aviso.
 * O disparo também só a matriz consegue — api/testar-avisos.ts confere o
 * token de quem chamou, igual notificar-fornada.ts.
 */

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";

export class ErroDiagnostico extends Error {}

export interface AparelhoTestado {
  token: string;
  lojaId: string;
}

export interface ResultadoDisparoTeste {
  testeId: string;
  aparelhos: AparelhoTestado[];
  enviados: number;
  falharam: number;
  aviso?: string;
}

/** Quanto esperar antes de desistir do disparo do teste. */
const SEGUNDOS_ATE_DESISTIR = 15;

/** Dispara um teste novo. Só a matriz consegue — o servidor confere. */
export async function dispararTesteDeAvisos(): Promise<ResultadoDisparoTeste> {
  const relogio = new AbortController();
  const prazo = setTimeout(() => relogio.abort(), SEGUNDOS_ATE_DESISTIR * 1000);
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new ErroDiagnostico("Sessão expirada — entre de novo para rodar o teste.");

    const resposta = await fetch("/api/testar-avisos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: relogio.signal,
    });
    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => "");
      let motivo = detalhe.slice(0, 200);
      try {
        motivo = (JSON.parse(detalhe) as { erro?: string }).erro ?? motivo;
      } catch {
        /* corpo não é JSON — vale o texto cru */
      }
      throw new ErroDiagnostico(`Servidor recusou (${resposta.status}): ${motivo || "sem detalhe"}`);
    }
    return (await resposta.json()) as ResultadoDisparoTeste;
  } catch (erro) {
    console.warn("Falha ao disparar o diagnóstico de avisos:", erro);
    if (erro instanceof ErroDiagnostico) throw erro;
    throw new ErroDiagnostico(
      erro instanceof Error ? `Não consegui falar com o servidor: ${erro.message}` : "Falha no teste."
    );
  } finally {
    clearTimeout(prazo);
  }
}

/**
 * Acompanha as confirmações deste teste em tempo real. Devolve a função
 * de cancelar — chamar ao sair da tela ou ao iniciar outro teste.
 *
 * O mapa é token -> horário da confirmação: quem chama já tem a lista de
 * aparelhos (devolvida por `dispararTesteDeAvisos`) e só precisa saber
 * quais já confirmaram.
 */
export function ouvirConfirmacoesDoTeste(
  testeId: string,
  aoMudar: (confirmados: Map<string, string>) => void
): () => void {
  const consulta = query(collection(db, "confirmacoes_teste_aviso"), where("testeId", "==", testeId));
  return onSnapshot(
    consulta,
    (snap) => {
      const mapa = new Map<string, string>();
      snap.forEach((doc) => {
        const dados = doc.data() as { token?: string; confirmadoEm?: string };
        if (dados.token) mapa.set(dados.token, dados.confirmadoEm ?? "");
      });
      aoMudar(mapa);
    },
    (erro) => console.warn("Não foi possível acompanhar as confirmações do teste:", erro)
  );
}
