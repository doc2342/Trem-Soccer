// Tarefa 9d da grade 5×5: rebote do goleiro e da trave, gol contra e gol olímpico.
// Uso: node ferramentas/teste_rebote_gol_contra.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = s => gerarOnze(criarRng(s), FORMACOES["4-4-2"], { nivel: 30, nomes, prefixoId: "p" + s + "_" });
const comEncaixe = (l, v) => l.map(x => x.pos === "GK" ? { ...x, j: { ...x.j, at: x.j.at.map((a, k) => k === IDX.enc ? v : a) } } : x);
function jogar(N, mexe = l => l) {
  const t = { gols: 0, reb: 0, rebGols: 0, proprios: 0, contra: 0, ol: 0, chutes: 0, textos: [], fins: [] };
  for (let n = 0; n < N; n++) {
    const a = prepararTime({ nome: "A", escalacao: onze(100 + n), instrucoes: {} }), b = prepararTime({ nome: "B", escalacao: mexe(onze(500 + n)), instrucoes: {} });
    const p = simularPartida(criarRng(n), a, b);
    for (const i of [0, 1]) {
      const g = p.estat[i].grade; t.reb += g.rebotes[0]; t.rebGols += g.rebotes[1]; t.contra += g.golsContra; t.ol += g.olimpicos;
      // o placar é a soma dos lances de gol do time
      assert.strictEqual(p.lances.filter(l => l.time === i && l.resultado === "gol").length, p.placar[i], "placar × lances");
    }
    t.gols += p.placar[0] + p.placar[1]; t.chutes += p.estat[0].finalizacoes + p.estat[1].finalizacoes;
    for (const l of p.lances) {
      assert.ok(Number.isFinite(l.xg), `xG do lance ${l.tipo}`);
      if (l.tipo === "rebote" && l.criador === l.finalizador) t.proprios++;
      if (l.tipo === "rebote" && l.resultado === "gol" && l.criador === l.finalizador) assert.strictEqual(l.assist, null, "quem pega o próprio rebote não dá assistência");
      if (l.tipo === "golcontra") {
        assert.notStrictEqual(p.jogadores[l.finalizador].time, l.time, "gol contra é de quem defende");
        assert.strictEqual(l.assist, null, "gol contra não tem assistência");
        assert.ok(p.jogadores[l.finalizador].golsContra >= 1);
        assert.ok(/\(contra\)/.test(l.quem));
      }
      if (l.tipo === "olimpico") assert.strictEqual(p.jogadores[l.finalizador].time, l.time);
      t.fins.push(l);
    }
    t.textos.push(...p.narracao.map(l => l.texto));
    // a artilharia só conta os gols de verdade
    const noPlacar = Object.values(p.jogadores).reduce((s, j) => s + j.gols, 0) + p.lances.filter(l => l.tipo === "golcontra").length;
    assert.strictEqual(noPlacar, p.placar[0] + p.placar[1], "gols dos jogadores + gols contra = placar");
  }
  return t;
}

const N = 500, base = jogar(N), tem = (t, re) => t.textos.some(x => re.test(x));
// rebote: The Athletic, Premier League desde 2013/14: 1,4% dos chutes, 1 a cada 2–3 jogos, 1 em 4 vira gol, 1 em 4 gols é do próprio chutador
assert.ok(base.reb / N > 0.2 && base.reb / N < 0.7, `rebotes por jogo ${base.reb / N}`);
const conv = base.rebGols / base.reb;
assert.ok(conv > 0.15 && conv < 0.35, `conversão do rebote ${conv}`);
assert.ok(base.proprios > 0, "o chutador pega o próprio rebote");
assert.ok(tem(base, /solta/), "narração do rebote do goleiro");
assert.ok(tem(base, /volta da trave/), "narração do rebote da trave");
// gol contra: 2,0% dos gols nas Copas (54 de 2.720), ~3% na Premier League
const pc = base.contra / base.gols;
assert.ok(pc > 0.01 && pc < 0.045, `gols contra ${pc}`);
assert.ok(tem(base, /contra o próprio gol/), "narração do gol contra");
// quem encaixa melhor solta menos
const seguro = jogar(200, l => comEncaixe(l, 45)), solta = jogar(200, l => comEncaixe(l, 15));
assert.ok(seguro.reb < solta.reb, `Encaixe alto ${seguro.reb} × baixo ${solta.reb}`);
// gol olímpico: raro; forçado no teste
assert.ok(base.ol <= 5, `olímpicos ${base.ol}`);
const v = CONFIG.gradeValores.olimpico;
CONFIG.gradeValores.olimpico = 0.3;
try {
  const forcado = jogar(30);
  assert.ok(forcado.ol > 0, "gol olímpico");
  assert.ok(tem(forcado, /direto.*GOL olímpico/), "narração do olímpico");
} finally { CONFIG.gradeValores.olimpico = v; }
console.log(`teste_rebote_gol_contra ok (${(base.reb / N).toFixed(2)} rebotes por jogo, ${(100 * conv).toFixed(0)}% gols; gols contra ${(100 * pc).toFixed(1)}%)`);
