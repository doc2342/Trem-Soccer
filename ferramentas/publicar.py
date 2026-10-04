# -*- coding: utf-8 -*-
"""Marca uma versão nova do site: grava versao.txt com a data e a hora.

As páginas comparam esse arquivo com o que guardaram na última visita; se mudou, baixam tudo de novo.
Uso: python ferramentas/publicar.py   (antes de cada git commit que vai ao ar)
"""
import datetime, io, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
versao = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
io.open(os.path.join(RAIZ, "versao.txt"), "w", encoding="utf-8", newline="\n").write(versao + "\n")
print("versao", versao)
