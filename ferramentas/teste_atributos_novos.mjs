// Passe longo, Movimentação e Decisões: vetor de 25 só para quem é da T1, nota e sorteio de quem tem 22 iguais aos de sempre.
// Uso: node ferramentas/teste_atributos_novos.mjs
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze, gerarJogador, gerarElenco } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { jovensDaBase, juvenisDoReinicio } from "../src/base.js";
import { planejarVirada, entregaDosAtributos } from "../src/virada.js";
import { ATRIBUTOS, ATRIBUTOS_DA_T0, N_DA_T0, ATRIBUTOS_DESDE, IDX, PESOS, PESOS_T1, AJUSTE_INICIAL, LISTA_POSICOES, POSICOES, notaBruta, temNovos, pesosDe, atributosDe, atributosNovos, comNovos } from "../src/modelo.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const KS_T0 = "ref um enc com pos des mar cab cru cri pas dom lon fin dri vel for res equ agr inf exc".split(" ");

// o vetor: os 22 de sempre, na mesma ordem, e os 3 no fim
assert.deepStrictEqual(ATRIBUTOS.slice(0, 22).map(a => a.k), KS_T0);
assert.strictEqual(ATRIBUTOS.length, 25);
assert.strictEqual(ATRIBUTOS_DA_T0.length, 22);
assert.strictEqual(N_DA_T0, 22);
assert.strictEqual(ATRIBUTOS_DESDE, 1);
assert.deepStrictEqual([IDX.plo, IDX.mov, IDX.dec], [22, 23, 24]);
assert.strictEqual(ATRIBUTOS[IDX.plo].grupo, "tec");
assert.strictEqual(ATRIBUTOS[IDX.mov].grupo, "men");
assert.strictEqual(ATRIBUTOS[IDX.dec].grupo, "men");

// os pesos da T1: todo papel existe, cada linha soma 100 e só usa atributo que existe
assert.deepStrictEqual(Object.keys(PESOS_T1).sort(), Object.keys(PESOS).sort());
for (const [papel, p] of Object.entries(PESOS_T1)) {
  assert.strictEqual(Object.values(p).reduce((a, b) => a + b, 0), 100, papel);
  for (const k in p) assert.ok(k in IDX, k);
}
for (const pos of LISTA_POSICOES) assert.strictEqual(AJUSTE_INICIAL[pos].length, 3, pos);

// quem tem 22 lê os pesos de hoje, quem tem 25 lê os da T1
const notaAntiga = (at, pos) => { const p = PESOS[POSICOES[pos].papel]; let s = 0; for (const k in p) s += p[k] * at[IDX[k]]; return s / 100; };
const onze = gerarOnze(criarRng(7), FORMACOES["4-4-2"], { nivel: 30, nomes });
const at22 = onze[3].j.at;
assert.strictEqual(at22.length, 22);
assert.strictEqual(temNovos(at22), false);
assert.strictEqual(pesosDe(at22, "MC"), PESOS.MC);
assert.strictEqual(notaBruta(at22, "MC"), notaAntiga(at22, "MC"));
assert.strictEqual(atributosDe(onze[3].j).length, 22);

// mesma semente com novos: os 22 iguais, 25 no total, e o resto do gerador não muda
const comS = gerarOnze(criarRng(7), FORMACOES["4-4-2"], { nivel: 30, nomes, novos: true });
comS.forEach((x, i) => {
  assert.strictEqual(x.j.at.length, 25);
  assert.deepStrictEqual(x.j.at.slice(0, 22), onze[i].j.at);
  assert.strictEqual(x.j.pf, onze[i].j.pf);
  assert.strictEqual(x.j.nome, onze[i].j.nome);
});
assert.strictEqual(temNovos(comS[3].j.at), true);
assert.strictEqual(pesosDe(comS[3].j.at, "MC"), PESOS_T1.MC);
assert.strictEqual(atributosDe(comS[3].j).length, 25);
const padrao = gerarElenco(criarRng(9), { nomes }), comE = gerarElenco(criarRng(9), { nomes, novos: true });
assert.ok(padrao.every(j => j.at.length === 22));
assert.ok(comE.every(j => j.at.length === 25));
assert.deepStrictEqual(comE.map(j => j.at.slice(0, 22)), padrao.map(j => j.at));
const umSo = o => gerarJogador(criarRng(11), { id: "x", pos: "DC", alvo: 30, idade: 22, nomes, ...o });
assert.strictEqual(umSo({}).at.length, 22);
assert.strictEqual(umSo({ novos: true }).at.length, 25);

// atributosNovos: determinística, de 1 a 50, e a chave muda o sorteio
const j = { id: "j123", pos: "DC", idade: 28, at: at22 };
const novos = atributosNovos(j);
assert.deepStrictEqual(novos, atributosNovos(j));
assert.strictEqual(novos.length, 3);
assert.ok(novos.every(v => Number.isInteger(v) && v >= 1 && v <= 50));
assert.notDeepStrictEqual(novos, atributosNovos(j, "outra chave"));

// comNovos não altera j.at; quem já tem 25 devolve o mesmo vetor
const cheio = comNovos(j);
assert.strictEqual(j.at.length, 22);
assert.deepStrictEqual(cheio, [...at22, ...novos]);
assert.strictEqual(comNovos({ ...j, at: cheio }), cheio);

// o ajuste da nota: a 0,1 da nota antiga quando os 6 pontos bastam, e nenhum sai mais de 6 do sorteio
const semIdade = atributosNovos({ id: "sem", pos: "MC", at: at22 });
assert.ok(semIdade.every(Number.isFinite), "sem idade não dá NaN");
let dentro = 0, total = 0;
for (let s = 1; s <= 400; s++) {
  const pos = LISTA_POSICOES[s % LISTA_POSICOES.length];
  const x = gerarOnze(criarRng(s), [pos], { nivel: 20 + s % 20, nomes })[0].j;
  const at = comNovos({ ...x, id: "c" + s });
  total++;
  if (Math.abs(notaBruta(at, pos) - notaBruta(x.at, pos)) <= 0.1 + 1e-9) dentro++;
  assert.ok(at.every(v => v >= 1 && v <= 50));
}
assert.ok(dentro / total > 0.9, `só ${dentro} de ${total} a 0,1 da nota antiga`);

// ninguém salta na liga real
if (existsSync(new URL("../dados.json", import.meta.url))) {
  const { jog } = JSON.parse(readFileSync(new URL("../dados.json", import.meta.url)));
  const real = jog.filter(x => x.at && x.at.length === 22 && POSICOES[x.pos]).map(x => ({ ...x, id: "j" + x.id })); // a chave é "j123", como em doElenco
  const dif = real.map(x => Math.abs(notaBruta(comNovos(x), x.pos) - notaBruta(x.at, x.pos)));
  const media = dif.reduce((a, b) => a + b, 0) / dif.length;
  const acima = dif.filter(d => d > 0.3).length / dif.length;
  console.log(`real: ${real.length} jogadores, |dif| média ${media.toFixed(3)}, ${(acima * 100).toFixed(1)}% acima de 0,3, máx ${Math.max(...dif).toFixed(2)}`);
  assert.ok(media < 0.2, "média " + media);
  assert.ok(acima <= 0.04, "acima de 0,3: " + acima);
}

// a entrega da virada: só quem tem 22, id numérico, mesma chave "j123" do motor (o amistoso da T0 antecipa o que ele recebe)
assert.deepStrictEqual(entregaDosAtributos([]), []);
const cru = { id: 123, pos: "DC", idade: 28, at: at22 }, doElenco = { ...cru, id: "j123" };
const lote = entregaDosAtributos([cru, { ...cru, id: 124, at: [...at22, 1, 2, 3] }]);
assert.deepStrictEqual(lote, [{ id: 123, novos: atributosNovos(doElenco) }]);
assert.deepStrictEqual(entregaDosAtributos([doElenco]), lote);
assert.deepStrictEqual([...at22, ...lote[0].novos], comNovos(doElenco));

// quem gera: pela temporada
const base = temporada => jovensDaBase(criarRng(3), { nivel: 2, nomes, usados: new Set(), temporada })[0].at.length;
assert.strictEqual(base(0), 22);
assert.strictEqual(base(1), 25);
assert.ok(juvenisDoReinicio(criarRng(3), { nomes, usados: new Set() }).every(j => j.at.length === 22));
assert.ok(juvenisDoReinicio(criarRng(3), { nomes, usados: new Set(), temporada: 1 }).every(j => j.at.length === 25));

// jovem da virada: T0→T1 nasce com 25, o elenco que passa pela virada continua com 22 até a entrega
const virada = temporada => {
  const rng = criarRng(5), el = gerarElenco(rng, { nivel: 30, nomes }).slice(0, 18).map((x, i) => ({ ...x, id: "j" + (i + 1), idade: i ? 25 : 38, salario: 500, mercado: 500, contratoAte: 9, aposentaEm: i ? null : temporada }));
  const clube = { id: 1, grupo: "A", divisao: 1, dono: null, ultimo_acesso: null, nome: "Trem", perfil: "equilibrado" };
  return planejarVirada({ rng, liga: { temporada }, clubes: [clube], elencos: { 1: el }, talentos: {}, partidas: [], resultados: [], nomes, comLivres: true, juvenis: true, semMovimentos: true }).plano;
};
const p1 = virada(0), p0 = virada(-1);
assert.ok(p1.novos.length > 0, "a virada gerou jovens");
assert.ok(p1.novos.every(n => n.at.length === 25), "jovem da T1 com 25");
assert.ok(p0.novos.every(n => n.at.length === 22), "antes da T1, 22");
assert.ok(p1.jogadores.filter(x => x.at).every(x => x.at.length === 22), "elenco antigo com 22 até a entrega");

console.log("ok");
