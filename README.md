# Produção & Perdas — Padaria Pão de Mel

Módulo standalone para Cronograma de Produção Diária e Registro de Perdas.
Não substitui o Sistema de Gestão (Excel VBA + Access) em construção — ver
seção "Relação com o Sistema de Gestão" no documento de arquitetura.

Documento completo de arquitetura (stack, modelo de dados, fluxo de telas,
roadmap): ver `arquitetura.html` ou o link do Artifact enviado na conversa.

## Status: app funcional (MVP local)

As 4 telas (Cronograma, Cadastro de Produtos, Perdas, Análises) estão
implementadas e testadas de ponta a ponta — build de produção limpo
(`tsc --strict` + `vite build`) e fluxo completo validado com Playwright
(login → cronograma → resumo → confirmar → lançar perda → análises).
Persistência hoje é local (`localStorage`, um dispositivo só) — ver
"Decisões assumidas nesta versão" no documento de arquitetura para o que
muda ao plugar o Firestore.

### Rodar localmente

```
npm install
npm run dev
```

Abre em `http://localhost:5173`. Primeira execução já carrega o catálogo
completo (881 produtos) direto de `data/produtos.seed.json`.

### Build de produção (o que o GitHub Actions deve rodar)

```
npm run build      # tsc --noEmit && vite build -> gera dist/
```

## Estrutura

```
producao-perdas/
  src/
    types/
      produto.ts        # Modelo de Produto (inclui campos novos de conversão)
      producao.ts        # Sessão de Produção, Plano Diário, dia da semana
      perda.ts            # Registro de Perda (entrada bruta + normalizada)
    lib/
      conversao.ts        # Regra de conversão kg <-> un
      metricas.ts          # Taxa de perda, volume por dia, picos de perda
      importarProdutos.ts # Mapeamento planilha -> Produto (uso no navegador)
    components/
      TelaRegistroPerda.tsx # Componente de referência da tela de Perdas
  scripts/
    importar_produtos.py   # Import em lote (rodado contra Produtos_881.xlsx)
    verificar_logica.ts    # 13 verificações de conversão/agregação
  data/
    produtos.seed.json     # 881 produtos já convertidos para o schema do app
  tsconfig.json
```

## Como colocar no GitHub

1. Crie um repositório novo no GitHub e cole esta pasta inteira dentro
   (o projeto já vem completo: `package.json`, `vite.config.ts`,
   `index.html`, `src/`, `scripts/`, `data/`) — não precisa rodar
   `npm create vite` de novo, isso já foi feito.
2. `npm install` para baixar as dependências (não vão versionadas —
   `node_modules/` deve estar no `.gitignore`).
3. Configure um workflow de GitHub Actions rodando `npm run build` a
   cada push e publicando `dist/` (Firebase Hosting, Vercel ou
   GitHub Pages — o build é um site estático puro).

Para reexecutar a verificação de lógica:
```
npm run verificar
```

Para reimportar a planilha (ou uma versão atualizada dela):
```
pip install openpyxl
python3 scripts/importar_produtos.py caminho/planilha.xlsx data/produtos.seed.json
```

## Camada de dados (a decidir com você)

O código em `src/lib` e `src/types` é agnóstico de backend — não importa
nenhum SDK específico. A recomendação no documento de arquitetura é
**Firestore** (Firebase), mas as funções de `metricas.ts` e `conversao.ts`
funcionam com qualquer fonte de dados que devolva os tipos de
`src/types/*.ts`. Definir o backend é o próximo passo prático antes de
começar a Fase 1 do roadmap.

## Convenções

- Nomenclatura de arquivos/identificadores: apenas caracteres
  alfanuméricos, `_` e `-` — sem espaços ou acentuação em nomes de
  arquivo/variável (o conteúdo em português dos dados, esse sim, mantém
  acentuação normalmente).
- Todo módulo de lógica de negócio (`src/lib`) é puro (sem I/O) e lança
  erros de domínio explícitos (`ErroConversaoPerda`) em vez de falhar
  silenciosamente — ver `conversao.ts`.
