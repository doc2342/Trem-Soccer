// Relatório na grade 5×5 (Tarefa 11): o relatório de um jogo da T1 grava as 25 zonas (T0: as 9), as telas que leem 9 zonas
// recebem a soma sem quebrar, o analista fala da grade ("zona 14", "meio-espaço", nunca "meia-lua") e o mapa de cada jogador
// (mapaDoJogador) mostra onde ele participou: o lateral Construtor joga mais pelo meio-espaço que o Fixo.
// node ferramentas/teste_relatorio_grade.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { montarRelatorio, mapaDoJogador } from "../src/relatorio.js";
import { leiturasDoVestiario } from "../src/leituras.js";
import { campoDeZonas } from "../src/ui-trem.js";
import { htmlRelatorio, htmlRelatorioNovo } from "../src/ui-relatorio.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = (f, s) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_" });
const comPapel = (esc, papeis) => esc.map(x => papeis[x.pos] ? { ...x, papel: papeis[x.pos] } : x);
const jogo = (a, b, s, regrasT1 = true) => {
  const registro = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b }), { registro, regrasT1 });
  return { p, registro };
};

// 1. 25 zonas na T1, 9 na T0
const t1 = jogo(onze("4-2-3-1", 1), onze("4-4-2", 2), 5), r1 = montarRelatorio(t1.p, [3, 3], t1.registro);
assert.equal(Object.keys(r1.zonas[0]).length, 25);
assert.equal(Object.keys(r1.estat[0].zonas).length, 25);
const t0 = jogo(onze("4-2-3-1", 1), onze("4-4-2", 2), 5, false), r0 = montarRelatorio(t0.p, [3, 3], t0.registro);
assert.equal(Object.keys(r0.zonas[0]).length, 9);
assert.ok(r0.jogadores.every(j => !j.mapa), "T0 sem mapa por jogador");

// 2. quem lê 9 zonas recebe a soma: vestiário, campo do vestiário e as duas telas do relatório
for (const nivel of [1, 2, 3]) assert.ok(Array.isArray(leiturasDoVestiario({ relatorio: r1, lado: 0, nivel, elenco: [] })));
assert.ok(leiturasDoVestiario({ relatorio: r1, lado: 0, nivel: 3, elenco: [] }).some(l => l.zona), "a leitura de zona sai num jogo da grade");
assert.match(campoDeZonas(r1.estat[0].zonas, r1.estat[1].zonas), /\d+%/);
for (const html of [htmlRelatorio(r1), htmlRelatorioNovo(r1), htmlRelatorio(r0), htmlRelatorioNovo(r0)]) assert.ok(!/NaN|undefined/.test(html), "relatório sem NaN/undefined");
assert.match(htmlRelatorio(r1), /g5-campo/); assert.doesNotMatch(htmlRelatorio(r0), /g5-campo/);
assert.match(htmlRelatorio(r1), /g5-calor/);

// 3. analista: fala da grade em pelo menos um de 50 jogos, nunca "meia-lua"
let citou = 0;
for (let s = 1; s <= 50; s++) {
  const fs = Object.keys(FORMACOES), { p } = jogo(onze(fs[s % fs.length], s), onze(fs[(s * 7) % fs.length], s + 300), s);
  const texto = montarRelatorio(p, [3, 3]).analise.flat().join(" ");
  assert.doesNotMatch(texto, /meia-lua/);
  if (/meio-espaço|zona 14/.test(texto)) citou++;
}
assert.ok(citou >= 1, "o analista nunca citou meio-espaço nem zona 14");

// 4. mapa do jogador: soma os passos em que ele aparece; Construtor mais pelo meio-espaço que o Fixo (mesmos jogos)
const meioEspaco = [0, 0], total = [0, 0];
for (let s = 1; s <= 30; s++) {
  const a = comPapel(onze("4-2-3-1", 40 + s), { DR: "construtor", DL: "fixo" }), { p, registro } = jogo(a, onze("4-4-2", 80 + s), s);
  const r = montarRelatorio(p, [3, 3], registro);
  ["DR", "DL"].forEach((pos, k) => {
    const id = a.find(x => x.pos === pos).j.id, m = mapaDoJogador(registro, id, 0, pos), soma = o => Object.values(o).reduce((x, y) => x + y, 0);
    const passos = registro.filter(x => x[1] !== "fim");
    assert.equal(soma(m.com), passos.filter(x => x[0] === 0 && x[4] === id).length + passos.filter(x => x[0] === 0 && x[5] === id).length);
    assert.equal(soma(m.sem), passos.filter(x => x[0] === 1 && x[9] === id).length);
    assert.ok(m.lado >= 0);
    const j = r.jogadores.find(x => x.id === id);
    assert.deepEqual(j.mapa.com, m.com); assert.ok(j.mancha && j.mancha.com, "mancha do papel no relatório");
    meioEspaco[k] += (m.com["1d"] || 0) + (m.com["2d"] || 0) + (m.com["3d"] || 0) + (m.com["1e"] || 0) + (m.com["2e"] || 0) + (m.com["3e"] || 0);
    total[k] += soma(m.com);
  });
}
const fr = meioEspaco.map((v, k) => v / total[k]);
assert.ok(fr[0] > fr[1], `Construtor ${(fr[0] * 100).toFixed(0)}% no meio-espaço, Fixo ${(fr[1] * 100).toFixed(0)}%`);
console.log(`teste_relatorio_grade: ok (analista citou a grade em ${citou}/50; meio-espaço com a bola: Construtor ${(fr[0] * 100).toFixed(0)}%, Fixo ${(fr[1] * 100).toFixed(0)}%)`);
