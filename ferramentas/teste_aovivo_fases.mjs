// Narração em fases (Tarefa 11b): o servidor grava a jogada, sem o resultado, e o desfecho na hora em que a jogada termina; as telas leem a mesma hora.
// Uso: node ferramentas/teste_aovivo_fases.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { desdobrarFases, fasesNoAr, lancesDaTransmissao, tempoDaFrase, FASES } from "../src/rodada.js";

// o tempo acompanha o tamanho do texto, sem contar as marcas de time
assert.strictEqual(tempoDaFrase("{1:Rival} circula"), FASES.minimo);
assert.strictEqual(tempoDaFrase("x".repeat(400)), FASES.maximo);
assert.ok(tempoDaFrase("x".repeat(100)) > tempoDaFrase("x".repeat(60)));
assert.strictEqual(tempoDaFrase("{0:Adir} chuta"), tempoDaFrase("Adir chuta"));

// o desfecho sai da última frase; o resto vai para a jogada
assert.deepStrictEqual(desdobrarFases(["A toca", "B finaliza: GOL!"]), { antes: ["A toca", "B finaliza…"], desfecho: "GOL!" });
assert.deepStrictEqual(desdobrarFases(["B finaliza: a bola sai pela linha de fundo."]), { antes: ["B finaliza…"], desfecho: "A bola sai pela linha de fundo." });
assert.deepStrictEqual(desdobrarFases(["B se prepara para chutar, mas C volta a tempo e bloqueia o chute."]), { antes: ["B se prepara para chutar…"], desfecho: "Mas C volta a tempo e bloqueia o chute." });
assert.deepStrictEqual(desdobrarFases(["A toca", "C desarma B na área."]), { antes: ["A toca"], desfecho: "C desarma B na área." });
assert.deepStrictEqual(desdobrarFases(["{0:B} finaliza: {1:G} defende."]), { antes: ["{0:B} finaliza…"], desfecho: "{1:G} defende." });

const seg = 1000, ini = 1000000000000;
const hora = l => ini + ((l.min - 1) * 60 + (l.s || 0)) * seg;
const fim = () => ini + 95 * 60 * seg;
const linha = (n, min, s, extra = {}) => ({ n, min, s, time: 0, texto: "t" + n, ...extra });
const gol = (n, min, s) => linha(n, min, s, { resultado: "gol", quem: "B", texto: "A toca. B finaliza: GOL!", fases: ["A toca para B", "B finaliza: GOL!"] });

// sem fases (T0), as linhas saem iguais: mesma ordem, mesma hora, nenhum lance a mais
{
  const n = [linha(1, 3, 10), linha(2, 3, 40), linha(3, 7, 30)];
  const ls = lancesDaTransmissao(n, 9, hora, fim);
  assert.deepStrictEqual(ls.map(l => [l.ordem, l.partida_id, l.min, l.libera_em]), n.map((l, i) => [i, 9, l.min, new Date(hora(l)).toISOString()]));
  assert.deepStrictEqual(ls.map(l => l.dados), n);
}

// com fases: a jogada sai sem o resultado; o desfecho, com tudo, na hora em que a jogada termina
{
  const g = gol(5, 10, 30), [j, d] = lancesDaTransmissao([g], 9, hora, fim);
  assert.strictEqual(j.dados.tipo, "jogada");
  assert.ok(!/GOL|resultado|finalizador/.test(JSON.stringify(j.dados)), "a jogada não pode levar o resultado");
  assert.strictEqual(j.dados.n, 5);
  assert.deepStrictEqual(j.dados.fases, ["A toca para B", "B finaliza…"]);
  assert.strictEqual(j.dados.comeca, hora(g));
  assert.strictEqual(j.dados.tempos[0], 0);
  const dur = tempoDaFrase("A toca para B") * seg + (tempoDaFrase("B finaliza…") + FASES.pausa) * seg;
  assert.strictEqual(j.dados.fim, hora(g) + dur);
  assert.strictEqual(new Date(d.libera_em).getTime(), hora(g) + dur); // o gol só existe nesta hora, em qualquer tela
  assert.strictEqual(d.dados, g);
  assert.strictEqual(new Date(j.libera_em).getTime(), hora(g) - FASES.antecedencia * seg); // chega antes da hora: a tela busca a cada 10 s
  assert.deepStrictEqual([j.ordem, d.ordem], [0, 1]);
}

// a frase única sem nada para mostrar antes do desfecho sai como sempre
{
  const l = linha(1, 5, 0, { fases: ["C desarma B."] });
  assert.strictEqual(lancesDaTransmissao([l], 9, hora, fim).length, 1);
}

// o lance seguinte espera a jogada acabar, e ordem e hora andam juntas (a busca pede só ordem maior que a última)
{
  const g = gol(1, 10, 30), a = linha(2, 10, 31), b = gol(3, 10, 32), c = linha(4, 30, 0);
  const ls = lancesDaTransmissao([g, a, b, c], 9, hora, fim), t = l => new Date(l.libera_em).getTime();
  ls.forEach((l, i) => { assert.strictEqual(l.ordem, i); if (i) assert.ok(t(l) >= t(ls[i - 1]), "hora fora de ordem"); });
  const desf1 = ls[1], seg1 = ls[2];
  assert.ok(t(seg1) >= t(desf1) + FASES.folga * seg);
  assert.strictEqual(t(ls[ls.length - 1]), hora(c)); // a fila acaba: o relógio não fica atrasado
}

// a jogada encolhe para acabar antes do apito
{
  const g = gol(1, 45, 58), lim = hora(g) + 4 * seg;
  const [j, d] = lancesDaTransmissao([g], 9, hora, () => lim);
  assert.strictEqual(new Date(d.libera_em).getTime(), lim);
  assert.strictEqual(j.dados.fim, lim);
}

// o ao vivo sabe quantas fases já saíram
{
  const d = { comeca: 1000, tempos: [0, 3000, 7000], fases: ["a", "b", "c"] };
  assert.deepStrictEqual([999, 1000, 3999, 4000, 99999].map(t => fasesNoAr(d, t)), [0, 1, 1, 2, 3]);
}

// no motor (só na grade)
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const time = (f, s, m) => prepararTime({ nome: "T" + s, escalacao: gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_" }).map(x => ({ j: x, pos: x.pos, ...x })), banco: [], instrucoes: {}, mandante: m, prevencao: 0 });
const NOME = "\\{[01]:[^}]+\\}", PASSA = new RegExp(`^(${NOME}) (?:inverte para|acha|vira o jogo para|lança por cima da linha para) (${NOME})`);
let tabela = 0, escora = 0, morre = 0, pulos = 0, formas = { gol: 0, outro: 0 }, longos = 0;
for (let s = 1; s <= 300; s++) {
  const p = simularPartida(criarRng(s), time("4-2-3-1", s * 2, true), time("4-4-2", s * 2 + 1, false), { regrasT1: true });
  for (const l of p.narracao) {
    if (!l.fases) continue;
    assert.ok(l.texto.endsWith(l.fases[l.fases.length - 1]));
    const t = l.fases.join(" ");
    if (/tabela com/.test(t)) tabela++;
    if (/deixa de primeira para/.test(t)) escora++;
    if (l.resultado === undefined) morre++;
    if (l.fases.length >= 6) longos++;
    if (/tenta cortar|tenta encobrir|finge o chute/.test(t)) formas[l.resultado === "gol" ? "gol" : "outro"]++;
    l.fases.forEach((f, i) => { const m = f.match(PASSA), x = l.fases[i + 1]; if (m && x && m[1] !== m[2] && x.startsWith(m[1] + " ") && !f.endsWith("toca para " + m[1]) && !/recebe|segue/.test(x)) pulos++; });
  }
}
assert.ok(tabela > 0, "tabela sem frase própria");
assert.ok(escora > 0, "terceiro homem sem frase própria");
assert.ok(morre > 300, "a jogada perigosa que morre também sai em fases");
assert.ok(longos > 300, "a jogada longa tem que existir");
assert.ok(formas.gol > 0 && formas.outro > 0, "a forma do cara a cara não pode entregar o gol");
assert.strictEqual(pulos, 0, "passe narrado e o passador segue com a bola: faltou contar a devolução");

// T0: nada disso
{
  const p = simularPartida(criarRng(5), time("4-2-3-1", 10, true), time("4-4-2", 11, false), { regrasT1: false });
  assert.ok(p.narracao.every(l => !l.fases));
}
console.log("ok: narração em fases");
