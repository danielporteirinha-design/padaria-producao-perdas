/**
 * src/components/AvisoPerdaPendente.tsx
 * ---------------------------------------------------------------
 * Atalho permanente para o lançamento de perda (decisão do dono do
 * negócio, ago/2026).
 *
 * O app SEMPRE aceitou lançar perda no mesmo dia — uma fornada queimada
 * às 6h já aparece como candidata às 6h (ver src/lib/janelaValidade.ts,
 * o caso `diasDesdeProducao === 0`, e os motivos "queimado" /
 * "erro_producao"). O problema real levantado pela padaria não é falta de
 * capacidade, é esquecimento: nada chamava o funcionário para lançar, e
 * deixar para o dia seguinte trava a conferência.
 *
 * Então este aviso aparece enquanto houver fornada válida hoje e NENHUMA
 * perda lançada hoje, em qualquer aba do app, com um botão que leva
 * direto para a tela de Perdas.
 *
 * "LANÇAR MAIS TARDE", E NÃO "HOJE NÃO TEVE PERDA" (ago/2026)
 * ------------------------------------------------------------
 * A saída anterior pedia uma AFIRMAÇÃO: quem tocava estava declarando
 * que o dia fechou sem desperdício. Só que ninguém toca ali por isso —
 * toca porque está no meio de outra coisa e o aviso está no caminho. O
 * app então registrava como "dia sem perda" um dia que ninguém tinha
 * conferido ainda, e o aviso não voltava mais.
 *
 * "Lançar mais tarde" diz a verdade sobre o que o toque significa, e por
 * isso pode voltar: o aviso adormece por algumas horas e reaparece,
 * ainda dentro do expediente, quando dá tempo de pesar e lançar. Num dia
 * realmente sem perda ele some sozinho no fim do dia, sem exigir
 * declaração nenhuma.
 *
 * O adiamento é gravado com a HORA de volta, e não com um "sim". Assim o
 * pior caso continua sendo bom: o operador vê o lembrete de novo em vez
 * de o dia inteiro passar em silêncio.
 */

import { useEffect, useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import { calcularCandidatosPerda } from "../lib/janelaValidade";
import { dataDeHojeIso } from "../lib/data";

interface AvisoPerdaPendenteProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  /** Não mostra o atalho quando o operador já está na tela de Perdas. */
  visivel: boolean;
  onIrParaPerdas: () => void;
}

/**
 * Quanto tempo o aviso fica quieto depois de "lançar mais tarde".
 *
 * Duas horas: curto o bastante para caber no mesmo expediente — o
 * lançamento tem que acontecer HOJE, e o aviso que só voltasse amanhã não
 * serviria para nada — e longo o bastante para não virar insistência
 * enquanto a pessoa termina o que estava fazendo.
 */
const HORAS_ADIADAS = 2;

/**
 * A chave leva a DATA para o adiamento nunca atravessar o dia: seja qual
 * for a hora gravada, amanhã o aviso nasce de novo.
 */
function chaveAdiado(dia: string): string {
  return `padaria:perda-adiada:${dia}`;
}

/** Lê o adiamento gravado hoje. Valor ausente, inválido ou vencido = 0. */
function lerAdiamento(dia: string): number {
  try {
    const bruto = Number(localStorage.getItem(chaveAdiado(dia)));
    return Number.isFinite(bruto) && bruto > Date.now() ? bruto : 0;
  } catch {
    return 0;
  }
}

export function AvisoPerdaPendente({
  produtos,
  planos,
  perdas,
  visivel,
  onIrParaPerdas,
}: AvisoPerdaPendenteProps) {
  const hoje = dataDeHojeIso();
  /** Instante (ms) até quando o aviso fica quieto. 0 = aparecendo. */
  const [adiadoAte, setAdiadoAte] = useState(() => lerAdiamento(hoje));

  /**
   * Faz o aviso VOLTAR quando o adiamento vence, sem depender de a
   * pessoa navegar. Sem isto, "mais tarde" viraria "nunca" num app que
   * fica aberto o dia inteiro na mesma tela — que é o defeito que a
   * versão anterior tinha em outra forma.
   */
  useEffect(() => {
    if (adiadoAte === 0) return;
    const falta = adiadoAte - Date.now();
    if (falta <= 0) {
      setAdiadoAte(0);
      return;
    }
    const id = setTimeout(() => setAdiadoAte(0), falta);
    return () => clearTimeout(id);
  }, [adiadoAte]);

  const temFornadaHoje = useMemo(
    () => calcularCandidatosPerda(hoje, produtos, planos).length > 0,
    [hoje, produtos, planos]
  );
  const jaLancouHoje = useMemo(() => perdas.some((p) => p.data === hoje), [perdas, hoje]);

  const adiado = adiadoAte > Date.now();
  if (!visivel || adiado || jaLancouHoje || !temFornadaHoje) return null;

  function lancarMaisTarde() {
    const volta = Date.now() + HORAS_ADIADAS * 60 * 60 * 1000;
    try {
      localStorage.setItem(chaveAdiado(hoje), String(volta));
    } catch {
      /* armazenamento bloqueado: o aviso segue na tela, que é o lado
         seguro de errar */
    }
    setAdiadoAte(volta);
  }

  return (
    <div className="aviso-perda-pendente">
      <div className="texto-aviso-perda">
        <strong>Nenhuma perda lançada hoje</strong>
        <span>
          Fornada queimada ou fora do padrão deve ser pesada e lançada no mesmo dia — deixar para
          amanhã atrasa a conferência.
        </span>
      </div>
      <div className="acoes-aviso-perda">
        <button type="button" className="primario" onClick={onIrParaPerdas}>
          Lançar perda agora
        </button>
        <button type="button" className="link" onClick={lancarMaisTarde}>
          lançar mais tarde
        </button>
      </div>
    </div>
  );
}
