# Produção & Perdas — Padaria Pão de Mel

Módulo standalone para Cronograma de Produção Diária e Registro de Perdas.
Não substitui o Sistema de Gestão (Excel VBA + Access) em construção — ver
seção "Relação com o Sistema de Gestão" no documento de arquitetura.

Documento completo de arquitetura (stack, modelo de dados, fluxo de telas,
roadmap): ver `arquitetura.html` ou o link do Artifact enviado na conversa
(desatualizado em relação às decisões abaixo — este README é a referência
corrente).

## Status: app em produção (MVP local)

**Publicado em:** https://padaria-producao-perdas.vercel.app
Deploy automático a cada `git push` na branch `main` (GitHub → Vercel).

As 4 telas (Cronograma, Cadastro de Produtos, Perdas, Análises) estão
implementadas, tipadas em modo `strict` e com build de produção limpo
(`tsc --noEmit` + `vite build`). Persistência hoje é `localStorage`
(um dispositivo só) — ver "Camada de dados" abaixo para o que muda ao
plugar um backend real.

## Decisões operacionais

Estas regras vieram de revisão direta com a padaria e substituem o desenho
inicial do documento de arquitetura:

| Decisão | Regra |
|---|---|
| Categorias de produção | Fixas: Pães e Roscas, Biscoitos, Bolos, Salgados, Confeitaria, + "Encomendas e Especiais" (busca livre no catálogo) |
| Quando o cronograma é montado | Sempre no fim do expediente do dia anterior, para o dia seguinte (`dataDeAmanhaIso()`) |
| Unidade de produção | **Sempre unidades** — os ~89 produtos das 5 categorias já são vendidos por unidade no PDV, formato nativo da operação |
| Unidade de perda | **Sempre pesada em quilos** (balança) — o operador também informa o peso de 1 unidade daquela fornada, e o app deriva quantas unidades a perda representa |
| Peso unitário do produto | Sugerido automaticamente a partir do último lançamento de perda daquele produto — cadastro se autoatualiza, sem passo manual |
| Impressão | UMA fita PNG com todas as sessões confirmadas, separadas por linha de corte (pontilhado + tesoura) — corta-se fisicamente após imprimir, um pedaço por quadro de aviso de cada setor |
| Sugestão de produção | Botão "✨ Sugerir com IA" por categoria (Gemini) — sempre assistido: pré-preenche quantidades vazias com base no histórico, operador revisa/ajusta antes de confirmar |
| Escopo do catálogo | Só as 5 categorias de produção — o catálogo importado do PDV tem ~19 categorias, a maioria revenda (mercearia, refrigerante, laticínio...), fora do escopo deste app (ago/2026: limpeza feita em Cadastro de Produtos → aba "Fora de escopo") |
| Prazo de validade | Por produto (`Produto.prazoValidadeDias`, editável, sugerido por categoria) — uma perda lançada hoje nem sempre vem da produção de ontem (a etiqueta não traz data de fabricação isolada), então a tela de Perdas considera qualquer fornada confirmada ainda dentro do prazo do produto, não só a de hoje |

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
  prazo de validade — essas são as candidatas a lançamento de perda
  naquele dia. Produto sem `prazoValidadeDias` cadastrado cai no
  comportamento anterior (só o plano do próprio dia), nunca inventa um
  prazo que ninguém confirmou.
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

## Estrutura

```
producao-perdas/
  api/
    sugestao-producao.ts       # Função serverless — única ponta que fala com o Gemini
  src/
    types/
      produto.ts                # Modelo de Produto
      producao.ts                 # Sessão de Produção (por categoria), Plano Diário — quantidade em unidades
      perda.ts                     # Registro de Perda — peso em kg + peso unitário informado + unidades estimadas
    lib/
      categorias.ts                 # As 5 categorias fixas de produção + "Encomendas e Especiais" + validade sugerida por categoria
      conversao.ts                   # Deriva unidades perdidas a partir do peso pesado na balança
      numeros.ts                      # Sanitização de entrada numérica (textbox à prova de erro)
      metricas.ts                      # Taxa de perda, volume por dia, picos de perda (tudo em unidades)
      data.ts                           # Datas: hoje, amanhã, dia da semana, formatação BR, diferença em dias
      janelaValidade.ts                  # Quais fornadas confirmadas ainda estão dentro do prazo de validade do produto
      gerarImagemLista.ts                # Gera a fita PNG única de impressão (canvas, 576px, com linhas de corte)
      sugestaoProducao.ts                 # Cliente da sugestão por IA — monta histórico, chama /api
      importarProdutos.ts                  # Mapeamento planilha -> Produto (uso no navegador), já filtra fora de escopo
    components/
      TelaCronograma.tsx       # Montagem do cronograma: acordeão -> resumo -> exportar (+ sugestão IA)
      TelaCadastroProdutos.tsx  # Catálogo, categorização, validade, peso médio (autoatualizado pelas perdas), limpeza de escopo
      TelaPerdas.tsx             # Lançamento de perda de fim de expediente (considera a janela de validade)
      TelaRegistroPerda.tsx       # Peso perdido (kg) + peso unitário informado + fornada de origem, com preview ao vivo
      ExportarFita.tsx             # Preview + Compartilhar/Baixar da fita única de impressão
  scripts/
    importar_produtos.py         # Import em lote (rodado contra Produtos_881.xlsx), já filtra fora de escopo
    verificar_logica.ts           # Verificações de conversão/agregação/janela de validade
  data/
    produtos.seed.json            # 89 produtos das 5 categorias de produção, já convertidos para o schema do app
  tsconfig.json
```

## Verificação

```
npm run verificar   # roda scripts/verificar_logica.ts (24 asserções)
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

## Camada de dados (a decidir)

O código em `src/lib` e `src/types` é agnóstico de backend. `src/data/repositorioLocalStorage.ts`
é a implementação atual (MVP, um dispositivo). `src/data/repositorioFirestore.ts` é um
stub pronto para receber a implementação real quando o app precisar ser
multiusuário/multi-dispositivo (mesma interface `Repositorio` — trocar backend
é trocar uma linha em `src/App.tsx`).

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
