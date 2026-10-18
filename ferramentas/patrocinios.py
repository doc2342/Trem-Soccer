"""Gera os selos 256x256 dos patrocinadores em patrocinios/.

Uso: python ferramentas/patrocinios.py <pasta com as imagens originais>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

SAIDA = Path(__file__).resolve().parent.parent / 'patrocinios'


def quadrado(im):
    """Encaixa num 256x256 transparente, preservando proporção."""
    im = im.convert('RGBA')
    im = im.crop(im.getbbox())
    im.thumbnail((240, 240), Image.LANCZOS)
    out = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    out.alpha_composite(im, ((256 - im.width) // 2, (256 - im.height) // 2))
    return out


def sem_fundo_branco(im, tol=60):
    """Apaga só o branco ligado às bordas; o branco dentro do desenho fica."""
    im = im.convert('RGBA')
    w, h = im.size
    for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if im.getpixel(xy)[3]:
            ImageDraw.floodfill(im, xy, (0, 0, 0, 0), thresh=tol)
    return im


def em_disco(im, cor=(244, 239, 230, 255)):
    out = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    ImageDraw.Draw(out).ellipse((4, 4, 251, 251), fill=cor)
    im.thumbnail((170, 170), Image.LANCZOS)
    out.alpha_composite(im, ((256 - im.width) // 2, (256 - im.height) // 2))
    return out


def cantos(im, raio=36):
    im = im.convert('RGBA').resize((256, 256), Image.LANCZOS)
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, 255, 255), raio, fill=255)
    im.putalpha(m)
    return im


def circulo(im, cx, cy, r):
    im = im.convert('RGBA').crop((cx - r, cy - r, cx + r, cy + r))
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
    im.putalpha(m)
    return quadrado(im)


if __name__ == '__main__':
    src = Path(sys.argv[1])
    SAIDA.mkdir(exist_ok=True)
    abre = lambda nome: Image.open(src / nome)
    selos = {
        'grupo_trem': em_disco(quadrado(sem_fundo_branco(abre('grupo_trem.png')))),
        'gazeta_dugoutense': cantos(abre('gazeta.jpg')),
        'central_do_mercado': circulo(abre('central_mercado.jpg'), 320, 320, 312),
        'dugout_dos_crias': cantos(abre('dugout_crias.jpg').crop((90, 80, 550, 540))),
        'dobet': cantos(abre('dobet.webp')),
        'podcast_10min': quadrado(sem_fundo_branco(abre('podcast.webp'))),
        'central_do_dobr': quadrado(sem_fundo_branco(abre('central_dobr.webp'))),
        'mestres_do_dugout': quadrado(sem_fundo_branco(abre('mestres_do_dugout.webp'))),
    }
    for nome, im in selos.items():
        im.save(SAIDA / f'{nome}.png')
    print('ok:', sorted(selos))
