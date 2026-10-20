// gera previa.html com as referências recriadas: node prototipos/camisa_v2/gerar.mjs
import { svgCamisa } from "./camisa.js";
import { svgEscudo } from "../../../src/escudo.js";
import fs from "fs";
const esc = (e, s) => svgEscudo(e, s, 1).replace('width="1" height="1"', 'width="24" height="24"');
const pat = n => new URL(`../../../patrocinios/${n}.png`, import.meta.url).href;
const K = [
  ["Trem Fantasma", { padrao: "metade", cor1: "#c8102e", cor2: "#0b3d91", gola: "#0b3d91", calcao: "#ffffff", meiao: "#ffd100", marca: pat("grupo_trem_camisa_claro") }, { padrao: "metade", cor1: "#c8102e", cor2: "#0b3d91" }, "TRE"],
  ["Chicago (faixa no peito)", { padrao: "faixa", cor1: "#e4002b", cor2: "#ffffff", gola: "#e4002b", cor3: null, calcao: "#e4002b" }, { forma: "circulo", cor1: "#3aa7e0", cor2: "#ffffff" }, "CHI"],
  ["Atlético-MG (listras)", { padrao: "listras", cor1: "#ffffff", cor2: "#111111", gola: "#111111", golaTipo: "v", calcao: "#111111" }, { cor1: "#111111", cor2: "#ffffff" }, "CAM"],
  ["Flamengo (horizontais)", { padrao: "horizontais", cor1: "#111111", cor2: "#c8102e", gola: "#c8102e", calcao: "#ffffff" }, { cor1: "#c8102e", cor2: "#111111", padrao: "horizontais" }, "CRF"],
  ["Vasco (diagonal)", { padrao: "diagonal", cor1: "#111111", cor2: "#ffffff", gola: "#ffffff", calcao: "#111111" }, { cor1: "#ffffff", cor2: "#111111" }, "VAS"],
  ["PSG (faixa vertical + filete)", { padrao: "faixaV", cor1: "#1e5bc6", cor2: "#e4002b", cor3: "#ffffff", gola: "#1e5bc6", calcao: "#0b3d91" }, { forma: "circulo", cor1: "#0b3d91", cor2: "#e4002b" }, "PSG"],
  ["São Paulo (faixa de 3 cores)", { padrao: "faixa", cor1: "#ffffff", cor2: "#c8102e", cor3: "#111111", gola: "#c8102e", calcao: "#ffffff", golaTipo: "polo" }, { cor1: "#ffffff", cor2: "#c8102e" }, "SPF"],
  ["Alemanha (chevron 3 cores)", { padrao: "chevron", cor1: "#ffffff", cor2: "#111111", cor3: "#c8102e", gola: "#111111", golaTipo: "v", calcao: "#111111" }, { cor1: "#ffd100", cor2: "#111111" }, "GER"],
  ["Barça fora (cruz)", { padrao: "cruz", cor1: "#f3e5c0", cor2: "#7b1e24", gola: "#0b3d91", golaTipo: "v", calcao: "#0b3d91" }, { cor1: "#0b3d91", cor2: "#7b1e24", padrao: "listras" }, "FCB"],
  ["Croácia (xadrez)", { padrao: "xadrez", cor1: "#ffffff", cor2: "#e4002b", gola: "#0b3d91", calcao: "#ffffff" }, { cor1: "#e4002b", cor2: "#ffffff", padrao: "xadrez" }, "CRO"],
  ["Leipzig (laterais)", { padrao: "laterais", cor1: "#ffffff", cor2: "#e4002b", gola: "#e4002b", calcao: "#ffffff" }, { cor1: "#ffffff", cor2: "#e4002b" }, "RBL"],
  ["Galatasaray (mangas cruzadas)", { padrao: "metadeCruzada", cor1: "#f2a900", cor2: "#c8102e", gola: "#c8102e", calcao: "#c8102e" }, { forma: "circulo", cor1: "#c8102e", cor2: "#f2a900" }, "GS"],
  ["Athletico (diagonais)", { padrao: "diagonais", cor1: "#111111", cor2: "#e4002b", gola: "#111111", calcao: "#111111" }, { cor1: "#111111", cor2: "#e4002b" }, "CAP"],
  ["Leipzig 2 (listras finas)", { padrao: "listrasFinas", cor1: "#ffffff", cor2: "#e4002b", gola: "#e4002b", calcao: "#ffffff" }, { cor1: "#ffffff", cor2: "#e4002b" }, "RBL"],
];
const cards = K.map(([n, u, e, s]) => `<figure>${svgCamisa({ ...u, escudo: esc(e, s) }, 210)}<figcaption>${n}</figcaption></figure>`).join("");
const pequenos = K.map(([n, u, e, s]) => svgCamisa({ ...u, escudo: esc(e, s) }, 34, true)).join("");
const medios = K.slice(0, 6).map(([n, u, e, s]) => svgCamisa({ ...u, escudo: esc(e, s) }, 110, true)).join("");
fs.writeFileSync(new URL("previa.html", import.meta.url), `<!doctype html><meta charset="utf-8"><title>Camisa v2</title>
<style>body{background:#eef1f6;font:13px system-ui;margin:16px}.g{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}figure{margin:0;background:#fff;border-radius:10px;padding:8px;text-align:center}figcaption{margin-top:4px;color:#334}.l{background:#fff;border-radius:10px;padding:10px;margin-top:10px;display:flex;gap:10px;align-items:end;flex-wrap:wrap}</style>
<div class="g">${cards}</div><div class="l">${medios}</div><div class="l">${pequenos}</div>`);
