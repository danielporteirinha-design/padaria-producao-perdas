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
  ["src/components/PainelFornadasFilial.tsx", "Limpar pedido", "Reposição: limpar e enviar"],
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
  ["src/lib/somDeAviso.ts", "REPETICOES_DA_CAMPAINHA", "Campainha para sozinha"],
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
  ["src/components/PainelPedidosFiliais.tsx", "onImprimirReposicao", "Matriz imprime a lista de reposicao"],

  // --- Suprimentos (embalagens e material de limpeza)
  ["src/types/suprimento.ts", "idDoSuprimento", "Modelo de suprimentos"],
  ["src/components/TelaSuprimentos.tsx", "onEnviarLista", "Filial: aba Suprimentos"],
  ["src/components/PainelPedidosFiliais.tsx", "linhaDeSuprimentos", "Matriz: suprimentos na linha do tempo da loja"],
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
  ["src/components/PainelPedidosFiliais.tsx", "hora-pedido", "Hora da solicitacao na Reposicao"],
  ["src/components/PainelPedidosFiliais.tsx", "localeCompare", "Reposicoes: recentes primeiro"],
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
