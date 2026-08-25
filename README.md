# Produção & Perdas — Padaria Pão de Mel

Módulo standalone para Cronograma de Produção Diária e Registro de Perdas.
Não substitui o Sistema de Gestão (Excel VBA + Access) em construção — ver
seção "Relação com o Sistema de Gestão" no documento de arquitetura.

Documento completo de arquitetura (stack, modelo de dados, fluxo de telas,
roadmap): ver `arquitetura.html` ou o link do Artifact enviado na conversa
(desatualizado em relação às decisões de ago/2026 abaixo — a atualizar).

## Status: app em produção (MVP local)

**Publicado em:** https://padaria-producao-perdas.vercel.app
Deploy automático a cada `git push` na branch `main` (GitHub → Vercel).

As 4 telas (Cronograma, Cadastro de Produtos, Perdas, Análises) estão
implementadas, tipadas em modo `strict` e com build de produção limpo
(`tsc --noEmit` + `vite build`). Persistência hoje é `localStorage`
(um dispositivo só) — ver "Camada de dados" abaixo para o que muda ao
plugar um backend real.

## Decisões operacionais (ago/2026)

Estas regras vieram de revisão direta com a padaria e substituem o desenho
inicial do documento de arquitetura:

| Decisão | Regra |
|---|---|
| Categorias de produção | Fixas: Pães e Roscas, Biscoitos, Bolos, Salgados, Confeitaria, + "Encomendas e Especiais" (busca livre no catálogo) |
| Quando o cronograma é montado | Sempre no fim do expediente do dia anterior, para o dia seguinte (`dataDeAmanhaIso()`) |
| Unidade de produção | **Sempre quilos**, mesmo para os ~89 produtos das 5 categorias que são vendidos por unidade no PDV — decisão deliberada para manter produzido/perdido na mesma unidade |
| Unidade de perda | Quilos (balança) ou unidades quebradas/sobras, convertidas para quilos via peso médio unitário cadastrado no produto |
| Impressão | Imagem PNG (canvas, 576px / ~79mm térmica), uma sessão por imagem, fonte grande, data em destaque — sem impressão automática (impressora sem rede); fluxo é Compartilhar/Baixar → WhatsApp → imprimir no PC da loja |

Essa mudança inverteu a lógica de conversão original: **kg é sempre aceito
direto (passthrough)**; a conversão só acontece quando o operador lança em
unidades (`un → kg`, via `pesoMedioUnitarioGramas`). Ver `src/lib/conversao.ts`.

### Rodar localmente

```
npm install
npm run dev
```

Abre em `http://localhost:5173`. Primeira execução já carrega o catálogo
completo (881 produtos) direto de `data/produtos.seed.json`.

### Build de produção (o que o Vercel roda a cada push)

```
npm run build      # tsc --noEmit && vite build -> gera dist/
```

## Estrutura

```
producao-perdas/
  src/
    types/
      produto.ts          # Modelo de Produto
      producao.ts          # Sessão de Produção (por categoria), Plano Diário
      perda.ts              # Registro de Perda (entrada bruta + normalizada em kg)
    lib/
      categorias.ts         # As 5 categorias fixas de produção + "Encomendas e Especiais"
      conversao.ts           # Normalização de perda para kg (kg passthrough, un -> kg)
      numeros.ts              # Sanitização de entrada numérica (textbox à prova de erro)
      metricas.ts               # Taxa de perda, volume por dia, picos de perda
      data.ts                    # Datas: hoje, amanhã, dia da semana, formatação BR
      gerarImagemLista.ts         # Gera a imagem PNG de impressão (canvas, 576px)
      importarProdutos.ts          # Mapeamento planilha -> Produto (uso no navegador)
    components/
      TelaCronograma.tsx       # Montagem do cronograma: acordeão -> resumo -> exportar
      TelaCadastroProdutos.tsx  # Catálogo, categorização, peso médio
      TelaPerdas.tsx             # Lançamento de perda de fim de expediente
      TelaRegistroPerda.tsx       # Textbox de quantidade + toggle kg/un
      ExportarSessao.tsx           # Preview + Compartilhar/Baixar imagem de impressão
  scripts/
    importar_produtos.py         # Import em lote (rodado contra Produtos_881.xlsx)
    verificar_logica.ts           # Verificações de conversão/agregação
  data/
    produtos.seed.json            # 881 produtos já convertidos para o schema do app
  tsconfig.json
```

## Verificação

```
npm run verificar   # roda scripts/verificar_logica.ts (15 asserções)
npx tsc --noEmit     # typecheck estrito, sem gerar arquivos
npm run build        # build de produção completo
```

Rodar os três antes de qualquer entrega — nenhuma alteração deve ser
considerada pronta sem `TODOS OS CASOS PASSARAM` + build limpo.

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
  erros de domínio explícitos (`ErroConversaoPerda`) em vez de falhar
  silenciosamente — ver `conversao.ts`.
