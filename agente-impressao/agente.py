"""
agente.py — Agente de impressao da Padaria Pao de Mel
=====================================================

Roda no PC do caixa, ao lado da impressora termica USB. Busca na fila do
Firestore os trabalhos que o celular enviou, imprime e marca como feitos.

POR QUE EXISTE
--------------
A impressora nao tem rede, e o celular nao consegue falar com ela direto:
o Safari do iPhone bloqueia uma pagina HTTPS de chamar um endereco
http://192.168.x.x da rede local, sem contorno confiavel. Entao o caminho
e indireto — o celular grava na nuvem, este programa busca e imprime.

POR QUE CONTA DE USUARIO E NAO CHAVE DE SERVICO
-----------------------------------------------
Uma chave de servico do Firebase ignora as regras de seguranca e daria a
este PC acesso total ao banco das tres lojas. Este agente entra com a
conta impressora@paodemel.local, que as regras limitam a ver a fila de
impressao e mudar so o status. Se o PC do caixa for comprometido, o
estrago fica contido nisso.

POR QUE CONSULTA DE TEMPOS EM TEMPOS
------------------------------------
Uma escuta em tempo real exigiria a biblioteca oficial do Google e uma
chave de servico. A consulta periodica usa so a API REST com a conta
comum. A cada 15s dao ~5.760 leituras/dia, contra as 50.000 gratuitas —
folga de quase 9x, mesmo somando o uso normal do app pelas tres lojas.

INSTALACAO E USO: ver LEIA-ME.md nesta pasta.
"""

import base64
import configparser
import io
import os
import sys
import time
import traceback
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    sys.exit("Falta a biblioteca 'requests'. Rode: pip install requests")

try:
    from PIL import Image
except ImportError:
    sys.exit("Falta a biblioteca 'Pillow'. Rode: pip install Pillow")


# --------------------------------------------------------------------
# Configuracao
# --------------------------------------------------------------------

PASTA = os.path.dirname(os.path.abspath(__file__))
CAMINHO_CONFIG = os.path.join(PASTA, "config.ini")
CAMINHO_LOG = os.path.join(PASTA, "agente.log")

COLECAO = "fila_impressao"
SEGUNDOS_ENTRE_CONSULTAS = 15
# O token do Firebase vale 1 hora; renovamos antes por seguranca.
SEGUNDOS_ATE_RENOVAR_TOKEN = 45 * 60

# Sinal de vida no log quando nao ha nada para imprimir.
#
# POR QUE (ago/2026): o agente so' escrevia ao imprimir ou ao falhar.
# Fila vazia = silencio total, e o log ficava identico ao de um agente
# FECHADO. Passamos meia hora sem conseguir responder "ele esta rodando?"
# olhando justamente o arquivo que existe para responder isso.
# 20 ciclos de 15s = uma linha a cada 5 minutos.
CICLOS_ENTRE_SINAIS_DE_VIDA = 20


def registrar(mensagem):
    """Escreve na tela e no arquivo de log, com hora local."""
    linha = f"[{datetime.now().strftime('%d/%m %H:%M:%S')}] {mensagem}"
    print(linha, flush=True)
    try:
        with open(CAMINHO_LOG, "a", encoding="utf-8") as arquivo:
            arquivo.write(linha + "\n")
    except OSError:
        pass  # Log e' conveniencia; nunca pode derrubar a impressao.


def carregar_config():
    if not os.path.exists(CAMINHO_CONFIG):
        sys.exit(
            f"Arquivo de configuracao nao encontrado: {CAMINHO_CONFIG}\n"
            "Copie config.exemplo.ini para config.ini e preencha."
        )
    config = configparser.ConfigParser()
    config.read(CAMINHO_CONFIG, encoding="utf-8")
    try:
        return {
            "api_key": config["firebase"]["api_key"].strip(),
            "projeto": config["firebase"]["projeto"].strip(),
            "email": config["firebase"]["email"].strip(),
            "senha": config["firebase"]["senha"].strip(),
            "impressora": config["impressora"]["nome"].strip(),
            "largura": int(config["impressora"].get("largura_pontos", "576")),
        }
    except KeyError as erro:
        sys.exit(f"Falta a chave {erro} no config.ini. Compare com config.exemplo.ini.")


# --------------------------------------------------------------------
# Autenticacao no Firebase
# --------------------------------------------------------------------


class Sessao:
    """Guarda o token e renova sozinha antes de expirar."""

    def __init__(self, config):
        self.config = config
        self.id_token = None
        self.refresh_token = None
        self.renovado_em = 0

    def entrar(self):
        resposta = requests.post(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
            params={"key": self.config["api_key"]},
            json={
                "email": self.config["email"],
                "password": self.config["senha"],
                "returnSecureToken": True,
            },
            timeout=30,
        )
        if resposta.status_code != 200:
            detalhe = resposta.json().get("error", {}).get("message", resposta.text)
            raise RuntimeError(f"Nao foi possivel entrar no Firebase: {detalhe}")
        dados = resposta.json()
        self.id_token = dados["idToken"]
        self.refresh_token = dados["refreshToken"]
        self.renovado_em = time.time()
        registrar(f"Conectado como {self.config['email']}")

    def renovar(self):
        resposta = requests.post(
            "https://securetoken.googleapis.com/v1/token",
            params={"key": self.config["api_key"]},
            data={"grant_type": "refresh_token", "refresh_token": self.refresh_token},
            timeout=30,
        )
        if resposta.status_code != 200:
            # Se a renovacao falhar, entrar de novo do zero resolve.
            self.entrar()
            return
        dados = resposta.json()
        self.id_token = dados["id_token"]
        self.refresh_token = dados["refresh_token"]
        self.renovado_em = time.time()

    def token(self):
        if self.id_token is None:
            self.entrar()
        elif time.time() - self.renovado_em > SEGUNDOS_ATE_RENOVAR_TOKEN:
            self.renovar()
        return self.id_token


# --------------------------------------------------------------------
# Firestore via API REST
# --------------------------------------------------------------------


def url_base(config):
    return (
        f"https://firestore.googleapis.com/v1/projects/{config['projeto']}"
        "/databases/(default)/documents"
    )


def valor_simples(campo):
    """Converte o formato tipado do Firestore para um valor Python."""
    for chave in ("stringValue", "booleanValue"):
        if chave in campo:
            return campo[chave]
    if "integerValue" in campo:
        return int(campo["integerValue"])
    if "doubleValue" in campo:
        return float(campo["doubleValue"])
    return None


def buscar_pendentes(sessao, config):
    """
    Consulta os trabalhos com status pendente, mais antigos primeiro.

    SEM `orderBy` NA CONSULTA, DE PROPOSITO (ago/2026)
    --------------------------------------------------
    Filtrar por um campo e ordenar por OUTRO obriga o Firestore a ter um
    indice composto, criado a mao no console. Na primeira instalacao isso
    aparecia como "The query requires an index" e travava a configuracao
    inteira num passo que nao tem nada a ver com impressao — e voltaria a
    travar no dia em que o projeto fosse recriado.

    A ordenacao acontece aqui embaixo, em Python. A fila e' curta por
    natureza (o que imprime sai dela em segundos), entao ordenar no PC
    custa nada e o agente passa a funcionar em qualquer projeto novo sem
    preparo nenhum.
    """
    consulta = {
        "structuredQuery": {
            "from": [{"collectionId": COLECAO}],
            "where": {
                "fieldFilter": {
                    "field": {"fieldPath": "status"},
                    "op": "EQUAL",
                    "value": {"stringValue": "pendente"},
                }
            },
            # Limite generoso: sem ordenacao no servidor, o corte e'
            # arbitrario, e um numero apertado poderia deixar o trabalho
            # mais antigo de fora justamente quando a fila acumula.
            "limit": 25,
        }
    }
    resposta = requests.post(
        f"{url_base(config)}:runQuery",
        headers={"Authorization": f"Bearer {sessao.token()}"},
        json=consulta,
        timeout=60,
    )
    if resposta.status_code != 200:
        raise RuntimeError(f"Consulta recusada ({resposta.status_code}): {resposta.text[:300]}")

    trabalhos = []
    for item in resposta.json():
        documento = item.get("document")
        if not documento:
            continue  # Resultado vazio vem como um item sem 'document'.
        campos = documento.get("fields", {})
        trabalhos.append(
            {
                "caminho": documento["name"],
                "documento": valor_simples(campos.get("documento", {})) or "documento",
                "nomeArquivo": valor_simples(campos.get("nomeArquivo", {})) or "impressao.png",
                "parte": valor_simples(campos.get("parte", {})) or 1,
                "totalPartes": valor_simples(campos.get("totalPartes", {})) or 1,
                "imagemBase64": valor_simples(campos.get("imagemBase64", {})) or "",
                "criadoPor": valor_simples(campos.get("criadoPor", {})) or "",
                "criadoEm": valor_simples(campos.get("criadoEm", {})) or "",
            }
        )

    # Ordenacao que saiu da consulta (ver o comentario la' em cima).
    # `criadoEm` e' ISO 8601, entao ordem alfabetica e' ordem cronologica.
    # Uma fita dividida em varias partes tem que sair na sequencia certa:
    # imprimir a parte 2 antes da 1 entrega ao padeiro uma lista fora de
    # ordem, e ele so' descobre depois de cortar o papel.
    trabalhos.sort(key=lambda t: (t["criadoEm"], t["parte"]))
    return trabalhos


def marcar(sessao, trabalho, status, erro=None):
    """Atualiza SO o resultado — as regras nao permitem tocar no resto."""
    campos = {
        "status": {"stringValue": status},
        "impressoEm": {"stringValue": datetime.now(timezone.utc).isoformat()},
    }
    if erro:
        campos["erro"] = {"stringValue": erro[:400]}

    parametros = [("updateMask.fieldPaths", chave) for chave in campos]
    resposta = requests.patch(
        f"https://firestore.googleapis.com/v1/{trabalho['caminho']}",
        headers={"Authorization": f"Bearer {sessao.token()}"},
        params=parametros,
        json={"fields": campos},
        timeout=30,
    )
    if resposta.status_code != 200:
        registrar(f"  aviso: nao consegui marcar como {status} ({resposta.status_code})")


# --------------------------------------------------------------------
# Impressao
# --------------------------------------------------------------------


def preparar_imagem(base64_png, largura_alvo):
    """Decodifica o PNG e ajusta para a largura util da impressora."""
    bruto = base64.b64decode(base64_png)
    imagem = Image.open(io.BytesIO(bruto))
    # Fundo branco: PNG com transparencia sairia com manchas pretas na
    # termica, que imprime qualquer pixel nao-branco.
    if imagem.mode in ("RGBA", "LA", "P"):
        fundo = Image.new("RGB", imagem.size, "white")
        imagem = imagem.convert("RGBA")
        fundo.paste(imagem, mask=imagem.split()[-1])
        imagem = fundo
    imagem = imagem.convert("L")

    if imagem.width != largura_alvo:
        nova_altura = round(imagem.height * largura_alvo / imagem.width)
        imagem = imagem.resize((largura_alvo, nova_altura), Image.LANCZOS)
    return imagem


def imprimir(imagem, nome_impressora):
    """
    Envia via python-escpos no modo Win32Raw: usa o driver ja instalado
    no Windows, sem trocar driver por Zadig (o que quebraria a impressao
    dos outros programas do caixa) e sem depender da paginacao do GDI,
    que erra em papel de rolo continuo.
    """
    try:
        from escpos.printer import Win32Raw
    except ImportError:
        raise RuntimeError(
            "Falta a biblioteca 'python-escpos'. Rode: pip install python-escpos"
        )

    impressora = Win32Raw(nome_impressora)
    impressora.open()
    try:
        impressora.image(imagem)
        impressora.text("\n\n")
        try:
            impressora.cut()
        except Exception:
            # Nem toda termica tem guilhotina; sem corte automatico o
            # papel so' avanca e o operador destaca na serrilha.
            impressora.text("\n\n\n")
    finally:
        impressora.close()


# --------------------------------------------------------------------
# Laco principal
# --------------------------------------------------------------------


def main():
    config = carregar_config()
    registrar("=" * 58)
    registrar("Agente de impressao — Padaria Pao de Mel")
    registrar(f"Impressora: {config['impressora']}  |  largura: {config['largura']} pontos")
    registrar(f"Verificando a fila a cada {SEGUNDOS_ENTRE_CONSULTAS}s. Ctrl+C para parar.")
    registrar("=" * 58)

    sessao = Sessao(config)
    falhas_seguidas = 0
    ciclos_em_silencio = 0

    while True:
        try:
            pendentes = buscar_pendentes(sessao, config)
            falhas_seguidas = 0

            if not pendentes:
                ciclos_em_silencio += 1
                if ciclos_em_silencio >= CICLOS_ENTRE_SINAIS_DE_VIDA:
                    registrar("aguardando — nada na fila")
                    ciclos_em_silencio = 0
            else:
                ciclos_em_silencio = 0

            for trabalho in pendentes:
                rotulo = f"{trabalho['documento']} ({trabalho['parte']}/{trabalho['totalPartes']})"
                registrar(f"Imprimindo: {rotulo} — enviado por {trabalho['criadoPor']}")
                try:
                    imagem = preparar_imagem(trabalho["imagemBase64"], config["largura"])
                    imprimir(imagem, config["impressora"])
                    marcar(sessao, trabalho, "impresso")
                    registrar(f"  ok — {imagem.width}x{imagem.height} pontos")
                except Exception as erro:
                    registrar(f"  FALHOU: {erro}")
                    # Marcar como erro evita o trabalho ser tentado para
                    # sempre num laco infinito, gastando papel ou quota.
                    marcar(sessao, trabalho, "erro", str(erro))

        except KeyboardInterrupt:
            registrar("Encerrado pelo operador.")
            return
        except Exception as erro:
            falhas_seguidas += 1
            registrar(f"Erro ao consultar a fila: {erro}")
            if falhas_seguidas == 1:
                registrar(traceback.format_exc())
            # Espera crescente ate 5 min: se a internet caiu, nao adianta
            # martelar o servidor a cada 15 segundos.
            espera = min(SEGUNDOS_ENTRE_CONSULTAS * falhas_seguidas, 300)
            time.sleep(espera)
            continue

        time.sleep(SEGUNDOS_ENTRE_CONSULTAS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        registrar("Encerrado pelo operador.")
