/**
 * src/components/AtivarAvisos.tsx
 * ---------------------------------------------------------------
 * Liga os avisos de fornada pronta neste aparelho (ago/2026).
 *
 * É um BOTÃO, e não um pedido automático ao abrir o app, por dois
 * motivos: alguns navegadores exigem um toque do usuário para conceder a
 * permissão, e pedir de saída cria o reflexo de negar sem ler — e negar
 * notificação só se reverte nas configurações do aparelho, um caminho
 * que ninguém vai percorrer.
 *
 * Cada estado tem um texto próprio de propósito. "Não deu certo" não
 * ajuda quem está com o celular na mão às 6h da manhã: o operador precisa
 * saber se falta instalar o app, se o navegador não suporta, ou se ele
 * mesmo negou antes.
 */

import { useEffect, useState } from "react";
import type { Loja } from "../lib/lojas";
import {
  ativarAvisos,
  estadoDosAvisos,
  ErroNotificacao,
  type EstadoAviso,
} from "../lib/notificacoes";
import { IconeAtencao, IconeForno } from "./Icones";

interface AtivarAvisosProps {
  loja: Loja;
  operador: string;
}

export function AtivarAvisos({ loja, operador }: AtivarAvisosProps) {
  const [estado, setEstado] = useState<EstadoAviso | null>(null);
  const [ativando, setAtivando] = useState(false);
  const [erro, setErro] = useState("");
  const [dispensado, setDispensado] = useState(
    () => localStorage.getItem(`padaria:avisos-dispensados:${loja.id}`) === "1"
  );

  useEffect(() => {
    let cancelado = false;
    estadoDosAvisos().then((atual) => {
      if (!cancelado) setEstado(atual);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  async function ligar() {
    setAtivando(true);
    setErro("");
    try {
      await ativarAvisos(loja.id, operador);
      setEstado("ligado");
    } catch (e) {
      console.error("Falha ao ativar os avisos:", e);
      setErro(
        e instanceof ErroNotificacao
          ? e.message
          : "Não foi possível ativar os avisos neste aparelho."
      );
      setEstado(await estadoDosAvisos());
    } finally {
      setAtivando(false);
    }
  }

  // Já ligado ou ainda checando: nada a mostrar. O aviso funcionando é
  // silencioso — só o que exige ação do operador aparece na tela.
  if (estado === null || estado === "ligado") return null;
  if (dispensado && estado !== "negado") return null;

  function dispensar() {
    localStorage.setItem(`padaria:avisos-dispensados:${loja.id}`, "1");
    setDispensado(true);
  }

  if (estado === "nao-suportado") {
    return (
      <div className="cartao-avisos alerta">
        <IconeAtencao tamanho={20} />
        <div className="texto-avisos">
          <strong>Avisos indisponíveis neste aparelho</strong>
          <span>
            No iPhone, o aviso de fornada pronta só funciona com o app instalado na tela de início.
            Toque em Compartilhar → Adicionar à Tela de Início e abra por lá.
          </span>
        </div>
        <button type="button" className="link" onClick={dispensar}>
          ok
        </button>
      </div>
    );
  }

  if (estado === "nao-configurado") {
    return (
      <div className="cartao-avisos alerta">
        <IconeAtencao tamanho={20} />
        <div className="texto-avisos">
          <strong>Avisos ainda não configurados</strong>
          <span>Falta uma chave no projeto. As fornadas continuam aparecendo ao abrir o app.</span>
        </div>
        <button type="button" className="link" onClick={dispensar}>
          ok
        </button>
      </div>
    );
  }

  if (estado === "negado") {
    return (
      <div className="cartao-avisos alerta">
        <IconeAtencao tamanho={20} />
        <div className="texto-avisos">
          <strong>Avisos bloqueados</strong>
          <span>
            Este aparelho recusou as notificações. Para reverter, libere nas configurações do
            celular — o navegador não pergunta de novo.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="cartao-avisos">
      <IconeForno tamanho={20} />
      <div className="texto-avisos">
        <strong>Receber aviso de fornada pronta</strong>
        <span>
          A matriz marca quando o item sai do forno e você fica sabendo na hora, sem precisar abrir
          o app.
        </span>
        {erro && <span className="erro-conversao">{erro}</span>}
      </div>
      <div className="acoes-avisos">
        <button type="button" className="primario" disabled={ativando} onClick={ligar}>
          {ativando ? "Ativando..." : "Ativar"}
        </button>
        <button type="button" className="link" onClick={dispensar}>
          agora não
        </button>
      </div>
    </div>
  );
}
