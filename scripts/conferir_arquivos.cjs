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

  // --- Lista da matriz sem agrupamento por sessão
  ["src/components/PainelFornoDeHoje.tsx", "itensDoDia.map", "Matriz: lista sem sessões"],
  ["src/index.css", "tirar-da-lista", "Estilo do botão de tirar da lista"],

  // --- Filial: esconder aviso da própria tela
  ["src/lib/fornadasDispensadas.ts", "dispensarFornada", "Filial: excluir aviso"],

  // --- Busca por voz
  ["src/components/CampoDeBusca.tsx", "botao-microfone", "Microfone na busca"],
  ["src/lib/vozParaBusca.ts", "ouvirUmaFrase", "Reconhecimento de voz"],
  ["api/interpretar-busca.ts", "interpretar", "IA que casa a fala com o catálogo"],

  // --- Sugestão por IA
  ["src/lib/sugestaoProducao.ts", "montarHistoricoDaFilial", "IA: sugestão para a filial"],
  ["src/components/TelaPedidoFilial.tsx", "gerarSugestaoIA", "Filial: botão de sugerir com IA"],
  ["src/components/TelaCronograma.tsx", "gerarSugestaoIA", "Matriz: botão de sugerir com IA"],

  // --- Avisos e impressão
  ["src/App.tsx", "avisarMatrizDoPedido", "Aviso e impressão em paralelo"],
  ["src/lib/avisarFiliais.ts", "SEGUNDOS_ATE_DESISTIR_DO_AVISO", "Limite de espera do aviso"],
  ["src/lib/avisarFiliais.ts", "avisarListaEnviada", "Aviso de lista enviada"],
  ["src/lib/blocosDeImpressao.ts", "agruparPorCategoria", "Impressão automática da lista"],
  ["public/firebase-messaging-sw.js", "tocar-aviso", "Som com a janela em segundo plano"],
  ["src/lib/somDeAviso.ts", "PARCIAIS", "Campainha"],

  // --- Virada de dia, instalação, aparência
  ["src/lib/useDiaCorrente.ts", "useDiaCorrente", "Virada da meia-noite"],
  ["src/lib/dataAlvoDoDia.ts", "proximaDataAlvo", "Data-alvo avança sozinha"],
  ["src/lib/instalacao.ts", "beforeinstallprompt", "Convite de instalação"],
  ["src/components/TelaLogin.tsx", "BannerInstalar", "Instalar na tela de entrada"],
  ["src/lib/atualizacao.ts", "onNeedRefresh", "Aviso de versão nova"],
  ["vite.config.ts", '"#ffffff"', "Splash branco"],
  ["scripts/gerar_icones.py", "FUNDO_ICONE", "Ícones com fundo branco"],

  // --- Análises
  ["src/lib/analises.ts", "fornecimento", "Análises: denominador por loja"],
  ["src/lib/analises.ts", "fornadasPorFaixaDeHora", "Análises: relatório do forno"],
  ["src/lib/producaoDeHoje.ts", "incluirItemProduzido", "Reposição entra na produção do dia"],
];

let faltando = 0;
let desatualizados = 0;

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

const problemas = faltando + desatualizados;
console.log("");
if (problemas === 0) {
  console.log(`TODOS OS ${CONFERENCIAS.length} ARQUIVOS CONFERIDOS ESTÃO ATUALIZADOS`);
} else {
  console.log(
    `${problemas} PROBLEMA(S): ${faltando} arquivo(s) faltando, ${desatualizados} desatualizado(s).`
  );
  console.log("Aplique o pacote mais recente por cima da pasta, sobrescrevendo, e rode de novo.");
}
process.exit(problemas === 0 ? 0 : 1);
