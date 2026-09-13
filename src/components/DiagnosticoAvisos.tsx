/**
 * src/components/DiagnosticoAvisos.tsx
 * ---------------------------------------------------------------
 * Confirma, aparelho por aparelho, se o aviso de fornada está chegando
 * de verdade — mesmo com o app fechado ou o navegador inteiro fechado
 * (set/2026, pedido do dono do negócio: "verificar se o fluxo completo
 * de notificação está funcionando em todos os dispositivos
 * registrados").
 *
 * POR QUE ISTO EXISTE
 * ---------------------
 * Antes disto, a única prova de que um push chegou era alguém no balcão
 * contar que ouviu a campainha — e o inverso não tinha prova nenhuma: um
 * aparelho que NUNCA recebeu nada ficava indistinguível de um aparelho
 * que só não teve fornada para avisar. Este painel dispara um push de
 * teste que não é uma fornada, e cada aparelho, ao recebê-lo — aberto,
 * em segundo plano ou fechado —, avisa o servidor de volta. O resultado
 * aparece aqui, por loja, com o horário exato.
 *
 * OCULTO POR PADRÃO, de propósito. É uma ferramenta técnica, não parte
 * do fluxo diário do balcão — abrir mais um cartão na tela principal
 * para algo usado de vez em quando só atrapalharia.
 */

import { useEffect, useRef, useState } from "react";
import type { Loja } from "../lib/lojas";
import { nomeDaLoja } from "../lib/lojas";
import {
  dispararTesteDeAvisos,
  ouvirConfirmacoesDoTeste,
  ErroDiagnostico,
  type AparelhoTestado,
} from "../lib/diagnosticoAvisos";
import { IconeSeta } from "./Icones";

interface DiagnosticoAvisosProps {
  loja: Loja;
}

/**
 * QUANTO TEMPO ESPERAR ANTES DE MARCAR "NÃO CONFIRMOU".
 *
 * Generoso o bastante para uma rede de padaria entregar de verdade — o
 * push do FCM às vezes leva alguns segundos a mais num celular com
 * economia de bateria agressiva —, curto o bastante para quem está
 * testando não ficar esperando um resultado que não vai virar.
 */
const SEGUNDOS_DE_JANELA = 90;

type StatusAparelho = "aguardando" | "confirmado" | "nao-confirmado";

export function DiagnosticoAvisos({ loja }: DiagnosticoAvisosProps) {
  const [aberto, setAberto] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState("");
  const [aparelhos, setAparelhos] = useState<AparelhoTestado[]>([]);
  const [confirmados, setConfirmados] = useState<Map<string, string>>(new Map());
  const [janelaEncerrada, setJanelaEncerrada] = useState(false);
  const pararDeOuvir = useRef<() => void>(() => {});
  const cronometro = useRef<number | null>(null);

  // Limpa o listener do Firestore e o cronômetro ao desmontar — sem
  // isto, sair da tela no meio de um teste deixaria os dois rodando à
  // toa em segundo plano.
  useEffect(() => {
    return () => {
      pararDeOuvir.current();
      if (cronometro.current !== null) window.clearTimeout(cronometro.current);
    };
  }, []);

  async function rodar() {
    setRodando(true);
    setErro("");
    setJanelaEncerrada(false);
    setConfirmados(new Map());
    pararDeOuvir.current();
    if (cronometro.current !== null) window.clearTimeout(cronometro.current);

    try {
      const resultado = await dispararTesteDeAvisos();
      setAparelhos(resultado.aparelhos);
      if (resultado.aparelhos.length === 0) {
        setErro(resultado.aviso || "Nenhum aparelho registrado para testar.");
        return;
      }
      pararDeOuvir.current = ouvirConfirmacoesDoTeste(resultado.testeId, setConfirmados);
      cronometro.current = window.setTimeout(() => setJanelaEncerrada(true), SEGUNDOS_DE_JANELA * 1000);
    } catch (e) {
      setErro(e instanceof ErroDiagnostico ? e.message : "Não foi possível rodar o teste.");
    } finally {
      setRodando(false);
    }
  }

  function statusDe(token: string): StatusAparelho {
    if (confirmados.has(token)) return "confirmado";
    return janelaEncerrada ? "nao-confirmado" : "aguardando";
  }

  // Ferramenta da matriz — as filiais nem sabem que ela existe.
  if (loja.papel !== "matriz") return null;

  return (
    <div className="cartao-diagnostico">
      <button
        type="button"
        className="cartao-diagnostico-cabecalho"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span>Diagnóstico de avisos</span>
        <IconeSeta className={`seta-sessao ${aberto ? "aberta" : ""}`} />
      </button>

      {aberto && (
        <div className="cartao-diagnostico-corpo">
          <p className="cartao-diagnostico-explicacao">
            Dispara um aviso de teste para todo aparelho registrado e mostra, aqui, quem
            confirmou o recebimento — mesmo com o app fechado.
          </p>
          <button type="button" className="primario" onClick={rodar} disabled={rodando}>
            {rodando ? "Disparando..." : "Rodar teste agora"}
          </button>
          {erro && <p className="erro-conversao">{erro}</p>}

          {aparelhos.length > 0 && (
            <ul className="lista-diagnostico">
              {aparelhos.map((aparelho) => {
                const status = statusDe(aparelho.token);
                const horario = confirmados.get(aparelho.token);
                return (
                  <li key={aparelho.token} className={`status-${status}`}>
                    <span className="loja-do-aparelho">{nomeDaLoja(aparelho.lojaId)}</span>
                    <span className="situacao-do-aparelho">
                      {status === "confirmado" &&
                        `confirmado${horario ? " às " + new Date(horario).toLocaleTimeString("pt-BR") : ""}`}
                      {status === "aguardando" && "aguardando..."}
                      {status === "nao-confirmado" && "não confirmou"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
