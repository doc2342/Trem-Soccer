// Tarefa 9c da grade 5×5: tiro de meta depois do chute para fora, reposição do goleiro depois da defesa que ele segura, curto ou longo.
// Uso: node ferramentas/teste_tiro_de_meta.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { faixaDe } from "../src/grade.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = s => gerarOnze(criarRng(s), FORMACOES["4-4-2"], { nivel: 30, nomes, prefixoId: "p" + s + "_" });
// joga N partidas; as instruções valem para os dois (ia) ou só para quem repõe (ia) contra quem pressiona (ib)
function jogar(N, ia = {}, ib = ia) {
  const t = { tiros: 0, curtos: 0, perdidos: 0, maos: 0, maosCurtas: 0, fora: 0, defesa: 0, textos: [], registro: [] };
  for (let n = 0; n < N; n++) {
    const registro = [], a = prepararTime({ nome: "A", escalacao: onze(100 + n), instrucoes: ia }), b = prepararTime({ nome: "B", escalacao: onze(500 + n), instrucoes: ib });
    const p = simularPartida(criarRng(n), a, b, { registro });
    const g = p.estat[0].grade; // só o time A: o B é quem pressiona
    t.tiros += g.tiros[0]; t.curtos += g.tiros[1]; t.perdidos += g.tiros[2]; t.maos += g.maos[0]; t.maosCurtas += g.maos[1];
    for (const l of p.lances) if (l.time === 1) { if (l.resultado === "fora") t.fora++; if (l.resultado === "defesa") t.defesa++; }
    t.textos.push(...p.narracao.map(l => l.texto)); t.registro.push(...registro);
  }
  return t;
}

const base = jogar(150);
// o tiro de meta só depois do chute para fora (quase todos: no reinício do tempo a bola é de quem dá a saída)
assert.ok(base.tiros > 0, "sem tiro de meta");
assert.ok(base.tiros <= base.fora && base.tiros >= 0.9 * base.fora, `tiros de meta ${base.tiros}, chutes para fora do adversário ${base.fora}`);
assert.ok(base.maos > 0, "sem reposição do goleiro");
// cerca de metade curto, sem instrução (Opta, Premier League: 47% longo)
const pc = base.curtos / base.tiros;
assert.ok(pc > 0.35 && pc < 0.65, `curtos ${pc}`);
// quem cobra é o goleiro: o primeiro passo curto sai dele e cai na faixa 1; o longo, nas faixas 3–4 depois da segunda bola
const repos = base.registro.filter(r => r[3] === "repor");
assert.ok(repos.length > 0 && repos.every(r => faixaDe(r[2]) === 1), "o curto vai para a faixa 1");
assert.ok(base.registro.some(r => r[3] === "longa" && r[1] === "1C" && faixaDe(r[2]) === 3), "o longo para a faixa 4 cai na faixa 3");
// a instrução manda
const curto = jogar(80, { passe: "curto" }), longo = jogar(80, { passe: "longo" });
assert.ok(curto.curtos / curto.tiros > pc + 0.1, "passe curto cobra mais curto");
assert.ok(longo.curtos / longo.tiros < pc - 0.1, "passe longo cobra mais longo");
// a pressão alta empurra para o longo e rouba mais o curto
const calma = jogar(150, { pressao: 0 }, { pressao: 0 }), alta = jogar(150, { pressao: 0 }, { pressao: 2 });
assert.ok(alta.curtos / alta.tiros < calma.curtos / calma.tiros - 0.1, "pressão alta: mais longo");
assert.ok(alta.perdidos / alta.curtos > 2 * Math.max(calma.perdidos, 1) / calma.curtos, `curtos perdidos ${alta.perdidos}/${alta.curtos} x ${calma.perdidos}/${calma.curtos}`);
// a narração conta
const tem = re => base.textos.some(x => re.test(x));
assert.ok(tem(/cobra o tiro de meta curto/), "narração do curto");
assert.ok(tem(/cobra o tiro de meta longo/), "narração do longo");
assert.ok(tem(/repõe/), "narração da reposição");
console.log("teste_tiro_de_meta ok");
