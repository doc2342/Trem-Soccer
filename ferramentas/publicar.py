# -*- coding: utf-8 -*-
"""Marca uma versão nova do site: grava versao.txt com a data e a hora.

As páginas comparam esse arquivo com o que guardaram na última visita; se mudou, baixam tudo de novo.
"Tudo" é a lista ARQUIVOS do atualiza.js, que este script refaz a cada vez (páginas e folhas de estilo da raiz e src/*.js):
um módulo novo que ficasse fora da lista seguiria velho no cache do celular, misturado com páginas novas.
Uso: python ferramentas/publicar.py   (antes de cada git commit que vai ao ar)
"""
import datetime, glob, io, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
versao = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
io.open(os.path.join(RAIZ, "versao.txt"), "w", encoding="utf-8", newline="\n").write(versao + "\n")

caminho = os.path.join(RAIZ, "atualiza.js")
arquivos = ["atualiza.js"] + sorted(os.path.basename(f) for f in glob.glob(os.path.join(RAIZ, "*.css"))) + sorted(os.path.basename(f) for f in glob.glob(os.path.join(RAIZ, "*.html"))) \
    + sorted("src/" + os.path.basename(f) for f in glob.glob(os.path.join(RAIZ, "src", "*.js")))
js = io.open(caminho, encoding="utf-8").read()
novo, n = re.subn(r"var ARQUIVOS = \[[^\]]*\];", "var ARQUIVOS = [" + ", ".join('"%s"' % a for a in arquivos) + "];", js)
assert n == 1, "não achei a lista ARQUIVOS no atualiza.js"
io.open(caminho, "w", encoding="utf-8", newline="").write(novo)
print("versao", versao, "·", len(arquivos), "arquivos na lista do atualiza.js")
