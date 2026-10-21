// gera previa.html: frente e costas de alguns uniformes e o aviso de gol com a camisa de costas: node prototipos/camisa_costas/gerar.mjs
import { svgUniforme, svgSoCamisa, svgCostas } from "../../src/escudo.js";
import fs from "fs";
const K = [
  ["Trem Fantasma", { padrao: "metade", cor1: "#c8102e", cor2: "#0b3d91", gola: "#0b3d91", calcao: "#ffffff", meiao: "#ffd100", textura: "tom", marca: "grupo_trem" }, { padrao: "metade", cor1: "#c8102e", cor2: "#0b3d91" }, "TRE", "Damião", 9],
  ["Marotos da Gama", { padrao: "listras", cor1: "#111111", cor2: "#f2c14e", gola: "#f2c14e", calcao: "#111111", meiao: "#111111" }, { cor1: "#111111", cor2: "#f2c14e" }, "MAR", "Kaká Júnior", 10],
  ["Chicago", { padrao: "faixa", cor1: "#e4002b", cor2: "#ffffff", gola: "#e4002b", calcao: "#e4002b", textura: "risca" }, { forma: "circulo", cor1: "#3aa7e0", cor2: "#ffffff" }, "CHI", "Souza", 7],
  ["Croácia", { padrao: "xadrez", cor1: "#ffffff", cor2: "#e4002b", gola: "#0b3d91", calcao: "#ffffff" }, { cor1: "#e4002b", cor2: "#ffffff", padrao: "xadrez" }, "CRO", "Modrić", 10],
  ["Vasco", { padrao: "diagonal", cor1: "#111111", cor2: "#ffffff", gola: "#ffffff", calcao: "#111111", golaTipo: "polo" }, { cor1: "#ffffff", cor2: "#111111" }, "VAS", "Vegetti", 99],
  ["Bayern", { padrao: "liso", cor1: "#c8102e", gola: "#ffffff", friso: "tres", calcao: "#c8102e", textura: "tom" }, { forma: "circulo", cor1: "#0b3d91", cor2: "#ffffff" }, "FCB", "Müller", 25],
];
const par = K.map(([n, u, e, s, nome, num]) => `<figure>${svgSoCamisa({ ...u, escudo: e, sigla: s }, 170)}${svgCostas(u, nome, num, 170)}<figcaption>${n}</figcaption></figure>`).join("");
const gol = ([n, u, e, s, nome, num], min) => { const c1 = u.cor1, c2 = u.cor2 || "#ffffff";
  return `<div class="gol" style="--c1:${c1};--c2:${c2}"><div class="camisa">${svgCostas(u, nome, num, 150)}</div><div><h3>Gooool!</h3><div class="quem"><b>${nome}</b> · ${min}' · ${n}</div></div></div>`; };
fs.writeFileSync(new URL("previa.html", import.meta.url), `<!doctype html><meta charset="utf-8"><title>Camisa de costas</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;600&display=swap">
<style>body{background:#eef1f6;font:13px Barlow,system-ui;margin:16px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}figure{margin:0;background:#fff;border-radius:10px;padding:8px;text-align:center}figcaption{color:#334;margin-top:2px}
.gols{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:12px}
.gol{display:flex;align-items:center;justify-content:center;gap:22px;padding:14px;border-radius:14px;background:linear-gradient(120deg,var(--c1) 0 55%,var(--c2) 55% 100%);color:#fff}
.gol .camisa{filter:drop-shadow(0 8px 14px rgba(0,0,0,.35))} .gol h3{font-family:'Barlow Condensed';font-size:58px;line-height:.9;margin:0;text-transform:uppercase;text-shadow:0 2px 6px rgba(0,0,0,.45)}
.gol .quem{display:inline-block;margin-top:6px;padding:4px 10px;border-radius:99px;background:rgba(0,0,0,.45);font-size:16px}</style>
<div class="g">${par}</div><div class="gols">${gol(K[0], 23)}${gol(K[1], 67)}</div>`);
