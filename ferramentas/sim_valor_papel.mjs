// Valor de cada papel de uma posição: o time A com o papel em todos os jogadores da posição contra o mesmo esquema com o papel padrão, times do mesmo
// nível, mando alternado e as mesmas sementes para todos os papéis (a diferença é do papel, não do sorteio). O saldo de xG é o sinal menos ruidoso.
// Uso: node ferramentas/sim_valor_papel.mjs POS "FORMAÇÃO" [jogos]   ex.: node ferramentas/sim_valor_papel.mjs MC "4-3-3 com pontas" 1200
//   QUAIS=1,3 põe o papel só no 1º e no 3º da posição na escalação (os de fora do trio)
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { papeisDaPosicao } from "../src/papeis.js";

const [POS, FORMACAO = "4-2-3-1", NJ = "1200"] = process.argv.slice(2), N = +NJ;
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = (f, s) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_", novos: true });
const QUAIS = process.env.QUAIS ? process.env.QUAIS.split(",").map(Number) : null;
const f2 = v => (v >= 0 ? "+" : "") + v.toFixed(3);
console.log(`${POS} no ${FORMACAO}, ${N} jogos por papel, contra o mesmo esquema com o papel padrão`);
let base = null;
for (const papel of papeisDaPosicao(POS)) {
  let pts = 0, gp = 0, gc = 0, xg = 0;
  for (let n = 0; n < N; n++) {
    const s = 1000 + n % 60, k = { n: 0 }, a = onze(FORMACAO, s).map(x => x.pos === POS && (!QUAIS || QUAIS.includes(++k.n)) ? { ...x, papel } : x), b = onze(FORMACAO, s + 500), casa = n % 2 === 0;
    const ta = prepararTime({ nome: "A", escalacao: a }), tb = prepararTime({ nome: "B", escalacao: b }), eu = casa ? 0 : 1;
    const p = casa ? simularPartida(criarRng(n + 1), ta, tb) : simularPartida(criarRng(n + 1), tb, ta), [ga, gb] = [p.placar[eu], p.placar[1 - eu]];
    pts += ga > gb ? 3 : ga === gb ? 1 : 0; gp += ga; gc += gb; xg += p.estat[eu].xg - p.estat[1 - eu].xg;
  }
  const r = { pts: pts / N, gp: gp / N, gc: gc / N, xg: xg / N };
  base = base || r;
  console.log(papel.padEnd(16) + `pts/j ${r.pts.toFixed(3)} (${f2(r.pts - base.pts)})  GP ${r.gp.toFixed(2)}  GC ${r.gc.toFixed(2)}  saldo de xG ${f2(r.xg)} (${f2(r.xg - base.xg)})`);
}
