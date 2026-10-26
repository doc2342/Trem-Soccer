# -*- coding: utf-8 -*-
"""Troca os nomes do Brasil no dados/nomes.json pelos da planilha ferramentas/nomes_com_pesos.xlsx (com acentos e pesos).

Saída do Brasil: p/s (nomes e sobrenomes), pp/ps (pesos paralelos), a/pa (apelidos e pesos), mais peso e iso de antes.
Sobrenome de peso 0 (partícula: de, da, dos...) não entra. Os outros países ficam como estão.
Uso:   python ferramentas/importar_nomes.py
"""
import io, json, os, unicodedata
import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = os.path.join(RAIZ, "dados", "nomes.json")
# Pedidos da turma (os mesmos do extrair_nomes.py), com peso de "menos comum"
EXTRAS = {
    "p": ["Hannyel", "Lincoln", "Joseph", "Neto"],
    "s": ["Candal", "Romberg", "Santaço", "Vencedor", "Colorado", "Boschilia", "Doka", "Mosconi", "Feliciano", "Vilhena", "Mingotti", "Curzel"],
}
PESO_DOS_EXTRAS = 1.5

def chave(t):
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn").lower().strip()

def aba(wb, nome):
    itens, vistos = [], set()
    for linha in list(wb[nome].iter_rows(values_only=True))[1:]:
        texto, peso = linha[0], linha[2]
        if not texto or peso is None or float(peso) <= 0 or chave(str(texto)) in vistos: continue
        vistos.add(chave(str(texto))); itens.append((str(texto).strip(), float(peso)))
    return itens

wb = openpyxl.load_workbook(os.path.join(RAIZ, "ferramentas", "nomes_com_pesos.xlsx"), read_only=True)
listas = {"p": aba(wb, "Nomes"), "s": aba(wb, "Sobrenomes"), "a": aba(wb, "Apelidos")}
for k, extras in EXTRAS.items():
    tem = {chave(t) for t, _ in listas[k]}
    listas[k] += [(t, PESO_DOS_EXTRAS) for t in extras if chave(t) not in tem]

d = json.load(io.open(ARQ, encoding="utf-8"))
br = d["paises"]["Brasil"]
for k, peso in (("p", "pp"), ("s", "ps"), ("a", "pa")):
    itens = sorted(listas[k], key=lambda x: chave(x[0]))
    br[k] = [t for t, _ in itens]
    br[peso] = [p if p != int(p) else int(p) for _, p in itens]
with io.open(ARQ, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
print("Brasil:", len(br["p"]), "nomes,", len(br["s"]), "sobrenomes e", len(br["a"]), "apelidos")
