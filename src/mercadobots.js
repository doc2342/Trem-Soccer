// Mercado entre bots: uma vez por janela, clubes sem dono compram reservas de outros clubes sem dono que melhoram o time titular.
// Não depende do banco: recebe clubes e elencos e devolve os negócios; quem grava (e confere tudo de novo) é transferir_entre_bots,
// do 66_multa_e_bots.sql, chamado pela função "rodada".
// - O talento sobe: o bot só compra de clubes da mesma divisão ou de uma abaixo, e as divisões de cima escolhem primeiro.
// - Quem vende tem critério: só reserva com mais de 21 anos, e primeiro o que sobra (posição com reservas de sobra, veterano).
// - Bot no vermelho vende mais barato e para quem ganha menos com o reforço, até dois jogadores por janela.
import { notaNaPosicao, notaComPe, POSICOES } from "./modelo.js";
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
  estrangeiros: 5,        // jogadores de outra nacionalidade por clube (82_mercado_entre_paises.sql)
  livresPorJanela: 8,     // livres contratados por bots por janela na liga inteira (113_bots_contratam_livres.sql): o resto fica para os dirigentes
};

// quantos jogadores do elenco têm nacionalidade diferente do país do clube, e se este jogador seria mais um
const estrangeirosDe = (c, el) => (el || []).filter(j => estrangeiroEm(j, c)).length;
const estrangeiroEm = (j, c) => !!j.pais && j.pais !== (c.pais || "Brasil");

// clubes: [{ id, divisao, pais, caixa, teto }] (só os sem dono); elencos: { clube: [jogador no formato do motor, com salario, juvenil e aposentaEm] }
// Devolve [{ jogador (id numérico), para, valor, salario, de, ganho }].
export function negociosEntreBots(rng, { clubes, elencos }, C = CONFIG_MERCADO_BOTS) {
  const num = id => +String(id).replace(/^\D+/, "");
  const porId = Object.fromEntries(clubes.map(c => [c.id, { ...c, folha: (elencos[c.id] || []).reduce((s, j) => s + (j.salario || 0), 0), vendas: 0, vermelho: (c.caixa || 0) < 0, estr: estrangeirosDe(c, elencos[c.id]) }]));
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
    // goleiro: o bot só procura outro se o dele for pior que a média dos titulares de linha (senão os bons goleiros sobem todos de divisão)
    const deLinha = (titulares[id] || []).filter(x => x.pos !== "GK"), mediaDaLinha = deLinha.length ? deLinha.reduce((s, x) => s + x.nota, 0) / deLinha.length : 0;
    for (const vaga of titulares[id] || []) {
      if (vaga.pos === "GK" && vaga.nota >= mediaDaLinha) continue;
      for (const o of vitrine) {
        const v = porId[o.de];
        if (o.de === id || o.vendido || v.vendas >= (v.vermelho ? 2 : 1) || (vaga.pos === "GK") !== (o.j.pos === "GK")) continue;
        if (estrangeiroEm(o.j, b) && b.estr >= C.estrangeiros) continue;
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
    melhor.o.vendido = true; b.caixa -= melhor.valor; b.folha += melhor.salario; if (estrangeiroEm(melhor.o.j, b)) b.estr++;
    const v = porId[melhor.o.de]; v.vendas++; v.caixa += melhor.valor; v.folha -= melhor.o.j.salario || 0;
    negocios.push({ jogador: num(melhor.o.j.id), para: id, valor: melhor.valor, salario: melhor.salario, de: melhor.o.de, ganho: +melhor.ganho.toFixed(1), sobra: melhor.o.sobra, vermelho: v.vermelho });
  }
  return negocios;
}

// Bots compram da lista de transferência dos dirigentes (72_bots_compram_listados.sql). Pelo preço pedido, sem pechincha:
// só se o preço couber na conta do bot (precoEmSalarios), se o jogador reforçar o time titular (ganhoMinimo) e um por bot por janela.
// O banco só entrega em `listados` quem já esperou o prazo na lista sem proposta de dirigente; quem fecha (e confere tudo de novo) é bot_compra_listado.
// listados: [{ j (formato do motor, com salario, juvenil e aposentaEm), preco }]; jaCompraram: ids dos bots que já compraram nesta janela.
// Devolve [{ jogador (id numérico), para, valor, salario, ganho }].
export function comprasDeListados({ clubes, elencos, listados, jaCompraram = [] }, C = CONFIG_MERCADO_BOTS) {
  const usados = new Set(jaCompraram), compras = [];
  const bots = clubes.map(c => { const el = (elencos[c.id] || []).filter(j => !j.juvenil);
    const onze = (el.length >= 11 ? taticaBot(el).escalacao : []).map(x => ({ pos: x.pos, nota: notaNaPosicao(x.j, x.pos) })), linha = onze.filter(x => x.pos !== "GK");
    return { ...c, onze, contratados: el.length, estr: estrangeirosDe(c, elencos[c.id]), folha: el.reduce((s, j) => s + (j.salario || 0), 0), mediaDaLinha: linha.length ? linha.reduce((s, x) => s + x.nota, 0) / linha.length : 0 }; });
  for (const { j, preco } of listados) {
    if (j.juvenil || j.aposentaEm != null || j.idade > C.idadeMaxima) continue;
    const mercado = salarioDeMercado(j), salario = Math.max(mercado, j.salario || 0);
    if (!(preco > 0) || preco > C.precoEmSalarios * mercado) continue; // acima da conta do bot: ele não paga
    let melhor = null;
    for (const b of bots) {
      if (usados.has(b.id) || b.contratados >= 30 || (estrangeiroEm(j, b) && b.estr >= C.estrangeiros)) continue;
      if (b.caixa - preco < C.reserva * b.teto || b.folha + salario > b.teto || salario > C.maximoIndividual * b.teto) continue;
      // goleiro: mesmo freio do mercado entre bots (só troca se o dele for pior que a média da linha)
      const ganho = Math.max(-99, ...b.onze.filter(v => (v.pos === "GK") === (j.pos === "GK") && !(v.pos === "GK" && v.nota >= b.mediaDaLinha)).map(v => notaNaPosicao(j, v.pos) - v.nota));
      if (ganho >= C.ganhoMinimo && (!melhor || ganho > melhor.ganho)) melhor = { b, ganho };
    }
    if (!melhor) continue;
    const b = melhor.b; usados.add(b.id); b.caixa -= preco; b.folha += salario; if (estrangeiroEm(j, b)) b.estr++;
    compras.push({ jogador: +String(j.id).replace(/^\D+/, ""), para: b.id, valor: preco, salario, ganho: +melhor.ganho.toFixed(1) });
  }
  return compras;
}

// Bots tapam buracos no banco com jogadores livres (113_bots_contratam_livres.sql). Buraco: titular sem reserva no elenco com 85% da nota
// dele na posição (a mesma régua das trocas do bot). O livre precisa ter essa nota; o maior buraco escolhe primeiro, um livre por bot por janela.
// O banco só entrega em `livres` quem está livre há o prazo, sem leilão; quem contrata (e confere tudo de novo) é bot_contrata_livre.
// livres: [{ j (formato do motor), salario }]; jaContrataram: ids dos bots que já contrataram livre nesta janela.
// Devolve [{ jogador (id numérico), para, salario, buraco, fica }] (buraco e fica: reserva antes e depois, em fração da nota do titular).
export function livresParaOsBots({ clubes, elencos, livres, jaContrataram = [] }, C = CONFIG_MERCADO_BOTS) {
  const usados = new Set(jaContrataram), pedidos = [];
  for (const b of clubes) {
    const el = (elencos[b.id] || []).filter(j => !j.juvenil);
    if (usados.has(b.id) || el.length < 11 || el.length >= 30 || (b.caixa || 0) < C.reserva * b.teto) continue;
    const t = taticaBot(el), naEscalacao = new Set(t.escalacao.map(x => x.j.id)), reservas = el.filter(j => !naEscalacao.has(j.id));
    const folha = el.reduce((s, j) => s + (j.salario || 0), 0), estr = estrangeirosDe(b, elencos[b.id]);
    for (const x of t.escalacao) {
      const titular = notaComPe(x.j, x.pos), goleiro = x.pos === "GK";
      const buraco = Math.max(0, ...reservas.filter(r => (r.pos === "GK") === goleiro).map(r => notaComPe(r, x.pos))) / titular;
      if (buraco >= 0.85) continue;
      for (const { j, salario } of livres) {
        if ((j.pos === "GK") !== goleiro || j.aposentaEm != null || folha + salario > b.teto || salario > C.maximoIndividual * b.teto) continue;
        if (estrangeiroEm(j, b) && estr >= C.estrangeiros) continue;
        const fica = notaComPe(j, x.pos) / titular;
        if (fica >= 0.85) pedidos.push({ b, j, salario, buraco, fica });
      }
    }
  }
  // o maior buraco escolhe primeiro (e, nele, o melhor livre); quem perdeu o preferido fica com a opção seguinte
  const tomados = new Set(), contratos = [];
  for (const p of pedidos.sort((a, b) => a.buraco - b.buraco || b.fica - a.fica)) {
    if (jaContrataram.length + contratos.length >= C.livresPorJanela) break;
    if (tomados.has(p.j.id) || usados.has(p.b.id)) continue;
    tomados.add(p.j.id); usados.add(p.b.id);
    contratos.push({ jogador: +String(p.j.id).replace(/^\D+/, ""), para: p.b.id, salario: p.salario, buraco: +p.buraco.toFixed(2), fica: +p.fica.toFixed(2) });
  }
  return contratos;
}
