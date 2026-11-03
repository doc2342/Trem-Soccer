// Validação cruzada das 6 mecânicas: cada par ligado junto, contra cada uma sozinha, mesmas sementes, 25 atributos. Procura efeito combinado inesperado;
// não calibra nada. Uso: node ferramentas/sim_cruzada.mjs [jogos]   Imprime uma tabela em Markdown (o relatorio_motor.mjs a guarda).
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { IDX } from "../src/modelo.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const N = +process.argv[2] || 300;
const onze = (f, s) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_", novos: true });
// muda: { atributo: valor } em quem passa no filtro (padrão: todos menos o goleiro)
const comAtr = (l, muda, quem = x => x.pos !== "GK") => l.map(x => quem(x) ? { ...x, j: { ...x.j, at: x.j.at.map((n, k) => { for (const c in muda) if (IDX[c] === k) return muda[c]; return n; }) } } : x);
const mede = (a, b, ia = {}, ib = {}) => {
  const t = { xg: 0, gols: 0, faltas: 0, passos: [0, 0], entre: 0, aereos: [0, 0], saidas: [0, 0, 0], viradas: 0 };
  for (let s = 1; s <= N; s++) {
    const reg = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a, instrucoes: ia }), prepararTime({ nome: "B", escalacao: b, instrucoes: ib }), { registro: reg }), e = p.estat[0], g = e.grade;
    t.xg += p.xg[0]; t.gols += p.placar[0]; t.faltas += p.estat[1].faltas; t.entre += g.entrelinhas[0];
    for (const v of Object.values(g.passos)) { t.passos[0] += v[0]; t.passos[1] += v[1]; }
    t.aereos[0] += g.aereos[0]; t.aereos[1] += g.aereos[1]; g.saidasAlto.forEach((n, k) => { t.saidas[k] += n; });
    for (const r of reg) if (r[0] === 0 && r[1] !== "fim" && (r[3] === "virada" || r[3] === "inversao")) t.viradas++;
  }
  const sa = t.saidas[0] + t.saidas[1] + t.saidas[2];
  return { xg: t.xg / N, gols: t.gols / N, faltas: t.faltas / N, acerto: t.passos[1] / t.passos[0], entre: t.entre / N, aereo: t.aereos[1] / (t.aereos[0] || 1), segura: sa ? t.saidas[0] / sa : 0, viradas: t.viradas / N };
};
const A = onze("4-2-3-1", 1), B = onze("4-4-2", 2), P3 = onze("4-3-3 com pontas", 1), frente = x => ["SC", "AMC", "AML", "AMR"].includes(x.pos), goleiro = x => x.pos === "GK";
const n2 = v => v.toFixed(2), n3 = v => v.toFixed(3), linhas = [];
const par = (nome, medida, f, celulas) => { const v = celulas.map(([, a]) => f(a())); linhas.push(`| ${nome} | ${medida} | ${celulas.map(([r], k) => `${r}: ${v[k]}`).join("; ")} |`); };

par("Agressividade × pressão", "xG sofrido; faltas", r => `${n3(r.xg)}; ${n2(r.faltas)}`, [
  ["base", () => mede(A, B)], ["agr 45", () => mede(A, comAtr(B, { agr: 45 }))], ["pressão 2", () => mede(A, B, {}, { pressao: 2 })], ["os dois", () => mede(A, comAtr(B, { agr: 45 }), {}, { pressao: 2 })]]);
par("Pressão × Comunicação", "xG sofrido; viradas por jogo", r => `${n3(r.xg)}; ${n2(r.viradas)}`, [
  ["base", () => mede(A, B)], ["pressão 2", () => mede(A, B, {}, { pressao: 2 })], ["com 45", () => mede(A, comAtr(B, { com: 45 }))], ["os dois", () => mede(A, comAtr(B, { com: 45 }), {}, { pressao: 2 })]]);
par("Comunicação × organização", "xG sofrido; acerto do rival", r => `${n3(r.xg)}; ${n3(r.acerto)}`, [
  ["base", () => mede(A, B)], ["com 45", () => mede(A, comAtr(B, { com: 45 }))], ["pos 45", () => mede(A, comAtr(B, { pos: 45 }))], ["os dois", () => mede(A, comAtr(B, { com: 45, pos: 45 }))]]);
par("Entrelinhas × pressão adversária", "entrelinhas por jogo; acerto", r => `${n2(r.entre)}; ${n3(r.acerto)}`, [
  ["base", () => mede(A, B)], ["pressão 2", () => mede(A, B, {}, { pressao: 2 })], ["mov 45", () => mede(comAtr(A, { mov: 45 }), B)], ["os dois", () => mede(comAtr(A, { mov: 45 }), B, {}, { pressao: 2 })]]);
par("Lançamento × disputa aérea", "duelo aéreo ganho (passe longo)", r => n3(r.aereo), [
  ["base", () => mede(A, B, { passe: "longo" })], ["plo 45", () => mede(comAtr(A, { plo: 45 }), B, { passe: "longo" })], ["força 45 na frente", () => mede(comAtr(A, { for: 45 }, frente), B, { passe: "longo" })], ["os dois", () => mede(comAtr(comAtr(A, { plo: 45 }), { for: 45 }, frente), B, { passe: "longo" })]]);
par("Força do goleiro × disputa física", "segura na saída (atacante forte ao lado)", r => n3(r.segura), [
  ["base", () => mede(P3, B, { cruzamento: "alto", lado: "lados" })], ["goleiro 45", () => mede(P3, comAtr(B, { for: 45 }, goleiro), { cruzamento: "alto", lado: "lados" })], ["atacantes 45", () => mede(comAtr(P3, { for: 45 }, frente), B, { cruzamento: "alto", lado: "lados" })], ["os dois", () => mede(comAtr(P3, { for: 45 }, frente), comAtr(B, { for: 45 }, goleiro), { cruzamento: "alto", lado: "lados" })]]);

console.log(`| Par | Medida | Resultado (${N} jogos, mesmas sementes) |\n|---|---|---|\n${linhas.join("\n")}`);
