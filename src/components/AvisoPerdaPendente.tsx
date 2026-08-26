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
 * O botão "hoje não teve perda" existe de propósito: zero perda é um
 * resultado legítimo e diferente de "esqueci de lançar". Sem essa saída,
 * o aviso ficaria na tela o dia inteiro num dia bom e o operador
 * aprenderia a ignorá-lo — que é exatamente como um alerta perde a
 * função. A dispensa vale só para o dia corrente (a chave leva a data),
 * então amanhã o aviso volta sozinho.
 */

import { useMemo, useState } from "react";
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

function chaveDispensa(dia: string): string {
  return `padaria:sem-perdas:${dia}`;
}

export function AvisoPerdaPendente({
  produtos,
  planos,
  perdas,
  visivel,
  onIrParaPerdas,
}: AvisoPerdaPendenteProps) {
  const hoje = dataDeHojeIso();
  const [dispensado, setDispensado] = useState(
    () => localStorage.getItem(chaveDispensa(hoje)) === "1"
  );

  const temFornadaHoje = useMemo(
    () => calcularCandidatosPerda(hoje, produtos, planos).length > 0,
    [hoje, produtos, planos]
  );
  const jaLancouHoje = useMemo(() => perdas.some((p) => p.data === hoje), [perdas, hoje]);

  if (!visivel || dispensado || jaLancouHoje || !temFornadaHoje) return null;

  function marcarSemPerda() {
    localStorage.setItem(chaveDispensa(hoje), "1");
    setDispensado(true);
  }

  return (
    <div className="aviso-perda-pendente">
      <div className="texto-aviso-perda">
        <strong>Nenhuma perda lançada hoje</strong>
        <span>
          Fornada queimada ou fora do padrão deve ser pesada e lançada no mesmo dia — deixar para
          amanhã atrasa a conferência. Aproveite para confirmar o que já saiu do forno até agora.
        </span>
      </div>
      <div className="acoes-aviso-perda">
        <button type="button" className="primario" onClick={onIrParaPerdas}>
          Lançar perda agora
        </button>
        <button type="button" className="link" onClick={marcarSemPerda}>
          hoje não teve perda
        </button>
      </div>
    </div>
  );
}
