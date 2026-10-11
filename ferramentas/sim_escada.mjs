// Simulação da escada (talento do jovem de bot por divisão) e da curva do freio. Liga só de bots, sem mercado.
import { pathToFileURL } from "node:url"; import { readFileSync } from "node:fs";
const raiz = process.argv[2], imp = f => import(pathToFileURL(raiz + "/src/" + f));
const T = await imp("treino.js"), G = await imp("gerador.js"), N = await imp("rng.js"), M = await imp("modelo.js"), V = await imp("virada.js");
const nm = JSON.parse(readFileSync(raiz + "/dados/nomes.json"));
const FIS = M.ATRIBUTOS.map((a, i) => a.grupo === "fis" ? i : -1).filter(i => i >= 0);
const POS = ["GK", "DC", "DC", "DR", "DL", "DMC", "MC", "MC", "MR", "ML", "AMC", "AML", "FC", "SC", "RW", "LW"];
const nota = j => M.notaBruta(j.at, j.pos), media = v => v.reduce((s, x) => s + x, 0) / (v.length || 1), f = x => x.toFixed(1);
const med = v => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const onze = c => { const s = c.elenco.slice().sort((a, b) => nota(b) - nota(a)), g = s.find(j => j.pos === "GK"); return media([g, ...s.filter(j => j.pos !== "GK").slice(0, 10)].filter(Boolean).map(nota)); };
const ATUAL = T.CONFIG_TREINO.freio.curva;
const CURVAS = { atual: ATUAL, esticada: [[16, .05], [18, .34], [20, .58], [22, .76], [24, .88], [26, .97], [27, 1.03], [31, 1.06]] };
const areas = Object.fromEntries(Object.keys(T.AREAS).map(k => [k, 1]));
const sessao = (j, o) => { const r = T.treinar(j, o); if (r) { j.at = r.at; j.pts = r.pts; } };

function liga({ curva, desvio, semente, temporadas = 22 }) {
  T.CONFIG_TREINO.freio.curva = CURVAS[curva];
  const rng = N.criarRng(semente), usados = new Set(), clubes = [];
  for (let c = 0; c < 50; c++) clubes.push({ div: c < 10 ? 1 : c < 30 ? 2 : 3, elenco: G.gerarElenco(rng, { nivel: 30, nomes: nm, prefixoId: "c" + c + "_" }).map(j => ({ ...j, pts: null, treino: null })) });
  const saida = [];
  for (let t = 1; t <= temporadas; t++) {
    const novos = [];
    for (const c of clubes) {
      const ct = T.CONFIG_TREINO.ctSemDono[c.div];
      for (let s = 0; s < 18; s++) { const jogam = new Set(c.elenco.slice().sort((a, b) => nota(b) - nota(a)).slice(0, 14)); for (const j of c.elenco) sessao(j, { tal: j.tal, ct, jogou: jogam.has(j), areas }); }
    }
    saida.push({ t, on: [1, 2, 3].map(d => med(clubes.filter(c => c.div === d).map(onze))), todos: clubes.flatMap(c => c.elenco.map(j => ({ n: nota(j), i: j.idade }))) });
    // acesso e descenso: força do onze com ruído (entre bots a tabela é metade sorte)
    const ordem = d => clubes.filter(c => c.div === d).map(c => ({ c, v: onze(c) + rng.normal(0, 1.2) })).sort((a, b) => b.v - a.v).map(x => x.c);
    const a = ordem(1), b = ordem(2), c3 = ordem(3);
    a.slice(-3).forEach(c => c.div = 2); b.slice(0, 3).forEach(c => c.div = 1); b.slice(-4).forEach(c => c.div = 3); c3.slice(0, 4).forEach(c => c.div = 2);
    for (const c of clubes) {
      const fica = [];
      for (const j of c.elenco) {
        const antes = nota(j); j.idade++;
        if (j.idade >= 34) FIS.forEach(i => { j.at[i] = Math.max(1, j.at[i] - rng.int(1, 2)); });
        else if (j.idade >= 31) rng.embaralhar(FIS.slice()).slice(0, rng.int(1, 2)).forEach(i => { j.at[i] = Math.max(1, j.at[i] - 1); });
        if (j.idade >= 38 || (j.idade >= 34 && rng.chance((j.idade - 33) * 0.2))) {
          const piso = V.NOTA_DO_JOVEM_POR_DIVISAO[c.div], alvo = Math.max(piso, antes - 5), pronto = alvo > piso;
          const n = G.gerarJogador(rng, { id: "n", pos: j.pos, alvo: Math.max(alvo - 4, Math.min(alvo + 4, alvo + rng.normal(0, 1.5))), idade: pronto ? rng.int(19, 22) : rng.int(17, 19), nomes: nm, usados });
          n.tal = Math.max(1, Math.min(G.TALENTO_COMUM, Math.round(n.tal + desvio[c.div - 1]))); n.pts = null; n.treino = null;
          fica.push(n); novos.push(n); continue;
        }
        fica.push(j);
      }
      c.elenco = fica;
    }
    // safra: em média 1,5 de teto 43 e 3 de teto 42 por temporada, em jovens que chegaram
    const jovens = rng.embaralhar(novos.filter(j => j.idade <= 19));
    const k43 = [0, 1, 1, 2, 2, 3][rng.int(0, 5)], k42 = rng.int(1, 5);
    jovens.slice(0, k43).forEach(j => j.tal = 100); jovens.slice(k43, k43 + k42).forEach(j => j.tal = 95);
  }
  return saida;
}
const CEN = { "hoje (58/58/58)": [0, 0, 0], "66/58/50": [8, 0, -8], "72/58/46": [14, 0, -12], "74/62/50": [16, 4, -8] };
console.log("== ESCADA: melhor onze mediano A / B / C (média de 3 sementes), sem mercado entre bots");
for (const curva of ["atual", "esticada"]) for (const [nome, desvio] of Object.entries(CEN)) {
  const rs = [3, 11, 29].map(semente => liga({ curva, desvio, semente }));
  const em = (t0, t1) => [0, 1, 2].map(d => f(media(rs.flatMap(r => r.filter(x => x.t >= t0 && x.t <= t1).map(x => x.on[d]))))).join(" / ");
  const topo = (lim, t0, t1) => f(media(rs.flatMap(r => r.filter(x => x.t >= t0 && x.t <= t1).map(x => x.todos.filter(j => j.n >= lim).length))));
  const idade = lim => f(media(rs.flatMap(r => r.filter(x => x.t >= 15).flatMap(x => x.todos.filter(j => j.n >= lim).map(j => j.i)))));
  console.log(`curva ${curva.padEnd(8)} talento ${nome.padEnd(16)} T5–7: ${em(5, 7)} · T10–13: ${em(10, 13)} · T18–22: ${em(18, 22)} | na liga (T15–22): ≥42,5: ${topo(42.5, 15, 22)} · ≥41,5: ${topo(41.5, 15, 22)} · ≥40: ${topo(40, 15, 22)} · ≥38: ${topo(38, 15, 22)} · idade média dos ≥41,5: ${idade(41.5)}`);
}
console.log("\n== CURVA: nota por idade de um jovem que chega aos 17 com nota 20 (mediana de 200), jogando a partir de nota 30");
const caso = (curva, tal, ct, mult) => {
  T.CONFIG_TREINO.freio.curva = CURVAS[curva]; const rng = N.criarRng(5), ar = Object.fromEntries(Object.keys(T.AREAS).map(k => [k, mult])), porIdade = {};
  for (let k = 0; k < 200; k++) {
    const j = G.gerarJogador(rng, { id: "x", pos: rng.pick(POS), alvo: 20, idade: 17, nomes: nm, usados: new Set() }); j.pts = null; j.treino = null;
    for (; j.idade <= 29; j.idade++) { for (let s = 0; s < 18; s++) sessao(j, { tal, ct, jogou: nota(j) >= 30, areas: ar }); (porIdade[j.idade] ||= []).push(nota(j)); }
  }
  return [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29].map(i => `${i}:${f(med(porIdade[i]))}`).join(" ");
};
for (const [rot, tal, ct, mult] of [["raro 43, clube de dirigente (CT 4, treinadores 110%)", 100, 4, 1.1], ["raro 43, bot da Série A (CT 4, 100%)", 100, 4, 1], ["talento 75 (teto 38), dirigente", 75, 4, 1.1], ["talento 58 (teto 34,6), bot da Série C (CT 0)", 58, 0, 1]])
  for (const curva of ["atual", "esticada"]) console.log(`${rot} · ${curva}: ${caso(curva, tal, ct, mult)}`);
