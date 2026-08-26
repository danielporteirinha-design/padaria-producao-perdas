# Agente de impressão — PC do caixa

Programa que roda no PC do caixa e imprime na térmica o que o celular
enviar pelo app.

## Como funciona

```
Celular  ──>  nuvem (fila)  ──>  este programa  ──>  impressora USB
```

A impressora não tem rede, e o celular não consegue falar com ela direto:
o Safari do iPhone bloqueia uma página HTTPS de chamar um endereço da
rede local, sem contorno confiável. Então o caminho é indireto — o celular
grava na nuvem, este programa busca a cada 15 segundos e imprime.

## Nenhum índice do Firestore a criar

A consulta da fila filtra por `status` e **não** ordena no servidor: a
ordenação acontece no PC, em Python. Filtrar por um campo e ordenar por
outro obrigaria o Firestore a ter um índice composto, criado a mão no
console — e na primeira instalação isso apareceu como
`The query requires an index`, travando a configuração num passo que não
tem nada a ver com impressão (ago/2026).

A fila é curta por natureza, então ordenar aqui custa nada e o agente
funciona em qualquer projeto novo sem preparo.

## Instalação (uma vez só)

### 1. Instalar o Python

Baixe em [python.org/downloads](https://www.python.org/downloads/).

**Na primeira tela do instalador, marque "Add Python to PATH"** antes de
clicar em Install.

#### Se aparecer "Python Install Manager"

O python.org passou a distribuir o **Python Install Manager** — um
gerenciador, que instala o atalho `py` mas **não é o Python em si**. Se a
tela disser que o Install Manager já está instalado, confira no Prompt de
Comando:

```
py --version
```

Se responder com um número de versão, está pronto. Se disser que nenhuma
versão foi encontrada, instale uma:

```
py install 3.13
```

Os arquivos `.bat` deste projeto lidam com os dois mundos: procuram `py`
primeiro e `python` depois, e avisam na tela quando não acham nenhum — em
vez de abrir e fechar sem explicação, que era o comportamento antigo.

### 2. Criar a conta da impressora no Firebase

Console do Firebase → **Authentication** → aba **Users** → **Adicionar usuário**:

```
impressora@paodemel.local
```

Escolha uma senha e guarde — vai no passo 4.

Essa conta é separada de propósito. As regras do banco só deixam ela ver
a fila de impressão e marcar o que já imprimiu. Se este PC for
comprometido, o estrago fica contido nisso — o que não aconteceria com
uma chave de serviço, que ignora as regras e daria acesso total ao banco
das três lojas.

### 3. Instalar as bibliotecas

Dois cliques em **`instalar.bat`**. Espere terminar.

### 4. Preencher a configuração

Copie **`config.exemplo.ini`** para **`config.ini`** (mesma pasta) e
preencha dois campos:

- `senha` — a senha que você criou no passo 2
- `nome` — o nome exato da impressora

Para o nome não errar, dê dois cliques em **`listar-impressoras.bat`**:
ele mostra as impressoras instaladas com o nome exato. Copie de lá.

(É `.bat`, e não `.py`: dois cliques num `.py` só funcionam se a extensão
estiver associada ao Python, e com o Install Manager ela costuma não
estar.)

Se a bobina for de 58mm em vez de 80mm, troque `largura_pontos` para `384`.

### 5. Ligar

Dois cliques em **`iniciar.bat`**. Deve aparecer:

```
Agente de impressao — Padaria Pao de Mel
Impressora: <nome>  |  largura: 576 pontos
Verificando a fila a cada 15s. Ctrl+C para parar.
Conectado como impressora@paodemel.local
```

**Deixe essa janela aberta.** Fechou, parou de imprimir.

### 6. Subir junto com o Windows — NÃO é opcional

Dois cliques em **`instalar-inicio-automatico.bat`**. Uma vez só.

Isto deixou de ser "opcional, recomendado" depois do primeiro dia de uso
(ago/2026): a fila inteira ficou parada porque ninguém tinha aberto o
programa, e a lista de produção do dia seguinte dependia disso. Depender
de alguém lembrar de abrir um programa todo dia, num balcão de padaria às
5 da manhã, não é um plano — é uma falha esperando a hora.

O agente **só imprime enquanto a janela dele está aberta**. Fechou, a fila
para de andar (nada se perde: os trabalhos ficam na nuvem e saem todos
quando ele voltar).

Vale a partir do próximo reinício do PC. Hoje, abra o `iniciar.bat` uma
vez à mão.

Para desfazer: **Windows + R** → `shell:startup` → apague o atalho
"Agente de impressao".

#### Se preferir fazer à mão

1. Tecla **Windows + R**
2. Digite `shell:startup` e Enter
3. Arraste o **`iniciar.bat`** para dentro dessa pasta segurando **Alt**

## Uso no dia a dia

No celular, depois de confirmar a produção, cada documento tem o botão
**"Imprimir no caixa"**. Some 15 segundos e sai na térmica.

Se o cronograma for grande e a fita virar mais de uma imagem, saem todas,
uma depois da outra, na ordem.

## Quando algo não sai

O agente escreve tudo em **`agente.log`**, nesta pasta. Abra o arquivo e
veja a última linha.

| Mensagem no log | O que é |
|---|---|
| `Nao foi possivel entrar no Firebase: INVALID_LOGIN_CREDENTIALS` | Senha errada no `config.ini`, ou a conta não foi criada no passo 2 |
| `Consulta recusada (403)` | As regras de segurança não foram republicadas depois desta versão |
| `Falta a biblioteca ...` | O `instalar.bat` não rodou, ou o Python foi instalado sem "Add to PATH" |
| `FALHOU: ... printer ...` | Nome da impressora errado no `config.ini` — rode `listar-impressoras.py` |
| `Erro ao consultar a fila` | Internet caiu. O agente tenta de novo sozinho, esperando cada vez mais |
| `aguardando — nada na fila` | Está tudo certo. É o sinal de vida, a cada 5 minutos, para o log responder se o agente está de pé |

Se a última linha do log for de horas atrás e **não** for um
`aguardando`, o agente está fechado. Abra o `iniciar.bat`.

Um trabalho que falha é marcado como erro e **não é tentado de novo** —
senão ficaria num laço infinito gastando papel. Mande imprimir de novo
pelo celular depois de resolver.

## Enquanto o agente estiver parado

O botão **"Compartilhar / Baixar imagem"** continua funcionando. É o
caminho antigo — WhatsApp e imprimir pelo PC — e nunca deixou de existir.

## Segurança

- O `config.ini` tem a senha da impressora e **não vai para o GitHub**
  (está no `.gitignore` desta pasta).
- Essa conta não lê cronograma, catálogo nem perdas. Só a fila de impressão.
- Trabalho já impresso pode ser apagado da fila; a imagem não fica
  guardada para sempre na nuvem.
