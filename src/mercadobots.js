// Mercado entre bots: uma vez por janela, clubes sem dono compram reservas de outros clubes sem dono que melhoram o time titular.
// Não depende do banco: recebe clubes e elencos e devolve os negócios; quem grava (e confere tudo de novo) é transferir_entre_bots,
// do 66_multa_e_bots.sql, chamado pela função "rodada".
// - O talento sobe: o bot só compra de clubes da mesma divisão ou de uma abaixo, e as divisões de cima escolhem primeiro.
// - Quem vende tem critério: só reserva com mais de 21 anos, e primeiro o que sobra (posição com reservas de sobra, veterano).
// - Bot no vermelho vende mais barato e para quem ganha menos com o reforço, até dois jogadores por janela.
import { notaNaPosicao, POSICOES } from "./modelo.js";
import { taticaBot } from "./bot.js";
import { salarioDeMercado } from "./economia.js";

export const CONFIG_MERCADO_BOTS = {
  porJanela: 10,          // negócios por janela na liga inteira, no máximo
  precoEmSalarios: 4,     // preço = 4 vezes o salário de mercado do jogador (entre a venda pelo agente, 2,5, e a multa, 5)
  precoNoVermelho: 3,     // quem está no vermelho vende por 3 vezes
  ganhoMinimo: 1.5,       // o reforço precisa render pelo menos 1,5 ponto de nota a mais que o titular que ele substitui
  ganhoNoVermelho: 0.5,   // comprando de quem está no vermelho, basta 0,5
  bonusDaSobra: 1,        // entre reforços parecidos, o comprador prefere o que sobra no vendedor
  idadeMinima: 22,        // jovem de até 21 anos não é vendido
  idadeMaxima: 31,        // bot não compra veterano
  veterano: 30,           // a partir dos 30, o reserva conta como sobra
  reserva: 0.25,          // depois da compra, o caixa precisa ficar acima de 25% do teto de folha
  maximoIndividual: 0.15, // ninguém ganha mais de 15% do teto
  elencoMinimo: 19,       // quem vende fica com pelo menos 19 jogadores profissionais
  divisoesAbaixo: 1,      // compra da mesma divisão ou de até uma abaixo
};

// clubes: [{ id, divisao, caixa, teto }] (só os sem dono); elencos: { clube: [jogador no formato do motor, com salario, juvenil e aposentaEm] }
// Devolve [{ jogador (id numérico), para, valor, salario, de, ganho }].
export function negociosEntreBots(rng, { clubes, elencos }, C = CONFIG_MERCADO_BOTS) {
  const num = id => +String(id).replace(/^\D+/, "");
  const porId = Object.fromEntries(clubes.map(c => [c.id, { ...c, folha: (elencos[c.id] || []).reduce((s, j) => s + (j.salario || 0), 0), vendas: 0, vermelho: (c.caixa || 0) < 0 }]));
  const linha = j => (POSICOES[j.pos] || {}).linha || j.pos;
  // titulares de cada clube pela tática do bot; quem não é titular pode ser vendido
  const titulares = {}, vitrine = [];
  for (const c of clubes) {
    const el = (elencos[c.id] || []).filter(j => !j.juvenil);
    const t = el.length >= 11 ? taticaBot(el) : { escalacao: [] };
    titulares[c.id] = t.escalacao.map(x => ({ j: x.j, pos: x.pos, nota: notaNaPosicao(x.j, x.pos) }));
    const naEscalacao = new Set(t.escalacao.map(x => x.j.id)), goleiros = el.filter(j => j.pos === "GK").length;
    const reservas = el.filter(j => !naEscalacao.has(j.id)), reservasDaLinha = {};
    reservas.forEach(j => { reservasDaLinha[linha(j)] = (reservasDaLinha[linha(j)] || 0) + 1; });
    for (const j of reservas) {
      if (j.salario == null || j.aposentaEm != null || j.idade < C.idadeMinima || j.idade > C.idadeMaxima) continue;
      if (j.pos === "GK" && goleiros <= 2) continue; // não vende o segundo goleiro
      const sobra = j.idade >= C.veterano || reservasDaLinha[linha(j)] >= 3;
      // fora do vermelho, o clube só vende quem sobra ou quem deixa outro reserva na mesma linha
      if (!porId[c.id].vermelho && !sobra && reservasDaLinha[linha(j)] < 2) continue;
      vitrine.push({ j, de: c.id, mercado: salarioDeMercado(j), sobra });
    }
  }
  const negocios = [];
  // as divisões de cima escolhem primeiro; dentro da divisão, a ordem é sorteada
  const compradores = rng.embaralhar(clubes.map(c => c.id)).sort((a, b) => (porId[a].divisao || 3) - (porId[b].divisao || 3));
  for (const id of compradores) {
    if (negocios.length >= C.porJanela) break;
    const b = porId[id];
    let melhor = null;
    for (const vaga of titulares[id] || []) {
      for (const o of vitrine) {
        const v = porId[o.de];
        if (o.de === id || o.vendido || v.vendas >= (v.vermelho ? 2 : 1) || (vaga.pos === "GK") !== (o.j.pos === "GK")) continue;
        const dv = (v.divisao || 3) - (b.divisao || 3);
        if (dv < 0 || dv > C.divisoesAbaixo) continue; // o talento só sobe ou fica na mesma divisão
        const ganho = notaNaPosicao(o.j, vaga.pos) - vaga.nota;
        if (ganho < (v.vermelho ? C.ganhoNoVermelho : C.ganhoMinimo)) continue;
        const pontos = ganho + (o.sobra ? C.bonusDaSobra : 0);
        if (melhor && pontos <= melhor.pontos) continue;
        const valor = Math.round((v.vermelho ? C.precoNoVermelho : C.precoEmSalarios) * o.mercado), salario = Math.max(o.mercado, o.j.salario || 0);
        if (b.caixa - valor < C.reserva * b.teto || b.folha + salario > b.teto || salario > C.maximoIndividual * b.teto) continue;
        if ((elencos[o.de] || []).filter(j => !j.juvenil).length - v.vendas <= C.elencoMinimo) continue;
        melhor = { o, ganho, pontos, valor, salario };
      }
    }
    if (!melhor) continue;
    melhor.o.vendido = true; b.caixa -= melhor.valor; b.folha += melhor.salario;
    const v = porId[melhor.o.de]; v.vendas++; v.caixa += melhor.valor; v.folha -= melhor.o.j.salario || 0;
    negocios.push({ jogador: num(melhor.o.j.id), para: id, valor: melhor.valor, salario: melhor.salario, de: melhor.o.de, ganho: +melhor.ganho.toFixed(1), sobra: melhor.o.sobra, vermelho: v.vermelho });
  }
  return negocios;
}
