// Gerador de jogadores e de elencos iniciais.
// Perfil equilibrado: atributos principais da posição altos, secundários médios, o resto variado.
import { limitar } from "./rng.js";
import { ATRIBUTOS, ATR_MIN, ATR_MAX, IDX, POSICOES, PESOS, VIZINHAS, notaBruta } from "./modelo.js";

// Elenco inicial: 11 titulares num 4-4-2 e 11 reservas que cobrem as outras posições,
// para o dirigente poder montar outras formações desde o primeiro dia.
export const VAGAS_TITULARES = ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "MC", "ML", "FC", "SC"];
export const VAGAS_RESERVAS = ["GK", "DC", "SW", "WBR", "WBL", "DMC", "AMC", "RW", "LW", "AML", "SC"];
const FOLGA_RESERVA = 5; // quanto a nota-alvo do reserva fica abaixo da do titular

// Cada perfil puxa alguns atributos para cima; o gerador tira o mesmo tanto de outros.
export const PERFIS = {
  equilibrado: { nome: "Equilibrado", bonus: {} },
  veloz: { nome: "Veloz", bonus: { vel: 6, res: 3 } },
  tecnico: { nome: "Técnico", bonus: { dom: 4, dri: 4, pas: 3 } },
  fisico: { nome: "Físico", bonus: { for: 6, cab: 3, res: 2 } },
  tatico: { nome: "Tático", bonus: { pos: 4, equ: 5, com: 4 } },
};

const arredondar = v => limitar(Math.round(v), ATR_MIN, ATR_MAX);

function sortearAtributos(rng, pos, nivel) {
  const papel = POSICOES[pos].papel, pesos = PESOS[papel];
  return ATRIBUTOS.map(({ k, grupo }) => {
    const peso = pesos[k] || 0;
    if (peso >= 14) return arredondar(rng.normal(nivel + 7, 2.5));
    if (peso >= 8) return arredondar(rng.normal(nivel + 2, 3.5));
    if (peso > 0) return arredondar(rng.normal(nivel - 4, 4.5));
    if (grupo === "gol") return arredondar(rng.normal(4, 2));
    if (papel === "GK" && (grupo === "tec" || grupo === "def")) return arredondar(rng.normal(k === "pas" ? 12 : 6, 3));
    if (grupo === "fis" || grupo === "men") return arredondar(rng.normal(16 + nivel * 0.3, 7));
    return arredondar(rng.normal(nivel - 12, 6));
  });
}

function aplicarPerfil(rng, at, pos, perfil) {
  const bonus = PERFIS[perfil].bonus, chaves = Object.keys(bonus);
  if (!chaves.length || pos === "GK") return;
  let aTirar = 0;
  for (const k of chaves) { const antes = at[IDX[k]]; at[IDX[k]] = arredondar(antes + bonus[k]); aTirar += at[IDX[k]] - antes; }
  const outros = ATRIBUTOS.filter(a => a.grupo !== "gol" && !(a.k in bonus)).map(a => IDX[a.k]);
  for (let guarda = 0; aTirar > 0 && guarda < 200; guarda++) {
    const i = rng.pick(outros);
    if (at[i] > ATR_MIN + 2) { at[i]--; aTirar--; }
  }
}

// Sobe ou desce atributos que contam para a posição até a nota bater no alvo.
function ajustarNota(rng, at, pos, alvo) {
  const pesos = PESOS[POSICOES[pos].papel], chaves = Object.keys(pesos);
  for (let guarda = 0; guarda < 400; guarda++) {
    const dif = alvo - notaBruta(at, pos);
    if (Math.abs(dif) <= 0.2) return;
    const i = IDX[rng.pick(chaves)];
    if (dif > 0 && at[i] < ATR_MAX) at[i]++;
    else if (dif < 0 && at[i] > ATR_MIN) at[i]--;
  }
}

function sortearFamiliaridade(rng, pos) {
  const fam = { [pos]: "N" };
  for (const v of VIZINHAS[pos]) {
    const r = rng.n();
    if (r < 0.06) fam[v] = "N";
    else if (r < 0.3) fam[v] = "C";
  }
  return fam;
}

export function sortearNome(rng, nomes, pais, usados) {
  const base = nomes.paises[pais] || nomes.paises.Brasil;
  for (let i = 0; i < 20; i++) {
    const nome = rng.pick(base.p) + " " + rng.pick(base.s);
    if (!usados || !usados.has(nome)) { if (usados) usados.add(nome); return nome; }
  }
  return rng.pick(base.p) + " " + rng.pick(base.s);
}

// alvo: nota que o jogador deve ter na posição natural (escala 1 a 50)
export function gerarJogador(rng, { id, pos, alvo, idade, pais = "Brasil", perfil = "equilibrado", nomes, usados }) {
  const at = sortearAtributos(rng, pos, alvo);
  aplicarPerfil(rng, at, pos, perfil);
  ajustarNota(rng, at, pos, alvo);
  return {
    id,
    nome: sortearNome(rng, nomes, pais, usados),
    pais,
    idade,
    pos, // posição principal
    fam: sortearFamiliaridade(rng, pos),
    at,
    tal: limitar(Math.round(rng.normal(idade <= 21 ? 58 : 48, 17)), 1, 100), // talento oculto, 1 a 100
  };
}

// Desvios em torno do alvo que somam zero, para todo elenco ter a mesma média.
function desvios(rng, n, desvio) {
  const d = Array.from({ length: n }, () => rng.normal(0, desvio));
  const media = d.reduce((a, b) => a + b, 0) / n;
  return d.map(v => v - media);
}

// nivel: nota média dos titulares. Todos os elencos gerados com o mesmo nível têm a mesma força média.
export function gerarElenco(rng, { nivel = 30, perfil = "equilibrado", pais = "Brasil", nomes, prefixoId = "j" }) {
  const usados = new Set(), elenco = [];
  const dTit = desvios(rng, VAGAS_TITULARES.length, 1.5), dRes = desvios(rng, VAGAS_RESERVAS.length, 1.5);
  const jovens = new Set(rng.embaralhar(VAGAS_RESERVAS.map((_, i) => i)).slice(0, 5));
  VAGAS_TITULARES.forEach((pos, i) => elenco.push({
    ...gerarJogador(rng, { id: prefixoId + elenco.length, pos, alvo: nivel + dTit[i], idade: rng.int(23, 30), pais, perfil, nomes, usados }),
    titular: true,
  }));
  VAGAS_RESERVAS.forEach((pos, i) => elenco.push({
    ...gerarJogador(rng, { id: prefixoId + elenco.length, pos, alvo: nivel - FOLGA_RESERVA + dRes[i], idade: jovens.has(i) ? rng.int(18, 21) : rng.int(24, 33), pais, perfil, nomes, usados }),
    titular: false,
  }));
  return elenco;
}
