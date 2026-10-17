// Mede o peso do duelo finalizador x goleiro: gols/xG do time mais fraco e do mais forte por diferença de nível (campo neutro).
// O xG publicado já inclui esse duelo, então gols/xG deve ficar perto de 1 para os dois lados em qualquer diferença.
// Uso: node ferramentas/sim_inclinacao.mjs [jogos por linha]. CFG='{"finalizacao":{"chute":1,"goleiro":1,"penalti":0.6}}' troca os valores para teste.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarOnze } from "../src/gerador.js"; import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
Object.assign(CONFIG, JSON.parse(process.env.CFG || "{}"));
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 3000, f2 = v => v.toFixed(2), pc = v => (100 * v).toFixed(0) + "%";
const onze = (s, nivel) => gerarOnze(criarRng(s), FORMACOES["4-4-2"], { nivel, nomes, prefixoId: "p" + s + "_" });
console.log(`CFG ${process.env.CFG || "-"}, ${N} jogos por linha, nível do fraco 36`);
for (const d of [0, 2, 4, 6]) {
  const rng = criarRng(11); let g = [0, 0], x = [0, 0], v = 0, e = 0;
  for (let n = 0; n < N; n++) {
    const s = n % 40, fraco = prepararTime({ nome: "F", escalacao: onze(1000 + s, 36) }), forte = prepararTime({ nome: "T", escalacao: onze(2000 + s, 36 + d) });
    const inv = n % 2, r = inv ? simularPartida(rng, forte, fraco) : simularPartida(rng, fraco, forte), i = inv ? 1 : 0;
    g[0] += r.placar[i]; g[1] += r.placar[1 - i]; x[0] += r.xg[i]; x[1] += r.xg[1 - i];
    if (r.placar[i] > r.placar[1 - i]) v++; else if (r.placar[i] === r.placar[1 - i]) e++;
  }
  console.log(`+${d}: gols ${f2((g[0] + g[1]) / N)} | fraco ${f2(g[0] / N)} gols/xG ${f2(g[0] / x[0])} | forte ${f2(g[1] / N)} gols/xG ${f2(g[1] / x[1])} | fraco vence ${pc(v / N)} empate ${pc(e / N)}`);
}
