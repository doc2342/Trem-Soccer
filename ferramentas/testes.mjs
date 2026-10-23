// Roda todos os ferramentas/teste_*.mjs e diz quais falharam (sai com erro se algum falhar). Uso: node ferramentas/testes.mjs
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const pasta = new URL(".", import.meta.url), testes = fs.readdirSync(pasta).filter(f => /^teste_.*\.mjs$/.test(f)).sort();
const falhas = testes.filter(f => {
  const r = spawnSync(process.execPath, [new URL(f, pasta).pathname.replace(/^\/(\w:)/, "$1")], { encoding: "utf8" });
  if (r.status === 0) return false;
  console.log(`FALHOU ${f}\n${(r.stderr || r.stdout).trim().split("\n").slice(-8).join("\n")}\n`); return true; });
console.log(`${testes.length - falhas.length}/${testes.length} ok`);
process.exit(falhas.length ? 1 : 0);
