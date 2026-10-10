# -*- coding: utf-8 -*-
"""Copia a base de nomes por país do Manager DO-BR (../ManagerDOBR/dados.json) para dados/nomes.json.

Saída: {paises: {pais: {p: [primeiros nomes], s: [sobrenomes], peso, iso}}}
Uso:   python ferramentas/extrair_nomes.py
"""
import io, json, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(io.open(os.path.join(RAIZ, "..", "ManagerDOBR", "dados.json"), encoding="utf-8"))
# Pedidos da turma, somados à base do Brasil (só entram nas listas; o sorteio mistura nome e sobrenome).
EXTRAS = {
    "p": ["Hannyel", "Lincoln", "Joseph", "Neto"],
    "s": ["Candal", "Romberg", "Santaço", "Vencedor", "Colorado", "Boschilia", "Doka", "Mosconi", "Feliciano", "Vilhena", "Mingotti", "Curzel"],
}
for k, extras in EXTRAS.items():
    d["nomes"]["Brasil"][k] = d["nomes"]["Brasil"][k] + extras
paises = {}
for pais, n in d["nomes"].items():
    paises[pais] = {"p": sorted(set(n["p"])), "s": sorted(set(n["s"])), "peso": n["peso"], "iso": d["iso"].get(pais, "")}
with io.open(os.path.join(RAIZ, "dados", "nomes.json"), "w", encoding="utf-8") as f:
    json.dump({"paises": paises}, f, ensure_ascii=False, separators=(",", ":"))
print(len(paises), "países;", "Brasil:", len(paises["Brasil"]["p"]), "nomes e", len(paises["Brasil"]["s"]), "sobrenomes")
