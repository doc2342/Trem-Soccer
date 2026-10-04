// Desenho do relatório da partida, compartilhado pelas telas.
import { POSICOES } from "./modelo.js";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f2 = v => v.toFixed(2).replace(".", ","), f1 = v => v.toFixed(1).replace(".", ","), pc = v => Math.round(v * 100) + "%";
const COR = ["casa", "fora"];
const ORDEM_POS = ["GK", "DR", "DC", "SW", "DL", "WBR", "WBL", "DMC", "MR", "MC", "ML", "AMR", "AMC", "AML", "RW", "FC", "SC", "LW"];
const LINHAS_CAMPO = ["ataque", "meia", "meio", "volante", "ala", "defesa", "gol"];
let serieAbas = 0;

const ICONE_RESULTADO = { gol: "⚽", defesa: "🧤", trave: "🥅", fora: "👟", bloqueado: "🛡️" };
const ICONE_EVENTO = { amarelo: "🟨", vermelho: "🟥", lesao: "🩹", substituicao: "🔁", ordem: "📋", impedimento: "🚩", contra: "⚡", posse: "·", roda: "↺" };
// Nomes vêm do motor marcados com o time ("{0:Fulano}"): aqui cada um ganha a cor do seu clube.
const MARCA = /\{([01?]):([^{}]+)\}/g;
export const textoSemMarcas = t => String(t).replace(MARCA, "$2");
const textoColorido = t => esc(t).replace(MARCA, (_, time, nome) => `<span class="nm ${time === "0" ? "casa" : time === "1" ? "fora" : ""}">${nome}</span>`);
const ROTULO = { gol: "Gol", defesa: "Finalização defendida", trave: "Finalização na trave", fora: "Finalização para fora", bloqueado: "Finalização bloqueada",
  amarelo: "Cartão amarelo", vermelho: "Cartão vermelho", lesao: "Lesão", substituicao: "Substituição", ordem: "Mudança tática", impedimento: "Impedimento", contra: "Contra-ataque", posse: "Perda de posse", roda: "Roda a bola" };
// Uma linha da narração. Cada tipo tem ícone e estilo próprios: gol em destaque, cartões e lesões marcados, perdas de posse discretas.
export function htmlLance(l) {
  if (l.tipo === "inicio") return ""; // abertura da transmissão: desenhada à parte
  const finalizacao = l.resultado !== undefined, chave = finalizacao ? l.resultado : l.tipo;
  const classe = finalizacao ? (l.resultado === "gol" ? "gol" : "fin") : l.tipo;
  return `<div class="lance ${classe}"><span class="min">${l.s === undefined ? l.min + "'" : String(l.min - 1).padStart(2, "0") + ":" + String(l.s).padStart(2, "0")}</span><span class="ico" title="${ROTULO[chave] || ""}">${(finalizacao ? ICONE_RESULTADO : ICONE_EVENTO)[chave] || ""}</span>${/\{[01?]:/.test(l.texto) ? `<span class="txt">${textoColorido(l.texto)}</span>` : `<span class="${COR[l.time]}">${esc(l.texto)}</span>`}${l.xg ? `<span class="xg">xG ${f2(l.xg)}</span>` : ""}</div>`;
}
export const LEGENDA_LANCES = `<div class="legenda lances">${[["⚽", "gol"], ["🧤", "defesa"], ["👟", "fora ou bloqueada"], ["🥅", "trave"], ["🟨🟥", "cartões"], ["🔁", "substituição"], ["🩹", "lesão"], ["🚩", "impedimento"], ["⚡", "contra-ataque"], ["📋", "mudança tática"], ["·", "perda de posse"], ["↺", "roda a bola"]].map(([i, t]) => `<span>${i} ${t}</span>`).join("")}</div>`;

// r: saída de montarRelatorio. nomes: [mandante, visitante]. analistas: de quais times mostrar o comentário.
// abertura: html opcional com cara ou coroa, clima e escalações, mostrado no começo da reprise.
export function htmlRelatorio(r, { nomes = ["Mandante", "Visitante"], analistas = [0, 1], abertura = "" } = {}) {
  const E = r.esperado, n = nomes.map(esc);
  const resultado = `<div class="card"><div class="placar"><span class="casa">${n[0]} ${r.placar[0]}</span> x <span class="fora">${r.placar[1]} ${n[1]}</span>
    <small>xG ${f2(r.xg[0])} x ${f2(r.xg[1])} · pontos esperados ${f2(E.pontos[0])} x ${f2(E.pontos[1])}</small></div>
    <div class="mut" style="margin-top:8px;font-size:12px">Com as chances que cada time criou, o resultado seria:</div>
    <div class="barra"><div style="width:${E.vitoria * 100}%;background:var(--casa)">${pc(E.vitoria)}</div><div style="width:${E.empate * 100}%;background:#8b9bb0">empate ${pc(E.empate)}</div><div style="width:${E.derrota * 100}%;background:var(--fora)">${pc(E.derrota)}</div></div>
    ${r.melhor ? `<div style="margin-top:8px">Melhor em campo: <b class="${COR[r.melhor.time]}">${esc(r.melhor.nome)}</b> <span class="nota">${f1(r.melhor.nota)}</span></div>` : ""}</div>`;
  const analise = `<div class="duas">${analistas.map(i => `<div class="card"><h2 class="${COR[i]}">Analista: ${n[i]}</h2><ul>${r.analise[i].map(f => `<li>${esc(f)}</li>`).join("")}</ul></div>`).join("")}</div>`;
  const lances = LEGENDA_LANCES + abertura + r.narracao.map(htmlLance).join("");
  const linha = (t, f) => `<tr><td class="casa">${f(r.estat[0])}</td><td class="mut">${t}</td><td class="fora">${f(r.estat[1])}</td></tr>`;
  const estat = `<table>${linha("Posse", e => e.posse + "%")}${linha("Finalizações", e => e.finalizacoes)}${linha("No gol", e => e.noGol)}${linha("xG", e => f2(e.xg))}
    ${linha("Chegadas pela esquerda · centro · direita", e => `${e.corredor.E} · ${e.corredor.C} · ${e.corredor.D}`)}${linha("Escanteios", e => e.escanteios)}${linha("Faltas cometidas", e => e.faltas)}
    ${linha("Cartões amarelos · vermelhos", e => `${e.amarelos} · ${e.vermelhos}`)}${linha("Impedimentos", e => e.impedimentos)}${linha("Contra-ataques", e => e.contraAtaques)}</table>`;
  const cor = z => z.total < 4 ? "transparent" : `rgba(63,178,127,${0.08 + 0.5 * z.ganhos / z.total})`;
  const zonas = [0, 1].map(i => `<div><div class="${COR[i]}" style="margin-bottom:4px">${n[i]}</div><div class="campo">${["A", "M", "D"].map(l => ["E", "C", "D"].map(s => { const z = r.zonas[i][l + s]; return `<div style="background:${cor(z)}">${z.total ? pc(z.ganhos / z.total) : "—"}<br><span class="mut">${z.ganhos}/${z.total}</span></div>`; }).join("")).join("")}</div></div>`).join("");
  // jogadores: cada time separado, titulares na ordem das posições e, depois, quem entrou
  const ordem = p => { const k = ORDEM_POS.indexOf(p); return k < 0 ? 99 : k; };
  const marcas = j => `${"⚽".repeat(Math.min(j.gols || 0, 4))}${"🟨".repeat(Math.min(j.amarelos || 0, 1))}${j.vermelho ? "🟥" : ""}${j.lesionado ? "🩹" : ""}${j.saiu !== null && !j.vermelho && !j.lesionado ? "🔻" : ""}`;
  const corNota = v => v >= 7 ? "ok" : v < 5.5 ? "bad" : "";
  const doTime = i => { const l = r.jogadores.filter(j => j.time === i); return { tit: l.filter(j => j.entrou === 0).sort((a, b) => ordem(a.pos) - ordem(b.pos)), res: l.filter(j => j.entrou > 0).sort((a, b) => a.entrou - b.entrou) }; };
  const ficha = j => `<div class="vaga" style="cursor:default"><span class="pp">${j.pos}</span><div class="nome" title="${esc(j.nome)}">${esc(j.nome)}</div><div class="det"><b class="${corNota(j.nota)}" style="font-size:14px">${f1(j.nota)}</b> ${marcas(j)}</div></div>`;
  const campinho = i => {
    const { tit, res } = doTime(i), filas = Object.fromEntries(LINHAS_CAMPO.map(l => [l, []]));
    tit.forEach(j => (filas[(POSICOES[j.pos] || {}).linha] || filas.meio).push(j));
    const lado = j => ({ E: 0, C: 1, D: 2 })[(POSICOES[j.pos] || {}).lado] ?? 1;
    return `<div><div class="${COR[i]}" style="margin-bottom:4px;font-weight:600">${n[i]}</div><div class="gramado">${LINHAS_CAMPO.filter(l => filas[l].length).map(l => `<div class="fila">${filas[l].sort((a, b) => lado(a) - lado(b)).map(ficha).join("")}</div>`).join("")}</div>
      ${res.length ? `<div class="mut" style="margin-top:6px;font-size:12px">Entraram: ${res.map(j => `${esc(j.nome)} (${j.pos}, aos ${j.entrou}') <b class="${corNota(j.nota)}">${f1(j.nota)}</b> ${marcas(j)}`).join(" · ")}</div>` : ""}</div>`;
  };
  const cab = `<tr><th>Pos</th><th class="esq">Jogador</th><th>Nota</th><th>Min</th><th>Gols</th><th>Assist.</th><th>Finalizações</th><th>xG</th><th>Duelos ganhos · perdidos</th><th>Defesas</th><th>Faltas</th><th>Cartões</th><th>Energia no fim</th></tr>`;
  const linhaJ = j => `<tr><td><span class="pp">${j.pos}</span></td><td class="esq ${COR[j.time]}">${esc(j.nome)}</td><td class="nota">${f1(j.nota)}</td><td>${j.minutos}</td><td>${j.gols || ""}</td><td>${j.assistencias || ""}</td><td>${j.finalizacoes || ""}</td><td>${j.xg ? f2(j.xg) : ""}</td><td>${j.pos === "GK" ? "" : j.duelosGanhos + " · " + j.duelosPerdidos}</td><td>${j.pos === "GK" ? j.defesas : ""}</td><td>${j.faltas || ""}</td><td>${"🟨".repeat(Math.min(j.amarelos, 1))}${j.vermelho ? "🟥" : ""}${j.lesionado ? " lesão" : ""}</td><td>${j.energia}</td></tr>`;
  const titulo = t => `<tr><td colspan="13" class="esq mut" style="font-weight:600;padding-top:10px">${t}</td></tr>`;
  const estatisticas = `<table>${[0, 1].map(i => { const { tit, res } = doTime(i); return titulo(`<span class="${COR[i]}">${n[i]}</span> · titulares`) + cab + tit.map(linhaJ).join("") + (res.length ? titulo(`<span class="${COR[i]}">${n[i]}</span> · entraram no jogo`) + res.map(linhaJ).join("") : ""); }).join("")}</table>`;
  const id = "rj" + (++serieAbas);
  const jogadoresHtml = `<div class="rabas"><input type="radio" name="${id}" id="${id}a" class="rt1" checked><input type="radio" name="${id}" id="${id}b" class="rt2">
    <div class="rbar"><label for="${id}a" class="l1">Campinho</label><label for="${id}b" class="l2">Estatísticas</label><span class="mut" style="font-size:12px;margin-left:auto">⚽ gol · 🟨🟥 cartão · 🩹 lesão · 🔻 substituído</span></div>
    <div class="rp1"><div class="duas">${campinho(0)}${campinho(1)}</div></div><div class="rp2"><div class="rolagem">${estatisticas}</div></div></div>`;
  return `${resultado}${analise}
    <div class="duas"><div class="card"><h2>Reprise</h2>${lances}</div>
    <div><div class="card"><h2>Estatísticas</h2>${estat}</div>
    <div class="card"><h2>Mapa de zonas <span class="mut" style="font-weight:400">(duelos com a bola vencidos; cada time ataca para cima)</span></h2><div class="duas">${zonas}</div></div></div></div>
    <div class="card"><h2>Jogadores</h2>${jogadoresHtml}</div>`;
}
