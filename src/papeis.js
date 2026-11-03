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
  // Pontas (etapa Atacantes; fichas de 29/10). Na grade, mapa próprio por posição (do lado direito; o esquerdo é o espelho); o padrão de cada posição
  // (Agudo no RW, Condutor no AMR, Garçom no MR) é a mancha de hoje. A chave do ponta Invertido é pontainvertido: invertido é a do lateral
  agudo: {
    nome: "Agudo", faz: "Ataca a linha de fundo no um contra um e fica alto mesmo sem a bola.", custa: "Ajuda pouco atrás: precisa de um lateral Fixo ou Construtor no mesmo lado.",
    pesos: { dri: 21, vel: 21, cru: 14, fin: 12, dom: 9, pos: 6, res: 6, cri: 5, pas: 4, lon: 2 },
    grade: { RW: MANCHAS.RW }, gasto: { RW: 1 },
  },
  pontainvertido: {
    nome: "Invertido", faz: "Corta para dentro para o pé bom e chuta ou tabela no meio-espaço.", custa: "Cruza pouco e deixa o corredor para o lateral: sem lateral que suba, o lado fica vazio.",
    pesos: { fin: 19, dri: 14, lon: 12, vel: 12, dom: 11, cri: 10, pas: 8, pos: 7, equ: 4, res: 3 },
    grade: {
      RW: { com: { "5D": 0.2, "5d": 0.35, "4d": 0.3, "4D": 0.15 }, sem: MANCHAS.RW.sem },
      AMR: { com: { "4D": 0.25, "4d": 0.4, "5d": 0.2, "3D": 0.15 }, sem: MANCHAS.AMR.sem },
      MR: { com: { "3D": 0.25, "3d": 0.25, "4d": 0.3, "4D": 0.2 }, sem: MANCHAS.MR.sem },
    },
    gasto: { RW: 1, AMR: 1, MR: 1 },
  },
  garcom: {
    nome: "Garçom", faz: "Abre o campo e cruza; sem a bola, volta para ajudar o lateral.", custa: "Finaliza pouco e precisa de alvo na área (Pivô, Matador, quem chega).",
    pesos: { cru: 18, pas: 12, vel: 12, res: 10, dom: 9, des: 9, dri: 8, cri: 8, pos: 6, equ: 6, mar: 2 },
    grade: {
      RW: { com: { "4D": 0.45, "5D": 0.3, "3D": 0.15, "4d": 0.1 }, sem: { "3D": 0.4, "4D": 0.35, "2D": 0.15, "3d": 0.1 } },
      AMR: { com: { "4D": 0.5, "5D": 0.2, "3D": 0.2, "4d": 0.1 }, sem: { "3D": 0.45, "4D": 0.35, "2D": 0.1, "4d": 0.1 } },
      MR: MANCHAS.MR,
    },
    gasto: { RW: 1, AMR: 1, MR: 1 },
  },
  condutor: {
    nome: "Condutor", faz: "Leva a bola pelo lado, no drible, e acha o passe ou o chute.", custa: "Segura a bola: com marcação dobrada, perde e o contra sai pelo lado dele.",
    pesos: { dri: 20, vel: 15, dom: 14, pas: 10, fin: 8, cri: 7, for: 6, cru: 6, equ: 4, des: 3, res: 3, pos: 2, lon: 2 },
    grade: { RW: { com: { "4D": 0.45, "5D": 0.2, "3D": 0.2, "4d": 0.15 }, sem: MANCHAS.RW.sem }, AMR: MANCHAS.AMR },
    gasto: { RW: 1, AMR: 1 },
  },
  articulador: {
    nome: "Articulador", faz: "Armador aberto: vem para o meio-espaço, gira a bola e dá o passe.", custa: "Não ataca o fundo: o lado precisa de um lateral que chegue.",
    pesos: { pas: 16, cri: 14, dom: 13, dri: 11, vel: 9, equ: 8, pos: 7, cru: 6, lon: 5, res: 4, fin: 4, des: 3 },
    grade: { AMR: { com: { "4d": 0.35, "4D": 0.3, "3d": 0.2, "3D": 0.15 }, sem: MANCHAS.AMR.sem }, MR: { com: { "3d": 0.3, "3D": 0.3, "4d": 0.2, "4D": 0.2 }, sem: MANCHAS.MR.sem } },
    gasto: { AMR: 1, MR: 1 },
  },
  operario: {
    nome: "Operário", faz: "Ponta que defende: fecha o lado e acompanha o lateral rival.", custa: "Chega pouco à frente: o ataque perde um homem.",
    pesos: { des: 15, res: 13, vel: 11, cru: 11, mar: 10, pos: 10, equ: 9, pas: 9, dom: 8, agr: 4 },
    grade: { MR: { com: { "3D": 0.45, "4D": 0.3, "2D": 0.1, "3d": 0.15 }, sem: { "2D": 0.35, "3D": 0.4, "1D": 0.1, "3d": 0.15 } } },
    gasto: { MR: 1.1 },
  },
  // Zagueiros (etapa Atacantes; fichas de 28 e 29/10). Como o centroavante, a mancha do zagueiro muda com quantos são (um, dois, trio): o papel a
  // desloca (avanca: da faixa 1, a parte que vai para a faixa 2 do mesmo corredor; espalha: a que vai para os corredores vizinhos da faixa 1)
  xerife: {
    nome: "Xerife", faz: "Fica no centro da defesa, ganha o cruzamento alto e bloqueia o chute.", custa: "Sai pouco jogando; se for lento, sofre com a bola em profundidade.",
    pesos: { pos: 19, mar: 14, des: 13, pas: 12, cab: 12, for: 8, vel: 7, com: 7, dom: 5, agr: 3 }, gasto: { DC: 1 },
  },
  tecnico: {
    nome: "Técnico", faz: "Sai jogando: pisa no meio com a bola, a bola gira curta e segura por ele, e conduz para soltar um colega.", custa: "Marca menos e ganha pouco pelo alto; contra pressão alta, o erro dele sai perto do gol.",
    pesos: { pas: 19, pos: 18, des: 13, mar: 13, dom: 9, cri: 8, dri: 6, com: 5, cab: 4, vel: 3, for: 2 },
    desloca: { DC: { com: { avanca: 0.2 } } }, gasto: { DC: 1 },
  },
  combativo: {
    nome: "Combativo", faz: "Sobe para o bote no meio, rouba e conduz para a frente.", custa: "Deixa espaço atrás para a bola em profundidade; mais faltas e cartões.",
    pesos: { des: 15, pos: 14, agr: 12, mar: 10, vel: 10, for: 10, pas: 8, dom: 7, res: 6, cab: 5, dri: 3 },
    desloca: { DC: { com: { avanca: 0.3 }, sem: { avanca: 0.3 } } }, gasto: { DC: 1.05 },
  },
  libero: {
    nome: "Líbero", faz: "Sobra atrás, cobre os lados e corta a bola em profundidade; com a bola, conduz para o meio.", custa: "Quebra a linha de impedimento e deixa menos gente no centro da área.",
    pesos: { pos: 19, pas: 14, des: 13, vel: 12, mar: 10, com: 9, dom: 7, cab: 5, equ: 5, cri: 3, dri: 3 },
    desloca: { DC: { com: { avanca: 0.25 }, sem: { espalha: 0.3 } } }, gasto: { DC: 1 },
  },
  // Volantes (passo 3 da revisão; fichas de 28 e 29/10). A mancha do volante (um ou dupla) deslocada entre faixas (faixas: [de, para, parte], no mesmo
  // corredor, em ordem)
  primeirovolante: {
    nome: "Primeiro volante", faz: "Fica na frente da zaga: centro da saída de bola e o primeiro a reagir na perda.", custa: "Quase não chega ao ataque: rende com um Distribuidor ou um Box-to-box ao lado.",
    pesos: { pos: 17, pas: 15, des: 15, dom: 11, mar: 8, equ: 7, com: 6, for: 6, res: 6, agr: 4, cri: 3, cab: 2 }, gasto: { DMC: 1 },
  },
  distribuidor: {
    nome: "Distribuidor", faz: "Desce entre os zagueiros para receber e inverte o jogo para o lado vazio.", custa: "Sem a bola, protege menos a zaga; a inversão longa perde mais bolas.",
    pesos: { pas: 23, pos: 17, dom: 13, des: 12, cri: 11, equ: 6, lon: 5, mar: 4, res: 4, com: 3, for: 2 },
    desloca: { DMC: { com: { faixas: [[2, 1, 0.3]] }, sem: { faixas: [[1, 2, 0.4]] } } }, gasto: { DMC: 1 },
  },
  boxtobox: {
    nome: "Box-to-box", faz: "Vai de área a área: chega na frente com a bola, volta e pressiona sem ela, e conduz do meio para a frente.", custa: "Gasta mais energia; dois sem um Primeiro volante atrás deixam a zaga sem proteção.",
    pesos: { res: 13, pas: 12, pos: 12, des: 12, dom: 9, equ: 9, vel: 7, fin: 7, cri: 6, dri: 5, lon: 5, com: 2, mar: 1 },
    desloca: { DMC: { com: { faixas: [[1, 2, 0.8], [2, 3, 0.45]] }, sem: { faixas: [[1, 2, 0.4], [2, 3, 0.15]] } }, MC: { com: { faixas: [[3, 4, 0.3]] }, sem: { faixas: [[3, 2, 0.25]] } } },
    gasto: { DMC: 1.1, MC: 1.1 },
  },
  ladrao: {
    nome: "Ladrão de bola", faz: "Sobe para o bote no meio e rouba mais longe do gol; com a bola, joga simples.", custa: "Faz mais falta, cansa mais e deixa espaço na frente da zaga quando o bote falha.",
    pesos: { des: 20, agr: 12, res: 12, pos: 12, mar: 10, vel: 9, for: 8, equ: 6, pas: 6, dom: 3, com: 2 },
    desloca: { DMC: { sem: { faixas: [[1, 2, 0.4], [2, 3, 0.2]] } }, MC: { sem: { faixas: [[3, 4, 0.25]] } } }, gasto: { DMC: 1.1, MC: 1.1 },
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
    else if (f === "1" && (d.avanca || d.espalha)) {
      const av = w * (d.avanca || 0), es = w * (d.espalha || 0), viz = [c - 1, c + 1].filter(x => x >= 0 && x <= 4);
      r[z] -= av + es; soma("2" + z[1], av);
      for (const x of viz) soma("1" + COL[x], es / viz.length);
    }
  }
  for (const [de, para, parte] of d.faixas || []) for (const z of Object.keys(r)) if (+z[0] === de) { const w = r[z] * parte; r[z] -= w; soma(para + z[1], w); }
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

export const PAPEL_PADRAO = { DR: "fixo", DL: "fixo", WBR: "apoiador", WBL: "apoiador", SC: "matador", FC: "flutuante", DC: "xerife", DMC: "primeirovolante", RW: "agudo", LW: "agudo", AMR: "condutor", AML: "condutor", MR: "garcom", ML: "garcom" };
const PAPEIS_POR_POSICAO = { DR: ["fixo", "apoiador", "construtor", "invertido"], WBR: ["apoiador", "fixo", "construtor", "invertido"],
  SC: ["matador", "pivo", "flutuante", "pressionador"], FC: ["flutuante", "matador", "pivo", "pressionador"],
  DC: ["xerife", "tecnico", "combativo", "libero"], DMC: ["primeirovolante", "distribuidor", "boxtobox", "ladrao"],
  RW: ["agudo", "pontainvertido", "garcom", "condutor"], AMR: ["condutor", "pontainvertido", "garcom", "articulador"], MR: ["garcom", "articulador", "pontainvertido", "operario"] };
// posição do lado direito que serve de base para a do esquerdo
const DIREITA = { DL: "DR", WBL: "WBR", LW: "RW", AML: "AMR", ML: "MR" };
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
