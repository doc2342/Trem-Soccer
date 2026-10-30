// Calibragem do pacote tático/transição (aprovado em 30/10): R1, R4, R5, linha alta pela Velocidade (1), saída do goleiro (G2) e Posicionamento na pressão (4A).
// Jogos entre formações dos bots sorteadas, nível 30, instruções sorteadas, regras da T1. Metas:
//   gols de contra-ataque na régua da Opta (recuperação na própria metade: perda na zona A de quem atacava e escanteio afastado contam inteiros,
//   perda no meio conta meio) em 5% a 7% dos gols; xG por chute de contra-ataque ~1,4 vez o de jogo corrido; time montado para o contra-ataque
//   (instrução, mentalidade -1, atacantes +6 de Velocidade) com 15% a 20% dos próprios gols de contra-ataque; conversão no alvo ~30%; ~2,3 gols por jogo.
// Uso: node ferramentas/sim_transicao.mjs [jogos] — T1='{"contraAtaque":{"com":0.3}}' muda CONFIG.t1 (um nível); CFG='{"transicao":{"reserva":{"mais":1,"expoente":2}}}' muda o CONFIG
//   T0=1 roda sem as regras da T1. MODO=pos: valor de +6 de Posicionamento (e de Velocidade, para comparar) no time inteiro, saldo de xG por jogo.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { FORMACOES_BOT } from "../src/bot.js";
import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";

const N = +process.argv[2] || 3000, regrasT1 = !process.env.T1_DESLIGA && !process.env.T0;
const junta = (alvo, de) => { for (const k in de) alvo[k] = de[k] && typeof de[k] === "object" && alvo[k] && typeof alvo[k] === "object" ? { ...alvo[k], ...de[k] } : de[k]; };
junta(CONFIG.t1, JSON.parse(process.env.T1 || "{}"));
junta(CONFIG, JSON.parse(process.env.CFG || "{}"));
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const pega = (rng, l) => l[Math.floor(rng.n() * l.length)];
const onze = (rng, s) => gerarOnze(criarRng(s), FORMACOES[pega(rng, FORMACOES_BOT)], { nivel: 30, nomes, prefixoId: "p" + s + "_" });
const instrucoes = rng => ({
  mentalidade: pega(rng, [-1, 0, 0, 0, 1]), pressao: pega(rng, [0, 1, 1, 2]), passe: pega(rng, ["misto", "curto", "longo"]),
  contraAtaque: rng.chance(0.25), impedimento: rng.chance(0.25), aoPerder: pega(rng, ["misto", "misto", "misto", "pressionar", "recompor"]),
});
const OPTA = { A: 1, E: 1, M: 0.5 }, PARADA = new Set(["escanteio", "falta", "penalti"]);
const mais = (esc, at, quanto, filtro = () => true) => esc.map(x => x.pos !== "GK" && filtro(x) ? { ...x, j: { ...x.j, at: x.j.at.map((v, k) => k === at ? Math.min(50, v + quanto) : v) } } : x);
const ATAQUE = new Set(["SC", "FC", "RW", "LW", "AMR", "AML"]);
const pc = v => (100 * v).toFixed(1) + "%", f2 = v => v.toFixed(3);

if (process.env.MODO === "pos") {
  // mesmo jogo (mesma semente) com e sem o reforço no time A; mostra com a 4A (o valor da T1) e sem ela (pressaoLeitura 0)
  const valor = (at, leitura) => {
    const antes = CONFIG.t1.pressaoLeitura; CONFIG.t1.pressaoLeitura = leitura;
    const rng = criarRng(11); let s = 0;
    for (let n = 0; n < N; n++) {
      const a = onze(rng, 1000 + n), b = onze(rng, 9000 + n), ia = instrucoes(rng), ib = instrucoes(rng);
      const jogo = esc => simularPartida(criarRng(5 + n), prepararTime({ nome: "A", escalacao: esc, instrucoes: ia, mandante: true }), prepararTime({ nome: "B", escalacao: b, instrucoes: ib }), { regrasT1 }).xg;
      const [f, c] = jogo(mais(a, at, 6)), [f0, c0] = jogo(a);
      s += f - f0 + c0 - c;
    }
    CONFIG.t1.pressaoLeitura = antes; return s / N;
  };
  const L = CONFIG.t1.pressaoLeitura;
  for (const k of ["pos", "vel", "des", "pas", "res"]) console.log(`+6 ${k.padEnd(4)} saldo de xG/jogo: com a 4A (${L}) ${f2(valor(IDX[k], L))}   sem (0) ${f2(valor(IDX[k], 0))}`);
  process.exit(0);
}

const rng = criarRng(7);
const t = { jogos: 0, gols: 0, noGol: 0, golsContra: 0, golsContraTodos: 0, xgC: 0, chC: 0, xgJ: 0, chJ: 0, contras: 0, saidas: 0, cortes: 0, eGols: 0, eContras: 0 };
const time = { gols: 0, golsContra: 0, jogos: 0, pts: 0 };
for (let n = 0; n < N; n++) {
  // metade dos jogos: liga sorteada; a outra metade: o time montado para o contra-ataque (A) contra um sorteado
  const montado = n % 2 === 1;
  let a = onze(rng, 1000 + n), ia = instrucoes(rng);
  const b = onze(rng, 9000 + n), ib = instrucoes(rng);
  if (montado) { a = mais(a, IDX.vel, 6, x => ATAQUE.has(x.pos)); ia = { ...ia, contraAtaque: true, mentalidade: -1 }; }
  const casa = n % 4 < 2, ta = prepararTime({ nome: "A", escalacao: a, instrucoes: ia }), tb = prepararTime({ nome: "B", escalacao: b, instrucoes: ib });
  const p = casa ? simularPartida(criarRng(n), ta, tb, { regrasT1 }) : simularPartida(criarRng(n), tb, ta, { regrasT1 }), eu = casa ? 0 : 1;
  for (const l of p.lances) {
    const gol = l.resultado === "gol";
    if (montado) { if (l.time === eu && gol) { time.gols++; if (l.contra) time.golsContra += OPTA[l.contra]; } continue; }
    if (gol) { t.gols++; if (l.contra) { t.golsContra += OPTA[l.contra]; t.golsContraTodos++; if (l.contra === "E") t.eGols++; } }
    if (gol || l.resultado === "defesa") t.noGol++;
    if (l.tipo === "penalti") continue;
    if (l.contra) { t.xgC += l.xg; t.chC++; } else if (!PARADA.has(l.tipo)) { t.xgJ += l.xg; t.chJ++; }
  }
  if (montado) { time.jogos++; const [g, s] = [p.placar[eu], p.placar[1 - eu]]; time.pts += g > s ? 3 : g === s ? 1 : 0; continue; }
  t.jogos++;
  t.contras += p.estat[0].contraAtaques + p.estat[1].contraAtaques;
  t.saidas += (p.estat[0].saidasGoleiro || 0) + (p.estat[1].saidasGoleiro || 0);
  t.eContras += p.eventos.filter(e => e.tipo === "contra" && /ficado lá na frente/.test(e.texto)).length;
  t.cortes += p.eventos.filter(e => /sai da área e corta/.test(e.texto)).length;
}
const j = t.jogos;
console.log(`${regrasT1 ? "T1" : "T0"}, ${N} jogos (${j} de liga sorteada, ${time.jogos} do time montado para o contra-ataque)`);
console.log(`gols/jogo ${(t.gols / j).toFixed(2)} (meta ~2,3) | conversão no alvo ${pc(t.gols / t.noGol)} (meta ~30%)`);
console.log(`gols de contra-ataque, régua Opta: ${pc(t.golsContra / t.gols)} (meta 5–7%) | todos: ${pc(t.golsContraTodos / t.gols)} | do escanteio: ${pc(t.eGols / t.gols)}`);
console.log(`xG por chute: contra-ataque ${f2(t.xgC / t.chC)} x jogo corrido ${f2(t.xgJ / t.chJ)} = ${(t.xgC / t.chC / (t.xgJ / t.chJ)).toFixed(2)} vez (meta ~1,4) | chutes de contra ${pc(t.chC / (t.chC + t.chJ))} do jogo corrido`);
console.log(`contra-ataques/jogo ${(t.contras / j).toFixed(2)} (do escanteio ${(t.eContras / j).toFixed(2)}) | saídas do goleiro/jogo ${(t.saidas / j).toFixed(2)}, cortou ${pc(t.cortes / (t.saidas || 1))}`);
console.log(`time montado para o contra-ataque: ${pc(time.golsContra / (time.gols || 1))} dos gols de contra-ataque, régua Opta (meta 15–20%) | ${(time.gols / time.jogos).toFixed(2)} gols/jogo, ${(time.pts / time.jogos).toFixed(2)} pts/jogo`);
