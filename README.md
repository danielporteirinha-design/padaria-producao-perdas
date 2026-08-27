# Produção & Perdas — Padaria Pão de Mel

Módulo standalone para Cronograma de Produção Diária e Registro de Perdas.
Não substitui o Sistema de Gestão (Excel VBA + Access) em construção — ver
seção "Relação com o Sistema de Gestão" no documento de arquitetura.

Documento completo de arquitetura (stack, modelo de dados, fluxo de telas,
roadmap): ver `arquitetura.html` ou o link do Artifact enviado na conversa
(desatualizado em relação às decisões abaixo — este README é a referência
corrente).

## Status: app em produção, três lojas

**Publicado em:** https://padaria-producao-perdas.vercel.app
Deploy automático a cada `git push` na branch `main` (GitHub → Vercel).

As 4 telas (Cronograma, Cadastro de Produtos, Perdas, Análises) estão
implementadas, tipadas em modo `strict` e com build de produção limpo
(`tsc --noEmit` + `vite build`).

Persistência é **Cloud Firestore** desde ago/2026 (antes era `localStorage`,
um aparelho só) — ver "Camada de dados na nuvem" abaixo. A mudança veio da
expansão para três lojas: matriz + Filial Arthur Bernardes + Filial
Benjamin Constant.

## Decisões operacionais

Estas regras vieram de revisão direta com a padaria e substituem o desenho
inicial do documento de arquitetura:

| Decisão | Regra |
|---|---|
| Categorias de produção | Fixas: Pães e Roscas, Biscoitos, Bolos, Salgados, Confeitaria. A sessão livre "Encomendas e Especiais" foi retirada da montagem (ago/2026) — encomenda não entra na programação diária |
| Quando o cronograma é montado | Sempre no fim do expediente do dia anterior, para o dia seguinte (`dataDeAmanhaIso()`) |
| Unidade de produção | **Sempre unidades** — os ~89 produtos das 5 categorias já são vendidos por unidade no PDV, formato nativo da operação |
| Unidade de perda | **Sempre pesada em quilos** (balança) — o operador também informa o peso de 1 unidade daquela fornada, e o app deriva quantas unidades a perda representa |
| Peso unitário do produto | Sugerido automaticamente a partir do último lançamento de perda daquele produto — cadastro se autoatualiza, sem passo manual |
| Impressão | **Dois documentos** por confirmação: Lista de Produção (totais, para o padeiro) e um romaneio Separação por filial (para o despacho da manhã) — ver "Pedidos das filiais". Cada um é uma fita PNG com todas as sessões, separadas por linha de corte (pontilhado + tesoura) — corta-se fisicamente após imprimir, um pedaço por quadro de aviso de cada setor. Se o cronograma do dia for grande demais para uma imagem só, divide automaticamente em mais de uma (ver seção "Fita de impressão" abaixo) |
| Sugestão de produção | Botão "✨ Sugerir com IA" por categoria (Gemini) — sempre assistido: pré-preenche quantidades vazias com base no histórico, operador revisa/ajusta antes de confirmar |
| Escopo do catálogo | Só as 5 categorias de produção — o catálogo importado do PDV tem ~19 categorias, a maioria revenda (mercearia, refrigerante, laticínio...), fora do escopo deste app (ago/2026: limpeza concluída; as abas de migração foram removidas e o formulário passou a exigir a categoria) |
| Prazo de validade | Por produto (`Produto.prazoValidadeDias`, editável, sugerido por categoria). Serve para identificar de QUAL fornada a perda veio — **nunca para autorizar ou barrar o lançamento** (ver "Perda não é vencimento" abaixo) |
| Edição de cadastro | Nome, categoria, unidade, peso médio e prazo de validade são editáveis direto na tabela do Catálogo (edição inline por linha) — corrige erro de cadastro ou de importação sem precisar excluir e recriar o produto |
| Limpar sessão | Botão "limpar esta sessão" por acordeão, com confirmação em dois toques. **Nunca existe um "limpar tudo" global** — um toque errado apagaria o cronograma inteiro montado no fim do expediente, sem desfazer |
| Assinatura da fita | "Montado por" sai no rodapé de **cada sessão**, não uma vez só no fim: a fita é cortada e cada pedaço vai para o quadro de um setor — pedaço sem nome é pedaço sem responsável |
| Perda no mesmo dia | Fornada queimada ou fora do padrão deve ser pesada e lançada no dia, nunca no dia seguinte. O app sempre aceitou isso; o que faltava era chamar o operador — ver "Perda no mesmo dia" abaixo |
| Fornada pronta | A matriz marca cada fornada ao longo do dia, num toque, no painel "Forno de hoje" — e as filiais recebem aviso no celular (ver "Avisos de fornada"). Produto não é "produzido ou não": pão francês e biscoito de queijo saem **várias vezes por dia**, e cada fornada é um evento com hora própria |
| Reposição | A filial vê o que saiu do forno hoje e pede o item extra para HOJE, separado do pedido de amanhã — reposição **nunca** entra no planejamento do dia seguinte |
| Produção realizada | No fim do expediente, na tela de **Cronograma**, confirma-se o que REALMENTE saiu do forno — já vem pré-marcado pelas fornadas do dia — comparando com o total PEDIDO (matriz + filiais), que é o que revela o gargalo. Marcação binária ("não saiu"), porque é assim que acontece na prática — não sai em quantidade menor. O plano nunca é reescrito |
| Abas por perfil | A filial vê **Pedido e Perdas**. Catálogo, Cronograma e Análises são da matriz — as regras do Firestore já negariam gravação da filial neles, e mostrar as abas só ofereceria caminhos que terminam em "sem permissão". |
| Escopo das perdas | **Qualquer produto ativo** pode receber perda, nas três lojas — a janela de validade só ATRIBUI a fornada quando existe uma, nunca decide quem aparece na lista. A filial vê só as perdas dela; a matriz vê as três, com a origem em cada linha |
| Cadastro de produto | Três campos: nome, categoria (obrigatória) e peso médio (opcional). Unidade é sempre "un" e o prazo vem da categoria — ambos editáveis depois, na linha do Catálogo |
| Anular perda | Lançamento errado (1000 em vez de 10) é **anulado pela matriz, nunca apagado** — o registro fica no histórico marcado, com quem anulou e por quê, e sai de todos os cálculos |
| Excluir produto | Exige a **senha da loja** (revalidada no Firebase), não só um segundo clique — apaga catálogo compartilhado pelas três lojas |
| Impressão no caixa | Botão "Imprimir no caixa" enfileira as imagens no Firestore; um agente Python no PC do caixa busca a cada 15s e imprime na térmica USB — ver `agente-impressao/`. O caminho antigo (WhatsApp) continua existindo |
| Instalação | App instalável (PWA): ícone próprio na tela de início do celular e na área de trabalho do PC — ver seção "Instalar como app" abaixo |
| Insights de catálogo | Botão "✨ Gerar insights com IA" em Análises (Gemini) — aponta produtos sobrando (perda por sobra alta), produtos ativos parados há muito tempo, ou outros padrões úteis; sempre informativo, nunca altera nada sozinho |

Produção (unidades) e perda (derivada em unidades a partir do peso pesado
÷ peso unitário informado) ficam sempre na mesma unidade de medida, então
a taxa de perda (%) nunca mistura quilo com contagem de peças. O quilo
pesado na balança continua registrado à parte (`totalPerdidoQuilos`),
como métrica auxiliar de desperdício em peso. Ver `src/lib/conversao.ts`
e `src/lib/metricas.ts`.

### Prazo de validade e janela de perda (ago/2026)

Gargalo real identificado pela padaria: as etiquetas dos produtos não
trazem uma data de fabricação isolada e confiável, então uma perda
lançada hoje nem sempre é da fornada de ontem — um pão perde a validade
em 1 dia, mas uma confeitaria pode ter sido produzida até 5 dias atrás e
só agora ser descartada.

- `Produto.prazoValidadeDias` (opcional, por produto): quantos dias após
  a produção o item ainda é considerado válido. Sugerido automaticamente
  por categoria ao cadastrar (`VALIDADE_SUGERIDA_DIAS` em
  `src/lib/categorias.ts`: Pães e Roscas 1, Biscoitos 15, Bolos 3,
  Salgados 2, Confeitaria 5) mas sempre editável por produto — ex.: uma
  rosca dentro de "Pães e Roscas" dura mais que o pão da mesma categoria
  e deve ser ajustada manualmente para 2.
- `src/lib/janelaValidade.ts` (`calcularCandidatosPerda`): módulo puro que,
  para uma data de referência, varre os planos de produção confirmados e
  identifica quais fornadas de cada produto ainda estão dentro do próprio
  prazo — essas são as fornadas ATRIBUÍVEIS a uma perda naquele dia.
  Produto sem `prazoValidadeDias` cadastrado só tem a fornada do próprio
  dia como atribuível, nunca inventa um prazo que ninguém confirmou.
  Atenção: estar fora do prazo **não impede** o lançamento — ver "Perda
  não é vencimento" abaixo.
- Quando um produto tem mais de uma fornada ainda válida, a tela de
  Perdas (`TelaPerdas.tsx`) mostra a contagem ("· N fornadas válidas") e
  `TelaRegistroPerda.tsx` exibe um seletor "Produzido em" com a fornada
  mais antiga pré-selecionada (FIFO — descarta-se o lote mais velho
  primeiro).
- `RegistroPerda.data`/`diaDaSemana` continuam sendo o dia em que a perda
  foi lançada (usado para as análises de "qual dia da semana mais
  desperdiça"); só `planoDeProducaoId` passou a apontar corretamente para
  a fornada de origem real, que pode ter dias de diferença.

### Limpeza de escopo do catálogo (ago/2026)

Decisão do dono do negócio: o catálogo deste app deve conter só produtos
das 5 categorias de produção — o resto (revenda importada junto na
planilha do PDV) não pertence aqui. Em Cadastro de Produtos, a aba
"Fora de escopo" agrupa esses itens pela categoria original do PDV, com
cada grupo selecionável (todos vêm marcados por padrão) e exige um
segundo clique de confirmação antes de excluir — ação irreversível.
Duas categorias do PDV merecem uma segunda olhada antes de confirmar por
serem ambíguas (claramente produtos de padaria, só vieram com categoria
própria na planilha original): **Bolos de Aniversário** e **Panetones** —
desmarque esses grupos se quiser mantê-los, ou recadastre-os manualmente
na categoria "Bolos"/"Confeitaria" depois.

O mesmo filtro (só as 5 categorias) agora também é aplicado na
importação/reimportação de planilha (`scripts/importar_produtos.py` e
`src/lib/importarProdutos.ts`), para uma reimportação futura não
reintroduzir produtos fora de escopo — e em `data/produtos.seed.json`,
que foi filtrado de 881 para 89 produtos (só os das 5 categorias) para
que uma instalação nova já comece limpa.

### Rodar localmente

```
npm install
npm run dev
```

Abre em `http://localhost:5173`. Primeira execução já carrega o catálogo
(89 produtos, só das 5 categorias de produção) direto de
`data/produtos.seed.json`. A sugestão por IA não funciona em `npm run dev`
(o endpoint `/api/*` só existe no deploy do Vercel) — o botão mostra erro
de conexão nesse modo, o que é esperado.

### Build de produção (o que o Vercel roda a cada push)

```
npm run build      # tsc --noEmit && vite build -> gera dist/
```

## Sugestão de produção com IA (Gemini)

Cada categoria fixa do Cronograma tem um botão "✨ Sugerir quantidades com
IA": ele reúne o histórico local (planos confirmados + perdas daquela
categoria, últimos 60 dias) e pede ao Gemini uma sugestão de quantidade por
produto, priorizando padrão do mesmo dia da semana e redução de perda.
Nunca aplica sozinho — só pré-preenche itens ainda vazios; o operador
revisa e ajusta antes de "Confirmar produção", igual à sugestão de
categoria em Cadastro de Produtos.

**Arquitetura:** a chamada ao Gemini acontece só no servidor
(`api/sugestao-producao.ts`, função serverless que o Vercel publica
automaticamente por estar em `/api`) — o navegador nunca vê a chave da
API. Isso é obrigatório, não opcional: qualquer variável de ambiente
prefixada `VITE_` é embutida no bundle público do front-end, então uma
chave de API ali ficaria visível a qualquer pessoa que abrisse o DevTools
no celular.

**Para ativar:**

1. Gere uma chave gratuita em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. No painel do Vercel → projeto `padaria-producao-perdas` → **Settings → Environment Variables**.
3. Adicione `GEMINI_API_KEY` (sem prefixo `VITE_`) com o valor da chave, nos ambientes Production e Preview.
4. Faça um novo deploy (qualquer `git push`, ou "Redeploy" no painel) para a variável entrar em vigor.

Sem a chave configurada, o botão continua visível mas mostra uma mensagem
clara pedindo a configuração — nunca trava a tela nem impede montar o
cronograma manualmente.

## A campainha não tocava justamente quando precisava (ago/2026)

**Defeito relatado:** no computador, o som não chegava.

Duas causas somadas, e as duas só aparecem no PC do balcão — onde o app fica
aberto o dia inteiro, atrás do PDV:

**1. Janela sem foco vai para o service worker.** Nesse estado o FCM entrega o
aviso ao service worker, e não ao `onMessage` da página. Service worker não toca
áudio — não tem WebAudio. A notificação aparecia muda.

A correção: o service worker mostra a notificação e, em seguida, **manda um
recado para as janelas abertas** (`postMessage`). A página, mesmo sem foco, toca
normalmente. `includeUncontrolled: true` é essencial — a janela pode não estar
sob o controle deste service worker (ele é o do Firebase; o do PWA é outro), e
sem isso a lista voltaria vazia.

**2. O contexto de áudio suspenso engolia a primeira badalada.** `resume()` é
assíncrono, e a versão anterior chamava `prepararSom()` e no mesmo instante
desistia se o estado ainda não fosse "running" — que é exatamente o que um
contexto suspenso ainda não é. A primeira badalada depois de qualquer suspensão
saía muda, e com a janela horas em segundo plano era quase sempre a primeira.
Agora o som espera o contexto voltar em vez de desistir dele. O destravamento
também deixou de ser `once`: destravar sempre que houver um toque é mais seguro
que destravar uma vez e torcer.

## Anunciar devolve o item à lista (ago/2026)

Tirar da lista é sobre **não tocar por engano**, não sobre sumir com o produto.
Se a matriz procura um item que tinha tirado e anuncia de novo, a linha volta
para a lista — com a contagem de fornadas e a hora da última, números que nunca
saíram do banco.

## O último creme da abertura (ago/2026)

`background_color` já era branco; o que sobrava era o **`theme_color`**, que
pinta a barra do sistema e, no computador, a barra de título da janela do app —
e que participa da abertura junto do fundo do splash. Agora os dois são brancos,
e casam entre `index.html` e o manifesto: valores diferentes nos dois lugares
produzem uma troca de cor visível no meio do carregamento.

A troca aceita, registrada de propósito: a barra fica branca e o fundo do app
segue creme, então existe uma emenda no topo durante o uso.

> **O app instalado guarda o manifesto.** Publicar não troca o splash de quem já
> tem o atalho: o Chrome empacota manifesto e ícones na instalação e só revisa
> isso de tempos em tempos. Para ver a mudança hoje, remova o atalho e adicione
> de novo — o mesmo passo que os ícones já exigiam.

## Aviso e impressão corriam em fila, e um travava o outro (ago/2026)

**Defeito relatado:** a filial enviou a lista do dia seguinte, a matriz não
recebeu a notificação **e** o papel não saiu na impressora do caixa. Os dois ao
mesmo tempo, sem mensagem nenhuma.

Os dois efeitos estavam **encadeados**: primeiro o aviso, depois o papel.

```
await avisarListaEnviada(...)   // chamada de rede, sem limite de espera
await imprimirPedidoNoCaixa(...) // só começa quando a de cima terminar
```

Bastava a primeira demorar para a impressão atrasar junto. E se ela nunca
respondesse — função serverless hibernada acordando, conexão que trava sem
fechar — o papel **nunca** saía. `fetch` sem `AbortController` espera para
sempre; quem esperava por ele nunca era liberado.

Duas correções:

- Os efeitos correm **em paralelo**, com `allSettled`, cada um cuidando do
  próprio erro. Nenhum dos dois pode derrubar o outro — o pedido já está
  gravado, e é ele que vale.
- A chamada ao servidor de avisos ganhou **limite de 12 segundos**. Doze cobrem
  com folga o pior início de função frio; mais que isso, o aviso já perdeu a
  hora de qualquer forma. Estourado o prazo, a mensagem diz o que continua
  valendo: "o que você fez já está gravado".

A decisão de imprimir também mudou de lugar: mora dentro de
`imprimirPedidoNoCaixa`, junto da impressão. Espalhada na chamada, ela
precisaria ser repetida em todo lugar que mandasse pedido.

## A lista de anúncio da matriz virou uma lista só (ago/2026)

Na aba Reposição da matriz, os produtos do dia deixaram de ser agrupados por
sessão. Ali não se planeja nada — só se anuncia o que acabou de sair —, e o
cabeçalho de categoria empurrava a lista para baixo sem ajudar a achar. Agora é
uma lista corrida, na ordem em que a padaria produz, e um produto que aparece em
duas sessões aparece uma vez só.

Cada item ganhou um botão para **sair da lista**. O motivo é concreto: um toque
sem querer anuncia uma fornada que não existiu, e a filial pede em cima dela. O
que sai é o alvo de toque; **as fornadas já marcadas continuam gravadas** e
continuam alimentando o relatório do forno em Análises — é o mesmo mecanismo
local da filial (`src/lib/fornadasDispensadas.ts`), por dia e por aparelho. O
caminho de volta ("N itens fora da lista · mostrar de novo") fica fora da lista,
porque é justamente quando alguém tira o último item que ele precisa estar
visível.

## A aba Reposição perdeu 4 parágrafos (ago/2026)

**Relato:** ao excluir itens da lista, aparecia um texto enorme, e a tela ficava
ruidosa.

O ruído não estava só ali. A aba tinha quatro blocos de prosa que ensinavam algo
na primeira semana e depois só ocupavam altura acima da lista:

| Saiu | Por quê |
|---|---|
| "Toque no item quando a fornada sair. As filiais veem na hora e podem pedir reposição enquanto ainda dá tempo de entregar hoje." | A aba se chama Reposição e cada linha diz "anunciar". A frase ensinava o que o botão já diz |
| "Busca no catálogo inteiro — o produto não precisa estar na lista de hoje..." (nas duas telas) | O campo já diz "Buscar produto para anunciar" |
| "Está sem no balcão? Peça reposição." | O botão se chama "Pedir" |
| "N itens escondidos hoje — as filiais não veem. mostrar de novo" | Duas linhas de texto **logo depois de uma ação de limpeza** — o pior momento possível para encher a tela |

No lugar da última entrou uma **pastilha**: lixeira riscada, o número, e
"mostrar". A pastilha inteira é o botão que desfaz. O estado se lê sem ler — e o
que a frase explicava (que as filiais deixam de ver) já é o efeito que a pessoa
acabou de provocar de propósito.

As mensagens de confirmação encolheram junto: "PÃO FRANCÊS saiu da lista — as
filiais não veem mais hoje" virou **"PÃO FRANCÊS fora da lista."** Quem tocou na
lixeira está olhando a linha sumir; explicar o efeito por extenso, num aviso que
cobre a tela por quatro segundos, é repetir o que ela já viu acontecer.

O painel inteiro da matriz, com dois itens na lista e dois escondidos, tem hoje
**86 caracteres de texto** — contra mais de 400 antes. O que sobrou são nomes de
produto, horários e três botões.

## O "sim" tinha menos peso que o "não" (ago/2026)

Quando a matriz confirmava uma reposição, a filial via três palavras cinzas
coladas no fim de outra frase: "já pedi 60 un · separado". Quando a matriz
recusava, ela via um bloco destacado: "Não vem: acabou a farinha".

A assimetria não era estética. **Quem pediu está sem o produto no balcão**, e
"vem" e "não vem" mudam o que ela faz nos próximos minutos — as duas respostas
precisam ser lidas de relance, e só uma delas era. Agora a confirmação tem bloco
próprio, em verde: **"Separado — vem na próxima entrega."**

### E o aviso podia nunca sair

O mesmo defeito de sequenciamento que já tinha aparecido no envio da lista da
filial estava aqui também. Ao confirmar, o app fazia:

```
await registrarNaProducaoDeHoje(...)  // gravação no Firestore
await avisarDesfechoReposicao(...)    // só depois disso
```

Bastava a gravação demorar para a resposta atrasar junto — e **offline `setDoc`
só resolve quando o servidor confirma**, então o push simplesmente não saía. A
filial ficava esperando notícia de um pedido que a matriz já tinha confirmado,
que é exatamente o problema que o desfecho existe para resolver.

Agora os dois correm em paralelo, com `allSettled`, cada um cuidando do próprio
erro. A decisão já está gravada, e é ela que vale.

## A montagem do cronograma não sobrevivia a trocar de aba (ago/2026)

**Defeito relatado:** "apaguei a sessão Pães e Roscas, a contagem atualizou, saí
da aba, voltei — e a sessão estava lá de novo".

A causa era maior que o sintoma. A montagem vivia **só na memória do
componente**: trocar de aba desmonta a tela, e ao voltar ela era reconstruída a
partir do plano GRAVADO. Não era só a limpeza de sessão — acrescentar item,
corrigir quantidade, remover um produto, tudo se perdia igual. E se perdia **em
silêncio**, que é o pior: a tela voltava com números plausíveis, e o operador
seguia achando que tinha montado.

O plano só era gravado em "Confirmar produção". Tudo antes disso era volátil.

**A correção:** a montagem passou a ser gravada no aparelho a cada mudança
(`src/lib/rascunhoCronograma.ts`), com a chave levando a data. Ao abrir a tela, o
rascunho daquele dia vem primeiro; o plano gravado só entra quando não há
rascunho. Confirmar apaga o rascunho — a partir dali o plano gravado é a verdade.

**No aparelho, e não na nuvem.** Gravar cada tecla no Firestore reescreveria um
plano que pode estar confirmado, e quem separa de manhã leria uma lista que
ninguém confirmou. A confirmação continua sendo o único momento em que o plano
muda de verdade.

**O card passou a dizer a verdade sobre o estado.** Um plano confirmado com
edições na tela não pode exibir "cronograma confirmado": quem separa leria a
lista antiga e quem editou acharia que já tinha salvo. Agora aparece **"alterações
não confirmadas"** — e só quando o que está na tela realmente difere do que está
gravado. A comparação ignora ordem de sessão e de item (remover e re-adicionar o
mesmo produto muda a ordem sem mudar o pedido) e trata sessão vazia como sessão
ausente. Alarme que aparece sempre é alarme que se aprende a ignorar.

Rascunho de dia que já passou é varrido do aparelho depois de dois dias — cobre o
esquecimento de uma noite e o feriado emendado, sem acumular lixo. Rascunho de
data futura nunca vence: planejar a semana que vem é uso legítimo.

Verificado ponta a ponta, desmontando e remontando o componente como a troca de
aba faz: 3 itens / "confirmado" → limpa a sessão → 1 item / "alterações não
confirmadas" → sai e volta → **1 item**, o estado preservado.

## `npm run conferir` — a resposta para "apliquei e nada mudou" (ago/2026)

O projeto é atualizado aplicando um pacote por cima da pasta. Quando um arquivo
não chega ao lugar certo — pacote extraído numa subpasta, arquivo não
sobrescrito — o app **continua compilando e rodando**: só que rodando a versão
antiga. Nada na tela avisa, e a conclusão natural é "o recurso não foi feito".

Isso aconteceu de verdade, mais de uma vez, e custou dias de conversa. O script
troca "acho que não veio" por uma resposta.

Cada recurso entregue deixa uma **marca** no código — um trecho que só existe se
aquele arquivo estiver na versão certa. O script procura a marca e devolve OK,
FALTANDO ou DESATUALIZADO, um por linha. Ele também detecta a pasta aninhada, que
é a causa mais comum, e imprime o comando que a desfaz.

Não substitui os testes: `npm run verificar` diz se a **lógica** está certa; este
diz se os **arquivos** certos estão no disco. São perguntas diferentes, e só a
segunda explica "apliquei o pacote e nada mudou".

## Sugestão por IA para as filiais (ago/2026)

A filial ganhou o mesmo "✨ Sugerir quantidades com IA" que a matriz tem no
Cronograma — mas com **outro histórico por trás**, e isso é a parte que importa.

A filial não produz: ela pede. A pergunta é a mesma da matriz com dois números
trocados — no lugar de "quanto produzi", entra "quanto **pedi**"; no lugar da
perda da padaria inteira, entra a perda **desta loja**
(`montarHistoricoDaFilial`).

Usar o histórico da matriz aqui seria pior que não sugerir nada: a produção total
inclui o que foi para as outras lojas, e a sugestão sairia várias vezes maior que
este balcão vende. Pedido inflado vira perda no dia seguinte — o número que o app
existe para derrubar.

Só pedido diário e enviado entra na conta: rascunho a filial ainda estava
mexendo, e reposição é entrega extra de um dia atípico, que puxaria a média para
cima sem representar rotina. E, como na matriz, a IA só preenche o que está
**vazio** — número já digitado é decisão tomada.

## Tirar da vitrine: a exclusão da matriz precisava chegar às filiais (ago/2026)

**Defeito de desenho relatado no uso:** a matriz excluía o item anunciado e a
filial continuava vendo o produto disponível para pedido.

Estava certo pelo código e errado pela operação. Eu tinha construído a exclusão
como uma lista **local do aparelho** — resolvia o motivo original (não tocar por
engano no nome do produto) e parava aí. Só que o efeito ficava pela metade: a
matriz parava de ver, a filial continuava pedindo mercadoria que tinha acabado.

O que faltava reconhecer é que são **duas coisas diferentes**:

| | Quem decide | Onde mora | Efeito |
|---|---|---|---|
| **Tirar da vitrine** (matriz) | quem produz | nuvem (`anuncios_encerrados`) | as três lojas param de ver o produto hoje |
| **Excluir aviso** (filial) | quem recebe | aparelho | some só daquela tela, para arrumar a própria lista |

Disponibilidade é decisão de quem produz e precisa chegar às filiais **no mesmo
instante** — por `onSnapshot`, não no próximo recarregamento. Arrumação da
própria tela é de quem olha para ela.

**Nenhuma fornada é apagada.** As marcações continuam gravadas, com a hora de
cada uma, e continuam alimentando o relatório do forno em Análises. O documento
diz "não ofereça mais hoje", não "isto nunca aconteceu" — uma padaria que
apagasse o histórico para parar de vender perderia justamente o dado mais
valioso que ela produziu.

**Anunciar devolve à vitrine.** Se a matriz encerra e depois anuncia de novo, o
encerramento é apagado junto com a marcação nova. Sem isso ela anunciaria no
vazio: a fornada sairia e ninguém do outro lado veria.

O desfazer é uma linha só, igual à da filial (decisão do dono do negócio): "N
itens escondidos hoje — as filiais não veem · mostrar de novo". A primeira versão
listava os itens nomeados, com um "devolver" cada; ocupava a tela com o que NÃO
está em jogo, e quem abre esta aba veio anunciar, não administrar o que já tirou.
Devolver tudo de uma vez é o caso comum — acabou o dia, começa outro.

Verificado com as duas telas na mesma página e um estado compartilhado entre
elas: 3 itens dos dois lados, a matriz tira um, os dois lados vão a 2, o nome
aparece em "fora da lista", "devolver à lista" leva os dois de volta a 3.

> **Regras do Firestore mudaram.** A coleção `anuncios_encerrados` é lida por
> qualquer loja e escrita só pela matriz. O texto completo tem que ser colado no
> console — sem isso, encerrar dá erro de permissão.

## Botão ausente é indistinguível de recurso ausente (ago/2026)

O microfone só era desenhado em navegador com reconhecimento de voz — a regra
parecia certa: oferecer e falhar é pior que não oferecer.

O uso real mostrou o custo. Quem não via o microfone não tinha como saber se o
recurso não existia, se ainda não tinha sido publicado, ou se o navegador dele é
que não servia. A ausência do botão foi reportada como defeito duas vezes,
enquanto o recurso funcionava na máquina do lado.

Agora ele **aparece sempre**. Onde a voz existe, funciona. Onde não existe, um
toque responde em uma frase — e nomeia os navegadores, em vez de dizer "não
suportado": o Firefox no computador é o caso mais comum, e quem está com ele na
tela não tem como adivinhar que o Chrome resolve.

A lição que fica registrada: quando um recurso é invisível na ausência, ele
perde a única forma que o usuário tem de distinguir "não existe" de "não
funciona aqui" — e essa distinção é dele, não nossa.

## Busca por voz, com o Gemini afinando o resultado (ago/2026)

Todos os campos de busca de produto ganharam **microfone**. Quem usa a busca
está com a mão suja de farinha ou com a bandeja na outra mão; digitar "BISCOITO
DE QUEIJO ASSADO NA HORA" no teclado do celular assim é o caminho mais lento que
existe.

O fluxo tem dois passos, e **o segundo é opcional**:

1. O navegador transcreve o que foi dito (Web Speech API, `pt-BR`).
2. O Gemini casa a transcrição com um nome real do catálogo
   (`api/interpretar-busca.ts`).

O passo 2 existe porque o transcritor devolve o que ouviu, não como a padaria
cadastra: "pãozinho francês", "fubá com goiabada". A busca por texto não acha
nenhum desses, e o operador fala certo e lê "nenhum produto encontrado" — a pior
resposta possível, porque parece defeito dele.

**A IA pode falhar inteira sem consequência.** Sem chave, com erro, com o
serviço fora do ar ou com resposta inesperada, o endpoint devolve `{termo:""}` e
HTTP 200, e o campo fica com a transcrição crua — que já funciona sozinha,
porque `contemBusca` ignora acento e caixa. E há uma trava contra invenção: o
nome escolhido só vale se for **exatamente** um dos que mandamos; modelo que
devolve um produto inexistente levaria a busca a zero resultados, pior que não
ter tentado.

O microfone **só aparece onde funciona** — navegador sem reconhecimento de voz
não ganha o botão, porque oferecer e falhar é pior que não oferecer.

Os quatro campos (perdas, fornada da matriz, pedido da filial, catálogo) passaram
a ser o mesmo componente, `CampoDeBusca.tsx`: quatro cópias virariam quatro
comportamentos diferentes na primeira correção.

## Reposição e Programação: os rótulos finais das abas (ago/2026)

Cada aba passou a levar o nome do **documento** que sai dela, que é como a
padaria já fala: **Reposição** é o pedido de hoje, feito enquanto o forno
trabalha; **Programação** é a lista do próximo dia útil, montada no fim do
expediente — a mesma palavra do card "Programação geral" no Cronograma.

Uma palavra cada, de propósito: "Programar produção" descreve melhor, mas na
barra de abas do celular empurraria "Perdas" e "Análises" para fora da tela.

## Três textos que estavam dizendo a coisa errada (ago/2026)

**"Hoje não teve perda" virou "lançar mais tarde".** A saída anterior pedia uma
AFIRMAÇÃO — quem tocava declarava que o dia fechou sem desperdício. Só que
ninguém tocava ali por isso: tocava porque estava no meio de outra coisa. O app
registrava como "dia sem perda" um dia que ninguém tinha conferido, e o aviso
não voltava mais. "Lançar mais tarde" diz a verdade sobre o que o toque
significa, e por isso pode voltar: o aviso adormece por duas horas — dentro do
mesmo expediente, porque o lançamento tem que acontecer hoje — e reaparece
sozinho, inclusive num app que ficou aberto na mesma tela.

**O card de confirmação.** O título virou "Confirmar o que foi produzido", que
diz a ação em vez de nomear a seção. O subtítulo "produção confirmada" saiu:
logo abaixo de um título que já diz o assunto, era a mesma frase duas vezes. E a
contagem deixou de repetir o tamanho da lista — que é a mesma informação dos
cards das lojas — para responder a pergunta que traz alguém ali: **"12 de 14
confirmados"**. Falta alguma coisa? Sem abrir o card.

**"Excluir aviso" na lista da filial.** Ao longo do dia a lista chega a dezenas
de itens, a maioria já resolvida, e o que ainda precisa de decisão fica
enterrado no meio. O botão tira o AVISO daquela loja, naquele aparelho, hoje —
não a fornada, que continua registrada e alimenta o relatório do forno (e que as
regras do Firestore só deixam a matriz apagar). Tem desfazer: "N avisos
escondidos · mostrar de novo", visível inclusive quando a lista esvaziou por
completo.

## A campainha do balcão (ago/2026)

O aviso sonoro deixou de ser dois bipes e virou uma **campainha**. Duas notas de
onda senoidal soavam como alarme de eletrodoméstico; o que faz o ouvido
reconhecer um sino são duas coisas que o bipe não tinha: **harmônicos não
inteiros** (as parciais 2,76 / 5,40 / 8,93 vêm da física de sinos reais) e
**ataque instantâneo com cauda longa**, onde cada parcial mais aguda decai mais
rápido que a grave. Duas badaladas com folga entre elas: uma só se perde no
barulho do balcão, três viram alarme.

Continua valendo o motivo de o som ser gerado pelo app: a Web Notifications API
não deixa escolher som, e com o app em primeiro plano o sistema costuma silenciar
a notificação — no balcão a janela fica atrás do PDV.

## O convite para instalar, e o evento que se perdia (ago/2026)

**O defeito:** o Chrome dispara `beforeinstallprompt` UMA vez, logo depois que a
página carrega. Quem não estiver escutando naquele instante perde o evento — e
ele não volta enquanto a aba não for recarregada.

O listener morava dentro de `BannerInstalar`, que só era montado **depois do
login**. Na prática: o evento disparava na tela de entrada, ninguém escutava, e
o botão "Instalar" nunca aparecia. Quem recebia o endereço ficava sem caminho
nenhum para pôr o aplicativo no aparelho — justamente a primeira coisa que se
faz ao receber um link.

**A correção** foi tirar a escuta do componente e pôr em `src/lib/instalacao.ts`,
que começa a trabalhar no carregamento do módulo, antes de o React desenhar
qualquer coisa. O componente só assina as mudanças. E o convite passou a
aparecer também na **tela de entrada**, em destaque, onde quem chegou pelo link
de fato está.

### O que não dá para fazer, e por quê

Não existe instalar sem toque. `prompt()` só é aceito dentro de um gesto do
usuário — é uma trava dos navegadores, não uma limitação deste app: sem ela,
qualquer site colocaria ícone na tela de início de quem passasse por ele.

| Aparelho | O que acontece ao abrir o link |
|---|---|
| **Android / Chrome** | Botão **Instalar** na tela de entrada → caixa do navegador → ícone criado. Dois toques |
| **Windows / Chrome ou Edge** | Igual: instala em janela própria, com atalho na área de trabalho e no menu Iniciar |
| **iPhone / Safari** | Não existe API. O banner mostra o caminho do menu Compartilhar → Adicionar à Tela de Início. E **push só funciona instalado assim** |

Verificado com navegador real servindo o `dist/`: no perfil iPhone o banner
aparece com as instruções do Safari; no perfil Chrome, com o evento disparado
**antes** do bundle rodar (que era exatamente o caso que falhava), o botão
aparece e chamar nele executa o `prompt()` do navegador.

## Análises para as filiais — e o denominador que estava errado (ago/2026)

A aba de Análises passou a existir para as filiais, travada na própria loja:
quem decide o que pedir amanhã é quem está no balcão, e até aqui ela pedia sem
enxergar o próprio desperdício.

Liberar a tela expôs um defeito que já existia e ninguém tinha como ver.

### O defeito

A tela sempre deixou filtrar por loja — mas o filtro só alcançava as **perdas**.
O denominador continuava sendo a produção inteira da padaria, as três lojas
somadas. A taxa de uma filial saía dividida por um número várias vezes maior
que o certo:

| | Antes | Agora |
|---|---|---|
| Filial perdeu 10 un, pediu 50, matriz produziu 150 | 10 / 150 = **6,7%** | 10 / 50 = **20%** |

6,7% é tranquilizador. 20% é uma loja jogando fora um quinto do que recebe. O
número errado era o que parecia bom — que é o pior tipo de número num painel de
decisão. Enquanto só a matriz via a tela, o erro ficou invisível; liberar para
as filiais o tornou urgente.

### A correção

O denominador passou a acompanhar o filtro, usando a **mesma consolidação da
fita de produção** (`src/lib/consolidacao.ts`):

- **Sem filtro** — tudo que saiu do forno (matriz + o que as filiais pediram).
  Antes era só a lista da matriz, o que já subestimava o total.
- **Matriz** — o que ela planejou para si.
- **Filial** — o que ela pediu, e portanto recebeu.

Parte de `itensProduzidos`, não do plano cru: item marcado como "não saiu" no
fim do expediente não foi disponibilizado a ninguém, e contá-lo afrouxaria a
taxa de todo mundo. Rascunho e reposição ficam de fora — um não foi confirmado
pela filial, o outro é entrega de hoje, por fora do planejamento.

Sem pedido no período, a filial não recebeu nada e a taxa é **nula**, não zero:
"não sei" e "não desperdicei" são respostas diferentes.

O rótulo mudou junto: **"Recebido (un)"** na filial, "Produzido (un)" na matriz.
Não é sinônimo — a filial não produz nada, e chamar de produção o que ela
recebeu foi exatamente o que escondeu o erro.

O caso 28 de `scripts/verificar_logica.ts` cobre a conta nos três recortes, e o
caso antigo que afirmava o contrário foi reescrito **com o registro de por que
a resposta mudou** — o comentário antigo justificava o número errado com um
argumento que parecia bom.

### O que a filial NÃO vê

O seletor de loja não aparece para ela (em vez de aparecer desabilitado, que só
ofereceria um caminho terminando em nada), e o botão de **insights com IA** fica
de fora: ele lê o catálogo inteiro para achar padrão e cruza as três lojas —
seria a única porta da tela por onde número de outra unidade entraria. As regras
do Firestore deixam qualquer loja LER as perdas de todas (a matriz precisa da
visão consolidada), então o que separa as unidades aqui é esta trava.

## Ícone da tela de início em branco (ago/2026)

O atalho do app na tela de início do celular tinha fundo **creme**
(255,255,215), amostrado da própria logomarca. Entre os outros aplicativos da
tela, esse creme lia como papel encardido em vez de escolha — e tirava
contraste justamente do vermelho e do amarelo, que são a marca.

Agora o fundo dos ícones é **branco puro** (`FUNDO_ICONE` em
`scripts/gerar_icones.py`), a mesma decisão já tomada na tela de entrada do
app, onde a marca ganhou uma placa branca. Vale para os quatro ícones da
família comum: `pwa-192`, `pwa-512`, `pwa-maskable-512` e `apple-touch-icon`.

O que **não** mudou, de propósito:

- **O favicon** continua sendo o "P" branco-e-amarelo sobre vermelho. A 16-32px
  reais da aba do navegador, qualquer texto vira borrão, e o fundo colorido é o
  que ainda identifica a aba.
- **O badge da notificação** continua silhueta branca sobre transparente — o
  Android descarta as cores dele e usa só o formato.
- **A cor de fundo do app** continua creme — decisão explícita do dono do
  negócio.

O **splash** (`background_color` no manifesto) virou branco a pedido dele: com o
ícone em fundo branco, o creme punha um quadrado branco no meio de uma tela
creme e a moldura aparecia, que é o contrário do que um splash deve fazer. O
preço é um piscar branco→creme na entrada, curto num app já instalado.

O **favicon deixou de ser o "P"** e passou a ser a logomarca inteira num círculo
branco com anel vermelho (ago/2026, decisão do dono do negócio). A ressalva fica
registrada: a pílula é 2,8x mais larga que alta, então num círculo de 32px ela
ocupa ~11px de altura e as letras não se leem — o que identifica o ícone nesse
tamanho passa a ser a mancha vermelha com miolo amarelo, não a palavra. O "P"
era mais legível; a marca inteira é mais reconhecível para quem já conhece a
padaria. O anel vermelho existe porque sem ele o disco branco some contra a
barra clara do navegador. Um `favicon-180x180.png` acompanha, para aba fixada e
atalho na área de trabalho, onde há espaço para a marca ser lida de verdade.

> **O ícone já instalado não se atualiza sozinho.** Android e iOS copiam a
> imagem no momento em que o atalho é criado; publicar a versão nova não mexe
> no que já está na tela de início. Em cada aparelho: remover o atalho e
> adicionar de novo pelo navegador.

## A virada da meia-noite com o app aberto (ago/2026)

Defeito relatado no uso: quinta-feira de manhã, e as perdas lançadas na
quarta apareciam na aba de Perdas como **lançadas hoje**.

Os dados estavam certos — cada perda foi gravada com a data correta, e o
histórico da parte de baixo da tela mostrava tudo no dia certo. **A tela é que
nunca soube que o dia mudou.** `dataDeHojeIso()` sempre respondeu certo; o
problema é que ela só era chamada quando algo fazia o React renderizar de novo,
e no PC do caixa o app fica aberto a noite inteira, parado na mesma aba.

Esse tipo de defeito é especialmente ruim porque o que aparece é *plausível*:
ninguém desconfia de um número que parece o de sempre.

**A correção** é um `hoje` vivo (`src/lib/useDiaCorrente.ts`): relógio de um
minuto, mais `visibilitychange` e `focus`. No celular o app fica suspenso a
noite toda e o intervalo pode nem disparar — é o retorno ao primeiro plano que
resolve, e ele acontece exatamente quando alguém vai usar. O valor só muda
quando o dia muda, então o relógio não custa renderização nenhuma.

O que passou a acompanhar a virada:

| Onde | O que acontece agora |
|---|---|
| **Perdas** | Formulário limpo, sanfona fechada, busca vazia, pronto para o primeiro lançamento do dia. O modal de anulação também fecha — ele carregava um registro do dia que acabou |
| **Escuta de fornadas** | Reassina na data nova. Antes ficava presa na data de ontem para sempre, e as fornadas de hoje nunca chegavam a um app que não foi fechado |
| **Cronograma e Pedido** | A data-alvo avança para o novo dia seguinte |

Os **handlers continuam chamando `dataDeHojeIso()`** na hora da ação: o que
vale para carimbar um registro é o instante da gravação, não o que a tela
achava.

### Avançar a data sozinho é conveniente e perigoso ao mesmo tempo

Às 23h59 alguém pode estar no meio da digitação, e virar a data ali apagaria o
trabalho da tela. A regra vive em `src/lib/dataAlvoDoDia.ts`, com três guardas
nesta ordem:

1. Já está em amanhã? Não faz nada.
2. **Tem coisa digitada e não gravada? Não mexe.** Trabalho na tela vale mais
   que data certa — o cabeçalho mostra a data, e quem está digitando está
   olhando para ela.
3. A data-alvo ainda é futura? Não mexe: quem escolheu planejar a sexta na
   quarta não quer ser jogado de volta para quinta.

Sobra o caso que motivou tudo: tela parada, sem nada digitado, apontando para
um dia que já chegou ou já passou.

## A lista da filial sai no papel sozinha (ago/2026)

Quando a filial envia a lista do próximo dia útil, além do push, o pedido é
**enfileirado direto para a impressora do caixa da matriz**. Quem monta a
produção de manhã trabalha com papel na mão; até aqui, para ter esse papel, a
matriz precisava abrir o app, ir ao Cronograma, confirmar e só então imprimir.

Quatro decisões:

- **A imagem é gerada no aparelho da FILIAL**, não na matriz. A matriz pode
  estar com o app fechado quando o pedido chega, e um papel que só sai quando
  alguém abre a tela não é impressão automática.
- **A fila é compartilhada e o agente imprime tudo que está pendente**, sem
  olhar de que loja veio (`agente-impressao/agente.py`). As regras do Firestore
  continuam exigindo que o trabalho seja carimbado com a loja de quem gravou —
  então cada papel é rastreável até quem o mandou, sem nenhuma mudança nas
  regras.
- **A hora do envio sai impressa**, junto de quem montou: "Montado por: Ana ·
  enviado 18:42". A filial pode reenviar a lista corrigida, e aí saem dois
  papéis parecidos — sem a hora não há como saber qual dos dois vale.
- **Só a lista diária imprime.** Reposição não: ela é decidida na tela, uma por
  vez, e um papel por reposição gastaria bobina o dia inteiro para dizer o que
  o push já disse.

O agrupamento por setor virou `src/lib/blocosDeImpressao.ts`, compartilhado com
o romaneio que a matriz imprime. A ordem é a de `CATEGORIAS_PRODUCAO`, e não a
ordem em que a filial digitou: os dois papéis do mesmo dia são conferidos um
contra o outro, e setores em ordens diferentes transformariam conferência em
procura. Categoria fora das cinco não some — cai num bloco no fim, porque item
que não aparece na lista é item que ninguém separa.

**Falha de impressão não vira alarme falso.** O pedido já está gravado e a
matriz já foi avisada por push; o papel é conveniência, não o canal. Se a fila
recusar, a mensagem diz o que continua valendo em vez de sugerir que o envio
precisa ser refeito.

> **Depende do agente rodando no PC do caixa** (`agente-impressao/instalar-servico.bat`,
> como administrador). Sem ele a fila enche e nada sai — e é a matriz, não a
> filial, quem percebe isso.

## "Hoje" e "Amanhã": as abas nomeadas pelo prazo (ago/2026)

Os rótulos "Nova fornada" e "Pedido" viraram **Hoje** e **Amanhã**. O problema
era de vocabulário, não de estética: as duas abas recebem PEDIDO, e os nomes
antigos não diziam qual era qual — "Nova fornada" descrevia só metade do que a
aba faz (a filial também pede por ali) e "Pedido" descrevia as duas.

| Aba | Matriz | Filial |
|---|---|---|
| **Hoje** | Anuncia o que sai do forno; recebe, aceita ou recusa os pedidos do dia | Vê o que saiu, e pede o que está faltando no balcão agora |
| **Amanhã** | — (a matriz monta o Cronograma) | Monta a lista do próximo dia útil, no fim do expediente |

Nomeadas pelo prazo, a diferença fica óbvia sem explicação: **Hoje** é o que
ainda dá para resolver no expediente de agora; **Amanhã** é planejamento.

As **chaves internas continuam** `fornada` e `pedido`: elas aparecem nos links
dos avisos (`/?aba=fornada`, ver `src/lib/rota.ts`), e renomeá-las quebraria o
toque em qualquer notificação já entregue.

### A filial passou a pedir qualquer item do catálogo

Até agora a filial só podia pedir o que já tinha saído do forno — a lista da
aba. Mas a loja fica sem coisa que ainda não foi assada, e para isso ela só
tinha o pedido de amanhã, que chega tarde demais quando o produto está faltando
no balcão AGORA.

A aba **Hoje** ganhou a mesma busca que a matriz tem: digita o nome, informa a
quantidade, envia. A matriz recebe push com **produto e quantidade** e responde
— confirma, ou recusa com justificativa obrigatória. É o mesmo fluxo de
reposição que já existia; o que mudou é a porta de entrada.

Duas consequências que precisaram de tratamento:

- **A matriz vê quando o pedido exige ASSAR.** Separar o que já está pronto é
  uma decisão; decidir se ainda dá tempo de produzir é outra. A linha do pedido
  agora carrega "ainda não saiu do forno hoje" quando é o caso — em âmbar, na
  própria linha e **antes** dos botões, porque depois deles seria lida tarde
  demais.
- **A tela vazia deixou de ser um beco.** "Nada saiu do forno na matriz ainda
  hoje" virava fim de linha; agora ela aponta para a busca, que é justamente o
  que resolve o problema de quem chegou ali.

## Aviso de versão nova, com reinício (ago/2026)

O app era `registerType: "autoUpdate"`: o service worker novo assumia sozinho
no carregamento seguinte. Nunca ficava versão velha presa — mas também ninguém
sabia que a versão tinha mudado, e isso produziu duas conversas repetidas na
padaria: *"a correção já entrou aqui?"* e, pior, telas que mudavam de
comportamento no meio do expediente sem explicação.

Agora o service worker novo **baixa e espera**. Uma faixa verde aparece no topo
— "Nova versão disponível · Reinicie para aplicar" — com um botão de largura
cheia, **Atualizar agora**, que ativa a versão nova e recarrega.

Quatro decisões:

- **O botão reinicia de verdade.** Num PWA instalado, "reiniciar o aplicativo"
  não é fechar a janela: o service worker antigo continua no controle até
  **todas** as abas fecharem, e no PC do caixa isso não acontece. O botão chama
  `updateSW(true)`, que manda `SKIP_WAITING` e recarrega. O operador não
  precisa saber de nada disso.
- **A faixa não some sozinha.** Diferente do aviso de sucesso, ela fica até
  alguém tocar. É o que garante que ninguém passe o expediente numa versão
  antiga achando que está na nova.
- **Fica no topo, e o aviso de operação continua embaixo.** Um é anúncio sobre
  o APP; o outro responde ao que a pessoa acabou de fazer. No mesmo canto se
  atropelariam, e a que sumiria por baixo seria a confirmação da ação em curso.
- **Verificação de hora em hora** (`registro.update()`). O navegador só procura
  service worker novo quando a página carrega, e no PC do caixa o app fica
  aberto o dia inteiro — sem isso, uma correção publicada às 8h só apareceria
  no dia seguinte.

O componente vive **fora do `App`** (`src/main.tsx`) para valer também na tela
de login e na de carregamento: é justamente na abertura do dia que o app
encontra a atualização da noite, e depender de alguém já estar logado atrasaria
o aviso.

> **Na virada:** a versão publicada hoje ainda é `autoUpdate`, então a troca
> para esta acontece automaticamente uma última vez. Da **próxima** publicação
> em diante é a faixa que aparece.

## Ajustes de uso real (ago/2026)

Correções vindas do uso, não de especificação:

| Ponto | O que estava acontecendo | Correção |
|---|---|---|
| Reposição sem botão | A matriz recebia o aviso, abria o app e via só o cabeçalho do grupo da filial. Confirmar e "não vai" ficavam atrás de mais um toque, e a leitura foi "não apareceu botão nenhum" | Grupo com reposição **pendente nasce aberto**; grupo já respondido continua fechado, porque aí é histórico. O estado explícito continua vencendo, para fechar seguir funcionando |
| Aviso mudo | A Web Notifications API **não deixa escolher o som** — quem toca é o canal do sistema, e com o app em primeiro plano ele costuma sair calado, assumindo que a pessoa está olhando a tela. No balcão ela não está: a janela fica atrás do PDV | Som gerado pelo próprio app (`src/lib/somDeAviso.ts`, WebAudio, sem arquivo para baixar), mais `renotify` e vibração na notificação do sistema |
| Lista diária sem aviso | Só reposição avisava a matriz. A lista do dia seguinte chegava em silêncio, e a matriz reabria a tela para ver se tinha chegado | A filial que envia a lista dispara push para a matriz, com a contagem de produtos, levando ao Cronograma |
| Botão de enviar | "Enviar pedido atualizado" quebrava em duas linhas no celular e repetia "pedido", que é o assunto da tela inteira | **"Atualizar"** |
| Trocar a data | O link "planejar para outra data" vivia dentro da Programação geral, no meio da montagem — invisível na prática | Botão **"outra data"** ao lado da própria data, no topo da tela. Em tela estreita ele desce para uma linha própria em vez de espremer o título |
| Logomarca | O PNG é transparente, então o vermelho da marca aparecia sobre o creme do fundo do app | Placa **branca** atrás da marca. O fundo do app continua o mesmo; o que mudou é a marca ter chão próprio |

## Nova Fornada: anunciar, e não só marcar (ago/2026)

A aba deixou de ser "marcar o progresso da lista" e passou a ser o que o dono
do negócio descreveu: **avisar as filiais do que acabou de sair e recolher o
pedido de quem se interessar**. Quatro mudanças sustentam isso.

**1. A contagem "X de Y itens já saíram hoje" saiu.** Ela falava de progresso
da lista numa aba que não é sobre a lista. O progresso do dia se lê no card de
Confirmação, no Cronograma, que é onde ele decide alguma coisa.

**2. Busca no catálogo INTEIRO.** A matriz assa coisa que não estava
programada — e sem um caminho para anunciar esse item, as filiais só
descobriam no dia seguinte, quando não adianta mais. Agora digita o nome,
toca em "anunciar", e as três lojas ficam sabendo na hora. Só produtos ativos
na produção: anunciar item pausado no cadastro abriria pedido de reposição de
coisa que a padaria decidiu não fazer.

Consequência: o painel deixou de exigir cronograma confirmado. Um dia sem
lista montada (feriado, movimento imprevisto) não pode impedir a matriz de
avisar o que saiu do forno.

**3. O aviso leva ao lugar certo.** O corpo do push passou a dizer que o item
**está disponível para pedidos**, não só que saiu — "saiu do forno" sozinho
não convida a filial a fazer nada. E tocar no aviso agora abre a aba **Nova
Fornada**, não a última aba usada: o servidor manda o destino em `data.url`, o
service worker repassa, e `src/lib/rota.ts` traduz em aba. Com o app aberto a
troca vem por `postMessage`, que preserva a tela — recarregar jogaria fora o
pedido que a filial estava digitando.

**4. Reposição confirmada entra na produção de hoje.** Quando a matriz
confirma um pedido de item que **não estava no cronograma**, o item passa a
contar como produzido hoje (`src/lib/producaoDeHoje.ts`). Sem isso ele sumia
da contabilidade: foi produzido e entregue, mas o plano do dia não o conhecia
— e o plano do dia é o **denominador da taxa de perda**. Uma perda lançada
amanhã sobre esse item apareceria como perda sem produção, número que não
fecha e que ninguém consegue explicar depois.

Duas regras fixas nesse ponto: item que **já está** na lista não entra de novo
e a quantidade planejada fica intacta (somar as duas inflaria a produção do
dia com mercadoria que não existiu); e o plano não é reescrito em mais nada —
status, autoria e o registro de `producaoRealizada` continuam como estavam.
Item novo, não citado em `codigosNaoProduzidos`, conta como produzido, que é
exatamente o que aconteceu. Em dia sem cronograma montado, o plano de hoje
nasce aqui, já confirmado: o produto saiu do forno e foi pedido — não é
intenção, é fato.

O cancelamento com justificativa obrigatória já existia e continua: o campo de
motivo só aparece depois de escolher "não vai", e o botão fica travado
enquanto o texto estiver vazio. A filial vê o motivo na própria linha do
produto.

### Defeito corrigido: "permissão concedida" ≠ "aparelho registrado"

O app tratava as duas coisas como a mesma, e não são. O documento em
`dispositivos` — que é o que diz **para onde** o push vai — só nascia quando
alguém tocava em **Ativar**. Só que o cartão de ativação some da tela assim
que a permissão do navegador está concedida. Num aparelho que já tinha
permissão de antes, o cartão nunca aparecia, nenhum token era gravado, e o
aviso não tinha destino — em silêncio absoluto, que é o pior jeito de falhar.

Pior na troca de conta: um celular registrado uma vez como filial continuava
com `lojaId` de filial. Ele recebia os avisos de fornada e **nunca** os de
reposição, mesmo logado como matriz.

Agora o app registra o aparelho **sozinho, em silêncio**, sempre que a
permissão já estiver concedida — na abertura e a cada troca de loja ou
operador (`registrarAparelhoSePermitido`, em `src/lib/notificacoes.ts`). Com a
permissão concedida, `getToken` não abre prompt nenhum; sem permissão nem
chega a tentar, e quem pede permissão continua sendo o toque no cartão.
Regravar também **corrige o `lojaId`**, que é o que faz um aparelho que já foi
filial passar a contar como matriz.

O botão **"testar aviso"** passou a existir nos dois sentidos
(`TesteDeAvisos.tsx`), inclusive na tela vazia da filial — o dia em que
alguém desconfia do push é justamente o dia em que a tela está vazia, e sem o
teste "não chegou nada" e "não saiu nada" ficam indistinguíveis. Ele separa as
três causas, que exigem correções diferentes: aparelho não registrado, FCM
recusou (com o motivo traduzido), ou entregou e o aparelho não mostrou.

## Cronograma: cinco cards do mesmo tamanho (ago/2026)

A aba deixou de ser uma pilha de blocos de formatos diferentes. São cinco
cards com a MESMA casca (`CardCronograma`, em `TelaCronograma.tsx`), nesta
ordem:

| # | Card | O que abre dentro |
|---|---|---|
| 1 | **Programação geral** | A sanfona das 5 sessões e, dentro de cada uma, os produtos com a quantidade pedida. É onde a lista de amanhã é montada e de onde se vai ao Resumo |
| 2 | **Confirmação de hoje** | O que realmente saiu do forno (`ConfirmarProducao`, embutido). Só aparece quando existe plano confirmado hoje |
| 3–5 | **Matriz · Arthur Bernardes · Benjamin Constant** | O que vai para cada loja, quebrado por sessão |

Cards 1 e 2 são as duas metades do mesmo ciclo — o de cima diz o que foi
**pedido**, o de baixo o que realmente **saiu**. Os três de baixo são esse
mesmo conteúdo repartido por destino.

Decisões que sustentam o desenho:

- **Uma casca só, e não cinco blocos parecidos.** "Mesmo tamanho, mesmo
  visual" vira consequência do código em vez de disciplina de quem edita:
  fechados, os cinco cabeçalhos medem exatamente 70px, e qualquer ajuste no
  cabeçalho vale para os cinco de uma vez.
- **A contagem do cabeçalho é em VARIEDADES, não em unidades.** "12 itens" é
  o tamanho da lista que alguém vai separar ou conferir. O total em unidades
  continua no rodapé do corpo, junto dos produtos, onde tem contexto — no
  cabeçalho ele só competia com o número que importa.
- **A data é o título da página, não um card.** Os cinco falam do mesmo dia;
  repetir a data em cada um seria ruído. Ela deixou de ser botão: a porta da
  montagem passou a ser o card da Programação geral, que é onde a montagem
  mora.
- **Todos nascem fechados.** A maior parte das aberturas da aba é consulta, e
  o cabeçalho já responde "quantos itens" e "em que pé está". A confirmação
  pendente aparece em laranja no próprio cabeçalho — mais visível do que
  quando o bloco vivia aberto e era preciso ler para descobrir.
- **O corpo é escondido, não desmontado** (`hidden`, não condicional). A
  confirmação do dia guarda as caixas que o operador desmarcou; recolher o
  card por engano não pode jogar essa conferência fora.

`ConfirmarProducao` ganhou a prop `embutido`: sem moldura, sem título próprio
e sem o parágrafo que explica o momento — o card já carrega os três, e dois
parágrafos longos empurrariam as caixas de marcar para baixo da dobra.

## Relatório do forno em Análises (ago/2026)

A marcação de fornada virou hábito porque custa um toque. O efeito colateral
é um dado que não existia em lugar nenhum na padaria: **a hora em que cada
coisa fica pronta, todos os dias**. A tela de Análises agora lê esse
histórico, abaixo dos gráficos de perda, numa seção própria — "O que saiu do
forno".

| Bloco | O que responde |
|---|---|
| Fornadas por dia / 1ª fornada (típica) / total no período / dias com marcação | O ritmo geral e a que horas a padaria de fato começa a entregar. A "1ª fornada típica" é a **mediana** da primeira marcação de cada dia — uma madrugada atípica não desloca o número |
| Ritmo do forno ao longo do dia | Média de fornadas por faixa de 3h, num dia típico. Faixa vazia à tarde é balcão descoberto no fim do expediente — e sobra da manhã encalhando |
| Itens que mais repetem fornada | Quantas vezes por dia cada item sai. Número alto é candidato a lote maior (menos setup); perto de 1 é item que sai uma vez e acabou |

Três decisões que valem registrar:

- **A janela é aplicada sobre a MARCAÇÃO, não sobre a lista de produção.**
  Cada fornada carrega a própria data e a própria hora. Uma lista montada em
  outro dia não entra na conta do período — o relatório responde "o que
  aconteceu no forno nestes N dias", e não "o que estava planejado".
- **O valor plotado é MÉDIA POR DIA, não total.** Em 90 dias qualquer faixa
  acumula número grande e o ritmo de um dia típico some. "Saem 3 fornadas
  entre 4h e 7h" é acionável; "saíram 270 em 90 dias" não é. A média divide
  pelos **dias com fornada**, não pelo tamanho da janela — senão abrir "90
  dias" com 5 dias de dado diluiria tudo a zero e o gráfico mentiria dizendo
  que o forno está parado.
- **Zero de verdade não desenha barra.** O piso de 2% de largura existe para
  que uma taxa baixíssima ainda se veja; aplicá-lo a uma faixa com ZERO
  fornada desenharia atividade onde não houve nenhuma — justamente o buraco
  no dia que o gráfico serve para denunciar.

O histórico é buscado **sob demanda**, só quando alguém abre Análises
(`Repositorio.listarFornadasNoPeriodo`). O dia a dia carrega apenas as
fornadas de hoje: elas acumulam rápido (um item que sai 6 vezes ao dia, vezes
dezenas de produtos, vezes 30 dias) e trazer tudo na abertura do app queimaria
leitura sem servir para nada. A consulta usa intervalo em **um campo só**
(`data`), sem outro filtro nem ordenação por campo diferente — assim o
Firestore resolve com o índice que já existe e ninguém precisa criar índice
composto à mão. Loja e categoria são recortadas no cliente, sobre o que já
veio; mexer nesses filtros não dispara consulta nova.

Cobertura em `scripts/verificar_logica.ts`, caso 23: virada de mês e de ano na
janela, marcação fora do período, filtro de categoria, faixa fora do
expediente, concordância de singular/plural no detalhe, período vazio (sem
divisão por zero) e produto marcado que depois saiu do catálogo.

## Insights de catálogo com IA (Gemini)

Na tela de Análises, botão "✨ Gerar insights com IA": reúne um resumo por
produto ATIVO das 5 categorias de produção (dias desde a última produção,
total produzido/perdido nos últimos ~60 dias, perda separada por motivo
"sobra não vendida") e pede ao Gemini para apontar padrões — ex.: um
produto sendo produzido além do que vende (sobra alta), um produto ativo
que não aparece em nenhum plano confirmado há muitas semanas, ou qualquer
outra tendência visível nos números. Puramente informativo: só lista
observações para o operador avaliar, nunca pausa produto, muda cadastro
ou altera o cronograma sozinho — mesmo padrão "sempre assistido" das
outras sugestões por IA do app.

**Arquitetura:** mesmo desenho da sugestão de produção — a chamada ao
Gemini acontece só no servidor (`api/insights-catalogo.ts`), o navegador
nunca vê a chave da API. Usa a mesma variável `GEMINI_API_KEY` já
configurada no Vercel (ver seção anterior) — nenhuma configuração
adicional é necessária se a sugestão de produção já estiver ativa.

### Instabilidade do Gemini (erro 503/429) — set/2026

Sob alta demanda, a própria API do Gemini pode responder **503 (modelo
sobrecarregado)** ou **429 (limite de taxa)** — não é um problema de
configuração deste app, é o serviço da Google momentaneamente
indisponível. As duas funções serverless (`api/sugestao-producao.ts` e
`api/insights-catalogo.ts`) já tentam de novo automaticamente uma vez
(espera de 800ms) antes de desistir, seguindo a orientação oficial da
Google para esses dois códigos. Se mesmo assim o erro aparecer, a
mensagem agora deixa claro que é temporário — tente de novo em alguns
minutos. Não tentamos mais vezes que isso de propósito: cada função
serverless do Vercel tem um tempo máximo de execução (10s no plano
Hobby), e cada chamada ao Gemini já pode levar alguns segundos — retries
demais arriscam estourar esse limite, o que seria um erro pior (sem
mensagem nenhuma) do que simplesmente informar que está sobrecarregado.

## O app diz se a lista saiu (ago/2026)

Quem apertava "Imprimir no caixa" não recebia mais nada depois disso. O
defeito não era a impressão falhar — era o **silêncio**.

No primeiro dia de uso o programa do caixa estava fechado: o app gravou
certo, a nuvem guardou certo, e não havia ninguém do outro lado para
pegar. Da tela, isso era indistinguível de ter funcionado. A descoberta
veio de abrir o `agente.log` no PC — coisa que o padeiro não vai fazer.

Agora o app acompanha os trabalhos que enviou (`observarImpressao`, uma
escuta por documento) e fecha o assunto de um dos três jeitos:

| Desfecho | O que aparece |
|---|---|
| Todas as partes impressas | "Impresso no caixa — N partes." |
| Alguma parte com erro | "A impressora do caixa recusou: <motivo do agente>" |
| Nada respondeu em 45s | "O caixa não respondeu. Confira se o programa de impressão está aberto…" |

O terceiro é o que mais importa e o menos óbvio: é o caso do agente
fechado, e a mensagem aponta para a causa real em vez de deixar o
operador esperando um papel que não vem. A lista não se perde — fica na
fila e sai assim que o programa abrir, e a mensagem diz isso.

**45 segundos** porque o agente consulta a fila a cada 15 e leva 1 a 2
para imprimir: cobre um ciclo perdido com folga, e é pouco o bastante
para o operador ainda estar perto da impressora quando a mensagem chegar
— que é quando ela serve para alguma coisa.

Escuta por id, e não consulta na coleção: cada documento carrega a imagem
inteira em base64, e puxar os trabalhos de outras impressões custaria
megabytes numa conexão de padaria.

## A fita é papel de cozinha, não peça de marca (ago/2026)

Quatro correções depois de ver a bobina impressa de verdade.

### Cinza não existe na térmica

A térmica imprime **1 bit**: cada ponto sai preto ou não sai. O `#555555`
de "2 itens nesta sessão" e o `#333333` de "Montado por: fulano" viravam
um chuvisco de pontos soltos depois do corte de limiar — e a 14–15px isso
destruía a palavra. Na tela o cinza parecia discreto; no papel ele não
existia.

Tudo passou a preto puro, e as fontes pequenas cresceram:

| Elemento | Antes | Agora |
|---|---|---|
| "Montado por: fulano" | 15px `#333` | **20px negrito** preto |
| "N itens nesta sessão" | 14px `#555` | 18px preto |
| "corte aqui" | 12px `#777` | 16px preto |
| Régua entre itens | 1px `#ccc` | 1px preto |
| Linha de corte | 2px `#999` | 2px preto |

A régua `#ccc` sumia por completo no limiar: a lista saía sem separação
nenhuma entre os itens.

Conferido rodando a fita real no navegador e simulando a conversão de
1 bit com limiar em 128 — o resultado em preto e branco ficou idêntico ao
original em cinza, que é o sinal de que nada mais se perde na impressão.

### Sem "PADARIA PÃO DE MEL" no topo

Só funcionário usa este app e esse papel nunca sai da cozinha. A linha
gastava 36px de bobina em toda sessão de todo dia para informar à padaria
o nome dela mesma. O rodapé também perdeu o "app Produção & Perdas" pela
mesma razão.

### Uma faixa preta por pedaço de papel

Na fita de separação o nome da loja já sai em faixa preta; repetir o mesmo
peso na data punha duas barras a menos de 120px uma da outra. Duas coisas
gritando ao mesmo tempo é o mesmo que nenhuma gritar — e gasta o dobro de
tinta térmica.

Manda a identidade daquele papel: na separação é a **loja**; na lista de
produção é a **data**. Quem não leva a faixa fica em negrito com uma
régua embaixo.

### Logomarca discreta no app

180px em vez de 320. A marca cumprimenta e sai do caminho — quem abre o
app trabalha nele dezenas de vezes por dia e já sabe de quem é.

## Fita de impressão (divisão automática) — set/2026

Erro relatado: "não foi possível gerar a imagem para impressão", sem
melhorar ao tentar de novo (sinal de falha determinística, não
instabilidade passageira).

**Causa:** a fita é desenhada num canvas único, com a altura crescendo
conforme o número de sessões/itens do dia. Alguns navegadores (histórico
conhecido no Safari/iOS, mas não só) falham em silêncio ao converter um
canvas acima de ~4096px de altura em imagem (`canvas.toBlob()` retorna
`null`, sem lançar exceção) — daí a mensagem genérica e o motivo de
tentar de novo nunca resolver: o cronograma daquele dia é sempre grande
demais, não é uma falha aleatória.

**Correção:** `gerarCanvasesFita` (`src/lib/gerarImagemLista.ts`) agora
calcula a altura de cada sessão antes de desenhar (`computarBlocos`) e
agrupa as sessões em uma ou mais imagens, cada uma ficando abaixo de
`ALTURA_MAXIMA_SEGURA_PX` (4000px, com margem de segurança sobre o limite
real dos navegadores) — sem nunca dividir os itens de uma mesma sessão
entre duas imagens. Na grande maioria dos dias (cronograma cabe em uma
imagem só) nada muda para o operador. Só nos dias excepcionalmente
grandes é que vira mais de uma imagem, cada uma já rotulada "imagem X de
Y" no rodapé.

**Baixar várias imagens:** quando o resultado é mais de um arquivo e o
navegador não suporta compartilhar vários arquivos de uma vez
(`navigator.share`), o app **não** tenta baixar tudo sozinho em
sequência — um teste automatizado confirmou que navegadores descartam
downloads disparados em série por código, entregando só o primeiro e
sem avisar nada (o operador acharia que baixou tudo, mas só teria uma
fita incompleta). Em vez disso aparece um botão "Baixar imagem N de M"
por imagem — cada download exige um clique de verdade do operador,
garantido de funcionar em qualquer navegador.

### Planejado × realizado (ago/2026)

Gargalo levantado pela padaria: na rotina diária acontece de um ou outro
item da lista simplesmente não sair. Até então o app tratava plano como
realidade, e isso contamina justamente a métrica que ele existe para medir:

| O que quebra | Por quê |
|---|---|
| Taxa de perda | O denominador é `perdido ÷ produzido`. Perda sobre produção que não aconteceu não significa nada |
| Distribuição para filiais | Promete uma quantidade que não existe |
| Sugestão por IA | Aprende com produção que nunca ocorreu |

`src/lib/producaoRealizada.ts` separa intenção de resultado. O plano
**nunca é reescrito** — as sessões continuam registrando o que foi
planejado, e o que saiu entra à parte, em
`PlanoDeProducaoDiario.producaoRealizada`, para dar para comparar
planejado × realizado depois.

- **Formato binário de propósito.** O dono do negócio descreveu o caso
  real: quando um item não é produzido, "simplesmente não sai, e pronto" —
  não sai em quantidade menor. Por isso a confirmação guarda uma lista de
  códigos que não saíram, e não uma quantidade real por item. Se um dia
  passar a haver produção parcial, é neste módulo que o modelo muda.
- **Momento:** fim do expediente, junto com as perdas (escolha do dono do
  negócio — uma parada só no fechamento em vez de mais uma interrupção de
  manhã). O componente é `ConfirmarProducao.tsx`, no topo de `TelaPerdas`.
- **Desenhado para o dia normal:** todos os itens já vêm marcados como
  produzidos; o operador só desmarca a exceção. Um toque resolve o dia em
  que saiu tudo.
- **Plano sem confirmação conta tudo como produzido** — é o palpite menos
  errado enquanto ninguém informou nada, e preserva o comportamento
  anterior para os planos já existentes.
- **Não se perde o que não foi produzido:** `calcularCandidatosPerda`
  também respeita a confirmação, então um item que não saiu do forno some
  da lista de Perdas. `metricas.ts` e `insightsCatalogo.ts` idem.

### Perda não é vencimento (ago/2026)

Correção conceitual pedida pelo dono do negócio depois de topar com a
mensagem *"Nenhum produto dentro do prazo de validade está disponível"*:

> Produtos podem ficar prontos porém fora do padrão. No entanto, devem ser
> lançados como perdas, mesmo que feitos no mesmo dia. Produtos
> considerados como perda não necessariamente são os produtos que não
> foram vendidos dentro do prazo de validade.

O desenho anterior tratava o prazo de validade como **autorização** para
lançar. Estava errado: um pão sai do forno queimado às 5h e é perda às 5h,
sem nenhuma relação com validade.

O prazo agora serve só para **atribuição** — dizer de qual fornada a perda
provavelmente veio. `calcularCandidatosPerda` devolve duas camadas:

| Situação | `origens` | O que acontece na tela |
|---|---|---|
| Tem fornada dentro do prazo | preenchido, FIFO | Operador escolhe a fornada (mais antiga pré-selecionada) |
| Já produzido antes, nada no prazo | vazio | Lança mesmo assim, sem fornada de origem; o cartão mostra a data da última produção |
| Nunca produzido | — | Não entra na lista |

A única trava que restou é a regra do dono do negócio: para lançar perda, o
produto precisa ter sido produzido em alguma oportunidade.

**Armadilha corrigida junto:** `TelaRegistroPerda` tinha
`podeSalvar = preview.ok && planoDeProducaoId !== ""`. Com a nova camada de
produtos sem fornada atribuível, `planoDeProducaoId` é legitimamente vazio —
o botão "Registrar perda" ficaria permanentemente desabilitado e a
funcionalidade apareceria na tela sem funcionar. A fornada de origem só é
exigida quando existe alguma para escolher.

### Perda no mesmo dia (ago/2026)

Gargalo levantado pela padaria: uma fornada queimada ou fora do padrão
precisa ser lançada no mesmo dia. Deixar para o dia seguinte trava a
conferência, e o funcionário esquece.

**O app já aceitava isso desde o início** — vale registrar para não
"corrigir" de novo o que não estava quebrado:

- `calcularCandidatosPerda` (`src/lib/janelaValidade.ts`) inclui a fornada
  com `diasDesdeProducao === 0`, ou seja, o que foi produzido hoje já
  aparece na tela de Perdas hoje.
- `MotivoPerda` (`src/types/perda.ts`) já tinha `queimado` e
  `erro_producao`.

O que faltava não era capacidade, era chamada: nada avisava o operador, e
a tela de Perdas estava enquadrada como atividade de fim de expediente.
`src/components/AvisoPerdaPendente.tsx` resolve isso — enquanto houver
fornada válida hoje e NENHUMA perda lançada hoje, um aviso aparece em
qualquer aba com o botão "Lançar perda agora".

O botão "hoje não teve perda" existe de propósito: **zero perda é um
resultado legítimo, diferente de "esqueci de lançar"**. Sem essa saída, o
aviso ficaria na tela o dia inteiro num dia bom e o operador aprenderia a
ignorá-lo — que é exatamente como um alerta perde a função. A dispensa
grava a data (`padaria:sem-perdas:<AAAA-MM-DD>`), então amanhã o aviso
volta sozinho.

### Gerar o cronograma inteiro por IA — adiado de propósito

Ideia levantada pelo dono do negócio (ago/2026): um botão que preencha as
5 sessões de uma vez, em vez de sugerir categoria por categoria.
Concordamos com a ideia e adiamos a construção, por três motivos:

1. **Sem histórico, a IA inventa.** A sugestão se apoia em produção e
   perda passadas. O app entrou em uso em ago/2026 — números gerados
   antes de haver histórico pareceriam confiáveis e seriam fabricados,
   o que é pior que não ter o botão.
2. **O botão único remove a fricção que protege.** Sugerir por categoria
   obriga a abrir cada sessão e olhar. Preencher as 5 de uma vez convida
   ao "confirmar" sem ler — e erro de planejamento custa dos dois lados
   (faltou é venda perdida, sobrou é perda registrada).
3. **Volume de dados.** Para sugerir uma quarta-feira é preciso ter
   várias quartas-feiras. 4 semanas = 4 amostras por dia da semana, o
   mínimo defensável.

Quando for construído, duas exigências ficam registradas: cada número
deve vir acompanhado da base que o gerou (ex.: "4 últimas quartas: 45,
50, 48, 47") para virar proposta auditável em vez de caixa-preta, e
**produto sem histórico fica em branco**, nunca chutado.

## Identidade visual (ago/2026)

A logomarca da padaria entrou no ícone do atalho, nas notificações e na
tela de entrada. Cores amostradas do próprio arquivo, nunca escolhidas no
olho: vermelho `#C40027`, amarelo `#FFF950`, creme `#FFFFD7`.

Tudo é gerado por `scripts/gerar_icones.py` a partir de
`assets/logo-pao-de-mel.png`. Ícone é derivado, não original: mudou a
marca, roda o script e os sete arquivos mudam juntos — ninguém precisa
lembrar quais eram os tamanhos.

A origem em alta fica em `assets/`, **fora de `public/`**: tudo que está
em public/ entra no precache do service worker, e o original tem 673 KB
que todo celular baixaria a cada atualização sem nunca exibir. A versão
da tela de login sai do script com 800 px e 90 KB.

### Três famílias, três problemas diferentes

| Arquivo | Regra própria |
|---|---|
| `pwa-192`, `pwa-512`, `apple-touch-icon` | Marca inteira sobre creme. A pílula é 2,8× mais larga que alta e nunca encherá um quadrado — quem carrega o reconhecimento nesse tamanho é a forma vermelha e o amarelo, não a leitura das letras |
| `pwa-maskable-512` | O Android recorta em círculo, gota ou quadrado, à escolha do fabricante. A marca entra a 75% da largura: é o limite para a pílula deitada caber inteira no círculo de segurança |
| `favicon-32` | Só o "P" do script. A 16–32 px reais a marca inteira é mancha; uma letra do próprio alfabeto dela continua reconhecível |
| `badge-96` | Silhueta BRANCA sobre transparente. O Android descarta as cores do badge e usa só o formato — a logomarca colorida ali virava um borrão cinza na barra de status |

O badge é desenhado 8× maior e reduzido no fim, com **dois** cortes largos
em vez de três finos: aos ~24 px reais da barra, vãos estreitos somem por
completo e sobra um oval branco sem leitura.

O halo branco em volta da pílula é removido no script (corte só no branco
puro, tolerância curta — o "PADARIA" da marca é creme `#FFFFD7`, longe o
bastante para não ser apagado junto).

`theme_color` e `background_color` usam a **cor de fundo do app**
(`#faf7f2`). O vermelho da marca foi testado nesse lugar e reprovado
(ago/2026): a barra do sistema em vermelho forte brigava com a paleta
calma de dentro do app, e a emenda entre as duas ficava visível o tempo
todo. Igualando a barra ao fundo, a moldura some e sobra o conteúdo.

O vermelho continua onde é dele: dentro da logomarca, no ícone do atalho,
no favicon e na tela de entrada.

## Instalar como app (PWA) — ago/2026

O app é instalável: em vez de procurar o link no navegador, o operador abre
por um ícone próprio, em tela cheia, sem barra de endereço.

- **Android / Chrome / Edge (celular e PC):** o navegador dispara
  `beforeinstallprompt` e o app mostra o cartão "Deixe o app na tela de
  início" com um botão **Instalar** — instalação em um toque.
- **iPhone / iPad (Safari):** a Apple não implementa instalação
  programática. Nesse caso o mesmo cartão mostra as instruções manuais
  (Compartilhar → Adicionar à Tela de Início) em vez de um botão que não
  funcionaria. A detecção está em `src/components/BannerInstalar.tsx`.
- O cartão some sozinho quando o app já está rodando instalado
  (`display-mode: standalone`, ou `navigator.standalone` no iOS) e o
  "agora não" fica gravado no `localStorage`.

**Service worker e versão nova:** `vite.config.ts` usa
`registerType: "autoUpdate"`. A cada `git push`, o Vercel publica e o
service worker baixa a versão nova em segundo plano, assumindo no
carregamento seguinte — sem o operador precisar limpar cache. Esse é o
erro clássico de PWA (app instalado preso numa versão velha) e está
tratado de propósito. As rotas `/api/*` ficam fora do cache
(`navigateFallbackDenylist`): as chamadas ao Gemini precisam sempre ir à
rede, nunca podem ser respondidas por uma resposta guardada de outro dia.

Os ícones em `public/` foram gerados por script (pão com três cortes,
sobre o marrom `--cor-acento` do app), incluindo a variante `maskable`
exigida pelo Android para o ícone preencher a máscara do sistema, e o
`apple-touch-icon.png`, única via de ícone no iPhone (o iOS ignora o
manifest para isso).

## Camada de dados na nuvem (ago/2026)

### Por que Firestore

O requisito decisivo não foi preço nem modelo de dados, foi **persistência
offline**: o wifi da cozinha cai, e o app precisa continuar aceitando
lançamento, sincronizando sozinho quando a conexão volta. O Firestore
resolve isso nativamente (`persistentLocalCache`); no Supabase seria
trabalho extra ou uma ferramenta de terceiros (PowerSync).

Volume da operação contra a franquia gratuita (plano Spark), conferido em
ago/2026:

| | Incluído/dia | Uso estimado |
|---|---|---|
| Escritas | 20.000 | ~200 |
| Leituras | 50.000 | poucos milhares |
| Armazenamento | 1 GB | alguns MB/ano |

### Modelo das lojas

`src/lib/lojas.ts` é a fonte da verdade. As filiais **não produzem, pedem**:
informam a quantidade de que vão precisar no dia seguinte, a matriz produz
tudo e distribui. Por isso só a matriz monta cronograma e mantém o catálogo.

A identificação da loja vem do e-mail da conta autenticada, resolvido em
memória — são três contas fixas, e uma leitura extra por abertura de app não
se justificaria. **`firestore.rules` usa o mesmo mapeamento**: se entrar uma
quarta loja, os dois arquivos mudam juntos.

Loja e operador são coisas separadas de propósito:

| | O que responde | Onde é verificado |
|---|---|---|
| Loja (login) | De ONDE o dado vem | Regras do Firestore |
| Operador (nome) | QUEM digitou | Só rastreabilidade interna |

### Segurança

`firestore.rules`, na raiz do projeto, é a **única coisa que protege os
dados**. A configuração em `src/lib/firebase.ts` é pública por desenho — o
navegador de qualquer usuário precisa dela, então esconder em variável de
ambiente daria falsa sensação de segurança sem esconder de ninguém.

Resumo das regras:

| Coleção | Leitura | Escrita |
|---|---|---|
| `produtos` | qualquer loja | só matriz |
| `planos` | qualquer loja | só matriz |
| `perdas` | qualquer loja | cada loja só cria perda carimbada com o próprio id; **nunca** atualiza nem apaga |

Perda não se reescreve nem se apaga: é registro de desperdício, e correção
se faz com lançamento novo. Coleção não listada fica fechada por padrão,
para nenhuma coleção nova nascer aberta por esquecimento.

**Como publicar as regras:** console do Firebase → Firestore → aba **Regras**
→ colar o conteúdo de `firestore.rules` → **Publicar**. Sem esse passo o app
não lê nem grava nada (o modo de produção começa negando tudo, que é o
comportamento correto).

### Migração de localStorage

`ImportarDadosLocais.tsx` roda uma vez, e só quando as duas condições valem
juntas: o catálogo na nuvem está vazio E existe dado neste aparelho. Some
sozinho depois e nunca aparece nas filiais. Nada é apagado do celular —
rodar duas vezes sobrescreve os mesmos documentos (ids preservados) em vez
de duplicar.

### Tamanho do bundle

O Firebase custa ~186KB (gzip) — o bundle saiu de 62KB para 250KB. Como o
app é PWA com precache, isso é um download único por aparelho, não por
abertura. `vite.config.ts` separa Firebase e React em pedaços próprios: sem
isso, **qualquer** alteração de tela invalidaria os 186KB do Firebase no
cache e todo celular baixaria tudo de novo a cada `git push`. Com a
separação, uma correção de tela faz o aparelho baixar ~20KB.

### O que NÃO foi testado aqui

O emulador do Firestore não roda no ambiente onde este código foi
construído (o download do emulador é bloqueado pela rede), então a camada
Firestore e as regras de segurança **não têm teste automatizado**. O que foi
verificado: tipagem estrita, build, as asserções de lógica de negócio e o
fluxo de login em navegador real (incluindo o comportamento sem conexão).
A primeira execução contra o projeto real precisa de conferência manual —
ver "Conferência pós-migração" abaixo.

### Conferência pós-migração

Na primeira vez que o app rodar contra o Firestore real, conferir nesta ordem:

1. **Login em cada uma das três lojas** — se der "Sem conexão" com internet
   funcionando, o provedor E-mail/senha não foi ativado no console.
2. **Matriz: enviar os dados do aparelho** quando o cartão de migração
   aparecer, e conferir no console do Firebase (Firestore → Dados) que as
   coleções `produtos`, `planos` e `perdas` foram criadas.
3. **Filial: abrir o catálogo** — deve ler os produtos. Se falhar, as regras
   não foram publicadas.
4. **Filial: tentar alterar um produto** — deve ser negado. Se conseguir, as
   regras publicadas não são as deste arquivo.
5. **Modo avião no celular** — o app deve continuar abrindo e aceitando
   lançamento; ao voltar a conexão, o dado aparece nas outras lojas.

### Retorno de gravação e o defeito que o motivou (ago/2026)

Primeiro dia contra o Firestore real, relatado pela padaria: logado como
filial, editar um produto deixava o botão preso em **"Salvando..." para
sempre**, sem mensagem nenhuma. E, como matriz, cadastrar um produto
funcionava mas não dizia que tinha funcionado.

Eram três problemas somados, todos nascidos da virada de `localStorage`
para um banco em rede — com localStorage nenhuma escrita falhava nem
demorava:

1. **Sem `try/finally` nas telas.** A promessa era rejeitada pela regra de
   segurança e o `setSalvando(false)` nunca rodava.
2. **Sem tradução do erro.** `permission-denied` não diz nada a um
   padeiro. `src/lib/errosFirestore.ts` traduz cada caso.
3. **Sem limite de espera.** Este é o mais sutil: com persistência
   offline, uma escrita feita sem rede fica **enfileirada e a promessa
   nunca resolve** até reconectar. Só `try/finally` não resolveria — o
   botão continuaria travado, agora com o dado já salvo localmente.

A correção é central, em `App.tsx`: o envelope `comRetorno()` embrulha
TODA gravação do app e alimenta `AvisoGlobal.tsx`. Ser um lugar só é
proposital — cada tela ter o próprio tratamento foi justamente o que
permitiu uma delas nascer sem.

| Situação | O que o operador vê |
|---|---|
| Gravou | Faixa verde com o que foi salvo, some em 4s |
| Sem permissão | Faixa vermelha explicando que o catálogo é da matriz; fica até fechar |
| Sem rede (>6s) | Faixa verde: "Salvo neste aparelho. Vai para a nuvem assim que a internet voltar" |
| Sessão expirada | Faixa vermelha mandando entrar de novo |

Falta de rede aparece em VERDE de propósito: o dado está salvo no
aparelho e sobe sozinho. Um alerta vermelho faria o operador refazer um
trabalho que já está feito.

Detalhe de implementação que não deve ser "simplificado" depois: o
`setProdutos`/`setPerdas` de criação está amarrado ao `.then()` da
promessa, e não ao retorno de `comRetorno`. É isso que permite o limite
de espera existir sem perder o item recém-criado — offline, ele entra na
lista quando a conexão voltar.

### O app sempre abre na tela de entrada (ago/2026)

Antes, o nome salvo no aparelho entrava sozinho e o app abria direto na
tela de trabalho. Agora ele é apenas uma **sugestão**: a tela de entrada
aparece sempre, com o nome como botão.

```
        [logomarca]
          Matriz

       Continuar como
    ┌────────────────────┐
    │      Daniel        │
    └────────────────────┘
       é outra pessoa
```

Um toque para quem é o mesmo de ontem; um link para quem não é.

Parece um passo a mais, e é — mas evita o erro que ninguém percebe: numa
padaria o mesmo celular passa de mão em mão entre turnos, e o lançamento
de perda da tarde acabava assinado com o nome de quem trabalhou de manhã.
O registro de quem lançou é o que dá sentido ao histórico; assinatura
errada é pior que assinatura nenhuma.

O nome É o botão, e é o maior alvo da tela: é o que a pessoa vai tocar
todo dia, muitas vezes, com a mão ocupada.

"Trocar" no cabeçalho também apaga a sugestão — senão a tela de entrada
ofereceria de volta exatamente o nome que a pessoa acabou de recusar.

### Nome do operador é por loja

`padaria:operador:<lojaId>`. Antes era uma chave só, e entrar como filial
num aparelho já usado pela matriz herdava o nome anterior sem perguntar
nada — os lançamentos da filial saíam assinados por quem usou o celular
antes.

### Preço de custo e preço de venda: removidos (ago/2026)

Decisão do dono do negócio: não fazem sentido nesta ferramenta. Não eram
usados em nenhum cálculo — só ocupavam espaço no formulário e em todo
documento gravado. Removidos do tipo `Produto`, do formulário, dos dois
repositórios, da importação de planilha e de `data/produtos.seed.json`.
Precificação é assunto do Sistema de Gestão, não deste app.

### Anulação em vez de exclusão de perdas (ago/2026)

Caso real levantado pelo dono do negócio: um funcionário lança 1000 onde
eram 10 unidades. Um erro desses sozinho destrói a taxa de perda do mês —
a verificação `Caso 21` mostra 1010% contra os 10% reais.

A correção é **anulação, não exclusão**. O documento continua existindo
com `cancelada: true`, `canceladaPor`, `canceladaEm` e
`motivoCancelamento`. Apagar a linha esconderia que houve um erro de
lançamento; assim fica registrado o que foi lançado e quem corrigiu.

Todos os cálculos ignoram anulados: `metricas.ts` (taxa de perda e picos
por dia da semana) e `insightsCatalogo.ts`. A trava está em
`perdaEstaValida()`, em `src/types/perda.ts` — um cálculo novo que
esqueça de chamá-la volta a contar o erro, então é por lá que se começa
ao adicionar métrica.

A regra do Firestore limita a alteração aos quatro campos de anulação:

```
allow update: if ehMatriz()
  && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['cancelada','canceladaPor','canceladaEm','motivoCancelamento'])
  && request.resource.data.cancelada == true;
allow delete: if false;
```

Sem a lista de chaves, uma correção legítima viraria porta para reescrever
o peso, o motivo ou a data do lançamento original. `delete` continua
proibido para todos, inclusive a matriz.

### Senha para excluir produto (ago/2026)

`ConfirmarComSenha.tsx` revalida a senha da própria loja no Firebase
(`reauthenticateWithCredential`) antes de excluir produtos do catálogo.

Não há um segundo segredo para criar e distribuir, e a checagem é real —
uma senha guardada no código do app seria visível para qualquer um que
abrisse o navegador e serviria só de teatro. O que isso protege de fato é
o **celular destravado em cima do balcão**; contra quem sabe a senha da
loja, a proteção é a regra do Firestore, que já impede a filial de mexer
no catálogo.

### Ajustes de leitura da tela de Cronograma (ago/2026)

Todos vieram de uso real, e a razão de cada um importa mais que o ajuste:

| Antes | Depois | Por quê |
|---|---|---|
| Título "Cronograma de Produção" | Removido | A aba já diz onde o operador está; o título empurrava a DATA para baixo |
| Data em 16px | 19px + ícone de calendário | É o dado que, se lido errado, estraga a produção inteira. Continua no bege da paleta — presença sem alarme |
| "limpar esta sessão" dentro do corpo | Ícone de lixeira no cabeçalho, ao lado da contagem | Estava vizinho do "remover" de cada produto e os dois se confundiam |
| Nome da sessão sempre em 16px/bold | Recua para 13px em maiúsculas quando aberta | Aberto, quem interessa são os nomes dos produtos; um título grande disputa a atenção com a lista |
| Setas ▲▼ em texto | `IconeSeta` girando 180° | Consistência com os demais ícones |

`src/components/Icones.tsx` guarda os ícones em SVG inline — só traço,
nunca preenchido, sempre em `currentColor`, para nunca introduzirem cor
nova na paleta. São inline porque o app precisa abrir numa cozinha com
wifi ruim e não pode depender de CDN de ícones (mesma razão pela qual não
há fonte externa em `index.css`).

### Carimbo de versão

O rodapé mostra `<Loja> · versão de 26/08 03:40 · a1b2c3d`.

Existe para responder duas perguntas que apareceram no uso real: para o
operador, "a atualização já entrou neste celular?"; para quem dá suporte,
"qual código está rodando aí?" — sem isso, um defeito relatado obrigava a
adivinhar a versão.

O valor é injetado no build (`define` em `vite.config.ts`), formatado no
fuso de São Paulo (o build roda em UTC no Vercel, e três horas de
diferença no rodapé só gerariam dúvida) e inclui o hash curto do commit
quando `VERCEL_GIT_COMMIT_SHA` existe. Rodando local, fica só a data.

## Pedidos das filiais — Parte B (ago/2026)

As filiais não produzem, pedem. O fluxo diário fechado com o dono do
negócio:

1. **À noite:** cada filial monta o pedido do dia seguinte e **envia**
2. **À noite:** a matriz monta a própria produção e vê os pedidos chegando
3. **Ao confirmar:** saem DOIS documentos distintos
4. **De manhã:** a separação usa os romaneios

### Por que dois documentos

A operação faz duas perguntas diferentes, e um documento só não responde
as duas:

| Documento | Para quem | Mostra |
|---|---|---|
| Lista de Produção | Padeiro | Quantidade **totalizada** (matriz + filiais) |
| Separação — *Filial* | Quem separa de manhã | O que sai para **aquela loja** |

Um documento só, com o total, deixaria a separação adivinhando; um
documento só, por loja, faria o padeiro somar de cabeça. `src/lib/consolidacao.ts`
é o módulo puro que faz essa conta, e a verificação `Caso 22` trava a
propriedade que mais importa: **o que se produz tem que fechar com o que
se distribui**. Se essa soma não bater, sobra ou falta mercadoria no
despacho — o erro mais caro dessa operação.

O romaneio também vem agrupado por categoria: quem separa anda pela
padaria por setor, não por ordem alfabética de produto.

### Enviar é um passo explícito

Pedido em **rascunho não entra na produção**. A filial ainda está mexendo
nele, e produzir com base num número que ninguém confirmou é pior que
produzir sem ele.

O id do pedido é derivado da data e da loja (`2026-08-27_FILIAL_ARTHUR_BERNARDES`)
em vez de aleatório: enviar duas vezes — por toque repetido ou por
reconexão offline — atualiza o mesmo documento em vez de virar dois
pedidos somados.

### O risco de a filial atrasar

`PainelPedidosFiliais.tsx` mostra, no topo do Cronograma:

```
✓ Arthur Bernardes      enviado · 19 un
⚠ Benjamin Constant     aguardando
```

**Não bloqueia a confirmação de propósito.** Pode ser tarde, a filial
pode não ter o que pedir, e travar o cronograma da padaria inteira por
causa de uma loja seria pior. O que se garante é que ninguém confirme sem
ter visto que faltava alguém.

### Regras de acesso dos pedidos

A filial escreve só o próprio pedido; a matriz lê todos mas **não
escreve** — o número tem que ser o que a filial mandou, não o que a
matriz achou que ela queria. Pedido enviado não pode ser apagado: se a
filial desistir, ela zera os itens, e assim a matriz nunca fica sem saber
se a loja já respondeu.

Consequência prática no código: `listarPedidos(lojaId?)` recebe a loja
quando quem chama é uma filial. Não é otimização — uma consulta sem esse
filtro seria **recusada inteira** pelas regras.

### Onde cada coisa mora, e por quê (ago/2026)

Dois ajustes vieram de uso real e vale registrar o raciocínio, porque
"juntar tudo numa tela só" parece economia e não é:

**Confirmação de produção saiu de Perdas e foi para Cronograma.** A
observação foi do próprio dono do negócio: confirmar o que saiu do forno
e lançar perda são atividades diferentes, e a mesma janela confundia. A
confirmação fecha o ciclo do PLANO — o lugar dela é onde o plano vive.

O momento continua sendo o fim do expediente, de uma vez. A razão não é
comodidade: é aí que dá para comparar tudo o que foi **pedido** (matriz +
filiais) com o que realmente **saiu**, e ver na hora onde o gargalo
travou a produção. Por isso a tela de confirmação mostra o total
consolidado, não só a quantidade da matriz.

**A filial lança perda sobre qualquer produto ativo.** Na matriz a perda
é atribuída a uma fornada, porque ela produziu e sabe de qual lote veio.
Na filial isso não se sustenta: ela recebe mercadoria da matriz, tem no
balcão estoque de dias diferentes, e o que precisa é registrar o que
jogou fora. Amarrar à produção do dia ou à validade só travaria o
lançamento.

**Defeito encontrado em teste, corrigido junto:** a tela de Perdas
retornava cedo quando não havia fornada disponível, escondendo o
histórico do dia inteiro — inclusive a anulação de lançamento errado. Num
dia sem cronograma confirmado, a matriz ficava sem conseguir corrigir uma
perda digitada errada. O aviso virou um bloco dentro da tela, e o
histórico agora aparece sempre.

### Ajustes de legibilidade — segunda rodada (ago/2026)

Todos vieram de uso real, e o padrão que se repetiu vale registrar:
**texto explicativo na tela vira ruído depois que o operador aprende o
fluxo.** O que ensina na primeira semana atrapalha na segunda.

| O que estava | O que virou | Por quê |
|---|---|---|
| "Já existe um plano confirmado para esta data — os itens abaixo foram carregados dele. Salvar de novo atualiza a lista. / reimprimir esta lista sem mexer nela" | "Plano confirmado — carregado abaixo. / reimprimir" | Ninguém lê o parágrafo na décima vez |
| "Pedido enviado — 195 unidades. Dá para ajustar e enviar de novo até a matriz fechar a produção." | "Pedido enviado · 12 produtos" | Idem |
| Painel de pedidos em linhas compactas, com total de unidades | Um cartão por loja, verde ou âmbar, com a **variedade** de produtos | "195 unidades" não diz nada de relance; "12 produtos" dá a dimensão da lista que vai chegar. E o estado passou a se ler pela cor, antes da palavra |
| Grade com todos os produtos candidatos a perda | Busca no topo + acordeão por categoria | Na filial eram 86 blocos empilhados. O acordeão é o mesmo padrão da tela de Pedido, que o operador já conhece |

### Duas filiais numa bobina só

Com mais de uma filial tendo enviado pedido, aparece a opção **"Filiais
(todas)"**: um único documento com os pedidos das duas, para não gerar,
compartilhar e imprimir duas vezes.

A separação entre as lojas **não pode ser a faixa de corte comum** — essa
mesma faixa aparece dezenas de vezes na mesma fita, entre categorias.
`desenharMarcadorDeDestino` desenha um traço pontilhado mais grosso e uma
**faixa preta cheia com o nome da loja**, em caixa alta. Quem despacha
percorre metros de papel e precisa enxergar essa transição sem procurar;
misturar o pedido de uma loja com o da outra é um erro caro e silencioso.

Só o primeiro bloco de cada loja carrega o marcador — os seguintes são
categorias da mesma loja e continuam com a faixa de corte comum.

## Impressão na térmica do caixa (ago/2026)

A impressora é USB, ligada ao PC do caixa, e não tem rede. O celular não
consegue falar com ela direto: o **Safari do iPhone bloqueia** uma página
HTTPS de chamar um endereço `http://192.168.x.x` da rede local, sem
contorno confiável (o Chrome 142+ tem um prompt de permissão; o Safari não
tem equivalente). Depender disso seria construir algo que não funciona em
metade dos aparelhos.

O caminho é indireto:

```
Celular ──> fila no Firestore ──> agente no PC ──> impressora USB
```

### Por que a fila mora no Firestore

O plano original previa Upstash Redis, porque na época não havia backend.
Com o Firestore já no ar para as três lojas, a fila é só mais uma coleção
— **nenhum serviço novo para contratar, configurar ou manter**. É o efeito
colateral bom de ter feito as filiais antes da impressora.

### Por que conta de usuário, e não chave de serviço

O agente entra com `impressora@paodemel.local`. Uma chave de serviço do
Firebase **ignora as regras de segurança** e daria ao PC do caixa acesso
total ao banco das três lojas. Com conta comum, as regras limitam o agente
a ler a fila e alterar apenas `status`, `impressoEm` e `erro` — se aquele
PC for comprometido, o estrago fica contido nisso.

### Por que consulta periódica, e não escuta em tempo real

Escuta em tempo real exigiria a biblioteca oficial do Google e, com ela, a
chave de serviço. A consulta a cada 15s usa só a API REST com a conta
comum: **~5.760 leituras/dia contra 50.000 gratuitas** — folga de quase 9x
mesmo somando o uso normal do app.

### Um documento por imagem

O Firestore limita cada documento a 1 MiB e o base64 engorda a imagem em
~33%. Uma fita de 260KB vira ~350KB (cabe), mas uma fita dividida em três
partes estouraria se fosse tudo num documento. Separando, cada parte ainda
imprime e falha por conta própria. `base64DoDataUrl` recusa acima de 700KB
com mensagem clara — melhor que o Firestore recusar com erro genérico
depois que o operador achou que mandou imprimir.

### Trabalho que falha não é repetido

Um erro marca o documento como `erro` e o agente segue adiante. Repetir
automaticamente viraria laço infinito gastando papel e quota. O operador
reenvia pelo celular depois de resolver.

### O que não foi testado aqui

A impressão em si — Windows, driver e térmica — **não roda neste
ambiente**. O que foi verificado automaticamente: leitura da resposta do
Firestore, preparo da imagem (redimensionamento para 576 e 384 pontos,
conversão para tons de cinza, e transparência virando branco em vez de
mancha preta), e a validação de tamanho no app.

A primeira impressão real precisa de conferência no PC do caixa —
`agente-impressao/LEIA-ME.md` tem a tabela de erros comuns e o que cada um
significa.

## Fornadas e reposição (ago/2026)

Correção de modelo do dono do negócio, e das mais importantes até aqui:

> A matriz marca fornada o dia inteiro, e alguns produtos como pão francês
> e biscoito de queijo saem várias fornadas durante o dia.

Produto não é "produzido ou não" no dia. **Cada fornada é um evento com
hora própria.** Isso destrava a comunicação entre as lojas, que era o
objetivo: a filial fica sabendo que o item saiu do forno AGORA e pede
reposição enquanto ainda dá tempo de entregar hoje — informação que a
conferência do fim do expediente chega tarde demais para dar.

### Marcar é UM TOQUE, sem quantidade

`FornadaPronta` não tem quantidade de propósito. Um item que sai seis
vezes por dia viraria seis digitações e ninguém marcaria. O que a filial
precisa saber é que saiu e a que horas; quanto ela quer, ela mesma
informa no pedido de reposição.

### Painel próprio, não um botão na lista

Defeito encontrado em teste **antes da entrega**, e vale registrar porque
teria matado o recurso em silêncio: na primeira versão o botão ficava em
cada item da lista do Cronograma. Mas essa tela abre no **dia seguinte** —
ela existe para planejar. O padeiro teria que trocar a data para hoje toda
vez que uma fornada saísse, seis vezes ao dia só de pão francês.

`PainelFornoDeHoje.tsx` fica no topo, sempre sobre HOJE, independente da
data que o operador esteja planejando embaixo. Abriu o app, marcou,
fechou. O cabeçalho resume o progresso ("Forno de hoje · 2 de 3").

### O fechamento sai quase pronto

Marcando o dia todo, a confirmação do fim do expediente já vem
preenchida: item com fornada aparece como produzido, item sem nenhuma
aparece como "não saiu". O operador só confere.

Uma confirmação já feita à mão **vence** a pré-marcação — ele pode ter
corrigido algo que a marcação não pegou.

### Reposição é outra lista

| | Pedido diário | Reposição |
|---|---|---|
| Para quando | Amanhã | Hoje |
| Quantos por dia | Um, sobrescreve | Vários, cada um é um documento |
| Entra no planejamento | Sim | **Não** |

Misturar as duas esconderia a urgência: a matriz precisa ver que uma loja
está pedindo AGORA, não descobrir junto com o planejamento do dia
seguinte. `consolidarProducao` ignora reposição explicitamente — somá-la
faria produzir de novo amanhã algo que já foi entregue hoje. A verificação
`Caso 25` trava isso.

O id da reposição leva o instante do envio, porque a filial pode ficar sem
pão às 9h e sem biscoito às 15h — dois pedidos no mesmo dia, e o segundo
não pode apagar o primeiro.

### Avisos de fornada (push)

Cada fornada marcada dispara um aviso nos celulares das filiais, via
Firebase Cloud Messaging — gratuito e ilimitado, sem serviço novo.

**Aviso do mesmo produto SUBSTITUI o anterior.** Pão francês sai seis
vezes por dia; sem isso a filial receberia seis avisos empilhados do mesmo
item e aprenderia a ignorar todos — que é exatamente como uma notificação
perde a função. O `firebase-messaging-sw.js` usa a `tag` do produto para
que o novo aviso ocupe o lugar do velho, mostrando sempre "3ª fornada de
hoje" em vez de três balões.

**O envio roda no servidor** (`api/notificar-fornada.ts`), nunca no
navegador, por dois motivos que não são negociáveis:

1. Enviar pelo FCM exige uma **chave de serviço**, que ignora todas as
   regras do banco. No bundle do app, qualquer pessoa que abrisse o
   DevTools teria acesso total aos dados das três lojas.
2. O celular da matriz não conhece os tokens dos aparelhos das filiais.

Quem chama o endpoint precisa mandar o token de identidade do Firebase, e
o servidor **verifica de verdade** (assinatura e validade) que é a matriz.
Sem isso, um endereço público conseguiria disparar notificação para os
celulares da padaria inteira.

**Avisar é efeito, não a operação.** Se o push falhar — chave ausente,
servidor fora do ar, nenhuma filial ativou — a fornada já está gravada e
as filiais veem ao abrir o app. Falhar em vermelho faria o operador achar
que precisa marcar de novo.

**Token de aparelho morto é removido sozinho.** Celular que desinstalou o
app ou limpou os dados devolve `registration-token-not-registered`; o
documento é apagado no mesmo envio, para a lista não crescer com lixo.

#### O aviso corre nos dois sentidos (ago/2026)

| Quem marca | Quem é avisado | Conteúdo |
|---|---|---|
| Matriz marca fornada | Filiais | Nome do produto + "acabou de sair do forno" |
| Filial pede reposição | Matriz | "<Loja> pediu reposição" + produto e quantidade |

O remetente nunca recebe o próprio aviso, e **quem decide o destino é o
servidor**, a partir do e-mail verificado da conta — nunca um campo mandado
pelo app. Se a filial pudesse declarar "sou a matriz" no corpo da
requisição, qualquer conta dispararia aviso para todos os celulares.

Só REPOSIÇÃO avisa a matriz. O pedido diário é planejamento: a matriz o
consolida no fim do expediente e não precisa ser interrompida por ele.
Reposição é o contrário — existe porque o produto está faltando no balcão
AGORA, e um aviso que espera alguém lembrar de abrir a tela perdeu a razão
de existir.

Defeito que isso corrigiu: o convite para ativar os avisos vivia só na tela
da filial, então o computador da matriz nunca chegava a ser registrado. A
matriz não recebia nada e não havia como perceber por quê — a coleção
`dispositivos` simplesmente não tinha documento com `lojaId: "MATRIZ"`.

#### O balão inteiro é o botão — e o limite da web (ago/2026)

Tocar em qualquer ponto do cartão executa a ação. O alvo é o dedo de quem
está com farinha na mão às 6h; um cartão com cara de clicável que só
responde num pedaço é a pior combinação possível.

O que acontece ao tocar depende do estado, e um dos casos é uma parede da
plataforma:

| Estado do aparelho | O toque faz |
|---|---|
| Ainda não decidiu | Abre **direto** a caixa de permissão do navegador |
| Já negou antes | Abre o passo a passo das configurações daquele aparelho |
| iPhone sem o app instalado | Abre as instruções de instalação |

**Nenhuma API da web abre a tela de configurações do sistema** — nem no
Android, nem no iPhone, nem no desktop. Os sistemas fecham essa porta de
propósito, para uma página não conseguir jogar o usuário dentro dos
ajustes do aparelho. E, uma vez negada, a permissão nunca mais é
perguntada pelo navegador.

Então o cartão faz o máximo que sobra: detecta o aparelho
(`src/lib/plataforma.ts`) e mostra os toques exatos, na ordem, com os
nomes que aparecem na tela dele. "Libere nas configurações" é uma
instrução que ninguém completa; "toque e segure o ícone na tela inicial"
é. No computador ainda dá para copiar `chrome://settings/content/notifications`
para colar na barra de endereço — no celular não existe endereço
equivalente, e o app não promete um atalho que não tem.

Instalado e não instalado recebem caminhos DIFERENTES: quem instalou o app
no Android resolve nas configurações do Android, não nas do Chrome — e
mandar para a tela errada não resolve nada. Os casos de verificação
cobrem os cinco cenários e o iPad que se anuncia como Mac.

#### Restrições de aparelho que moldaram a tela

| Restrição | Consequência no desenho |
|---|---|
| No iPhone, push só funciona com o app **instalado na tela de início** (iOS 16.4+) | A tela detecta isso e explica o que fazer, em vez de pedir permissão e falhar em silêncio |
| A permissão exige um **toque** do usuário | É um botão "Ativar", não um pedido ao abrir o app — que criaria o reflexo de negar sem ler |
| Permissão negada **não se pergunta de novo** | O texto diz que a reversão é nas configurações do celular, o único caminho que resta |

#### Configuração (duas chaves, uma vez)

1. **Chave de push.** Console do Firebase → Configurações do projeto →
   **Cloud Messaging** → Certificados push da Web → **Gerar par de
   chaves**. Copie a chave e cole em `CHAVE_VAPID`, em
   `src/lib/notificacoes.ts`. É pública, como o resto da configuração.

2. **Chave de serviço.** Configurações do projeto → **Contas de serviço**
   → **Gerar nova chave privada** (baixa um JSON). No painel do Vercel →
   Settings → Environment Variables, crie `FIREBASE_SERVICE_ACCOUNT` com
   o JSON inteiro colado numa linha. **Esta é secreta de verdade** — não
   vai para o repositório nem para o bundle.

Enquanto a `CHAVE_VAPID` estiver vazia, o app não quebra: a tela da filial
mostra "avisos ainda não configurados" e as fornadas continuam aparecendo
ao abrir o app.

## Um card por loja no Cronograma (ago/2026)

Substituiu o quadro único "Quanto vai para cada loja". Cada loja é um
card; abre em sanfona por sessão; dentro da sessão, os itens com a
quantidade daquela loja.

```
Matriz              montando          400 un  ⌄
Arthur Bernardes    lista enviada     145 un  ⌃
   PÃES E ROSCAS
     PÃO FRANCÊS                      120 un
   BISCOITOS
     BISCOITO DE POLVILHO              25 un
Benjamin Constant   lista pendente         —  ⌄
```

Duas razões:

1. **Quem separa de manhã separa UMA loja de cada vez**, sessão por
   sessão. A tabela com uma coluna por loja obrigava a matriz a cruzar
   linha e coluna de cabeça.
2. **O status da lista mora dentro do card.** Antes era preciso decorar
   quem tinha enviado para saber se aquele número já estava completo.

Na filial o status é sobre a lista (enviada/pendente); na matriz, sobre o
cronograma que ela mesma monta (montando/confirmado).

## Tela branca ao entrar no Resumo — defeito e lição (ago/2026)

Clicar em "Ir para o Resumo" deixava o app **em branco**, exigindo fechar
e abrir. Erro no console: *"Rendered fewer hooks than expected."*

Causa: os `useMemo` do bloco consolidado tinham sido escritos **depois**
dos `if (fase === ...) return`. Ao entrar no Resumo o componente retornava
antes de executá-los, o React contava menos hooks que na renderização
anterior e derrubava a árvore inteira.

Foi introduzido por mim ao adicionar o consolidado, e passou por `tsc`
limpo, build limpo e 190 asserções — nenhum deles executa a tela. Só
apareceu clicando no botão.

Regra registrada no próprio arquivo, acima do primeiro hook: **hook novo
entra ANTES do primeiro return, sempre.**

## Lembretes automáticos por push (ago/2026)

`api/lembretes.ts`, disparado por agendador:

| Hora (São Paulo) | Para quem | Mensagem |
|---|---|---|
| 17:30 | Filiais **que ainda não enviaram** a lista de amanhã | "Falta a lista de amanhã" |
| 12:45 | Todas as filiais | "Precisa de reposição hoje?" |

O de 17:30 **consulta os pedidos antes de mandar** e avisa só quem está
devendo. Lembrete que chega para quem já cumpriu a tarefa ensina a
ignorar lembretes — e aí, no dia em que a loja realmente esquecer, o
aviso chega e ninguém lê. Se as duas já enviaram, ninguém recebe nada.

O de 12:45 é para todas: não cobra tarefa atrasada, abre uma janela.

Protegido por `CRON_SECRET`: o Vercel injeta o cabeçalho sozinho nos cron
jobs, e um agendador externo precisa mandá-lo à mão. Sem isso, um endereço
público dispararia push para os celulares da padaria a qualquer hora.

### Precisão de horário depende do plano do Vercel

No plano **Hobby** a precisão é **por hora (±59 min)**: um cron marcado
para 17:30 dispara em algum momento entre 17:00 e 17:59. O plano **Pro**
tem precisão por minuto. Para horário exato sem pagar Pro, um agendador
externo (cron-job.org, GitHub Actions) chama a mesma URL com o
`CRON_SECRET` no cabeçalho.

## O balão do título carrega o estado (ago/2026)

No Cronograma da matriz eram três blocos empilhados dizendo coisas sobre
o mesmo dia: a data num balão, "Rascunho salvo — carregado abaixo" em
outro, e os cartões de "enviou / não enviou" das filiais num terceiro.
Três caixas para uma frase só — *a produção de quinta está assim* — e a
lista de produtos começando lá embaixo.

Agora é um balão só, e ele é o botão que abre a sanfona do planejamento:

```
📅  Produção de Quinta-feira, 27/08/2026              ⌄
    Rascunho salvo    falta Benjamin Constant
```

Verde quando não falta nada, âmbar quando falta. O nome da filial aparece
quando é **uma** só; com duas faltando o número basta e o nome apenas
alongaria a linha.

A sanfona nasce fechada. Na maior parte do dia quem abre a aba só quer
saber se a produção de amanhã já está montada — e essa resposta agora
está no próprio balão. Quem vai montar toca uma vez e entra.

### Cada assunto na sua aba (ago/2026)

| Onde | O que mora ali |
|---|---|
| **Nova fornada** | Marcar fornada · **reposições das filiais** · pedir reposição (filial) |
| **Cronograma** | Planejar amanhã · confirmar o que saiu hoje · quanto vai para cada loja |

As reposições saíram do Cronograma. Elas são de HOJE, feitas enquanto o
forno trabalha; o Cronograma é sobre AMANHÃ. Misturar as duas escalas de
tempo na mesma tela foi o que gerou o ruído que a matriz reclamou.

### "Quanto vai para cada loja" no Cronograma

A conta que o padeiro executa — o que a matriz está montando agora somado
aos pedidos que as filiais já enviaram — só existia depois de "Ir para o
Resumo". Conferir se o pedido da filial entrou obrigava a sair do meio da
montagem e voltar, e quem monta confere isso várias vezes enquanto digita.

Agora é uma sanfona fechada no topo, com o total do dia no cabeçalho:

```
Quanto vai para cada loja              649 un   ⌄

  PÃES E ROSCAS
  PÃO FRANCÊS                          510 un
  Matriz 300 · Arthur 120 · Benjamin 90
```

**Uma linha por produto, e não uma coluna por loja.** A tabela larga foi
construída primeiro e reprovada no teste em 390px: com três lojas, a
coluna TOTAL saía fora da tela e só aparecia rolando de lado. Esconder o
total num quadro que existe para mostrar o total é o oposto do objetivo.

Loja com zero não aparece na repartição — o quadro é sobre para onde a
mercadoria vai, e listar quem não recebe nada é ruído.

### Reposições agrupadas por filial (ago/2026)

Continuam fora do balão, mas deixaram de ser uma lista corrida. Cada
filial virou uma sanfona fechada, com o cabeçalho dizendo o que importa:

```
Reposições pedidas hoje
  Arthur Bernardes      2 esperando    ⌄
  Benjamin Constant     2 respondidas  ⌄
```

Âmbar quando há pedido sem resposta, verde quando está tudo respondido.

Duas razões, e a segunda é a que pesa:

1. **Espaço.** Com as duas lojas pedindo ao longo do dia, a lista corrida
   virava a maior coisa da tela do Cronograma — e a matriz vem aqui para
   PLANEJAR, não para ler pedido por pedido.
2. **Quem separa a mercadoria separa por loja.** Uma lista misturada
   obrigava a matriz a fazer esse agrupamento de cabeça toda vez que
   olhava.

Fechadas por padrão: o número no cabeçalho é a única informação
necessária para decidir se vale abrir. Dentro do grupo, a linha não
repete o nome da loja — o cabeçalho já diz de quem é, e repetir em toda
linha era metade do ruído.

### O que NÃO entrou no balão

As reposições continuam como painel próprio, visíveis sem nenhum toque.
Elas não são "estado do planejamento de amanhã": são pedido urgente de
hoje esperando resposta, e escondê-las atrás de um toque atrasaria
justamente o que não pode esperar.

### Um defeito encontrado no caminho

O cálculo de "quais filiais já enviaram" não filtrava por tipo de pedido.
Uma REPOSIÇÃO tem a mesma data e o mesmo status `enviado` do pedido
diário, então uma filial que pediu reposição aparecia como se já tivesse
mandado o pedido do dia — e a matriz confirmaria a produção achando que
estava completa, sem a quantidade daquela loja. Corrigido com
`ehPedidoDiario` no filtro.

## "Nova fornada" é uma aba (ago/2026)

Era um painel dentro de outra tela — no Cronograma da matriz e na tela de
Pedido da filial. Nos dois casos, dois assuntos disputavam a mesma tela: a
lista de amanhã e o forno de hoje. Virou aba própria:

| Perfil | Ordem das abas |
|---|---|
| Matriz | Cronograma · **Nova fornada** · Produtos · Perdas · Análises |
| Filial | **Nova fornada** · Pedido · Perdas |

Na filial vem antes de Pedido porque é o que é perecível: dá para agir
sobre a fornada ainda hoje, enquanto o pedido é para amanhã.

O contador de não vistos saiu de dentro do painel e foi para o **nome do
botão da aba**, como pastilha sólida. É o ponto do recurso: avisar que há
novidade sem nada precisar estar aberto na tela. Ele pulsa duas vezes ao
aparecer e para — chamar atenção uma vez é aviso; piscar para sempre faz
o operador desviar o olhar da tela inteira (e a animação respeita
`prefers-reduced-motion`). Na aba ativa a pastilha inverte as cores, senão
sumiria dentro do próprio botão.

Como a aba passou a ser a divisão, a sanfona interna dos dois painéis foi
removida — era uma segunda porta para o mesmo cômodo — e o título interno
também: repetir "Nova fornada" logo abaixo de uma aba chamada "Nova
fornada" é a definição de ruído. Na matriz, o que sobrou de útil no lugar
do título é o progresso do dia ("3 de 12 itens já saíram hoje").

### Estado do pedido junto do título

Na tela de Pedido da filial, "Pedido enviado · 12 produtos" era um cartão
próprio abaixo do bloco da data. Solto, virava um segundo balão
competindo por atenção e empurrando a lista para baixo. Agora mora dentro
do mesmo bloco: "Pedido para quinta-feira, 27/08/2026" com o estado logo
abaixo, verde quando enviado e âmbar quando não — uma frase só, que é como
a informação existe na cabeça de quem opera.

## Tempo real, foguinho e resposta à reposição (ago/2026)

Três mudanças que vieram do uso real, no mesmo dia.

### Os dados chegam sozinhos

`pedidos` e `fornadas` passaram a usar `onSnapshot` (ver `observarPedidos`
e `observarFornadas` em `src/data/repositorio.ts`). Antes tudo era
`getDocs` na abertura, e a matriz só via a reposição depois de recarregar
a página — num pedido que existe justamente porque é urgente. Carga única
tratava dado vivo como se fosse estático.

Só essas duas coleções. Catálogo, cronograma e perdas mudam por ação de
quem está com a tela na mão; escutar tudo custaria leitura sem mudar nada.

### O aviso aparece com o app aberto

Com a página em foco o service worker não é acionado, então o FCM entrega
via `onMessage` — e o app só mostrava uma faixa interna. No PC do caixa a
janela está atrás do PDV: faixa interna ali não existe. Agora o
`onMessage` também chama `registration.showNotification`, que põe o aviso
na bandeja do sistema. E a escuta passou a valer para TODAS as lojas: era
restrita a filiais, então a matriz — que desde a via de mão dupla é quem
recebe a reposição — não escutava nada.

### Foguinho com contador de não vistos

O painel de fornadas nasce FECHADO, atrás de um ícone de chama, nos dois
perfis. O número ao lado conta o que chegou **desde a última abertura**,
não o total do dia: um contador que nunca zera marca 20 às 10h e continua
20 para sempre, e aí ignorá-lo passa a ser a reação correta. A marca fica
no aparelho (`src/lib/fornadasVistas.ts`), por loja e por dia — o celular
de um turno não zera o contador do outro.

Guarda o INSTANTE da última fornada vista, não a contagem: contagem
quebraria se uma marcação fosse desfeita.

### A matriz responde a cada reposição

Confirmar ou cancelar, item por item. Cancelar **exige motivo**, e a regra
vive em `decidirReposicao` (`src/types/pedido.ts`), não só no botão
desabilitado — mais as regras do Firestore, que recusam um cancelamento
sem `motivo` e limitam a matriz a tocar apenas em `atendimento`. A
quantidade que a filial pediu continua sendo a que ela mandou, mesmo
depois de atendida.

O motivo vai no corpo do push e na linha do produto na tela da filial:
quem está sem o item no balcão precisa decidir o que fazer AGORA, e é o
motivo que muda a decisão — esperar a próxima fornada é uma coisa, acabou
a matéria-prima é outra.

## Perdas do dia: duas leituras (ago/2026)

O histórico logo abaixo do lançamento ganhou um alternador:

| Modo | Responde |
|---|---|
| **Por lançamento** (padrão) | O que foi lançado, na ordem em que aconteceu — é onde se anula um erro de digitação |
| **Mais perdidos** | Somado por produto, do maior para o menor |

O segundo existe porque quinze lançamentos de 2 kg do mesmo pão somam
mais que um lançamento único de 8 kg, e na lista cronológica isso fica
invisível. A pergunta do fim do expediente — *o que está saindo caro
hoje* — não tinha resposta na tela.

**Lançamento anulado fica de fora da soma.** Um registro anulado não é
perda, é erro de digitação corrigido: somá-lo poria no topo da lista
exatamente o número que a matriz acabou de invalidar. Nos testes, um
lançamento anulado de 900 un é ignorado, e o topo fica com o produto de
62 un espalhado em quatro lançamentos.

A contagem de lançamentos aparece embaixo do nome, na mesma célula, e não
numa quarta coluna: com ela a tabela passava de 390px e obrigava a rolar
de lado para ver o peso. E é ela que explica o total.

### Um defeito que apareceu no caminho

`.tabela-scroll .tabela-simples { min-width: 420px }` era global. A tabela
de 3 colunas cabia em 350px e mesmo assim rolava de lado — rolagem que
não resolve nada é só um jeito de esconder coluna. Criada a exceção
`.tabela-compacta` para tabelas de poucas colunas.

E o subtítulo da tela mostrava a data crua (`2026-08-27`) em vez de
`27/08/2026`; passou a usar o mesmo formatador do resto do app.

## Busca sem acento (ago/2026)

A busca de produtos existia nas telas de Perdas e de Catálogo, mas exigia
acento: **"pao" não achava "PÃO FRANCÊS"** e "fuba" não achava "BOLO DE
FUBÁ". A tela respondia "nenhum produto encontrado" para um produto que
estava lá — e o operador conclui, com razão, que o recurso não funciona.

Ninguém digita acento procurando às pressas. No teclado do celular o "ã"
exige segurar a tecla e escolher numa listinha, com a mão ocupada, no meio
do expediente. Exigir isso na busca é o mesmo que não ter busca.

`src/lib/texto.ts` normaliza os dois lados com `normalize("NFD")` — separa
a letra do acento e descarta o acento. Sem tabela de substituição para
manter: vale para ç, ü, â e o que mais aparecer.

Vale nos dois sentidos: quem digita **com** acento também encontra
cadastro escrito **sem**.

## Painel de análises (ago/2026)

A pergunta que o painel existe para responder: **existe padrão de perda por
dia da semana ou por semana do mês?** Se terça desperdiça o dobro de sexta,
o cronograma de terça está errado — e isso é dinheiro que dá para parar de
jogar fora sem cortar nada da operação.

### Um filtro só, no topo, valendo para tudo

Período (7/30/90 dias), loja e categoria são aplicados **uma vez** em
`recortar()` (`src/lib/analises.ts`), e o mesmo recorte alimenta os números,
os três gráficos **e** o resumo mandado para a IA. Se cada bloco filtrasse
por conta própria, a IA acabaria comentando dados que não estão na tela — e
o operador não teria como saber qual dos dois estava errado.

### O filtro de loja recorta as perdas, nunca os planos

Produção é sempre da matriz; não existe plano de filial. Filtrar a produção
por uma filial devolveria vazio, o denominador da taxa iria a zero e a
resposta viraria "—" justamente para quem quer ver o número. Por isso a loja
recorta só as **perdas** e o denominador segue sendo a produção da matriz.
Registro de perda anterior às filiais (sem `lojaId`) é lido como matriz.

### Percentual, não volume

Os três gráficos comparam **taxa**. Sábado produz muito mais que segunda:
em volume absoluto, sábado seria sempre o pior dia sem que isso significasse
desperdício pior. Nos casos de verificação isso está fixado explicitamente —
segunda com 20% e sábado com 5%, sendo sábado o maior em unidades perdidas.

### Quando a resposta certa é "não sei"

`taxaPerda` é `null`, e não `0`, quando não houve produção no recorte: 0%
afirmaria que não se desperdiça naquele dia, quando o que houve foi ausência
de dado. Na tela isso vira "—" e uma barra vazia. Pela mesma razão, o ranking
de produtos exige **20 unidades produzidas** no período — 1 perdida de 3
produzidas dá 33%, e isso é ruído, não padrão — e produto com perda mas sem
produção registrada no recorte fica fora (senão viraria uma barra de taxa
infinita).

### Gráficos em HTML/CSS, sem biblioteca

O pacote já carrega o Firebase e o app roda em celular com internet ruim;
uma biblioteca de gráficos custaria mais que toda a tela para desenhar
retângulos. Em HTML as barras já são responsivas, o texto quebra sozinho e o
leitor de tela lê o conteúdo. Barra **deitada** porque "Segunda-feira" e
"PÃO DE QUEIJO CONGELADO" não cabem embaixo de uma coluna em tela de celular,
e o rótulo vai em até duas linhas em vez de ser cortado — o catálogo tem
itens que começam igual, e "PÃO DE QUEIJ…" deixaria de dizer de quem é a
barra.

O valor vai escrito em **todas** as barras, contra a recomendação usual de
deixar o resto no tooltip: aquela recomendação pressupõe mouse. Aqui é dedo
em tela, e número que só aparece no hover simplesmente não existe para este
operador. Uma série por gráfico, então nenhuma legenda (o título já diz o
que é) e uma cor só — colorir cada barra por tamanho codificaria duas vezes
a mesma informação que o comprimento já dá. A escala vai até o maior valor,
não até 100%: taxas vivem entre 2% e 15%, e uma escala fixa em 100 deixaria
todas as barras rentes a zero, escondendo exatamente a diferença que
interessa. Percentual sempre em formato brasileiro, com uma casa decimal —
duas casas numa taxa de perda são precisão falsa e deixam a coluna de
números irregular.

### O que a IA recebe a mais

Junto do resumo por produto vão os padrões por dia da semana e por semana do
mês, a taxa geral e a janela em dias. Sem isso a IA só consegue falar de item
isolado, e a pergunta do dono do negócio é sobre padrão: qual dia está fora
da curva, de quantos pontos percentuais é a diferença contra a média dos
outros dias, e qual ajuste de cronograma fazer.

## Estrutura

```
producao-perdas/
  agente-impressao/               # Programa que roda no PC do caixa e imprime na térmica
    agente.py                      # Busca a fila, prepara a imagem e imprime (ESC/POS via driver do Windows)
    LEIA-ME.md                      # Instalação passo a passo e tabela de erros
    config.exemplo.ini               # Modelo de configuração (o config.ini real fica fora do Git)
    instalar.bat / iniciar.bat        # Atalhos de dois cliques para quem não usa terminal
    _encontrar-python.bat              # Acha o Python (py ou python) e avisa quando não existe
    instalar-servico.bat               # Instala como tarefa de sistema: sobe no boot, sem janela, reinicia sozinho
    desinstalar-servico.bat            # Desfaz o acima
    estado-do-agente.bat               # Responde "está rodando?" agora que não há janela
    listar-impressoras.bat / .py       # Mostra o nome exato da impressora para o config.ini
  firestore.rules                 # REGRAS DE ACESSO — a única coisa que protege os dados
  firebase.json                   # Aponta onde ficam as regras (uso opcional pela CLI)
  api/
    sugestao-producao.ts       # Função serverless — sugestão de quantidades de produção
    insights-catalogo.ts        # Função serverless — insights de catálogo (sobra, produto parado, etc.)
    notificar-fornada.ts         # Função serverless — avisa as filiais que a fornada saiu (FCM)
    lembretes.ts                  # Função serverless — lembretes diários de lista (17:30) e reposição (12:45)
  src/
    types/
      produto.ts                # Modelo de Produto
      pedido.ts                  # Pedido de filial (um por loja por dia)
      impressao.ts                # Trabalho na fila de impressão do caixa
      fornada.ts                   # Fornada pronta — evento com hora, várias por dia
      producao.ts                 # Sessão de Produção (por categoria), Plano Diário — quantidade em unidades
      perda.ts                     # Registro de Perda — peso em kg + peso unitário informado + unidades estimadas
    lib/
      errosFirestore.ts              # Traduz falha de gravação para linguagem de padaria
      notificacoes.ts                 # Avisos de fornada no celular (permissão, token, estados)
      plataforma.ts                    # Qual aparelho é, e os passos exatos para liberar a notificação nele
      avisarFiliais.ts                 # Cliente do endpoint que dispara o aviso
      consolidacao.ts                # Junta produção da matriz + pedidos das filiais (totais e romaneios)
      lojas.ts                      # As 3 lojas (matriz + 2 filiais) e o mapeamento conta -> loja
      firebase.ts                    # Inicialização do Firestore (com cache offline) e do Auth
      categorias.ts                 # As 5 categorias fixas de produção + "Encomendas e Especiais" + validade sugerida por categoria
      conversao.ts                   # Deriva unidades perdidas a partir do peso pesado na balança
      numeros.ts                      # Sanitização de entrada numérica (textbox à prova de erro)
      texto.ts                         # Busca sem acento — "pao" acha "PÃO FRANCÊS"
      metricas.ts                      # Taxa de perda, volume por dia, picos de perda (tudo em unidades)
      data.ts                           # Datas: hoje, amanhã, dia da semana, formatação BR, diferença em dias
      janelaValidade.ts                  # Quais fornadas confirmadas ainda estão dentro do prazo de validade do produto
      producaoRealizada.ts                # Separa o que foi planejado do que realmente saiu do forno
      gerarImagemLista.ts                # Gera a(s) fita(s) PNG de impressão (canvas, 576px, linhas de corte, assinatura por sessão) — divide em mais de uma imagem se passar do limite seguro de altura
      sugestaoProducao.ts                 # Cliente da sugestão de produção por IA — monta histórico, chama /api
      insightsCatalogo.ts                  # Cliente dos insights de catálogo por IA — monta resumo + padrões, chama /api
      analises.ts                           # Agregações do painel: recorte único (período/loja/categoria), taxa por dia, por semana do mês, ranking de produtos
      importarProdutos.ts                  # Mapeamento planilha -> Produto (uso no navegador), já filtra fora de escopo
    components/
      Icones.tsx               # Ícones SVG inline (só traço, currentColor) — sem CDN
      ConfirmarComSenha.tsx     # Revalida a senha da loja antes de ação irreversível
      AtivarAvisos.tsx         # Liga os avisos neste aparelho, com texto por estado
      AvisoGlobal.tsx          # Faixa de retorno de gravação (sucesso/erro), acionada só pelo App
      TelaPedidoFilial.tsx     # Tela principal da filial: quanto ela vai precisar amanhã
      PainelPedidosFiliais.tsx  # Indicador "enviado / aguardando" + reposições chegando
      PainelFornoDeHoje.tsx      # Marcação de fornada pronta (matriz), sempre sobre HOJE
      PainelFornadasFilial.tsx    # O que saiu do forno hoje + pedido de reposição (filial)
      TelaLogin.tsx            # Entrada por LOJA (não por funcionário) — escolhe a loja e digita a senha
      ImportarDadosLocais.tsx   # Migração única de localStorage para a nuvem
      BannerInstalar.tsx       # Convite para instalar o app (botão no Chrome/Android, instruções no iPhone)
      AvisoPerdaPendente.tsx    # Atalho "Lançar perda agora" enquanto houver fornada de hoje sem perda lançada
      ConfirmarProducao.tsx      # Fim do expediente: confirma o que realmente saiu do forno
      TelaCronograma.tsx       # Montagem do cronograma: acordeão -> resumo -> exportar (+ sugestão IA)
      TelaCadastroProdutos.tsx  # Catálogo (com edição inline), categorização, validade, peso médio, limpeza de escopo
      TelaPerdas.tsx             # Lançamento de perda de fim de expediente (considera a janela de validade)
      TelaRegistroPerda.tsx       # Peso perdido (kg) + peso unitário informado + fornada de origem, com preview ao vivo
      GraficoBarras.tsx             # Barras horizontais em HTML/CSS (sem biblioteca), valor escrito em toda barra, toque mostra o detalhe
      TelaAnalises.tsx              # Painel: filtro único no topo, 4 números-cabeçalho, 3 gráficos + insights por IA
      ExportarFita.tsx             # Preview + Compartilhar/Baixar da(s) fita(s) de impressão (botão manual por imagem quando divide em mais de uma)
  scripts/
    importar_produtos.py         # Import em lote (rodado contra Produtos_881.xlsx), já filtra fora de escopo
    gerar_icones.py               # Gera todos os ícones e a marca da tela de login a partir de assets/
    verificar_logica.ts           # Verificações de conversão/agregação/janela de validade/resumo de insights
  data/
    produtos.seed.json            # 89 produtos das 5 categorias de produção, já convertidos para o schema do app
  public/
    firebase-messaging-sw.js      # Service worker que recebe o aviso com o app fechado
    logo-pao-de-mel.png           # Marca reduzida para a tela de entrada (gerada pelo script)
    badge-96x96.png               # Silhueta monocromática da barra de status do Android
    pwa-192x192.png               # Ícones do app instalado (gerados por scripts/gerar_icones.py)
    pwa-512x512.png
    pwa-maskable-512x512.png      # Variante maskable exigida pelo Android
    apple-touch-icon.png          # Única via de ícone no iPhone (iOS ignora o manifest)
    favicon-32x32.png
  vite.config.ts                  # React + configuração do PWA (manifest, service worker, autoUpdate)
  tsconfig.json
```

## Verificação

```
npm run verificar   # 169 asserções de lógica + carga das funções de /api no runtime do Vercel
npx tsc --noEmit     # typecheck estrito, sem gerar arquivos
npm run build        # build de produção completo
```

Rodar os três antes de qualquer entrega — nenhuma alteração deve ser
considerada pronta sem `TODOS OS CASOS PASSARAM` + build limpo. O fluxo
completo (Cronograma → Resumo → Confirmar → fita de impressão → Perdas →
Cadastro) também foi validado ponta a ponta com Playwright antes de cada
entrega.

Para reimportar a planilha (ou uma versão atualizada dela):
```
pip install openpyxl
python3 scripts/importar_produtos.py caminho/planilha.xlsx data/produtos.seed.json
```

### As funções de /api precisam carregar como CommonJS

`npm run verificar` termina rodando `scripts/verificar_carga_api.cjs` com
`--no-experimental-require-module`. Isso existe por causa de um defeito real
que tirou os avisos do ar (ago/2026):

`api/notificar-fornada.ts` importava `firebase-admin/auth`, que carrega
`jwks-rsa`, que faz `require('jose')` — e o `jose` virou pacote só-ESM. O
runtime do Vercel não faz `require()` de ESM, então a função morria com
`ERR_REQUIRE_ESM` **antes de executar uma linha**, devolvendo um 500 sem
corpo JSON. Na tela isso aparecia como "HTTP 500" pelado, indistinguível de
chave de serviço errada — e mandou a investigação para o lado errado
(regras do Firestore, chave VAPID, token do aparelho) por horas.

O Node local não reproduzia o problema: da versão 22.12 em diante ele aceita
`require()` de ESM. A flag desliga essa tolerância e faz a máquina de
desenvolvimento se comportar como o servidor. Sem isso, `tsc` limpo e build
limpo continuavam dizendo que estava tudo bem.

A correção foi trocar `verifyIdToken` pelo endpoint REST do Identity
Toolkit (`accounts:lookup`): a verificação continua sendo do Google e do
lado do servidor — token adulterado, expirado ou de outro projeto é
recusado —, mas sem arrastar `jwks-rsa` junto. Firestore e Messaging do
`firebase-admin` carregam sem problema e seguem em uso.

## Atualizar o app publicado

O deploy é automático a cada push na branch `main`:

```
git add -A
git commit -m "descrição da mudança"
git push
```

O Vercel detecta o push, builda e publica em `https://padaria-producao-perdas.vercel.app`
em cerca de 1 minuto — sem passo manual adicional.

## Camada de dados — histórico

O código em `src/lib` e `src/types` é agnóstico de backend, e essa disciplina
se pagou: a virada de `localStorage` para Firestore não exigiu mudança em
nenhuma tela, só a troca de qual `Repositorio` é instanciado em
`src/App.tsx`. `src/data/repositorioLocalStorage.ts` continua no projeto
como referência e como origem da migração.

## Convenções

- Nomenclatura de arquivos/identificadores: apenas caracteres
  alfanuméricos, `_` e `-` — sem espaços ou acentuação em nomes de
  arquivo/variável (o conteúdo em português dos dados, esse sim, mantém
  acentuação normalmente).
- Todo módulo de lógica de negócio (`src/lib`) é puro (sem I/O) e lança
  erros de domínio explícitos (`ErroConversaoPerda`, `ErroSugestaoProducao`)
  em vez de falhar silenciosamente.
- Segredos (chave de API) nunca entram no bundle do front-end — só em
  variáveis de ambiente do servidor, consumidas por funções em `/api`.
