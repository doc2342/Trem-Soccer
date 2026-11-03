// Grade 5×5 do motor (regras da T1): 5 faixas (1 = saída de bola … 5 = ataque) × 5 corredores
// (E lado esquerdo, e meio-espaço esquerdo, C centro, d meio-espaço direito, D lado direito),
// sempre do ponto de vista do time que ocupa a zona. Código: dígito da faixa + letra do corredor ("1E" … "5D").
// O dígito nunca colide com os códigos de 9 zonas ("DE" … "AD"), que seguem valendo na T0.
import { IDX } from "./modelo.js";
import { limitar } from "./rng.js";

export const CORREDORES = ["E", "e", "C", "d", "D"];
export const ZONAS_GRADE = [1, 2, 3, 4, 5].flatMap(f => CORREDORES.map(c => f + c));
// ZONA_EM[faixa][coluna]: a zona pronta (montar a chave na hora, f + c, custa caro nas contas que rodam a cada passo)
export const ZONA_EM = [null, ...[1, 2, 3, 4, 5].map(f => ZONAS_GRADE.slice(5 * f - 5, 5 * f))];

export function ehGrade(z) { return z[0] >= "1" && z[0] <= "5"; }
export function faixaDe(z) { return +z[0]; }
export function corredorDe(z) { return z[1]; }
const COLUNA = { E: 0, e: 1, C: 2, d: 3, D: 4 };
export function colunaDe(z) { return COLUNA[z[1]]; }

// A faixa k de quem ataca enfrenta a faixa 6−k de quem defende, e o corredor troca de lado (tabela pronta: o motor chama a cada duelo)
const ESPELHO = Object.fromEntries(ZONAS_GRADE.map(z => [z, (6 - faixaDe(z)) + CORREDORES[4 - colunaDe(z)]]));
export function espelhoGrade(z) { return ESPELHO[z]; }

// Linha e lado "antigos" (9 zonas) de uma zona: faixa 1 → D, 2–3 → M, 4–5 → A; meio-espaço e centro → C.
// Com código de 9 zonas, devolve o próprio z[0]/z[1].
export function linhaDaZona(z) { return ehGrade(z) ? "DMMAA"[faixaDe(z) - 1] : z[0]; }
export function ladoDaZona(z) { return ehGrade(z) ? ({ E: "E", D: "D" })[z[1]] || "C" : z[1]; }

export function vizinhas(z) {
  const f = faixaDe(z), c = colunaDe(z), r = [];
  for (let df = -1; df <= 1; df++) for (let dc = -1; dc <= 1; dc++) {
    if ((df || dc) && f + df >= 1 && f + df <= 5 && c + dc >= 0 && c + dc <= 4) r.push((f + df) + CORREDORES[c + dc]);
  }
  return r;
}

const NOME_FAIXA = ["na saída de bola", "na faixa dos volantes", "no meio-campo", "na faixa do meia ofensivo", "na entrada da área"];
const NOME_LADO = ["a saída de bola pela", "o lado $ na faixa dos volantes", "o meio-campo pela", "o lado $ na faixa do meia ofensivo", "o fundo pela"];
const NOME_CENTRO = ["a saída de bola pelo meio", "o meio, na frente dos volantes", "o meio-campo pelo centro", "a zona 14", "a entrada da área"];

// Nome para a narração e o analista, visto por quem ataca. deQuem = "defesa": z está nas coordenadas de quem defende.
export function nomeDaZona(z, deQuem = "ataque") {
  if (deQuem === "defesa") z = espelhoGrade(z);
  const f = faixaDe(z) - 1, c = corredorDe(z);
  if (c === "C") return NOME_CENTRO[f];
  if (c === "e" || c === "d") return "o meio-espaço " + (c === "e" ? "esquerdo " : "direito ") + NOME_FAIXA[f];
  const lado = c === "E" ? "esquerda" : "direita", n = NOME_LADO[f];
  return n.includes("$") ? n.replace("$", lado === "esquerda" ? "esquerdo" : "direito") : n + " " + lado;
}

// Soma um mapa de 25 zonas em 9: faixas 1 → D, 2–3 → M, 4–5 → A; corredor E → E, D → D, C → C,
// meio-espaço metade para o lado e metade para o C. Vale para números e para pares [ganhos, perdidos] (estat.zonas).
export function paraNoveZonas(mapa25) {
  const r = {};
  const somar = (k, v, p) => {
    if (Array.isArray(v)) { r[k] = r[k] || v.map(() => 0); v.forEach((x, i) => { r[k][i] += x * p; }); }
    else r[k] = (r[k] || 0) + v * p;
  };
  for (const [z, v] of Object.entries(mapa25)) {
    const l = linhaDaZona(z), c = corredorDe(z);
    if (c === "e" || c === "d") { somar(l + (c === "e" ? "E" : "D"), v, 0.5); somar(l + "C", v, 0.5); }
    else somar(l + c, v, 1);
  }
  return r;
}

// estat.zonas de qualquer jogo em 9 zonas: o da grade somado (paraNoveZonas), o de 9 zonas como veio. Para as telas que leem 9.
export function emNoveZonas(z) { return z && Object.keys(z).length && ehGrade(Object.keys(z)[0]) ? paraNoveZonas(z) : z; }

// Quem decide o passo: o atributo Decisões. Sob pressão (0 a 2) o bom decisor perde pouco e o mau perde muito: é a Compostura, sem atributo próprio.
export function decisao(at) { return at[IDX.dec]; }
export function decisaoSobPressao(dec, pressao, V) { return dec - V.decisao.pressao * pressao * (1 - dec / 50); }
// Quem chega na bola no espaço: a Velocidade e a Movimentação (o tempo da corrida). Quem marca corre só com a Velocidade.
export function chegada(at) { return (at[IDX.vel] + at[IDX.mov]) / 2; }

// Manchas: quanto de cada jogador fica em cada zona, sem e com a bola (lado direito; o esquerdo é o espelho).
// Rascunho aprovado em .superpowers/brainstorm/29-1793397721/content/manchas-v2.html, números de partida (a calibragem ajusta).
// Zagueiros, volantes e atacantes repetidos têm a versão da dupla ("2d", o da direita) e do trio.
export const MANCHAS = {
  DC1: { sem: { "1C": 0.6, "1e": 0.12, "1d": 0.12, "2C": 0.16 }, com: { "1C": 0.55, "1e": 0.15, "1d": 0.15, "2C": 0.15 } },
  DC2d: { sem: { "1d": 0.4, "1C": 0.35, "1D": 0.05, "2d": 0.1, "2C": 0.1 }, com: { "1d": 0.55, "1C": 0.15, "1D": 0.1, "2d": 0.15, "2C": 0.05 } },
  DC3c: { sem: { "1C": 0.65, "1e": 0.1, "1d": 0.1, "2C": 0.15 }, com: { "1C": 0.6, "1e": 0.1, "1d": 0.1, "2C": 0.2 } },
  DC3d: { sem: { "1d": 0.45, "1D": 0.2, "1C": 0.15, "2d": 0.1, "2D": 0.1 }, com: { "1d": 0.4, "1D": 0.25, "2d": 0.2, "2D": 0.1, "1C": 0.05 } },
  SW: { sem: { "1C": 0.5, "1e": 0.15, "1d": 0.15, "2C": 0.2 }, com: { "1C": 0.35, "2C": 0.35, "2e": 0.1, "2d": 0.1, "3C": 0.1 } },
  DR: { sem: { "1D": 0.55, "1d": 0.15, "2D": 0.25, "3D": 0.05 }, com: { "1D": 0.35, "2D": 0.3, "3D": 0.25, "1d": 0.05, "4D": 0.05 } },
  WBR: { sem: { "1D": 0.35, "2D": 0.45, "3D": 0.15, "1d": 0.05 }, com: { "2D": 0.25, "3D": 0.35, "4D": 0.3, "1D": 0.1 } },
  DMC1: { sem: { "2C": 0.45, "1C": 0.2, "2e": 0.1, "2d": 0.1, "3C": 0.15 }, com: { "2C": 0.5, "3C": 0.2, "1C": 0.15, "2e": 0.075, "2d": 0.075 } },
  DMC2d: { sem: { "2d": 0.4, "2C": 0.25, "1d": 0.1, "1C": 0.1, "3d": 0.15 }, com: { "2d": 0.45, "2C": 0.15, "3d": 0.25, "3C": 0.1, "1d": 0.05 } },
  MC1: { sem: { "3C": 0.5, "3e": 0.1, "3d": 0.1, "2C": 0.15, "4C": 0.15 }, com: { "3C": 0.45, "3e": 0.1, "3d": 0.1, "2C": 0.1, "4C": 0.25 } },
  MC2d: { sem: { "3d": 0.45, "3C": 0.2, "3D": 0.05, "2d": 0.15, "4d": 0.15 }, com: { "3d": 0.4, "3C": 0.15, "2d": 0.1, "4d": 0.3, "3D": 0.05 } },
  AMC: { sem: { "4C": 0.45, "3C": 0.35, "4e": 0.1, "4d": 0.1 }, com: { "4C": 0.45, "4e": 0.1, "4d": 0.1, "5C": 0.15, "3C": 0.2 } },
  // o AMC com o peso do 4C passado para o 4d e o do 4e dividido entre 4d e 4C (caixa do Pep, árvore de Natal)
  AMC2d: { sem: { "4d": 0.6, "4C": 0.05, "3C": 0.35 }, com: { "4d": 0.6, "4C": 0.05, "5C": 0.15, "3C": 0.2 } },
  MR: { sem: { "3D": 0.5, "2D": 0.15, "3d": 0.15, "4D": 0.2 }, com: { "3D": 0.35, "4D": 0.4, "5D": 0.1, "3d": 0.15 } },
  AMR: { sem: { "4D": 0.5, "3D": 0.35, "4d": 0.15 }, com: { "4D": 0.45, "4d": 0.25, "5D": 0.15, "3D": 0.15 } },
  RW: { sem: { "4D": 0.45, "3D": 0.25, "5D": 0.2, "4d": 0.1 }, com: { "5D": 0.45, "4D": 0.3, "5d": 0.15, "4d": 0.1 } },
  FC1: { sem: { "5C": 0.45, "4C": 0.35, "5e": 0.05, "5d": 0.05, "3C": 0.1 }, com: { "5C": 0.6, "4C": 0.2, "5e": 0.1, "5d": 0.1 } },
  SC1: { sem: { "5C": 0.7, "4C": 0.25, "3C": 0.05 }, com: { "5C": 0.85, "5e": 0.05, "5d": 0.05, "4C": 0.05 } },
  FC2d: { sem: { "5d": 0.35, "4d": 0.35, "4C": 0.15, "3d": 0.15 }, com: { "5d": 0.25, "5C": 0.4, "4d": 0.25, "5D": 0.1 } },
  SC2d: { sem: { "5d": 0.55, "5C": 0.25, "4d": 0.2 }, com: { "5d": 0.35, "5C": 0.55, "5D": 0.1 } },
  FC3d: { sem: { "5d": 0.35, "5D": 0.2, "4d": 0.3, "4D": 0.15 }, com: { "5d": 0.45, "5D": 0.25, "4d": 0.2, "5C": 0.1 } },
};

// troca o corredor de cada chave (lado direito ↔ esquerdo), sem mudar a faixa
export function espelharGrade(mapa) {
  return Object.fromEntries(Object.entries(mapa).map(([z, w]) => [z[0] + CORREDORES[4 - colunaDe(z)], w]));
}
const ESPELHADAS = new Map(); // as manchas não mudam: o espelho de cada uma é feito uma vez só
const espelhada = m => ESPELHADAS.get(m) || ESPELHADAS.set(m, { com: espelharGrade(m.com), sem: espelharGrade(m.sem) }).get(m);

// posições de lado: a do lado esquerdo usa o espelho da direita
const LADO = { DR: "DR", WBR: "WBR", MR: "MR", AMR: "AMR", RW: "RW", DL: "DR", WBL: "WBR", ML: "MR", AML: "AMR", LW: "RW" };
const FAMILIA = { DC: "zaga", SW: "zaga", DMC: "volante", MC: "meio", AMC: "meia", FC: "ataque", SC: "ataque" };
// variante de cada posição por quantos da família há: [sozinho, da dupla, do centro do trio]
const VARIANTE = {
  DC: ["DC1", "DC2d", "DC3c"], SW: ["SW", "DC2d", "DC3c"], DMC: ["DMC1", "DMC2d", "DMC1"], MC: ["MC1", "MC2d", "MC1"],
  AMC: ["AMC", "AMC2d", "AMC"], FC: ["FC1", "FC2d", "FC1"], SC: ["SC1", "SC2d", "SC1"],
};
// no trio, quem fica no meio-espaço usa a versão de lado do trio quando existe
const DE_LADO_DO_TRIO = { DC: "DC3d", SW: "DC3d", FC: "FC3d", SC: "FC3d" };

// { com, sem } de cada jogador, na ordem da escalação (null no goleiro). Por família: 1 no centro; 2 um em cada meio-espaço
// (o primeiro da escalação no direito, o segundo no esquerdo); 3 meio-espaço direito / centro / meio-espaço esquerdo.
// ponytail: ordem da escalação decide o lado; trocar pelo pé dominante se a calibragem pedir. 4 ou mais: os que passam de 3 repetem o centro.
export function manchasDoTime(escalacao) {
  const n = {}, i = {};
  for (const j of escalacao) if (FAMILIA[j.pos]) n[FAMILIA[j.pos]] = (n[FAMILIA[j.pos]] || 0) + 1;
  return escalacao.map(j => {
    if (LADO[j.pos]) return j.pos === LADO[j.pos] ? MANCHAS[j.pos] : espelhada(MANCHAS[LADO[j.pos]]);
    const f = FAMILIA[j.pos];
    if (!f) return null;
    const k = i[f] = (i[f] || 0) + 1, total = n[f], v = VARIANTE[j.pos];
    if (total === 1) return MANCHAS[v[0]];
    if (total === 2) return k === 1 ? MANCHAS[v[1]] : espelhada(MANCHAS[v[1]]);
    if (k === 2 || k > 3) return MANCHAS[v[2]];
    const m = MANCHAS[DE_LADO_DO_TRIO[j.pos] || v[1]];
    return k === 1 ? m : espelhada(m);
  });
}

// Defesa que o atacante enfrenta (spec 9.1 e 9.2), tudo na visão de quem ataca: dz[z] = def[espelhoGrade(z)] mais os ajustes.
// atk: ataque de quem ataca por zona (dele); def e posicionamento (Posicionamento médio de quem cobre cada zona): por zona de quem defende.
// Só muda a defesa de lugar: o total não muda.
const DENTRO = { E: ["e"], e: ["C"], C: ["e", "d"], d: ["C"], D: ["d"] }, FORA = { e: "E", d: "D" };
// quem empresta a cada zona, na ordem: volante (mesmo corredor, uma faixa à frente de quem defende), zagueiro (vizinho do lado do centro), lateral (de fora)
const DOADORES = Object.fromEntries(ZONAS_GRADE.map(z => { const f = faixaDe(z), c = z[1]; return [z, [...(f > 1 ? [(f - 1) + c] : []), ...DENTRO[c].map(k => f + k), ...(FORA[c] ? [f + FORA[c]] : [])]]; }));
// as contas rodam em vetores pela posição da zona em ZONAS_GRADE (5 × (faixa − 1) + coluna; o espelho é 24 − posição): o motor refaz as 6 arrumações
// a cada recálculo, e a chave de texto custava caro
const DOADORES_I = ZONAS_GRADE.map(z => DOADORES[z].map(y => ZONAS_GRADE.indexOf(y)));
export function defesaVista({ atk, def, posicionamento, corredorDaBola, V, comLinha = 25 }) {
  const dz = new Float64Array(25), pos = new Float64Array(25), at = new Float64Array(25), Z = V.vazio, buracos = { profundidade: 1, cruzamento: 1 };
  ZONAS_GRADE.forEach((z, i) => { const e = ZONAS_GRADE[24 - i]; dz[i] = def[e] || 0; pos[i] = (posicionamento && posicionamento[e]) || 0; at[i] = atk[z] || 0; });
  const ameaca = i => Math.min(1, (at[i] + Z) / (dz[i] + Z));
  // 1. três corredores: o bloco fica na bola (centro → e C d; lado → lado, meio-espaço vizinho, centro; meio-espaço → ele, centro, lado vizinho).
  // Dos 2 livres sai a fração basculacao do que não marca ninguém ali, mais quanto mais longe da bola (o lado oposto é o lado fraco da virada);
  // com a bola no meio-espaço, zonaCinza do que sai fica no meio-espaço oposto
  const cb = COLUNA[corredorDaBola];
  const ocupados = cb === 2 ? [1, 2, 3] : cb === 0 ? [0, 1, 2] : cb === 4 ? [2, 3, 4] : cb === 1 ? [0, 1, 2] : [2, 3, 4];
  const cinza = cb === 1 ? 3 : cb === 3 ? 1 : -1;
  for (let b = 0; b < 25; b += 5) {
    let sai = 0;
    for (let c = 0; c < 5; c++) if (!ocupados.includes(c)) {
      const i = b + c, v = V.basculacao * dz[i] * (1 - ameaca(i)) * Math.abs(c - cb) / 4;
      dz[i] -= v; sai += v;
    }
    if (cinza >= 0) { dz[b + cinza] += V.zonaCinza * sai; sai *= 1 - V.zonaCinza; }
    const pesos = ocupados.map(c => dz[b + c] + Z), tot = pesos.reduce((a, b) => a + b, 0);
    ocupados.forEach((c, k) => { dz[b + c] += sai * pesos[k] / tot; });
  }
  // 2. cobertura emprestada: zona vazia (abaixo de vazia × a média da faixa) ou sobrecarregada (ataque acima de ameaca × a defesa) pega, nesta ordem,
  // do volante (mesmo corredor, uma faixa à frente de quem defende), do zagueiro (corredor vizinho do lado do centro) e do lateral (do lado de fora).
  // Só empresta quem não está ameaçado; até emprestimo do que sobra, pela qualidade do Posicionamento, e nunca mais que a falta.
  // ponytail: a falta (o que chega à ameaça ou ao piso da faixa) limita o empréstimo; sem ela a zona vazia passaria a vizinha. Ordem fixa das zonas
  const emprestou = new Uint8Array(25), pegou = new Uint8Array(25), pisos = [0, 5, 10, 15, 20].map(b => V.vazia * (dz[b] + dz[b + 1] + dz[b + 2] + dz[b + 3] + dz[b + 4]) / 5);
  const precisa = i => dz[i] < pisos[(i / 5) | 0] || at[i] > V.ameaca * dz[i];
  for (let b = 20; b >= 0; b -= 5) {
    const piso = pisos[b / 5];
    for (const c of [2, 1, 3, 0, 4]) { // C, e, d, E, D
      const i = b + c;
      if (emprestou[i] || !precisa(i)) continue;
      for (const y of DOADORES_I[i]) {
        const falta = Math.max(at[i], piso) - dz[i];
        if (falta <= 0) break;
        if (pegou[y] || at[y] >= dz[y] || precisa(y)) continue;
        const v = Math.min(falta, V.emprestimo * (dz[y] - at[y]) * limitar(pos[y] / 25, 0.6, 1.3));
        if (v <= 0) continue;
        dz[y] -= v; dz[i] += v; emprestou[y] = 1; pegou[i] = 1;
        // 3. buracos: o zagueiro que sai (faixa 1 de quem defende, no centro: o nosso 5C) abre a profundidade; o lateral (lado das faixas 1–2) abre o cruzamento.
        // A linha que se fala (Comunicação de quem fica na faixa 1) fecha parte do buraco
        const fecha = limitar(1 - V.comunica.buraco * (comLinha - 25) / 25, 0, 2);
        if (y === 22) buracos.profundidade = 1 + V.buracoZaga * fecha;
        if (y >= 15 && (y % 5 === 0 || y % 5 === 4)) buracos.cruzamento = 1 + V.buracoLateral * fecha;
      }
    }
  }
  // vetor: a defesa pela posição da zona (o que o motor lê); dz, a mesma por zona, montada só quando alguém lê (testes, telas)
  return { vetor: dz, buracos, get dz() { return Object.fromEntries(ZONAS_GRADE.map((z, i) => [z, dz[i]])); } };
}

// Basculação com um passo de atraso (spec 7.3): a defesa do passo mistura a arrumação de onde a bola estava com a de onde está, pela rapidez
export function defesaComAtraso(arrumacoes, corredorAntes, corredorAgora, rapidez) {
  const a = arrumacoes[corredorAntes].dz, b = arrumacoes[corredorAgora].dz;
  return Object.fromEntries(Object.keys(b).map(z => [z, rapidez * b[z] + (1 - rapidez) * a[z]]));
}
// pos, equ: Posicionamento e Trabalho em equipe médios da linha de quem defende; com: a Comunicação de quem está perto (na média, 25, não muda nada)
export function rapidezBasculacao(pos, equ, V, com = 25) { return limitar(V.basculacaoRapidez * ((pos + equ) / 2 + V.comunica.basculacao * (com - 25)) / 25, 0.2, 1); }

// Ganhar com folga arrasta o cobridor (spec 9.1): girar na zona 14 tira o zagueiro (bola em profundidade); bater o lateral no lado das faixas 4–5
// puxa o zagueiro para fora e enfraquece o meio-espaço vizinho na faixa seguinte (na faixa 5, na mesma)
export function arrasto({ zona, folga, V }) {
  if (folga < V.arrasto.folga) return null;
  if (zona === "4C") return { profundidade: 1 + V.buracoZaga };
  const f = faixaDe(zona), c = corredorDe(zona);
  if (f >= 4 && (c === "E" || c === "D")) return { zonaFraca: Math.min(5, f + 1) + (c === "E" ? "e" : "d"), fator: 1 - V.arrasto.lado };
  return null;
}

// O passo (spec 7): tipo pelo deslocamento. Virada: de lado a lado oposto ou de meio-espaço a meio-espaço oposto, na mesma faixa ou ±1;
// voltar: uma faixa para trás; lado: mesma faixa; subir/diagonal: uma faixa, mesmo corredor/vizinho; pular: 2+ faixas, corredor ≤ 1;
// inversão: o resto (muda faixa e corredor, distância somada ≥ 3)
export function tipoDoPasso(de, para) {
  const df = faixaDe(para) - faixaDe(de), a = colunaDe(de), b = colunaDe(para), dc = Math.abs(b - a);
  if (Math.abs(df) <= 1 && a + b === 4 && dc >= 2) return "virada";
  if (df < 0) return "voltar";
  if (df === 0) return "lado";
  if (dc >= 2) return "inversao";
  if (df >= 2) return "pular";
  return dc ? "diagonal" : "subir";
}

// Destinos de de: para trás só uma faixa (corredor ≤ 1 ou a virada), para o lado até a virada, para a frente até a faixa 5.
// Condução é um modo do passo (a bola no pé), não um destino: só em subir, diagonal e lado.
const OPCOES = {}; // as opções de cada zona não mudam: feitas uma vez (quem chama não altera a lista)
export function opcoesDoPasso(de) {
  if (OPCOES[de]) return OPCOES[de];
  const r = OPCOES[de] = [];
  for (const para of ZONAS_GRADE) {
    if (para === de || faixaDe(para) < faixaDe(de) - 1) continue;
    const tipo = tipoDoPasso(de, para);
    if (tipo === "voltar" && Math.abs(colunaDe(para) - colunaDe(de)) > 1) continue;
    // i: posição do destino em ZONAS_GRADE; k: posição da opção na lista (o motor guarda contas por elas)
    const i = ZONAS_GRADE.indexOf(para);
    r.push({ para, tipo, i, k: r.length });
    if (tipo === "subir" || tipo === "diagonal" || tipo === "lado") r.push({ para, tipo, conduzir: true, i, k: r.length });
  }
  return r;
}

// Logit somado ao duelo do destino (V = CONFIG.gradeValores). O passe que atravessa faixa sofre a marcação dela no motor (V.atravessa).
export function dificuldade(tipo, de, para, V) {
  const D = V.dificuldade, df = faixaDe(para) - faixaDe(de), dc = Math.abs(colunaDe(para) - colunaDe(de)), cd = corredorDe(de);
  let l = tipo === "voltar" ? D.voltar : tipo === "lado" ? D.lado + D.ladoLonge * (dc - 1) : tipo === "subir" ? D.subir
    : tipo === "diagonal" ? (cd === "e" || cd === "d" ? D.diagonalMeio : D.diagonal) : tipo === "pular" ? D.pular * (df - 1)
    : tipo === "virada" ? D.virada : D.pular * (df - 1) + D.inversao * (df + dc - 2); // a inversão paga as faixas puladas, como o pular, e a distância
  if ((cd === "E" || cd === "D") && dc && tipo !== "voltar" && tipo !== "virada") l += D.paraDentro; // do lado para dentro: mais interceptado
  return l + D.pertoDoGol * Math.max(0, faixaDe(para) - 3);
}

const LARGURA = { E: "E", e: "e", C: "C", d: "e", D: "E" }; // corredor sem o lado
// Valor da zona: o xT da 5×5 (spec 8), plano na largura até a faixa 5
export function valorDaZona(z, V) {
  const f = faixaDe(z);
  return f < 5 ? V.valorZona.faixas[f - 1] : V.valorZona.f5[LARGURA[z[1]]];
}

// Quem tem a bola compara as opções da lista: a nota vai de 0 (a pior) a 1 (a melhor), então o valor pode ser negativo (perto do próprio gol quase
// todos são) sem as opções virarem iguais. Peso = ((piso + nota) × multDe)^γ, com γ pela Decisão: o bom decisor fica perto da melhor, o mau perto
// da média. valorDe devolve null para a opção impossível. sortear: o sortearPeso do motor, por parâmetro para não duplicar.
export function escolherPasso(rng, opcoes, valorDe, dec, V, sortear, multDe = null) {
  const g = Math.max(0, V.decisao.base + V.decisao.inclinacao * (dec - 25) / 25), vals = opcoes.map(valorDe);
  let min = Infinity, max = -Infinity;
  for (const v of vals) if (v !== null) { if (v < min) min = v; if (v > max) max = v; }
  const faixa = max - min || 1, ids = [];
  for (let n = 0; n < vals.length; n++) if (vals[n] !== null) ids.push(n);
  const n = sortear(rng, ids, n => Math.pow((V.decisao.piso + (vals[n] - min) / faixa) * (multDe ? multDe(opcoes[n]) : 1), g));
  return n === null ? null : opcoes[n];
}

// O que o passo ganho deixa para o seguinte, num valor só (spec 12b: embalo, "a folga decide o próximo passo" e quem recebe de frente não somam):
// logit = o maior entre o embalo, o bônus de frente e o de atrair a pressão (A2: a volta ganha contra quem pressiona, zero contra a retranca).
// deFrente: diagonal saindo do meio-espaço com companheiro no corredor vizinho da faixa seguinte (temVizinho), ou folga acima do giro.
// prende: reto pela lateral ou vertical pelo centro sem girar (quem recebe fica de costas e tende a devolver).
export function proximoImpulso({ folga, tipo, de, temVizinho, pressaoAdv = 0, mentalidadeAdv = 0, V }) {
  const I = V.impulso, c = corredorDe(de), reto = tipo === "subir" || tipo === "pular";
  const deFrente = (tipo === "diagonal" && (c === "e" || c === "d") && !!temVizinho) || folga >= I.giro;
  const prende = !deFrente && reto && (c === "E" || c === "D" || c === "C");
  const atrair = tipo === "voltar" && pressaoAdv >= 1 && mentalidadeAdv > -1 ? V.atrairPressao * pressaoAdv : 0;
  return { logit: Math.max(Math.min(I.teto, Math.max(0, I.parte * folga)), deFrente ? I.deFrente : 0, atrair), deFrente, prende };
}

// Rede de segurança do laço da jogada (spec 7.4): quase nunca atingida. Com 12, cortava 12% dos ataques e tirava a bola justamente de quem a guardava bem
export const LIMITE_DE_PASSOS = 30;

// Preferência de passo por papel (aprovada pelo dono em 31/10): multiplica o valor de cada opção. Neutra nesta entrega; a etapa dos papéis preenche
// (Distribuidor/Construtor: virada e pular; Técnico/Condutor: condução; Organizador: lado e volta; Criador/Articulador: diagonal e enfiada; …)
// o quanto o papel gosta de cada passo (só papel fora do padrão da posição; o motor manda null no padrão): o "conduzir" vale para toda condução.
// Pivô escora (volta) e não leva; Flutuante gira a bola (lado, volta, diagonal) e leva um pouco; Pressionador ataca a frente
export const PREFERENCIA = {
  pivo: { voltar: 1.3, conduzir: 0.7 },
  flutuante: { lado: 1.2, voltar: 1.15, diagonal: 1.15, conduzir: 1.1 },
  pressionador: { subir: 1.15, diagonal: 1.1, conduzir: 1.1 },
  // pontas; cruzar, chutar e finalizar são os fins da jogada (o cruzamento da faixa 4, o chute da zona 14, a finalização da faixa 5)
  agudo: { subir: 1.2, conduzir: 1.2, cruzar: 1.1 },
  pontainvertido: { diagonal: 1.25, conduzir: 1.15, lado: 0.9, cruzar: 0.75, finalizar: 1.2, chutar: 1.3 },
  garcom: { cruzar: 1.4, voltar: 1.1, conduzir: 0.9 },
  condutor: { conduzir: 1.3 },
  articulador: { lado: 1.15, diagonal: 1.2, voltar: 1.1, conduzir: 0.9, cruzar: 0.9 },
  operario: { voltar: 1.2, lado: 1.1, conduzir: 0.8, cruzar: 0.9 },
  // zagueiros: o Técnico joga curto e conduz (a bola gira segura, mesmo com o time em passe longo); o Combativo leva para a frente; o Líbero conduz
  tecnico: { lado: 1.05, conduzir: 1, pular: 0.6, virada: 0.7, inversao: 0.7 },
  combativo: { subir: 1.1, conduzir: 1.2 },
  libero: { conduzir: 1.25 },
  // volantes: o Distribuidor inverte; o Box-to-box leva a bola para a frente; o Ladrão joga simples
  distribuidor: { virada: 1.4, inversao: 1.4, pular: 1.1 },
  boxtobox: { subir: 1.15, conduzir: 1.2 },
  ladrao: { lado: 1.1, voltar: 1.1, pular: 0.8, conduzir: 0.9 },
};
export function preferenciaDoPasso(papel, tipo, conduzir) {
  const p = papel && PREFERENCIA[papel];
  if (!p) return 1;
  return (conduzir ? p.conduzir || 1 : 1) * (p[tipo] || 1);
}

// Segunda bola (spec 7.7): pela presença de cada time na zona de queda e nas vizinhas, com V.segundaBola.acaso de sorteio puro, seja quem for que
// ganhou o 1º toque (quem ganhou entra pela presença: o motor multiplica a do time dele pelo Cabeceio, a direção da bola)
export function segundaBola(rng, nossa, deles, V) {
  const a = V.segundaBola.acaso;
  return rng.chance((1 - a) * (nossa + deles > 0 ? nossa / (nossa + deles) : 0.5) + a * 0.5);
}
