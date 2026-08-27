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
1. Ícone comum (192, 512, apple-touch): a logomarca inteira sobre creme.
   A pílula é 2,8x mais larga que alta e nunca vai encher um quadrado —
   o que carrega o reconhecimento nesse tamanho é a FORMA vermelha e o
   amarelo, não a leitura das letras.

2. Maskable (Android): o sistema recorta o ícone em círculo, gota ou
   quadrado arredondado, à escolha do fabricante. Só a área central é
   garantida, então aqui a logomarca entra menor — uma pílula deitada
   que encostasse nas bordas perderia as pontas em qualquer recorte
   redondo.

3. Favicon 32 e badge da notificação: nesses tamanhos QUALQUER texto
   vira borrão. O favicon usa só o "P" do script, e o badge é uma
   silhueta branca em fundo transparente — o Android ignora as cores do
   badge e usa apenas o formato, então mandar a logomarca colorida ali
   produz um borrão cinza na barra de status.
"""

from pathlib import Path
from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
PUBLICO = RAIZ / "public"
ORIGEM = RAIZ / "assets" / "logo-pao-de-mel.png"

# Amostradas da própria logomarca — nunca escolhidas "no olho".
VERMELHO = (196, 0, 39)
AMARELO = (255, 249, 80)
CREME = (255, 255, 215)


def logo() -> Image.Image:
    """
    A logomarca com o fundo BRANCO removido.

    O arquivo de origem tem fundo branco sólido, e sobre o creme do ícone
    isso aparecia como um halo claro contornando a pílula — sujeira
    visível justamente nas bordas arredondadas, que são a parte da forma
    que carrega o reconhecimento nos tamanhos pequenos.

    O corte é só no branco puro (tolerância curta): o "PADARIA" da marca é
    creme (255,255,215), longe o bastante para não ser apagado junto.
    """
    marca = Image.open(ORIGEM).convert("RGBA")
    pixels = marca.load()
    largura, altura = marca.size
    for y in range(altura):
        for x in range(largura):
            r, g, b, a = pixels[x, y]
            if r > 243 and g > 243 and b > 243:
                pixels[x, y] = (r, g, b, 0)
    return marca


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
    """Logomarca centrada sobre creme, ocupando `ocupacao` da largura."""
    marca = logo()
    fundo = Image.new("RGBA", (tam, tam), CREME + (255,))
    largura = int(tam * ocupacao)
    altura = round(largura * marca.height / marca.width)
    reduzida = marca.resize((largura, altura), Image.LANCZOS)
    fundo.paste(reduzida, ((tam - largura) // 2, (tam - altura) // 2), reduzida)
    return cantos_arredondados(fundo) if arredondar else fundo


def favicon(tam: int = 32) -> Image.Image:
    """
    Só o "P" do script, sobre vermelho. Na aba do navegador o ícone tem
    16 a 32 px reais: a logomarca inteira ali é uma mancha, e uma letra
    do próprio alfabeto da marca continua reconhecível.
    """
    marca = logo()
    # Recorte do P dentro do script (coordenadas da pílula de origem).
    letra = marca.crop((120, 400, 780, 1130))
    fundo = Image.new("RGBA", (tam, tam), VERMELHO + (255,))
    altura = int(tam * 0.82)
    largura = round(altura * letra.width / letra.height)
    reduzida = letra.resize((largura, altura), Image.LANCZOS)
    fundo.paste(reduzida, ((tam - largura) // 2, (tam - altura) // 2), reduzida)
    return cantos_arredondados(fundo, 0.18)


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
