// Simulações do treino, com as regras de src/treino.js. Não faz parte do jogo: é carregada à mão pelo navegador, numa página do site.
//   const S = await import("./ferramentas/sim_treino.js");
//   await S.jovens({ n: 300 })                  -> idade em que o jovem da base vira reserva útil e em que chega ao teto, por estrutura do clube
//   await S.liga({ temporadas: 8, humanos: 3 }) -> nível dos elencos temporada a temporada (alvo: 38 / 35 / 32 nos titulares de A / B / C)
import * as T from "../src/treino.js";
import * as G from "../src/gerador.js";
import * as N from "../src/rng.js";
import * as M from "../src/modelo.js";

const POS = ["GK", "DC", "DC", "DR", "DL", "DMC", "MC", "MC", "MR", "ML", "AMC", "AMR", "AML", "FC", "SC", "RW", "LW"];
const FISICOS = M.ATRIBUTOS.map((a, i) => a.grupo === "fis" ? i : -1).filter(i => i >= 0);
const nomes = () => fetch("./dados/nomes.json").then(r => r.json());
const quantil = (xs, q) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const f1 = v => v == null ? "—" : v.toFixed(1), pct = v => Math.round(v * 100) + "%";
const areasDe = mult => Object.fromEntries(Object.keys(T.AREAS).map(k => [k, mult]));
const sessao = (j, o) => { const r = T.treinar(j, o); if (r) { j.at = r.at; j.pts = r.pts; } };

// estruturas de clube para comparar: centro de treinamento, qualidade dos treinadores (multiplicador de todas as áreas) e se o jovem joga
export const estruturas = () => ({
  "sem nada": { ct: 0, treinador: T.CONFIG_TREINO.treinador[0], joga: false },
  "meio": { ct: 2, treinador: T.CONFIG_TREINO.treinador[0] + T.CONFIG_TREINO.treinador[1] * 0.5, joga: null },
  "tudo": { ct: 5, treinador: T.CONFIG_TREINO.treinador[0] + T.CONFIG_TREINO.treinador[1], joga: true },
});

// Jovens da base (16 a 18 anos, nota 13 a 21): quando viram úteis (nota `util`) e quando chegam ao teto, em cada estrutura.
export async function jovens({ n = 300, util = 26, chegada = [16, 18], semente = 7 } = {}) {
  const nm = await nomes(), out = {};
  for (const [nome, e] of Object.entries(estruturas())) {
    const rng = N.criarRng(semente), rs = [];
    for (let k = 0; k < n; k++) {
      const nivel = rng.pick([0, 0, 1, 1, 2, 3]), pos = rng.pick(POS), alvo = Math.max(13, Math.min(21, 15 + 0.6 * nivel + rng.normal(0, 1.5)));
      let j = G.gerarJogador(rng, { id: "x", pos, alvo, idade: 17, nomes: nm, usados: new Set() });
      const tal = Math.max(1, Math.min(100, j.tal + 4 * nivel)), teto = T.tetoDaNota(tal), areas = areasDe(e.treinador);
      j = { ...j, idade: rng.int(chegada[0], chegada[1]), pts: null, treino: null };
      const r = { teto, noTeto: null, util: null };
      for (; j.idade <= 31; j.idade++) for (let s = 0; s < 18; s++) {
        const nota = M.notaBruta(j.at, pos);
        if (r.util == null && nota >= Math.min(util, teto - 2)) r.util = j.idade + s / 18;
        if (r.noTeto == null && nota >= teto - 0.25) r.noTeto = j.idade + s / 18;
        sessao(j, { tal, ct: e.ct, jogou: e.joga == null ? nota >= util : e.joga, areas });
      }
      rs.push(r);
    }
    const chegam = rs.filter(r => r.noTeto != null), uteis = rs.filter(r => r.teto >= util + 4 && r.util != null);
    out[nome] = { "chegam ao teto": pct(chegam.length / n), "entre 25 e 28": pct(chegam.filter(r => r.noTeto >= 25 && r.noTeto < 29).length / n),
      "idade no teto (10% · mediana · 90%)": [0.1, 0.5, 0.9].map(q => f1(quantil(chegam.map(r => r.noTeto), q))).join(" · "),
      [`idade em que vira útil, nota ${util} (10% · mediana · 90%)`]: [0.1, 0.5, 0.9].map(q => f1(quantil(uteis.map(r => r.util), q))).join(" · ") };
  }
  return out;
}

// Liga de 50 clubes ao longo das temporadas: treino a cada rodada, envelhecimento, queda física, aposentadoria e reposição por jovens.
// humanos: quantos clubes têm dirigente (estrutura sorteada); os demais treinam como clube sem dono.
// O mercado não é simulado: o "nível possível" de cada divisão sai de ordenar todos os jogadores da liga (os 110 melhores seriam os titulares
// da Série A, os 220 seguintes os das B e os 220 seguintes os das C), que é para onde o teto de folha empurra.
export async function liga({ temporadas = 8, humanos = 3, semente = 11 } = {}) {
  const nm = await nomes(), rng = N.criarRng(semente), usados = new Set(), clubes = [], C = T.CONFIG_TREINO;
  for (let c = 0; c < 50; c++) {
    const dono = c < humanos, e = dono ? { ct: rng.int(1, 5), treinador: C.treinador[0] + C.treinador[1] * (0.3 + 0.7 * rng.n()) } : { ct: 0, treinador: C.treinador[0] + C.treinador[1] * C.qualidadeSemDono / 50 };
    clubes.push({ ...e, dono, elenco: G.gerarElenco(rng, { nivel: 30, nomes: nm, prefixoId: "c" + c + "_" }).map(j => ({ ...j, pts: null, treino: null })) });
  }
  const nota = j => M.notaBruta(j.at, j.pos), onze = c => quantil(c.elenco.map(nota).sort((a, b) => b - a).slice(0, 11), 0.5);
  const retrato = t => {
    const todos = clubes.flatMap(c => c.elenco.map(nota)).sort((a, b) => b - a), med = (a, b) => f1(quantil(todos.slice(a, b), 0.5));
    return `T${t}: titulares possíveis A ${med(0, 110)} · B ${med(110, 330)} · C ${med(330, 550)} | melhor ${f1(todos[0])} · 10º ${f1(todos[9])} · com 43 ou mais: ${todos.filter(x => x >= 43).length}`
      + ` | onze do clube: dirigentes ${f1(quantil(clubes.filter(c => c.dono).map(onze), 0.5))} · bots ${f1(quantil(clubes.filter(c => !c.dono).map(onze), 0.5))} | jogadores ${todos.length}`;
  };
  const linhas = [retrato(0)];
  for (let t = 1; t <= temporadas; t++) {
    clubes.forEach((c, ci) => {
      const areas = areasDe(c.treinador);
      for (let s = 0; s < 18; s++) {
        const jogam = new Set(c.elenco.slice().sort((a, b) => nota(b) - nota(a)).slice(0, 14).map(j => j.id));
        for (const j of c.elenco) sessao(j, { tal: j.tal, ct: c.ct, jogou: jogam.has(j.id), areas });
      }
      // virada: idade, queda física, aposentadoria e reposição (clube sem dono: jovem de nota 22; com dono: jovens da base, nota 13 a 21)
      const fica = [];
      for (const j of c.elenco) {
        j.idade++;
        if (j.idade >= 34) FISICOS.forEach(i => { j.at[i] = Math.max(1, j.at[i] - rng.int(1, 2)); });
        else if (j.idade >= 31) rng.embaralhar(FISICOS).slice(0, rng.int(1, 2)).forEach(i => { j.at[i] = Math.max(1, j.at[i] - 1); });
        if (j.idade >= 38 || (j.idade >= 34 && rng.chance((j.idade - 33) * 0.2))) continue;
        fica.push(j);
      }
      const novos = Math.max(c.elenco.length - fica.length, c.dono ? 2 : 0);
      for (let k = 0; k < novos; k++) {
        const j = G.gerarJogador(rng, { id: `n${t}_${ci}_${k}`, pos: rng.pick(POS), alvo: c.dono ? Math.max(13, Math.min(21, 16.5 + rng.normal(0, 1.5))) : 22, idade: c.dono ? rng.int(16, 18) : rng.int(17, 19), nomes: nm, usados });
        fica.push({ ...j, pts: null, treino: null });
      }
      // elenco não passa de 30: sai o mais fraco entre os de mais de 30 anos (aproximação de dispensa e venda)
      while (fica.length > 30) { const v = fica.filter(j => j.idade > 30).sort((a, b) => nota(a) - nota(b))[0] || fica.slice().sort((a, b) => nota(a) - nota(b))[0]; fica.splice(fica.indexOf(v), 1); }
      c.elenco = fica;
    });
    linhas.push(retrato(t));
  }
  return linhas;
}

// Economia ao longo das temporadas, sem mercado: os elencos evoluem pelo treino e os contratos vencidos se renovam pelo maior entre o salário
// atual e o salário de mercado (é o que o jogo faz nos clubes sem dono). Mostra se a folha cabe no teto e na receita de cada divisão.
//   await S.economia({ temporadas: 10 })
import { salarioDeMercado, impostoDoLucro } from "../src/economia.js";
const DIV = { 1: { teto: 20000, tv: 6500, pat: 5200, ingresso: 25, premio: [10000, 4000] }, 2: { teto: 14000, tv: 5300, pat: 3600, ingresso: 24, premio: [6000, 2400] }, 3: { teto: 10000, tv: 4200, pat: 3400, ingresso: 22, premio: [3500, 1200] } };
export async function economia({ temporadas = 10, semente = 11 } = {}) {
  const nm = await nomes(), rng = N.criarRng(semente), usados = new Set(), clubes = [], C = T.CONFIG_TREINO;
  const contrato = (j, t, n) => { j.salario = salarioDeMercado(j); j.ate = t + n; };
  for (let c = 0; c < 50; c++) {
    const elenco = G.gerarElenco(rng, { nivel: 30, nomes: nm, prefixoId: "c" + c + "_" }).map(j => ({ ...j, pts: null, treino: null }));
    elenco.forEach(j => contrato(j, 1, rng.int(0, 2)));
    clubes.push({ div: c < 10 ? 1 : c < 30 ? 2 : 3, caixa: 5000, ct: 0, treinador: C.treinador[0] + C.treinador[1] * C.qualidadeSemDono / 50, elenco });
  }
  const nota = j => M.notaBruta(j.at, j.pos), onze = c => quantil(c.elenco.map(nota).sort((a, b) => b - a).slice(0, 11), 0.5);
  const linhas = [];
  for (let t = 1; t <= temporadas; t++) {
    for (const c of clubes) { const areas = areasDe(c.treinador);
      for (let s = 0; s < 18; s++) { const jogam = new Set(c.elenco.slice().sort((a, b) => nota(b) - nota(a)).slice(0, 14).map(j => j.id)); for (const j of c.elenco) sessao(j, { tal: j.tal, ct: c.ct, jogou: jogam.has(j.id), areas }); } }
    // caixa da temporada: receitas fixas, bilheteria com estádio de 10 mil lugares cheio, prêmio pela ordem de força dentro da divisão
    let imposto = 0;
    for (const d of [1, 2, 3]) {
      const grupo = clubes.filter(c => c.div === d).sort((a, b) => onze(b) - onze(a)), D = DIV[d];
      grupo.forEach((c, i) => {
        c.folha = c.elenco.reduce((s, j) => s + j.salario, 0);
        c.receita = D.tv + D.pat + 10000 * D.ingresso * 9 / 1000 + Math.round(D.premio[0] - (D.premio[0] - D.premio[1]) * (i % 10) / 9);
        c.lucro = c.receita - c.folha; c.imp = impostoDoLucro(c.lucro, D.teto); imposto += c.imp; c.caixa += c.lucro - c.imp;
      });
    }
    clubes.filter(c => c.div === 3).forEach(c => { c.caixa += Math.round(imposto / 2 / 20); });
    const por = d => { const g = clubes.filter(c => c.div === d), m = k => Math.round(quantil(g.map(c => c[k]), 0.5));
      return `${["", "A", "B", "C"][d]}: onze ${f1(quantil(g.map(onze), 0.5))} · folha ${f1(m("folha") / 1000)} mi (${pct(m("folha") / DIV[d].teto)} do teto; acima do teto: ${g.filter(c => c.folha > DIV[d].teto).length}) · receita ${f1(m("receita") / 1000)} · saldo ${f1(m("lucro") / 1000)} · caixa ${f1(m("caixa") / 1000)} · no vermelho ${g.filter(c => c.caixa < 0).length}`; };
    linhas.push(`T${t} | ${por(1)} | ${por(2)} | ${por(3)} | liga: receita ${Math.round(clubes.reduce((s, c) => s + c.receita, 0) / 1000)} mi, folha ${Math.round(clubes.reduce((s, c) => s + c.folha, 0) / 1000)} mi, imposto ${Math.round(imposto / 1000)} mi, caixa total ${Math.round(clubes.reduce((s, c) => s + c.caixa, 0) / 1000)} mi`);
    // virada
    clubes.forEach((c, ci) => {
      const fica = [];
      for (const j of c.elenco) {
        j.idade++;
        if (j.idade >= 34) FISICOS.forEach(i => { j.at[i] = Math.max(1, j.at[i] - rng.int(1, 2)); });
        else if (j.idade >= 31) rng.embaralhar(FISICOS).slice(0, rng.int(1, 2)).forEach(i => { j.at[i] = Math.max(1, j.at[i] - 1); });
        if (j.idade >= 38 || (j.idade >= 34 && rng.chance((j.idade - 33) * 0.2))) continue;
        if (j.ate <= t) { j.salario = Math.max(j.salario, salarioDeMercado(j)); j.ate = t + 1; }
        fica.push(j);
      }
      for (let k = fica.length; k < c.elenco.length; k++) {
        const j = { ...G.gerarJogador(rng, { id: `n${t}_${ci}_${k}`, pos: rng.pick(POS), alvo: 22, idade: rng.int(17, 19), nomes: nm, usados }), pts: null, treino: null };
        contrato(j, t + 1, 2); fica.push(j);
      }
      c.elenco = fica;
    });
  }
  return linhas;
}
