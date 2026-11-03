// Papéis dos jogadores (plano fase 2): dentro da posição, o técnico escolhe o jeito de jogar. Cada papel tem os pesos da ficha (a nota no papel),
// um mapa de zonas com a bola e outro sem a bola (motor.js) e um ritmo de gasto de energia. Os mapas são do lado direito; o esquerdo é o espelho.
// O papel padrão de cada posição usa as zonas de hoje (COBERTURA do motor) nas duas fases e o gasto de hoje: sem escolha, nada muda.
// Primeira fatia: laterais e alas; depois os centroavantes (etapa Atacantes). Os números vêm da página do plano (seções 03 e 04, aprovados em 28 e 29/10).
import { IDX, FAMILIARIDADE, familiaridade } from "./modelo.js";
import { MANCHAS, espelharGrade } from "./grade.js";

// temporada em que os papéis passam a valer nas partidas (rodada.js tira o papel das escalações antes dela)
export const PAPEIS_DESDE = 1;

const ESPELHO_LADO = { E: "D", C: "C", D: "E" };
export const espelharLado = mapa => Object.fromEntries(Object.entries(mapa).map(([z, w]) => [z[0] + ESPELHO_LADO[z[1]], w]));

// gasto: o valor aprovado (28/10); gastoDoPapel divide pelo do papel padrão da posição.
// mapas: só onde o papel não é o padrão (no padrão o motor usa a COBERTURA da posição).
export const PAPEIS = {
  fixo: {
    nome: "Fixo", faz: "Guarda o lado da defesa e fecha o ponta adversário.", custa: "Quase não chega ao fundo: o ponta do time fica sozinho pelo lado.",
    pesos: { des: 17, mar: 14, vel: 14, pos: 12, pas: 10, res: 7, cru: 6, cab: 5, dom: 5, com: 4, equ: 3, for: 3 },
    // no ala, um pouco mais à frente com a bola que o lateral (AD 0,15). No DR é o padrão e fica com a COBERTURA nas duas fases:
    // medido em 31/10, dividir o Fixo do lateral em com/sem a bola o deixava pego na transição e 0,1 pt/jogo abaixo dos outros papéis
    mapas: { WBR: { com: { AD: 0.15, MD: 0.40, DD: 0.45 }, sem: { MD: 0.35, DC: 0.10, DD: 0.55 } } },
    // na grade (spec 6): atrás, no lado da faixa 1. No DR é a mancha do lateral padrão (o Fixo é o padrão do DR)
    grade: { DR: MANCHAS.DR, WBR: { com: { "1D": 0.40, "2D": 0.30, "3D": 0.15, "4D": 0.15 }, sem: { "1D": 0.55, "1d": 0.10, "2D": 0.30, "3D": 0.05 } } },
    gasto: { DR: 0.95, WBR: 0.95 },
  },
  apoiador: {
    nome: "Apoiador", faz: "Chega ao fundo e cruza: soma ataque pelo lado.", custa: "As costas ficam abertas para o contra-ataque, e cansa mais.",
    pesos: { vel: 17, cru: 14, dri: 11, res: 11, pas: 10, des: 10, pos: 7, cri: 5, dom: 5, equ: 5, mar: 5 },
    // WBR é o padrão, só com as regras da T1 (mapasDoPapel comPadrao); sem elas o ala usa a COBERTURA de sempre. Mais alto que o lateral Apoiador nas
    // duas fases (DR com AD 0,30 desde 31/10, era 0,35: o mesmo pt/jogo): o terceiro zagueiro cobre, e sem a bola ele fica na linha dos volantes
    // (só cai para a linha de 5 com o time recuado). Fontes do dono: goal.com, guidetofootball.com, footballiconic.com. Calibrado em 31/10
    // (sim_papeis_laterais, 3-5-2, 3000 jogos): os outros papéis do ala a -0,06, -0,04 e -0,01 pt/jogo do padrão; mais que isso deixava 0,1 abaixo
    mapas: { DR: { com: { AD: 0.30, MD: 0.40, DC: 0.05, DD: 0.25 }, sem: { AD: 0.10, MD: 0.40, DC: 0.05, DD: 0.45 } }, WBR: { com: { AD: 0.32, MD: 0.42, DD: 0.26 }, sem: { AD: 0.10, MD: 0.45, DD: 0.45 } } },
    // na grade: sobe pelo lado até as faixas 4–5; o ala (padrão) fica na faixa 2 sem a bola
    grade: {
      DR: { com: { "1D": 0.20, "1d": 0.05, "2D": 0.15, "3D": 0.25, "4D": 0.20, "5D": 0.15 }, sem: { "1D": 0.45, "1d": 0.05, "2D": 0.25, "3D": 0.15, "4D": 0.10 } },
      WBR: { com: { "1D": 0.16, "2D": 0.20, "3D": 0.32, "4D": 0.20, "5D": 0.12 }, sem: { "1D": 0.35, "2D": 0.45, "3D": 0.10, "4D": 0.10 } },
    },
    gasto: { DR: 1.10, WBR: 1.15 },
  },
  construtor: {
    nome: "Construtor", faz: "Leva a bola da defesa ao meio pelo lado, com passe e criatividade.", custa: "Não chega ao fundo para cruzar e marca menos que o Fixo.",
    pesos: { pas: 17, vel: 14, des: 13, pos: 11, dom: 10, mar: 10, cri: 9, res: 7, cru: 3, equ: 3, dri: 3 },
    mapas: {
      DR: { com: { AD: 0.05, MD: 0.40, DC: 0.10, DD: 0.45 }, sem: { MD: 0.30, DC: 0.15, DD: 0.55 } },
      WBR: { com: { AD: 0.10, MC: 0.10, MD: 0.50, DD: 0.30 }, sem: { MD: 0.45, DC: 0.10, DD: 0.45 } },
    },
    // na grade: na faixa 2, entre o lado e o meio-espaço
    grade: {
      DR: { com: { "1D": 0.30, "1d": 0.05, "2D": 0.30, "2d": 0.25, "3D": 0.05, "4D": 0.05 }, sem: { "1D": 0.55, "1d": 0.15, "2D": 0.25, "3D": 0.05 } },
      WBR: { com: { "1D": 0.15, "2D": 0.30, "2d": 0.30, "3D": 0.15, "3d": 0.05, "4D": 0.05 }, sem: { "1D": 0.40, "1d": 0.05, "2D": 0.45, "3D": 0.10 } },
    },
    gasto: { DR: 1, WBR: 1 },
  },
  invertido: {
    nome: "Invertido", faz: "Com a bola, fecha por dentro e vira um volante a mais; sem ela, volta para o lado.", custa: "Na perda da bola, o corredor fica vazio até ele voltar, e cruza pouco.",
    // Velocidade 8→11 e Resistência 4→8 em 30/10 (fontes do dono: vai e volta entre o meio e o lado o jogo todo), tirados de Equilíbrio, Criatividade, Agressividade e Força
    pesos: { pas: 17, des: 15, pos: 13, dom: 11, vel: 11, mar: 10, res: 8, equ: 7, cri: 6, agr: 2 },
    mapas: {
      DR: { com: { MC: 0.35, MD: 0.10, DC: 0.15, DD: 0.40 }, sem: { MC: 0.10, MD: 0.20, DC: 0.15, DD: 0.55 } },
      WBR: { com: { AC: 0.10, MC: 0.40, MD: 0.25, DD: 0.25 }, sem: { MC: 0.15, MD: 0.40, DD: 0.45 } },
    },
    // na grade: com a bola no meio-espaço da faixa 2; sem ela, de volta ao lado
    grade: {
      DR: { com: { "1D": 0.30, "1d": 0.10, "2d": 0.40, "2C": 0.05, "2D": 0.10, "3d": 0.05 }, sem: { "1D": 0.55, "1d": 0.15, "2D": 0.25, "2d": 0.05 } },
      WBR: { com: { "1D": 0.15, "2d": 0.35, "2D": 0.15, "3d": 0.20, "3D": 0.10, "4d": 0.05 }, sem: { "1D": 0.40, "2D": 0.45, "2d": 0.05, "3D": 0.10 } },
    },
    gasto: { DR: 1.05, WBR: 1.05 },
  },
  // Centroavantes (etapa Atacantes, pontas e zagueiros; fichas aprovadas em 29/10). Na grade, a mancha do centroavante muda com quantos são (sozinho,
  // dupla, trio): o papel desloca a mancha da posição em vez de ter mapa próprio (desloca: em cada fase, da faixa 5: baixa, a parte que vai para a
  // faixa 4 do mesmo corredor; abre, a que vai para os corredores vizinhos da faixa 5; fecha, a do meio-espaço que vai para o centro; da faixa 4:
  // sobe, a parte que vai para a faixa 5). O padrão do SC é o Matador e o do FC o Flutuante: nos dois, a mancha de hoje.
  matador: {
    nome: "Matador", faz: "Vive na área: está no lugar certo antes da bola, corre nas costas da linha alta e finaliza de primeira.", custa: "Não ajuda a construir e some se ninguém o servir; sozinho na área, recebe os dois zagueiros.",
    pesos: { fin: 24, pos: 17, vel: 14, dom: 12, cab: 12, for: 8, equ: 4, lon: 3, agr: 3, pas: 3 },
    desloca: { FC: { com: { sobe: 0.5, fecha: 0.5 } } }, gasto: { SC: 1, FC: 1 },
  },
  pivo: {
    nome: "Pivô", faz: "Joga de costas: ganha a bola alta e a longa, segura e escora para quem chega.", custa: "Finaliza menos ele mesmo, e a escora só rende se alguém chega perto.",
    pesos: { cab: 24, for: 22, dom: 14, fin: 10, pas: 10, pos: 8, equ: 6, agr: 6 },
    desloca: { SC: { com: { baixa: 0.25 } }, FC: { com: { fecha: 0.5 } } }, gasto: { SC: 1, FC: 1 },
  },
  flutuante: {
    nome: "Flutuante", faz: "Sai da área para criar: tabela, faz a bola girar e dá o passe em profundidade.", custa: "A área fica vazia: menos alvo para o cruzamento, e precisa de quem ataque as costas da zaga.",
    pesos: { fin: 18, dom: 16, cri: 14, pas: 13, dri: 12, pos: 10, vel: 9, equ: 6, lon: 2 },
    desloca: { SC: { com: { baixa: 0.12, abre: 0.2 } } }, gasto: { SC: 1, FC: 1 },
  },
  pressionador: {
    nome: "Pressionador", faz: "Sem a bola, pressiona a saída do adversário mesmo sem a pressão do time; com ela, corre nas costas e chuta muito.", custa: "Cansa mais, e o bote que falha deixa o adversário sair jogando.",
    pesos: { res: 16, vel: 16, fin: 14, equ: 12, agr: 11, pos: 8, des: 8, dom: 8, for: 4, dri: 3 },
    desloca: { SC: { com: { baixa: 0.1, abre: 0.1 }, sem: { abre: 0.15, sobe: 0.3 } }, FC: { sem: { abre: 0.15, sobe: 0.3 } } }, gasto: { SC: 1.15, FC: 1.15 },
  },
};

// a mancha da posição deslocada pelo papel (centroavantes); null no padrão, sem papel ou papel sem deslocamento. Feita uma vez por mancha e papel
const COL = ["E", "e", "C", "d", "D"], DESLOCADAS = new Map();
function deslocar(mapa, d) {
  if (!d) return mapa;
  const r = { ...mapa }, soma = (z, w) => { r[z] = (r[z] || 0) + w; };
  for (const [z, w] of Object.entries(mapa)) {
    const f = z[0], c = COL.indexOf(z[1]);
    if (f === "5") {
      const baixa = w * (d.baixa || 0), abre = w * (d.abre || 0), fecha = c === 1 || c === 3 ? w * (d.fecha || 0) : 0;
      r[z] -= baixa + abre + fecha;
      soma("4" + z[1], baixa);
      const viz = [c - 1, c + 1].filter(x => x >= 0 && x <= 4);
      for (const x of viz) soma("5" + COL[x], abre / viz.length);
      if (fecha) soma("5C", fecha);
    } else if (f === "4" && d.sobe) { r[z] -= w * d.sobe; soma("5" + z[1], w * d.sobe); }
  }
  for (const z in r) if (r[z] <= 1e-9) delete r[z];
  return r;
}
export function manchaDoPapel(pos, papel, base) {
  if (!base || !papelValido(pos, papel) || papel === PAPEL_PADRAO[pos]) return null;
  const d = PAPEIS[papel].desloca && PAPEIS[papel].desloca[pos];
  if (!d) return null;
  let porPapel = DESLOCADAS.get(base);
  if (!porPapel) DESLOCADAS.set(base, porPapel = {});
  return porPapel[papel] || (porPapel[papel] = { com: deslocar(base.com, d.com), sem: deslocar(base.sem, d.sem) });
}

export const PAPEL_PADRAO = { DR: "fixo", DL: "fixo", WBR: "apoiador", WBL: "apoiador", SC: "matador", FC: "flutuante" };
const PAPEIS_POR_POSICAO = { DR: ["fixo", "apoiador", "construtor", "invertido"], WBR: ["apoiador", "fixo", "construtor", "invertido"],
  SC: ["matador", "pivo", "flutuante", "pressionador"], FC: ["flutuante", "matador", "pivo", "pressionador"] };
// posição do lado direito que serve de base para a do esquerdo
const DIREITA = { DL: "DR", WBL: "WBR" };
const base = pos => DIREITA[pos] || pos;

// papéis de uma posição, o padrão primeiro
export const papeisDaPosicao = pos => (PAPEIS_POR_POSICAO[base(pos)] || []).slice();
export const papelValido = (pos, papel) => !!papel && papeisDaPosicao(pos).includes(papel);

// { com, sem } do papel na posição, já espelhado na esquerda; null quando o motor deve usar a COBERTURA da posição (padrão, sem papel ou papel inválido).
// comPadrao (regras da T1): o padrão, sem papel ou papel inválido usa os mapas do papel padrão da posição, se ele tiver (o ala Apoiador tem; o lateral Fixo não)
// grade (5×5): o mapa da grade do papel, também no padrão; null fora dos laterais/alas (o motor usa manchasDoTime)
const ESPELHADOS = new Map();
export function mapasDoPapel(pos, papel, comPadrao = false, grade = false) {
  if (grade) {
    if (!papelValido(pos, papel)) { if (!comPadrao || !PAPEL_PADRAO[pos]) return null; papel = PAPEL_PADRAO[pos]; }
    const g = PAPEIS[papel].grade && PAPEIS[papel].grade[base(pos)];
    if (!g) return null;
    if (!DIREITA[pos]) return g;
    return ESPELHADOS.get(g) || ESPELHADOS.set(g, { com: espelharGrade(g.com), sem: espelharGrade(g.sem) }).get(g); // o espelho de cada mapa, feito uma vez só
  }
  if (!papelValido(pos, papel) || papel === PAPEL_PADRAO[pos]) {
    if (!comPadrao || !PAPEL_PADRAO[pos]) return null;
    papel = PAPEL_PADRAO[pos];
  }
  const m = PAPEIS[papel].mapas && PAPEIS[papel].mapas[base(pos)];
  if (!m) return null;
  return DIREITA[pos] ? { com: espelharLado(m.com), sem: espelharLado(m.sem) } : m;
}

// nota do jogador no papel, na escala dos atributos, com a familiaridade da posição (como notaNaPosicao)
export function notaNoPapel(j, pos, papel) {
  const pesos = PAPEIS[papel].pesos;
  let soma = 0;
  for (const k in pesos) soma += pesos[k] * j.at[IDX[k]];
  return soma / 100 * FAMILIARIDADE[familiaridade(j, pos)];
}

// multiplicador do gasto de energia, relativo ao papel padrão da posição
export function gastoDoPapel(pos, papel) {
  if (!papelValido(pos, papel)) return 1;
  const b = base(pos);
  return PAPEIS[papel].gasto[b] / PAPEIS[PAPEL_PADRAO[pos]].gasto[b];
}
