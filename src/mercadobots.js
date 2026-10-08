// Mercado entre bots: uma vez por janela, clubes sem dono compram reservas de outros clubes sem dono que melhoram o time titular.
// Não depende do banco: recebe clubes e elencos e devolve os negócios; quem grava (e confere tudo de novo) é transferir_entre_bots,
// do 66_multa_e_bots.sql, chamado pela função "rodada".
import { notaNaPosicao } from "./modelo.js";
import { taticaBot } from "./bot.js";
import { salarioDeMercado } from "./economia.js";

export const CONFIG_MERCADO_BOTS = {
  porJanela: 10,         // negócios por janela na liga inteira, no máximo
  precoEmSalarios: 4,    // preço = 4 vezes o salário de mercado do jogador (entre a venda pelo agente, 2,5, e a multa, 5)
  ganhoMinimo: 1.5,      // o reforço precisa render pelo menos 1,5 ponto de nota a mais que o titular que ele substitui
  idadeMaxima: 31,       // bot não compra veterano
  reserva: 0.25,         // depois da compra, o caixa precisa ficar acima de 25% do teto de folha
  maximoIndividual: 0.15, // ninguém ganha mais de 15% do teto
  elencoMinimo: 19,      // quem vende fica com pelo menos 19 jogadores profissionais
};

// clubes: [{ id, caixa, teto }] (só os sem dono); elencos: { clube: [jogador no formato do motor, com salario, juvenil e aposentaEm] }
// Devolve [{ jogador (id numérico), para, valor, salario }].
export function negociosEntreBots(rng, { clubes, elencos }, C = CONFIG_MERCADO_BOTS) {
  const num = id => +String(id).replace(/^\D+/, "");
  const porId = Object.fromEntries(clubes.map(c => [c.id, { ...c, folha: (elencos[c.id] || []).reduce((s, j) => s + (j.salario || 0), 0), comprou: false, vendeu: false }]));
  // titulares de cada clube pela tática do bot; quem não é titular pode ser vendido
  const titulares = {}, vitrine = [];
  for (const c of clubes) {
    const el = (elencos[c.id] || []).filter(j => !j.juvenil);
    const t = el.length >= 11 ? taticaBot(el) : { escalacao: [] };
    titulares[c.id] = t.escalacao.map(x => ({ j: x.j, pos: x.pos, nota: notaNaPosicao(x.j, x.pos) }));
    const naEscalacao = new Set(t.escalacao.map(x => x.j.id)), goleiros = el.filter(j => j.pos === "GK").length;
    for (const j of el) {
      if (naEscalacao.has(j.id) || j.salario == null || j.aposentaEm != null || j.idade > C.idadeMaxima) continue;
      if (j.pos === "GK" && goleiros <= 2) continue; // não vende o segundo goleiro
      vitrine.push({ j, de: c.id, mercado: salarioDeMercado(j) });
    }
  }
  const negocios = [], compradores = rng.embaralhar(clubes.map(c => c.id));
  for (const id of compradores) {
    if (negocios.length >= C.porJanela) break;
    const b = porId[id];
    let melhor = null;
    for (const vaga of titulares[id] || []) {
      for (const o of vitrine) {
        if (o.de === id || porId[o.de].vendeu || o.vendido || (vaga.pos === "GK") !== (o.j.pos === "GK")) continue;
        const ganho = notaNaPosicao(o.j, vaga.pos) - vaga.nota;
        if (ganho < C.ganhoMinimo || (melhor && ganho <= melhor.ganho)) continue;
        const valor = Math.round(C.precoEmSalarios * o.mercado), salario = Math.max(o.mercado, o.j.salario || 0);
        if (b.caixa - valor < C.reserva * b.teto || b.folha + salario > b.teto || salario > C.maximoIndividual * b.teto) continue;
        if ((elencos[o.de] || []).filter(j => !j.juvenil).length <= C.elencoMinimo) continue;
        melhor = { o, ganho, valor, salario };
      }
    }
    if (!melhor) continue;
    melhor.o.vendido = true; b.comprou = true; b.caixa -= melhor.valor; b.folha += melhor.salario;
    const v = porId[melhor.o.de]; v.vendeu = true; v.caixa += melhor.valor; v.folha -= melhor.o.j.salario || 0;
    negocios.push({ jogador: num(melhor.o.j.id), para: id, valor: melhor.valor, salario: melhor.salario, de: melhor.o.de, ganho: +melhor.ganho.toFixed(1) });
  }
  return negocios;
}
