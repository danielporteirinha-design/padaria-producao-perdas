/**
 * src/components/TelaPerdas.tsx
 * ---------------------------------------------------------------
 * Escolhe o produto, usa TelaRegistroPerda (já com o cálculo kg ->
 * unidades embutido) e mostra o histórico do dia. Serve tanto para o
 * lançamento de fim de expediente quanto para uma perda no meio do dia —
 * fornada queimada ou fora do padrão tem que ser lançada na hora.
 *
 * Perda NÃO é sinônimo de vencimento: um produto pode sair do forno fora
 * do padrão e virar perda no mesmo dia. Por isso a lista aqui traz todo
 * produto que já foi produzido em alguma ocasião, e não só os que estão
 * dentro do prazo — o prazo serve para identificar de qual fornada a
 * perda veio, nunca para autorizar o lançamento (ver janelaValidade.ts).
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { RegistroPerda } from "../types/perda";
import type { PlanoDeProducaoDiario } from "../types/producao";
import { TelaRegistroPerda } from "./TelaRegistroPerda";
import { calcularCandidatosPerda } from "../lib/janelaValidade";
import { ConfirmarProducao } from "./ConfirmarProducao";
import { IconeLixeira } from "./Icones";
import { dataDeHojeIso, diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "../lib/data";

interface TelaPerdasProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  operador: string;
  /** Confirma o que realmente saiu do forno no plano de hoje (ver ConfirmarProducao.tsx). */
  onConfirmarProducao: (planoId: string, codigosNaoProduzidos: number[]) => Promise<void>;
  /** Só a matriz anula lançamento errado — ver firestore.rules. */
  podeAnular: boolean;
  onAnularPerda: (perdaId: string, motivo: string) => Promise<void>;
  onRegistrarPerda: (payload: {
    codigoPdv: number;
    planoDeProducaoId: string;
    quantidadeQuilos: number;
    pesoUnitarioGramasInformado: number;
    quantidadeUnidadesEstimada: number;
    motivo: RegistroPerda["motivo"];
    observacao?: string;
    registradoPor: string;
  }) => Promise<void>;
}

export function TelaPerdas({
  produtos,
  planos,
  perdas,
  operador,
  onConfirmarProducao,
  podeAnular,
  onAnularPerda,
  onRegistrarPerda,
}: TelaPerdasProps) {
  const [perdaAAnular, setPerdaAAnular] = useState<RegistroPerda | null>(null);
  const [motivoAnulacao, setMotivoAnulacao] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [codigoSelecionado, setCodigoSelecionado] = useState<number | "">("");

  const hoje = dataDeHojeIso();
  const diaDaSemana = diaDaSemanaDeData(hoje);

  const candidatos = useMemo(() => calcularCandidatosPerda(hoje, produtos, planos), [hoje, produtos, planos]);

  // Plano de HOJE já confirmado — é o que pode ter a produção real conferida.
  const planoDeHoje = useMemo(
    () => planos.find((p) => p.data === hoje && p.status === "confirmado"),
    [planos, hoje]
  );

  const blocoConfirmacao = planoDeHoje ? (
    <ConfirmarProducao
      plano={planoDeHoje}
      produtos={produtos}
      operador={operador}
      onConfirmar={(codigos) => onConfirmarProducao(planoDeHoje.id, codigos)}
    />
  ) : null;

  const perdasDeHoje = useMemo(() => perdas.filter((p) => p.data === hoje), [perdas, hoje]);

  const candidatoSelecionado = candidatos.find((c) => c.produto.codigoPdv === codigoSelecionado);

  if (candidatos.length === 0) {
    return (
      <div className="tela">
        <h2>Registro de Perdas</h2>
        {blocoConfirmacao}
        <p className="callout-inline">
          Ainda não há nenhuma fornada confirmada no app, então não existe produção à qual atribuir
          uma perda. Isso não tem relação com prazo de validade — assim que existir um cronograma
          confirmado, qualquer item dele pode ser lançado como perda, inclusive no mesmo dia em que
          foi produzido.
          <br />
          <br />
          Se a padaria já produziu hoje ({rotuloDoDia(diaDaSemana)}) sem passar pelo app, vá em{" "}
          <strong>Cronograma</strong> → <strong>planejar para outra data</strong>, escolha hoje,
          registre o que foi produzido e confirme. Os itens passam a aparecer aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="tela">
      <h2>Registro de Perdas</h2>
      <p className="subtitulo">{rotuloDoDia(diaDaSemana)}, {hoje}</p>

      {blocoConfirmacao}

      {!candidatoSelecionado ? (
        <div>
          <p>Selecione o produto para lançar a perda:</p>
          <div className="grade-produtos">
            {candidatos.map((c) => (
              <button
                key={c.produto.codigoPdv}
                type="button"
                className="cartao-produto"
                onClick={() => setCodigoSelecionado(c.produto.codigoPdv)}
              >
                {c.produto.nome}
                {c.origens.length > 1 && (
                  <span className="tag-pendente"> · {c.origens.length} fornadas válidas</span>
                )}
                {c.origens.length === 0 && (
                  <span className="tag-sem-fornada">
                    {" "}
                    · última produção {formatarDataBr(c.ultimaProducao)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="link" onClick={() => setCodigoSelecionado("")}>
            &larr; escolher outro produto
          </button>
          <TelaRegistroPerda
            produto={candidatoSelecionado.produto}
            origens={candidatoSelecionado.origens}
            registradoPor={operador}
            onSalvar={async (payload) => {
              await onRegistrarPerda(payload);
              setCodigoSelecionado("");
            }}
          />
        </div>
      )}

      <h3>Perdas lançadas hoje</h3>
      <div className="tabela-scroll">
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Peso perdido</th>
              <th>Peso unitário usado</th>
              <th>Unidades (est.)</th>
              <th>Motivo</th>
              {podeAnular && <th aria-label="Anular" />}
            </tr>
          </thead>
          <tbody>
            {perdasDeHoje.length === 0 && (
              <tr>
                <td colSpan={podeAnular ? 6 : 5} className="vazio">
                  Nenhuma perda registrada ainda hoje.
                </td>
              </tr>
            )}
            {perdasDeHoje.map((p) => (
              <tr key={p.id} className={p.cancelada ? "linha-anulada" : ""}>
                <td>{produtos.find((pr) => pr.codigoPdv === p.codigoPdv)?.nome ?? p.codigoPdv}</td>
                <td>{p.quantidadeQuilos} kg</td>
                <td>{p.pesoUnitarioGramasInformado} g</td>
                <td>{p.quantidadeUnidadesEstimada}</td>
                <td>{p.cancelada ? "anulada" : p.motivo}</td>
                {podeAnular && (
                  <td>
                    {!p.cancelada && (
                      <button
                        type="button"
                        className="botao-limpar-sessao"
                        title="Anular este lançamento"
                        aria-label="Anular este lançamento"
                        onClick={() => {
                          setPerdaAAnular(p);
                          setMotivoAnulacao("");
                        }}
                      >
                        <IconeLixeira tamanho={16} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Anular NÃO apaga o registro: marca. Ver o comentário em
          RegistroPerda.cancelada sobre por que o histórico é preservado. */}
      {perdaAAnular && (
        <div className="fundo-modal" role="dialog" aria-modal="true">
          <div className="caixa-modal">
            <h3>Anular lançamento</h3>
            <p className="nota-rodape">
              {produtos.find((pr) => pr.codigoPdv === perdaAAnular.codigoPdv)?.nome} —{" "}
              {perdaAAnular.quantidadeQuilos} kg ({perdaAAnular.quantidadeUnidadesEstimada} un).
              O lançamento deixa de contar nas análises, mas continua no histórico marcado como
              anulado, com o seu nome e a data.
            </p>
            <label>
              Motivo da anulação
              <input
                value={motivoAnulacao}
                onChange={(e) => setMotivoAnulacao(e.target.value)}
                placeholder="Ex.: quantidade digitada errada"
                autoFocus
              />
            </label>
            <div className="acoes">
              <button
                type="button"
                className="secundario"
                disabled={anulando}
                onClick={() => setPerdaAAnular(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="perigo"
                disabled={anulando || motivoAnulacao.trim() === ""}
                onClick={async () => {
                  setAnulando(true);
                  try {
                    await onAnularPerda(perdaAAnular.id, motivoAnulacao.trim());
                    setPerdaAAnular(null);
                  } catch {
                    // Mensagem vem do aviso global (ver App.tsx).
                  } finally {
                    setAnulando(false);
                  }
                }}
              >
                {anulando ? "Anulando..." : "Anular lançamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
