// Calibragem dos papéis dos laterais e alas (etapa 2 do plano dos papéis): cada papel nos dois lados do time A contra o padrão, times do mesmo nível,
// mando alternado. Mostra o que muda na cara do jogo (o que o lateral cria e cruza, o que o time sofre pelos lados) e o quanto muda a chance de vencer.
// Metas (página do plano, alvos Aké/Frimpong/Zinchenko): o Apoiador cruza e cria muito mais que o Fixo e sofre mais pelos lados; o Invertido cria pelo
// passe quase sem cruzar e ganha mais duelos no meio; o Fixo sofre menos pelo lado; nenhum papel tira a vitória da faixa de 35% a 39% (padrão ~37%).
// Uso: node ferramentas/sim_papeis_laterais.mjs [jogos por papel] [CONFIG.papeis em JSON, ex.: '{"alaPorLado":0.4}']
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
import { papeisDaPosicao } from "../src/papeis.js";

const N = +process.argv[2] || 3000;
if (process.argv[3]) Object.assign(CONFIG.papeis, JSON.parse(process.argv[3]));
// teste de mapa: MAPAS='{"apoiador":{"DR":{"com":{...},"sem":{...}}}}' troca os mapas do lado direito (o esquerdo vem espelhado); PAPEL=apoiador roda só um
import { PAPEIS } from "../src/papeis.js";
for (const [p, m] of Object.entries(JSON.parse(process.env.MAPAS || "{}"))) Object.assign(PAPEIS[p].mapas, m);
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), PARES = 40;
const onze = (f, s) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_" });
const f1 = v => v.toFixed(2).replace(".", ","), pc = v => (100 * v).toFixed(1).replace(".", ",") + "%";

for (const [formacao, lados] of [["4-2-3-1", ["DR", "DL"]], ["4-3-3 com pontas", ["DR", "DL"]], ["3-5-2 com alas", ["WBR", "WBL"]]].filter(([f]) => !process.env.FORMACAO || f === process.env.FORMACAO)) {
  console.log(`\n${formacao} (${lados.join(" e ")}), ${N} jogos por papel, contra o mesmo esquema com papel padrão`);
  console.log("papel".padEnd(12) + "vitória  empate  pts/j  GP    GC   | lateral: chances  cruzam.  duelos%  | sofre pelos lados: chances  xG   | posse  contra sofridos");
  for (const papel of papeisDaPosicao(lados[0]).filter(p => !process.env.PAPEL || p === process.env.PAPEL || p === papeisDaPosicao(lados[0])[0])) {
    const rng = criarRng(77);
    let v = 0, em = 0, gp = 0, gc = 0, criou = 0, cruzou = 0, ganhos = 0, perdidos = 0, sofreL = 0, xgL = 0, posse = 0, contras = 0;
    for (let n = 0; n < N; n++) {
      const s = 1000 + n % PARES, a = onze(formacao, s).map(x => lados.includes(x.pos) ? { ...x, papel } : x), b = onze(formacao, s + 500);
      const ids = new Set(a.filter(x => lados.includes(x.pos)).map(x => x.j.id));
      const ta = prepararTime({ nome: "A", escalacao: a }), tb = prepararTime({ nome: "B", escalacao: b }), casa = n % 2 === 0;
      const p = casa ? simularPartida(rng, ta, tb) : simularPartida(rng, tb, ta), eu = casa ? 0 : 1;
      const [ga, gb] = [p.placar[eu], p.placar[1 - eu]];
      if (ga > gb) v++; else if (ga === gb) em++;
      gp += ga; gc += gb; posse += eu === 0 ? p.estat[0].posse / (p.estat[0].posse + p.estat[1].posse || 1) : p.estat[1].posse / (p.estat[0].posse + p.estat[1].posse || 1);
      contras += p.estat[1 - eu].contraAtaques;
      for (const l of p.lances) {
        if (l.time === eu && ids.has(l.criador)) { criou++; if (l.tipo === "cruzamento") cruzou++; }
        if (l.time === 1 - eu && (l.lado === "E" || l.lado === "D")) { sofreL++; xgL += l.xg || 0; }
      }
      for (const id of ids) { const f = p.jogadores[id]; if (f) { ganhos += f.duelosGanhos; perdidos += f.duelosPerdidos; } }
    }
    console.log(papel.padEnd(12) + pc(v / N).padEnd(9) + pc(em / N).padEnd(8) + f1((3 * v + em) / N).padEnd(7) + f1(gp / N).padEnd(6) + f1(gc / N).padEnd(5)
      + "|          " + f1(criou / N).padEnd(9) + f1(cruzou / N).padEnd(9) + pc(ganhos / (ganhos + perdidos || 1)).padEnd(10)
      + "|                     " + f1(sofreL / N).padEnd(8) + f1(xgL / N).padEnd(5) + "| " + pc(posse / N).padEnd(7) + f1(contras / N));
  }
}
