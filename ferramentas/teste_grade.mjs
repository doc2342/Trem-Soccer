// Grade 5×5 (src/grade.js): geometria, espelho, linha/lado antigos, nomes, soma em 9 zonas e Decisão.
// Uso: node ferramentas/teste_grade.mjs
import assert from "node:assert";
import { ZONAS_GRADE, faixaDe, corredorDe, colunaDe, espelhoGrade, linhaDaZona, ladoDaZona, ehGrade, vizinhas, nomeDaZona, paraNoveZonas, decisao, MANCHAS, espelharGrade, manchasDoTime, defesaVista, defesaComAtraso, rapidezBasculacao, arrasto } from "../src/grade.js";
import { FORMACOES } from "../src/escalacao.js";
import { IDX } from "../src/modelo.js";
import { ZONAS, CONFIG } from "../src/motor.js";

assert.strictEqual(ZONAS_GRADE.length, 25);
assert.deepStrictEqual([faixaDe("4d"), corredorDe("4d"), colunaDe("4d")], [4, "d", 3]);
assert.ok(ZONAS_GRADE.every(ehGrade) && !ZONAS.some(ehGrade));
assert.strictEqual(espelhoGrade("1E"), "5D"); assert.strictEqual(espelhoGrade("4d"), "2e"); assert.strictEqual(espelhoGrade("3C"), "3C");
for (const z of ZONAS_GRADE) assert.strictEqual(espelhoGrade(espelhoGrade(z)), z);
assert.deepStrictEqual(["1C", "2d", "3e", "4E", "5D"].map(linhaDaZona), ["D", "M", "M", "A", "A"]);
assert.deepStrictEqual(["MC", "AE", "DD"].map(linhaDaZona), ["M", "A", "D"]); // 9 zonas segue igual
assert.deepStrictEqual(["2e", "2C", "2D"].map(ladoDaZona), ["C", "C", "D"]);
assert.deepStrictEqual(["MC", "AE", "DD"].map(ladoDaZona), ["C", "E", "D"]);

assert.strictEqual(vizinhas("1E").length, 3); assert.strictEqual(vizinhas("3C").length, 8);
assert.deepStrictEqual(vizinhas("5D").sort(), ["4D", "4d", "5d"]);

assert.strictEqual(nomeDaZona("4C"), "a zona 14");
assert.strictEqual(nomeDaZona("4d"), "o meio-espaço direito na faixa do meia ofensivo");
assert.strictEqual(nomeDaZona("5E"), "o fundo pela esquerda");
assert.strictEqual(nomeDaZona("5C"), "a entrada da área");
assert.strictEqual(nomeDaZona("1D"), "a saída de bola pela direita");
assert.strictEqual(nomeDaZona("2C", "defesa"), "a zona 14"); // a faixa 2 de quem defende é a 4 de quem ataca
for (const z of ZONAS_GRADE) assert.ok(nomeDaZona(z) && !nomeDaZona(z).includes("meia-lua"), z);

const nove = paraNoveZonas(Object.fromEntries(ZONAS_GRADE.map(z => [z, 1])));
assert.deepStrictEqual(Object.keys(nove).sort(), ZONAS.slice().sort());
assert.strictEqual(Object.values(nove).reduce((a, b) => a + b, 0), 25); // soma conservada
assert.strictEqual(nove.MC, 2 * (1 + 1)); // faixas 2 e 3, centro + metade de cada meio-espaço
assert.strictEqual(nove.DE, 1.5);
const noveEstat = paraNoveZonas({ "4d": [2, 4], "4D": [1, 1] });
assert.deepStrictEqual(noveEstat, { AD: [2, 3], AC: [1, 2] }); // pares [ganhos, perdidos]

const at = new Array(Object.keys(IDX).length).fill(10); at[IDX.cri] = 16; at[IDX.equ] = 12;
assert.strictEqual(decisao(at), 14);

// manchas: cada variante soma 1 nas duas fases, só com chaves da grade
const somaMapa = m => Object.values(m).reduce((a, b) => a + b, 0);
for (const [k, m] of Object.entries(MANCHAS)) for (const f of ["com", "sem"]) {
  assert.ok(Math.abs(somaMapa(m[f]) - 1) < 1e-9, k + " " + f);
  assert.ok(Object.keys(m[f]).every(z => ZONAS_GRADE.includes(z)), k + " " + f);
}
assert.deepStrictEqual(espelharGrade({ "1d": 0.4, "3C": 0.6, "5E": 1 }), { "1e": 0.4, "3C": 0.6, "5D": 1 });

const onze = f => (FORMACOES[f] || f).map(pos => ({ pos }));
const soma = (manchas, fase, z) => manchas.filter(Boolean).reduce((s, m) => s + (m[fase][z] || 0), 0);
const conferir = esc => {
  const ms = manchasDoTime(esc);
  assert.strictEqual(ms.length, esc.length);
  esc.forEach((j, i) => {
    if (j.pos === "GK") return assert.strictEqual(ms[i], null);
    for (const f of ["com", "sem"]) {
      assert.ok(Math.abs(somaMapa(ms[i][f]) - 1) < 1e-9 && Object.values(ms[i][f]).every(Number.isFinite), j.pos + " " + f);
      assert.ok(Object.keys(ms[i][f]).every(z => ZONAS_GRADE.includes(z)));
    }
  });
  return ms;
};
for (const f of Object.keys(FORMACOES)) conferir(onze(f));
// dupla de zaga, um em cada meio-espaço; somada sem a bola, o 1C fica perto de 0,70
const zaga = manchasDoTime(onze("4-4-2")).filter((m, i) => FORMACOES["4-4-2"][i] === "DC");
assert.ok(soma(zaga, "sem", "1C") > 0.6 && soma(zaga, "sem", "1C") < 0.8);
assert.ok(soma([zaga[0]], "com", "1d") > soma([zaga[0]], "com", "1e") && soma([zaga[1]], "com", "1e") > soma([zaga[1]], "com", "1d"));
// trio de zaga: meio-espaço direito, centro, meio-espaço esquerdo
const trio = manchasDoTime(onze("3-5-2 com alas")).slice(1, 4);
assert.deepStrictEqual(trio.map(m => m.sem), [MANCHAS.DC3d.sem, MANCHAS.DC3c.sem, espelharGrade(MANCHAS.DC3d.sem)]);
// árvore de Natal: os 2 AMC nos meios-espaços
const natal = manchasDoTime(onze("4-3-2-1 (árvore de Natal)"));
assert.ok(soma(natal.slice(8, 9), "com", "4d") > 0.5 && soma(natal.slice(9, 10), "com", "4e") > 0.5);
// escalação estranha: 3 SC, 2 AMC, sem lateral, 10 jogadores, 4 zagueiros
conferir(onze(["GK", "DC", "DC", "DC", "DC", "MC", "AMC", "AMC", "SC", "SC", "SC"].slice(0, 10)));
conferir(onze(["GK", "SW", "DC", "LW", "RW", "ML", "WBL", "AML", "DMC", "DMC", "DMC"]));
// 4-3-3 com pontas: com a bola, alguém nos dois meios-espaços da faixa 4 (spec 11)
const t433 = manchasDoTime(onze("4-3-3 com pontas"));
assert.ok(soma(t433, "com", "4d") > 0.15 && soma(t433, "com", "4e") > 0.15);

// Tarefa 4: defesa que o atacante enfrenta (atk e as zonas de dz na visão de quem ataca; def e posicionamento na de quem defende)
const V = CONFIG.gradeValores, mapa = (v, extra = {}) => ({ ...Object.fromEntries(ZONAS_GRADE.map(z => [z, v])), ...extra });
const somaM = m => Object.values(m).reduce((a, b) => a + b, 0), perto = (a, b) => Math.abs(a - b) < 1e-6;
const vista = (atk, def, corredorDaBola = "C") => defesaVista({ atk, def, posicionamento: mapa(25), corredorDaBola, V });
const def0 = mapa(10), atk0 = mapa(5);
for (const c of ["E", "e", "C", "d", "D"]) assert.ok(perto(somaM(vista(atk0, def0, c).dz), somaM(def0)), c); // total conservado
// bola no lado esquerdo do atacante: o lado direito dele (corredor livre, longe da bola) fica mais fraco que com a bola no centro
assert.ok(vista(atk0, def0, "E").dz["3D"] < vista(atk0, def0, "C").dz["3D"]);
assert.ok(vista(atk0, def0, "E").dz["3E"] > vista(atk0, def0, "C").dz["3E"]);
// zona vazia no 1d de quem defende (5e do atacante), com o volante livre na frente (2d, o 4e do atacante): o volante cobre, e perde o mesmo
{
  const def = mapa(10, { "1d": 0 }), atk = mapa(5, { "5e": 0, "4e": 0 });
  const sem = defesaVista({ atk, def, posicionamento: mapa(25), corredorDaBola: "C", V: { ...V, emprestimo: 0 } }).dz, com = vista(atk, def).dz;
  assert.ok(com["5e"] > sem["5e"] + 1);
  assert.ok(perto(com["5e"] - sem["5e"], sem["4e"] - com["4e"]));
  assert.strictEqual(vista(atk, def).buracos.profundidade, 1); // o zagueiro não precisou sair
}
// volante longe (2d vazio): o zagueiro desliza e abre a profundidade; com o zagueiro preso pelo 9, o lateral fecha e abre o cruzamento,
// a não ser que o ponta adversário o prenda no lado
{
  const def = mapa(10, { "1d": 0, "2d": 0 }), atk = mapa(5, { "5e": 0 });
  assert.ok(vista(atk, def).buracos.profundidade > 1);
  const preso = { ...atk, "5C": 20 };
  const r = vista(preso, def);
  assert.strictEqual(r.buracos.profundidade, 1); assert.ok(r.buracos.cruzamento > 1);
  const ponta = vista({ ...preso, "5E": 20 }, def);
  assert.ok(ponta.dz["5E"] >= def["1D"]); // o lateral preso pelo ponta não emprestou
  assert.ok(ponta.dz["5e"] < r.dz["5e"]);
}
// A3: zona 14 ocupada mas sobrecarregada (meio em caixa, ninguém aberto) recebe dos vizinhos não ameaçados; com eles ameaçados, não recebe
{
  const caixa = mapa(2, { "4C": 30 }), semEmprestimo = atk => defesaVista({ atk, def: def0, posicionamento: mapa(25), corredorDaBola: "C", V: { ...V, emprestimo: 0 } }).dz;
  assert.ok(vista(caixa, def0).dz["4C"] > semEmprestimo(caixa)["4C"] + 1);
  const abertos = { ...caixa, "3C": 20, "4e": 20, "4d": 20 };
  assert.ok(perto(vista(abertos, def0).dz["4C"], semEmprestimo(abertos)["4C"]));
}
// A4: basculação com atraso conserva a soma; rapidez 1 = arrumação atual, 0 = a anterior
{
  const arr = Object.fromEntries(["E", "C", "D"].map(c => [c, vista(atk0, def0, c)]));
  assert.ok(perto(somaM(defesaComAtraso(arr, "E", "D", 0.4)), somaM(def0)));
  assert.deepStrictEqual(defesaComAtraso(arr, "E", "D", 1), arr.D.dz);
  assert.deepStrictEqual(defesaComAtraso(arr, "E", "D", 0), arr.E.dz);
  assert.ok(perto(rapidezBasculacao(25, 25, V), 0.5) && rapidezBasculacao(0, 0, V) === 0.2 && rapidezBasculacao(80, 80, V) === 1);
}
// A5: arrasto
assert.ok(arrasto({ zona: "4C", folga: 2, V }).profundidade > 1);
assert.deepStrictEqual(arrasto({ zona: "4D", folga: 2, V }), { zonaFraca: "5d", fator: 1 - V.arrasto.lado });
assert.strictEqual(arrasto({ zona: "5E", folga: 2, V }).zonaFraca, "5e");
assert.strictEqual(arrasto({ zona: "3C", folga: 2, V }), null);
assert.strictEqual(arrasto({ zona: "4C", folga: 0.1, V }), null);

console.log("teste_grade: ok");
