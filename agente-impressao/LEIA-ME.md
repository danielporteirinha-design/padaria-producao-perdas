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

## Instalação (uma vez só)

### 1. Instalar o Python

Baixe em [python.org/downloads](https://www.python.org/downloads/).

**Na primeira tela do instalador, marque "Add Python to PATH"** antes de
clicar em Install. Sem isso os arquivos `.bat` não funcionam.

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

Para o nome não errar, dê dois cliques em **`listar-impressoras.py`**: ele
mostra as impressoras instaladas com o nome exato. Copie de lá.

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

### 6. Subir junto com o Windows (opcional, recomendado)

Para não depender de alguém lembrar de abrir:

1. Tecla **Windows + R**
2. Digite `shell:startup` e Enter
3. Arraste o **`iniciar.bat`** para dentro dessa pasta segurando **Alt**
   (cria um atalho)

Da próxima vez que o PC ligar, o agente sobe sozinho.

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
