// Motor da partida.
// Campo em 9 zonas: 3 linhas (D defesa, M meio, A ataque) x 3 lados (E, C, D), sempre vistas pelo time que as ocupa.
// Cada ataque passa por três duelos de zona (saída de bola, construção, criação) e, se vencer, vira uma chance com xG.
// Passo D: instruções, energia, substituições e ordens condicionais, faltas, cartões, lesões e bola parada.
// As constantes saíram da calibragem (calibragem.html).
import { limitar } from "./rng.js";
import { IDX, FAMILIARIDADE, familiaridade, notaNaPosicao } from "./modelo.js";

export const CONFIG = {
  ataquesPorMinuto: 0.92, // ataques iniciados por minuto, somando os dois times
  mando: 1.04, // multiplicador da força do mandante
  expoentePosse: 1,
  expoenteCorredor: 1.5,
  pesoCentro: 1.15, // o jogo pelo centro é um pouco mais natural
  zonaVazia: 6, // força mínima de uma zona, para zona sem ninguém não virar divisão por zero
  inclinacaoDuelo: 1.2, // quanto a diferença de força pesa no duelo; mais alto, o melhor time vence mais
  baseDuelo: { D: 1.5, M: 0.45, A: 0.1 }, // logit do sucesso com forças iguais: cerca de 82%, 61% e 52%
  ajudaAoCentro: 0.5, // quanto da defesa dos lados fecha o centro quando o adversário não ameaça pelos lados
  continuidade: 1.3, // preferência por seguir no mesmo lado de uma linha para a outra
  pesoCentroPosse: 1.5, // o centro do meio-campo pesa mais na posse do que os lados
  vantagemFinalizador: 3, // somado ao atributo de quem chuta, na disputa com o goleiro
  xgBase: { cruzamento: 0.11, corte: 0.09, profundidade: 0.19, area: 0.13, longe: 0.05, escanteio: 0.09, falta: 0.06, penalti: 0.76 },
  inclinacaoXg: 1.2,
  inclinacaoFinalizacao: 1.5,
  fatorLibero: 0.8, // o líbero reduz o xG das bolas em profundidade
  pesoTipo: { profundidade: 0.25, area: 0.4, longe: 0.3, cruzamento: 0.6, corte: 0.4 }, // mistura dos tipos de chance, pelo centro e pelos lados
  chuteForcado: 0.12, // chance de sair um chute de longe, pior, quando o duelo no ataque é perdido
  fatorChuteForcado: 0.7,
  semGol: { defesa: 0.33, fora: 0.47, trave: 0.04, bloqueado: 0.16 }, // destino das finalizações que não viram gol

  // instruções
  mentalidadeAtaque: 0.06, // por nível de mentalidade: força no meio e no ataque
  mentalidadeDefesa: 0.065, // por nível de mentalidade: força que a defesa perde
  mentalidadePosse: 0.02,
  agressividadeDefesa: 0.035, // por nível: força nos duelos defensivos
  pressaoDefesa: 0.09, // por nível: força na marcação do meio para a frente
  pressaoGasto: 0.25, // por nível: energia gasta a mais
  ladoPreferido: 1.6, ladosPreferidos: 1.35,
  passeCurto: { M: 1.06, A: 0.97 }, passeLongo: { M: 0.94, logitM: 0.2, logitA: -0.1 },
  contraAtaque: { com: 0.16, sem: 0.04, logit: 0.3, posse: 0.92, porMentalidade: 0.25 },
  impedimento: { semLinha: 0.07, base: 0.3, porComunicacao: 0.01, libero: -0.15, furou: 1.25 },
  capitao: 0.002, // por ponto de Influência acima de 25, quando o time está perdendo
  pesoArmador: 2, pesoAlvo: 1.8,
  comunicacaoGoleiro: 0.002, // por ponto de Comunicação do goleiro acima de 25: defesa do centro
  excentricidade: 0.1, // desvio da defesa do goleiro por ponto de Excentricidade

  // energia
  gastoEnergia: 0.55, // por minuto, para Resistência 25
  gastoGoleiro: 0.3,
  energiaPiso: 0.8, // eficácia de um jogador com energia zero
  limiarCansado: 55,
  recalcularACada: 5, // minutos

  // faltas, cartões, lesões e bola parada
  falta: 0.1, // por duelo
  faltaPorAgressividade: 0.3,
  amarelo: 0.19, amareloPorAgressividade: 0.15, vermelhoDireto: 0.003,
  cuidadoComAmarelo: 0.3, // quem já tem amarelo se segura: multiplicador da chance do segundo
  lesao: 0.0007, // por duelo, para quem tem a bola
  maxSubstituicoes: 5,
  escanteio: 0.45, // chance de escanteio depois de defesa ou bloqueio
  escanteioDuelo: 0.2, // chance de escanteio quando a defesa corta uma jogada pelo lado
  cabecadaEscanteio: 0.4, // chance de o escanteio ou a falta alçada virar finalização
  penalti: 0.07, // das faltas no centro do ataque
  faltaDireta: 0.35, // das faltas no ataque que não são pênalti
};

export const INSTRUCOES_PADRAO = {
  mentalidade: 0, // -2 muito defensiva … +2 muito ofensiva
  agressividade: 0, // -2 … +2
  pressao: 0, // 0, 1 ou 2
  lado: "misto", // misto, E, C, D ou lados
  passe: "misto", // misto, curto ou longo
  contraAtaque: false,
  impedimento: false,
  capitao: null, vice: null, armador: null, alvo: null, // ids de jogadores
  cobradores: { escanteio: [], falta: [], penalti: [] }, // listas de ids, em ordem de preferência
  substituicoes: [], // { min, sai, entra, pos?, cond }
  ordens: [], // { min, cond, muda: { mentalidade: 1, … } }
};
// Condições de substituições e ordens: sempre, ganhando, empatando, perdendo, cansado, amarelo (as duas últimas olham o jogador que sai).

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
  MR: { MD: 0.5, AD: 0.3, MC: 0.1, DD: 0.1 },
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

// escalacao: [{ j: jogador, pos }] com 11 nomes; banco: até 7 jogadores; instrucoes: ver INSTRUCOES_PADRAO.
// O objeto devolvido não muda durante a partida e pode ser reutilizado em várias simulações.
export function prepararTime({ nome, escalacao, banco = [], instrucoes = {}, mandante = false }) {
  return {
    nome, mandante, escalacao, banco,
    instrucoes: { ...INSTRUCOES_PADRAO, ...instrucoes, cobradores: { ...INSTRUCOES_PADRAO.cobradores, ...(instrucoes.cobradores || {}) } },
  };
}

const novoJog = (j, pos) => ({ j, pos, fam: FAMILIARIDADE[familiaridade(j, pos)], energia: 100, amarelos: 0, at: j.at });

// Estado do time durante a partida.
function iniciar(time) {
  return {
    nome: time.nome, mandante: time.mandante,
    instr: { ...time.instrucoes },
    emCampo: time.escalacao.map(({ j, pos }) => novoJog(j, pos)),
    banco: time.banco.slice(), subs: 0, subsFeitas: new Set(), ordensFeitas: new Set(),
    goleiro: null, temLibero: false, atk: {}, def: {}, zonas: {}, controle: 0, comDefesa: 25,
  };
}

const eficacia = (jog) => {
  const piso = jog.pos === "GK" ? (1 + CONFIG.energiaPiso) / 2 : CONFIG.energiaPiso;
  return piso + (1 - piso) * jog.energia / 100;
};

function capitaoEmCampo(t) {
  const porId = id => id != null && t.emCampo.find(x => x.j.id === id);
  return porId(t.instr.capitao) || porId(t.instr.vice) || t.emCampo.reduce((m, x) => !m || x.j.at[A.inf] > m.j.at[A.inf] ? x : m, null);
}

// Recalcula a força de ataque e de defesa do time em cada zona, com energia, instruções e placar.
function recalcular(t, saldo) {
  const I = t.instr, cap = capitaoEmCampo(t);
  const moral = saldo < 0 && cap ? 1 + (cap.j.at[A.inf] - 25) * CONFIG.capitao : 1;
  const base = (t.mandante ? CONFIG.mando : 1) * moral;
  const mAtk = { D: 1, M: 1 + CONFIG.mentalidadeAtaque * I.mentalidade, A: 1 + CONFIG.mentalidadeAtaque * I.mentalidade };
  const agr = 1 + CONFIG.agressividadeDefesa * I.agressividade, pre = 1 + CONFIG.pressaoDefesa * I.pressao, abre = 1 - CONFIG.mentalidadeDefesa * I.mentalidade;
  const mDef = { D: agr * abre, M: agr * abre * pre, A: agr * pre };
  if (I.passe === "curto") { mAtk.M *= CONFIG.passeCurto.M; mAtk.A *= CONFIG.passeCurto.A; }
  if (I.passe === "longo") mAtk.M *= CONFIG.passeLongo.M;
  t.goleiro = null; t.temLibero = false;
  for (const z of ZONAS) { t.atk[z] = 0; t.def[z] = 0; t.zonas[z] = []; }
  for (const jog of t.emCampo) {
    const f = jog.fam * base * eficacia(jog);
    jog.at = jog.j.at.map(v => v * f); // atributos efetivos neste momento da partida
    if (jog.pos === "GK") { t.goleiro = jog; continue; }
    if (jog.pos === "SW") t.temLibero = true;
    const p = jog.j.id === I.armador ? CONFIG.pesoArmador : 1;
    for (const [z, w] of Object.entries(COBERTURA[jog.pos])) {
      t.atk[z] += w * habilidadeAtaque(jog.at, z) * mAtk[z[0]];
      t.def[z] += w * habilidadeDefesa(jog.at, z) * mDef[z[0]];
      t.zonas[z].push({ jog, w, p: w * p });
    }
  }
  if (t.goleiro) t.def.DC *= 1 + (t.goleiro.j.at[A.com] - 25) * CONFIG.comunicacaoGoleiro;
  const linha = t.zonas.DC, peso = linha.reduce((s, o) => s + o.w, 0);
  t.comDefesa = peso ? linha.reduce((s, o) => s + o.w * o.jog.j.at[A.com], 0) / peso : 10;
  t.controle = LADOS.reduce((s, l) => s + (t.atk["M" + l] + t.def["M" + l]) * (l === "C" ? CONFIG.pesoCentroPosse : 1), 0)
    * (I.contraAtaque ? CONFIG.contraAtaque.posse : 1) * (1 + CONFIG.mentalidadePosse * I.mentalidade);
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

// Defesa que o atacante enfrenta em cada zona (vista pelo atacante).
// Time que não ameaça pelos lados deixa os defensores de lado livres para fechar o centro: jogo estreito encontra defesa compacta.
function montarDefesa(atk, def) {
  const dz = {};
  for (const z of ZONAS) dz[z] = def.def[espelho(z)];
  for (const linha of ["M", "A"]) {
    let ajuda = 0;
    for (const l of ["E", "D"]) {
      const z = linha + l, ameaca = Math.min(1, (atk.atk[z] + CONFIG.zonaVazia) / (dz[z] + CONFIG.zonaVazia));
      ajuda += CONFIG.ajudaAoCentro * dz[z] * (1 - ameaca);
    }
    dz[linha + "C"] += ajuda;
  }
  return dz;
}

// Em cada linha o time procura o lado em que é mais forte em relação à cobertura do adversário.
function escolherLado(rng, atk, dz, linha, atual) {
  const pref = atk.instr.lado;
  const lado = sortearPeso(rng, LADOS, l => {
    const z = linha + l;
    const forca = (atk.atk[z] + CONFIG.zonaVazia) / (dz[z] + CONFIG.zonaVazia);
    const instrucao = pref === l ? CONFIG.ladoPreferido : pref === "lados" && l !== "C" ? CONFIG.ladosPreferidos : 1;
    return Math.pow(forca, CONFIG.expoenteCorredor) * (l === "C" ? CONFIG.pesoCentro : 1) * (atk.zonas[z].length ? 1 : 0.15) * (l === atual ? CONFIG.continuidade : 1) * instrucao;
  });
  return lado || "C";
}

// Monta a chance depois de vencido o duelo na zona de ataque.
function criarChance(rng, atk, def, lado, pivo, { forcado = false, contra = false } = {}) {
  const area = atk.zonas.AC, x = CONFIG.xgBase, k = CONFIG.inclinacaoXg, I = atk.instr;
  const alvoAereo = area.reduce((s, o) => s + o.w * media(o.jog.at[A.cab], o.jog.at[A.for]), 0) / 30;
  const alvoVeloz = area.reduce((s, o) => s + o.w * media(o.jog.at[A.vel], o.jog.at[A.dom]), 0) / 30;
  const presenca = Math.min(1, area.reduce((s, o) => s + o.w, 0));
  const pt = CONFIG.pesoTipo;
  const estilo = { profundidade: (I.passe === "longo" ? 1.2 : 1) * (contra ? 2 : 1), area: I.passe === "curto" ? 1.2 : I.passe === "longo" ? 0.8 : 1, longe: I.passe === "curto" ? 0.8 : 1, cruzamento: I.passe === "longo" ? 1.2 : 1, corte: 1 };
  const opcoes = lado === "C"
    ? [["profundidade", pt.profundidade * alvoVeloz * estilo.profundidade], ["area", pt.area * presenca * estilo.area], ["longe", pt.longe * estilo.longe]]
    : [["cruzamento", pt.cruzamento * alvoAereo * estilo.cruzamento], ["corte", pt.corte]];
  const tipo = forcado ? "longe" : sortearPeso(rng, opcoes, o => o[1])[0];
  const zagueiro = (sortearPeso(rng, def.zonas.DC, o => o.w) || {}).jog;
  const zag = zagueiro ? zagueiro.at : null, gk = def.goleiro ? def.goleiro.at : null;
  const semZaga = 12, semGoleiro = 5; // valores usados quando não há zagueiro na zona ou goleiro em campo
  const c = { tipo, lado, criador: pivo, finalizador: pivo, zagueiro };
  // quem recebe o passe ou o cruzamento não é quem o fez, a não ser que esteja sozinho na área
  const outros = area.filter(o => o.jog !== pivo), alvos = outros.length ? outros : area;
  const ehAlvo = o => o.jog.j.id === I.alvo ? CONFIG.pesoAlvo : 1;

  if (tipo === "cruzamento") {
    c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.cab] + o.jog.at[A.for]) * ehAlvo(o)).jog;
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
    c.finalizador = (sortearPeso(rng, area, o => o.w * o.jog.at[A.fin] * ehAlvo(o)) || { jog: pivo }).jog;
    const f = c.finalizador.at;
    c.xg = x.area * mod(media(f[A.dom], f[A.pos]), zag ? media(zag[A.mar], zag[A.pos]) : semZaga, k);
    c.chute = f[A.fin]; c.defesa = gk ? gk[A.ref] : semGoleiro;
  } else {
    c.xg = x.longe * mod(pivo.at[A.lon], 25, k) * (forcado ? CONFIG.fatorChuteForcado : 1);
    c.chute = pivo.at[A.lon]; c.defesa = gk ? media(gk[A.ref], gk[A.pos]) : semGoleiro;
  }
  c.xg = limitar(c.xg, 0.01, 0.6);
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
    escanteio: `${cr} cobra o escanteio e ${f} cabeceia`,
    falta: c.criador === c.finalizador ? `${f} cobra a falta direto para o gol` : `${cr} levanta a falta na área e ${f} cabeceia`,
    penalti: `Pênalti! ${f} cobra`,
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

const novaEstatistica = () => ({
  posse: 0, ataques: 0, contraAtaques: 0, corredor: { E: 0, C: 0, D: 0 }, chances: 0, finalizacoes: 0, noGol: 0, xg: 0, gols: 0,
  faltas: 0, amarelos: 0, vermelhos: 0, escanteios: 0, impedimentos: 0, substituicoes: 0,
  zonas: Object.fromEntries(ZONAS.map(z => [z, [0, 0]])), // duelos de ataque vencidos e perdidos por zona
});

// Simula uma partida inteira. O mesmo rng (mesma semente) dá sempre o mesmo jogo.
export function simularPartida(rng, casa, fora) {
  const times = [iniciar(casa), iniciar(fora)], estat = [novaEstatistica(), novaEstatistica()];
  const jogadores = {}, lances = [], eventos = [], lesoes = [];
  const ficha = (jog, i) => jogadores[jog.j.id] || (jogadores[jog.j.id] = { nome: jog.j.nome, pos: jog.pos, time: i, entrou: 0, saiu: null, gols: 0, finalizacoes: 0, xg: 0, duelosGanhos: 0, duelosPerdidos: 0, faltas: 0, amarelos: 0, vermelho: false, lesionado: false, energia: 100 });
  times.forEach((t, i) => t.emCampo.forEach(jog => ficha(jog, i)));
  let min = 0, sujo = true, posseCasa = 0.5, defesas = null, somaPosse = 0;
  const gols = () => [estat[0].gols, estat[1].gols];
  const evento = (i, tipo, texto) => eventos.push({ min, time: i, tipo, texto });
  const registrar = (jog, venceu) => { const s = jogadores[jog.j.id]; if (s) s[venceu ? "duelosGanhos" : "duelosPerdidos"]++; };

  function sair(i, jog) {
    const t = times[i];
    t.emCampo = t.emCampo.filter(x => x !== jog);
    const s = jogadores[jog.j.id]; s.saiu = min; s.energia = Math.round(jog.energia);
    sujo = true;
  }
  function entrar(i, j, pos) {
    const t = times[i], jog = novoJog(j, pos);
    t.banco = t.banco.filter(x => x !== j); t.emCampo.push(jog); t.subs++; estat[i].substituicoes++;
    ficha(jog, i).entrou = min; sujo = true;
    return jog;
  }
  function condicao(i, cond, jog) {
    const g = gols(), saldo = g[i] - g[1 - i];
    if (cond === "ganhando") return saldo > 0;
    if (cond === "empatando") return saldo === 0;
    if (cond === "perdendo") return saldo < 0;
    if (cond === "cansado") return !!jog && jog.energia < CONFIG.limiarCansado;
    if (cond === "amarelo") return !!jog && jog.amarelos > 0;
    return true;
  }
  function ordensESubstituicoes(i) {
    const t = times[i];
    t.instr.ordens.forEach((o, k) => {
      if (t.ordensFeitas.has(k) || min < (o.min || 0) || !condicao(i, o.cond)) return;
      t.ordensFeitas.add(k); Object.assign(t.instr, o.muda); sujo = true;
      evento(i, "ordem", `${t.nome} muda a forma de jogar.`);
    });
    t.instr.substituicoes.forEach((s, k) => {
      if (t.subsFeitas.has(k) || min < (s.min || 0) || t.subs >= CONFIG.maxSubstituicoes) return;
      const sai = t.emCampo.find(x => x.j.id === s.sai), entra = t.banco.find(x => x.id === s.entra);
      if (!sai || !entra) { if (!sai && min >= (s.min || 0)) t.subsFeitas.add(k); return; }
      if (!condicao(i, s.cond, sai)) return;
      t.subsFeitas.add(k); sair(i, sai); entrar(i, entra, s.pos || sai.pos);
      evento(i, "substituicao", `Sai ${sai.j.nome}, entra ${entra.nome}.`);
    });
  }
  // Quem sai machucado é trocado pelo melhor do banco para a posição, se ainda houver substituição.
  function reporLesionado(i, jog) {
    const t = times[i];
    if (t.subs >= CONFIG.maxSubstituicoes || !t.banco.length) return;
    const candidatos = t.banco.filter(j => (j.pos === "GK") === (jog.pos === "GK"));
    if (!candidatos.length) return;
    const entra = candidatos.reduce((m, j) => notaNaPosicao(j, jog.pos) > notaNaPosicao(m, jog.pos) ? j : m);
    entrar(i, entra, jog.pos);
    evento(i, "substituicao", `Entra ${entra.nome} no lugar de ${jog.j.nome}.`);
  }
  function falta(i, marcador) { // i: time que cometeu
    const t = times[i], s = jogadores[marcador.j.id];
    estat[i].faltas++; s.faltas++;
    if (rng.chance(CONFIG.vermelhoDireto)) return expulsar(i, marcador, `${marcador.j.nome} é expulso por entrada violenta!`);
    if (!rng.chance(CONFIG.amarelo * (1 + CONFIG.amareloPorAgressividade * t.instr.agressividade) * (marcador.amarelos ? CONFIG.cuidadoComAmarelo : 1))) return;
    marcador.amarelos++; s.amarelos++; estat[i].amarelos++;
    if (marcador.amarelos >= 2) return expulsar(i, marcador, `Segundo amarelo: ${marcador.j.nome} está expulso!`);
    evento(i, "amarelo", `Cartão amarelo para ${marcador.j.nome}.`);
  }
  function expulsar(i, jog, texto) {
    estat[i].vermelhos++; jogadores[jog.j.id].vermelho = true;
    sair(i, jog); evento(i, "vermelho", texto);
  }

  // Duelo de zona: força de ataque de um time contra a força de defesa do outro na zona espelhada.
  function duelo(i, zona, logit = 0) {
    const atk = times[i], def = times[1 - i], dz = defesas[i], e = estat[i];
    const a = atk.atk[zona] + CONFIG.zonaVazia, d = dz[zona] + CONFIG.zonaVazia;
    const longo = atk.instr.passe === "longo" ? (zona[0] === "M" ? CONFIG.passeLongo.logitM : zona[0] === "A" ? CONFIG.passeLongo.logitA : 0) : 0;
    const p = 1 / (1 + Math.exp(-(CONFIG.baseDuelo[zona[0]] + logit + longo + CONFIG.inclinacaoDuelo * Math.log(a / d))));
    let venceu = rng.chance(p), parada = false;
    const pivo = (sortearPeso(rng, atk.zonas[zona], x => x.p) || {}).jog, marcador = (sortearPeso(rng, def.zonas[espelho(zona)], x => x.w) || {}).jog;
    if (marcador && rng.chance(CONFIG.falta * (1 + CONFIG.faltaPorAgressividade * def.instr.agressividade) * Math.sqrt(marcador.j.at[A.agr] / 25))) {
      falta(1 - i, marcador);
      if (zona[0] === "A") parada = true; else venceu = true; // falta no ataque vira bola parada; atrás, a jogada segue
    } else {
      e.zonas[zona][venceu ? 0 : 1]++;
      if (pivo) registrar(pivo, venceu);
      if (marcador) registrar(marcador, !venceu);
    }
    if (pivo && rng.chance(CONFIG.lesao * (1 + 0.2 * def.instr.agressividade))) {
      const r = rng.n(), dias = r < 0.5 ? rng.int(1, 3) : r < 0.8 ? rng.int(4, 10) : rng.int(11, 30);
      jogadores[pivo.j.id].lesionado = true; lesoes.push({ id: pivo.j.id, time: i, dias });
      sair(i, pivo); evento(i, "lesao", `${pivo.j.nome} se machuca e não continua.`); reporLesionado(i, pivo);
      return { venceu: false, pivo: null, marcador, parada: false };
    }
    return { venceu, pivo, marcador, parada };
  }

  function finalizar(i, c) {
    const atk = times[i], def = times[1 - i], e = estat[i];
    if (c.tipo === "profundidade") {
      const K = CONFIG.impedimento;
      const p = def.instr.impedimento ? limitar(K.base + (def.comDefesa - 25) * K.porComunicacao + (def.temLibero ? K.libero : 0), 0.05, 0.5) : K.semLinha;
      if (rng.chance(p)) { e.impedimentos++; evento(i, "impedimento", `${c.finalizador.j.nome} é pego em impedimento.`); return; }
      if (def.instr.impedimento) c.xg = limitar(c.xg * K.furou, 0.01, 0.6);
    }
    const ruido = def.goleiro ? rng.normal(0, def.goleiro.j.at[A.exc] * CONFIG.excentricidade) : 0;
    const k = c.tipo === "penalti" ? 0.6 : CONFIG.inclinacaoFinalizacao;
    const pGol = limitar(c.xg * mod(c.chute + CONFIG.vantagemFinalizador, c.defesa + ruido, k), 0.005, 0.92);
    const resultado = rng.chance(pGol) ? "gol" : sortearPeso(rng, Object.entries(CONFIG.semGol), o => o[1])[0];
    e.chances++; e.xg += c.xg; e.finalizacoes++;
    if (resultado === "gol" || resultado === "defesa") e.noGol++;
    if (resultado === "gol") { e.gols++; sujo = true; }
    const sf = jogadores[c.finalizador.j.id];
    sf.finalizacoes++; sf.xg += c.xg; if (resultado === "gol") sf.gols++;
    lances.push({ min, time: i, tipo: c.tipo, lado: c.lado, xg: c.xg, resultado, finalizador: c.finalizador.j.id, criador: c.criador.j.id, texto: narrar(c, resultado, def.goleiro) });
    if ((resultado === "defesa" || resultado === "bloqueado") && c.tipo !== "penalti" && rng.chance(CONFIG.escanteio)) bolaParada(i, "escanteio", "C");
  }

  function cobrador(t, tipo, nota) {
    for (const id of t.instr.cobradores[tipo] || []) { const jog = t.emCampo.find(x => x.j.id === id); if (jog) return jog; }
    const linha = t.emCampo.filter(x => x.pos !== "GK");
    return linha.length ? linha.reduce((m, x) => nota(x.at) > nota(m.at) ? x : m) : null;
  }
  // Bola levantada na área em escanteio ou falta: os melhores no jogo aéreo sobem, zagueiros inclusive.
  function bolaAlcada(i, tipo, quem) {
    const atk = times[i], def = times[1 - i], k = CONFIG.inclinacaoXg;
    if (!rng.chance(CONFIG.cabecadaEscanteio)) return;
    const sobem = atk.emCampo.filter(x => x.pos !== "GK" && x !== quem), marcam = def.emCampo.filter(x => x.pos !== "GK");
    if (!sobem.length) return;
    const alvo = sortearPeso(rng, sobem, x => Math.pow(x.at[A.cab] + x.at[A.for], 2) * (x.j.id === atk.instr.alvo ? CONFIG.pesoAlvo : 1));
    const zag = sortearPeso(rng, marcam, x => x.at[A.cab] + x.at[A.mar]), gk = def.goleiro ? def.goleiro.at : null;
    const c = { tipo, lado: "C", criador: quem, finalizador: alvo, zagueiro: zag };
    c.xg = limitar(CONFIG.xgBase.escanteio * Math.pow(mod(quem.at[A.cru], 28, k), 0.6) * mod(media(alvo.at[A.cab], alvo.at[A.for]), zag ? media(zag.at[A.cab], zag.at[A.mar], zag.at[A.for]) : 12, k), 0.01, 0.6);
    c.chute = alvo.at[A.cab]; c.defesa = gk ? media(gk[A.enc], gk[A.pos]) : 5;
    finalizar(i, c);
  }
  function bolaParada(i, tipo, lado) {
    const atk = times[i], def = times[1 - i], gk = def.goleiro ? def.goleiro.at : null;
    if (tipo === "escanteio") {
      estat[i].escanteios++;
      const quem = cobrador(atk, "escanteio", at => at[A.cru]);
      if (quem) bolaAlcada(i, "escanteio", quem);
    } else if (lado === "C" && rng.chance(CONFIG.penalti)) {
      const quem = cobrador(atk, "penalti", at => at[A.fin]);
      if (quem) finalizar(i, { tipo: "penalti", lado: "C", criador: quem, finalizador: quem, zagueiro: null, xg: CONFIG.xgBase.penalti, chute: quem.at[A.fin], defesa: gk ? gk[A.um] : 5 });
    } else {
      const nota = at => at[A.lon] * 0.6 + at[A.cri] * 0.4, quem = cobrador(atk, "falta", nota);
      if (!quem) return;
      if (rng.chance(CONFIG.faltaDireta)) finalizar(i, { tipo: "falta", lado, criador: quem, finalizador: quem, zagueiro: null, xg: limitar(CONFIG.xgBase.falta * mod(nota(quem.at), 26, CONFIG.inclinacaoXg), 0.01, 0.6), chute: nota(quem.at), defesa: gk ? media(gk[A.ref], gk[A.pos]) : 5 });
      else bolaAlcada(i, "falta", quem);
    }
  }

  function atacar(i, contra = false) {
    const atk = times[i], def = times[1 - i], dz = defesas[i], e = estat[i];
    const bonus = contra ? CONFIG.contraAtaque.logit : 0;
    // quem recupera a bola pode sair em contra-ataque, mais ainda contra time que joga para a frente
    const perdeu = () => {
      if (contra) return;
      const K = CONFIG.contraAtaque, p = (def.instr.contraAtaque ? K.com : K.sem) * (1 + K.porMentalidade * Math.max(0, atk.instr.mentalidade));
      if (rng.chance(p)) { estat[1 - i].contraAtaques++; atacar(1 - i, true); }
    };
    e.ataques++;
    let lado = escolherLado(rng, atk, dz, contra ? "M" : "D");
    if (!contra && !duelo(i, "D" + lado).venceu) return;
    lado = escolherLado(rng, atk, dz, "M", lado);
    if (!duelo(i, "M" + lado, bonus).venceu) return perdeu();
    lado = escolherLado(rng, atk, dz, "A", lado);
    e.corredor[lado]++;
    const d = duelo(i, "A" + lado, bonus);
    if (d.parada) return bolaParada(i, "falta", lado);
    if (!d.pivo || !atk.emCampo.includes(d.pivo)) return;
    const forcado = !d.venceu;
    if (forcado && lado !== "C" && rng.chance(CONFIG.escanteioDuelo)) return bolaParada(i, "escanteio", lado);
    if (forcado && !rng.chance(CONFIG.chuteForcado)) return perdeu();
    finalizar(i, criarChance(rng, atk, def, lado, d.pivo, { forcado, contra }));
  }

  for (min = 1; min <= 90; min++) {
    ordensESubstituicoes(0); ordensESubstituicoes(1);
    for (const t of times) for (const jog of t.emCampo) {
      const gasto = CONFIG.gastoEnergia * (1 - (jog.j.at[A.res] - 25) / 100) * (1 + CONFIG.pressaoGasto * t.instr.pressao) * (1 + 0.04 * Math.abs(t.instr.mentalidade)) * (jog.pos === "GK" ? CONFIG.gastoGoleiro : 1);
      jog.energia = Math.max(0, jog.energia - gasto);
    }
    const n = (rng.chance(Math.min(1, CONFIG.ataquesPorMinuto)) ? 1 : 0) + (rng.chance(Math.max(0, CONFIG.ataquesPorMinuto - 1)) ? 1 : 0);
    for (let k = 0; k <= n; k++) {
      if (sujo || (k === 0 && min % CONFIG.recalcularACada === 1)) {
        const g = gols();
        recalcular(times[0], g[0] - g[1]); recalcular(times[1], g[1] - g[0]);
        defesas = [montarDefesa(times[0], times[1]), montarDefesa(times[1], times[0])];
        const cc = Math.pow(times[0].controle, CONFIG.expoentePosse), cf = Math.pow(times[1].controle, CONFIG.expoentePosse);
        posseCasa = limitar(cc / (cc + cf), 0.25, 0.75);
        sujo = false;
      }
      if (k < n) atacar(rng.chance(posseCasa) ? 0 : 1);
    }
    somaPosse += posseCasa;
  }
  min = 90;
  times.forEach(t => t.emCampo.forEach(jog => { jogadores[jog.j.id].energia = Math.round(jog.energia); }));
  estat[0].posse = Math.round(somaPosse / 90 * 100); estat[1].posse = 100 - estat[0].posse;
  const narracao = [...lances, ...eventos].sort((a, b) => a.min - b.min);
  return { placar: gols(), xg: [estat[0].xg, estat[1].xg], estat, lances, eventos, narracao, jogadores, lesoes };
}
