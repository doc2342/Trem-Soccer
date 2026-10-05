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
