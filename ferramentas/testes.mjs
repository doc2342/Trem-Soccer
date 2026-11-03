// Roda todos os ferramentas/teste_*.mjs e diz quais falharam (sai com erro se algum falhar). Em paralelo, menos os que medem tempo, que rodam sozinhos no fim.
// Uso: node ferramentas/testes.mjs   TESTES_PROCESSOS=n limita os processos (padrão: os núcleos menos 2)
import fs from "node:fs";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
const pasta = new URL(".", import.meta.url), testes = fs.readdirSync(pasta).filter(f => /^teste_.*\.mjs$/.test(f)).sort();
const SOZINHOS = new Set(["teste_grade_motor.mjs"]), maximo = +process.env.TESTES_PROCESSOS || Math.max(2, os.availableParallelism() - 2);
const rodar = f => new Promise(fim => {
  const t0 = Date.now(), p = spawn(process.execPath, [new URL(f, pasta).pathname.replace(/^\/(\w:)/, "$1")], { stdio: ["ignore", "pipe", "pipe"] });
  let saida = "", erro = ""; p.stdout.on("data", d => { saida += d; }); p.stderr.on("data", d => { erro += d; });
  p.on("close", (codigo, sinal) => fim({ f, ok: codigo === 0, codigo, sinal, texto: erro || saida, ms: Date.now() - t0 }));
});
const fila = testes.filter(f => !SOZINHOS.has(f)), feitos = [];
await Promise.all(Array.from({ length: maximo }, async () => { while (fila.length) feitos.push(await rodar(fila.shift())); }));
for (const f of testes) if (SOZINHOS.has(f)) feitos.push(await rodar(f));
const falhas = feitos.filter(r => !r.ok).sort((a, b) => a.f.localeCompare(b.f));
// tipo da falha: desempenho (a trava de custo), infraestrutura (processo morto por sinal), integração (módulo ou sintaxe), funcional (o resto)
const tipo = r => r.sinal || r.codigo == null ? "infraestrutura" : /custo da grade/.test(r.texto) ? "desempenho" : /SyntaxError|ERR_MODULE/.test(r.texto) ? "integração" : "funcional";
for (const r of falhas) console.log(`FALHOU ${r.f} (${tipo(r)}, código ${r.codigo}, sinal ${r.sinal})\n${r.texto.trim()}\n`);
// o registro completo de cada rodada: logs-testes/ (fora do git)
const pastaLog = new URL("../logs-testes/", import.meta.url), id = new Date().toISOString().replace(/[:.]/g, "-"), commit = execSync("git rev-parse --short HEAD").toString().trim();
fs.mkdirSync(pastaLog, { recursive: true });
fs.writeFileSync(new URL(`${id}.json`, pastaLog), JSON.stringify({ id, commit, sobre: "HEAD; o que está em teste é a árvore de trabalho", comando: process.argv.join(" "), saida: falhas.length ? 1 : 0, total: testes.length, aprovados: testes.length - falhas.length, reprovados: falhas.map(r => ({ f: r.f, tipo: tipo(r) })), testes: feitos.map(r => ({ f: r.f, ok: r.ok, codigo: r.codigo, sinal: r.sinal, ms: r.ms, tipo: r.ok ? null : tipo(r), erro: r.ok ? null : r.texto })) }, null, 1));
console.log("mais lentos:", [...feitos].sort((a, b) => b.ms - a.ms).slice(0, 5).map(r => `${r.f.replace(/^teste_|\.mjs$/g, "")} ${(r.ms / 1000).toFixed(0)} s`).join(", "));
console.log(`${testes.length - falhas.length}/${testes.length} ok`);
process.exit(falhas.length ? 1 : 0);
