/**
 * src/components/PainelFornoDeHoje.tsx
 * ---------------------------------------------------------------
 * Marcação de fornada pronta, ao longo do expediente (ago/2026).
 *
 * POR QUE É UM PAINEL PRÓPRIO, E NÃO UM BOTÃO NA LISTA DO CRONOGRAMA
 * ------------------------------------------------------------------
 * A tela de Cronograma abre no dia SEGUINTE — ela existe para planejar.
 * Marcar fornada é sobre HOJE. Na primeira versão o botão ficava em cada
 * item da lista de planejamento, e o padeiro teria que trocar a data para
 * hoje toda vez que uma fornada saísse: seis vezes por dia, só de pão
 * francês. Ninguém faria, e o recurso morreria sem nunca ser usado
 * (defeito encontrado em teste antes da entrega).
 *
 * Aqui é o contrário: o painel fica no topo, sempre mostrando a produção
 * de HOJE, independente da data que o operador esteja planejando embaixo.
 * Abriu o app, marcou, fechou.
 *
 * UM TOQUE, SEM QUANTIDADE. Um item que sai seis vezes por dia viraria
 * seis digitações. O que a filial precisa saber é que saiu e a que horas;
 * quanto ela quer, ela informa no pedido de reposição.
 */

import { useState } from "react";
import type { Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { FornadaPronta } from "../types/fornada";
import { fornadasDoProduto, horaDaUltimaFornada } from "../types/fornada";
import { rotuloDaCategoria } from "../lib/categorias";
import { ErroAviso, explicarFalhaDeEnvio, testarAvisos } from "../lib/avisarFiliais";
import { IconeChama } from "./Icones";

interface PainelFornoDeHojeProps {
  /** Plano confirmado de HOJE. Sem ele não há o que marcar. */
  plano: PlanoDeProducaoDiario;
  produtos: Produto[];
  fornadas: FornadaPronta[];
  dataHoje: string;
  onMarcarFornada: (codigoPdv: number) => Promise<void>;
}

export function PainelFornoDeHoje({
  plano,
  produtos,
  fornadas,
  dataHoje,
  onMarcarFornada,
}: PainelFornoDeHojeProps) {
  const [marcando, setMarcando] = useState<number | null>(null);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState("");

  /**
   * Conferir o push sem marcar fornada. A alternativa era marcar uma
   * fornada de mentira só para ver se o celular da filial toca — e isso
   * entra no histórico do dia, sujando justamente o número que o app
   * existe para medir. Aqui o teste não grava nada.
   */
  async function conferirAvisos() {
    setTestando(true);
    setResultadoTeste("");
    try {
      const r = await testarAvisos();
      if (r.enviados > 0) {
        setResultadoTeste(
          `Enviado para ${r.enviados} aparelho${r.enviados > 1 ? "s" : ""} de filial. Se não apareceu na tela de lá, o bloqueio é nas notificações do próprio celular.`
        );
      } else if (!r.registrados) {
        setResultadoTeste(
          'Nenhum aparelho de filial está registrado. Em cada filial: abrir o app e tocar em "Ativar" no cartão de avisos.'
        );
      } else {
        const causa = (r.motivos ?? []).map(explicarFalhaDeEnvio).join("; ");
        setResultadoTeste(
          `${r.registrados} aparelho(s) registrado(s), nenhum recebeu${causa ? ` — ${causa}` : "."}`
        );
      }
    } catch (erro) {
      setResultadoTeste(
        erro instanceof ErroAviso ? erro.message : "Não foi possível falar com o servidor de avisos."
      );
    } finally {
      setTestando(false);
    }
  }

  const nomeDoProduto = (codigo: number) =>
    produtos.find((p) => p.codigoPdv === codigo)?.nome ?? `#${codigo}`;

  const totalMarcado = new Set(
    fornadas.filter((f) => f.data === dataHoje).map((f) => f.codigoPdv)
  ).size;
  const totalItens = plano.sessoes.flatMap((s) => s.itens).length;

  return (
    <div className="painel-forno">
      {/* A aba já diz o assunto. O que sobra de útil aqui é o progresso
          do dia — quanto da lista já saiu do forno. */}
      <div className="corpo-forno">
        <p className="progresso-forno">
          <IconeChama tamanho={16} />
          {totalMarcado} de {totalItens} itens já saíram hoje
        </p>
          <p className="nota-rodape">
            Toque no item quando a fornada sair. As filiais veem na hora e podem pedir reposição
            enquanto ainda dá tempo de entregar hoje.
          </p>

          {plano.sessoes.map((sessao) => (
            <div key={sessao.id} className="grupo-forno">
              <h4>{rotuloDaCategoria(sessao.categoria)}</h4>
              {sessao.itens.map((item) => {
                const doDia = fornadasDoProduto(fornadas, dataHoje, item.codigoPdv);
                const saiu = doDia.length > 0;
                return (
                  <button
                    key={item.codigoPdv}
                    type="button"
                    className={`linha-forno ${saiu ? "saiu" : ""}`}
                    disabled={marcando === item.codigoPdv}
                    onClick={async () => {
                      setMarcando(item.codigoPdv);
                      try {
                        await onMarcarFornada(item.codigoPdv);
                      } catch {
                        /* o aviso global cuida da mensagem */
                      } finally {
                        setMarcando(null);
                      }
                    }}
                  >
                    <span className="nome-forno">{nomeDoProduto(item.codigoPdv)}</span>
                    <span className="marca-forno">
                      {marcando === item.codigoPdv
                        ? "..."
                        : saiu
                          ? `${doDia.length}× · ${horaDaUltimaFornada(fornadas, dataHoje, item.codigoPdv)}`
                          : "marcar"}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          {/* Diagnóstico, não operação: fica no rodapé, discreto, e só
              aparece o resultado quando alguém pergunta. */}
          <div className="rodape-forno">
            <button type="button" className="link" disabled={testando} onClick={conferirAvisos}>
              {testando ? "testando..." : "testar aviso nas filiais"}
            </button>
            {resultadoTeste && <p className="nota-rodape">{resultadoTeste}</p>}
          </div>
      </div>
    </div>
  );
}
