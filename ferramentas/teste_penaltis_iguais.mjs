// Disputa de pênaltis com um time a menos: os dois batem com o mesmo número de jogadores (o que tem mais tira da fila até igualar).
// Uso: node ferramentas/teste_penaltis_iguais.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarOnze } from "../src/gerador.js"; import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = s => gerarOnze(criarRng(s), FORMACOES["4-4-2"], { nivel: 38, nomes, prefixoId: "p" + s + "_" });
const rng = criarRng(5); let disputas = 0, longas = 0;
for (let n = 0; n < 3000 && longas < 5; n++) {
  // B começa com 9: tira dois jogadores de linha
  const p = simularPartida(rng, prepararTime({ nome: "A", escalacao: onze(n) }), prepararTime({ nome: "B", escalacao: onze(n + 9000).filter((x, k) => k < 9) }), { prorrogacao: true });
  if (!p.penaltis) continue;
  disputas++;
  const emCampo = [0, 1].map(t => Object.values(p.jogadores).filter(j => j.time === t && j.saiu === null && !j.vermelho).length), iguais = Math.min(...emCampo);
  for (const t of [0, 1]) {
    const ids = p.penaltis.cobrancas.filter(c => c.time === t).map(c => c.id), distintos = new Set(ids).size;
    assert.ok(distintos <= iguais, `jogo ${n}: time ${t} bateu com ${distintos} jogadores, o outro só tem ${iguais}`);
    if (ids.length > iguais) { assert.strictEqual(distintos, iguais, `jogo ${n}: fila do time ${t} não recomeçou depois de ${iguais}`); if (t === 0) longas++; }
  }
}
assert.ok(longas > 0, "nenhuma disputa passou do número de batedores; aumentar os jogos");
console.log(`${disputas} disputas, ${longas} longas: os dois times bateram com o mesmo número de jogadores`);
