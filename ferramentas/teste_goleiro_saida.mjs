// A volta ao goleiro (aprovada em 01/11): só da faixa 1, o goleiro não conduz e sai jogando; pressão maior, mais voltas para ele.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = s => gerarOnze(criarRng(s), FORMACOES["4-2-3-1"], { nivel: 30, nomes, prefixoId: "p" + s + "_", novos: true });
const medir = (pressao, jogos = 400) => {
  let voltas = 0, certas = 0, saidas = 0, narrou = false;
  for (let s = 0; s < jogos; s++) {
    const registro = [], a = onze(100 + s), b = onze(300 + s), gk = a.find(x => x.pos === "GK").j.id;
    const p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b, instrucoes: { pressao } }), { regrasT1: true, registro });
    const nomeGk = a.find(x => x.pos === "GK").j.nome;
    for (const x of registro) {
      if (x[0] !== 0 || x[1] === "fim") continue;
      if (x[5] === gk && x[3] === "voltar") { voltas++; if (x[6]) certas++; assert.ok(x[1][0] === "1" && x[2] === "1C", `volta ao goleiro só da faixa 1: ${x[1]} → ${x[2]}`); }
      if (x[4] === gk && x[3] !== "repor" && x[3] !== "longa") { saidas++; assert.ok(!x[7], "goleiro não conduz"); }
    }
    narrou ||= p.narracao.some(l => l.texto.includes("recua para") && l.texto.includes(nomeGk));
  }
  return { voltas: voltas / jogos, acerto: certas / voltas, saidas: saidas / jogos, narrou };
};
const sem = medir(0), com = medir(2);
assert.ok(sem.voltas > 1, `a volta ao goleiro acontece: ${sem.voltas} por jogo`);
assert.ok(sem.saidas > 0, "o goleiro sai jogando depois da volta");
assert.ok(com.acerto < sem.acerto, `contra a pressão ela é mais arriscada: ${com.acerto} x ${sem.acerto}`);
console.log("teste_goleiro_saida: ok", sem, com);
