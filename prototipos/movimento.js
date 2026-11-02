// Deslocamento contínuo dos 22 no campo 2D (105 × 68 m): camada de leitura sobre um jogo já simulado. Não muda o resultado de nada e não usa sorteio.
// Entra o registro do motor (opcoes.registro: cada passo de cada ataque) e o relatório da partida; sai a trajetória do jogo inteiro, feita uma vez.
// O destino de cada jogador vem da mancha dele (com/sem a bola) e da função; só é recalculado quando o lance muda. Quem vai ao destino é passo():
// um ponto com posição e velocidade, com limites de aceleração e freada, em passos fixos de tempo de partida. Trocar o destino só troca o alvo.
// Quem decide o que fazer em cada momento é cada jogador (criarCena, decidir); a âncora tática é a referência dele.
// A tela não calcula nada: posicaoEm(traj, k, t) lê as amostras, então pausar, acelerar e voltar são só mudar t.
import { IDX } from "../src/modelo.js";
import { limitar } from "../src/rng.js";

// velocidade em m/s, aceleração em m/s²: base (atributo 25) + por × (atributo − 25) / 25
// velocidade/aceleracao/freada/giro; fadiga: quanto da velocidade máxima o jogo inteiro tira de quem tem Resistência 0; reacao: segundos até reagir ao lance
// (base + distancia × distância até a bola / 50, mais rápido com Decisões); passoDoLance: segundos de cada passo do ataque, de-até, conforme o tempo
// que o relógio deixa; circula: segundos entre os toques no intervalo dos ataques; ritmo: fração da velocidade máxima; separacao: metros entre colegas
export const MOV = {
  dt: 0.1, amostra: 0.5, passoDoLance: [3, 5], circula: 5, toque: 0.7, transicao: 8, depoisDoGol: 18,
  velocidade: { base: 8, por: 1.6, piso: 6, teto: 9.8 }, aceleracao: { base: 4, por: 1.2, piso: 2.5, teto: 6 }, freada: { base: 5.5, por: 1, piso: 4, teto: 8 },
  giro: { base: 0.6, por: 0.25, piso: 0.35, teto: 0.95 }, fadiga: 0.2, reacao: { base: 0.2, distancia: 0.6, decisao: 0.2 },
  ritmo: { andar: 0.18, trote: 0.32, longe: 0.45, perto: 0.65, lance: 0.9, sprint: 1 }, perto: 30,
  // bloco: comprimento do time com e sem a bola (m), quanto ele desliza para o lado da bola (× a distância da bola ao centro) e quanto o lado longe fecha por dentro
  bloco: { com: 54, sem: 34, ladoCom: 0.1, ladoSem: 0.2, fecha: 0.15 },
  separacao: 6, bola: 26,
  // ia: intervalo, segundos entre uma olhada e outra (o bom decisor olha mais); persiste e margem: a histerese de quem troca de comportamento; papeis: segundos entre recontar a pressão;
  // trocaPressao: quanto o novo candidato precisa ser melhor (segundos); encurtar: ritmo nos últimos metros até o portador; marca e corrida: raios (m) de vigiar e acompanhar; linha:
  // raio de fechar passe; minimo: metros para mudar o alvo sem mudar de comportamento; curva: distância a partir da qual a corrida sai em arco; encosta: metros de desvio; coleira: até onde
  // cada função vai da âncora sem motivo forte
  ia: { intervalo: [0.5, 1], persiste: 2.5, margem: 0.3, papeis: 0.5, trocaPressao: 0.6, encurtar: 0.55, marca: 9, corrida: 12, linha: 7, minimo: 3.5, curva: 10, encosta: 1.8, conforto: 5,
    coleira: { zaga: 8, volante: 10, lateral: 18, meia: 14, ponta: 16, ataque: 16 },
    // alcance: até onde (da referência à bola) cada função sai para pressionar; a zaga ainda pede cobertura; vagas: quantos do time fazem cada coisa ao mesmo tempo
    alcance: { zaga: 18, volante: 24, lateral: 22, meia: 28, ponta: 24, ataque: 26 }, vagas: { linhaDePasse: 2, aproximarPortador: 1, profundidade: 2, diagonal: 1, ultrapassar: 1, ocuparEspaco: 2, amplitude: 2, desmarque: 1 } },
};
const hip = (a, b) => Math.sqrt(a * a + b * b); // Math.hypot custa dezenas de vezes mais, e esta conta roda milhões de vezes por jogo
const L = 105, A = 68, GOL = [[105, 34], [0, 34]];
export const FASES = ["construcao", "ataque", "transicaoOfensiva", "transicaoDefensiva", "organizacaoDefensiva", "pressao", "bolaParada"];
const F = Object.fromEntries(FASES.map((n, i) => [n, i]));
export const ESTADOS = ["parado", "andando", "trote", "corrida", "sprint"];
const estadoDe = v => v < 0.3 ? 0 : v < 2.5 ? 1 : v < 5 ? 2 : v < 7 ? 3 : 4;

// centro de cada zona da grade: as faixas têm 21 m; corredores 14/11/18/11/14 m. O time 0 ataca para a direita; o 1 é o espelho
// ponytail: sem troca de lado no intervalo; o time 0 ataca sempre para a direita
const Y = { E: 7, e: 19.5, C: 34, d: 48.5, D: 61 };
export const pontoDaZona = (z, time) => { const x = 21 * +z[0] - 10.5, y = Y[z[1]]; return time === 0 ? [x, y] : [L - x, A - y]; };

const um = (P, v) => limitar(P.base + P.por * ((v ?? 25) - 25) / 25, P.piso, P.teto);
// Não há Aceleração, Agilidade nem Equilíbrio entre os atributos: a aceleração usa Velocidade e Força, e o giro usa Drible e Domínio
export function limitesDe(at, C = MOV) {
  const g = k => at ? at[IDX[k]] : 25, med = (a, b) => (g(a) + g(b)) / 2;
  return { vmax: um(C.velocidade, g("vel")), acel: um(C.aceleracao, med("vel", "for")), freio: um(C.freada, med("vel", "for")), giro: um(C.giro, med("dri", "dom")), res: g("res"), dec: g("dec") };
}

// Um passo de tempo: anda para (ax, ay) sem passar da velocidade pedida, freando para chegar parado. Muda s no lugar, sem criar objeto (roda 1 milhão de vezes por jogo)
export function passo(s, ax, ay, lim, vmax, dt) {
  const dx = ax - s.x, dy = ay - s.y, d = hip(dx, dy), quer = d < 0.01 ? 0 : Math.min(vmax, Math.sqrt(2 * lim.freio * d));
  const qx = d < 0.01 ? 0 : dx / d * quer, qy = d < 0.01 ? 0 : dy / d * quer, v = hip(s.vx, s.vy);
  let ax2 = qx - s.vx, ay2 = qy - s.vy;
  const dv = hip(ax2, ay2), contra = v > 0.5 && quer > 0 ? (s.vx * qx + s.vy * qy) / (v * quer) : 1; // contra < 1: quer mudar de direção
  const teto = (quer < v ? lim.freio : lim.acel) * (contra < 0.7 ? lim.giro : 1) * dt;
  if (dv > teto) { ax2 *= teto / dv; ay2 *= teto / dv; }
  s.vx += ax2; s.vy += ay2; s.x += s.vx * dt; s.y += s.vy * dt;
  if (s.x < 0 || s.x > L) { s.x = limitar(s.x, 0, L); s.vx = 0; }
  if (s.y < 0 || s.y > A) { s.y = limitar(s.y, 0, A); s.vy = 0; }
}

// Lê partida + registro e devolve os momentos em ordem de tempo. O motor só guarda o minuto no fim de cada ataque: os passos ficam nos segundos antes dele.
// Um ataque ocupa ~1/3 do intervalo até o seguinte, e o motor não diz o que houve no resto: nele, o time que vai atacar troca passes atrás (circula: true). Só
// desenho: nem placar nem estatística vêm daí, e o mapa de calor deve ignorar ou pesar menos esse trecho
function montarRoteiro(partida, registro, C) {
  const ev = [], lances = partida.lances.filter(l => l.finalizador); let t = 2, n = 0, ataque = [], posse = 0, trocou = -99, intervalo = false;
  const fases = (time, z, tt, parada) => {
    const f = parada ? [F.bolaParada, F.bolaParada] : [0, 0], fx = +z[0];
    if (!parada) { const novo = tt - trocou < C.transicao; f[time] = novo ? F.transicaoOfensiva : fx <= 2 ? F.construcao : F.ataque; f[1 - time] = novo ? F.transicaoDefensiva : fx <= 2 ? F.pressao : F.organizacaoDefensiva; }
    return f;
  };
  const elenco = [0, 1].map(time => Object.entries(partida.jogadores).filter(([, x]) => x.time === time && x.mancha).map(([id, x]) => ({ id, ini: (x.entrou || 0) * 60, fim: x.saiu == null ? Infinity : x.saiu * 60, z: Object.entries(x.mancha.com).sort((a, b) => b[1] - a[1])[0][0] })).filter(j => +j.z[0] <= 3));
  const circular = (time, tt) => { const l = elenco[time].filter(j => j.ini <= tt && tt < j.fim); if (!l.length) return; const j = l[Math.floor(tt / C.circula) % l.length]; pos({ t: tt, posse: time, bola: pontoDaZona(j.z, time), zona: j.z, dono: j.id, rec: j.id, circula: true, fase: fases(time, j.z, tt) }); };
  const pos = (e) => { if (e.posse !== posse) { posse = e.posse; trocou = e.t; } e.transicao = e.t - trocou < C.transicao; ev.push(e); };
  for (const x of registro) {
    if (x[1] !== "fim") { ataque.push(x); continue; }
    if (!intervalo && x[4] >= 46) { intervalo = true; pos({ t: t + 1, posse: x[0], bola: [L / 2, A / 2], zona: "3C", dono: null, centro: true, fase: [F.bolaParada, F.bolaParada] }); t += C.depoisDoGol; }
    const time = x[0], fim = (x[4] ?? 0) * 60, S = limitar((fim - t) / 3 / Math.max(1, ataque.length), C.passoDoLance[0], C.passoDoLance[1]), ini = Math.max(t + 1, fim - ataque.length * S);
    for (let q = t + C.circula; q < ini - 2; q += C.circula) circular(time, q);
    let tt = t = ini;
    for (const p of ataque) {
      const [, de, para, , quem, rec, venceu, conduziu, , marca] = p, b = pontoDaZona(para, time);
      pos({ t: tt, posse: time, bola: b, zona: para, dono: quem || rec, rec: conduziu ? null : rec, marca, conduz: conduziu ? quem : null, fase: fases(time, de, tt) });
      if (rec && rec !== quem) ev.push({ t: tt + C.toque, posse: time, bola: b, zona: para, dono: rec, rec, marca, fase: fases(time, para, tt) });
      tt += S;
      if (!venceu) pos({ t: tt, posse: 1 - time, bola: b, zona: para, dono: marca || null, fase: fases(1 - time, "3C", tt) });
    }
    t = tt; ataque = [];
    while (n < lances.length && lances[n].min * 60 <= Math.max(fim, t)) {
      const l = lances[n++], z = l.zona || "5C", b = pontoDaZona(z, l.time), parada = l.tipo === "escanteio" || l.tipo === "falta" || l.tipo === "penalti";
      if (l.tipo === "escanteio") pos({ t, posse: l.time, bola: [l.time ? 0 : L, l.lado === "D" ? (l.time ? 0 : A) : (l.time ? A : 0)], zona: "5C", dono: l.criador, fase: fases(l.time, z, t, true), area: true });
      if (parada) t += 6;
      pos({ t, posse: l.time, bola: b, zona: z, dono: l.finalizador, rec: l.finalizador, fase: fases(l.time, z, t, parada), area: true });
      const gol = l.resultado === "gol", tiro = t + 2;
      pos({ t: tiro, posse: l.time, bola: b, zona: z, dono: null, chute: GOL[l.time], fase: fases(l.time, z, tiro, parada), texto: l });
      t = tiro + 3;
      if (gol) { pos({ t, posse: 1 - l.time, bola: [L / 2, A / 2], zona: "3C", dono: null, centro: true, fase: [F.bolaParada, F.bolaParada] }); t += C.depoisDoGol; }
      else if (l.goleiro && l.resultado === "defesa") pos({ t, posse: 1 - l.time, bola: pontoDaZona("1C", 1 - l.time), zona: "1C", dono: l.goleiro, fase: fases(1 - l.time, "1C", t) });
    }
  }
  return ev;
}

const ZAGA = new Set(["DC", "SW"]), LATERAL = new Set(["DR", "DL", "WBR", "WBL"]), VOLANTE = new Set(["DMC"]), MEIA = new Set(["MC", "AMC"]), PONTA = new Set(["MR", "ML", "AMR", "AML", "RW", "LW"]), ATAQUE = new Set(["FC", "SC"]);
// centro da mancha na fase, uma vez por jogador: a mancha não muda no jogo
function centroDe(mapa, time) {
  let x = 0, y = 0, w = 0;
  for (const z in mapa) { const p = pontoDaZona(z, time), q = mapa[z]; x += p[0] * q; y += p[1] * q; w += q; }
  return w ? [x / w, y / w] : [L / 2, A / 2];
}
// a linha defensiva, em metros a partir do próprio gol: com a bola, sobe para compactar; sem ela, recua conforme a bola se aproxima
const linhaDe = (a, comBola) => comBola ? limitar(a - 38, 12, 52) : limitar(a - 16, 8, 42);
// A referência tática de cada um. A formação (ref: o centro da mancha) não muda nunca: o time inteiro anda junto, sem ninguém ser puxado para a bola sozinho. A altura sai da linha
// defensiva, e cada jogador guarda a sua fração do comprimento do time; na largura, o time desliza pouco para o lado da bola e quem está longe dela fecha um pouco por dentro.
// Era aqui o amontoado: cada um somava 15 a 25% da distância até a bola em cada lance, e a formação derretia para perto dela
function destino(j, e, C = MOV) {
  const dir = j.time === 0 ? 1 : -1, b = e.bola, a = dir > 0 ? b[0] : L - b[0], com = j.time === e.posse, B = C.bloco;
  if (j.pos === "GK") return [j.time === 0 ? 4 + (b[0] - 4) * 0.06 : 101 - (101 - b[0]) * 0.06, 34 + (b[1] - 34) * 0.1];
  const r = com ? j.cCom : j.cSem, f = (com ? j.fCom : j.fSem) ?? 0.5, linha = linhaDe(a, com);
  let u = linha + f * (com ? B.com : B.sem), y = r[1] + (b[1] - 34) * (com ? B.ladoCom : B.ladoSem);
  if (com) u = Math.min(u, L - linhaDe(L - a, false)); // ninguém fica plantado impedido
  else if (Math.abs(b[1] - y) > 30) y += (34 - y) * B.fecha;
  if (e.area && com && !ZAGA.has(j.pos) && !VOLANTE.has(j.pos)) { u = Math.max(u, 88); y += (34 - y) * 0.45; }
  return [limitar(dir > 0 ? u : L - u, 1, L - 1), limitar(y, 2, A - 2)];
}

// A saída de bola (início, depois do gol, volta do intervalo): cada time no próprio campo, fora do círculo central, com as linhas da formação; quem sai fica na bola
function deSaida(j, posse) {
  if (j.pos === "GK") return [j.time === 0 ? 4 : L - 4, 34];
  if (j.time === posse && j.sacador) return [L / 2 + (j.time === 0 ? -0.5 : 0.5), 34];
  const u = 12 + (j.fSem ?? 0.5) * 30, y = (j.cSem || [0, 34])[1];
  return [j.time === 0 ? u : L - u, limitar(y, 2, A - 2)];
}

// Inteligência individual (dono, 01/11): a posição tática é a âncora, não uma ordem. Cada jogador olha o campo no seu tempo (ia.intervalo, mais curto com Decisões) e
// escolhe um comportamento pelo que vê: posições reais dos 22, a bola, quem a tem. Nada aqui muda passe, chute ou placar, que vêm do motor: quem recebe, quem carrega e o
// marcador do duelo seguem o roteiro. Sem sorteio: a variação vem de um hash fixo do jogador e do tempo. Os atributos que não existem são aproximados: visão = Criatividade,
// antecipação = Posicionamento + Decisões.
export const COMPORTAMENTOS = ["conduzir", "proteger", "avancar", "procurarPasse", "passar", "finalizar", "driblar", "aguardarApoio",
  "aproximarBola", "linhaDePasse", "profundidade", "diagonal", "amplitude", "aproximarPortador", "ultrapassar", "ocuparEspaco", "equilibrio", "desmarque",
  "pressionar", "marcar", "cobrirEspaco", "fecharLinha", "recuar", "acompanharCorrida", "protegerArea", "reorganizar", "cobertura"];
const COD = Object.fromEntries(COMPORTAMENTOS.map((n, i) => [n, i]));
const ATA = new Set(["pressionar", "acompanharCorrida", "protegerArea", "aproximarBola", "ultrapassar", "profundidade"]); // o que pode passar da coleira
const CORRIDA = new Set(["profundidade", "ultrapassar", "diagonal", "acompanharCorrida"]); // a corrida começada vai até o fim, se a posse não mudar
const at = (j, k) => j.at ? j.at[IDX[k]] : 25;
const dist = (a, b) => hip(a.x - b.x, a.y - b.y);
const hash = (a, b) => (((a * 2654435761) ^ (b * 40503)) >>> 0) % 1000 / 1000;
const atrasDe = (j, p) => j.time === 0 ? j.x > p.x : j.x < p.x; // o jogador está mais perto do gol adversário que p (a bola já passou dele)
const uDe = (j, x) => j.time === 0 ? x : L - x; // metros a partir do próprio gol
const xDe = (j, u) => j.time === 0 ? u : L - u;
function aoSegmento(q, a, b) { // distância de q ao passe a→b
  const dx = b.x - a.x, dy = b.y - a.y, n = dx * dx + dy * dy || 1, t = limitar(((q.x - a.x) * dx + (q.y - a.y) * dy) / n, 0, 1);
  return hip(q.x - a.x - t * dx, q.y - a.y - t * dy);
}
// A hierarquia da pressão: quem chega melhor, não só quem está mais perto. Chegada (com a corrida do portador), lado certo, Desarme e Marcação, quanto ele abandona. prev: os papéis
// em vigor, para ninguém trocar por um décimo de vantagem. marca: o marcador do duelo do motor, que precisa estar lá
export function papeisDePressao(defs, p, prev = {}, marca = null, C = MOV) {
  const I = C.ia, todos = defs.filter(j => j.pos !== "GK"), gx = todos.length && todos[0].time === 0 ? 0 : L, alc = j => I.alcance[ZAGA.has(j.pos) ? "zaga" : LATERAL.has(j.pos) ? "lateral" : VOLANTE.has(j.pos) ? "volante" : PONTA.has(j.pos) ? "ponta" : ATAQUE.has(j.pos) ? "ataque" : "meia"];
  const cobre = j => todos.some(o => o !== j && (ZAGA.has(o.pos) || VOLANTE.has(o.pos)) && dist(o, j) < 18), naArea = Math.abs(p.x - gx) < 20;
  // sai da zona quem tem a bola ao alcance da sua referência; o zagueiro só com cobertura; o marcador do duelo do motor sempre. Sem ninguém: a bola está longe, o bloco fica
  const li = todos.filter(j => j.id === marca || (hip(j.ancora[0] - p.x, j.ancora[1] - p.y) <= alc(j) && (!ZAGA.has(j.pos) || naArea || cobre(j))));
  if (!li.length) return {};
  const nota = j => {
    const d = dist(j, p), prox = { x: p.x + (p.vx || 0) * 0.6, y: p.y + (p.vy || 0) * 0.6 }; let s = dist(j, prox) / j.lim.vmax;
    if (atrasDe(j, p)) s += 0.8 * Math.min(1, d / 15); // a bola já passou: corre de costas para ela
    s -= 0.4 * (((at(j, "des") + at(j, "mar")) / 2 - 25) / 25) + 0.3 * (at(j, "agr") - 25) / 25;
    s += hip(j.ancora[0] - p.x, j.ancora[1] - p.y) / 35; // longe do setor dele
    if (ZAGA.has(j.pos)) s += Math.abs(p.x - gx) > 30 ? 1 : 0;
    if (LATERAL.has(j.pos) && Math.abs(j.ancora[1] - p.y) < 18) s -= 0.3;
    if (j.id === marca) s -= 1;
    if (prev.primeiro === j) s -= I.trocaPressao;
    return s;
  };
  const melhor = (l, f) => l.reduce((a, b) => f(b) < f(a) ? b : a), primeiro = melhor(li, nota);
  const n = hip(gx - p.x, 34 - p.y) || 1, ux = (gx - p.x) / n, uy = (34 - p.y) / n;
  const ptCobre = { x: p.x + 9 * ux, y: p.y + 9 * uy }, ptEspaco = { x: p.x + 20 * ux, y: p.y + 20 * uy + (34 - p.y) * 0.4 };
  const resto = todos.filter(j => j !== primeiro && hip(j.ancora[0] - p.x, j.ancora[1] - p.y) <= alc(j) + 12);
  const segundo = resto.length ? melhor(resto, j => dist(j, ptCobre) - (prev.segundo === j ? 4 : 0)) : null;
  const r3 = resto.filter(j => j !== segundo), terceiro = r3.length ? melhor(r3, j => dist(j, ptEspaco) - (prev.terceiro === j ? 4 : 0)) : null;
  return { primeiro, segundo, terceiro, ptCobre, ptEspaco, ux, uy };
}

// volta à referência sem correria: o último trecho é andando (quem está no lugar fica parado, e isso também é jogar)
const passada = (j, x, y, r) => { const d = hip(j.x - x, j.y - y); return d < 5 ? r.andar : d < 14 ? r.trote : r.longe; };
// Sem a bola, defendendo. Só o 1º vai na bola; o 2º e o 3º ajudam sem sair da zona (a coleira vale para eles); o resto guarda a própria zona e só reage ao que está nela
function defender(j, c) {
  const p = c.portador, R = c.papeis, I = c.C.ia, gx = j.time === 0 ? 0 : L, r = c.C.ritmo, fica = () => ({ estado: "equilibrio", x: j.ancora[0], y: j.ancora[1], ritmo: passada(j, j.ancora[0], j.ancora[1], r) });
  if (j.pos === "GK") return { estado: "protegerArea", x: j.ancora[0], y: j.ancora[1], ritmo: r.andar };
  if (j === R.primeiro) {
    const prox = { x: p.x + (p.vx || 0) * 0.5, y: p.y + (p.vy || 0) * 0.5 }, d = dist(j, prox);
    return { estado: "pressionar", x: prox.x + R.ux * 1.6, y: prox.y + R.uy * 1.6, ritmo: d > 7 ? r.sprint : I.encurtar }; // chega forte e freia para bloquear
  }
  if (j === R.segundo) return { estado: "cobertura", x: R.ptCobre.x, y: R.ptCobre.y, ritmo: r.perto };
  if (j === R.terceiro) return { estado: "cobrirEspaco", x: R.ptEspaco.x, y: R.ptEspaco.y, ritmo: r.trote };
  const atras = ZAGA.has(j.pos) || LATERAL.has(j.pos) || VOLANTE.has(j.pos);
  // a corrida às costas: quem é da defesa acompanha, um para cada corredor
  if (atras) { let corre = null, dc = I.corrida; for (const o of c.rivais) { if (o === p) continue; const rumo = gx === 0 ? -o.vx : o.vx, d = dist(j, o), dono = c.marcados.get(o); if (rumo > 4.5 && d < dc && (!dono || dono === j) && (gx === 0 ? o.x < p.x + 8 : o.x > p.x - 8)) { corre = o; dc = d; } }
    if (corre) { c.marcados.set(corre, j); return { estado: "acompanharCorrida", x: corre.x + corre.vx * 0.8 + (gx === 0 ? -1.5 : 1.5), y: corre.y + corre.vy * 0.8, ritmo: r.sprint }; } }
  const pg = Math.abs(p.x - gx);
  if (pg < 24 && atras) return { estado: "protegerArea", x: gx === 0 ? 6 + pg * 0.3 : L - 6 - pg * 0.3, y: 34 + (j.ancora[1] - 34) * 0.6, ritmo: r.perto };
  let vigia = null, dv = I.marca, linha = null;
  for (const o of c.rivais) {
    if (o === p || o.pos === "GK") continue;
    const dono = c.marcados.get(o); if (dono && dono !== j) continue;
    const d = hip(o.x - j.ancora[0], o.y - j.ancora[1]); if (d < dv) { dv = d; vigia = o; }
    const dp = dist(o, p); if (dp > 8 && dp < 25) { const m = { x: (o.x + p.x) / 2, y: (o.y + p.y) / 2 }, da = hip(m.x - j.ancora[0], m.y - j.ancora[1]); if (da < I.linha && (!linha || da < hip(linha.x - j.ancora[0], linha.y - j.ancora[1]))) linha = m; }
  }
  if (linha && (MEIA.has(j.pos) || VOLANTE.has(j.pos)) && (c.quantos.fecharLinha || 0) < 1) return { estado: "fecharLinha", x: linha.x, y: linha.y, ritmo: r.trote };
  if (vigia) {
    if (j.vigia && j.vigia !== vigia) c.marcados.delete(j.vigia);
    j.vigia = vigia; c.marcados.set(vigia, j);
    const peso = limitar(0.35 + 0.3 * (at(j, "mar") - 25) / 25, 0.15, 0.65), x = j.ancora[0] + (vigia.x + (gx === 0 ? -2.5 : 2.5) - j.ancora[0]) * peso, y = j.ancora[1] + (vigia.y - j.ancora[1]) * peso;
    return { estado: "marcar", x, y, ritmo: passada(j, x, y, r) };
  }
  const longe = hip(j.x - j.ancora[0], j.y - j.ancora[1]);
  if (longe > 8) return { estado: atrasDe(j, p) ? "recuar" : "reorganizar", x: j.ancora[0], y: j.ancora[1], ritmo: c.transicao && atrasDe(j, p) ? r.sprint : r.longe };
  return fica();
}

// Sem a bola, atacando: em geral o certo é ficar na zona, que deixa opções em alturas e corredores diferentes. Só os dois mais perto vão apoiar; cada corrida tem vaga limitada. O
// comportamento atual leva um bônus (histerese), e o hash dá a cada um o seu jeito sem sortear
function atacar(j, c) {
  const p = c.portador, I = c.C.ia, r = c.C.ritmo, V = I.vagas, pos = j.pos, u = uDe(j, j.x), uA = uDe(j, j.ancora[0]), uP = uDe(j, p.x), mov = (at(j, "mov") - 25) / 25, ops = [];
  const add = (estado, x, y, nota, ritmo) => { if (estado !== j.estado && V[estado] !== undefined && (c.quantos[estado] || 0) >= V[estado]) return; ops.push({ estado, x: limitar(x, 1, L - 1), y: limitar(y, 1, A - 1), nota, ritmo }); };
  add("equilibrio", j.ancora[0], j.ancora[1], ZAGA.has(pos) ? 1.2 : VOLANTE.has(pos) ? 0.95 : 0.68, passada(j, j.ancora[0], j.ancora[1], r));
  if (pos === "GK") return ops[0];
  const dp = dist(j, p), lado = (j.cCom || j.ancora)[1] < A / 2 ? 3 : A - 3, mesmoLado = Math.abs(p.y - j.ancora[1]) < 18, apertado = c.rivais.some(o => dist(o, p) < 4), proximo = c.perto.includes(j);
  if (proximo && !ZAGA.has(pos)) { // a linha de passe limpa para quem tem a bola
    const n = hip(j.ancora[0] - p.x, j.ancora[1] - p.y) || 1, q = { x: p.x + (j.ancora[0] - p.x) / n * 13, y: p.y + (j.ancora[1] - p.y) / n * 13 };
    let livre = 8; for (const o of c.rivais) livre = Math.min(livre, aoSegmento(o, p, q));
    add("linhaDePasse", q.x, q.y, (0.45 + 0.5 * livre / 8) * (1 + (at(j, "cri") - 25) / 60), r.perto);
    if (apertado && !LATERAL.has(pos)) add("aproximarPortador", p.x + (j.x - p.x) / (dp || 1) * 9, p.y + (j.y - p.y) / (dp || 1) * 9, 0.9, r.lance);
  }
  if ((ATAQUE.has(pos) || PONTA.has(pos)) && uP > 35) { // as costas da defesa: no maior buraco entre os defensores, sem passar da linha
    const ys = c.rivais.filter(o => o.pos !== "GK" && Math.abs(uDe(j, o.x) - c.linhaRival) < 14).map(o => o.y).sort((a, b) => a - b); let vao = j.y, melhor = -1;
    for (let i = 0; i <= ys.length; i++) { const a = i ? ys[i - 1] : 1, b = i < ys.length ? ys[i] : A - 1, m = (a + b) / 2, s = (b - a) - Math.abs(m - j.y) * 0.5; if (s > melhor) { melhor = s; vao = m; } }
    add("profundidade", xDe(j, Math.min(u + 16, c.linhaRival - 0.5)), j.y + (vao - j.y) * 0.5, 0.42 + 0.5 * (L - c.linhaRival) / 45 + 0.3 * mov + (c.transicao ? 0.5 : 0), c.transicao ? r.sprint : r.lance);
  }
  if ((PONTA.has(pos) || pos === "AMC" || pos === "FC") && uP > 45 && mesmoLado) add("diagonal", xDe(j, uA + 6), j.y + (34 - j.y) * 0.5, 0.7 + 0.25 * mov, r.lance);
  if ((PONTA.has(pos) || LATERAL.has(pos)) && !c.amigos.some(o => o !== j && Math.abs(o.y - lado) < 12 && Math.abs(o.x - j.x) < 25)) add("amplitude", j.ancora[0], lado, mesmoLado ? 0.72 : 0.8, r.trote);
  if (LATERAL.has(pos) && mesmoLado && uP > u && uP - u < 28 && c.atrasDaBola >= 3) add("ultrapassar", xDe(j, uP + 9), lado, c.transicao ? 1 : 0.85, r.lance);
  if (VOLANTE.has(pos)) { const sobe = c.amigos.find(o => LATERAL.has(o.pos) && uDe(o, o.x) > 58 && uP > 45); if (sobe) add("ocuparEspaco", j.ancora[0], j.ancora[1] + (sobe.ancora[1] - j.ancora[1]) * 0.35, 1, r.trote); }
  const perto = c.rivais.reduce((a, o) => Math.min(a, dist(o, j)), 99);
  if (perto < 4 && dp < 40 && !ZAGA.has(pos) && !VOLANTE.has(pos)) { const s = hash(j.k, Math.floor(c.t / 4)) < 0.5 ? 1 : -1; add("desmarque", j.x + (p.y > j.y ? 2 : -2) * s, j.y + 7 * s, 0.75 + 0.3 * mov, r.trote); }
  if (MEIA.has(pos)) { let v = null, m = -1; for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) { const q = { x: j.ancora[0] + dx, y: j.ancora[1] + dy }; if (q.y < 1 || q.y > A - 1) continue; const d = c.rivais.reduce((a, o) => Math.min(a, dist(o, q)), 99); if (d > m) { m = d; v = q; } } if (v && m > perto + 3) add("ocuparEspaco", v.x, v.y, 0.72, r.trote); }
  let melhor = ops[0], nota = -9;
  ops.forEach((o, i) => { const n = o.nota + hash(j.k * 31 + i, Math.floor(c.t / 9)) * 0.15 * (1 + (at(j, "exc") - 25) / 50) + (o.estado === j.estado ? I.margem : 0) - (o.estado === "equilibrio" && proximo ? 0.35 : 0); if (n > nota) { nota = n; melhor = o; } });
  return melhor;
}

// Quem tem a bola não escolhe o passe (o motor escolheu): o comportamento só diz o que ele faz até ela sair
function comBola(j, c) {
  const e = c.evento, aperto = c.rivais.reduce((a, o) => Math.min(a, dist(o, j)), 99), r = c.C.ritmo;
  if (e && e.chute) return { estado: "finalizar", x: j.x, y: j.y, ritmo: r.longe };
  if (e && e.conduz === j.id) return { estado: aperto < 3 ? "driblar" : "conduzir", x: e.bola[0], y: e.bola[1], ritmo: r.lance };
  if (e && e.rec && e.rec !== j.id) return { estado: "passar", x: j.x, y: j.y, ritmo: r.longe };
  if (aperto < 3) { const n = Math.max(aperto, 0.5), o = c.rivais.reduce((a, q) => dist(q, j) < dist(a, j) ? q : a); return { estado: "proteger", x: j.x + (j.x - o.x) / n * 3, y: j.y + (j.y - o.y) / n * 3, ritmo: r.perto }; }
  if (c.apoios < 1) return { estado: "aguardarApoio", x: j.x, y: j.y, ritmo: r.longe };
  return c.evento && c.evento.circula ? { estado: "procurarPasse", x: j.x, y: j.y, ritmo: r.longe } : { estado: "avancar", x: xDe(j, uDe(j, j.x) + 4), y: j.y, ritmo: r.perto };
}

// Decide um jogador: o que ele quer fazer agora, sem mexer em nada dele. A coleira segura quem foi longe da âncora sem motivo
export function decidir(j, c) {
  const o = c.portador === j ? comBola(j, c) : j.time === c.posse ? atacar(j, c) : defender(j, c);
  if (!ATA.has(o.estado) && !(j === c.portador)) {
    const k = c.C.ia.coleira[ZAGA.has(j.pos) ? "zaga" : LATERAL.has(j.pos) ? "lateral" : VOLANTE.has(j.pos) ? "volante" : PONTA.has(j.pos) ? "ponta" : ATAQUE.has(j.pos) ? "ataque" : "meia"];
    const dx = o.x - j.ancora[0], dy = o.y - j.ancora[1], d = hip(dx, dy); if (d > k) { o.x = j.ancora[0] + dx / d * k; o.y = j.ancora[1] + dy / d * k; }
  }
  if (j !== c.portador && j.pos !== "GK") espacar(j, o, c);
  return o;
}
// Espaçamento pela função: não é repulsão. Se o colega já tem aquele lugar e vale mais ali, quem cede vai para o lado da própria zona, ficando na mesma altura (a linha de passe e a
// linha do time continuam). O lance do motor e a pressão não cedem
const VALOR = { pressionar: 7, cobertura: 6, acompanharCorrida: 6, conduzir: 8, aproximarBola: 8 };
const valorDe = j => VALOR[j.estado] ?? (ZAGA.has(j.pos) ? 5 : VOLANTE.has(j.pos) ? 4.5 : LATERAL.has(j.pos) ? 4 : ATAQUE.has(j.pos) ? 3.5 : 3);
function espacar(j, o, c) {
  const K = c.C.ia.conforto, meu = VALOR[o.estado] ?? valorDe(j);
  if (meu >= 6) return;
  for (const m of c.amigos) {
    if (m === j || m.pos === "GK") continue;
    const dx = o.x - m.ax, dy = o.y - m.ay;
    if (dx * dx + dy * dy >= K * K || valorDe(m) < meu || (valorDe(m) === meu && m.k > j.k)) continue;
    let s = j.ancora[1] >= m.ay ? 1 : -1; if (m.ay + s * K > A - 2 || m.ay + s * K < 2) s = -s;
    o.y = m.ay + s * Math.sqrt(Math.max(0, K * K - dx * dx));
  }
}

// A cena: os jogadores, a bola e o tempo. gerarTrajetorias a dirige pelo roteiro; os testes montam a sua. Separa o que roda em cada passo de tempo (física) do que roda quando o
// jogador olha o campo (decisão) e do que só roda quando o lance muda (âncoras, papéis)
export function criarCena(js, bola, C = MOV, duracao = 5400) {
  const cena = { js, bola, C, t: 0, evento: null, posse: 0, transicao: false, papeis: [{}, {}], proxPapel: 0, marcados: new Map(), jogoParado: true };
  const guardado = [null, null]; // o contexto vale por 0,3 s ou até o lance mudar: 22 jogadores olhando não precisam recontar o campo 22 vezes
  const contexto = (time) => {
    const v = guardado[time]; if (v && v.evento === cena.evento && v.posse === cena.posse && cena.t - v.t < 0.3) return v;
    const amigos = js.filter(j => j.time === time && !j.fora), rivais = js.filter(j => j.time !== time && !j.fora), portador = bola.dono && !bola.dono.fora ? bola.dono : bola;
    let linhaRival = 0; const refe = amigos[0];
    if (refe) for (const o of rivais) if (o.pos !== "GK") linhaRival = Math.max(linhaRival, uDe(refe, o.x));
    const quantos = {}; for (const a of amigos) quantos[a.estado] = (quantos[a.estado] || 0) + 1;
    const uP = refe ? uDe(refe, portador.x) : 0, atrasDaBola = amigos.filter(a => a.pos !== "GK" && uDe(a, a.x) < uP).length;
    const apoios = amigos.filter(a => a !== portador && dist(a, portador) < 18).length, perto = amigos.filter(a => a !== portador && a.pos !== "GK").sort((a, b) => dist(a, portador) - dist(b, portador)).slice(0, 2);
    return guardado[time] = { C, t: cena.t, evento: cena.evento, posse: cena.posse, transicao: cena.transicao, portador, amigos, rivais, papeis: cena.papeis[time], marcados: cena.marcados, linhaRival: linhaRival || L - 10, quantos, atrasDaBola, apoios, perto };
  };
  cena.contexto = contexto;
  cena.atualizarPapeis = () => { const d = 1 - cena.posse, p = bola.dono && !bola.dono.fora ? bola.dono : bola; cena.papeis[d] = papeisDePressao(js.filter(j => j.time === d && !j.fora), p, cena.papeis[d], cena.evento ? cena.evento.marca : null, C); };
  // aplica o que o jogador decidiu. Histerese: alvo novo só se o comportamento mudou ou ele andou mais que minimo; a corrida longa sai em curva
  cena.seguir = (j, o) => {
    const novo = o.estado !== j.estado;
    if (novo) { j.estado = o.estado; j.desde = cena.t; }
    if (!novo && hip(o.x - j.ax, o.y - j.ay) < (o.estado === "pressionar" || o.estado === "acompanharCorrida" ? 1 : C.ia.minimo)) { j.ritmo = o.ritmo; return; }
    j.ax = o.x; j.ay = o.y; j.ritmo = o.ritmo;
    const dx = o.x - j.x, dy = o.y - j.y, d = hip(dx, dy);
    if (novo && d > C.ia.curva) { // arco para o lado do próprio gol (quem defende) ou do gol rival (quem ataca)
      const para = (j.time === cena.posse ? 1 : -1) * (j.time === 0 ? 1 : -1), s = (-dy * para >= 0 ? 1 : -1) * 0.18;
      j.via = { x: limitar(j.x + dx / 2 - dy * s, 1, L - 1), y: limitar(j.y + dy / 2 + dx * s, 1, A - 1) };
    } else j.via = null;
  };
  cena.passoDeTempo = (i) => {
    const t = cena.t = i * C.dt, I = C.ia;
    if (!cena.jogoParado && t >= cena.proxPapel) { cena.atualizarPapeis(); cena.proxPapel = t + I.papeis; }
    if (i % 2 === 0) for (let a = 0; a < js.length; a++) { // ninguém atravessa ninguém: quem está colado desvia; o duelo pela bola pode encostar
      const p = js[a]; p.ex = 0; p.ey = 0; if (p.fora || Math.abs(p.vx) + Math.abs(p.vy) < 2) continue; // parado não desvia: o marcador colado no marcado tremia
      for (let b = 0; b < js.length; b++) { const q = js[b]; if (a === b || q.fora) continue; const dx = p.x - q.x, dy = p.y - q.y; if (Math.abs(dx) < I.encosta && Math.abs(dy) < I.encosta) { const d = hip(dx, dy) || 0.1; if (d < I.encosta && p !== bola.dono) { if (q.time === p.time) p.ey += (p.ancora[1] >= q.ancora[1] ? 3 : -3); else { p.ex += dx / d * 3; p.ey += dy / d * 3; } } } }
    }
    for (const j of js) {
      if (j.fora) { if (t < j.entrou) continue; }
      else if (!cena.jogoParado && t >= j.proxDec) {
        const correndo = CORRIDA.has(j.estado) && t - j.desde < I.persiste && j.posseAoDecidir === cena.posse && hip(j.x - j.ax, j.y - j.ay) > 2; // cancela se a posse mudou ou ele chegou
        if ((!j.ate || t >= j.ate) && !correndo) { cena.seguir(j, decidir(j, contexto(j.time))); j.posseAoDecidir = cena.posse; }
        j.proxDec = t + I.intervalo[0] + (I.intervalo[1] - I.intervalo[0]) * (1 - limitar(j.lim.dec / 50, 0, 1));
      }
      if (j.via && hip(j.x - j.via.x, j.y - j.via.y) < 3) j.via = null;
      const a = j.via || { x: j.ax, y: j.ay };
      passo(j, a.x + (j.ex || 0), a.y + (j.ey || 0), j.lim, j.lim.vmax * j.ritmo * (1 - C.fadiga * (t / duracao) * (1 - j.lim.res / 50)), C.dt);
    }
  };
  return cena;
}
export const novoJogador = (id, k, time, pos, x, y, at = null, C = MOV) => ({ id, k, time, pos, x, y, vx: 0, vy: 0, ax: x, ay: y, ancora: [x, y], at, lim: limitesDe(at, C), ritmo: C.ritmo.longe, estado: "equilibrio", desde: 0, proxDec: k * 0.03, entrou: 0, saiu: Infinity, fora: false, via: null });

// A trajetória do jogo: amostras de x, y, vx, vy (Float32) por jogador, mais fases, posse e comportamento por amostra. fichas: { id: atributos } (sem a ficha, atributos médios).
// A bola é a última entrada de ids ("bola").
export function gerarTrajetorias(partida, registro, fichas = {}, opcoes = {}) {
  const C = { ...MOV, ...opcoes }, roteiro = montarRoteiro(partida, registro, C), ultimo = roteiro.length ? roteiro[roteiro.length - 1].t : 0;
  const duracao = Math.max(95 * 60, Math.ceil(ultimo + 10)), passos = Math.ceil(duracao / C.dt), cada = Math.max(1, Math.round(C.amostra / C.dt)), ns = Math.floor(passos / cada) + 1;
  const js = Object.entries(partida.jogadores).map(([id, x], k) => {
    const m = x.mancha, time = x.time, cCom = m ? centroDe(m.com, time) : null, cSem = m ? centroDe(m.sem, time) : null, ini = x.pos === "GK" ? [time ? 101 : 4, 34] : [(cSem || [0])[0] ?? 0, (cSem || [0, 34])[1]];
    const dentro = (x.entrou || 0) === 0, j = novoJogador(id, k, time, x.pos, dentro ? ini[0] : L / 2, dentro ? ini[1] : 0, fichas[id] || null, C);
    return Object.assign(j, { cCom, cSem, entrou: (x.entrou || 0) * 60, saiu: x.saiu == null ? Infinity : x.saiu * 60 });
  });
  for (const t of [0, 1]) for (const [c, f] of [["cCom", "fCom"], ["cSem", "fSem"]]) { // a fração de cada um no comprimento do time: mantém a ordem das linhas da formação
    const l = js.filter(j => j.time === t && j[c]), us = l.map(j => t === 0 ? j[c][0] : L - j[c][0]), a = Math.min(...us), b = Math.max(...us);
    l.forEach((j, i) => { j[f] = b > a ? (us[i] - a) / (b - a) : 0.5; });
  }
  for (const t of [0, 1]) { const l = js.filter(j => j.time === t && j.pos !== "GK" && j.fSem != null); if (l.length) l.reduce((a, b) => b.fSem > a.fSem ? b : a).sacador = true; } // quem sai jogando: o mais avançado
  for (const j of js) if (j.entrou === 0) { const p = deSaida(j, roteiro.length ? roteiro[0].posse : 0); j.x = j.ax = p[0]; j.y = j.ay = p[1]; j.ancora = p; }
  const porId = Object.fromEntries(js.map(j => [j.id, j])), n = js.length, dados = new Float32Array((n + 1) * ns * 4), fases = new Uint8Array(ns * 2), posse = new Uint8Array(ns), ativo = new Uint8Array(n * ns), comp = new Uint8Array(n * ns), alvos = new Float32Array(n * ns * 4);
  const bola = { x: L / 2, y: A / 2, vx: 0, vy: 0, dono: null, alvo: null }, cena = criarCena(js, bola, C, duracao); let prox = 0, fase = [F.bolaParada, F.bolaParada], amostra = 0;
  const guarda = () => {
    let o = amostra * (n + 1) * 4;
    for (const j of js) { dados[o++] = j.x; dados[o++] = j.y; dados[o++] = j.vx; dados[o++] = j.vy; ativo[amostra * n + j.k] = j.fora ? 0 : 1; comp[amostra * n + j.k] = COD[j.estado]; const q = (amostra * n + j.k) * 4; alvos[q] = j.ax; alvos[q + 1] = j.ay; alvos[q + 2] = j.ancora[0]; alvos[q + 3] = j.ancora[1]; }
    dados[o++] = bola.x; dados[o++] = bola.y; dados[o++] = bola.vx; dados[o] = bola.vy; fases[amostra * 2] = fase[0]; fases[amostra * 2 + 1] = fase[1]; posse[amostra++] = cena.posse;
  };
  const aplicar = e => {
    fase = e.fase; const trocou = cena.posse !== e.posse; cena.posse = e.posse; cena.evento = e; cena.transicao = !!e.transicao; bola.dono = e.dono ? porId[e.dono] || null : null; bola.alvo = e.chute || (e.dono ? null : e.bola);
    cena.jogoParado = !!(e.centro || e.area || (e.fase[0] === F.bolaParada));
    if (trocou) { cena.marcados.clear(); for (const j of js) j.vigia = null; cena.papeis = [{}, {}]; }
    const ancoras = js.map(j => j.fora ? null : e.centro ? deSaida(j, e.posse) : destino(j, e, C));
    // as âncoras não se amontoam: ninguém a menos de separacao de um colega
    for (let it = 0; it < 6; it++) for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const pa = ancoras[a], pb = ancoras[b], ja = js[a], jb = js[b];
      if (!pa || !pb || ja.time !== jb.time || ja.pos === "GK" || jb.pos === "GK") continue;
      const dx = pa[0] - pb[0], dy = pa[1] - pb[1], d = hip(dx, dy) || 0.01;
      if (d >= C.separacao) continue;
      const f = (C.separacao - d) / 2 / d; pa[0] = limitar(pa[0] + dx * f, 1, L - 1); pa[1] = limitar(pa[1] + dy * f, 1, A - 1); pb[0] = limitar(pb[0] - dx * f, 1, L - 1); pb[1] = limitar(pb[1] - dy * f, 1, A - 1);
    }
    const lance = id => id === e.rec || id === e.conduz || (id === e.marca && e.dono);
    for (const j of js) {
      const p = ancoras[j.k]; if (!p) continue; j.ancora = p;
      const dist0 = hip(j.x - e.bola[0], j.y - e.bola[1]);
      if (lance(j.id)) { // o motor mandou: quem recebe, quem carrega, quem marca o duelo. Vale até o próximo passo
        const q = j.id === e.marca ? [e.bola[0] + (j.time === 0 ? -2 : 2), e.bola[1] + 1.5] : e.bola;
        cena.seguir(j, { estado: j.id === e.conduz ? "conduzir" : j.id === e.marca ? "pressionar" : "aproximarBola", x: q[0], y: q[1], ritmo: C.ritmo.lance }); j.ate = e.t + C.passoDoLance[0];
      } else {
        j.ate = 0;
        if (cena.jogoParado) cena.seguir(j, { estado: "reorganizar", x: p[0], y: p[1], ritmo: e.centro || dist0 < C.perto ? C.ritmo.perto : C.ritmo.longe });
        // cada um percebe no seu tempo, o mais perto da bola primeiro: o time não sai todo no mesmo décimo
        else j.proxDec = Math.min(j.proxDec, e.t + Math.max(0, C.reacao.base + C.reacao.distancia * Math.min(1, dist0 / 50) + C.reacao.decisao * (25 - j.lim.dec) / 25));
      }
    }
    cena.proxPapel = 0;
  };
  for (let i = 0; i <= passos; i++) {
    const t = i * C.dt;
    if (i % cada === 0 && amostra < ns) guarda();
    for (const j of js) {
      if (!j.fora && (t < j.entrou || t >= j.saiu)) { j.fora = true; j.ax = j.x; j.ay = 0; j.via = null; j.ate = 0; j.ritmo = C.ritmo.longe; } // quem sai vai até a lateral
      if (j.fora && t >= j.entrou && t < j.saiu) j.fora = false;
    }
    while (prox < roteiro.length && roteiro[prox].t <= t) aplicar(roteiro[prox++]);
    cena.passoDeTempo(i);
    const dono = bola.dono && !bola.dono.fora ? bola.dono : null, gx = dono ? dono.x : bola.alvo ? bola.alvo[0] : bola.x, gy = dono ? dono.y : bola.alvo ? bola.alvo[1] : bola.y;
    const dx = gx - bola.x, dy = gy - bola.y, d = hip(dx, dy), m = Math.min(d, C.bola * C.dt), ox = bola.x, oy = bola.y;
    if (d > 0) { bola.x += dx / d * m; bola.y += dy / d * m; }
    bola.vx = (bola.x - ox) / C.dt; bola.vy = (bola.y - oy) / C.dt;
  }
  return { ids: [...js.map(j => j.id), "bola"], n, ns: amostra, amostra: cada * C.dt, duracao, dados, fases, posse, ativo, comp, alvos, indice: Object.fromEntries(js.map(j => [j.id, j.k])), idTime: js.map(j => j.time), pos: js.map(j => j.pos), lances: roteiro.filter(e => e.texto).map(e => ({ t: e.t, l: e.texto })) };
}

// Estado do jogador k (ou da bola, k = n) no tempo t: Hermite entre as amostras, com a velocidade guardada. Pura: o mesmo t dá sempre o mesmo lugar
export function posicaoEm(tr, k, t) {
  const f = limitar(t, 0, tr.amostra * (tr.ns - 1)) / tr.amostra, i = Math.min(tr.ns - 2, Math.floor(f)), u = f - i, h = tr.amostra, o = (tr.n + 1) * 4, a = i * o + k * 4, b = a + o, D = tr.dados;
  const u2 = u * u, u3 = u2 * u, h0 = 2 * u3 - 3 * u2 + 1, h1 = u3 - 2 * u2 + u, h2 = 3 * u2 - 2 * u3, h3 = u3 - u2, vx = D[a + 2] + (D[b + 2] - D[a + 2]) * u, vy = D[a + 3] + (D[b + 3] - D[a + 3]) * u, v = hip(vx, vy);
  const s = i + (u >= 0.5 ? 1 : 0), comp = k < tr.n && tr.comp ? COMPORTAMENTOS[tr.comp[s * tr.n + k]] : null;
  return { id: tr.ids[k], t, x: limitar(h0 * D[a] + h1 * h * D[a + 2] + h2 * D[b] + h3 * h * D[b + 2], 0, L), y: limitar(h0 * D[a + 1] + h1 * h * D[a + 3] + h2 * D[b + 1] + h3 * h * D[b + 3], 0, A), v, direcao: Math.atan2(vy, vx), estado: ESTADOS[estadoDe(v)],
    fase: k < tr.n ? FASES[tr.fases[s * 2 + tr.idTime[k]]] : null, posse: tr.posse[s], comportamento: comp, ativo: k >= tr.n || !!tr.ativo[s * tr.n + k] };
}

// O percurso gravado de um jogador, para os mapas de calor: uma linha por amostra, com a frequência de cada (saltar: a cada quantas amostras)
export function percurso(tr, id, saltar = 1) {
  const k = tr.indice[id], r = [];
  for (let s = 0; s < tr.ns; s += saltar) if (tr.ativo[s * tr.n + k]) r.push(posicaoEm(tr, k, s * tr.amostra));
  return r;
}
