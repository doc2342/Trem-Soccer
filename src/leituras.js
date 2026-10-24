// Leituras do visual novo: frases que dizem o que os números significam para o clube (regra 2 da spec do redesign,
// docs/superpowers/specs/2026-10-24-redesign-identidade-design.md). Puro e determinístico: o mesmo dado dá sempre a mesma frase.
// Uma leitura tem o formato que leitura() de src/ui-trem.js recebe: { tipo, titulo, frase, acao?: { texto, abaIr, tipo? }, zona? } (zona: a do nosso campo que ela cita).
import { classificacao } from "./rodada.js";

const pc = v => Math.round(v * 100) + "%";
const pontos = d => d + (d === 1 ? " ponto" : " pontos");
const jogos = n => n + (n === 1 ? " jogo" : " jogos");
const lista = nomes => nomes.length < 2 ? nomes.join("") : nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];

// títulos por zona (as do motor e de src/relatorio.js): onde o nosso ataque funcionou e por onde o adversário passou
export const TITULO_DO_ATAQUE = { AE: "O ataque pela esquerda funcionou", AC: "O ataque pelo centro funcionou", AD: "O ataque pela direita funcionou" };
export const TITULO_DA_DEFESA = { DE: "Pela nossa defesa esquerda", DC: "Pelo centro da nossa defesa", DD: "Pela nossa defesa direita" };
const ESPELHO = { AE: "DD", AC: "DC", AD: "DE" };
const MINIMO_DE_DUELOS = 6, CANSADO = 60, MAXIMO = 4;

// a zona de ataque com a maior taxa de duelos ganhos (com pelo menos MINIMO_DE_DUELOS), ou null
function melhorZona(estat) {
  const z = estat && estat.zonas;
  if (!z) return null;
  return ["AE", "AC", "AD"].map(k => { const [g, p] = z[k] || [0, 0]; return g + p >= MINIMO_DE_DUELOS ? { zona: k, taxa: g / (g + p) } : null; })
    .filter(Boolean).sort((a, b) => b.taxa - a.taxa)[0] || null;
}

// relatorio: o gravado em resultados.relatorio (saída de montarRelatorio); lado: 0 mandante, 1 visitante; nivel: nivelDoAnalista (1 sem analista)
// elenco: jogadores do clube no formato de doElenco (src/banco.js). Devolve no máximo MAXIMO leituras, das mais importantes às menos.
export function leiturasDoVestiario({ relatorio, lado, nivel, elenco }) {
  if (!relatorio) return [];
  const estat = relatorio.estat || [], l = [];
  if (nivel >= 2) {
    const deles = melhorZona(estat[1 - lado]);
    if (deles && deles.taxa > 0.5) l.push({ tipo: "falhou", zona: ESPELHO[deles.zona], titulo: TITULO_DA_DEFESA[ESPELHO[deles.zona]], frase: `O adversário venceu ${pc(deles.taxa)} dos duelos ali.`,
      acao: { texto: "Ajustar a tática", abaIr: "tatica", tipo: "principal" } });
  }
  const fora = (elenco || []).filter(j => !j.juvenil && j.fora > 0);
  if (fora.length) {
    const como = j => j.motivo === "suspensão" ? "suspenso" : j.motivo === "lesão" ? "lesionado" : "fora";
    l.push(fora.length === 1
      ? { tipo: "desfalque", titulo: `${fora[0].nome} está ${como(fora[0])}`, frase: `Fora por ${jogos(fora[0].fora)}.`, acao: { texto: "Escolher o substituto", abaIr: "tatica" } }
      : { tipo: "desfalque", titulo: `${fora.length} desfalques`, frase: lista(fora.map(j => `${j.nome} (${j.motivo || "fora"}, ${jogos(j.fora)})`)) + ".", acao: { texto: "Escolher o substituto", abaIr: "tatica" } });
  }
  if (nivel >= 2) {
    const nossa = melhorZona(estat[lado]);
    if (nossa && nossa.taxa > 0.5) l.push({ tipo: "funcionou", zona: nossa.zona, titulo: TITULO_DO_ATAQUE[nossa.zona], frase: `${pc(nossa.taxa)} dos duelos vencidos ali.`, acao: { texto: "Manter a tática", abaIr: "tatica", tipo: "link" } });
  }
  const m = relatorio.melhor; // o melhor em campo, pela nota do relatório: entra com o analista nível 3, como no comentário pós-jogo
  if (nivel >= 3 && m && m.time === lado) l.push({ tipo: "destaque", titulo: `${m.nome} foi o melhor em campo`, frase: `Nota ${String(m.nota).replace(".", ",")} no jogo.` });
  const cansados = (relatorio.jogadores || []).filter(j => j.time === lado && j.saiu === null && j.pos !== "GK" && j.energia < CANSADO);
  if (cansados.length) l.push({ tipo: "atencao", titulo: "Terminaram cansados", frase: lista(cansados.slice(0, 3).map(j => j.nome)) + "." });
  const resumo = relatorio.analise && relatorio.analise[lado] && relatorio.analise[lado][0];
  if (resumo) l.push({ tipo: "resultado", titulo: "O jogo", frase: resumo });
  const bloqueada = { tipo: "bloqueada", titulo: "Por onde o jogo foi decidido", frase: "Contrate um analista para ver as zonas do jogo.", acao: { texto: "Ver a comissão", abaIr: "clube", tipo: "link" } };
  return nivel >= 2 ? l.slice(0, MAXIMO) : [...l.slice(0, MAXIMO - 1), bloqueada];
}

// posição do clube ao fim de cada rodada de liga que já tem resultado
export function posicoesPorRodada(clubes, partidas, resultados, clubeId) {
  const daLiga = partidas.filter(p => !p.fase || p.fase === "liga"), com = new Set(resultados.map(r => r.partida_id));
  const rodadas = [...new Set(daLiga.filter(p => com.has(p.id)).map(p => p.rodada))].sort((a, b) => a - b);
  return rodadas.map(r => classificacao(clubes, daLiga.filter(p => p.rodada <= r), resultados).findIndex(t => t.clube.id === clubeId) + 1);
}

const BOAS = ["camp", "lib", "sul", "sobe", "playoff"];
const NOME_DA_ZONA = { camp: "liderança", lib: "Libertadores", sul: "Sul-Americana", sobe: "zona da semifinal", playoff: "zona do playoff" }; // "sobe" na Série B desde a T14: os dois primeiros vão direto à semifinal do playoff
const boa = f => (f || "").split(" ").find(t => BOAS.includes(t));
const cai = f => (f || "").split(" ").includes("cai");

// tab: classificacao(); faixas[i]: as classes de faixaDaTabela (jogo.html) da posição i; rodadasRestantes: rodadas de liga que faltam
export function leituraDaTabela({ tab, clubeId, faixas, rodadasRestantes }) {
  const i = tab.findIndex(t => t.clube.id === clubeId);
  if (i < 0) return null;
  // rodadasRestantes null: o calendário ainda não foi sorteado
  const r = rodadasRestantes, saida = { titulo: `${i + 1}º lugar ·`, apagado: r == null ? "calendário a sortear" : r === 0 ? "fim da fase" : r === 1 ? "falta 1 rodada" : `faltam ${r} rodadas`, destaque: "", frase: "" };
  if (tab.every(t => !t.j)) return saida;
  const eu = tab[i].pts;
  if (boa(faixas[i])) {
    const k = tab.findIndex((t, x) => x > i && faixas[x] !== faixas[i]);
    if (k >= 0) { const d = eu - tab[k].pts; saida.frase = d === 0 ? `Empatado em pontos com o ${k + 1}º.` : `${pontos(d)} à frente do ${k + 1}º.`; }
  } else if (cai(faixas[i])) {
    const k = tab.map((t, x) => x).filter(x => x < i && !cai(faixas[x])).pop();
    saida.destaque = "Na zona de rebaixamento.";
    if (k != null) { const d = tab[k].pts - eu; saida.frase = d === 0 ? "Empatado em pontos com quem está fora." : `${pontos(d)} para sair.`; }
  } else {
    const k = tab.map((t, x) => x).filter(x => x < i && boa(faixas[x])).pop();
    if (k != null) { const d = tab[k].pts - eu, nome = NOME_DA_ZONA[boa(faixas[k])]; saida.destaque = d === 0 ? `Empatado em pontos com a ${nome}.` : `A ${pontos(d)} da ${nome}.`; }
  }
  return saida;
}

// formaDoRival: resultados do rival do mais antigo ao mais recente ("V", "E", "D"). null sem rival ou com rival fora desta tabela (copa)
export function leituraDoProximoJogo({ tab, clubeId, rivalId, formaDoRival }) {
  const i = tab.findIndex(t => t.clube.id === clubeId), k = tab.findIndex(t => t.clube.id === rivalId);
  if (rivalId == null || i < 0 || k < 0) return null;
  const nome = tab[k].clube.nome, d = Math.abs(tab[i].pts - tab[k].pts);
  const saida = d <= 3 ? { titulo: "Confronto direto", frase: d === 0 ? `O ${nome} está empatado com você em pontos.` : `O ${nome} está a ${pontos(d)} de você.` }
    : { titulo: `${nome}, ${k + 1}º colocado`, frase: "" };
  let seguidas = 0;
  for (let x = (formaDoRival || []).length - 1; x >= 0 && formaDoRival[x] === "V"; x--) seguidas++;
  if (seguidas >= 3) saida.frase = [saida.frase, `Chega com ${seguidas} vitórias seguidas.`].filter(Boolean).join(" ");
  return saida;
}
