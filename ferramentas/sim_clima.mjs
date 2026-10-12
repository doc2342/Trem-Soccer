// Mede a chuva e o jogo grande no motor, com elencos gerados de mesma nota. Uso: node ferramentas/sim_clima.mjs [jogos por linha] [grande | calor | entrosamento = só essa parte]. No teste da experiência todos têm 17 anos, para a idade não cobrir a experiência dada.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarElenco } from "../src/gerador.js"; import { taticaBot } from "../src/bot.js";
import { prepararTime, simularPartida, setorDaPosicao } from "../src/motor.js";
const SO = process.argv[3]; const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 3000;
const guardados = {}, elenco = (s, exp) => guardados[s + "|" + exp] || (guardados[s + "|" + exp] = taticaBot(gerarElenco(criarRng(s), { nivel: 34, nomes, prefixoId: "e" + s + "_" }).map(j => exp == null ? j : { ...j, exp, idade: 17 })));
// pontos por jogo do time A em campo neutro (os dois lados alternam), gols por jogo
function medir(instA, instB, opcoes, expA, expB, mudaA = x => x) {
  const rng = criarRng(77); let pts = 0, gols = 0;
  for (let k = 0; k < N; k++) {
    const a = mudaA(elenco(1 + k % 20, expA)), b = elenco(101 + k % 20, expB);
    const ta = prepararTime({ nome: "A", escalacao: a.escalacao, banco: a.banco, instrucoes: { ...a.instrucoes, ...instA } }), tb = prepararTime({ nome: "B", escalacao: b.escalacao, banco: b.banco, instrucoes: { ...b.instrucoes, ...instB } });
    const p = k % 2 ? simularPartida(rng, tb, ta, opcoes) : simularPartida(rng, ta, tb, opcoes), [ga, gb] = k % 2 ? [p.placar[1], p.placar[0]] : p.placar;
    pts += ga > gb ? 3 : ga === gb ? 1 : 0; gols += ga + gb;
  }
  return `${(pts / N).toFixed(2)} pts, ${(gols / N).toFixed(2)} gols`;
}
if (!SO) for (const chuva of [0, 1, 2]) console.log(`chuva ${chuva}: misto x misto ${medir({}, {}, { chuva })} | curto x misto ${medir({ passe: "curto" }, {}, { chuva })} | longo x misto ${medir({ passe: "longo" }, {}, { chuva })} | longo x curto ${medir({ passe: "longo" }, { passe: "curto" }, { chuva })}`);
if (!SO || SO === "grande") for (const jogoGrande of [false, true]) console.log(`jogo grande ${jogoGrande}: exp 20 x exp 90 ${medir({}, {}, { jogoGrande }, 20, 90)} | exp 50 x exp 90 ${medir({}, {}, { jogoGrande }, 50, 90)} | exp 90 x exp 90 ${medir({}, {}, { jogoGrande }, 90, 90)}`);
if (!SO || SO === "calor") for (const calor of [false, true]) console.log(`calor ${calor}: misto x misto ${medir({}, {}, { calor })} | pressão alta x normal ${medir({ pressao: 2 }, {}, { calor })} | sem substituições x com ${medir({ substituicoes: [] }, {}, { calor })}`);
// entrosamento: n recém-chegados (faltando 8 jogos) entre os titulares do time A, só num setor ou em todos
const novos = (setores, n) => a => { const c = {}; return { ...a, escalacao: a.escalacao.map(x => { const s = setorDaPosicao(x.pos); c[s] = (c[s] || 0) + 1; return setores.includes(s) && c[s] <= n ? { ...x, j: { ...x.j, entrosar: 8 } } : x; }) }; };
if (!SO || SO === "entrosamento") console.log(`entrosamento: ninguém novo ${medir({}, {}, {})} | 1 novo no ataque ${medir({}, {}, {}, null, null, novos(["A"], 1))} | 1 novo por setor ${medir({}, {}, {}, null, null, novos(["D", "M", "A"], 1))} | 2 por setor ${medir({}, {}, {}, null, null, novos(["D", "M", "A"], 2))} | time inteiro ${medir({}, {}, {}, null, null, novos(["D", "M", "A"], 11))}`);
