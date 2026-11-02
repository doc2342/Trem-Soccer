// Grade 5×5 (src/grade.js): geometria, espelho, linha/lado antigos, nomes, soma em 9 zonas e Decisão.
// Uso: node ferramentas/teste_grade.mjs
import assert from "node:assert";
import { ZONAS_GRADE, faixaDe, corredorDe, colunaDe, espelhoGrade, linhaDaZona, ladoDaZona, ehGrade, vizinhas, nomeDaZona, paraNoveZonas, decisao, MANCHAS, espelharGrade, manchasDoTime, defesaVista, defesaComAtraso, rapidezBasculacao, arrasto,
  tipoDoPasso, opcoesDoPasso, dificuldade, valorDaZona, escolherPasso, proximoImpulso, segundaBola, LIMITE_DE_PASSOS } from "../src/grade.js";
import { criarRng } from "../src/rng.js";
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

const at = new Array(Object.keys(IDX).length).fill(10); at[IDX.dec] = 14;
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

// Tarefa 5: o passo
assert.strictEqual(tipoDoPasso("2E", "3e"), "diagonal"); assert.strictEqual(tipoDoPasso("3d", "3e"), "virada");
assert.strictEqual(tipoDoPasso("2E", "2D"), "virada"); assert.strictEqual(tipoDoPasso("1C", "5C"), "pular");
assert.strictEqual(tipoDoPasso("3C", "2C"), "voltar"); assert.strictEqual(tipoDoPasso("1E", "3D"), "inversao");
assert.strictEqual(tipoDoPasso("2C", "3C"), "subir"); assert.strictEqual(tipoDoPasso("3e", "3C"), "lado");
assert.strictEqual(tipoDoPasso("3E", "2D"), "virada"); assert.strictEqual(tipoDoPasso("2E", "3C"), "inversao");
// opções: nunca a própria zona, volta só uma faixa, condução só em subir/diagonal/lado
for (const z of ZONAS_GRADE) {
  const ops = opcoesDoPasso(z);
  assert.ok(ops.length && ops.every(o => o.para !== z && ZONAS_GRADE.includes(o.para) && faixaDe(o.para) >= faixaDe(z) - 1 && o.tipo === tipoDoPasso(z, o.para)), z);
  assert.ok(ops.filter(o => o.conduzir).every(o => ["subir", "diagonal", "lado"].includes(o.tipo)), z);
}
assert.ok(opcoesDoPasso("1C").some(o => o.para === "5C" && o.tipo === "pular"));
assert.ok(opcoesDoPasso("3C").some(o => o.para === "3C") === false && opcoesDoPasso("3E").some(o => o.para === "2D" && o.tipo === "virada"));
// escada: voltar > lado > subir > pular > virada (em acerto)
{
  const esc = [["voltar", "3C", "2C"], ["lado", "3C", "3d"], ["subir", "2C", "3C"], ["pular", "1C", "3C"], ["virada", "2E", "2D"]].map(([t, a, b]) => dificuldade(t, a, b, V));
  for (let k = 1; k < esc.length; k++) assert.ok(esc[k - 1] > esc[k], "escada " + k);
}
// do meio-espaço, a diagonal é mais fácil que do centro; do lado para dentro, mais difícil; perto do gol, mais difícil
assert.ok(dificuldade("diagonal", "3d", "4C", V) > dificuldade("diagonal", "3C", "4d", V));
assert.ok(dificuldade("lado", "3E", "3e", V) < dificuldade("lado", "3e", "3E", V) && dificuldade("lado", "3e", "3D", V) < dificuldade("lado", "3e", "3C", V));
assert.ok(dificuldade("subir", "4C", "5C", V) < dificuldade("subir", "2C", "3C", V));
assert.ok(dificuldade("inversao", "1E", "3D", V) < dificuldade("inversao", "2E", "3C", V));
// valor da zona: o xT da 5×5, plano na largura até a faixa 5
assert.strictEqual(valorDaZona("1E", V), valorDaZona("1C", V)); assert.strictEqual(valorDaZona("4d", V), 0.075);
assert.deepStrictEqual(["5E", "5e", "5C", "5d", "5D"].map(z => valorDaZona(z, V)), [0.13, 0.15, 0.22, 0.15, 0.13]);
// Decisão: com as mesmas opções, o decisor 45 escolhe a de maior valor mais vezes que o de 10
{
  const sortear = (rng, lista, peso) => { let t = 0; const p = lista.map(x => { const w = Math.max(0, peso(x)); t += w; return w; }); let r = rng.n() * t; for (let i = 0; i < lista.length; i++) { r -= p[i]; if (r <= 0) return lista[i]; } return lista[lista.length - 1]; };
  const ops = [{ para: "3C", v: 0.03 }, { para: "3d", v: 0.02 }, { para: "2C", v: 0.012 }, { para: "4C", v: 0.05 }];
  const melhor = dec => { const rng = criarRng(7); let n = 0; for (let k = 0; k < 10000; k++) if (escolherPasso(rng, ops, o => o.v, dec, V, sortear).para === "4C") n++; return n; };
  assert.ok(melhor(45) > melhor(25) + 100 && melhor(25) > melhor(10) + 100);
  assert.ok(escolherPasso(criarRng(1), ops, () => -1, 20, V, sortear)); // valor nenhum positivo: ainda escolhe alguma
  // valores negativos (perto do próprio gol) não viram iguais: a menos ruim ganha, e o bom decisor a acha mais
  const melhorNeg = dec => { const rng = criarRng(7); let n = 0; for (let k = 0; k < 10000; k++) if (escolherPasso(rng, ops, o => o.v - 1, dec, V, sortear).para === "4C") n++; return n; };
  assert.ok(melhorNeg(25) === melhor(25) && melhorNeg(45) > melhorNeg(10));
  // null: opção impossível; multDe multiplica a nota
  for (let s = 0; s < 50; s++) assert.notStrictEqual(escolherPasso(criarRng(s), ops, o => o.para === "4C" ? null : o.v, 25, V, sortear).para, "4C");
  const vezes = m => { const rng = criarRng(3); let n = 0; for (let k = 0; k < 10000; k++) if (escolherPasso(rng, ops, o => o.v, 25, V, sortear, o => o.para === "3C" ? m : 1).para === "3C") n++; return n; };
  assert.ok(vezes(1.5) > vezes(1) + 300);
}
// impulso: nunca passa do teto; de frente pela diagonal do meio-espaço só com companheiro no corredor vizinho; o maior vale, nunca a soma
{
  const imp = o => proximoImpulso({ folga: 0, tipo: "subir", de: "3C", temVizinho: false, pressaoAdv: 0, mentalidadeAdv: 0, V, ...o });
  assert.ok(imp({ folga: 9 }).logit <= Math.max(V.impulso.teto, V.impulso.deFrente) + 1e-9);
  assert.strictEqual(imp({ folga: -1 }).logit, 0);
  assert.strictEqual(imp({ tipo: "diagonal", de: "3d", folga: 0.1 }).deFrente, false);
  assert.strictEqual(imp({ tipo: "diagonal", de: "3d", folga: 0.1, temVizinho: true }).deFrente, true);
  assert.strictEqual(imp({ tipo: "diagonal", de: "3C", folga: 0.1, temVizinho: true }).deFrente, false); // centro→: sem bônus
  assert.strictEqual(imp({ folga: 2 }).deFrente, true); // a folga passou do giro
  assert.strictEqual(imp({ tipo: "subir", de: "3E", folga: 0.1 }).prende, true); // reto pela lateral
  assert.strictEqual(imp({ tipo: "subir", de: "2C", folga: 0.1 }).prende, true); // vertical pelo centro, apertado
  assert.strictEqual(imp({ tipo: "subir", de: "2C", folga: 2 }).prende, false); // girou
  assert.strictEqual(imp({ tipo: "diagonal", de: "2C", folga: 0.1 }).prende, false);
  // A2: volta ganha contra pressão 2 → logit > 0; contra pressão 0 ou mentalidade −2 → 0; nunca soma com o embalo
  assert.ok(perto(imp({ tipo: "voltar", pressaoAdv: 2 }).logit, V.atrairPressao * 2));
  assert.strictEqual(imp({ tipo: "voltar", pressaoAdv: 0 }).logit, 0);
  assert.strictEqual(imp({ tipo: "voltar", pressaoAdv: 2, mentalidadeAdv: -2 }).logit, 0);
  const emb = imp({ tipo: "voltar", folga: 0.3 }).logit;
  assert.ok(perto(imp({ tipo: "voltar", folga: 0.3, pressaoAdv: 2 }).logit, Math.max(emb, V.atrairPressao * 2)));
}
assert.strictEqual(LIMITE_DE_PASSOS, 30);

// Tarefa 8: segunda bola pela presença, com o acaso segurando: igual dá ~50%; 3× mais presença fica abaixo de 85%; sem ninguém, 50%
{
  const r = criarRng(8), V = CONFIG.gradeValores, taxa = (a, b) => { let n = 0; for (let k = 0; k < 10000; k++) n += segundaBola(r, a, b, V); return n / 10000; };
  assert.ok(Math.abs(taxa(1, 1) - 0.5) < 0.02);
  const t3 = taxa(3, 1);
  assert.ok(t3 > 0.6 && t3 < 0.85, `3x: ${t3}`);
  assert.ok(Math.abs(taxa(0, 0) - 0.5) < 0.02);
}

console.log("teste_grade: ok");
