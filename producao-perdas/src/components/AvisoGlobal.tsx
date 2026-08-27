/**
 * src/components/AvisoGlobal.tsx
 * ---------------------------------------------------------------
 * Faixa de retorno de operação, no topo da tela, acionada de um lugar
 * só (App.tsx) para toda gravação do app.
 *
 * O motivo de ser central e não um aviso por botão: cada tela tinha seu
 * próprio estado de "salvando", e bastou uma delas esquecer o
 * `try/finally` para o operador ficar com um botão preso em
 * "Salvando..." sem mensagem nenhuma (aconteceu em produção na virada
 * para o Firestore). Concentrando aqui, uma tela nova não tem como
 * nascer sem retorno visual.
 *
 * Sucesso some sozinho; erro fica até o operador fechar — quem precisa
 * ler uma falha com atenção não pode perder a mensagem por distração.
 */

import { useEffect } from "react";

export interface Aviso {
  tipo: "sucesso" | "erro";
  texto: string;
}

interface AvisoGlobalProps {
  aviso: Aviso | null;
  onFechar: () => void;
}

const SEGUNDOS_ATE_SUMIR = 4000;

export function AvisoGlobal({ aviso, onFechar }: AvisoGlobalProps) {
  useEffect(() => {
    if (!aviso || aviso.tipo === "erro") return;
    const id = setTimeout(onFechar, SEGUNDOS_ATE_SUMIR);
    return () => clearTimeout(id);
  }, [aviso, onFechar]);

  if (!aviso) return null;

  return (
    <div className={`aviso-global ${aviso.tipo}`} role="status" aria-live="polite">
      <span>{aviso.texto}</span>
      <button type="button" className="fechar-aviso" onClick={onFechar} aria-label="Fechar aviso">
        ×
      </button>
    </div>
  );
}
