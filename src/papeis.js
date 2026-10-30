// Papéis dos jogadores (plano fase 2): dentro da posição, o técnico escolhe o jeito de jogar. Cada papel tem os pesos da ficha (a nota no papel),
// um mapa de zonas com a bola e outro sem a bola (motor.js) e um ritmo de gasto de energia. Os mapas são do lado direito; o esquerdo é o espelho.
// O papel padrão de cada posição usa as zonas de hoje (COBERTURA do motor) nas duas fases e o gasto de hoje: sem escolha, nada muda.
// Primeira fatia: laterais e alas. Os números vêm da página do plano (seções 03 e 04, aprovados em 28 e 29/10).
import { IDX, FAMILIARIDADE, familiaridade } from "./modelo.js";

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
    gasto: { DR: 0.95, WBR: 0.95 },
  },
  apoiador: {
    nome: "Apoiador", faz: "Chega ao fundo e cruza: soma ataque pelo lado.", custa: "As costas ficam abertas para o contra-ataque, e cansa mais.",
    pesos: { vel: 17, cru: 14, dri: 11, res: 11, pas: 10, des: 10, pos: 7, cri: 5, dom: 5, equ: 5, mar: 5 },
    // WBR é o padrão, só com as regras da T1 (mapasDoPapel comPadrao); sem elas o ala usa a COBERTURA de sempre. Com a bola sobe mais que o lateral
    // Apoiador (DR com AD 0,30 desde 31/10, era 0,35: o mesmo pt/jogo); sem ela fecha a linha de 5. Calibrado em 31/10 (sim_papeis_laterais, 3-5-2): mais ataque com a bola que isso deixava os outros
    // papéis do ala 0,1 pt/jogo abaixo do padrão
    mapas: { DR: { com: { AD: 0.30, MD: 0.40, DC: 0.05, DD: 0.25 }, sem: { AD: 0.10, MD: 0.40, DC: 0.05, DD: 0.45 } }, WBR: { com: { AD: 0.36, MD: 0.40, DD: 0.24 }, sem: { AD: 0.08, MD: 0.40, DD: 0.52 } } },
    gasto: { DR: 1.10, WBR: 1.15 },
  },
  construtor: {
    nome: "Construtor", faz: "Leva a bola da defesa ao meio pelo lado, com passe e criatividade.", custa: "Não chega ao fundo para cruzar e marca menos que o Fixo.",
    pesos: { pas: 17, vel: 14, des: 13, pos: 11, dom: 10, mar: 10, cri: 9, res: 7, cru: 3, equ: 3, dri: 3 },
    mapas: {
      DR: { com: { AD: 0.05, MD: 0.40, DC: 0.10, DD: 0.45 }, sem: { MD: 0.30, DC: 0.15, DD: 0.55 } },
      WBR: { com: { AD: 0.10, MC: 0.10, MD: 0.50, DD: 0.30 }, sem: { MD: 0.45, DC: 0.10, DD: 0.45 } },
    },
    gasto: { DR: 1, WBR: 1 },
  },
  invertido: {
    nome: "Invertido", faz: "Com a bola, fecha por dentro e vira um volante a mais; sem ela, volta para o lado.", custa: "Na perda da bola, o corredor fica vazio até ele voltar, e cruza pouco.",
    pesos: { pas: 17, des: 15, pos: 13, dom: 11, mar: 10, equ: 9, cri: 8, vel: 8, res: 4, agr: 3, for: 2 },
    mapas: {
      DR: { com: { MC: 0.35, MD: 0.10, DC: 0.15, DD: 0.40 }, sem: { MC: 0.10, MD: 0.20, DC: 0.15, DD: 0.55 } },
      WBR: { com: { AC: 0.10, MC: 0.40, MD: 0.25, DD: 0.25 }, sem: { MC: 0.15, MD: 0.40, DD: 0.45 } },
    },
    gasto: { DR: 1, WBR: 1 },
  },
};

export const PAPEL_PADRAO = { DR: "fixo", DL: "fixo", WBR: "apoiador", WBL: "apoiador" };
const PAPEIS_POR_POSICAO = { DR: ["fixo", "apoiador", "construtor", "invertido"], WBR: ["apoiador", "fixo", "construtor", "invertido"] };
// posição do lado direito que serve de base para a do esquerdo
const DIREITA = { DL: "DR", WBL: "WBR" };
const base = pos => DIREITA[pos] || pos;

// papéis de uma posição, o padrão primeiro
export const papeisDaPosicao = pos => (PAPEIS_POR_POSICAO[base(pos)] || []).slice();
export const papelValido = (pos, papel) => !!papel && papeisDaPosicao(pos).includes(papel);

// { com, sem } do papel na posição, já espelhado na esquerda; null quando o motor deve usar a COBERTURA da posição (padrão, sem papel ou papel inválido).
// comPadrao (regras da T1): o padrão, sem papel ou papel inválido usa os mapas do papel padrão da posição, se ele tiver (o ala Apoiador tem; o lateral Fixo não)
export function mapasDoPapel(pos, papel, comPadrao = false) {
  if (!papelValido(pos, papel) || papel === PAPEL_PADRAO[pos]) {
    if (!comPadrao || !PAPEL_PADRAO[pos]) return null;
    papel = PAPEL_PADRAO[pos];
  }
  const m = PAPEIS[papel].mapas[base(pos)];
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
