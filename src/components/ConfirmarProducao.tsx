/**
 * src/components/ConfirmarProducao.tsx
 * ---------------------------------------------------------------
 * Passo de fim de expediente: confirmar o que REALMENTE saiu do forno.
 *
 * Fica na tela de CRONOGRAMA, não na de Perdas (ago/2026): confirmar o
 * que saiu do forno é fechar o ciclo do plano, e misturar isso com o
 * lançamento de perdas na mesma janela confundia duas atividades
 * diferentes — observação do próprio dono do negócio depois de usar.
 *
 * O momento continua sendo o fim do expediente, de uma vez só. A razão
 * não é comodidade: é aí que dá para comparar tudo o que foi PEDIDO —
 * pela matriz e pelas filiais — com o que realmente SAIU, e enxergar na
 * hora onde o gargalo travou a produção.
 *
 * O desenho parte do caso comum: na maioria dos dias sai tudo. Então
 * TODOS os itens já vêm marcados como produzidos e o operador só desmarca
 * a exceção — um toque em "Confirmar" resolve o dia normal. A marcação é
 * binária porque foi assim que a operação descreveu o problema: quando um
 * item não é produzido, "simplesmente não sai, e pronto", não sai em
 * quantidade menor.
 *
 * Confirmar aqui é o que autoriza a taxa de perda a usar um denominador
 * verdadeiro — ver src/lib/producaoRealizada.ts.
 */

import { useState } from "react";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { Produto } from "../types/produto";
import { itensPlanejados, producaoFoiConfirmada } from "../lib/producaoRealizada";
import { rotuloDaCategoria } from "../lib/categorias";

interface ConfirmarProducaoProps {
  plano: PlanoDeProducaoDiario;
  produtos: Produto[];
  operador: string;
  /**
   * Quantidade TOTAL pedida de cada item (matriz + filiais). É o número
   * que interessa conferir: o padeiro produziu para as três lojas, não só
   * para a matriz. Ausente para um produto = cai na quantidade do plano.
   */
  totaisPedidos?: Map<number, number>;
  /**
   * Itens que tiveram fornada marcada hoje. Quando existe marcação ao
   * longo do dia, ela é a melhor fonte sobre o que saiu do forno — mais
   * confiável que a memória de quem fecha o expediente. O que não teve
   * nenhuma fornada já vem desmarcado, e o operador só confere.
   */
  codigosComFornada?: Set<number>;
  /**
   * Renderiza SEM a moldura e SEM o título próprios — para quando o
   * componente mora dentro de um card que já tem os dois (ago/2026, tela
   * de Cronograma). Sem isso vira caixa dentro de caixa e o título
   * aparece duas vezes.
   */
  embutido?: boolean;
  onConfirmar: (codigosNaoProduzidos: number[]) => Promise<void>;
}

export function ConfirmarProducao({
  plano,
  produtos,
  operador,
  totaisPedidos,
  codigosComFornada,
  embutido = false,
  onConfirmar,
}: ConfirmarProducaoProps) {
  const jaConfirmado = producaoFoiConfirmada(plano);
  const [editando, setEditando] = useState(!jaConfirmado);
  const [naoProduzidos, setNaoProduzidos] = useState<Set<number>>(() => {
    // Confirmação já feita antes vence: o operador pode ter corrigido
    // à mão algo que a marcação de fornada não pegou.
    if (plano.producaoRealizada) return new Set(plano.producaoRealizada.codigosNaoProduzidos);
    if (!codigosComFornada || codigosComFornada.size === 0) return new Set();
    return new Set(
      plano.sessoes
        .flatMap((sessao) => sessao.itens)
        .map((item) => item.codigoPdv)
        .filter((codigo) => !codigosComFornada.has(codigo))
    );
  });
  const [salvando, setSalvando] = useState(false);

  const nomePorCodigo = new Map(produtos.map((p) => [p.codigoPdv, p.nome]));
  const planejados = itensPlanejados(plano);

  function alternar(codigoPdv: number) {
    setNaoProduzidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(codigoPdv)) proximo.delete(codigoPdv);
      else proximo.add(codigoPdv);
      return proximo;
    });
  }

  async function confirmar() {
    setSalvando(true);
    try {
      await onConfirmar([...naoProduzidos]);
      setEditando(false);
    } catch {
      // Continua em modo de edição com as marcações preservadas — a
      // mensagem de falha vem do aviso global (ver App.tsx).
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    const faltaram = plano.producaoRealizada?.codigosNaoProduzidos ?? [];
    return (
      <div className={embutido ? "resumo-producao-confirmada" : "cartao-producao-confirmada"}>
        <div>
          <strong>Produção de hoje confirmada</strong>
          {faltaram.length === 0 ? (
            <span> · saiu tudo conforme a lista</span>
          ) : (
            <span>
              {" "}
              · {faltaram.length} {faltaram.length === 1 ? "item não saiu" : "itens não saíram"}:{" "}
              {faltaram.map((c) => nomePorCodigo.get(c) ?? `#${c}`).join(", ")}
            </span>
          )}
        </div>
        <button type="button" className="link" onClick={() => setEditando(true)}>
          corrigir
        </button>
      </div>
    );
  }

  return (
    <div className={embutido ? "corpo-confirmar-producao" : "cartao-confirmar-producao"}>
      {!embutido && <h3>O que saiu do forno hoje?</h3>}
      <p className="nota-rodape">
        {codigosComFornada && codigosComFornada.size > 0
          ? "Já vem preenchido pelas fornadas marcadas durante o dia. Confira e corrija o que estiver errado."
          : "Tudo já vem marcado como produzido. Desmarque apenas o que não saiu."}{" "}
        É isso que faz a taxa de perda ser calculada sobre a produção real, e não sobre a lista.
      </p>
      {/* O porquê do momento ("no fim do expediente, de uma vez") só
          aparece na versão com moldura própria. Dentro do card do
          Cronograma, dois parágrafos longos empurram as caixas de marcar
          para baixo da dobra — e quem abriu o card veio marcar, não ler. */}
      {!embutido && (
        <p className="nota-rodape">
          Feito no fim do expediente, de uma vez: é o momento em que dá para comparar tudo o que foi
          pedido — pela matriz e pelas filiais — com o que realmente saiu, e ver de imediato onde o
          gargalo travou a produção.
        </p>
      )}

      {plano.sessoes.map((sessao) => (
        <div key={sessao.id} className="grupo-confirmacao">
          <h4>{rotuloDaCategoria(sessao.categoria)}</h4>
          {sessao.itens.map((item) => {
            const saiu = !naoProduzidos.has(item.codigoPdv);
            return (
              <label key={item.codigoPdv} className={`linha-confirmacao ${saiu ? "" : "nao-saiu"}`}>
                <input type="checkbox" checked={saiu} onChange={() => alternar(item.codigoPdv)} />
                <span className="nome-confirmacao">{nomePorCodigo.get(item.codigoPdv) ?? `#${item.codigoPdv}`}</span>
                <span className="qtd-confirmacao">
                  {saiu
                    ? `${totaisPedidos?.get(item.codigoPdv) ?? item.quantidadeUnidades} un`
                    : "não saiu"}
                </span>
              </label>
            );
          })}
        </div>
      ))}

      {planejados.length === 0 && <p className="nota-rodape">Este plano não tem itens.</p>}

      <button type="button" className="primario" disabled={salvando} onClick={confirmar}>
        {salvando
          ? "Confirmando..."
          : naoProduzidos.size === 0
            ? "Confirmar — saiu tudo"
            : `Confirmar — ${naoProduzidos.size} não ${naoProduzidos.size === 1 ? "saiu" : "saíram"}`}
      </button>
      <p className="nota-rodape">Confirmando como {operador}.</p>
    </div>
  );
}
