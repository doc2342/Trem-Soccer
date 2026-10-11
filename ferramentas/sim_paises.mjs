// Régua de força dos outros países: um campeonato de 10 clubes sem dirigente, sem acesso nem mercado, por 20 temporadas.
// Uso: node ferramentas/sim_paises.mjs <pasta do projeto>. Mede o melhor onze (mediano e do mais forte) e a folha a preço de mercado.
import { pathToFileURL } from "node:url"; import { readFileSync } from "node:fs";
const raiz = process.argv[2], imp = f => import(pathToFileURL(raiz + "/src/" + f));
const T = await imp("treino.js"), G = await imp("gerador.js"), N = await imp("rng.js"), M = await imp("modelo.js"), E = await imp("economia.js");
const nm = JSON.parse(readFileSync(raiz + "/dados/nomes.json"));
const FIS = M.ATRIBUTOS.map((a, i) => a.grupo === "fis" ? i : -1).filter(i => i >= 0);
const nota = j => M.notaBruta(j.at, j.pos), media = v => v.reduce((s, x) => s + x, 0) / (v.length || 1), f = x => x.toFixed(1);
const med = v => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const onze = c => { const s = c.elenco.slice().sort((a, b) => nota(b) - nota(a)), g = s.find(j => j.pos === "GK"); return media([g, ...s.filter(j => j.pos !== "GK").slice(0, 10)].filter(Boolean).map(nota)); };
const folha = c => c.elenco.reduce((s, j) => s + E.salarioDeMercado(j), 0);
const areas = Object.fromEntries(Object.keys(T.AREAS).map(k => [k, 1]));
const sessao = (j, o) => { const r = T.treinar(j, o); if (r) { j.at = r.at; j.pts = r.pts; } };

function pais({ piso, desvio, abaixo, raros, semente, temporadas = 20 }) {
  const rng = N.criarRng(semente), usados = new Set(), clubes = [];
  for (let k = 0; k < 10; k++) clubes.push({ elenco: G.gerarElenco(rng, { nivel: 37.5 - k / 3, nomes: nm, pais: "Argentina", prefixoId: "c" + k + "_" }).map(j => ({ ...j, pts: null, treino: null })) });
  const saida = [];
  for (let t = 1; t <= temporadas; t++) {
    const novos = [];
    for (const c of clubes) for (let s = 0; s < 18; s++) { const jogam = new Set(c.elenco.slice().sort((a, b) => nota(b) - nota(a)).slice(0, 14)); for (const j of c.elenco) sessao(j, { tal: j.tal, ct: 4, jogou: jogam.has(j), areas }); }
    const on = clubes.map(onze), fo = clubes.map(folha);
    saida.push({ t, med: med(on), max: Math.max(...on), min: Math.min(...on), folhaMed: med(fo), folhaMax: Math.max(...fo) });
    for (const c of clubes) {
      const fica = [];
      for (const j of c.elenco) {
        const antes = nota(j); j.idade++;
        if (j.idade >= 34) FIS.forEach(i => { j.at[i] = Math.max(1, j.at[i] - rng.int(1, 2)); });
        else if (j.idade >= 31) rng.embaralhar(FIS.slice()).slice(0, rng.int(1, 2)).forEach(i => { j.at[i] = Math.max(1, j.at[i] - 1); });
        if (j.idade >= 38 || (j.idade >= 34 && rng.chance((j.idade - 33) * 0.2))) {
          const alvo = Math.max(piso, antes - abaixo), pronto = alvo > piso;
          const n = G.gerarJogador(rng, { id: "n", pos: j.pos, alvo: Math.max(alvo - 4, Math.min(alvo + 4, alvo + rng.normal(0, 1.5))), idade: pronto ? rng.int(19, 22) : rng.int(17, 19), nomes: nm, usados });
          n.tal = Math.max(1, Math.min(G.TALENTO_COMUM, Math.round(n.tal + desvio))); n.pts = null; n.treino = null;
          fica.push(n); novos.push(n); continue;
        }
        fica.push(j);
      }
      c.elenco = fica;
    }
    if (rng.chance(raros[0])) { const j = rng.pick(novos); if (j) j.tal = 100; }
    if (rng.chance(raros[1])) { const j = rng.pick(novos); if (j) j.tal = 95; }
  }
  return saida;
}
const CEN = [
  ["como bot da Série A (26, +8)", { piso: 26, desvio: 8, abaixo: 5, raros: [0.15, 0.3] }],
  ["28, +14 (a regra adotada)", { piso: 28, desvio: 14, abaixo: 5, raros: [0.15, 0.3] }],
  ["28, +18", { piso: 28, desvio: 18, abaixo: 5, raros: [0.15, 0.3] }],
  ["28, +24", { piso: 28, desvio: 24, abaixo: 5, raros: [0.15, 0.3] }],
  ["28, +30", { piso: 28, desvio: 30, abaixo: 5, raros: [0.15, 0.3] }],
  ["30, +30, até 4 abaixo", { piso: 30, desvio: 30, abaixo: 4, raros: [0.15, 0.3] }],
  ["30, +34 (teto 92), até 3 abaixo", { piso: 30, desvio: 34, abaixo: 3, raros: [0.15, 0.3] }],
];
console.log("melhor onze: mediano · do mais forte · do mais fraco | folha a preço de mercado (mil): mediana · maior");
for (const [nome, cfg] of CEN) {
  const rs = [3, 11, 29, 47].map(semente => pais({ ...cfg, semente }));
  const em = (t0, t1) => { const xs = rs.flatMap(r => r.filter(x => x.t >= t0 && x.t <= t1)); return `${f(media(xs.map(x => x.med)))} · ${f(media(xs.map(x => x.max)))} · ${f(media(xs.map(x => x.min)))} | ${Math.round(media(xs.map(x => x.folhaMed)))} · ${Math.round(media(xs.map(x => x.folhaMax)))}`; };
  console.log(`${nome.padEnd(34)} T1–3: ${em(1, 3)}  ||  T6–10: ${em(6, 10)}  ||  T15–20: ${em(15, 20)}`);
}
