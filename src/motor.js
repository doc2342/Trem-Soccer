// Motor da partida — núcleo (passo B).
// Campo em 9 zonas: 3 linhas (D defesa, M meio, A ataque) x 3 lados (E, C, D), sempre vistas pelo time que as ocupa.
// Cada ataque passa por três duelos de zona (saída de bola, construção, criação) e, se vencer, vira uma chance com xG.
// Ainda sem instruções, energia, cartões e lesões (passo D). As constantes são ponto de partida para a calibragem (passo C).
import { limitar } from "./rng.js";
import { IDX, FAMILIARIDADE, familiaridade } from "./modelo.js";

export const CONFIG = {
  ataquesPorMinuto: 1.2,
  mando: 1.03, // multiplicador da força do mandante
  expoentePosse: 1.3,
  expoenteCorredor: 1.5,
  pesoCentro: 1.15, // o jogo pelo centro é um pouco mais natural
  zonaVazia: 6, // força mínima de uma zona, para zona sem ninguém não virar divisão por zero
  inclinacaoDuelo: 1.6,
  baseDuelo: { D: 1.5, M: 0.45, A: 0 }, // logit do sucesso com forças iguais: cerca de 82%, 61% e 50%
  trocaDeLado: { M: 0.2, A: 0.15 },
  xgBase: { cruzamento: 0.11, corte: 0.07, profundidade: 0.22, area: 0.13, longe: 0.04 },
  inclinacaoXg: 1.2,
  inclinacaoFinalizacao: 1.5,
  fatorLibero: 0.8, // o líbero reduz o xG das bolas em profundidade
};

const LADOS = ["E", "C", "D"];
export const ZONAS = ["DE", "DC", "DD", "ME", "MC", "MD", "AE", "AC", "AD"];
const NOME_LADO = { E: "esquerda", C: "centro", D: "direita" };

// A zona de ataque de um time é a zona de defesa do outro, com o lado trocado.
const ESPELHO_LINHA = { D: "A", M: "M", A: "D" }, ESPELHO_LADO = { E: "D", C: "C", D: "E" };
export const espelho = z => ESPELHO_LINHA[z[0]] + ESPELHO_LADO[z[1]];

// Quanto cada posição cobre de cada zona (soma 1). As posições da esquerda são o espelho das da direita.
const COBERTURA_BASE = {
  DC: { DC: 0.62, DE: 0.12, DD: 0.12, MC: 0.14 },
  SW: { DC: 0.5, DE: 0.2, DD: 0.2, MC: 0.1 },
  DR: { DD: 0.6, DC: 0.15, MD: 0.25 },
  WBR: { DD: 0.38, MD: 0.42, AD: 0.2 },
  DMC: { MC: 0.45, DC: 0.35, ME: 0.1, MD: 0.1 },
  MC: { MC: 0.6, ME: 0.1, MD: 0.1, DC: 0.08, AC: 0.12 },
  AMC: { AC: 0.45, MC: 0.4, AE: 0.075, AD: 0.075 },
  MR: { MD: 0.6, MC: 0.12, AD: 0.18, DD: 0.1 },
  AMR: { AD: 0.45, MD: 0.35, AC: 0.2 },
  RW: { AD: 0.7, AC: 0.2, MD: 0.1 },
  FC: { AC: 0.7, AE: 0.1, AD: 0.1, MC: 0.1 },
  SC: { AC: 0.9, MC: 0.1 },
};
const espelharLado = cob => Object.fromEntries(Object.entries(cob).map(([z, w]) => [z[0] + ESPELHO_LADO[z[1]], w]));
export const COBERTURA = {
  GK: {},
  ...COBERTURA_BASE,
  DL: espelharLado(COBERTURA_BASE.DR),
  WBL: espelharLado(COBERTURA_BASE.WBR),
  ML: espelharLado(COBERTURA_BASE.MR),
  AML: espelharLado(COBERTURA_BASE.AMR),
  LW: espelharLado(COBERTURA_BASE.RW),
};

const A = IDX;
// Habilidade de quem tem a bola, por zona.
function habilidadeAtaque(at, zona) {
  const centro = zona[1] === "C";
  if (zona[0] === "D") return (at[A.pas] * 2 + at[A.dom] + at[A.pos]) / 4; // saída de bola
  if (zona[0] === "M") return centro ? (at[A.pas] * 2 + at[A.cri] * 1.5 + at[A.dom] + at[A.equ] * 0.5) / 5 : (at[A.dri] + at[A.vel] + at[A.pas] + at[A.dom]) / 4;
  return centro ? (at[A.cri] * 1.5 + at[A.pas] + at[A.dom] + at[A.dri] * 0.5) / 4 : (at[A.dri] * 1.5 + at[A.vel] * 1.5 + at[A.cru] * 0.5 + at[A.dom] * 0.5) / 4;
}
// Habilidade de quem marca, por zona.
function habilidadeDefesa(at, zona) {
  const centro = zona[1] === "C";
  if (zona[0] === "A") return (at[A.vel] + at[A.res] + at[A.agr] + at[A.equ]) / 4; // pressão na saída do adversário
  if (zona[0] === "M") return centro ? (at[A.pos] * 1.5 + at[A.des] * 1.5 + at[A.equ] * 0.5 + at[A.res] * 0.5) / 4 : (at[A.des] + at[A.vel] + at[A.mar] * 0.5 + at[A.pos] * 0.5) / 3;
  return centro ? (at[A.mar] * 1.5 + at[A.pos] * 1.5 + at[A.des]) / 4 : (at[A.des] * 1.5 + at[A.vel] + at[A.mar] + at[A.pos] * 0.5) / 4;
}

// escalacao: [{ j: jogador, pos }] com 11 nomes. Devolve o time com a força de ataque e de defesa em cada zona.
export function prepararTime({ nome, escalacao, mandante = false }) {
  const fator = mandante ? CONFIG.mando : 1;
  const time = { nome, mandante, goleiro: null, atk: {}, def: {}, zonas: {}, temLibero: false, titulares: [] };
  for (const z of ZONAS) { time.atk[z] = 0; time.def[z] = 0; time.zonas[z] = []; }
  for (const { j, pos } of escalacao) {
    const f = FAMILIARIDADE[familiaridade(j, pos)] * fator;
    const at = j.at.map(v => v * f); // atributos efetivos nesta partida
    const jog = { j, pos, at };
    time.titulares.push(jog);
    if (pos === "GK") { time.goleiro = jog; continue; }
    if (pos === "SW") time.temLibero = true;
    for (const [z, w] of Object.entries(COBERTURA[pos])) {
      time.atk[z] += w * habilidadeAtaque(at, z);
      time.def[z] += w * habilidadeDefesa(at, z);
      time.zonas[z].push({ jog, w });
    }
  }
  time.controle = LADOS.reduce((s, l) => s + time.atk["M" + l] + time.def["M" + l], 0);
  return time;
}

function sortearPeso(rng, lista, peso) {
  let total = 0;
  const pesos = lista.map(x => { const p = Math.max(0, peso(x)); total += p; return p; });
  if (total <= 0) return null;
  let r = rng.n() * total;
  for (let i = 0; i < lista.length; i++) { r -= pesos[i]; if (r <= 0) return lista[i]; }
  return lista[lista.length - 1];
}

const mod = (a, b, k) => Math.exp(k * (a - b) / 50);
const media = (...v) => v.reduce((a, b) => a + b, 0) / v.length;

function escolherLado(rng, atk, def, linha) {
  const lado = sortearPeso(rng, LADOS, l => {
    const z = linha + l;
    const forca = (atk.atk[z] + CONFIG.zonaVazia) / (def.def[espelho(z)] + CONFIG.zonaVazia);
    return Math.pow(forca, CONFIG.expoenteCorredor) * (l === "C" ? CONFIG.pesoCentro : 1) * (atk.zonas[z].length ? 1 : 0.15);
  });
  return lado || "C";
}

// Duelo de zona: força de ataque de um time contra a força de defesa do outro na zona espelhada.
function duelo(rng, atk, def, zona, estat) {
  const a = atk.atk[zona] + CONFIG.zonaVazia, d = def.def[espelho(zona)] + CONFIG.zonaVazia;
  const p = 1 / (1 + Math.exp(-(CONFIG.baseDuelo[zona[0]] + CONFIG.inclinacaoDuelo * Math.log(a / d))));
  const venceu = rng.chance(p);
  const pivo = sortearPeso(rng, atk.zonas[zona], x => x.w);
  const marcador = sortearPeso(rng, def.zonas[espelho(zona)], x => x.w);
  estat.zonas[zona][venceu ? 0 : 1]++;
  if (pivo) estat.duelos(pivo.jog, venceu);
  if (marcador) estat.duelosAdv(marcador.jog, !venceu);
  return { venceu, pivo: pivo && pivo.jog, marcador: marcador && marcador.jog };
}

// Monta a chance depois de vencido o duelo na zona de ataque.
function criarChance(rng, atk, def, lado, pivo) {
  const area = atk.zonas.AC, x = CONFIG.xgBase, k = CONFIG.inclinacaoXg;
  const alvoAereo = area.reduce((s, o) => s + o.w * media(o.jog.at[A.cab], o.jog.at[A.for]), 0) / 30;
  const alvoVeloz = area.reduce((s, o) => s + o.w * media(o.jog.at[A.vel], o.jog.at[A.dom]), 0) / 30;
  const presenca = Math.min(1, area.reduce((s, o) => s + o.w, 0));
  const opcoes = lado === "C"
    ? [["profundidade", 0.35 * alvoVeloz], ["area", 0.4 * presenca], ["longe", 0.25]]
    : [["cruzamento", 0.6 * alvoAereo], ["corte", 0.4]];
  const tipo = sortearPeso(rng, opcoes, o => o[1])[0];
  const zagueiro = (sortearPeso(rng, def.zonas.DC, o => o.w) || {}).jog;
  const zag = zagueiro ? zagueiro.at : null, gk = def.goleiro ? def.goleiro.at : null;
  const semZaga = 12, semGoleiro = 5; // valores usados quando não há zagueiro na zona ou goleiro em campo
  const c = { tipo, lado, criador: pivo, finalizador: pivo, zagueiro };
  // quem recebe o passe ou o cruzamento não é quem o fez, a não ser que esteja sozinho na área
  const outros = area.filter(o => o.jog !== pivo), alvos = outros.length ? outros : area;

  if (tipo === "cruzamento") {
    c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.cab] + o.jog.at[A.for])).jog;
    const f = c.finalizador.at;
    c.xg = x.cruzamento * Math.pow(mod(pivo.at[A.cru], 28, k), 0.6) * mod(media(f[A.cab], f[A.for]), zag ? media(zag[A.cab], zag[A.mar], zag[A.for]) : semZaga, k);
    c.chute = f[A.cab]; c.defesa = gk ? media(gk[A.enc], gk[A.pos]) : semGoleiro;
  } else if (tipo === "corte") {
    c.xg = x.corte * mod(media(pivo.at[A.fin], pivo.at[A.lon]), 26, k);
    c.chute = media(pivo.at[A.fin], pivo.at[A.lon]); c.defesa = gk ? media(gk[A.ref], gk[A.pos]) : semGoleiro;
  } else if (tipo === "profundidade") {
    c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.vel] + o.jog.at[A.dom])).jog;
    const f = c.finalizador.at;
    c.xg = x.profundidade * Math.pow(mod(media(pivo.at[A.cri], pivo.at[A.pas]), 28, k), 0.5) * mod(media(f[A.vel], f[A.dom]), zag ? media(zag[A.pos], zag[A.vel]) : semZaga, k) * (def.temLibero ? CONFIG.fatorLibero : 1);
    c.chute = Math.max(f[A.fin], f[A.dri]) * 0.7 + f[A.dom] * 0.3; c.defesa = gk ? gk[A.um] : semGoleiro;
  } else if (tipo === "area") {
    c.finalizador = (sortearPeso(rng, area, o => o.w * o.jog.at[A.fin]) || { jog: pivo }).jog;
    const f = c.finalizador.at;
    c.xg = x.area * mod(media(f[A.dom], f[A.pos]), zag ? media(zag[A.mar], zag[A.pos]) : semZaga, k);
    c.chute = f[A.fin]; c.defesa = gk ? gk[A.ref] : semGoleiro;
  } else {
    c.xg = x.longe * mod(pivo.at[A.lon], 25, k);
    c.chute = pivo.at[A.lon]; c.defesa = gk ? media(gk[A.ref], gk[A.pos]) : semGoleiro;
  }
  c.xg = limitar(c.xg, 0.01, 0.6);
  c.pGol = limitar(c.xg * mod(c.chute, c.defesa, CONFIG.inclinacaoFinalizacao), 0.005, 0.85);
  return c;
}

function narrar(c, resultado, goleiro) {
  const f = c.finalizador.j.nome, cr = c.criador.j.nome, lado = NOME_LADO[c.lado];
  const inicio = {
    cruzamento: `${cr} cruza da ${lado} e ${f} sobe para cabecear`,
    corte: `${f} corta da ${lado} para dentro e chuta`,
    profundidade: `${cr} lança em profundidade e ${f} sai na cara do gol`,
    area: c.criador === c.finalizador ? `${f} recebe na área e finaliza` : `${cr} acha ${f} na área, que finaliza`,
    longe: `${f} arrisca de fora da área`,
  }[c.tipo];
  const fim = {
    gol: "GOL!",
    defesa: goleiro ? `${goleiro.j.nome} defende.` : "a bola para na defesa.",
    fora: "para fora.",
    trave: "na trave!",
    bloqueado: c.zagueiro ? `${c.zagueiro.j.nome} bloqueia.` : "a zaga bloqueia.",
  }[resultado];
  return `${inicio}: ${fim}`;
}

function novaEstatistica(jogadores) {
  const e = {
    posse: 0, ataques: 0, corredor: { E: 0, C: 0, D: 0 }, chances: 0, finalizacoes: 0, noGol: 0, xg: 0, gols: 0,
    zonas: Object.fromEntries(ZONAS.map(z => [z, [0, 0]])), // duelos de ataque vencidos e perdidos por zona
  };
  const reg = (jog, venceu) => { const s = jogadores[jog.j.id]; if (s) s[venceu ? "duelosGanhos" : "duelosPerdidos"]++; };
  e.duelos = reg; e.duelosAdv = reg;
  return e;
}

// Simula uma partida inteira. O mesmo rng (mesma semente) dá sempre o mesmo jogo.
export function simularPartida(rng, casa, fora) {
  const times = [casa, fora];
  const jogadores = {};
  times.forEach((t, i) => t.titulares.forEach(x => jogadores[x.j.id] = { nome: x.j.nome, pos: x.pos, time: i, gols: 0, finalizacoes: 0, xg: 0, duelosGanhos: 0, duelosPerdidos: 0 }));
  const estat = [novaEstatistica(jogadores), novaEstatistica(jogadores)];
  const lances = [];
  const cc = Math.pow(casa.controle, CONFIG.expoentePosse), cf = Math.pow(fora.controle, CONFIG.expoentePosse);
  const posseCasa = limitar(cc / (cc + cf), 0.3, 0.7);

  for (let min = 1; min <= 90; min++) {
    const n = (rng.chance(Math.min(1, CONFIG.ataquesPorMinuto)) ? 1 : 0) + (rng.chance(Math.max(0, CONFIG.ataquesPorMinuto - 1)) ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const i = rng.chance(posseCasa) ? 0 : 1, atk = times[i], def = times[1 - i], e = estat[i];
      e.ataques++;
      let lado = escolherLado(rng, atk, def, "M");
      if (!duelo(rng, atk, def, "D" + lado, e).venceu) continue;
      if (rng.chance(CONFIG.trocaDeLado.M)) lado = escolherLado(rng, atk, def, "M");
      if (!duelo(rng, atk, def, "M" + lado, e).venceu) continue;
      if (rng.chance(CONFIG.trocaDeLado.A)) lado = escolherLado(rng, atk, def, "A");
      e.corredor[lado]++;
      const d = duelo(rng, atk, def, "A" + lado, e);
      if (!d.venceu || !d.pivo) continue;

      const c = criarChance(rng, atk, def, lado, d.pivo);
      const r = rng.n();
      const resultado = r < c.pGol ? "gol" : (() => { const s = rng.n(); return s < 0.5 ? "defesa" : s < 0.85 ? "fora" : s < 0.9 ? "trave" : "bloqueado"; })();
      e.chances++; e.xg += c.xg;
      if (resultado !== "bloqueado") e.finalizacoes++;
      if (resultado === "gol" || resultado === "defesa") e.noGol++;
      if (resultado === "gol") e.gols++;
      const sf = jogadores[c.finalizador.j.id];
      sf.finalizacoes++; sf.xg += c.xg; if (resultado === "gol") sf.gols++;
      lances.push({ min, time: i, tipo: c.tipo, lado, xg: c.xg, resultado, finalizador: c.finalizador.j.id, criador: c.criador.j.id, texto: narrar(c, resultado, def.goleiro) });
    }
  }
  estat[0].posse = Math.round(posseCasa * 100); estat[1].posse = 100 - estat[0].posse;
  estat.forEach(e => { delete e.duelos; delete e.duelosAdv; });
  return { placar: [estat[0].gols, estat[1].gols], xg: [estat[0].xg, estat[1].xg], estat, lances, jogadores };
}
