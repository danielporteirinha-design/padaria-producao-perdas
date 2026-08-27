/**
 * src/components/TesteDeAvisos.tsx
 * ---------------------------------------------------------------
 * Conferir o push sem produzir efeito nenhum na operação (ago/2026).
 *
 * A alternativa era marcar uma fornada de mentira, ou mandar um pedido de
 * reposição falso, só para ver se o outro aparelho toca — e as duas
 * coisas entram no histórico do dia, sujando justamente o número que o
 * app existe para medir. Aqui o teste não grava nada.
 *
 * VALE NOS DOIS SENTIDOS, e é por isso que virou componente próprio.
 * Ficava só na tela da matriz, e quando a matriz parou de receber os
 * pedidos de reposição não havia, da filial, nenhum jeito de descobrir
 * onde estava a falha: se o aparelho da matriz não estava registrado, se
 * o FCM recusou, ou se chegou e o celular não tocou. Cada uma dessas
 * exige uma correção diferente, e todas se parecem com "não chegou nada".
 *
 * Quem decide o destino é o SERVIDOR, pela conta de quem chamou (ver
 * api/notificar-fornada.ts) — este componente só ajusta o texto para a
 * pessoa que está lendo.
 */

import { useState } from "react";
import { ErroAviso, explicarFalhaDeEnvio, testarAvisos } from "../lib/avisarFiliais";

interface TesteDeAvisosProps {
  /** Para onde o aviso vai — decidido pelo servidor; aqui só muda o texto. */
  destino: "filiais" | "matriz";
}

export function TesteDeAvisos({ destino }: TesteDeAvisosProps) {
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState("");

  const paraFiliais = destino === "filiais";
  const rotulo = paraFiliais ? "testar aviso nas filiais" : "testar aviso na matriz";

  async function conferir() {
    setTestando(true);
    setResultado("");
    try {
      const r = await testarAvisos();
      if (r.enviados > 0) {
        setResultado(
          `Enviado para ${r.enviados} aparelho${r.enviados > 1 ? "s" : ""} ${
            paraFiliais ? "de filial" : "da matriz"
          }. Se não apareceu na tela de lá, o bloqueio é nas notificações do próprio aparelho.`
        );
      } else if (!r.registrados) {
        // A causa mais comum, e a que não dá nenhum sinal sozinha: o
        // aparelho do outro lado nunca foi registrado.
        setResultado(
          paraFiliais
            ? 'Nenhum aparelho de filial está registrado. Em cada filial: abrir o app e tocar em "Ativar" no cartão de avisos.'
            : 'O aparelho da matriz não está registrado. Na matriz: abrir o app e tocar em "Ativar" no cartão de avisos.'
        );
      } else {
        const causa = (r.motivos ?? []).map(explicarFalhaDeEnvio).join("; ");
        setResultado(
          `${r.registrados} aparelho(s) registrado(s), nenhum recebeu${causa ? ` — ${causa}` : "."}`
        );
      }
    } catch (erro) {
      setResultado(
        erro instanceof ErroAviso ? erro.message : "Não foi possível falar com o servidor de avisos."
      );
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="rodape-forno">
      <button type="button" className="link" disabled={testando} onClick={conferir}>
        {testando ? "testando..." : rotulo}
      </button>
      {resultado && <p className="nota-rodape">{resultado}</p>}
    </div>
  );
}
