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
  async function executarTeste() {
    setTestando(true);
    setMensagem(null);
    try {
      const r = await testarAvisos(destino);
      if (r.conferencia) {
        // Conferência, não disparo: o servidor conta e responde.
        setMensagem(r.aviso ?? `${r.registrados} aparelho(s) prontos para receber.`);
        setDetalhe(null);
        return;
      }
      if (r.enviados > 0) {
        setMensagem(`Enviado para ${r.enviados} aparelho${r.enviados > 1 ? "s" : ""}.`);
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
      {mensagem && <p className="nota-rodape" style={{ marginTop: "6px" }}>{mensagem}</p>}
      {detalhe && <p className="nota-rodape" style={{ marginTop: "2px", opacity: 0.8 }}>{detalhe}</p>}
    </div>
  );
}