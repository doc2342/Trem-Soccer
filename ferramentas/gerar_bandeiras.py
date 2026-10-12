# -*- coding: utf-8 -*-
"""Gera src/bandeiras.js com as bandeiras do Dugout (20 x 20) das nacionalidades que existem no jogo.

Origem: ../FenomenoDOBR/bandeiras_selecao.json (código do Dugout -> imagem). País novo no jogo: acrescentar em PAISES e rodar de novo.
Uso: python ferramentas/gerar_bandeiras.py
"""
import io, json, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAISES = {"Brasil": "BRA", "Argentina": "ARG", "Uruguai": "URU", "Colômbia": "COL", "Chile": "CHI"}

imagens = json.load(io.open(os.path.join(RAIZ, "..", "FenomenoDOBR", "bandeiras_selecao.json"), encoding="utf-8"))
js = u"""// ARQUIVO GERADO por ferramentas/gerar_bandeiras.py: bandeiras do Dugout das nacionalidades do jogo.
const IMAGENS = %s;
// Bandeira do país como imagem (emoji de bandeira não aparece no Windows); país sem imagem sai como três letras.
export const bandeira = pais => IMAGENS[pais] ? `<img src="${IMAGENS[pais]}" alt="${pais}" title="${pais}" width="16" height="16" style="vertical-align:-3px">`
  : String(pais || "").slice(0, 3).toUpperCase().replace(/[<>&"]/g, "");
""" % json.dumps({p: imagens[c] for p, c in PAISES.items()}, ensure_ascii=False, indent=1)
io.open(os.path.join(RAIZ, "src", "bandeiras.js"), "w", encoding="utf-8", newline="\n").write(js)
print("bandeiras", len(PAISES))
