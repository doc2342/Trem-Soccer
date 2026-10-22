// Cera: o time que faz cera quando ganha segura mais o resultado? Quanto paga em cartões e em acréscimo?
// Uso: node ferramentas/sim_cera.mjs [jogos por linha] [CONFIG.chave=valor ...]   (chave com ponto para o que está dentro: cera.amarelo=0.02)
// Metas: ganho pequeno de pontos (não pode virar tática obrigatória), menos de 0,5 amarelo de cera por jogo e expulsão por cera rara.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarElenco } from "../src/gerador.js"; import { taticaBot } from "../src/bot.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 2000;
for (const a of process.argv.slice(3)) { const [k, v] = a.replace(/^CONFIG\./, "").split("="), ks = k.split("."), o = ks.slice(0, -1).reduce((o, x) => o[x], CONFIG); o[ks.at(-1)] = +v; }
const guardados = {}, elenco = s => guardados[s] || (guardados[s] = taticaBot(gerarElenco(criarRng(s), { nivel: 34, nomes, prefixoId: "e" + s + "_" })));
const f = x => (x / N).toFixed(2);
console.log(`${N} jogos por linha${process.argv.length > 3 ? " · " + process.argv.slice(3).join(" ") : ""} · A contra B (mesmo nível, sem as ordens de bot)`);
for (const [nome, extra] of [["sem cera", {}], ["cera", { cera: true }], ["cera e recuo", { cera: true, ordens: [{ min: 0, cond: "ganhando", muda: { mentalidade: -1 } }] }]]) {
  const rng = criarRng(33), t = { pts: 0, gm: 0, gs: 0, ataques: 0, amCera: 0, vmCera: 0, acr: 0, cera: 0 };
  for (let k = 0; k < N; k++) {
    const a = elenco(1 + k % 20), b = elenco(101 + k % 20), casa = k % 2;
    const ta = prepararTime({ nome: "A", escalacao: a.escalacao, banco: a.banco, instrucoes: { ...a.instrucoes, mentalidade: 0, ordens: [], ...extra } });
    const tb = prepararTime({ nome: "B", escalacao: b.escalacao, banco: b.banco, instrucoes: { ...b.instrucoes, mentalidade: 0, ordens: [] } });
    const p = casa ? simularPartida(rng, tb, ta) : simularPartida(rng, ta, tb), i = casa ? 1 : 0, g = p.placar;
    t.pts += g[i] > g[1 - i] ? 3 : g[i] === g[1 - i] ? 1 : 0; t.gm += g[i]; t.gs += g[1 - i]; t.ataques += p.estat[0].ataques + p.estat[1].ataques;
    t.acr += p.acrescimos.reduce((s, x) => s + x, 0);
    for (const e of p.eventos) if (e.time === i && /retardar o reinício/.test(e.texto)) { if (e.tipo === "vermelho") t.vmCera++; else t.amCera++; }
    if (p.eventos.some(e => e.time === i && /fazer cera/.test(e.texto))) t.cera++;
  }
  console.log(`  ${nome.padEnd(14)} pontos/jogo ${f(t.pts)}  gols ${f(t.gm)} x ${f(t.gs)}  ataques ${f(t.ataques)}  acréscimo ${f(t.acr)}  | com cera em ${(100 * t.cera / N).toFixed(0)}% dos jogos: amarelos de cera ${f(t.amCera)}, expulsões ${(100 * t.vmCera / N).toFixed(1)}/100 jogos`);
}
