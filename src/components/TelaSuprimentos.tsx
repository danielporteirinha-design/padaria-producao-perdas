/**
 * src/components/TelaSuprimentos.tsx
 * ---------------------------------------------------------------
 * A filial monta a lista de embalagens e material de limpeza (ago/2026,
 * pedido do dono do negócio).
 *
 * A MESMA FORMA DA LISTA DE PRODUÇÃO, DE PROPÓSITO
 * -------------------------------------------------
 * Sanfona por segmento, toque no item, digita a quantidade, confirma,
 * envia. Quem opera esta tela é a mesma pessoa que monta a lista do dia
 * seguinte, muitas vezes na mesma hora — dois jeitos diferentes de fazer
 * a mesma coisa seria uma segunda coisa para aprender, sem nenhum ganho.
 *
 * O CATÁLOGO CRESCE COM O USO. Item que não está na lista se cadastra
 * daqui mesmo: nome, segmento, e ele passa a existir para as próximas
 * vezes. Mandar a loja pedir à matriz que cadastre uma embalagem nova
 * seria trocar um problema de dois minutos por um de dois dias.
 */

import { useEffect, useMemo, useState } from "react";
import type { Loja } from "../lib/lojas";
import {
  agruparPorSegmento,
  chaveDoSegmento,
  idDoPedidoSuprimentos,
  idDoSuprimento,
  segmentosExibidos,
  type ItemPedidoSuprimento,
  type PedidoSuprimentos,
  type Suprimento,
} from "../types/suprimento";
import { formatarDataBr, horaDoInstante } from "../lib/data";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { contemBusca } from "../lib/texto";
import { CampoDeBusca } from "./CampoDeBusca";
import { AssistenteDeVoz } from "./AssistenteDeVoz";
import type { Produto } from "../types/produto";
import { IconeCalendario, IconeConfere, IconeSeta } from "./Icones";

/** "polpa de frutas" -> "Polpa De Frutas" — só para sugerir um nome
 * legível a partir do que o microfone ouviu. */
function capitalizarNome(bruto: string): string {
  return bruto
    .trim()
    .split(/\s+/)
    .map((parte) => (parte.length > 0 ? parte[0].toUpperCase() + parte.slice(1).toLowerCase() : parte))
    .join(" ");
}

/**
 * SÓ O QUE MEDE, PARA SUGERIR O NOME (set/2026, quando a voz não achou
 * o item). Tira número e palavra de quantidade do que o microfone
 * ouviu — mas, ao contrário de `soONome` (em interpretarPedidoFalado,
 * feito para comparar com o catálogo), MANTÉM "de/da/do": aqui o texto
 * vira o nome do item que vai para o catálogo, e sem a preposição
 * "polpa de fruta" vira o errado "polpa fruta".
 */
const PALAVRAS_DE_QUANTIDADE = [
  "UNIDADES", "UNIDADE", "UN",
  "PECAS", "PECA", "ITENS", "ITEM",
  "DUZIA", "DUZIAS",
];
function nomeSugeridoDaSobra(trecho: string): string {
  const palavras = trecho
    .replace(/\d+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0 && !PALAVRAS_DE_QUANTIDADE.includes(p.toUpperCase()));
  return capitalizarNome(palavras.join(" "));
}

interface TelaSuprimentosProps {
  loja: Loja;
  catalogo: Suprimento[];
  pedidos: PedidoSuprimentos[];
  operador: string;
  /** Data de hoje, viva — ver src/lib/useDiaCorrente.ts. */
  hoje: string;
  onCadastrarSuprimento: (suprimento: Suprimento) => Promise<void>;
  onEnviarLista: (pedido: PedidoSuprimentos) => Promise<void>;
  /**
   * Manda a lista para a impressão (set/2026, pedido do dono do
   * negócio). A loja separa o material com o papel na mão, andando pelo
   * estoque — ler do celular enquanto se carrega caixa não funciona.
   */
  onImprimir?: (pedido: PedidoSuprimentos) => void;
}

export function TelaSuprimentos({
  loja,
  catalogo,
  pedidos,
  operador,
  hoje,
  onCadastrarSuprimento,
  onEnviarLista,
  onImprimir,
}: TelaSuprimentosProps) {
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [itemAtivo, setItemAtivo] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  /**
   * O SEGMENTO DEIXOU DE SER UMA PERGUNTA (ago/2026, pedido do dono do
   * negócio: "o usuário fica confuso ao escolher o segmento").
   *
   * Antes o fluxo era: digita o nome → toca em "Cadastrar" → escolhe o
   * segmento entre pastilhas → confirma. Três decisões, uma delas de
   * classificação, no meio do atendimento. Classificar é justamente o
   * tipo de escolha que trava quem está com a fila esperando: nada na
   * tela dizia se "papel toalha" é limpeza ou embalagem.
   *
   * Agora o segmento vem do LUGAR. Dentro de "Embalagens" há um campo
   * "incluir em Embalagens": quem está ali já respondeu a pergunta ao
   * abrir a sanfona. Pela busca, os três segmentos aparecem como três
   * botões que cadastram na hora — uma escolha, um toque, sem confirmar
   * depois.
   *
   * `segmentoCadastrando` guarda em qual sanfona o campo está aberto.
   */
  const [segmentoCadastrando, setSegmentoCadastrando] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [salvandoNovo, setSalvandoNovo] = useState("");
  /**
   * "+ NOVA SESSÃO" (set/2026, pedido do dono do negócio: "queria a
   * opção de salvar uma nova sanfona, com o nome de uma nova sessão").
   *
   * Guarda para QUAL item (o texto buscado, ou o que o microfone não
   * achou) o campo de nome da sessão nova está aberto — o mesmo padrão
   * de `segmentoCadastrando`, um de cada vez.
   */
  const [criandoSessaoPara, setCriandoSessaoPara] = useState<string | null>(null);
  const [novaSessao, setNovaSessao] = useState("");

  /**
   * A lista do dia. Um pedido por loja por dia — reenviar corrige o
   * mesmo documento, como no pedido de produção: a matriz não pode
   * receber duas listas do mesmo dia e ter que adivinhar qual vale.
   */
  const pedidoDeHoje = useMemo(
    () => pedidos.find((p) => p.data === hoje && p.lojaId === loja.id),
    [pedidos, hoje, loja.id]
  );

  const [itens, setItens] = useState<ItemPedidoSuprimento[]>(() => pedidoDeHoje?.itens ?? []);
  /** O microfone está aberto? Enquanto estiver, a busca some da tela. */
  const [ouvindoVoz, setOuvindoVoz] = useState(false);
  const [dataCarregada, setDataCarregada] = useState(hoje);
  if (dataCarregada !== hoje) {
    setDataCarregada(hoje);
    setItens(pedidoDeHoje?.itens ?? []);
    setItemAtivo(null);
  }

  /**
   * Quando o pedido gravado chega da nuvem depois da tela montar (é
   * assíncrono), a lista na tela precisa acompanhar — desde que não haja
   * nada digitado esperando. Sem isto, quem abre a aba antes de a escuta
   * responder veria a lista vazia e mandaria de novo do zero.
   */
  useEffect(() => {
    if (itens.length === 0 && (pedidoDeHoje?.itens.length ?? 0) > 0) {
      setItens(pedidoDeHoje!.itens);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDeHoje]);

  const jaEnviado = pedidoDeHoje?.status === "enviado";
  const quantidadeDe = (id: string) => itens.find((i) => i.suprimentoId === id)?.quantidade ?? 0;
  const totalItens = itens.filter((i) => i.quantidade > 0).length;

  const ativos = useMemo(() => catalogo.filter((s) => s.ativo), [catalogo]);
  /**
   * AS SANFONAS QUE EXISTEM HOJE — as três fixas mais qualquer sessão
   * criada na hora por alguma loja (set/2026). Ver `segmentosExibidos`.
   */
  const segmentosCadastro = useMemo(() => segmentosExibidos(catalogo), [catalogo]);
  const buscando = busca.trim().length > 0;

  const resultados = useMemo(() => {
    const termo = busca.trim();
    if (!termo) return [];
    return ativos.filter((s) => contemBusca(s.nome, termo));
  }, [ativos, busca]);

  /**
   * O item digitado já existe no catálogo? Compara pelo id normalizado,
   * e não pelo texto: "Saco Kraft" e "SACO KRAFT" são o mesmo saco.
   */
  const jaExiste = useMemo(
    () => ativos.some((s) => s.id === idDoSuprimento(busca)),
    [ativos, busca]
  );

  function abrirItem(id: string) {
    if (itemAtivo === id) {
      setItemAtivo(null);
      setValor("");
      return;
    }
    setItemAtivo(id);
    const atual = quantidadeDe(id);
    setValor(atual > 0 ? String(atual) : "");
  }

  function confirmarQuantidade(id: string) {
    if (!ehNumeroValidoPositivo(valor)) return;
    const quantidade = paraNumero(valor);
    setItens((atual) => {
      const existe = atual.some((i) => i.suprimentoId === id);
      return existe
        ? atual.map((i) => (i.suprimentoId === id ? { ...i, quantidade } : i))
        : [...atual, { suprimentoId: id, quantidade }];
    });
    setItemAtivo(null);
    setValor("");
  }

  function removerItem(id: string) {
    setItens((atual) => atual.filter((i) => i.suprimentoId !== id));
    setItemAtivo(null);
  }

  /**
   * Cadastra e devolve o item. Uma função só para os dois caminhos — o
   * campo dentro da sanfona e os botões da busca — porque são a mesma
   * operação com o segmento vindo de lugares diferentes.
   */
  async function cadastrar(nome: string, segmento: string) {
    const limpo = nome.trim();
    if (!limpo || salvandoNovo) return;
    setSalvandoNovo(segmento);
    try {
      const novo: Suprimento = {
        id: idDoSuprimento(limpo),
        nome: limpo,
        segmento,
        ativo: true,
        criadoPor: operador,
        criadoEm: new Date().toISOString(),
      };
      await onCadastrarSuprimento(novo);
      setSegmentoCadastrando(null);
      setNomeNovo("");
      setCriandoSessaoPara(null);
      setNovaSessao("");
      setExpandido({ [chaveDoSegmento(segmento)]: true });
      // O item entra aberto para digitar a quantidade: quem cadastrou
      // veio pedir aquilo, não organizar catálogo.
      setItemAtivo(novo.id);
      setValor("");
      setBusca("");
    } catch {
      /* o aviso global cuida da mensagem */
    } finally {
      setSalvandoNovo("");
    }
  }

  async function enviar() {
    setEnviando(true);
    try {
      const agora = new Date().toISOString();
      await onEnviarLista({
        id: idDoPedidoSuprimentos(hoje, loja.id),
        lojaId: loja.id,
        data: hoje,
        itens: itens.filter((i) => i.quantidade > 0),
        status: "enviado",
        criadoPor: pedidoDeHoje?.criadoPor ?? operador,
        criadoEm: pedidoDeHoje?.criadoEm ?? agora,
        enviadoEm: agora,
      });
    } catch {
      /* mensagem vem do aviso global (ver App.tsx) */
    } finally {
      setEnviando(false);
    }
  }

  /** A linha é a mesma na busca e nas sanfonas — um jeito só de pedir. */
  function linhaDoSuprimento(suprimento: Suprimento) {
    const quantidade = quantidadeDe(suprimento.id);
    const editando = itemAtivo === suprimento.id;
    return (
      <div key={suprimento.id} className="linha-produto-cronograma">
        <button
          type="button"
          className={`item-produto ${quantidade > 0 ? "confirmado" : ""}`}
          onClick={() => abrirItem(suprimento.id)}
        >
          <span>{suprimento.nome}</span>
          {quantidade > 0 && <span className="valor-confirmado">{quantidade} ✓</span>}
        </button>

        {editando && (
          <div className="editor-quantidade">
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              autoFocus
              placeholder="Quantas unidades?"
              aria-label={`Quantidade de ${suprimento.nome}`}
              value={valor}
              onChange={(e) => setValor(sanitizarEntradaNumerica(e.target.value))}
            />
            <button
              type="button"
              className="primario"
              disabled={!ehNumeroValidoPositivo(valor)}
              onClick={() => confirmarQuantidade(suprimento.id)}
            >
              Confirmar
            </button>
          </div>
        )}

        {quantidade > 0 && !editando && (
          <button type="button" className="link" onClick={() => removerItem(suprimento.id)}>
            remover
          </button>
        )}
      </div>
    );
  }

  /**
   * OS BOTÕES DE "ONDE ESTE ITEM MORA" — usados tanto por quem digitou e
   * não achou quanto pelo que o microfone não reconheceu (set/2026,
   * pedido do dono do negócio: "sugerir ao usuário salvar o pedido em
   * uma das sessões, inclusive... salvar uma nova sanfona, com o nome
   * de uma nova sessão").
   *
   * Mesma pergunta, dois pontos de entrada. As sessões já existentes —
   * fixas e as criadas na hora por qualquer loja — aparecem como
   * pastilhas de um toque; "+ nova sessão" abre um campo para batizar
   * uma sanfona que ainda não existe.
   */
  function opcoesDeIncluir(nome: string) {
    const criandoAqui = criandoSessaoPara === nome;
    return (
      <div className="cadastro-relampago">
        <p className="nota-rodape">
          Incluir <strong>{nome}</strong> em:
        </p>
        <div className="setores-do-novo">
          {segmentosCadastro.map((segmento) => {
            const valorGravado = segmento.personalizado ? segmento.rotulo : segmento.chave;
            return (
              <button
                key={segmento.chave}
                type="button"
                className="chip-setor"
                disabled={salvandoNovo !== ""}
                onClick={() => void cadastrar(nome, valorGravado)}
              >
                {salvandoNovo === valorGravado ? "Salvando..." : segmento.rotulo}
              </button>
            );
          })}
          <button
            type="button"
            className="chip-setor chip-setor-nova"
            disabled={salvandoNovo !== ""}
            onClick={() => {
              setCriandoSessaoPara(criandoAqui ? null : nome);
              setNovaSessao("");
            }}
          >
            + nova sessão
          </button>
        </div>

        {criandoAqui && (
          <div className="incluir-item">
            <input
              type="text"
              autoFocus
              placeholder="Nome da nova sessão"
              aria-label="Nome da nova sessão"
              value={novaSessao}
              onChange={(e) => setNovaSessao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && novaSessao.trim().length >= 2) {
                  void cadastrar(nome, novaSessao.trim());
                }
              }}
            />
            <button
              type="button"
              className="primario"
              disabled={novaSessao.trim().length < 2 || salvandoNovo !== ""}
              onClick={() => void cadastrar(nome, novaSessao.trim())}
            >
              {salvandoNovo === novaSessao.trim() ? "..." : "Criar"}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setCriandoSessaoPara(null);
                setNovaSessao("");
              }}
            >
              cancelar
            </button>
          </div>
        )}
      </div>
    );
  }

  /**
   * O QUE OFERECER PARA UM TRECHO QUE O MICROFONE NÃO RECONHECEU
   * (set/2026). `soONome` já tira número e palavra de medida — o que
   * sobra é o nome candidato, só arrumado para exibição.
   */
  function opcoesParaSobra(trecho: string) {
    const nome = nomeSugeridoDaSobra(trecho) || trecho.trim();
    if (!nome) return null;
    return opcoesDeIncluir(nome);
  }

  const resumo = agruparPorSegmento(itens, catalogo);

  return (
    <div className="tela">
      <div className="destaque-data bloco-pedido">
        <IconeCalendario tamanho={20} />
        <div className="texto-bloco-pedido">
          <span className="titulo-planejamento">Suprimentos de {formatarDataBr(hoje)}</span>
          <span className="estado-pedido">
            {jaEnviado ? (
              <>
                <IconeConfere tamanho={14} /> enviado
                {horaDoInstante(pedidoDeHoje?.enviadoEm) ? ` às ${horaDoInstante(pedidoDeHoje?.enviadoEm)}` : ""}
              </>
            ) : (
              "não enviado — a matriz ainda não recebeu esta lista"
            )}
          </span>
        </div>
      </div>

      {/* PEDIR SUPRIMENTO FALANDO (set/2026, pedido do dono do negócio).
          O mesmo assistente da Reposição, com o catálogo de suprimentos
          no lugar do de produtos.

          O ASSISTENTE FALA A LÍNGUA DE `Produto`, e suprimento não é
          produto — tem `id` de texto, não código de PDV. Em vez de
          generalizar o componente (e mexer nas três telas que já o
          usam), o catálogo é traduzido aqui: cada suprimento ganha um
          número de linha, e o número volta a ser suprimento na
          confirmação. A tradução é local e morre nesta tela. */}
      <AssistenteDeVoz
        produtos={ativos.map(
          (s, indice) =>
            ({ codigoPdv: indice, nome: s.nome, ativoNaProducao: true }) as unknown as Produto
        )}
        modo="pedir"
        acao="adicionar"
        onOuvindoMudou={setOuvindoVoz}
        onConfirmar={async (ditados) => {
          for (const ditado of ditados) {
            const suprimento = ativos[ditado.produto.codigoPdv];
            if (!suprimento || !ditado.quantidade || ditado.quantidade <= 0) continue;
            // Mesma regra da digitação: o falado SOMA ao que já está na
            // lista, e a linha continua editável antes do envio.
            setItens((atual) => {
              const existe = atual.find((i) => i.suprimentoId === suprimento.id);
              return existe
                ? atual.map((i) =>
                    i.suprimentoId === suprimento.id
                      ? { ...i, quantidade: i.quantidade + ditado.quantidade! }
                      : i
                  )
                : [...atual, { suprimentoId: suprimento.id, quantidade: ditado.quantidade! }];
            });
            setExpandido({ [chaveDoSegmento(suprimento.segmento)]: true });
          }
        }}
        renderSobra={opcoesParaSobra}
      />

      {!ouvindoVoz && (
      <CampoDeBusca
        valor={busca}
        onMudar={setBusca}
        placeholder="Buscar produto, embalagem ou material..."
        rotulo="Buscar suprimento pelo nome"
      >
        {buscando && (
          <button type="button" className="link" onClick={() => setBusca("")}>
            limpar
          </button>
        )}
      </CampoDeBusca>
      )}

      {buscando ? (
        <>
          {resultados.map((s) => linhaDoSuprimento(s))}

          {/*
            NÃO ACHOU = TRÊS BOTÕES, UM TOQUE CADA (ago/2026, pedido do
            dono do negócio).

            A versão anterior pedia "Cadastrar" → escolher o segmento →
            confirmar. Aqui o nome já está digitado e a única coisa que
            falta é onde ele mora: cada botão diz o destino e cadastra.
            A pergunta "em qual segmento?" desapareceu — a resposta É o
            botão que se toca.
          */}
          {!jaExiste && busca.trim().length >= 2 && opcoesDeIncluir(busca.trim())}
        </>
      ) : (
        segmentosCadastro.map((segmento) => {
          const lista = ativos.filter((s) => chaveDoSegmento(s.segmento) === segmento.chave);
          const aberto = !!expandido[segmento.chave];
          const pedidosNoSegmento = lista.filter((s) => quantidadeDe(s.id) > 0).length;

          return (
            <div key={segmento.chave} className={`acordeao-sessao ${aberto ? "aberta" : ""}`}>
              <div className="cabecalho-sessao">
                <button
                  type="button"
                  className="abrir-sessao"
                  aria-expanded={aberto}
                  onClick={() =>
                    /* Uma sanfona aberta por vez, como no resto do app
                       (set/2026): duas listas abertas juntas empurram a
                       de baixo para fora da tela do celular. */
                    setExpandido((a) => (a[segmento.chave] ? {} : { [segmento.chave]: true }))
                  }
                >
                  <span className="nome-sessao">{segmento.rotulo}</span>
                  <span className="contagem-itens">
                    {pedidosNoSegmento > 0
                      ? `${pedidosNoSegmento} ${pedidosNoSegmento === 1 ? "item" : "itens"}`
                      : ""}
                  </span>
                  <IconeSeta className="seta-sessao" />
                </button>
              </div>

              {aberto && (
                <div className="corpo-sessao">
                  {lista.length === 0 && (
                    <p className="nota-rodape">Nada cadastrado aqui ainda.</p>
                  )}
                  {lista.map((s) => linhaDoSuprimento(s))}

                  {/* O SEGMENTO VEM DO LUGAR, não de uma pergunta: quem
                      abriu esta sanfona já respondeu onde o item mora. É
                      um campo e um botão, no fim da lista onde a pessoa
                      acabou de procurar e não achou. */}
                  {segmentoCadastrando === segmento.chave ? (
                    <div className="incluir-item">
                      <input
                        type="text"
                        autoFocus
                        placeholder={`Nome do item`}
                        aria-label={`Nome do item novo em ${segmento.rotulo}`}
                        value={nomeNovo}
                        onChange={(e) => setNomeNovo(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            void cadastrar(
                              nomeNovo,
                              segmento.personalizado ? segmento.rotulo : segmento.chave
                            );
                        }}
                      />
                      <button
                        type="button"
                        className="primario"
                        disabled={nomeNovo.trim().length < 2 || salvandoNovo !== ""}
                        onClick={() =>
                          void cadastrar(
                            nomeNovo,
                            segmento.personalizado ? segmento.rotulo : segmento.chave
                          )
                        }
                      >
                        {salvandoNovo === (segmento.personalizado ? segmento.rotulo : segmento.chave)
                          ? "..."
                          : "Incluir"}
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          setSegmentoCadastrando(null);
                          setNomeNovo("");
                        }}
                      >
                        cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="link incluir-abrir"
                      onClick={() => {
                        setSegmentoCadastrando(segmento.chave);
                        setNomeNovo("");
                      }}
                    >
                      + incluir em {segmento.rotulo}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* O resumo do que vai ser mandado, fora das sanfonas: com os
          segmentos fechados, é a única forma de conferir a lista inteira
          sem abrir um por um. */}
      {totalItens > 0 && !buscando && (
        <div className="resumo-suprimentos">
          {resumo.map((grupo) => (
            <div key={grupo.chave} className="sessao-do-card">
              <h4>{grupo.rotulo}</h4>
              {grupo.itens.map((item) => (
                <div key={item.nome} className="item-da-loja">
                  <span className="nome-item-loja">{item.nome}</span>
                  <span className="qtd-item-loja">{item.quantidade}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="primario largura-cheia"
        disabled={enviando || totalItens === 0}
        onClick={enviar}
      >
        {enviando ? "Enviando..." : jaEnviado ? "Atualizar" : `Enviar (${totalItens})`}
      </button>

      {/* IMPRIMIR A LISTA (set/2026). Imprime o que está montado agora —
          enviado ou não —, porque quem vai separar o material precisa do
          papel na mão antes de a matriz responder qualquer coisa. */}
      {onImprimir && totalItens > 0 && (
        <button
          type="button"
          className="secundario largura-cheia"
          onClick={() =>
            onImprimir({
              id: idDoPedidoSuprimentos(hoje, loja.id),
              lojaId: loja.id,
              data: hoje,
              itens: itens.filter((i) => i.quantidade > 0),
              status: pedidoDeHoje?.status ?? "rascunho",
              criadoPor: pedidoDeHoje?.criadoPor ?? operador,
              criadoEm: pedidoDeHoje?.criadoEm ?? new Date().toISOString(),
              enviadoEm: pedidoDeHoje?.enviadoEm,
            })
          }
        >
          Imprimir lista ({totalItens})
        </button>
      )}
      <p className="nota-rodape">Enviando como {operador}, pela {loja.nome}.</p>
    </div>
  );
}
