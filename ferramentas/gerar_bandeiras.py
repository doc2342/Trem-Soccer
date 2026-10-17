# -*- coding: utf-8 -*-
"""Gera src/bandeiras.js com as bandeiras do Dugout (20 x 20) das nacionalidades que existem no jogo.

Origem: ../FenomenoDOBR/bandeiras_selecao.json (código do Dugout -> imagem). País novo no jogo: acrescentar em PAISES e rodar de novo.
Uso: python ferramentas/gerar_bandeiras.py
"""
import io, json, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAISES = {"Brasil": "BRA", "Argentina": "ARG", "Uruguai": "URU", "Colômbia": "COL", "Chile": "CHI"}

imagens = json.load(io.open(os.path.join(RAIZ, "..", "FenomenoDOBR", "bandeiras_selecao.json"), encoding="utf-8"))
# Bandeiras retangulares (3:2) desenhadas à mão, como no painel do Candal; país sem desenho cai na redonda do Dugout.
ESTRELA = '<polygon points="0,-3 0.9,-0.9 3,-0.9 1.3,0.4 1.9,2.5 0,1.2 -1.9,2.5 -1.3,0.4 -3,-0.9 -0.9,-0.9" fill="#fff"/>'
RETANGULARES = {
    "Brasil": '<rect width="30" height="20" fill="#009b3a"/><polygon points="15,2.5 27,10 15,17.5 3,10" fill="#fedf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/>',
    "Argentina": '<rect width="30" height="20" fill="#74acdf"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><circle cx="15" cy="10" r="1.8" fill="#f6b40e"/>',
    "Uruguai": '<rect width="30" height="20" fill="#fff"/>' + "".join('<rect y="%.2f" width="30" height="2.22" fill="#0038a8"/>' % (2.22 * k) for k in (1, 3, 5, 7)) + '<rect width="13" height="11.1" fill="#fff"/><circle cx="6.5" cy="5.5" r="3" fill="#fcd116"/>',
    "Colômbia": '<rect width="30" height="20" fill="#ce1126"/><rect width="30" height="15" fill="#003893"/><rect width="30" height="10" fill="#fcd116"/>',
    "Chile": '<rect width="30" height="20" fill="#d52b1e"/><rect width="30" height="10" fill="#fff"/><rect width="10" height="10" fill="#0039a6"/><g transform="translate(5 5) scale(1.1)">' + ESTRELA + '</g>',
}
js = u"""// ARQUIVO GERADO por ferramentas/gerar_bandeiras.py: bandeiras das nacionalidades do jogo.
const IMAGENS = %s;
const RETANGULARES = %s;
// Bandeira do país: retangular (SVG) quando há desenho, senão a redonda do Dugout; país sem nenhuma sai como três letras.
export const bandeira = pais => RETANGULARES[pais] ? `<svg class="bnd" viewBox="0 0 30 20" width="21" height="14" role="img" aria-label="${pais}"><title>${pais}</title>${RETANGULARES[pais]}</svg>`
  : IMAGENS[pais] ? `<img src="${IMAGENS[pais]}" alt="${pais}" title="${pais}" width="16" height="16" style="vertical-align:-3px">`
  : String(pais || "").slice(0, 3).toUpperCase().replace(/[<>&"]/g, "");
""" % (json.dumps({p: imagens[c] for p, c in PAISES.items()}, ensure_ascii=False, indent=1), json.dumps(RETANGULARES, ensure_ascii=False, indent=1))
io.open(os.path.join(RAIZ, "src", "bandeiras.js"), "w", encoding="utf-8", newline="\n").write(js)
print("bandeiras", len(PAISES))
