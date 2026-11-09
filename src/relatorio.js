// Relatório da partida: resultado esperado pelo xG, notas dos jogadores, mapa de zonas e comentário do analista.
import { ehGrade, nomeDaZona, espelhoGrade, faixaDe, corredorDe, CORREDORES } from "./grade.js";
import { POSICOES } from "./modelo.js";

// Distribuição do número de gols a partir do xG de cada finalização (cada uma entra ou não, de forma independente).
function distribuicaoGols(xgs) {
  let d = [1];
  for (const p of xgs) {
    const n = new Array(d.length + 1).fill(0);
    d.forEach((v, k) => { n[k] += v * (1 - p); n[k + 1] += v * p; });
    d = n;
  }
  return d;
}

// Chance de vitória, empate e derrota do time 0 e pontos esperados de cada um, pelas chances que cada time criou.
export function resultadoEsperado(lances) {
  const d = [0, 1].map(i => distribuicaoGols(lances.filter(l => l.time === i).map(l => l.xg)));
  let v = 0, e = 0;
  d[0].forEach((pa, a) => d[1].forEach((pb, b) => { if (a > b) v += pa * pb; else if (a === b) e += pa * pb; }));
  const der = 1 - v - e;
  return { vitoria: v, empate: e, derrota: der, pontos: [3 * v + e, 3 * der + e] };
}

const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

// Nota de 1 a 10: duelos vencidos acima ou abaixo do esperado, gols, assistências, chances, cartões; goleiro pelas defesas e pelo xG que enfrentou.
// Na régua do Sofascore (dono, 09/11; prints de 11 jogos reais, 241 notas): média ~7, defensor sobe com o resultado.
//   base: soma por posição para a média de quem joga 45 min ou mais bater com a real (GK 6,7, zagueiro e lateral 6,8, volante 7,0,
//   meia 7,1–7,3, ponta 7,3, atacante 7,2), medida em ferramentas/sim_notas.mjs
//   resultado: por grupo, vitória / empate, sem sofrer gol enquanto esteve em campo (cs) e cada gol sofrido em campo além do primeiro (extra).
//   Real (defensor): vitória sem sofrer 7,6 | 0x0 7,2 | vitória sofrendo 7,1 | empate sofrendo 6,7 | derrota por 1–2 6,6 | por 3–5 6,1.
//   O ataque já sobe com o resultado pelos gols e chances; o meia e o ponta, um pouco menos que no real.
// A forma (saude.js) segue com a nota de antes (notaForma): a régua dela (notaTipica) é dessa nota, e o resultado já pesa na moral.
export const NOTA = {
  base: { GK: 0.7, DC: 0.7, SW: 0.7, DR: 0.7, DL: 0.7, WBR: 0.7, WBL: 0.7, DMC: 1.05, MC: 1, MR: 1.1, ML: 1.1, AMC: 1.1, AMR: 0.97, AML: 0.97, RW: 0.97, LW: 0.97, FC: 0.67, SC: 0.67 },
  resultado: {
    defesa: { vitoria: 0.45, empate: 0.15, cs: 0.45, extra: -0.1 },
    volante: { vitoria: 0.15, empate: 0.05, cs: 0.15, extra: 0 },
    meio: { vitoria: 0.1, empate: 0.03, cs: 0, extra: 0 },
    lado: { vitoria: 0.25, empate: 0.08, cs: 0, extra: 0 },
  },
  grupo: { DC: "defesa", SW: "defesa", DR: "defesa", DL: "defesa", WBR: "defesa", WBL: "defesa", DMC: "volante", MC: "meio", MR: "lado", ML: "lado", AMC: "lado", AMR: "lado", AML: "lado", RW: "lado", LW: "lado" },
};
function notas(partida) {
  const extra = {};
  const de = id => extra[id] || (extra[id] = { assistencias: 0, defesas: 0, sofridos: 0, xgContra: 0 });
  for (const l of partida.lances) {
    if (l.resultado === "gol" && l.criador !== l.finalizador) de(l.criador).assistencias++;
    if (l.goleiro) {
      const g = de(l.goleiro);
      if (l.resultado === "defesa") g.defesas++;
      if (l.resultado === "gol") g.sofridos++;
      if (l.resultado === "gol" || l.resultado === "defesa") g.xgContra += l.xgGk ?? l.xg;
    }
  }
  const placar = partida.placar || [0, 0], fim = partida.duracao || 90;
  const golsDe = i => partida.lances.filter(l => l.resultado === "gol" && l.time === i).map(l => l.min);
  const gols = [golsDe(0), golsDe(1)];
  return Object.entries(partida.jogadores).map(([id, j]) => {
    const x = de(id), saiu = j.saiu === null ? fim : j.saiu, minutos = saiu - j.entrou;
    let nota = 6;
    if (j.pos === "GK") nota += 0.3 * x.defesas - 0.4 * x.sofridos + 0.6 * (x.xgContra - x.sofridos);
    else nota += limitar(0.4 * (j.duelosGanhos - j.duelosEsperados), -2, 2) + 1.1 * j.gols - 0.8 * (j.golsContra || 0) + 0.6 * x.assistencias + 0.5 * (j.xg - j.gols * 0.5) - 0.08 * j.faltas;
    nota -= 0.3 * Math.min(1, j.amarelos) + (j.vermelho ? 1.5 : 0);
    const notaForma = limitar(Math.round(nota * 10) / 10, 1, 10);
    const R = NOTA.resultado[NOTA.grupo[j.pos]], i = j.time;
    if (R && (i === 0 || i === 1)) {
      const sofridos = gols[1 - i].filter(m => m > j.entrou && m <= saiu).length; // em campo
      nota += placar[i] > placar[1 - i] ? R.vitoria : placar[i] === placar[1 - i] ? R.empate : 0;
      nota += sofridos ? R.extra * (sofridos - 1) : minutos >= 45 ? R.cs : 0; // o "jogo sem sofrer gol" só para quem jogou o bastante
    }
    nota += NOTA.base[j.pos] || 0;
    return { id, ...j, ...x, minutos, nota: limitar(Math.round(nota * 10) / 10, 1, 10), notaForma };
  });
}

const NOME_ZONA = { DE: "defesa esquerda", DC: "centro da defesa", DD: "defesa direita", ME: "meio esquerdo", MC: "centro do meio", MD: "meio direito", AE: "ataque pela esquerda", AC: "ataque pelo centro", AD: "ataque pela direita" };
const pc = v => Math.round(v * 100) + "%";
const f2 = v => v.toFixed(2).replace(".", ",");

// Analista num jogo da grade: o melhor caminho e por onde o adversário passou, pela zona das faixas 4–5 com duelos suficientes
// (ou, sem nenhuma, pelo corredor nas faixas 3–5); o meio-campo pelas faixas 2–3.
const por = n => n.replace(/^a /, "pela ").replace(/^o /, "pelo ");
const NOME_CORREDOR = { E: "pelo lado esquerdo", e: "pelo meio-espaço esquerdo", C: "pelo centro", d: "pelo meio-espaço direito", D: "pelo lado direito" };
const NOSSO_LADO = { E: " (o nosso lado esquerdo)", e: " (o nosso meio-espaço esquerdo)", d: " (o nosso meio-espaço direito)", D: " (o nosso lado direito)", C: "" };
function melhorCaminho(zonas) {
  const soma = zs => zs.reduce((s, z) => [s[0] + zonas[z][0], s[1] + zonas[z][1]], [0, 0]);
  const taxa = ([g, p]) => g + p >= 6 ? g / (g + p) : null, melhor = l => l.filter(x => x[1] !== null).sort((a, b) => b[1] - a[1])[0];
  const zona = melhor(Object.keys(zonas).filter(z => faixaDe(z) >= 4).map(z => [z, taxa(zonas[z])]));
  if (zona) return { nome: por(nomeDaZona(zona[0])), corredor: corredorDe(zona[0]), taxa: zona[1] };
  const c = melhor(CORREDORES.map(c => [c, taxa(soma([3, 4, 5].map(f => f + c)))]));
  return c ? { nome: NOME_CORREDOR[c[0]], corredor: c[0], taxa: c[1] } : null;
}
function zonasDaGrade(eu, ele) {
  const frases = [], nosso = melhorCaminho(eu.zonas), deles = melhorCaminho(ele.zonas);
  if (nosso) frases.push(`Nosso melhor caminho foi ${nosso.nome}: ${pc(nosso.taxa)} dos duelos vencidos.`);
  // o lado deles é o oposto do nosso (o lado esquerdo do ataque deles chega na nossa direita)
  if (deles && deles.taxa > 0.5) frases.push(`O adversário passou mais ${deles.nome}${NOSSO_LADO[CORREDORES[4 - CORREDORES.indexOf(deles.corredor)]]}: venceu ${pc(deles.taxa)} dos duelos ali.`);
  const meio = Object.keys(eu.zonas).filter(z => faixaDe(z) === 2 || faixaDe(z) === 3).reduce((s, z) => [s[0] + eu.zonas[z][0], s[1] + eu.zonas[z][1]], [0, 0]);
  if (meio[0] + meio[1] >= 10) frases.push(`No meio-campo vencemos ${pc(meio[0] / (meio[0] + meio[1]))} dos duelos com a bola e tivemos ${eu.posse}% de posse.`);
  return frases;
}

// Mapa do jogador num jogo da grade (participação, não posição: no motor ele fica na mancha do papel), pelos passos do registro
// do motor ([time, de, para, tipo, passador, receptor, venceu, conduziu, espaço, marcador]): com = o time atacando (onde ele passou,
// pela zona de saída, e recebeu ou conduziu, pela de chegada); sem = o time defendendo (duelos como marcador, na zona dele, o espelho);
// lado = passos do adversário nos dois corredores do lado dele (null para quem joga por dentro). Tudo nas coordenadas do time dele.
export function mapaDoJogador(passos, id, time, pos) {
  const com = {}, sem = {}, mais = (m, z) => { m[z] = (m[z] || 0) + 1; }, ld = POSICOES[pos] && POSICOES[pos].lado;
  const doLado = ld === "E" ? "Ee" : ld === "D" ? "Dd" : null;
  let lado = doLado ? 0 : null;
  for (const x of passos) {
    if (x[1] === "fim") continue;
    if (x[0] === time) { if (x[4] === id) mais(com, x[1]); if (x[5] === id) mais(com, x[2]); continue; }
    const z = espelhoGrade(x[2]);
    if (x[9] === id) mais(sem, z);
    if (doLado && doLado.includes(z[1])) lado++;
  }
  return { com, sem, lado };
}

// Comentário do analista para o time i. nivel 1 a 3: quanto melhor o analista, mais ele enxerga.
function analise(partida, esperado, jogadores, i, nivel) {
  const eu = partida.estat[i], ele = partida.estat[1 - i], frases = [];
  const saldo = eu.gols - ele.gols, difXg = eu.xg - ele.xg;
  // 1. o resultado foi justo?
  if (saldo < 0 && difXg > 0.4) frases.push(`Resultado injusto: criamos ${f2(eu.xg)} de xG contra ${f2(ele.xg)} e perdemos. Com as mesmas chances, venceríamos ${pc(i === 0 ? esperado.vitoria : esperado.derrota)} das vezes.`);
  else if (saldo > 0 && difXg < -0.4) frases.push(`Vencemos, mas o adversário criou mais: ${f2(ele.xg)} de xG contra ${f2(eu.xg)}. Não dá para contar com isso sempre.`);
  else if (saldo === 0 && Math.abs(difXg) > 0.6) frases.push(difXg > 0 ? `O empate ficou barato para o adversário: tivemos ${f2(eu.xg)} de xG contra ${f2(ele.xg)}.` : `O empate foi bom negócio: o adversário teve ${f2(ele.xg)} de xG contra ${f2(eu.xg)}.`);
  else if (saldo >= 2 && difXg < 0.7) frases.push(`O placar ficou mais largo do que o jogo: ${f2(eu.xg)} de xG nosso contra ${f2(ele.xg)} do adversário. A diferença esteve na pontaria, não nas chances.`);
  else if (saldo <= -2 && difXg > -0.7) frases.push(`O placar foi mais pesado do que o jogo: criamos ${f2(eu.xg)} de xG contra ${f2(ele.xg)} do adversário. A diferença esteve na pontaria, não nas chances.`);
  else if (saldo !== 0 && Math.abs(difXg) < 0.3) frases.push(`Jogo parelho decidido no detalhe: ${f2(eu.xg)} de xG nosso contra ${f2(ele.xg)} do adversário.`);
  else frases.push(`O placar reflete o jogo: ${f2(eu.xg)} de xG nosso contra ${f2(ele.xg)} do adversário.`);
  // 2. pontaria
  if (eu.gols - eu.xg <= -1) frases.push(`Faltou pontaria: ${eu.finalizacoes} finalizações e ${eu.gols} ${eu.gols === 1 ? "gol" : "gols"} para ${f2(eu.xg)} de xG.`);
  else if (eu.gols - eu.xg >= 1) frases.push(`Aproveitamento acima do normal: ${eu.gols} gols com ${f2(eu.xg)} de xG.`);
  if (nivel < 2) return frases;
  // 3. zonas: onde atacamos melhor e onde o adversário passou
  if (ehGrade(Object.keys(eu.zonas)[0])) frases.push(...zonasDaGrade(eu, ele));
  else {
    const taxa = (e, z) => { const [g, p] = e.zonas[z]; return g + p >= 6 ? g / (g + p) : null; };
    const ataque = ["AE", "AC", "AD"].map(z => [z, taxa(eu, z)]).filter(x => x[1] !== null).sort((a, b) => b[1] - a[1]);
    if (ataque.length) frases.push(`Nosso melhor caminho foi o ${NOME_ZONA[ataque[0][0]]}: ${pc(ataque[0][1])} dos duelos vencidos.`);
    const espelho = { AE: "DD", AC: "DC", AD: "DE" };
    const sofrido = ["AE", "AC", "AD"].map(z => [espelho[z], taxa(ele, z)]).filter(x => x[1] !== null).sort((a, b) => b[1] - a[1]);
    if (sofrido.length && sofrido[0][1] > 0.5) frases.push(`O adversário passou mais ${sofrido[0][0] === "DC" ? "pelo centro da nossa defesa" : "pela nossa " + NOME_ZONA[sofrido[0][0]]}: venceu ${pc(sofrido[0][1])} dos duelos ali.`);
    const meio = ["ME", "MC", "MD"].reduce((s, z) => { s[0] += eu.zonas[z][0]; s[1] += eu.zonas[z][1]; return s; }, [0, 0]);
    if (meio[0] + meio[1] >= 10) frases.push(`No meio-campo vencemos ${pc(meio[0] / (meio[0] + meio[1]))} dos duelos com a bola e tivemos ${eu.posse}% de posse.`);
  }
  if (nivel < 3) return frases;
  // 4. jogadores e energia
  const meus = jogadores.filter(j => j.time === i && j.minutos >= 30);
  if (meus.length) {
    const ord = meus.slice().sort((a, b) => b.nota - a.nota), melhor = ord[0], pior = ord[ord.length - 1];
    frases.push(`Melhor em campo do nosso lado: ${melhor.nome} (nota ${String(melhor.nota).replace(".", ",")}). Quem menos rendeu: ${pior.nome} (${String(pior.nota).replace(".", ",")}).`);
    const cansados = meus.filter(j => j.saiu === null && j.pos !== "GK" && j.energia < 40);
    if (cansados.length) frases.push(`Terminaram sem pernas: ${cansados.map(j => j.nome).join(", ")}. Vale trocar mais cedo ou baixar a pressão.`);
  }
  const parada = partida.lances.filter(l => l.time === 1 - i && ["escanteio", "falta", "penalti"].includes(l.tipo));
  const golsParada = parada.filter(l => l.resultado === "gol").length;
  if (golsParada) frases.push(`Sofremos ${golsParada} ${golsParada === 1 ? "gol" : "gols"} de bola parada em ${eu.faltas} faltas cometidas.`);
  return frases;
}

// nivelAnalista: [nível do analista do mandante, do visitante], de 1 a 3. passos: o opcoes.registro do motor (só a grade o preenche):
// com ele, cada jogador ganha o mapa (mapaDoJogador). Zonas: as que o jogo tiver (25 na grade, 9 nas 9 zonas); quem lê 9 usa paraNoveZonas.
export function montarRelatorio(partida, nivelAnalista = [3, 3], passos = null) {
  const esperado = resultadoEsperado(partida.lances), jogadores = notas(partida);
  if (passos && passos.length) for (const j of jogadores) if (j.pos !== "GK") j.mapa = mapaDoJogador(passos, j.id, j.time, j.pos);
  return {
    placar: partida.placar, xg: partida.xg, esperado,
    jogadores,
    melhor: jogadores.filter(j => j.minutos >= 30).sort((a, b) => b.nota - a.nota)[0] || null,
    zonas: partida.estat.map(e => Object.fromEntries(Object.keys(e.zonas).map(z => { const [g, p] = e.zonas[z]; return [z, { ganhos: g, total: g + p }]; }))),
    analise: [0, 1].map(i => analise(partida, esperado, jogadores, i, nivelAnalista[i])),
    estat: partida.estat, narracao: partida.narracao,
  };
}
