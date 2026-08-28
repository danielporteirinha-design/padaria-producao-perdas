"""
scripts/gerar_icones.py
---------------------------------------------------------------
Gera todos os ícones do app a partir da logomarca da padaria.

Rodar: python3 scripts/gerar_icones.py
Entrada: assets/logo-pao-de-mel.png (a pílula recortada, sem margem)

A origem em alta fica em assets/, FORA de public/: tudo que está em
public/ entra no precache do service worker, e o arquivo original tem
673 KB — meio megabyte que todo celular da padaria baixaria a cada
atualização do app sem nunca exibir. A versão que a tela de login usa é
gerada aqui, reduzida.

POR QUE UM SCRIPT, E NÃO ARQUIVOS SOLTOS
-----------------------------------------
Ícone é derivado, não original: mudou a logomarca, todos os tamanhos
mudam junto. Com o script, atualizar é trocar um arquivo e rodar um
comando — sem ninguém precisar lembrar quais eram os sete tamanhos nem
qual deles tinha regra própria.

AS TRÊS FAMÍLIAS, E POR QUE SÃO DIFERENTES
-------------------------------------------
1. Ícone comum (192, 512, apple-touch): a logomarca inteira sobre BRANCO.
   A pílula é 2,8x mais larga que alta e nunca vai encher um quadrado —
   o que carrega o reconhecimento nesse tamanho é a FORMA vermelha e o
   amarelo, não a leitura das letras.

   O fundo era creme (255,255,215) e virou branco (ago/2026, decisão do
   dono do negócio). Na tela de início do celular o ícone aparece cercado
   dos outros aplicativos, e o creme lia como papel encardido em vez de
   escolha — além de tirar contraste justamente do vermelho e do amarelo,
   que são a marca. Sobre branco a pílula recorta limpa.

   Na tela de ENTRADA a decisão é outra (ago/2026): lá a marca fica
   direto sobre o creme do app, sem placa nenhuma. São contextos
   diferentes — o ícone divide a tela com aplicativos de terceiros e
   precisa de moldura própria; a tela de entrada é do app inteiro.

2. Maskable (Android): o sistema recorta o ícone em círculo, gota ou
   quadrado arredondado, à escolha do fabricante. Só a área central é
   garantida, então aqui a logomarca entra menor — uma pílula deitada
   que encostasse nas bordas perderia as pontas em qualquer recorte
   redondo.

3. Favicon: a LOGOMARCA INTEIRA, num círculo branco (ago/2026, decisão
   do dono do negócio — antes era só o "P" do script).

   A ressalva é real e fica registrada: a pílula é 2,8x mais larga que
   alta, então dentro de um círculo de 32 px ela ocupa uns 11 px de
   altura e as letras não se leem. O que identifica o ícone nesse tamanho
   passa a ser a mancha vermelha com o miolo amarelo, e não a palavra —
   que é como a maioria das marcas funciona em favicon. O "P" sozinho era
   mais legível; a marca inteira é mais reconhecível para quem já conhece
   a padaria. A escolha é do dono do negócio, e é defensável.

   Gerado em 128 px e reduzido para 32 no fim: desenhar direto em 32
   serrilha a curva do círculo e engrossa o traço do script.

4. Badge da notificação: silhueta branca em fundo transparente — o
   Android ignora as cores do badge e usa apenas o formato, então mandar
   a logomarca colorida ali produz um borrão cinza na barra de status.
"""

from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

RAIZ = Path(__file__).resolve().parent.parent
PUBLICO = RAIZ / "public"
ORIGEM = RAIZ / "assets" / "logo-pao-de-mel.png"

# Amostradas da própria logomarca — nunca escolhidas "no olho".
VERMELHO = (196, 0, 39)
AMARELO = (255, 249, 80)
# Fundo dos ícones. Branco puro, e não o creme da marca: ver o cabeçalho
# sobre por que o creme foi abandonado.
FUNDO_ICONE = (255, 255, 255)


def logo() -> Image.Image:
    """
    A logomarca com o fundo REALMENTE removido, por preenchimento a partir
    das bordas.

    POR QUE NÃO BASTA "APAGAR O QUE FOR BRANCO"
    --------------------------------------------
    A versão anterior apagava pixel a pixel o que passasse de 243 nos três
    canais. O arquivo de origem, porém, é uma digitalização comprimida: o
    fundo em volta da pílula não é branco puro, é uma nuvem de 238-255 com
    ruído de compressão. O que sobrava era uma casca de pixels claros
    contornando a marca — invisível sobre a placa branca da tela de entrada
    e bem visível sobre o creme do app, que é o fundo pedido agora
    (ago/2026, pedido do dono do negócio: "abaixo da logomarca teremos
    somente a cor de plano de fundo do app").

    Baixar o corte para 232 resolveria a casca e criaria outro problema:
    apagaria qualquer claro DENTRO da marca. Por isso o corte não é por
    cor, e sim por REGIÃO: parte-se das quatro bordas da imagem e apaga-se
    só a mancha clara conectada a elas. Um claro cercado de vermelho não é
    fundo e não é tocado.

    A franja de 2 px ao redor recebe transparência proporcional — pixel
    quase branco some, pixel já misturado com a marca fica. Sem isso a
    borda ficaria serrilhada, que é o defeito que a placa branca escondia.
    """
    marca = Image.open(ORIGEM).convert("RGBA")
    dados = np.array(marca).astype(np.int16)
    canais = dados[:, :, :3]

    maximo = canais.max(axis=2)
    minimo = canais.min(axis=2)

    # Candidato a fundo: o quase-branco E o cinza da sombra que o
    # original traz em volta da pílula. A marca não tem cinza — é
    # vermelha, amarela e branca —, então "quase sem cor e claro" só
    # descreve o que está FORA dela. O branco do "PADARIA" também se
    # encaixa nessa descrição, e é justamente por isso que o corte é por
    # região: ele está cercado de vermelho e nunca chega às bordas.
    claro = minimo >= 232
    cinza_claro = ((maximo - minimo) < 30) & (minimo >= 150)
    candidato = claro | cinza_claro

    # Só a mancha CONECTADA às bordas da imagem é fundo.
    regioes, _ = ndimage.label(candidato)
    das_bordas = set(regioes[0].tolist()) | set(regioes[-1].tolist())
    das_bordas |= set(regioes[:, 0].tolist()) | set(regioes[:, -1].tolist())
    das_bordas.discard(0)
    fundo = np.isin(regioes, list(das_bordas))

    alfa = np.where(fundo, 0, 255).astype(np.int16)

    # Franja: o anel de 3 px em volta do fundo perde opacidade conforme
    # sua clareza. É o que faz a borda da pílula sair suave em vez de
    # serrilhada — defeito que a placa branca escondia e o fundo creme
    # denunciaria.
    anel = ndimage.binary_dilation(fundo, iterations=3) & ~fundo
    suave = np.clip((232 - minimo) * (255 / 60), 0, 255)
    alfa = np.where(anel, np.minimum(alfa, suave), alfa)

    dados[:, :, 3] = alfa
    return Image.fromarray(dados.astype(np.uint8), "RGBA")


def cantos_arredondados(imagem: Image.Image, raio_relativo: float = 0.22) -> Image.Image:
    """Cantos do próprio ícone (iOS já arredonda; Android nem sempre)."""
    tam = imagem.size[0]
    mascara = Image.new("L", (tam, tam), 0)
    ImageDraw.Draw(mascara).rounded_rectangle(
        [0, 0, tam - 1, tam - 1], radius=int(tam * raio_relativo), fill=255
    )
    saida = imagem.copy()
    saida.putalpha(mascara)
    return saida


def icone(tam: int, ocupacao: float, arredondar: bool) -> Image.Image:
    """Logomarca centrada sobre branco, ocupando `ocupacao` da largura."""
    marca = logo()
    fundo = Image.new("RGBA", (tam, tam), FUNDO_ICONE + (255,))
    largura = int(tam * ocupacao)
    altura = round(largura * marca.height / marca.width)
    reduzida = marca.resize((largura, altura), Image.LANCZOS)
    fundo.paste(reduzida, ((tam - largura) // 2, (tam - altura) // 2), reduzida)
    return cantos_arredondados(fundo) if arredondar else fundo


def favicon(tam: int = 32) -> Image.Image:
    """
    A logomarca inteira, centrada num CÍRCULO branco.

    Desenhado grande (8x) e reduzido no fim: a curva do círculo serrilha
    e o traço do script engrossa se forem rasterizados direto em 32 px.

    A logomarca ocupa 86% do diâmetro em largura — o resto é o anel
    vermelho e a folga até ele. Mais que isso e as pontas da pílula tocam
    o anel justamente onde ele é mais inclinado, e o encontro das duas
    curvas vermelhas vira um borrão sem forma.
    """
    escala = 8
    lado = tam * escala

    circulo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    # Anel vermelho fino: sem ele o disco branco some contra a barra clara
    # do navegador, e o que sobra é uma mancha vermelha flutuando. O anel
    # usa o vermelho da própria marca, então a 32 px ele lê como parte do
    # ícone e não como moldura.
    ImageDraw.Draw(circulo).ellipse(
        [0, 0, lado - 1, lado - 1],
        fill=FUNDO_ICONE + (255,),
        outline=VERMELHO + (255,),
        width=int(lado * 0.045),
    )

    marca = logo()
    largura = int(lado * 0.86)
    altura = round(largura * marca.height / marca.width)
    reduzida = marca.resize((largura, altura), Image.LANCZOS)
    circulo.alpha_composite(reduzida, ((lado - largura) // 2, (lado - altura) // 2))

    return circulo.resize((tam, tam), Image.LANCZOS)


def badge(tam: int = 96) -> Image.Image:
    """
    Silhueta para a barra de status do Android. Branco sobre
    transparente, forma simples: o sistema descarta a cor e usa só o
    alfa, então detalhe fino desaparece e cor vira ruído.

    Um pão com os cortes de cima — o desenho mais legível a 24 px que
    ainda diz "padaria".
    """
    # Desenhado grande e reduzido no fim: traço fino direto em 96 px
    # vira serrilha, e o Android ainda encolhe isto para ~24 px.
    escala = 8
    lado = tam * escala
    imagem = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(imagem)
    u = lado / 96

    # Corpo do pão: oval achatado, ocupando quase toda a largura útil.
    d.ellipse([10 * u, 32 * u, 86 * u, 72 * u], fill=(255, 255, 255, 255))
    # DOIS cortes, largos. Com três finos os vãos somem por completo aos
    # 24 px da barra de status e sobra um oval branco sem leitura.
    for x in (36 * u, 60 * u):
        d.line(
            [(x, 52 * u), (x + 13 * u, 34 * u)],
            fill=(0, 0, 0, 0),
            width=int(9 * u),
        )
    return imagem.resize((tam, tam), Image.LANCZOS)


def logo_para_web(largura: int) -> Image.Image:
    """Versão leve da marca, para a tela de entrada."""
    marca = logo()
    altura = round(largura * marca.height / marca.width)
    return marca.resize((largura, altura), Image.LANCZOS)


def gerar() -> None:
    saidas = [
        ("pwa-192x192.png", icone(192, 0.90, True)),
        ("pwa-512x512.png", icone(512, 0.90, True)),
        # 75% é o limite para a pílula deitada caber inteira no círculo
        # de segurança do maskable (80% do lado) — ver cabeçalho.
        ("pwa-maskable-512x512.png", icone(512, 0.75, False)),
        ("apple-touch-icon.png", icone(180, 0.90, False)),
        ("favicon-32x32.png", favicon(32)),
        # Um favicon maior para quem exibe grande: aba fixada, atalho na
        # área de trabalho, lista de favoritos. O navegador escolhe o
        # tamanho mais próximo do que vai desenhar; sem esta opção ele
        # esticaria o de 32 e a marca ficaria borrada justamente onde
        # havia espaço para ela ser lida.
        ("favicon-180x180.png", favicon(180)),
        ("badge-96x96.png", badge(96)),
        # Para a tela de login. 800 px cobre o dobro do maior tamanho
        # exibido (320 px), que é o suficiente para tela retina.
        ("logo-pao-de-mel.png", logo_para_web(800)),
    ]
    for nome, imagem in saidas:
        destino = PUBLICO / nome
        imagem.save(destino)
        print(f"gerado: public/{nome}  ({imagem.size[0]}x{imagem.size[1]})")


if __name__ == "__main__":
    gerar()
