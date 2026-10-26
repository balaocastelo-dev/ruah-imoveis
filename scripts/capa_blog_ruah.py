# -*- coding: utf-8 -*-
"""
Foto de capa do blog da RUAH ("Sopro"), feita na RTX 4090 do PC, sem serviço pago.

Reaproveita o gerador do blog da Balão, que já está instalado e testado no PC:
  C:\\Users\\user\\balao-content-factory\\publisher\\capa_blog.py
(Flux no ComfyUI local + conferência por um modelo de visão do Ollama, que lista
texto, marca, rosto e defeito; só passa foto com todas as listas vazias.)

Este arquivo só troca o que é da RUAH:
  - a fila: capas/pendentes.json no ramo claude/blog-conteudo do ruah-imoveis;
  - o repositório onde a foto é presa ao artigo (node scripts/blog-publicar.mjs capa);
  - o reforço do pedido: fotografia de arquitetura e interiores, sem gente, sem placa;
  - as cenas de reserva: sala clara vazia e detalhe de arquitetura;
  - registro e estado próprios (logs\\capa_blog_ruah.log, data\\capas_blog_ruah.json).

Tudo o mais é o mesmo do Balão: espera a placa ficar livre (URA, JUL.IA e os
outros programas de placa têm prioridade), nunca publica sem foto aprovada e
nunca tira o pedido da fila sem foto.

  python capa_blog_ruah.py                 faz o que estiver na fila
  python capa_blog_ruah.py --ver           só mostra a fila
  python capa_blog_ruah.py --sem-publicar  gera e confere, mas não prende ao artigo
  python capa_blog_ruah.py --teste saida.jpg "pedido em inglês"
  python capa_blog_ruah.py --conferir foto.jpg "a cena em inglês"

Instalação da tarefa (22h40 e 4h40): scripts\\instalar_tarefa_capa_ruah.ps1.
Escrito em 26/10/2026 (Claude, projeto MEU KENLO / Sistema RUAH).
"""
import os, sys, time
from pathlib import Path

FABRICA = Path(os.environ.get("BALAO_FABRICA", r"C:\Users\user\balao-content-factory\publisher"))
sys.path.insert(0, str(FABRICA))
import capa_blog as c  # noqa: E402  (o gerador do Balão)

RUAH = "capa_blog_ruah.py"
c.FILA = "https://raw.githubusercontent.com/balaocastelo-dev/ruah-imoveis/refs/heads/claude/blog-conteudo/capas/pendentes.json"
c.REPO_URL = "https://github.com/balaocastelo-dev/ruah-imoveis.git"
c.REPO = Path(os.environ.get("BLOG_REPO_RUAH", str(c.RAIZ / "_blog_repo_ruah")))
c.LOG = c.RAIZ / "logs" / "capa_blog_ruah.log"
c.ESTADO = c.RAIZ / "data" / "capas_blog_ruah.json"
c.SAIDA = c.RAIZ / "data" / "capas_blog_ruah"
if RUAH not in c.OCUPANTES:
    c.OCUPANTES.append(RUAH)

# O que vai junto de todo pedido: fotografia de arquitetura, sem gente e sem escrita.
c.SEMPRE = (" Realistic architectural and interior design photography, landscape 16:9, natural light,"
            " shallow depth of field. No people, no human figures, no faces, no hands. No text, no letters,"
            " no numbers, no house numbers, no signs, no logos, no brand names, no watermark.")
# No lugar do reforço anti-MacBook do Balão: móvel e objeto genéricos, nada que pareça peça famosa.
c.SEM_CARA_DE_APPLE = (" Furniture, fixtures and objects are generic and unbranded, not recognizable designer"
                       " pieces; any TV or screen is switched off; any book or artwork has no readable writing.")
c.NAO_APPLE = ""   # sem a pergunta de Apple na conferência

RESERVA_SALA = ("An empty bright living room with light oak wooden floor, white walls and a large window with"
                " sheer linen curtains, a low beige sofa and a single green plant in a ceramic pot, soft morning"
                " daylight, wide-angle interior photography, eye level.",
                "Sala de estar clara com piso de madeira, sofá baixo bege, uma planta e uma grande janela com cortina leve")
RESERVA_DETALHE = ("Architectural detail of a modern house: a smooth concrete wall, a wooden slatted panel and the"
                   " shadow of leaves cast by warm late-afternoon sunlight, minimalist composition.",
                   "Detalhe de arquitetura: parede de concreto, painel de ripas de madeira e sombra de folhas ao sol da tarde")
c.reservas = lambda categoria: [RESERVA_SALA, RESERVA_DETALHE]


def esperar_placa():
    """Como a do Balão, mas a rodada do Balão (capa_blog.py) não faz esta sair: ela espera a vez."""
    fim = time.time() + c.ESPERA_DA_PLACA_MIN * 60
    avisado = None
    while True:
        quem = c.placa_ocupada()
        if not quem:
            return True
        if quem == RUAH:
            c.log("já há outra rodada da RUAH em andamento: saindo")
            return False
        if time.time() > fim:
            c.log(f"placa ocupada por {quem} há {c.ESPERA_DA_PLACA_MIN} min: fica para a próxima rodada")
            return False
        if quem != avisado:
            c.log(f"placa ocupada ({quem}): esperando")
            avisado = quem
        time.sleep(60)


c.esperar_placa = esperar_placa

if __name__ == "__main__":
    try:
        c.main()
    except Exception as erro:
        c.log(f"ERRO: {erro}")
        sys.exit(1)
