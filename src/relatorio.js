// Relatório da partida: resultado esperado pelo xG, notas dos jogadores, mapa de zonas e comentário do analista.
import { ZONAS } from "./motor.js";

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
function notas(partida) {
  const extra = {};
  const de = id => extra[id] || (extra[id] = { assistencias: 0, defesas: 0, sofridos: 0, xgContra: 0 });
  for (const l of partida.lances) {
    if (l.resultado === "gol" && l.criador !== l.finalizador) de(l.criador).assistencias++;
    if (l.goleiro) {
      const g = de(l.goleiro);
      if (l.resultado === "defesa") g.defesas++;
      if (l.resultado === "gol") g.sofridos++;
      if (l.resultado === "gol" || l.resultado === "defesa") g.xgContra += l.xg;
    }
  }
  return Object.entries(partida.jogadores).map(([id, j]) => {
    const x = de(id), minutos = (j.saiu === null ? partida.duracao || 90 : j.saiu) - j.entrou;
    let nota = 6;
    if (j.pos === "GK") nota += 0.3 * x.defesas - 0.4 * x.sofridos + 0.6 * (x.xgContra - x.sofridos);
    else nota += limitar(0.4 * (j.duelosGanhos - j.duelosEsperados), -2, 2) + 1.1 * j.gols + 0.6 * x.assistencias + 0.5 * (j.xg - j.gols * 0.5) - 0.08 * j.faltas;
    nota -= 0.3 * Math.min(1, j.amarelos) + (j.vermelho ? 1.5 : 0);
    return { id, ...j, ...x, minutos, nota: limitar(Math.round(nota * 10) / 10, 1, 10) };
  });
}

const NOME_ZONA = { DE: "defesa esquerda", DC: "centro da defesa", DD: "defesa direita", ME: "meio esquerdo", MC: "centro do meio", MD: "meio direito", AE: "ataque pela esquerda", AC: "ataque pelo centro", AD: "ataque pela direita" };
const pc = v => Math.round(v * 100) + "%";
const f2 = v => v.toFixed(2).replace(".", ",");

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
  const taxa = (e, z) => { const [g, p] = e.zonas[z]; return g + p >= 6 ? g / (g + p) : null; };
  const ataque = ["AE", "AC", "AD"].map(z => [z, taxa(eu, z)]).filter(x => x[1] !== null).sort((a, b) => b[1] - a[1]);
  if (ataque.length) frases.push(`Nosso melhor caminho foi o ${NOME_ZONA[ataque[0][0]]}: ${pc(ataque[0][1])} dos duelos vencidos.`);
  const espelho = { AE: "DD", AC: "DC", AD: "DE" };
  const sofrido = ["AE", "AC", "AD"].map(z => [espelho[z], taxa(ele, z)]).filter(x => x[1] !== null).sort((a, b) => b[1] - a[1]);
  if (sofrido.length && sofrido[0][1] > 0.5) frases.push(`O adversário passou mais pela nossa ${NOME_ZONA[sofrido[0][0]]}: venceu ${pc(sofrido[0][1])} dos duelos ali.`);
  const meio = ["ME", "MC", "MD"].reduce((s, z) => { s[0] += eu.zonas[z][0]; s[1] += eu.zonas[z][1]; return s; }, [0, 0]);
  if (meio[0] + meio[1] >= 10) frases.push(`No meio-campo vencemos ${pc(meio[0] / (meio[0] + meio[1]))} dos duelos com a bola e tivemos ${eu.posse}% de posse.`);
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

// nivelAnalista: [nível do analista do mandante, do visitante], de 1 a 3
export function montarRelatorio(partida, nivelAnalista = [3, 3]) {
  const esperado = resultadoEsperado(partida.lances), jogadores = notas(partida);
  return {
    placar: partida.placar, xg: partida.xg, esperado,
    jogadores,
    melhor: jogadores.filter(j => j.minutos >= 30).sort((a, b) => b.nota - a.nota)[0] || null,
    zonas: partida.estat.map(e => Object.fromEntries(ZONAS.map(z => { const [g, p] = e.zonas[z]; return [z, { ganhos: g, total: g + p }]; }))),
    analise: [0, 1].map(i => analise(partida, esperado, jogadores, i, nivelAnalista[i])),
    estat: partida.estat, narracao: partida.narracao,
  };
}
