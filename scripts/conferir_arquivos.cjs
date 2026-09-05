/**
 * scripts/conferir_arquivos.cjs
 * ---------------------------------------------------------------
 * Confere se a cópia local do projeto está COMPLETA e ATUALIZADA.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * O projeto é atualizado aplicando um pacote por cima da pasta. Quando
 * um arquivo não chega ao lugar certo — pacote extraído numa subpasta,
 * arquivo não sobrescrito, `git add` que pegou o que não devia — o app
 * continua compilando e rodando: só que rodando a versão ANTIGA. Nada na
 * tela avisa, e a conclusão natural é "o recurso não foi feito".
 *
 * Isso aconteceu de verdade, mais de uma vez, e custou dias de conversa
 * (ago/2026). Este script troca "acho que não veio" por uma resposta.
 *
 * COMO FUNCIONA
 * -------------
 * Cada recurso entregue deixa uma MARCA no código — um trecho que só
 * existe se aquele arquivo estiver na versão certa. O script procura a
 * marca no arquivo e diz OK, FALTANDO (arquivo não existe) ou
 * DESATUALIZADO (existe, mas sem a marca).
 *
 * Não substitui os testes: `npm run verificar` diz se a LÓGICA está
 * certa; este diz se os ARQUIVOS certos estão no disco. São perguntas
 * diferentes, e só a segunda explica "apliquei o pacote e nada mudou".
 *
 * Rodar: npm run conferir
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");

/**
 * Marca = um pedaço de texto que só existe naquele arquivo depois de
 * determinada entrega. Preferimos trechos estáveis (nome de função, id de
 * coleção, classe de CSS) a frases de interface, que mudam com o texto.
 */
const CONFERENCIAS = [
  // --- Anúncio encerrado: matriz tira da vitrine e as filiais param de ver
  ["src/types/anuncio.ts", "idDoEncerramento", "Anúncio encerrado (tirar da vitrine)"],
  ["src/data/repositorio.ts", "listarAnunciosEncerrados", "Repositório: anúncios encerrados"],
  ["src/data/repositorioFirestore.ts", "anuncios_encerrados", "Firestore: coleção dos anúncios"],
  ["firestore.rules", "anuncios_encerrados", "Regras do Firestore (colar no console!)"],
  ["src/components/PainelFornoDeHoje.tsx", "onEncerrarAnuncio", "Matriz: tirar item da lista"],
  ["src/components/PainelFornadasFilial.tsx", "encerrados.has", "Filial: respeita o que a matriz tirou"],

  // --- Matriz: a lista pronta do cronograma saiu; ficou voz + busca + sanfonas
  ["src/components/PainelFornoDeHoje.tsx", "montarLinhasDaMatriz", "Matriz: anunciar por voz ou busca"],
  ["src/lib/reposicaoDoDia.ts", "montarLinhasDaMatriz", "Matriz: as duas sanfonas"],
  ["src/index.css", "tirar-da-lista", "Estilo do botão de tirar da lista"],

  // --- Filial: esconder aviso da própria tela
  ["src/lib/fornadasDispensadas.ts", "dispensarFornada", "Filial: excluir aviso"],

  // --- Busca e voz
  // O microfone SAIU do campo de busca (ago/2026): ficou um por tela, no
  // assistente. Dois microfones com resultados diferentes na mesma tela
  // faziam a pessoa tocar no errado e concluir que a voz não funciona.
  ["src/components/CampoDeBusca.tsx", "campo-com-voz", "Campo de busca (sem microfone)"],
  ["src/lib/vozParaBusca.ts", "ouvirUmaFrase", "Reconhecimento de voz"],
  ["api/interpretar-busca.ts", "interpretar", "IA que casa a fala com o catálogo"],

  // --- Reposição da filial: montar a lista e enviar de uma vez
  ["src/lib/rascunhoReposicao.ts", "gravarRascunhoReposicao", "Reposição: lista em montagem"],
  ["src/lib/reposicaoDoDia.ts", "montarLinhasDoDia", "Reposição: as duas sanfonas"],
  ["src/components/PainelFornadasFilial.tsx", "etiqueta-origem", "Reposição: avisos da matriz nas sanfonas"],
  ["src/components/AssistenteDeVoz.tsx", "NÃO LIMPA A LISTA", "Voz: falar de novo acrescenta"],
  ["api/entrar-como-loja.ts", "diagnostico", "Entrada sem senha: diagnóstico"],

  // --- Sugestão por IA
  ["src/lib/sugestaoProducao.ts", "montarHistoricoDaFilial", "IA: sugestão para a filial"],
  ["src/components/TelaPedidoFilial.tsx", "gerarSugestaoIA", "Filial: botão de sugerir com IA"],
  ["src/components/TelaCronograma.tsx", "gerarSugestaoIA", "Matriz: botão de sugerir com IA"],

  // --- O aviso é desenhado pelo NAVEGADOR, e não pelo service worker
  ["api/notificar-fornada.ts", "webpush: {", "Aviso com bloco notification"],
  ["src/lib/concluidosVistos.ts", "marcarConcluidosVistos", "Sino nos concluidos nao lidos"],
  ["src/lib/somDeAviso.ts", "não um teto de repetições", "Campainha toca ate abrir a notificacao"],
  ["src/types/pedido.ts", "decidirItemDaReposicao", "Matriz decide item por item"],
  ["src/App.tsx", "handleDecidirSuprimentos", "Matriz responde a lista de suprimentos"],
  ["firestore.rules", "A MATRIZ RESPONDE À LISTA DE SUPRIMENTOS", "Regra: matriz responde suprimentos (COLAR NO CONSOLE!)"],
  ["src/components/TelaSuprimentos.tsx", "Imprimir lista", "Filial imprime a lista de suprimentos"],
  ["src/components/TelaSuprimentos.tsx", "AssistenteDeVoz", "Suprimentos por voz"],
  ["src/components/AssistenteDeVoz.tsx", "sinal-", "Botao do microfone sinaliza acerto/erro"],
  ["src/lib/somDeAviso.ts", "tocarErroSonoro", "Som de erro do microfone"],
  ["src/lib/fornadasDispensadas.ts", "Dispensas", "Dispensa com hora: fornada nova pede decisao"],

  // --- Avisos e impressão
  ["src/App.tsx", "avisarMatrizDoPedido", "Aviso e impressão em paralelo"],
  ["src/lib/avisarFiliais.ts", "SEGUNDOS_ATE_DESISTIR_DO_AVISO", "Limite de espera do aviso"],
  ["src/lib/avisarFiliais.ts", "dispararAviso", "Avisos: um endereco so, autenticado"],
  ["src/lib/avisarFiliais.ts", "avisarListaEnviada", "Aviso de lista enviada"],
  ["src/lib/blocosDeImpressao.ts", "agruparPorCategoria", "Setores na mesma ordem em todo papel"],
  ["public/firebase-messaging-sw.js", "tocar-aviso", "Som com a janela em segundo plano"],
  ["src/lib/somDeAviso.ts", "PARCIAIS", "Campainha"],

  // --- Virada de dia, instalação, aparência
  ["src/lib/useDiaCorrente.ts", "useDiaCorrente", "Virada da meia-noite"],
  ["src/lib/dataAlvoDoDia.ts", "proximaDataAlvo", "Data-alvo avança sozinha"],
  ["src/lib/instalacao.ts", "beforeinstallprompt", "Convite de instalação"],
  ["src/components/TelaLogin.tsx", "BannerInstalar", "Instalar na tela de entrada"],
  ["src/lib/atualizacao.ts", "onNeedRefresh", "Aviso de versão nova"],
  ["vite.config.ts", '"#ffffff"', "Splash branco"],
  ["src/index.css", "SEM PLACA ATRÁS DA MARCA", "Logo sem placa branca na entrada"],
  ["scripts/gerar_icones.py", "FUNDO_ICONE", "Ícones com fundo branco"],

  // --- Reposição enxuta
  ["src/index.css", "pastilha-escondidos", "Reposição: pastilha no lugar do texto longo"],

  // --- Resposta da matriz à reposição
  ["src/components/PainelFornadasFilial.tsx", "reposicao-confirmada", "Filial: resposta 'separado' em destaque"],
  ["src/App.tsx", "avisarFilialDoDesfecho", "Aviso do desfecho em paralelo"],

  // --- Cronograma: cada loja lança no card dela; título abre a data
  ["src/components/TelaCronograma.tsx", "listaDaFilial", "Cronograma: cada loja no card dela"],
  ["src/index.css", "escolha-de-data", "Título do dia abre a troca de data"],

  // --- Reposição: lista do mais recente para o mais antigo
  ["src/lib/ordemDaReposicao.ts", "ordenarPorAnuncioRecente", "Reposição: anúncios mais recentes no topo"],

  // --- Logomarca sem fundo na tela de entrada
  ["scripts/gerar_icones.py", "cinza_claro", "Logo recortada por regiao (sem casca clara)"],

  // --- Reposição: cadastro relâmpago e botões da filial
  ["src/components/PainelFornoDeHoje.tsx", "cadastrarEAnunciar", "Matriz: cadastrar produto na hora"],
  ["src/components/PainelFornadasFilial.tsx", "botao-fornada", "Filial: Pedir e Excluir do mesmo tamanho"],
  ["src/index.css", "chip-setor", "Estilo do cadastro relampago"],

  // --- Anúncio de fornada de mãos livres
  ["src/components/AssistenteDeVoz.tsx", "AssistenteDeVoz", "Assistente: uma frase, uma confirmacao"],
  ["src/components/PainelFornadasFilial.tsx", "AssistenteDeVoz", "Filial: pedir reposicao falando"],
  ["src/components/TelaPedidoFilial.tsx", "adicionarPorVoz", "Filial: montar a lista de producao falando"],
  ["src/components/PainelFornoDeHoje.tsx", "AssistenteDeVoz", "Matriz: anunciar falando"],
  ["src/lib/interpretarPedidoFalado.ts", "interpretarFrase", "Frase inteira vira lista de itens"],
  ["src/lib/vozRespostas.ts", "entenderQuantidade", "Entender a quantidade dita"],
  ["src/types/fornada.ts", "quantidade?", "Quantidade no anuncio"],

  // --- Suprimentos (embalagens e material de limpeza)
  ["src/types/suprimento.ts", "idDoSuprimento", "Modelo de suprimentos"],
  ["src/components/TelaSuprimentos.tsx", "onEnviarLista", "Filial: aba Suprimentos"],
  ["src/components/PainelFornoDeHoje.tsx", "ehSuprimentos", "Matriz: suprimentos na linha do tempo da loja"],
  ["src/components/TelaSuprimentos.tsx", "incluir em", "Cadastro de suprimento sem escolher segmento"],
  ["src/types/suprimento.ts", "chaveDoSegmento", "Suprimentos: segmento antigo nao some da lista"],
  ["src/data/repositorioFirestore.ts", "pedidos_suprimentos", "Firestore: colecao dos suprimentos"],
  ["firestore.rules", "pedidos_suprimentos", "Regras dos suprimentos (COLAR NO CONSOLE!)"],
  ["src/lib/avisarFiliais.ts", "avisarListaDeSuprimentos", "Aviso de suprimentos"],
  ["src/App.tsx", "loja-atual", "Cabecalho sem titulo duplicado"],

  // --- Cronograma: cards autônomos por loja
  ["src/types/pedido.ts", "ajustarPedidoPelaMatriz", "Matriz confirma a lista da filial"],
  ["src/components/TelaCronograma.tsx", "confirmarListaDaLoja", "Revisar/editar/confirmar por loja"],
  ["src/components/TelaCronograma.tsx", "botao-lista-producao", "Botao de imprimir a lista da producao"],
  ["src/components/TelaPedidoFilial.tsx", "aviso-corte", "Filial ve o que a matriz cortou"],
  ["src/lib/gerarImagemLista.ts", "computarBlocosContinuos", "Lista da loja: um cabecalho, um rodape"],
  ["src/lib/gerarImagemLista.ts", "VERMELHO_MARCA", "Cupom: loja em vermelho, data sem faixa preta"],
  ["src/components/PainelFornoDeHoje.tsx", "hora-reposicao", "Hora da solicitacao na Reposicao"],
  ["src/lib/reposicaoDoDia.ts", "localeCompare", "Reposicoes: recentes primeiro"],
  ["src/components/TelaPerdas.tsx", "ultimo-lancamento", "Perdas sem a tabela do dia"],
  ["src/index.css", "ABAS DE LARGURA IGUAL", "Abas alinhadas e centradas"],
  ["src/lib/avisarFiliais.ts", "avisarListaAjustada", "Aviso de lista ajustada"],
  ["api/notificar-fornada.ts", "listaAjustada", "Servidor: aviso de lista ajustada"],
  ["firestore.rules", "ajusteDaMatriz", "Regras: matriz pode ajustar (COLAR NO CONSOLE!)"],

  // --- Rascunho do pedido da filial
  ["src/lib/rascunhoLocal.ts", "chavesVencidas", "Base comum dos rascunhos"],
  ["src/lib/rascunhoPedido.ts", "chaveDoRascunhoPedido", "Programacao da filial sobrevive a troca de aba"],
  ["src/components/TelaPedidoFilial.tsx", "gravarRascunhoPedido", "Filial: itens excluidos nao voltam"],

  // --- Rascunho do cronograma
  ["src/lib/rascunhoCronograma.ts", "mapasIguais", "Rascunho do cronograma sobrevive à troca de aba"],

  // --- Análises
  ["src/lib/analises.ts", "fornecimento", "Análises: denominador por loja"],
  ["src/lib/analises.ts", "fornadasPorFaixaDeHora", "Análises: relatório do forno"],
  ["src/lib/producaoDeHoje.ts", "incluirItemProduzido", "Reposição entra na produção do dia"],

  // --- Suprimentos nas sanfonas, e o aviso com os itens (set/2026)
  ["src/lib/reposicaoDoDia.ts", "origem: \"suprimentos\"", "Filial: suprimentos cobram na sanfona"],
  ["src/types/suprimento.ts", "itensComNome", "Suprimentos: id traduzido para nome"],
  ["src/lib/avisarFiliais.ts", "itensSuprimentos", "Aviso de suprimentos leva os itens"],
  ["api/notificar-fornada.ts", "corpoDaListaDeSuprimentos", "Servidor: aviso de suprimentos detalhado"],
  ["src/components/PainelFornoDeHoje.tsx", "itensDaLista", "Matriz le a lista de suprimentos na sanfona"],
  ["src/components/PainelFornoDeHoje.tsx", "onImprimirReposicao", "Imprimir/compartilhar pedido da filial voltou para a matriz"],

  // --- Aviso de atualizacao do app (set/2026)
  ["api/notificar-atualizacao.ts", "CHAVE_NOTIFICAR_ATUALIZACAO", "Servidor: aviso de atualizacao disponivel"],
  ["api/notificar-atualizacao.ts", "requireInteraction", "Aviso de atualizacao fica na tela ate abrir"],
  [".github/workflows/notificar-atualizacao.yml", "notificar-atualizacao", "Deploy dispara o aviso de atualizacao sozinho"],
  ["src/lib/atualizacao.ts", "visibilitychange", "Checa versao nova ao reabrir o app, sem precisar reiniciar"],

  // --- Suprimentos: sessao nova pela voz ou pela busca (set/2026)
  ["src/lib/interpretarPedidoFalado.ts", "export function soONome", "So o nome, exportado para sugerir item novo"],
  ["src/components/AssistenteDeVoz.tsx", "renderSobra", "Tela pode oferecer acao propria pro que a voz nao achou"],
  ["src/types/suprimento.ts", "segmentosExibidos", "Sessao criada na hora vira sanfona propria"],
  ["src/types/suprimento.ts", "personalizado", "Sessao propria nao cai mais em Outros"],
  ["src/components/TelaSuprimentos.tsx", "opcoesDeIncluir", "Nao achou (por voz ou busca) oferece criar sessao nova"],

  // --- Lista de Producao de volta para matriz e filiais (set/2026)
  ["src/App.tsx", "\"cronograma\", // (matriz", "Lista de Producao liberada para a matriz"],
  ["src/App.tsx", "\"pedido\", // (filial", "Lista de Producao liberada para as filiais"],

  // --- Permissao de aviso: soneca vence sozinha, reconfere ao voltar (set/2026)
  ["src/components/AtivarAvisos.tsx", "aindaDispensado", "Agora nao vira soneca, nao apagao definitivo"],
  ["src/components/AtivarAvisos.tsx", "reconferir", "Permissao de aviso reconferida ao reabrir o app"],
  ["src/App.tsx", "registrarAparelhoSePermitido(lojaId, operador)", "Aparelho registrado de novo ao reabrir o app"],

  // --- Voz na Lista de Producao da matriz, som e aviso urgente (set/2026)
  ["src/components/TelaCronograma.tsx", "adicionarPorVoz", "Matriz tambem monta a Lista de Producao por voz"],
  ["public/firebase-messaging-sw.js", "parar-aviso", "Clicar na notificacao para a campainha"],
  ["src/App.tsx", "\"parar-aviso\"", "App escuta o clique na notificacao para parar a campainha"],
  [".github/workflows/notificar-atualizacao.yml", "workflow_dispatch", "Aviso de atualizacao pode ser disparado na mao, para testar"],

  // --- Suprimentos: tela sempre em branco, soma no envio (set/2026)
  ["src/components/TelaSuprimentos.tsx", "itensMesclados", "Suprimentos: novo pedido soma ao que ja foi enviado hoje"],
  ["src/components/PainelFornadasFilial.tsx", "linhaDeSuprimentos", "Status do pedido de suprimentos mora na Reposicao"],

  // --- Cadastro relampago de produto, matriz e filiais (set/2026)
  ["src/components/PainelFornadasFilial.tsx", "cadastrarProdutoNovo", "Filial cadastra produto novo direto na Reposicao"],
  ["src/components/TelaCronograma.tsx", "cadastrarProduto", "Matriz cadastra produto novo direto na Lista de Producao"],
  ["src/components/TelaPedidoFilial.tsx", "cadastrarProduto", "Filial cadastra produto novo direto na Lista de Producao"],
  ["src/App.tsx", "onCadastrarProduto={handleCadastroRelampago}", "Cadastro relampago ligado nas tres telas novas"],

  // --- Sanfona exclusiva na Lista de Producao da matriz (set/2026)
  ["src/components/TelaCronograma.tsx", "UM CARD ABERTO POR VEZ", "So uma sanfona aberta por vez, matriz ou filial"],

  // --- Bug: item cadastrado por voz/busca sumia da sanfona (set/2026)
  ["src/types/suprimento.ts", "BUG CORRIGIDO (set/2026)", "Segmento fixo normalizado, item nao some mais da sanfona"],
  ["src/components/TelaSuprimentos.tsx", "quantidadeSugeridaDaSobra", "Quantidade falada aproveitada ao cadastrar suprimento por voz"],

  // --- Caption de busca por voz com movimento (set/2026)
  ["src/components/AssistenteDeVoz.tsx", "processando-voz", "Aviso de IA pensando com spinner, nao so texto parado"],

  // --- Exclusao de suprimentos pela matriz (set/2026)
  ["src/data/repositorio.ts", "excluirSuprimentos", "Repositorio sabe excluir suprimento"],
  ["src/components/TelaCadastroProdutos.tsx", "onExcluirSuprimentos", "Matriz exclui suprimento cadastrado"],

  // --- Horario de silencio no aviso de atualizacao (set/2026)
  [".github/workflows/notificar-atualizacao.yml", "Confere se esta dentro do horario permitido", "Push de atualizacao respeita horario de silencio"],
  ["api/notificar-atualizacao.ts", "dentroDoHorarioPermitido", "Endpoint tambem respeita o horario de silencio"],

  // --- Impressao do comprovante de Reposicao (set/2026)
  ["src/types/pedido.ts", "decidirItensPendentesDaReposicao", "Aceitar de uma vez todos os itens pendentes de um pedido"],
  ["src/lib/gerarImagemLista.ts", "ALTURA_SUBTITULO_CABECALHO", "Impressao continua aceita um subtitulo no cabecalho"],
  ["src/lib/gerarImagemLista.ts", "subtituloPadrao", "Subtitulo repassado as pecas do formato continuo"],
  ["src/components/ExportarFita.tsx", "subtitulo?: string", "Tela de exportar fita repassa o subtitulo"],
  ["src/components/PainelFornoDeHoje.tsx", "onImprimirTodasReposicoes", "Botao Imprimir todos na sanfona Pedidos sem resposta"],
  ["src/components/PainelFornoDeHoje.tsx", "perguntaImprimir", "Pergunta se imprime apos aceitar o ultimo item pendente"],
  ["src/App.tsx", "handleImprimirTodasReposicoes", "Fila de impressao: um comprovante por filial"],
  ["src/App.tsx", "subtitulo=\"Pedido de Reposição\"", "Comprovante de reposicao mostra o subtitulo no cabecalho"],

  // --- Lista personalizada na sanfona Pedidos concluidos (set/2026)
  ["src/components/PainelFornoDeHoje.tsx", "montarSessoesSelecionadas", "Selecionar itens concluidos e montar comprovante unico"],
  ["src/components/PainelFornoDeHoje.tsx", "onImprimirSelecionados", "Botao Imprimir selecionados na sanfona Pedidos concluidos"],
  ["src/components/PainelFornoDeHoje.tsx", "podeSelecionar", "Checkbox so aparece em item confirmado"],
  ["src/components/ExportarFita.tsx", "inicioDeDestino?: string", "Fita aceita agrupar mais de uma filial no mesmo comprovante"],
  ["src/App.tsx", "listaSelecionadaParaImprimir", "Tela da lista personalizada, agrupada por filial"],

  // --- Atualizacao automatica + aviso de novidades (set/2026)
  ["src/lib/atualizacao.ts", "armarAplicacaoSozinha", "Atualiza sozinho quando a aba fica em segundo plano"],
  ["src/components/AvisoDeAtualizacao.tsx", "ou toque para já", "Faixa explica que nao precisa mais tocar para atualizar"],
  ["src/data/novidades.ts", "export const NOVIDADES", "Lista do que mudou, entrega por entrega"],
  ["src/components/NovidadesDoApp.tsx", "novidades-ultima-vista", "Aviso de novidades guarda o que o aparelho ja viu"],
  ["src/main.tsx", "NovidadesDoApp", "Aviso de novidades montado fora do App"],

  // --- Matriz volta a cadastrar produtos (set/2026)
  ["src/App.tsx", '"cadastro", // (matriz — Produtos)', "Aba Produtos liberada de novo para a matriz"],

  // --- Microfone fixo no rodape e retorno automatico a Reposicao (set/2026)
  ["src/index.css", ".botao-assistente {\n  position: fixed;", "Botao de voz fixo, ao alcance do polegar"],
  ["src/index.css", "padding-bottom: calc(104px", "Tela reserva espaco para o botao flutuante do microfone"],
  ["src/App.tsx", 'irParaAba("fornada");\n  }\n\n  async function handleAnularPerda', "Confirmar Lista de Producao (matriz) volta para a Reposicao"],
  ["src/App.tsx", "await avisarMatrizDoPedido(pedido);", "Enviar pedido (filial) volta para a Reposicao antes de avisar"],
  ["src/App.tsx", "a navegação não espera a rede", "Enviar suprimentos (filial) volta para a Reposicao"],
  ["src/components/PainelFornadasFilial.tsx", "onCadastrarSuprimento", "Reposicao e Suprimentos numa aba so"],
  ["src/components/PainelFornadasFilial.tsx", "OFFSET_SUPRIMENTO", "Microfone reconhece produto e suprimento juntos"],
  ["src/components/PainelFornadasFilial.tsx", "enviarTudo", "Um Enviar manda os dois pedidos"],
  ["src/components/PainelFornadasFilial.tsx", "cadastroRelampago", "Cadastro relampago decide produto ou suprimento"],
  ["src/lib/adivinharSuprimento.ts", "adivinharSegmentoSuprimento", "Palpite de segmento por palavra-chave"],
  ["src/components/AssistenteDeVoz.tsx", "remover: () => void", "Descartar so o trecho que a voz nao entendeu"],
  ["src/App.tsx", "onCadastrarSuprimento={handleCadastrarSuprimento}", "Reposicao da filial ganha os handlers de suprimentos"],
  ["src/lib/rota.ts", "ALIAS_DE_ABA", "Push antigo de suprimentos cai na Reposicao"],
  ["src/index.css", "chip-setor.sugerido", "Pastilha do segmento sugerido"],

  // --- Ajustes finos pos-teste da Reposicao combinada (set/2026)
  ["src/components/PainelFornadasFilial.tsx", "etiqueta-tipo-discreta", "Etiqueta de suprimento discreta, abaixo do nome"],
  ["src/components/PainelFornadasFilial.tsx", "confirmarInclusaoFixa", "Incluir e Enviar migraram para a barra fixa do polegar"],
  ["src/index.css", ".acao-fixa-secundaria {", "Barra fixa secundaria, acima do microfone"],
  ["src/index.css", ".nome-montagem.com-etiqueta-tipo", "Nome do item empilha com a etiqueta de tipo no carrinho"],
  ["src/components/AssistenteDeVoz.tsx", "rotuloFalar", "Rotulo do microfone pode ser trocado por tela"],
  ["src/components/AssistenteDeVoz.tsx", "autoIncluirQuandoCompleto", "O que a voz entendeu certo pula a conferencia"],
  ["src/components/TelaCronograma.tsx", 'rotuloFalar="Monte a lista falando"', "Lista de Producao (matriz): rotulo do microfone"],
  ["src/components/TelaPedidoFilial.tsx", 'rotuloFalar="Monte a lista falando"', "Lista de Producao (filial): rotulo do microfone"],
  ["src/components/TelaPedidoFilial.tsx", "com-acao-fixa", "Enviar pedido (filial) na barra fixa do polegar"],
  ["src/components/TelaCronograma.tsx", "cardsAbertos[LOJA_MATRIZ.id] && totalItens > 0", "Confirmar producao (matriz) na barra fixa do polegar"],
  ["api/interpretar-busca.ts", "material ou a cor de um item da lista", "Voz entende sinonimo de material (saco kraft = saco de papel)"],

  // --- Proximo dia util (feriados) e data fixa na Lista de Producao (set/2026)
  ["src/lib/feriados.ts", "proximoDiaUtilFilial", "Feriados nacionais e proximo dia util da padaria"],
  ["src/components/TelaPedidoFilial.tsx", "proximoDiaUtilFilial(dataDeAmanhaIso())", "Pedido (filial) mira o proximo dia util, nao so amanha"],
  ["src/components/TelaCronograma.tsx", "proximoDiaUtilMatriz(dataDeAmanhaIso())", "Producao (matriz) mira o proximo dia util, nao so amanha"],
  ["src/components/TelaPedidoFilial.tsx", "itensIguais(itens, pedidoExistente.itens)", "Atualizar so habilita quando a lista mudou de fato"],
  ["src/lib/dataAlvoDoDia.ts", "proximoDiaAlvo", "proximaDataAlvo recebe o proximo dia util de fora"],

  // --- Busca estilo Google com microfone compacto, e cartao editavel
  // sempre visivel na Lista de Producao (set/2026)
  ["src/components/AssistenteDeVoz.tsx", "compacto?: boolean", "Assistente de voz ganha modo compacto (icone na barra de busca)"],
  ["src/components/AssistenteDeVoz.tsx", "const conteudoExtra = (", "Botao e conferencia viram pecas separadas para o modo compacto"],
  ["src/index.css", ".botao-assistente-compacto {", "Microfone compacto: circulo pequeno e com destaque visual"],
  ["src/components/TelaPedidoFilial.tsx", "className=\"busca-lista-producao\"", "Lista de Producao (filial): busca com microfone na ponta"],
  ["src/components/TelaPedidoFilial.tsx", "mudarQuantidadeItem", "Cartao de itens ja incluidos e editavel (nao so leitura)"],
  ["src/components/TelaPedidoFilial.tsx", '<div className="destaque-data titulo-do-dia">', "Card da data (filial) sem nada alem da data"],
  ["src/components/TelaCronograma.tsx", "resultadosBuscaMatriz", "Lista de Producao (matriz): busca com microfone na ponta"],
  ["src/components/TelaCronograma.tsx", "todosOsItensDaMatriz", "Cartao do que ja foi lancado (matriz), achatando as categorias"],
  ["src/components/TelaCronograma.tsx", "mudarQuantidadeItemMatriz", "Cartao 'ja lancado' e editavel (matriz)"],

  // --- Busca+microfone fixa no rodape em TODA A TELA, substituindo os
  // botoes de voz soltos (set/2026, pedido do dono do negocio)
  ["src/components/AssistenteDeVoz.tsx", "portalConteudoExtra", "Conferencia de voz pode ser entregue por portal (barra fixa)"],
  ["src/index.css", ".barra-busca-fixa {", "Barra de busca+microfone fixa no rodape, ao alcance do polegar"],
  ["src/index.css", ".painel-extra-fixo {", "Painel flutuante para resultados/conferencia, acima da barra fixa"],
  ["src/components/TelaPedidoFilial.tsx", "painelExtraNode", "Lista de Producao (filial): busca fixa no rodape"],
  ["src/components/TelaCronograma.tsx", "painelExtraNodeMatriz", "Lista de Producao (matriz): busca fixa no rodape"],
  ["src/components/PainelFornadasFilial.tsx", "barra-busca-fixa", "Reposicao/Suprimentos: busca+microfone unificados, fixos no rodape"],
  ["src/components/PainelFornoDeHoje.tsx", "barra-busca-fixa", "Anuncio de fornada (matriz): busca+microfone fixos no rodape"],
  ["src/components/TelaRegistroPerda.tsx", "barra-busca-fixa", "Registro de perda: trocar produto por busca+microfone fixos"],
];

/**
 * Arquivos que foram APAGADOS numa entrega e não podem continuar no
 * disco.
 *
 * POR QUE ISTO EXISTE (ago/2026)
 * -------------------------------
 * O projeto é atualizado aplicando um pacote POR CIMA da pasta: ele
 * sobrescreve e acrescenta, mas nunca remove. Quando uma entrega apaga um
 * arquivo, o antigo fica lá — e, se ele importa algo que deixou de
 * existir, o `npm run build` quebra com um erro que não tem nada a ver
 * com o que foi entregue:
 *
 *   AnuncioPorVoz.tsx:45 - has no exported member 'entenderSimOuNao'
 *
 * Aconteceu de verdade. O aviso na mensagem de entrega não basta: quem
 * aplica o pacote no fim do expediente não vai reler a conversa. Aqui a
 * conferência responde sozinha, com o comando de remoção pronto.
 */
const DEVEM_TER_SIDO_APAGADOS = [
  ["src/components/AnuncioPorVoz.tsx", "diálogo de voz antigo — virou AssistenteDeVoz.tsx"],
  ["src/lib/falar.ts", "síntese de voz — o app não fala mais"],
  ["src/components/PainelSuprimentos.tsx", "card de suprimentos — virou linha na sanfona da loja"],
  ["api/manutencao.ts", "modo de manutenção retirado — os avisos vão para todos"],
  ["src/lib/manutencao.ts", "modo de manutenção retirado — os avisos vão para todos"],
  ["api/notificar-desfecho-suprimentos.ts", "endpoint sem autenticação — o aviso voltou para /api/notificar-fornada"],
  ["src/components/PainelPedidosFiliais.tsx", "card de pedidos das filiais — virou linha na sanfona da matriz, e o imprimir voltou para dentro dela"],
  ["src/components/ConfirmarProducao.tsx", "card 'Confirmar o que foi produzido' retirado — pedido do dono do negocio (set/2026), nao precisa mais dele"],
  ["src/components/AvisoPerdaPendente.tsx", "lembrete de lancamento de perdas retirado — pedido do dono do negocio (set/2026), nao precisa mais dele"],
];

/**
 * FUNÇÃO DE /api NÃO PODE IMPORTAR VIZINHA.
 *
 * O runtime do Vercel compila cada arquivo de /api isoladamente. Um
 * `import "./outra"` sem extensão não resolve em ESM e derruba a função
 * inteira ao carregar — do lado do app isso aparece como "o aviso não
 * chegou", sem pista nenhuma. Aconteceu com notificar-fornada e com
 * interpretar-busca. Esta trava impede a terceira vez.
 */
const fsApi = require("fs");
const pastaApi = path.join(RAIZ, "api");
let importesProibidos = 0;
for (const arquivo of fsApi.readdirSync(pastaApi).filter((f) => f.endsWith(".ts"))) {
  const fonte = fsApi.readFileSync(path.join(pastaApi, arquivo), "utf8");
  // Só declarações de import de verdade — o texto dentro de um comentário
  // que EXPLICA o defeito não pode disparar o alarme.
  for (const m of fonte.matchAll(/^\s*import\s[^;]*?from\s+["'](\.\/[^"']+)["']/gm)) {
    console.error(
      `PROIBIDO     - api/${arquivo} importa "${m[1]}" — funções de /api não podem importar vizinhas (ERR_MODULE_NOT_FOUND no Vercel). Copie o trecho para dentro do arquivo.`
    );
    importesProibidos++;
  }
}

let faltando = 0;
let desatualizados = 0;
let sobrando = 0;

console.log("\nConferindo os arquivos do projeto em:", RAIZ, "\n");

// A pasta aninhada é a causa mais comum de "apliquei e nada mudou".
const aninhada = path.join(RAIZ, "producao-perdas");
if (fs.existsSync(aninhada) && fs.statSync(aninhada).isDirectory()) {
  console.log("*** ATENÇÃO: existe uma pasta 'producao-perdas' DENTRO do projeto.");
  console.log("*** O pacote foi extraído no lugar errado e o código real não mudou.");
  console.log("*** Corrija com:  cp -r producao-perdas/. .  &&  rm -rf producao-perdas\n");
}

for (const [arquivo, marca, descricao] of CONFERENCIAS) {
  const caminho = path.join(RAIZ, arquivo);
  if (!fs.existsSync(caminho)) {
    console.log(`FALTANDO      - ${descricao}  (${arquivo})`);
    faltando++;
    continue;
  }
  const conteudo = fs.readFileSync(caminho, "utf8");
  if (!conteudo.includes(marca)) {
    console.log(`DESATUALIZADO - ${descricao}  (${arquivo})`);
    desatualizados++;
    continue;
  }
  console.log(`OK            - ${descricao}`);
}

/* Arquivos que ficaram para trás quebram o build sem dizer por quê. */
const paraRemover = [];
for (const [arquivo, motivo] of DEVEM_TER_SIDO_APAGADOS) {
  if (fs.existsSync(path.join(RAIZ, arquivo))) {
    console.log(`SOBRANDO      - ${arquivo}  (${motivo})`);
    paraRemover.push(arquivo);
    sobrando++;
  }
}

const problemas = faltando + desatualizados + sobrando + importesProibidos;
console.log("");
if (problemas === 0) {
  console.log(`TODOS OS ${CONFERENCIAS.length} ARQUIVOS CONFERIDOS ESTÃO ATUALIZADOS`);
} else {
  console.log(
    `${problemas} PROBLEMA(S): ${faltando} faltando, ${desatualizados} desatualizado(s), ${sobrando} sobrando.`
  );
  if (faltando + desatualizados > 0) {
    console.log("Aplique o pacote mais recente por cima da pasta, sobrescrevendo, e rode de novo.");
  }
  if (paraRemover.length > 0) {
    console.log("");
    console.log("O pacote sobrescreve, mas nunca APAGA. Remova o que sobrou com:");
    console.log(`  rm -f ${paraRemover.join(" ")}`);
  }
}
process.exit(problemas === 0 ? 0 : 1);
