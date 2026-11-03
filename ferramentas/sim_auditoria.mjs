// Auditoria de mecânicas (memória revisar-mecanicas): todo atributo em toda linha, +B na linha inteira, mesmo onze e mesma semente com e sem o reforço, pró e contra separados, em xG e em gols
// (Finalização e goleiro podem não passar pelo xG). Cada célula vai para uma linha do arquivo de saída assim que termina: rodar de novo retoma de onde parou.
// Atributo que não muda nada em 200 jogos sai como exato: nenhum caminho do motor leu.
// Uso: SAIDA=pasta PARTE=0/2 [B=18] node ferramentas/sim_auditoria.mjs [jogos por célula] [formação]
//   CELULAS="laterais=DR,DL:cru,mov;zaga=DC:cab" troca a grade inteira por essas células; INSTR='{"impedimento":true}' é a instrução do time reforçado; ROTULO separa os arquivos da pasta.
import { readFileSync, readdirSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { ATRIBUTOS, IDX } from "../src/modelo.js";
import { prepararTime, simularPartida } from "../src/motor.js";

os.setPriority(os.constants.priority.PRIORITY_LOW);
const N = +process.argv[2] || 6000, formacao = process.argv[3] || "4-2-3-1", B = +process.env.B || 18, EXATO = 200;
const pasta = process.env.SAIDA || ".", [parte, partes] = (process.env.PARTE || "0/1").split("/").map(Number);
mkdirSync(pasta, { recursive: true });
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const vagas = FORMACOES[formacao];
const rotulo = process.env.ROTULO || formacao, instr = JSON.parse(process.env.INSTR || "{}");
const CELULAS = process.env.CELULAS ? process.env.CELULAS.split(";").flatMap(c => { const [nome, r] = c.split("="), [ps, ks] = r.split(":"); return ks.split(",").map(k => [nome, ps.split(","), k]); }) : null;
const LINHAS = [["goleiro", ["GK"]], ["defesa", ["DC", "SW", "DR", "DL", "WBR", "WBL"]], ["volante", ["DMC"]], ["meio", ["MC", "MR", "ML", "AMC", "AMR", "AML"]], ["ataque", ["RW", "LW", "FC", "SC"]]].filter(([, ps]) => vagas.some(p => ps.includes(p)));
const onzes = Array.from({ length: 40 }, (_, s) => ["a", "b"].map(p => gerarOnze(criarRng(5000 + s), vagas, { nivel: 30, nomes, prefixoId: p + s + "_", novos: true })));
const jogo = (n, a, b) => {
  const ta = prepararTime({ nome: "A", escalacao: a, instrucoes: instr }), tb = prepararTime({ nome: "B", escalacao: b }), casa = n % 2 === 0;
  const r = casa ? simularPartida(criarRng(77 + n), ta, tb, { regrasT1: true }) : simularPartida(criarRng(77 + n), tb, ta, { regrasT1: true });
  const [x, g] = [r.xg, r.placar];
  return casa ? [x[0], x[1], g[0], g[1]] : [x[1], x[0], g[1], g[0]];
};
const arqBase = join(pasta, `base_${rotulo}_${N}.json`);
const base = existsSync(arqBase) ? JSON.parse(readFileSync(arqBase)) : Array.from({ length: N }, (_, n) => jogo(n, ...onzes[n % 40]));
if (!existsSync(arqBase)) writeFileSync(arqBase, JSON.stringify(base));

const media = (s, n) => s / n, erro = (s, q, n) => Math.sqrt(Math.max(0, q / n - (s / n) ** 2) / n);
function celula(k, ps) {
  const soma = [0, 0, 0, 0], quad = [0, 0, 0, 0]; // pró xG, contra xG, pró gols, contra gols
  for (let n = 0; n < N; n++) {
    const [a, b] = onzes[n % 40], forte = a.map(x => ps.includes(x.pos) ? { ...x, j: { ...x.j, at: x.j.at.map((v, i) => i === IDX[k] ? Math.min(50, v + B) : v) } } : x);
    const r = jogo(n, forte, b), b0 = base[n], d = [r[0] - b0[0], b0[1] - r[1], r[2] - b0[2], b0[3] - r[3]];
    d.forEach((v, i) => { soma[i] += v; quad[i] += v * v; });
    if (n + 1 === EXATO && quad.every(q => q === 0)) return { exato: true, n: EXATO };
  }
  return { n: N, xg: [media(soma[0], N), media(soma[1], N)], xgErro: [erro(soma[0], quad[0], N), erro(soma[1], quad[1], N)], gols: [media(soma[2], N), media(soma[3], N)], golsErro: [erro(soma[2], quad[2], N), erro(soma[3], quad[3], N)] };
}
const saida = join(pasta, `celulas_${rotulo}_${N}.${parte}.jsonl`);
const feitas = new Set(readdirSync(pasta).filter(a => a.startsWith(`celulas_${rotulo}_${N}.`)).flatMap(a => readFileSync(join(pasta, a), "utf8").trim().split("\n").filter(Boolean).map(l => { const c = JSON.parse(l); return c.linha + "|" + c.k; }))); // de todas as partes: dá para retomar com outro número de processos
let i = 0;
for (const [linha, ps, k] of CELULAS || LINHAS.flatMap(([l, ps]) => ATRIBUTOS.map(a => [l, ps, a.k]))) {
  if (i++ % partes !== parte || feitas.has(linha + "|" + k)) continue;
  const t = Date.now(), c = celula(k, ps);
  appendFileSync(saida, JSON.stringify({ linha, k, ...c, s: Math.round((Date.now() - t) / 1000) }) + "\n");
}
console.log("fim da parte", parte);
