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

  async function executarTeste() {
    setTestando(true);
    setMensagem(null);
    try {
      const r = await testarAvisos(destino);
      if (r.enviados > 0) {
        setMensagem(`Enviado para ${r.enviados} aparelho${r.enviados > 1 ? "s" : ""}.`);
      } else if (!r.registrados) {
        setMensagem("Nenhum aparelho registrado para receber avisos.");
      } else {
        const causa = (r.motivos ?? []).map(explicarFalhaDeEnvio).join("; ");
        setMensagem(`${r.registrados} aparelho(s) registrado(s), nenhum recebeu${causa ? ` — ${causa}` : "."}`);
      }
    } catch {
      setMensagem("Falha ao enviar aviso de teste.");
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
    </div>
  );
}