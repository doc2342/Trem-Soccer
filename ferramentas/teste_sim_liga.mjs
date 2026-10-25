// Fumaça do simulador da liga inteira (ferramentas/sim_liga.mjs): 2 temporadas depois da T0, semente fixa.
import assert from "node:assert";
import { simular } from "./sim_liga.mjs";
const r = simular({ semente: 7, temporadas: 2 });
assert.equal(r.length, 3); // T0, T1, T2
assert.ok(r.every(x => x.medidas.A.onze > 20 && x.medidas.A.onze < 45));
assert.deepEqual(simular({ semente: 7, temporadas: 2 }), r); // determinístico
assert.equal(r[0].medidas.A.donos, 0); // a A da T0 é só de bots
assert.equal(r[1].medidas.A.donos, 12); // a A da T1 é só de donos
assert.equal(r[1].medidas.B.donos, 6); // sobraram 6 donos na B
// os ajustes valem só dentro da simulação
const ajustada = simular({ semente: 7, temporadas: 0, ajustes: { "NIVEL.A": 34 } });
assert.ok(ajustada[0].medidas.A.onze > r[0].medidas.A.onze + 2);
assert.deepEqual(simular({ semente: 7, temporadas: 2 }), r);
console.log("teste_sim_liga: ok");
