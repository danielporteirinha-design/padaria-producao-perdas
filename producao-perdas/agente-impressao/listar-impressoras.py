"""
Mostra o nome EXATO de cada impressora instalada no Windows.

Serve so' para preencher o campo 'nome' do config.ini sem errar: o nome
precisa bater caractere por caractere, e o que aparece no Painel de
Controle as vezes tem espaco a mais ou acento que passa despercebido.

Rode com dois cliques ou: python listar-impressoras.py
"""

try:
    import win32print
except ImportError:
    raise SystemExit("Falta a biblioteca 'pywin32'. Rode antes o instalar.bat")

print()
print("Impressoras instaladas neste PC:")
print("-" * 50)
for impressora in win32print.EnumPrinters(
    win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
):
    print(f"  {impressora[2]}")
print("-" * 50)
print()
print("Copie o nome da termica exatamente como esta' acima")
print("para o campo 'nome' do config.ini.")
print()
input("Pressione Enter para fechar...")
