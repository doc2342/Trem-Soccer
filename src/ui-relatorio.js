// Desenho do relatório da partida, compartilhado pelas telas.
import { POSICOES } from "./modelo.js";
import { sg, pp, filasDoCampo } from "./siglas.js";
import { htmlGraficos } from "./ui-graficos.js";
import { rotulo, campoDeZonas, destacar, ALTURA_DA_FAIXA } from "./ui-trem.js";
import { svgCamisa } from "./camisa.js";
import { svgEscudo } from "./escudo.js";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f2 = v => v.toFixed(2).replace(".", ","), f1 = v => v.toFixed(1).replace(".", ","), pc = v => Math.round(v * 100) + "%";
const COR = ["casa", "fora"];
const ORDEM_POS = ["GK", "DR", "DC", "SW", "DL", "WBR", "WBL", "DMC", "MR", "MC", "ML", "AMR", "AMC", "AML", "RW", "FC", "SC", "LW"];
const LINHAS_CAMPO = ["ataque", "meia", "meio", "volante", "ala", "defesa", "gol"];
let serieAbas = 0;

const ICONE_RESULTADO = { gol: "⚽", defesa: "🧤", trave: "🥅", fora: "👟", bloqueado: "🛡️" };
const ICONE_EVENTO = { amarelo: "🟨", vermelho: "🟥", lesao: "🚑", substituicao: "🔁", ordem: "📋", prorrogacao: "⏱️", acrescimo: "⏱️", penaltis: "🥅", impedimento: "🚩", contra: "⚡", posse: "·", roda: "↺", falta: "✋", canto: "⛳" };
// Nomes vêm do motor marcados com o time ("{0:Fulano}"): aqui cada um ganha a cor do seu clube.
const MARCA = /\{([01?]):([^{}]+)\}/g;
export const textoSemMarcas = t => String(t).replace(MARCA, "$2");
// Nome -> id numérico do jogador, para linkar à página dele (aba nova). A tela alimenta com lembrarJogadores; nome sem id fica texto.
const IDS = {};
export const lembrarJogadores = (...pares) => pares.forEach(([id, nome]) => { if (nome && /^j\d+$/.test(String(id))) IDS[nome] = String(id).slice(1); });
export const linkJogador = (nome, texto = nome) => IDS[nome] ? `<a class="lkj" href="jogador.html?id=${IDS[nome]}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Abrir a página do jogador">${esc(texto)}</a>` : esc(texto);
const textoColorido = t => esc(t).replace(MARCA, (_, time, nome) => `<span class="nm ${time === "0" ? "casa" : time === "1" ? "fora" : ""}">${linkJogador(nome)}</span>`);
const ROTULO = { gol: "Gol", defesa: "Finalização defendida", trave: "Finalização na trave", fora: "Finalização para fora", bloqueado: "Finalização bloqueada",
  amarelo: "Cartão amarelo", vermelho: "Cartão vermelho", lesao: "Lesão", substituicao: "Substituição", ordem: "Mudança tática", acrescimo: "Acréscimo", impedimento: "Impedimento", contra: "Contra-ataque", posse: "Perda de posse", roda: "Roda a bola", falta: "Falta", canto: "Escanteio" };
// minuto do lance como se escreve: 45+2 nos acréscimos
export const minDoLance = l => l.ac ? `${l.min}+${l.ac}` : `${l.min}`;
// Uma linha da narração. Cada tipo tem ícone e estilo próprios: gol em destaque, cartões e lesões marcados, perdas de posse discretas.
export function htmlLance(l) {
  if (l.tipo === "inicio") return ""; // abertura da transmissão: desenhada à parte
  // cobrança da disputa de pênaltis: o desfecho vem em "pen", não em "resultado", para não contar como finalização nem gol do jogo
  const finalizacao = l.resultado !== undefined, cobranca = l.tipo === "cobranca", chave = finalizacao ? l.resultado : cobranca ? l.pen : l.tipo;
  const classe = finalizacao ? (l.resultado === "gol" ? "gol" : "fin") : l.tipo;
  return `<div class="lance ${classe}"><span class="min">${l.s === undefined || l.ac ? minDoLance(l) + "'" : String(l.min - 1).padStart(2, "0") + ":" + String(l.s).padStart(2, "0")}</span><span class="ico" title="${cobranca ? "Pênalti da disputa" : ROTULO[chave] || ""}">${(finalizacao || cobranca ? ICONE_RESULTADO : ICONE_EVENTO)[chave] || ""}</span>${/\{[01?]:/.test(l.texto) ? `<span class="txt">${textoColorido(l.texto)}</span>` : `<span class="${COR[l.time]}">${esc(l.texto)}</span>`}${l.xg ? `<span class="xg">xG ${f2(l.xg)}</span>` : ""}</div>`;
}
export const LEGENDA_LANCES = `<div class="legenda lances">${[["⚽", "gol"], ["🧤", "defesa"], ["👟", "fora ou bloqueada"], ["🥅", "trave"], ["🟨🟥", "cartões"], ["🔁", "substituição"], ["🚑", "lesão"], ["🚩", "impedimento"], ["⚡", "contra-ataque"], ["📋", "mudança tática"], ["✋", "falta"], ["⛳", "escanteio"], ["·", "perda de posse"], ["↺", "roda a bola"]].map(([i, t]) => `<span>${i} ${t}</span>`).join("")}</div>`;

// Resumo da partida: quem fez os gols (e quem deu o passe), quem levou cartão e quem saiu machucado, um time de cada lado, na ordem do jogo.
// Serve à transmissão (recebe só os lances já liberados) e ao relatório. nomePorId cobre partidas gravadas antes de o lance trazer os nomes.
// eventos do resumo em dados: { tipo: "gol" | "lesao" | "amarelo" | "vermelho" | "segundo", min, quem, extra (assistente ou "pênalti") }
export function eventosDoResumo(narracao, nomePorId = {}) {
  const lados = [[], []];
  for (const l of narracao) {
    if (l.time !== 0 && l.time !== 1) continue;
    const min = minDoLance(l);
    if (l.resultado === "gol") {
      const assist = l.assist !== undefined ? l.assist : (l.criador !== l.finalizador ? nomePorId[l.criador] : null);
      lados[l.time].push({ tipo: "gol", min, quem: l.quem || nomePorId[l.finalizador] || "", extra: l.tipo === "penalti" ? "pênalti" : assist || "" });
    } else if (l.tipo === "lesao") { // o texto traz a jogada antes ("Fulano toca para Beltrano. Beltrano se machuca"): o lesionado é o nome logo antes de "se machuca"
      const m = /\{[01?]:([^{}]+)\} se machuca/.exec(l.texto || "");
      lados[l.time].push({ tipo: "lesao", min, quem: m ? m[1] : "" });
    } else if (l.tipo === "amarelo" || l.tipo === "vermelho") {
      const m = /\{[01?]:([^{}]+)\}/.exec(l.texto || "");
      lados[l.time].push({ tipo: l.tipo === "amarelo" ? "amarelo" : /^Segundo amarelo/.test(l.texto || "") ? "segundo" : "vermelho", min, quem: m ? m[1] : "" });
    }
  }
  return lados;
}
export function htmlResumo(narracao, nomePorId = {}) {
  const ICONE = { lesao: "🚑", amarelo: "🟨", vermelho: "🟥", segundo: "🟨🟥" };
  const lados = eventosDoResumo(narracao, nomePorId).map(l => l.map(e => e.tipo === "gol"
    ? `⚽ ${e.min}' ${e.quem ? `<b>${linkJogador(e.quem)}</b>` : "gol"}${e.extra === "pênalti" ? ` <span class="mut">(pênalti)</span>` : e.extra ? ` <span class="mut">(${linkJogador(e.extra)})</span>` : ""}`
    : `${ICONE[e.tipo]} ${e.min}' ${e.quem ? linkJogador(e.quem) : ""}${e.tipo === "lesao" ? ` <span class="mut">(lesão)</span>` : ""}`));
  if (!lados[0].length && !lados[1].length) return "";
  return `<div class="resumoJogo"><div class="casa">${lados[0].map(x => `<div>${x}</div>`).join("")}</div><div class="fora">${lados[1].map(x => `<div>${x}</div>`).join("")}</div></div>`;
}

// r: saída de montarRelatorio. nomes: [mandante, visitante]. analistas: de quais times mostrar o comentário.
// abertura: html opcional com cara ou coroa, clima e escalações, mostrado no começo da reprise.
// "Suas ordens": cada substituição e ordem condicional com o minuto em que aconteceu ou o motivo de não ter acontecido
const COND = { sempre: "sempre", ganhando: "se ganhando", empatando: "se empatando", perdendo: "se perdendo", umAMenos: "com um a menos", umAMais: "com um a mais", cansado: "se cansado", amarelo: "se tiver amarelo", mal: "se jogando mal", naoBem: "se não estiver bem" };
const MUDA = { mentalidade: ["muito defensiva", "defensiva", "mentalidade normal", "ofensiva", "muito ofensiva"], pressao: ["sem pressão", "pressão média", "pressão alta"] };
const textoMuda = m => Object.entries(m).map(([k, v]) => k === "mentalidade" ? "mentalidade " + MUDA.mentalidade[v + 2].replace("mentalidade ", "") : k === "pressao" ? MUDA.pressao[v] : k === "contraAtaque" ? (v ? "liga" : "desliga") + " o contra-ataque" : k === "cera" ? (v ? "faz cera" : "para a cera") : k === "passe" ? (v === "longo" ? "bola longa" : "passe " + v) : `${k}: ${v}`).join(", ");
function htmlOrdens(o, nome, cor) {
  const item = (txt, x) => `<li>${x.aos != null ? `<span class="ok">✓ ${x.aos}'</span>` : `<span class="mut">✗ não aconteceu (${esc(x.motivo)})</span>`} · ${txt}</li>`;
  const itens = [...o.subs.map(s => item(`aos ${s.min}' ${COND[s.cond] || s.cond}: sai ${esc(s.saiNome)}, entra ${esc(s.entraNome)}`, s)), ...o.ordens.map(x => item(`a partir dos ${x.min}' ${COND[x.cond] || x.cond}: ${esc(textoMuda(x.muda))}`, x))];
  return `<div class="card" data-aba="resumo"><h2 class="${cor}">Suas ordens: ${nome}</h2>${itens.length ? `<ul>${itens.join("")}</ul>` : `<div class="mut">Nenhuma substituição ou ordem planejada.</div>`}</div>`;
}
// jogadores de um time: titulares na ordem das posições e, depois, quem entrou
const ordemDaPos = p => { const k = ORDEM_POS.indexOf(p); return k < 0 ? 99 : k; };
const timeDoRelatorio = (r, i) => { const l = r.jogadores.filter(j => j.time === i); return { tit: l.filter(j => j.entrou === 0).sort((a, b) => ordemDaPos(a.pos) - ordemDaPos(b.pos)), res: l.filter(j => j.entrou > 0).sort((a, b) => a.entrou - b.entrou) }; };
export function htmlRelatorio(r, { nomes = ["Mandante", "Visitante"], analistas = [0, 1], abertura = "", semPlacar = false, ordens = null, lateral = "", jogadoresAoLado = false, aposAnalise = "", clubes = null } = {}) { // clubes: [mandante, visitante] com escudo e sigla, para os gráficos // lateral: blocos extras na coluna das estatísticas; aposAnalise: logo depois das ordens // ordens: [do mandante, do visitante] (nulo = não mostrar), só para o próprio dirigente // semPlacar: a página já mostra o placar grande em cima
  const E = r.esperado, n = nomes.map(esc);
  const resultado = `<div class="card" data-aba="resumo"><div class="placar">${semPlacar ? "" : `<span class="casa">${n[0]} ${r.placar[0]}</span> x <span class="fora">${r.placar[1]} ${n[1]}</span>`}
    <small>xG ${f2(r.xg[0])} x ${f2(r.xg[1])} · pontos esperados ${f2(E.pontos[0])} x ${f2(E.pontos[1])}</small></div>
    ${htmlResumo(r.narracao, Object.fromEntries(r.jogadores.map(j => [j.id, j.nome])))}
    <div class="mut" style="margin-top:8px;font-size:12px">Com as chances que cada time criou, o resultado seria:</div>
    <div class="barra"><div style="width:${E.vitoria * 100}%;background:var(--casa)">${pc(E.vitoria)}</div><div style="width:${E.empate * 100}%;background:#8b9bb0">empate ${pc(E.empate)}</div><div style="width:${E.derrota * 100}%;background:var(--fora)">${pc(E.derrota)}</div></div>
    ${r.melhor ? `<div style="margin-top:8px">Melhor em campo: <b class="${COR[r.melhor.time]}">${linkJogador(r.melhor.nome)}</b> <span class="nota">${f1(r.melhor.nota)}</span></div>` : ""}</div>`;
  const analise = `<div class="duas" data-aba="resumo">${analistas.map(i => `<div class="card"><h2 class="${COR[i]}">Analista: ${n[i]}</h2><ul>${r.analise[i].map(f => `<li>${esc(f)}</li>`).join("")}</ul></div>`).join("")}</div>`
    + (ordens ? analistas.filter(i => ordens[i]).map(i => htmlOrdens(ordens[i], n[i], COR[i])).join("") : "");
  const lances = LEGENDA_LANCES + abertura + r.narracao.map(htmlLance).join("");
  const linha = (t, f) => `<tr><td class="casa">${f(r.estat[0])}</td><td class="mut">${t}</td><td class="fora">${f(r.estat[1])}</td></tr>`;
  const estat = `<table><tr><th class="casa" style="font-size:13px">${n[0]}</th><th></th><th class="fora" style="font-size:13px">${n[1]}</th></tr>${linha("Posse", e => e.posse + "%")}${linha("Finalizações", e => e.finalizacoes)}${linha("No gol", e => e.noGol)}${linha("xG", e => f2(e.xg))}
    ${linha("Chegadas pela esquerda · centro · direita", e => `${e.corredor.E} · ${e.corredor.C} · ${e.corredor.D}`)}${linha("Escanteios", e => e.escanteios)}${linha("Faltas cometidas", e => e.faltas)}
    ${linha("Cartões amarelos · vermelhos", e => `${e.amarelos} · ${e.vermelhos}`)}${linha("Impedimentos", e => e.impedimentos)}${linha("Contra-ataques", e => e.contraAtaques)}</table>`;
  const cor = z => z.total < 4 ? "transparent" : `rgba(63,178,127,${0.08 + 0.5 * z.ganhos / z.total})`;
  const zonas = [0, 1].map(i => `<div><div class="${COR[i]}" style="margin-bottom:4px">${n[i]}</div><div class="campo">${["A", "M", "D"].map(l => ["E", "C", "D"].map(s => { const z = r.zonas[i][l + s]; return `<div style="background:${cor(z)}">${z.total ? pc(z.ganhos / z.total) : "—"}<br><span class="mut">${z.ganhos}/${z.total}</span></div>`; }).join("")).join("")}</div></div>`).join("");
  // jogadores: cada time separado, titulares na ordem das posições e, depois, quem entrou
  const marcas = j => `${"⚽".repeat(Math.min(j.gols || 0, 4))}${"🟨".repeat(Math.min(j.amarelos || 0, 1))}${j.vermelho ? "🟥" : ""}${j.lesionado ? "🚑" : ""}${j.saiu !== null && !j.vermelho && !j.lesionado ? "🔻" : ""}`;
  const corNota = v => v >= 7 ? "ok" : v < 5.5 ? "bad" : "";
  const doTime = i => timeDoRelatorio(r, i);
  const ficha = (j, col) => `<div class="vaga" style="cursor:default${col ? `;grid-column:${col} / span 2` : ""}">${pp(j.pos)}<div class="nome" title="${esc(j.nome)}"><span class="nc">${linkJogador(j.nome)}</span><span class="ns">${linkJogador(j.nome, j.nome.split(" ").slice(-1)[0])}</span></div><div class="det"><b class="${corNota(j.nota)}" style="font-size:14px">${f1(j.nota)}</b> ${marcas(j)}</div></div>`;
  const campinho = i => {
    const { tit, res } = doTime(i);
    return `<div><div class="${COR[i]}" style="margin-bottom:4px;font-weight:600">${n[i]}</div><div class="gramado">${filasDoCampo(tit, j => j.pos).map(fila => `<div class="fila ${fila.grade ? "grade" : ""}">${fila.itens.map(({ x, col }) => ficha(x, col)).join("")}</div>`).join("")}</div>
      ${res.length ? `<div class="mut" style="margin-top:6px;font-size:12px">Entraram: ${res.map(j => `${linkJogador(j.nome)} (${sg(j.pos)}, aos ${j.entrou}') <b class="${corNota(j.nota)}">${f1(j.nota)}</b> ${marcas(j)}`).join(" · ")}</div>` : ""}</div>`;
  };
  const cab = `<tr><th>Pos</th><th class="esq">Jogador</th><th>Nota</th><th>Min</th><th>Gols</th><th>Assist.</th><th>Finalizações</th><th>xG</th><th>Duelos ganhos · perdidos</th><th>Defesas</th><th>Faltas</th><th>Cartões</th><th>Energia no fim</th></tr>`;
  const linhaJ = j => `<tr><td>${pp(j.pos)}</td><td class="esq ${COR[j.time]}">${linkJogador(j.nome)}</td><td class="nota">${f1(j.nota)}</td><td>${j.minutos}</td><td>${j.gols || ""}</td><td>${j.assistencias || ""}</td><td>${j.finalizacoes || ""}</td><td>${j.xg ? f2(j.xg) : ""}</td><td>${j.pos === "GK" ? "" : j.duelosGanhos + " · " + j.duelosPerdidos}</td><td>${j.pos === "GK" ? j.defesas : ""}</td><td>${j.faltas || ""}</td><td>${"🟨".repeat(Math.min(j.amarelos, 1))}${j.vermelho ? "🟥" : ""}${j.lesionado ? " lesão" : ""}</td><td>${j.energia}</td></tr>`;
  const titulo = t => `<tr><td colspan="13" class="esq mut" style="font-weight:600;padding-top:10px">${t}</td></tr>`;
  const estatisticas = `<table>${[0, 1].map(i => { const { tit, res } = doTime(i); return titulo(`<span class="${COR[i]}">${n[i]}</span> · titulares`) + cab + tit.map(linhaJ).join("") + (res.length ? titulo(`<span class="${COR[i]}">${n[i]}</span> · entraram no jogo`) + res.map(linhaJ).join("") : ""); }).join("")}</table>`;
  const id = "rj" + (++serieAbas);
  const jogadoresHtml = `<div class="rabas"><input type="radio" name="${id}" id="${id}a" class="rt1" checked><input type="radio" name="${id}" id="${id}b" class="rt2">
    <div class="rbar"><label for="${id}a" class="l1">Campinho</label><label for="${id}b" class="l2">Estatísticas</label><span class="mut" style="font-size:12px;margin-left:auto">⚽ gol · 🟨🟥 cartão · 🚑 lesão · 🔻 substituído</span></div>
    <div class="rp1"><div class="duas">${campinho(0)}${campinho(1)}</div></div><div class="rp2"><div class="rolagem">${estatisticas}</div></div></div>`;
  const jogadores = `<div class="card" data-aba="jog"><h2>Jogadores</h2>${jogadoresHtml}</div>`;
  return `${resultado}${clubes ? htmlGraficos(r.narracao, clubes) : ""}${analise}${aposAnalise}
    <div class="duas"><div class="card" data-aba="lances"><h2>Reprise</h2>${lances}</div>
    <div><div class="card" data-aba="estat"><h2>Estatísticas</h2>${estat}</div>${lateral}
    <div class="card" data-aba="estat"><h2>Mapa de zonas <span class="mut" style="font-weight:400">(duelos com a bola vencidos; cada time ataca para cima)</span></h2><div class="duas">${zonas}</div></div>${jogadoresAoLado ? jogadores : ""}</div></div>
    ${jogadoresAoLado ? "" : jogadores}`;
}

// ---------- visual novo (trem.css): o relatório em capítulos — o placar (faixa escura), o jogo contado, o vestiário e o que vem de fora ----------
// Mesmos dados de htmlRelatorio. ids: [mandante, visitante] para os links do clube; uniformes: as camisas do jogo (uniformesDoJogo);
// numeros: [nome → número da camisa] de cada time; titulo: o rótulo da faixa (competição · rodada); aviso: HTML logo abaixo dele;
// fim: o que vai embaixo do placar; números da faixa (público, renda…) em `extras`; penaltis, diretoria e rodada: HTML pronto da tela; meu: o lado do dirigente que olha
// no campinho, cada linha na altura que a Tática usa (ALTURA_DA_FAIXA: o meio no círculo central, volantes e alas logo abaixo)
const FAIXA_DA_LINHA = { ataque: 0, meia: 1, meio: 2, volante: 3, ala: 3, defesa: 4, gol: 5 };
const ladoNoCampo = p => ({ E: 0, C: 1, D: 2 })[(POSICOES[p] || {}).lado] ?? 1;
const faixaNoCampo = p => FAIXA_DA_LINHA[(POSICOES[p] || {}).linha] ?? 2;
const NUMEROS_DO_JOGO = [["Posse", e => e.posse + "%", e => e.posse], ["Finalizações", e => e.finalizacoes], ["No gol", e => e.noGol], ["xG", e => f2(e.xg), e => e.xg],
  ["Pela esquerda", e => e.corredor.E], ["Pelo centro", e => e.corredor.C], ["Pela direita", e => e.corredor.D],
  ["Escanteios", e => e.escanteios], ["Faltas", e => e.faltas], ["Amarelos", e => e.amarelos], ["Vermelhos", e => e.vermelhos], ["Impedimentos", e => e.impedimentos], ["Contra-ataques", e => e.contraAtaques]];
export function htmlRelatorioNovo(r, { nomes = ["Mandante", "Visitante"], clubes = null, ids = null, uniformes = null, numeros = null, titulo = "", aviso = "", fim = "Fim de jogo", extras = "",
  analistas = [0, 1], abertura = "", ordens = null, penaltis = "", diretoria = "", rodada = "", meu = null } = {}) {
  const E = r.esperado, n = nomes.map(esc), C = clubes || [{}, {}], U = uniformes || [{}, {}];
  const lk = (i, html) => ids ? `<a href="jogo.html#clube=${ids[i]}" target="_blank" rel="noopener" title="Abrir a página do clube">${html}</a>` : html;
  const tinta = (i, reserva) => /^#[0-9a-f]{6}$/i.test(U[i].cor1 || "") ? U[i].cor1 : reserva;
  // capítulo 1: o placar. Embaixo de cada time, os gols, as expulsões e as lesões (os amarelos ficam no campinho)
  const ev = eventosDoResumo(r.narracao, Object.fromEntries(r.jogadores.map(j => [j.id, j.nome])));
  // como na TV: os do mandante alinhados à direita (o minuto encostado no meio), os do visitante à esquerda
  const item = (e, i) => { const quem = `${e.quem ? linkJogador(e.quem) : e.tipo === "gol" ? "gol" : ""}${e.tipo === "gol" && e.extra ? ` <small>${e.extra === "pênalti" ? "pênalti" : linkJogador(e.extra)}</small>` : e.tipo === "lesao" ? " <small>lesão</small>" : ""}`;
    return `<li data-tipo="${e.tipo}">${i ? `<span>${e.min}'</span> ${quem}` : `${quem} <span>${e.min}'</span>`}</li>`; };
  const time = i => `<div class="t-rel-time${i ? " t-rel-fora" : ""}">${C[i].escudo || C[i].sigla ? lk(i, svgEscudo(C[i].escudo, C[i].sigla, 64)) : ""}<h1 class="t-rel-nome">${lk(i, n[i])}</h1></div>`;
  const evs = [0, 1].map(i => ev[i].filter(e => e.tipo !== "amarelo").map(e => item(e, i)).join(""));
  const esp = [[nomes[0], E.vitoria], ["Empate", E.empate], [nomes[1], E.derrota]];
  const m = r.melhor;
  const faixa = `<section class="t-faixa t-sangra t-rel-faixa"><div class="t-faixa-texto">${rotulo(titulo)}${aviso}
    <div class="t-rel-placar">${time(0)}<div class="t-rel-gols"><b>${r.placar[0]}<i>×</i>${r.placar[1]}</b><small>${esc(fim)}</small></div>${time(1)}</div>
    ${evs[0] || evs[1] ? `<div class="t-rel-evs"><ul class="t-rel-ev">${evs[0]}</ul><ul class="t-rel-ev t-rel-ev-fora">${evs[1]}</ul></div>` : ""}</div>
    <div class="t-faixa-lado">${rotulo("Pelas chances criadas")}
      <div class="t-rel-esp">${esp.map(([nome, v], k) => `<div><b>${Math.round(v * 100)}<small>%</small></b><span>${k === 1 ? "empate" : esc(nome)}</span></div>`).join("")}</div>
      <div class="t-rel-barra"><i style="flex:${E.vitoria};background:${tinta(0, "var(--casa)")}"></i><i style="flex:${E.empate}"></i><i style="flex:${E.derrota};background:${tinta(1, "var(--fora)")}"></i></div>
      <p class="t-rel-xg">xG <b>${f2(r.xg[0])} × ${f2(r.xg[1])}</b> · pontos esperados <b>${f2(E.pontos[0])} × ${f2(E.pontos[1])}</b></p>
      ${m ? `<div class="t-rel-melhor"><div><div class="t-numero-rotulo">Melhor em campo</div><b>${linkJogador(m.nome)}</b><span>${esc(nomes[m.time])}</span></div><em>${f1(m.nota)}</em></div>` : ""}
      ${extras ? `<div class="t-faixa-numeros">${extras}</div>` : ""}</div></section>`;
  // capítulo 2: o jogo contado — gráficos, a reprise e os números lado a lado
  const regua = `<div class="t-regua-cab"><span>${n[0]}</span><span>${n[1]}</span></div><div class="t-regua t-rel-regua">${NUMEROS_DO_JOGO.map(([nome, f, v = f]) => {
    const a = +v(r.estat[0]) || 0, b = +v(r.estat[1]) || 0, pct = a + b ? Math.round(100 * a / (a + b)) : 50, lado = (x, maior) => maior ? `<b>${x}</b>` : `<span>${x}</span>`;
    return `<div class="t-regua-linha" style="--nos:${pct}%">${lado(f(r.estat[0]), a > b)}<span class="t-regua-nome">${nome}</span>${lado(f(r.estat[1]), b > a)}</div>`; }).join("")}</div>`;
  const lances = `<section class="t-secao t-rel-reprise" data-aba="lances">${rotulo("Lance a lance")}${abertura}${r.narracao.map(htmlLance).join("")}</section>`;
  const jogo = `<section class="t-secao t-rel-jogo" data-aba="graf">${clubes ? htmlGraficos(r.narracao, clubes) : ""}<div class="t-rel-numeros">${rotulo("Números")}${regua}</div></section>`;
  // capítulo 3: o vestiário — o analista de cada lado (o do dirigente primeiro) com o campo dos duelos e as ordens; depois como cada um saiu
  const ordem = meu === 1 ? [1, 0] : [0, 1];
  const itensDasOrdens = o => [...o.subs.map(s => [`aos ${s.min}' ${COND[s.cond] || s.cond}: sai ${esc(s.saiNome)}, entra ${esc(s.entraNome)}`, s]), ...o.ordens.map(x => [`a partir dos ${x.min}' ${COND[x.cond] || x.cond}: ${esc(textoMuda(x.muda))}`, x])];
  const ordensNovas = o => { const l = itensDasOrdens(o); return `<div class="t-rel-ordens"><div class="t-numero-rotulo">Suas ordens</div>${l.length ? l.map(([t, x]) => `<div class="t-rel-ordem${x.aos != null ? "" : " t-rel-nao"}"><b>${x.aos != null ? x.aos + "'" : "não"}</b><span>${t}${x.aos != null ? "" : ` <small>${esc(x.motivo)}</small>`}</span></div>`).join("") : `<p>Nenhuma substituição ou ordem planejada.</p>`}</div>`; };
  // relatórios gravados antes da correção em src/relatorio.js dizem "pela nossa centro da defesa"
  const analista = i => { const [lead, ...resto] = (r.analise[i] || []).map(f => f.replace("pela nossa centro da defesa", "pelo centro da nossa defesa"));
    return `<article class="t-rel-analista"><div class="t-rel-an-cab">${C[i].escudo || C[i].sigla ? svgEscudo(C[i].escudo, C[i].sigla, 22) : ""}<b>${n[i]}</b><span>o analista</span></div>
      <div class="t-rel-an-corpo">${r.estat[i] && r.estat[i].zonas ? `<div class="t-rel-an-campo">${campoDeZonas(r.estat[i].zonas, r.estat[1 - i].zonas)}<small>duelos vencidos por zona · ataque em cima</small></div>` : ""}
      <div>${lead ? `<p class="t-rel-lead">${destacar(lead)}</p>` : ""}<ul class="t-rel-frases">${resto.map(f => `<li>${destacar(f)}</li>`).join("")}</ul>${ordens && ordens[i] ? ordensNovas(ordens[i]) : ""}${(diretoria && diretoria[i]) || ""}</div></div></article>`; };
  // como cada um saiu: o campinho com a camisa do jogo e a nota; quem entrou embaixo
  const cor = v => v >= 7 ? "ok" : v < 5.5 ? "bad" : "";
  const sinais = j => `${j.gols ? `<i class="t-rel-s-gol">${j.gols > 1 ? j.gols : ""}</i>` : ""}${j.vermelho ? `<i class="t-rel-s-verm"></i>` : j.amarelos ? `<i class="t-rel-s-am"></i>` : ""}${j.lesionado ? `<i class="t-rel-s-les">+</i>` : ""}`;
  const naCamisa = (j, i) => `<div class="t-st-s"><span class="t-st-cam">${svgCamisa(j.pos === "GK" ? {} : U[i], 42, false, { numero: (numeros && numeros[i] && numeros[i](j.nome)) || "" })}<em class="${cor(j.nota)}">${f1(j.nota)}</em>${sinais(j)}</span><b>${linkJogador(j.nome, j.nome.split(" ").slice(-1)[0])}</b><small>${esc(sg(j.pos))}${j.saiu != null && !j.vermelho ? ` · saiu ${j.saiu}'` : ""}</small></div>`;
  const campinho = i => { const { tit, res } = timeDoRelatorio(r, i);
    return `<div><div class="t-cal-dia">${n[i]}</div><div class="t-st-campo t-rel-campo"><i class="t-st-area"></i><i class="t-st-area t-st-baixo"></i><i class="t-st-meio"></i>${ALTURA_DA_FAIXA.map((alt, k) => (ps => !ps.length ? "" : `<div class="t-st-linha" style="top:calc(${alt}% - ${alt / 2}px)">${ps.sort((a, b) => ladoNoCampo(a.pos) - ladoNoCampo(b.pos)).map(j => naCamisa(j, i)).join("")}</div>`)(tit.filter(j => faixaNoCampo(j.pos) === k))).join("")}</div>
      ${res.length ? `<div class="t-rel-entraram"><span class="t-numero-rotulo">Entraram</span>${res.map(j => `<span>${linkJogador(j.nome)} <small>${esc(sg(j.pos))} · ${j.entrou}'</small> <b class="${cor(j.nota)}">${f1(j.nota)}</b></span>`).join("")}</div>` : ""}</div>`; };
  const cab = `<tr><th>Pos</th><th class="t-esq">Jogador</th><th>Nota</th><th>Min</th><th>Gols</th><th>Assist.</th><th>Final.</th><th>xG</th><th>Duelos</th><th>Defesas</th><th>Faltas</th><th>Cartões</th><th>Energia</th></tr>`;
  const linhaJ = j => `<tr><td>${esc(sg(j.pos))}</td><td class="t-esq">${linkJogador(j.nome)}</td><td><b class="${cor(j.nota)}">${f1(j.nota)}</b></td><td>${j.minutos}</td><td>${j.gols || ""}</td><td>${j.assistencias || ""}</td><td>${j.finalizacoes || ""}</td><td>${j.xg ? f2(j.xg) : ""}</td><td>${j.pos === "GK" ? "" : j.duelosGanhos + "–" + j.duelosPerdidos}</td><td>${j.pos === "GK" ? j.defesas : ""}</td><td>${j.faltas || ""}</td><td>${[j.amarelos ? "amarelo" : "", j.vermelho ? "vermelho" : "", j.lesionado ? "lesão" : ""].filter(Boolean).join(", ")}</td><td>${j.energia}%</td></tr>`;
  const tabela = `<details class="t-rel-mais"><summary>Todos os números dos jogadores</summary><div class="t-rel-rola"><table class="t-tabela t-rel-tab">${ordem.map(i => { const { tit, res } = timeDoRelatorio(r, i);
    return `<tr class="t-rel-tab-time"><td colspan="13" class="t-esq">${n[i]}</td></tr>${cab}${[...tit, ...res].map(linhaJ).join("")}`; }).join("")}</table></div></details>`;
  const vestiario = `<section class="t-secao t-rel-vest" data-aba="resumo">${penaltis}${rotulo("Vestiário")}<div class="t-rel-analistas">${ordem.filter(i => analistas.includes(i)).map(analista).join("")}</div></section>`;
  const saiu = `<section class="t-secao t-rel-saiu" data-aba="jog">${rotulo("Como cada um saiu")}<div class="t-st-campos">${ordem.map(campinho).join("")}</div>${tabela}</section>`;
  // abas (data-ir; a tela troca a classe .fora-aba): o placar fica sempre em cima, um capítulo por vez embaixo
  const abas = [["resumo", "Resumo"], ["lances", "Lances"], ["graf", "Números"], ["jog", "Jogadores"], rodada && ["rodada", "Rodada"]].filter(Boolean);
  return faixa + `<nav class="subabas t-rel-abas">${abas.map(([k, t]) => `<button type="button" class="sub" data-ir="${k}">${t}</button>`).join("")}</nav>` + vestiario + lances + jogo + saiu + rodada;
}
