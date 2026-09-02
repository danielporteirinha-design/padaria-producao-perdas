/**
 * src/components/TesteDeAvisos.tsx
 * ---------------------------------------------------------------
 * Componente temporário ou utilitário para testar o envio de avisos.
 */

import { useState } from "react";
import { testarAvisos, explicarFalhaDeEnvio } from "../lib/avisarFiliais";

interface TesteDeAvisosProps {
  destino: "matriz" | "filial";
}

export function TesteDeAvisos({ destino }: TesteDeAvisosProps) {
  const [testando, setTestando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [registro, setRegistro] = useState<string | null>(null);

  /**
   * QUEM ESTÁ REGISTRADO, SEM SAIR DO APP (set/2026).
   *
   * A coleção `dispositivos` é ilegível pelo app por regra do Firestore,
   * e até agora a única forma de vê-la era abrir /api/manutencao no
   * navegador — um passo a passo no portal, que ninguém faz no meio do
   * expediente. O mesmo dado, num toque.
   */
  async function conferirRegistro() {
    setRegistro("consultando...");
    try {
      const resposta = await fetch("/api/manutencao");
      const dados = (await resposta.json()) as {
        manutencao?: boolean;
        aparelhosDeTeste?: string[];
        aparelhosRegistrados?: {
          total?: number;
          porLoja?: Record<string, { operador: string; recebeAgora: boolean }[]>;
        };
      };
      const porLoja = dados.aparelhosRegistrados?.porLoja ?? {};
      const linhas = Object.entries(porLoja).map(([loja, aparelhos]) => {
        const recebem = aparelhos.filter((a) => a.recebeAgora).length;
        return `${loja}: ${recebem} de ${aparelhos.length} recebem`;
      });
      setRegistro(
        (dados.manutencao
          ? `Manutenção LIGADA (só ${(dados.aparelhosDeTeste ?? []).join(", ") || "ninguém"}). `
          : "Manutenção desligada. ") + (linhas.join(" · ") || "nenhum aparelho registrado")
      );
    } catch {
      setRegistro("Não foi possível consultar o registro de aparelhos.");
    }
  }

  async function executarTeste() {
    setTestando(true);
    setMensagem(null);
    try {
      const r = await testarAvisos(destino);
      if (r.enviados > 0) {
        setMensagem(
          `Enviado para ${r.enviados} aparelho${r.enviados > 1 ? "s" : ""}.` +
            (r.manutencao ? " (modo de manutenção ligado)" : "")
        );
      } else if (r.manutencao) {
        /**
         * O MODO DE MANUTENÇÃO VEM ANTES DE TUDO (set/2026).
         *
         * Sem esta ramificação, um teste durante a manutenção respondia
         * "nenhum aparelho registrado" — que é falso e manda a
         * investigação para o lado errado: a pessoa vai reativar avisos
         * num aparelho que já estava registrado. A causa real é uma
         * variável de ambiente, e o teste tem que dizer isso.
         */
        setMensagem(
          `Modo de manutenção LIGADO: ${r.silenciados ?? 0} aparelho(s) foram silenciados. ` +
            "Só os aparelhos de teste recebem — confira APARELHOS_DE_TESTE na Vercel."
        );
      } else if (!r.registrados) {
        setMensagem("Nenhum aparelho registrado para receber avisos.");
      } else {
        const causa = (r.motivos ?? []).map(explicarFalhaDeEnvio).join("; ");
        setMensagem(`${r.registrados} aparelho(s) registrado(s), nenhum recebeu${causa ? ` — ${causa}` : "."}`);
      }
      /**
       * O RESULTADO CRU FICA VISÍVEL (set/2026).
       *
       * "O aviso não chegou" já custou três rodadas de investigação, cada
       * uma dependendo de eu ler um endereço no portal da Vercel. Os
       * números que respondem a pergunta — quantos aparelhos, quantos
       * receberam, qual erro do FCM — já vinham na resposta e eram
       * jogados fora. Agora ficam na tela, para quem estiver testando ler
       * sem sair do app.
       */
      setDetalhe(
        `enviados ${r.enviados} · falharam ${r.falharam ?? 0} · registrados ${r.registrados}` +
          (r.removidos ? ` · ${r.removidos} token(s) vencido(s) removido(s)` : "") +
          ((r.motivos ?? []).length ? ` · FCM: ${(r.motivos ?? []).join(", ")}` : "")
      );
    } catch (erro) {
      // A causa vem junto: sem ela, todas as falhas se parecem.
      setMensagem(erro instanceof Error ? erro.message : "Falha ao enviar aviso de teste.");
    } finally {
      setTestando(false);
    }
  }

  return (
    <div style={{ marginTop: "16px" }}>
      <button
        type="button"
        className="secundario"
        disabled={testando}
        onClick={() => void executarTeste()}
      >
        {testando ? "Testando..." : "testar aviso nas filiais"}
      </button>
      <button
        type="button"
        className="link"
        style={{ marginLeft: "10px" }}
        onClick={() => void conferirRegistro()}
      >
        quem recebe?
      </button>
      {mensagem && <p className="nota-rodape" style={{ marginTop: "6px" }}>{mensagem}</p>}
      {detalhe && <p className="nota-rodape" style={{ marginTop: "2px", opacity: 0.8 }}>{detalhe}</p>}
      {registro && <p className="nota-rodape" style={{ marginTop: "6px" }}>{registro}</p>}
    </div>
  );
}