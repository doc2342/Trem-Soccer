// Valor de cada posição: um titular +6 em todos os atributos, o mesmo onze contra ele mesmo, mando alternado; quanto o saldo de xG por jogo muda.
// Meta aprovada em 29/10 (plano dos papéis, Calibragem geral): defesa e volante valendo cerca de 70% do ataque.
// Mede o xG e não os gols: o xG publicado já é a chance de gol (com quem chuta e o goleiro), então a média é a mesma e o ruído é bem menor
// (com 8.000 jogos, ±0,01 em vez de ±0,02). Cada jogo roda com a mesma semente com e sem o reforço; "pró" é o que o time cria a mais, "contra" o que deixa de sofrer.
// Medido em 30/10 (4-2-3-1, T1, 8.000 jogos): SC 0,165, AML 0,211, AMC 0,157, DMC 0,124, DL 0,121, DC 0,078 — volante e lateral perto de 2/3 do ataque,
// o zagueiro em 40%. O atacante ganha ~3/4 do valor na finalização (os atributos dele fazem o xG e o chute contra o goleiro); o zagueiro só tem o duelo do
// centro (e o ataque foge para os lados quando o centro fica forte) e o sorteio de "zagueiro" da chance, entre todos que cobrem o DC.
// Uso: node ferramentas/sim_valor_posicao.mjs [jogos por posição] [formação] — mostra a temporada 0 (sem as regras da T1) e a T1 lado a lado
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";

const N = +process.argv[2] || 2000, formacao = process.argv[3] || "4-2-3-1", B = 6;
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const vagas = FORMACOES[formacao];
const onzes = Array.from({ length: 40 }, (_, s) => ["a", "b"].map(p => gerarOnze(criarRng(5000 + s), vagas, { nivel: 30, nomes, prefixoId: p + s + "_" })));
// xG [do time A, do B] no jogo n
const jogo = (n, a, b, regrasT1) => {
  const ta = prepararTime({ nome: "A", escalacao: a }), tb = prepararTime({ nome: "B", escalacao: b }), casa = n % 2 === 0;
  const { xg } = casa ? simularPartida(criarRng(77 + n), ta, tb, { regrasT1 }) : simularPartida(criarRng(77 + n), tb, ta, { regrasT1 });
  return casa ? xg : [xg[1], xg[0]];
};
const base = [false, true].map(t1 => Array.from({ length: N }, (_, n) => jogo(n, ...onzes[n % 40], t1)));
// [saldo, pró, contra] a mais por jogo com o titular k reforçado
const valor = (k, t1) => {
  let pro = 0, contra = 0;
  for (let n = 0; n < N; n++) {
    const [a, b] = onzes[n % 40], forte = a.map((x, i) => i === k ? { ...x, j: { ...x.j, at: x.j.at.map(v => Math.min(50, v + B)) } } : x);
    const [f, c] = jogo(n, forte, b, t1), [f0, c0] = base[+t1][n];
    pro += f - f0; contra += c0 - c;
  }
  return [(pro + contra) / N, pro / N, contra / N];
};
console.log(`${formacao}, ${N} jogos por posição: saldo de xG a mais por jogo com o titular +${B} em tudo (pró / contra)`);
console.log("posição  T0                    T1");
const linhas = vagas.map((pos, k) => pos === "GK" ? null : [pos, valor(k, false), valor(k, true)]).filter(Boolean);
const fmt = ([s, p, c]) => `${s.toFixed(3)} (${p.toFixed(3)}/${c.toFixed(3)})`;
for (const [pos, a, b] of linhas) console.log(pos.padEnd(9) + fmt(a).padEnd(22) + fmt(b));
const media = (l, i) => l.reduce((s, x) => s + x[i][0], 0) / l.length;
const grupo = ps => linhas.filter(l => ps.includes(l[0]));
const ataque = grupo(["SC", "FC", "RW", "LW", "AMR", "AML"]), defesa = grupo(["DC", "DR", "DL", "WBR", "WBL", "SW"]), volante = grupo(["DMC"]), zagueiro = grupo(["DC", "SW"]);
for (const [nome, g] of [["defesa", defesa], ["zagueiro", zagueiro], ["volante", volante]]) if (g.length && ataque.length)
  console.log(`${nome} / ataque: T0 ${(100 * media(g, 1) / media(ataque, 1)).toFixed(0)}%  T1 ${(100 * media(g, 2) / media(ataque, 2)).toFixed(0)}%`);
