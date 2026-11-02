// Roda todos os ferramentas/teste_*.mjs e diz quais falharam (sai com erro se algum falhar). Em paralelo, menos os que medem tempo, que rodam sozinhos no fim.
// Uso: node ferramentas/testes.mjs   TESTES_PROCESSOS=n limita os processos (padrão: os núcleos menos 2)
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
const pasta = new URL(".", import.meta.url), testes = fs.readdirSync(pasta).filter(f => /^teste_.*\.mjs$/.test(f)).sort();
const SOZINHOS = new Set(["teste_grade_motor.mjs"]), maximo = +process.env.TESTES_PROCESSOS || Math.max(2, os.availableParallelism() - 2);
const rodar = f => new Promise(fim => {
  const t0 = Date.now(), p = spawn(process.execPath, [new URL(f, pasta).pathname.replace(/^\/(\w:)/, "$1")], { stdio: ["ignore", "pipe", "pipe"] });
  let saida = "", erro = ""; p.stdout.on("data", d => { saida += d; }); p.stderr.on("data", d => { erro += d; });
  p.on("close", codigo => fim({ f, ok: codigo === 0, texto: erro || saida, ms: Date.now() - t0 }));
});
const fila = testes.filter(f => !SOZINHOS.has(f)), feitos = [];
await Promise.all(Array.from({ length: maximo }, async () => { while (fila.length) feitos.push(await rodar(fila.shift())); }));
for (const f of testes) if (SOZINHOS.has(f)) feitos.push(await rodar(f));
const falhas = feitos.filter(r => !r.ok).sort((a, b) => a.f.localeCompare(b.f));
for (const r of falhas) console.log(`FALHOU ${r.f}\n${r.texto.trim().split("\n").slice(-8).join("\n")}\n`);
console.log("mais lentos:", [...feitos].sort((a, b) => b.ms - a.ms).slice(0, 5).map(r => `${r.f.replace(/^teste_|\.mjs$/g, "")} ${(r.ms / 1000).toFixed(0)} s`).join(", "));
console.log(`${testes.length - falhas.length}/${testes.length} ok`);
process.exit(falhas.length ? 1 : 0);
