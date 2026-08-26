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
| Produção realizada | No fim do expediente, na tela de **Cronograma**, confirma-se o que REALMENTE saiu do forno — comparando com o total PEDIDO (matriz + filiais), que é o que revela o gargalo. Marcação binária ("não saiu"), porque é assim que acontece na prática — não sai em quantidade menor. O plano nunca é reescrito |
| Abas por perfil | A filial vê **Pedido e Perdas**. Catálogo, Cronograma e Análises são da matriz — as regras do Firestore já negariam gravação da filial neles, e mostrar as abas só ofereceria caminhos que terminam em "sem permissão". |
| Escopo das perdas | A filial vê e lança só as perdas dela, sobre **qualquer produto ativo** — ela recebe da matriz, tem estoque de dias diferentes no balcão e não produz. A matriz vê as três lojas, com a origem em cada linha, e continua atribuindo a perda a uma fornada |
| Cadastro de produto | Três campos: nome, categoria (obrigatória) e peso médio (opcional). Unidade é sempre "un" e o prazo vem da categoria — ambos editáveis depois, na linha do Catálogo |
| Anular perda | Lançamento errado (1000 em vez de 10) é **anulado pela matriz, nunca apagado** — o registro fica no histórico marcado, com quem anulou e por quê, e sai de todos os cálculos |
| Excluir produto | Exige a **senha da loja** (revalidada no Firebase), não só um segundo clique — apaga catálogo compartilhado pelas três lojas |
| Quem pode receber perda | Qualquer produto que já tenha sido produzido em **alguma** ocasião. Produto nunca produzido não entra (não existe fornada da qual pudesse ter vindo) |
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
verificado: tipagem estrita, build, as 59 asserções de lógica de negócio e o
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

## Estrutura

```
producao-perdas/
  firestore.rules                 # REGRAS DE ACESSO — a única coisa que protege os dados
  firebase.json                   # Aponta onde ficam as regras (uso opcional pela CLI)
  api/
    sugestao-producao.ts       # Função serverless — sugestão de quantidades de produção
    insights-catalogo.ts        # Função serverless — insights de catálogo (sobra, produto parado, etc.)
  src/
    types/
      produto.ts                # Modelo de Produto
      pedido.ts                  # Pedido de filial (um por loja por dia)
      producao.ts                 # Sessão de Produção (por categoria), Plano Diário — quantidade em unidades
      perda.ts                     # Registro de Perda — peso em kg + peso unitário informado + unidades estimadas
    lib/
      errosFirestore.ts              # Traduz falha de gravação para linguagem de padaria
      consolidacao.ts                # Junta produção da matriz + pedidos das filiais (totais e romaneios)
      lojas.ts                      # As 3 lojas (matriz + 2 filiais) e o mapeamento conta -> loja
      firebase.ts                    # Inicialização do Firestore (com cache offline) e do Auth
      categorias.ts                 # As 5 categorias fixas de produção + "Encomendas e Especiais" + validade sugerida por categoria
      conversao.ts                   # Deriva unidades perdidas a partir do peso pesado na balança
      numeros.ts                      # Sanitização de entrada numérica (textbox à prova de erro)
      metricas.ts                      # Taxa de perda, volume por dia, picos de perda (tudo em unidades)
      data.ts                           # Datas: hoje, amanhã, dia da semana, formatação BR, diferença em dias
      janelaValidade.ts                  # Quais fornadas confirmadas ainda estão dentro do prazo de validade do produto
      producaoRealizada.ts                # Separa o que foi planejado do que realmente saiu do forno
      gerarImagemLista.ts                # Gera a(s) fita(s) PNG de impressão (canvas, 576px, linhas de corte, assinatura por sessão) — divide em mais de uma imagem se passar do limite seguro de altura
      sugestaoProducao.ts                 # Cliente da sugestão de produção por IA — monta histórico, chama /api
      insightsCatalogo.ts                  # Cliente dos insights de catálogo por IA — monta resumo, chama /api
      importarProdutos.ts                  # Mapeamento planilha -> Produto (uso no navegador), já filtra fora de escopo
    components/
      Icones.tsx               # Ícones SVG inline (só traço, currentColor) — sem CDN
      ConfirmarComSenha.tsx     # Revalida a senha da loja antes de ação irreversível
      AvisoGlobal.tsx          # Faixa de retorno de gravação (sucesso/erro), acionada só pelo App
      TelaPedidoFilial.tsx     # Tela principal da filial: quanto ela vai precisar amanhã
      PainelPedidosFiliais.tsx  # Indicador "enviado / aguardando" no topo do Cronograma
      TelaLogin.tsx            # Entrada por LOJA (não por funcionário) — escolhe a loja e digita a senha
      ImportarDadosLocais.tsx   # Migração única de localStorage para a nuvem
      BannerInstalar.tsx       # Convite para instalar o app (botão no Chrome/Android, instruções no iPhone)
      AvisoPerdaPendente.tsx    # Atalho "Lançar perda agora" enquanto houver fornada de hoje sem perda lançada
      ConfirmarProducao.tsx      # Fim do expediente: confirma o que realmente saiu do forno
      TelaCronograma.tsx       # Montagem do cronograma: acordeão -> resumo -> exportar (+ sugestão IA)
      TelaCadastroProdutos.tsx  # Catálogo (com edição inline), categorização, validade, peso médio, limpeza de escopo
      TelaPerdas.tsx             # Lançamento de perda de fim de expediente (considera a janela de validade)
      TelaRegistroPerda.tsx       # Peso perdido (kg) + peso unitário informado + fornada de origem, com preview ao vivo
      TelaAnalises.tsx              # Taxa de perda, volume por dia, picos de perda + insights de catálogo por IA
      ExportarFita.tsx             # Preview + Compartilhar/Baixar da(s) fita(s) de impressão (botão manual por imagem quando divide em mais de uma)
  scripts/
    importar_produtos.py         # Import em lote (rodado contra Produtos_881.xlsx), já filtra fora de escopo
    verificar_logica.ts           # Verificações de conversão/agregação/janela de validade/resumo de insights
  data/
    produtos.seed.json            # 89 produtos das 5 categorias de produção, já convertidos para o schema do app
  public/
    pwa-192x192.png               # Ícones do app instalado (gerados por script — ver "Instalar como app")
    pwa-512x512.png
    pwa-maskable-512x512.png      # Variante maskable exigida pelo Android
    apple-touch-icon.png          # Única via de ícone no iPhone (iOS ignora o manifest)
    favicon-32x32.png
  vite.config.ts                  # React + configuração do PWA (manifest, service worker, autoUpdate)
  tsconfig.json
```

## Verificação

```
npm run verificar   # roda scripts/verificar_logica.ts (99 asserções)
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
