# -*- coding: utf-8 -*-
"""Gera supabase/functions/rodada/index.ts: a função do servidor com o motor embutido.

O Supabase não deixa a função importar código do site do jogo, então os módulos de src/ são copiados para dentro
de um arquivo só. Cada módulo vira um bloco isolado que devolve o que exporta.

Uso: python ferramentas/empacotar_funcao.py   (rodar de novo sempre que o motor mudar, e publicar a função outra vez)
"""
import io, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULOS = ["rng", "modelo", "saude", "escalacao", "motor", "bot", "relatorio", "rodada", "treino", "ligabase", "economia", "mercadobots"]  # em ordem de dependência

RE_IMPORT = re.compile(r'^import\s*\{([^}]*)\}\s*from\s*"\./(\w+)\.js";\s*$', re.M | re.S)
RE_EXPORT = re.compile(r'^export\s+(?=(?:async\s+)?(?:const|let|function)\s+(\w+))', re.M)


EXPORTADOS = {}  # módulo -> nomes que ele exporta, para conferir os imports dos módulos seguintes


def modulo(nome):
    s = io.open(os.path.join(RAIZ, "src", nome + ".js"), encoding="utf-8").read()

    def importar(m):
        # todo nome importado tem de existir no módulo de origem; sem esta conferência, um nome perdido vira "undefined" em silêncio
        nomes = [x.strip().split(" as ")[0] for x in m.group(1).split(",") if x.strip()]
        faltam = [x for x in nomes if x not in EXPORTADOS.get(m.group(2), [])]
        assert not faltam, "%s importa de %s nomes que o empacotador não achou: %s (use um 'export const' por linha)" % (nome, m.group(2), ", ".join(faltam))
        return "const {%s} = __%s;" % (m.group(1), m.group(2))
    s = RE_IMPORT.sub(importar, s)
    exportados = RE_EXPORT.findall(s)
    EXPORTADOS[nome] = exportados
    s = RE_EXPORT.sub("", s)
    assert "import " not in re.sub(r"//.*", "", s) and not re.search(r"^export\b", s, re.M), "sobrou import ou export em " + nome
    corpo = "\n".join(("  " + l if l else l) for l in s.rstrip().split("\n"))
    return "const __%s = (() => {\n%s\n  return { %s };\n})();\n" % (nome, corpo, ", ".join(exportados))


CABECALHO = '''// @ts-nocheck
// ARQUIVO GERADO por ferramentas/empacotar_funcao.py. Não editar à mão: mudar os módulos de src/ e gerar de novo.
//
// Trem Soccer · função do servidor que calcula as partidas cujo horário já chegou.
// Roda dentro do Supabase, com acesso total ao banco, e traz embutido o mesmo motor das páginas.
// Pode ser chamada por qualquer um e quantas vezes for: ela só calcula partida vencida e ainda não calculada,
// e reserva cada partida antes de calcular, então duas chamadas ao mesmo tempo não duplicam nada.
//
// Como publicar: painel do Supabase → Edge Functions → Deploy a new function → Via Editor → nome "rodada" →
// colar este arquivo inteiro → Deploy. Depois, nas configurações da função, desligar "Verify JWT".
import { createClient } from "npm:@supabase/supabase-js@2";

// >>> motor embutido
'''

RODAPE = r'''// <<< motor embutido
const { calcularPartida, aplicarSituacao, proximaFaseDosPlayoffs, DIAS_PARA_BOT, CLASSIFICADOS_DO_PLAYOFF, vencedorDoGrupo, classificacaoFinal, meritoDaSerieC, tecnicosDoAno, tecnicoGeral } = __rodada;
const { treinar, CONFIG_TREINO, qualidadeDoTreino, aprenderPosicao, ctDoClube, fatorDaTemporada } = __treino;
const { saudeDoClube } = __saude;
const { timeDaBase, CONFIG_LIGA_DE_BASE } = __ligabase;
const { negociosEntreBots, comprasDeListados, livresParaOsBots } = __mercadobots;

// Mercado entre bots (66_multa_e_bots.sql): uma vez por janela, monta os negócios entre clubes sem dono e manda gravar.
async function mercadoDosBots(sb, ligaId, janela) {
  if (!janela) return;
  const { data: liga } = await sb.from("ligas").select("id, temporada, pausada, bots_mercado").eq("id", ligaId).maybeSingle();
  if (!liga || liga.pausada || liga.bots_mercado === liga.temporada + ":" + janela) return;
  const { clubes, elencos } = await botsDaLiga(sb, ligaId);
  const negocios = negociosEntreBots(__rng.criarRng(Math.floor(Math.random() * 2147483647)), { clubes, elencos });
  await sb.rpc("transferir_entre_bots", { p_liga: ligaId, p_lista: negocios.map(n => ({ jogador: n.jogador, para: n.para, valor: n.valor, salario: n.salario })) });
}

// jogador do banco no formato que o mercado dos bots usa
const jogadorDoMercado = l => ({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at,
  forma: l.forma, moral: l.moral, exp: l.exp == null ? null : +l.exp, pe: l.pe || null, salario: l.salario, juvenil: !!l.juvenil, aposentaEm: l.aposenta_em == null ? null : l.aposenta_em });

const PAIS_DO_GRUPO = { ARG: "Argentina", URU: "Uruguai", COL: "Colômbia", CHI: "Chile" }; // o mesmo de src/banco.js
// clubes sem dono da liga, com caixa e teto, e os elencos deles
// inativos: inclui os clubes de dirigente sem acesso há DIAS_PARA_BOT dias (menos o clube extra), que também jogam com a tática de bot
// clube guardado (grupo "X", desde a T14) fica fora do mercado: não compra, não vende, não contrata
async function botsDaLiga(sb, ligaId, inativos = false) {
  const limite = Date.now() - DIAS_PARA_BOT * 86400000;
  const cs = inativos
    ? ((await sb.from("clubes").select("id, divisao, grupo, dono, extra, ultimo_acesso").eq("liga_id", ligaId).neq("grupo", "X")).data || [])
        .filter(c => !c.dono || (!c.extra && (!c.ultimo_acesso || new Date(c.ultimo_acesso).getTime() < limite)))
    : (await sb.from("clubes").select("id, divisao, grupo").eq("liga_id", ligaId).is("dono", null).neq("grupo", "X")).data || [];
  const tetos = Object.fromEntries(((await sb.from("divisoes").select("divisao, teto_folha").eq("liga_id", ligaId)).data || []).map(d => [d.divisao, d.teto_folha]));
  const caixas = Object.fromEntries(((await sb.from("financas").select("clube_id, caixa").in("clube_id", cs.map(c => c.id))).data || []).map(f => [f.clube_id, f.caixa]));
  const elencos = {};
  for (let i = 0; i < cs.length; i += 20) {
    const linhas = (await sb.from("jogadores").select("*").in("clube_id", cs.slice(i, i + 20).map(c => c.id)).order("id")).data || [];
    for (const l of linhas) if (!l.emprestado_de) (elencos[l.clube_id] = elencos[l.clube_id] || []).push(jogadorDoMercado(l)); // emprestado não é do bot: fora do mercado
  }
  return { clubes: cs.map(c => ({ id: c.id, divisao: c.divisao, pais: PAIS_DO_GRUPO[c.grupo] || "Brasil", caixa: caixas[c.id] || 0, teto: PAIS_DO_GRUPO[c.grupo] ? 20000 : tetos[c.divisao] || tetos[2] || 14000 })), elencos };
}

// Bots compram da lista de transferência dos dirigentes (72_bots_compram_listados.sql): o banco entrega a fila (quem já esperou o prazo sem
// proposta de dirigente), cada listado é olhado uma vez por janela e o negócio é fechado pelo preço pedido. Sem efeito antes do SQL 72.
async function botsCompramListados(sb, ligaId, janela) {
  if (!janela) return;
  const { data: fila, error } = await sb.rpc("listados_para_os_bots", { p_liga: ligaId });
  if (error || !fila || !fila.length) return;
  const { data: liga } = await sb.from("ligas").select("temporada").eq("id", ligaId).maybeSingle();
  if (!janela || !liga) return;
  const { clubes, elencos } = await botsDaLiga(sb, ligaId);
  const jaCompraram = ((await sb.from("transferencias").select("para_clube").eq("liga_id", ligaId).eq("temporada", liga.temporada).eq("janela", janela).eq("tipo", "negociada")
    .in("para_clube", clubes.map(c => c.id))).data || []).map(t => t.para_clube);
  const compras = comprasDeListados({ clubes, elencos, listados: fila.map(l => ({ j: jogadorDoMercado(l), preco: l.preco_pedido })), jaCompraram });
  for (const c of compras) await sb.rpc("bot_compra_listado", { p_jogador: c.jogador, p_para: c.para, p_valor: c.valor, p_salario: c.salario }); // o que esbarra numa regra é pulado
  await sb.from("jogadores").update({ bots_viram: liga.temporada + ":" + janela }).in("id", fila.map(l => l.id));
}

// Bots (e clubes de dirigente inativo) tapam buracos no banco com jogadores livres (113_bots_contratam_livres.sql): o banco entrega a fila (livres sem leilão há 48 h),
// cada livre é olhado uma vez por janela e quem contrata (conferindo tudo de novo) é bot_contrata_livre. Sem efeito antes do SQL 113.
async function botsContratamLivres(sb, ligaId, janela) {
  if (!janela) return;
  const { data: fila, error } = await sb.rpc("livres_para_os_bots", { p_liga: ligaId });
  if (error || !fila || !fila.length) return;
  const { data: liga } = await sb.from("ligas").select("temporada").eq("id", ligaId).maybeSingle();
  if (!janela || !liga) return;
  const { clubes, elencos } = await botsDaLiga(sb, ligaId, true); // só contratar: o clube inativo de dirigente entra aqui, não nas vendas
  const jaContrataram = ((await sb.from("transferencias").select("para_clube").eq("liga_id", ligaId).eq("temporada", liga.temporada).eq("janela", janela).eq("tipo", "livre")
    .in("para_clube", clubes.map(c => c.id))).data || []).map(t => t.para_clube);
  const contratos = livresParaOsBots({ clubes, elencos, livres: fila.map(l => ({ j: jogadorDoMercado(l), salario: l.salario_mercado || 0 })), jaContrataram });
  for (const c of contratos) await sb.rpc("bot_contrata_livre", { p_jogador: c.jogador, p_para: c.para, p_salario: c.salario }); // o que esbarra numa regra é pulado
  await sb.from("jogadores").update({ bots_viram: liga.temporada + ":" + janela }).in("id", fila.map(l => l.id));
}

// Playoffs de acesso da Série B: quando a liga de um grupo (ou uma fase do playoff dele) termina, a fase seguinte é criada sozinha, nas datas
// reservadas pelo calendário (ligas.copa.playoffs, uma por etapa); sem elas, um intervalo depois do último jogo do grupo.
async function avancarPlayoffs(sb) {
  for (const liga of (await sb.from("ligas").select("id, pausada, minutos_transmissao, copa")).data || []) {
    if (liga.pausada || (liga.copa || {}).sem_playoffs) continue; // sem_playoffs: temporada sem playoffs (a virada zera ligas.copa)
    const todas = (await sb.from("partidas").select("id, grupo, rodada, fase, casa, fora, inicio, processada").eq("liga_id", liga.id).in("fase", ["liga", "pre", "semi", "final"]).order("id").limit(2000)).data || [];
    const clubes = (await sb.from("clubes").select("id, nome, grupo, divisao").eq("liga_id", liga.id)).data || [];
    // só os grupos com playoff que têm tudo calculado e ainda não chegaram à final: o resto da liga não precisa ser lido
    const comPlayoff = new Set(clubes.filter(c => c.divisao > 1).map(c => c.grupo));
    const prontos = new Set([...comPlayoff].filter(g => { const l = todas.filter(p => p.grupo === g); return l.length && l.every(p => p.processada) && !l.some(p => p.fase === "final"); }));
    if (!prontos.size) continue;
    const partidas = todas.filter(p => prontos.has(p.grupo)), resultados = [], agora = new Date().toISOString(), ids = partidas.map(p => p.id);
    for (let i = 0; i < ids.length; i += 200) resultados.push(...((await sb.from("resultados").select("partida_id, gols_casa, gols_fora").in("partida_id", ids.slice(i, i + 200)).lte("libera_em", agora)).data || []));
    const r = proximaFaseDosPlayoffs({ clubes: clubes.filter(c => prontos.has(c.grupo)), partidas, resultados });
    if (r.erro || !r.jogos.length) continue;
    // sem data reservada: um intervalo do calendário (o que separa as duas primeiras rodadas) depois do último jogo do grupo, por etapa
    const hora = p => new Date(p.inicio).getTime(), daLiga = todas.filter(p => p.fase === "liga"), reservadas = (liga.copa || {}).playoffs || [];
    const r1 = Math.min(...daLiga.filter(p => p.rodada === 1).map(hora)), r2 = Math.min(...daLiga.filter(p => p.rodada === 2).map(hora));
    const intervalo = isFinite(r2 - r1) && r2 > r1 ? r2 - r1 : 86400000;
    const inicio = j => { if (reservadas[j.etapa]) return Math.max(new Date(reservadas[j.etapa].inicio).getTime(), Date.now() + 60000);
      const doGrupo = partidas.filter(p => p.grupo === j.grupo), primeira = Math.min(...r.jogos.filter(x => x.grupo === j.grupo).map(x => x.etapa));
      return Math.max(Math.max(...doGrupo.map(hora)) + intervalo, Date.now() + 60000) + (j.etapa - primeira) * intervalo; };
    // um insert por grupo: com o índice único (63/69, e o 114 com a preliminar), a criação em dobro de duas chamadas juntas é barrada sem travar os outros grupos
    for (const g of new Set(r.jogos.map(j => j.grupo)))
      await sb.from("partidas").insert(r.jogos.filter(j => j.grupo === g).map(j => { const ini = inicio(j);
        return { liga_id: liga.id, grupo: j.grupo, rodada: j.rodada, fase: j.fase, copa_fase: null, casa: j.casa, fora: j.fora, inicio: new Date(ini).toISOString(), fim: new Date(ini + (liga.minutos_transmissao || 0) * 60000).toISOString() }; }));
  }
}

// Fechamento da temporada (145_fechamento_da_temporada.sql): uma hora depois do fim do último jogo, com todos os playoffs jogados, a tabela final
// vai para o histórico (a lista de campeões) e os prêmios são pagos: o da liga, os do fundo, seleção, técnico do ano e bônus de patrocínio.
// A virada, depois, só completa quem sobe e quem cai (e cobra o imposto). Sem o 145, a leitura de temporada_fechada falha e nada acontece.
const ESPERA_DO_FECHAMENTO = 3600000;
async function fecharTemporadas(sb) {
  for (const liga of (await sb.from("ligas").select("id, temporada, temporada_fechada, pausada, copa")).data || []) {
    if (liga.pausada || liga.temporada_fechada === liga.temporada) continue;
    const ultima = (await sb.from("partidas").select("fim").eq("liga_id", liga.id).order("fim", { ascending: false, nullsFirst: false }).limit(1)).data || [];
    if (!ultima.length || Date.now() - new Date(ultima[0].fim).getTime() < ESPERA_DO_FECHAMENTO) continue;
    const { count, error } = await sb.from("partidas").select("id", { count: "exact", head: true }).eq("liga_id", liga.id).eq("processada", false);
    if (error || count) continue;
    const partidas = [];
    for (let de = 0; ; de += 1000) { // em páginas: o banco devolve no máximo mil linhas por consulta
      const l = (await sb.from("partidas").select("id, grupo, rodada, fase, casa, fora").eq("liga_id", liga.id).or("fase.is.null,fase.in.(liga,pre,semi,final)").order("id").range(de, de + 999)).data || [];
      partidas.push(...l); if (l.length < 1000) break;
    }
    const clubes = (await sb.from("clubes").select("id, nome, grupo, divisao, dono").eq("liga_id", liga.id)).data || [];
    // playoff de acesso: sem a final criada em todo grupo que disputa, a temporada ainda não acabou (avancarPlayoffs cria a fase seguinte)
    const semPlayoffs = !!(liga.copa || {}).sem_playoffs;
    const comPlayoff = [...new Set(clubes.filter(c => c.divisao > 1).map(c => c.grupo))].filter(g => clubes.filter(c => c.grupo === g).length >= CLASSIFICADOS_DO_PLAYOFF && partidas.some(p => p.grupo === g));
    if (!semPlayoffs && comPlayoff.some(g => !partidas.some(p => p.grupo === g && p.fase === "final"))) continue;
    const resultados = [], ids = partidas.map(p => p.id), agora = new Date().toISOString();
    for (let i = 0; i < ids.length; i += 200) resultados.push(...((await sb.from("resultados").select("partida_id, gols_casa, gols_fora").in("partida_id", ids.slice(i, i + 200)).lte("libera_em", agora)).data || []));
    const elencos = {};
    for (let i = 0; i < clubes.length; i += 10) for (const j of (await sb.from("jogadores").select("clube_id, at, pos").in("clube_id", clubes.slice(i, i + 10).map(c => c.id))).data || []) (elencos[j.clube_id] = elencos[j.clube_id] || []).push(j);
    const linhas = classificacaoFinal(clubes, partidas, resultados);
    // técnico do ano geral (só dirigentes): também a copa e os continentais, que a classificação não lê
    const copas = [];
    for (let de = 0; ; de += 1000) {
      const l = (await sb.from("partidas").select("id, grupo, rodada, fase, copa_fase, casa, fora, vencedor").eq("liga_id", liga.id).in("fase", ["copa", "lib"]).order("id").range(de, de + 999)).data || [];
      copas.push(...l); if (l.length < 1000) break;
    }
    const geral = tecnicoGeral({ linhas, partidas: [...partidas, ...copas], resultados, elencos, donos: new Set(clubes.filter(c => c.dono).map(c => c.id)) });
    await sb.rpc("fechar_temporada", { p_liga: liga.id, p_temporada: liga.temporada, p_classificacao: linhas, p_merito: meritoDaSerieC(linhas), p_tecnicos: [...tecnicosDoAno(linhas, elencos), ...(geral ? [geral] : [])] });
  }
}

// Liga de base (61_liga_de_base.sql): joga as partidas cuja hora chegou. Ficam o placar, os gols, as notas e o relatório completo (136); o juvenil que jogou ganha um bônus de treino.
async function jogarBase(sb) {
  const r = await sb.from("base_jogos").select("*").eq("processada", false).lte("inicio", new Date().toISOString()).order("inicio").order("id").limit(25);
  if (r.error || !r.data || !r.data.length) return 0;
  const jogos = r.data, ids = [...new Set(jogos.flatMap(p => [p.casa, p.fora]))];
  const clubes = Object.fromEntries(((await sb.from("clubes").select("id, nome, perfil, dono, base_nivel, ct_nivel, pais").in("id", ids)).data || []).map(c => [c.id, c]));
  // jogam a base: os juvenis e, nos clubes com dirigente, o profissional formado no clube de até 21 anos que não esteja lesionado
  const juvenis = {}, profs = {};
  for (const l of (await sb.from("jogadores").select("*").in("clube_id", ids).lte("idade", CONFIG_LIGA_DE_BASE.idadeMaxima).order("id")).data || [])
    if (l.juvenil || ((clubes[l.clube_id] || {}).dono && l.formador === l.clube_id && !(l.fora_jogos > 0 && l.fora_motivo === "lesão")))
    ((l.juvenil ? juvenis : profs)[l.clube_id] = (l.juvenil ? juvenis : profs)[l.clube_id] || []).push({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, pe: l.pe || null, treino: l.treino || null, pts: l.treino_pts || null, aprende: l.aprende || null, exp: l.exp == null ? null : +l.exp });
  const todos = [...Object.values(juvenis).flat(), ...Object.values(profs).flat()].map(j => +String(j.id).slice(1)), talentos = {};
  if (todos.length) for (const t of (await sb.from("jogadores_ocultos").select("jogador_id, tal").in("jogador_id", todos)).data || []) talentos["j" + t.jogador_id] = t.tal;
  const comissoes = {};
  for (const x of (await sb.from("treinadores").select("*").eq("contratado", true).in("clube_id", ids)).data || []) if ((x.funcao || "treinador") === "treinador") (comissoes[x.clube_id] = comissoes[x.clube_id] || []).push(x);
  // tática da base (100_tatica_da_base.sql): o esquema do time principal e o que o dirigente fixou; sem a tabela, a leitura falha e tudo segue automático
  const donos = ids.filter(id => (clubes[id] || {}).dono), formacoes = {}, taticasDaBase = {};
  if (donos.length) {
    for (const t of (await sb.from("taticas").select("clube_id, dados").in("clube_id", donos)).data || []) formacoes[t.clube_id] = t.dados && t.dados.vagas;
    for (const t of (await sb.from("taticas_base").select("clube_id, dados").in("clube_id", donos)).data || []) taticasDaBase[t.clube_id] = t.dados;
  }
  // rodízio: minutos que cada um já jogou na base nesta temporada
  const minutosNaBase = {}, chave = (liga, t) => liga + ":" + t;
  for (const k of new Set(jogos.map(p => chave(p.liga_id, p.temporada)))) {
    const [liga, t] = k.split(":").map(Number), m = minutosNaBase[k] = {};
    for (const q of (await sb.from("base_jogos").select("jogadores:dados->jogadores").eq("liga_id", liga).eq("temporada", t).eq("processada", true).not("gols_casa", "is", null)).data || [])
      for (const x of q.jogadores || []) if (String(x.id).startsWith("j")) m[x.id] = (m[x.id] || 0) + (x.min || 0);
  }
  let n = 0;
  for (const p of jogos) {
    const reserva = await sb.from("base_jogos").update({ processada: true }).eq("id", p.id).eq("processada", false).select("id");
    if (reserva.error || !reserva.data.length) continue;
    try {
      const semente = Math.floor(Math.random() * 2147483647), rng = __rng.criarRng(semente);
      const jaJogou = minutosNaBase[chave(p.liga_id, p.temporada)];
      const lado = id => { const c = clubes[id] || {};
        const t = timeDaBase(rng, { juvenis: juvenis[id] || [], profissionais: profs[id] || [], nivel: c.dono ? (c.base_nivel || 0) : p.fase === "libjuv" && c.pais && c.pais !== "Brasil" ? CONFIG_LIGA_DE_BASE.nivelDeFora : CONFIG_LIGA_DE_BASE.nivelDoBot, prefixo: id, minutos: jaJogou, perfil: c.perfil, formacao: formacoes[id], tatica: taticasDaBase[id] });
        return { clube: { id, nome: c.nome || "", dono: null, perfil: c.perfil }, elenco: [...t.escalacao.map(x => x.j), ...t.banco], tatica: null, pronta: t }; };
      const { resultado, minutos, lances } = calcularPartida({ partida: { id: p.id, inicio: p.inicio, fase: "base", casa: p.casa, fora: p.fora }, casa: lado(p.casa), fora: lado(p.fora), semente });
      const dados = { jogadores: resultado.relatorio.jogadores.filter(x => x.minutos > 0).map(x => ({ id: x.id, n: x.nome, t: x.time, p: x.pos, g: x.gols || 0, a: x.assistencias || 0, nota: x.nota, min: x.minutos })) };
      // relatório curto: as estatísticas principais de cada lado e as frases do analista (sem os lances, para não pesar no banco)
      const R = resultado.relatorio;
      dados.est = R.estat.map(e => ({ po: e.posse, f: e.finalizacoes, ng: e.noGol, xg: Math.round(e.xg * 100) / 100, es: e.escanteios, fa: e.faltas, am: e.amarelos, vm: e.vermelhos }));
      dados.an = R.analise;
      // Copinha (70_copinha.sql) e Libertadores Juvenil (101): mata-mata; empate vai direto aos pênaltis
      const extra = {};
      if (p.fase === "copinha" || p.fase === "libjuv") {
        extra.vencedor = resultado.gols_casa > resultado.gols_fora ? p.casa : resultado.gols_fora > resultado.gols_casa ? p.fora : null;
        if (!extra.vencedor) { const pen = [0, 0];
          for (let k = 0; k < 5; k++) { if (rng.chance(0.76)) pen[0]++; if (rng.chance(0.76)) pen[1]++; }
          while (pen[0] === pen[1]) { if (rng.chance(0.76)) pen[0]++; if (rng.chance(0.76)) pen[1]++; }
          dados.penaltis = pen; extra.vencedor = pen[0] > pen[1] ? p.casa : p.fora; }
      }
      // relatório completo com a narração (136_relatorio_da_base.sql): coluna à parte, lida só quando alguém abre a partida; sem a coluna, grava o curto
      const relatorio = { ...R, narracao: lances.map(l => l.dados), ...(dados.penaltis ? { penaltis: dados.penaltis } : {}) };
      let g = await sb.from("base_jogos").update({ gols_casa: resultado.gols_casa, gols_fora: resultado.gols_fora, dados, relatorio, ...extra }).eq("id", p.id);
      if (g.error && /relatorio/.test(g.error.message)) g = await sb.from("base_jogos").update({ gols_casa: resultado.gols_casa, gols_fora: resultado.gols_fora, dados, ...extra }).eq("id", p.id);
      if (g.error) throw new Error(g.error.message);
      const treinos = [];
      for (const id of [p.casa, p.fora]) {
        const c = clubes[id] || {}, areas = qualidadeDoTreino(comissoes[id] || [], 0, !c.dono);
        for (const j of [...(juvenis[id] || []), ...(profs[id] || [])]) {
          if ((minutos[j.id] || 0) < CONFIG_LIGA_DE_BASE.minutos) continue;
          const t = treinar(j, { tal: talentos[j.id], ct: c.ct_nivel || 0, areas, fator: CONFIG_LIGA_DE_BASE.bonusDeTreino });
          const jogouEm = (resultado.relatorio.jogadores.find(x => x.id === j.id) || {}).pos;
          const a = c.dono && j.aprende && jogouEm === j.aprende.pos ? aprenderPosicao(j, { soBonus: true }) : null; // jogar na posição em estudo acelera, como na liga
          if (t || a) { treinos.push({ id: +String(j.id).slice(1), at: t ? t.at : j.at, pts: t ? t.pts : (j.pts || j.at.map(() => 0)), ...(a ? { fam: a.fam, aprende: a.aprende } : {}) });
            if (t) { j.at = t.at; j.pts = t.pts; } if (a) { j.fam = a.fam; j.aprende = a.aprende; } }
        }
      }
      if (treinos.length) await sb.rpc("aplicar_treino", { p_lista: treinos });
      for (const [id, m] of Object.entries(minutos)) if (id.startsWith("j")) jaJogou[id] = (jaJogou[id] || 0) + m;
      n++;
    } catch (e) { await sb.from("base_jogos").update({ processada: false }).eq("id", p.id); }
  }
  // Copinha: com a fase toda jogada, o banco sorteia a seguinte (ou paga o campeão)
  for (const liga of new Set(jogos.filter(p => p.fase === "copinha").map(p => p.liga_id))) await sb.rpc("copinha_avancar", { p_liga: liga });
  for (const liga of new Set(jogos.filter(p => p.fase === "libjuv").map(p => p.liga_id))) await sb.rpc("libertadores_juvenil_avancar", { p_liga: liga });
  return n;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAXIMO_POR_CHAMADA = 40;

// Quem pode disparar a função. Sem o segredo SEGREDO_DO_CRON cadastrado no Supabase, qualquer chamada vale.
// Com ele cadastrado, só vale a chamada que traz o segredo (o agendamento) ou a de um administrador logado.
async function autorizado(req, sb) {
  const segredo = Deno.env.get("SEGREDO_DO_CRON");
  if (!segredo) return true;
  if (req.headers.get("x-segredo") === segredo) return true;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await sb.auth.getUser(token);
  if (!data || !data.user) return false;
  const { data: admin } = await sb.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return !!admin;
}

// Grava nos jogadores o que a partida mudou: situação (lesão, suspensão, amarelos), forma e moral, e treino.
async function gravarEfeitos(sb, e, partida = null) {
  if (e && e.caixa && partida) { await sb.rpc("lancar_rodada", { p_partida: partida }); await sb.rpc("lancar_treinadores", { p_partida: partida }); }
  // situação em lote numa chamada só (67_cron_enxuto.sql); sem a função, um jogador por vez, como antes
  const situacao = (e && e.situacao) || [];
  if (situacao.length && (await sb.rpc("aplicar_situacao", { p_lista: situacao })).error)
    for (const m of situacao) await sb.from("jogadores").update({ fora_jogos: m.fora, fora_motivo: m.motivo, amarelos: m.amarelos }).eq("id", m.id);
  if (e && e.momento && e.momento.length) await sb.rpc("aplicar_momento", { p_lista: e.momento });
  if (e && e.treinos && e.treinos.length) await sb.rpc("aplicar_treino", { p_lista: e.treinos });
  if (e && e.copa && e.copa.length) await sb.rpc("aplicar_copa", { p_lista: e.copa });
  if (e && e.lib && e.lib.length) await sb.rpc("aplicar_lib", { p_lista: e.lib }); // sem efeito antes do 141_cartoes_continentais.sql
  if (e && e.vencedor && partida) await sb.from("partidas").update({ vencedor: e.vencedor }).eq("id", partida);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return json({ erro: "Função sem acesso ao banco: faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." }, 500);
    const sb = createClient(url, chave, { auth: { persistSession: false } });
    if (!(await autorizado(req, sb))) return json({ erro: "Não autorizado." }, 401);
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    // Leilões, aposentadorias, sorteio da copa e obras dos bots rodam no próprio banco, todo minuto, em tarefas_do_minuto()
    // (67_cron_enxuto.sql): repetir aqui só gastava log de API.
    // Lesões, suspensões, amarelos, forma, moral e treino de cada partida só são gravados no apito final (33_efeitos_no_apito_final.sql):
    // ficam guardados no resultado até lá, para a página do clube não entregar o que ainda está passando na transmissão.
    const adiar = true; // o SQL 33 já rodou: a coluna efeitos existe
    {
      const vencidos = (await sb.from("resultados").select("partida_id, efeitos").not("efeitos", "is", null).lte("libera_em", new Date().toISOString()).order("libera_em").limit(200)).data || [];
      for (const r of vencidos) { await gravarEfeitos(sb, r.efeitos, r.partida_id); await sb.from("resultados").update({ efeitos: null }).eq("partida_id", r.partida_id); }
    }

    // bots: uma vez por janela, negócios entre clubes sem dono, compra de listados e contratação de livres (sem efeito antes do 66_multa_e_bots.sql);
    // fora da janela de mercado nenhum dos três faz nada, então nem pergunta
    try {
      for (const l of (await sb.from("ligas").select("id")).data || []) {
        const { data: janela } = await sb.rpc("janela_do_mercado", { p_liga: l.id });
        if (!janela) continue;
        await mercadoDosBots(sb, l.id, janela); await botsCompramListados(sb, l.id, janela); await botsContratamLivres(sb, l.id, janela);
      }
    } catch (e) { /* segue */ }
    try { await avancarPlayoffs(sb); } catch (e) { /* segue */ }
    try { await fecharTemporadas(sb); } catch (e) { /* segue */ }
    try { await jogarBase(sb); } catch (e) { /* liga de base: sem efeito antes do 61_liga_de_base.sql */ }
    // reserva órfã: a chamada morreu (tempo limite) entre reservar e gravar o resultado, e a partida ficou "processada" sem resultado.
    // 10 min depois do início ela volta para a fila. Só falharia com fila atrasada em mais de 10 min e duas chamadas ao mesmo tempo.
    try {
      const presas = ok(await sb.from("partidas").select("id").eq("processada", true)
        .lte("inicio", new Date(Date.now() - 600000).toISOString()).gte("inicio", new Date(Date.now() - 86400000).toISOString()).limit(500)).map(p => p.id);
      const comResultado = new Set(presas.length ? ok(await sb.from("resultados").select("partida_id").in("partida_id", presas)).map(r => r.partida_id) : []);
      for (const id of presas.filter(id => !comResultado.has(id))) {
        await sb.from("lances").delete().eq("partida_id", id);
        await sb.from("partidas").update({ processada: false }).eq("id", id);
      }
    } catch (e) { /* segue */ }
    const pendentes = ok(await sb.from("partidas").select("*").eq("processada", false).lte("inicio", new Date().toISOString())
      .order("inicio").order("id").limit(MAXIMO_POR_CHAMADA));
    if (!pendentes.length) return json({ calculadas: 0, erros: [] });
    const todasAsLigas = Object.fromEntries(ok(await sb.from("ligas").select("*")).map(l => [l.id, l]));
    const jogaveis = pendentes.filter(p => !todasAsLigas[p.liga_id].pausada); // liga pausada não tem partida calculada
    if (!jogaveis.length) return json({ calculadas: 0, erros: [], pausada: true });
    pendentes.length = 0; pendentes.push(...jogaveis);

    const ids = [...new Set(pendentes.flatMap(p => [p.casa, p.fora]))];
    const ligas = Object.fromEntries(ok(await sb.from("ligas").select("*").in("id", [...new Set(pendentes.map(p => p.liga_id))])).map(l => [l.id, l]));
    const clubes = Object.fromEntries(ok(await sb.from("clubes").select("*").in("id", ids)).map(c => [c.id, c]));
    const taticas = Object.fromEntries(ok(await sb.from("taticas").select("clube_id, dados").in("clube_id", ids)).map(t => [t.clube_id, t.dados]));
    const elencos = {}, rodadasDoGrupo = {};
    for (let i = 0; i < ids.length; i += 20) { // em blocos, para não passar do limite de linhas por consulta
      const linhas = ok(await sb.from("jogadores").select("*").in("clube_id", ids.slice(i, i + 20)).order("id"));
      for (const l of linhas) (elencos[l.clube_id] = elencos[l.clube_id] || []).push({ id: "j" + l.id, nome: l.nome, numero: l.numero || null, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal, fora: l.fora_jogos || 0, motivo: l.fora_motivo || null, amarelos: l.amarelos || 0, entrosar: l.entrosar || 0, treino: l.treino || null, pts: l.treino_pts || null, aprende: l.aprende || null, juvenil: !!l.juvenil, forma: l.forma == null ? null : l.forma, moral: l.moral == null ? null : l.moral, exp: l.exp == null ? null : +l.exp, pe: l.pe || null, amarelosCopa: l.amarelos_copa || 0, foraCopa: l.fora_copa || 0, copaClube: l.copa_clube == null ? null : l.copa_clube, amarelosLib: l.amarelos_lib || 0, foraLib: l.fora_lib || 0 });
    }
    // treinadores contratados de cada clube (sem a tabela, antes do 28_treinadores.sql, o treino segue sem eles)
    // "comissoes" guarda só os treinadores; médico e preparador de prevenção (29_saude.sql) vão para "saude"
    let comissoes = null; const saude = {};
    try { const t = await sb.from("treinadores").select("*").eq("contratado", true).in("clube_id", ids); if (!t.error) { comissoes = {}; for (const x of t.data) { const alvo = (x.funcao || "treinador") === "treinador" ? comissoes : saude; (alvo[x.clube_id] = alvo[x.clube_id] || []).push(x); } } } catch (e) { /* segue sem treinadores */ }
    // talento oculto de cada jogador: define o teto do treino
    const talentos = {};
    const todos = Object.values(elencos).flat().map(j => +String(j.id).slice(1));
    for (let i = 0; i < todos.length; i += 300) for (const t of ok(await sb.from("jogadores_ocultos").select("jogador_id, tal").in("jogador_id", todos.slice(i, i + 300)))) talentos["j" + t.jogador_id] = t.tal;

    let calculadas = 0;
    const erros = [];
    for (const p of pendentes) {
      // reserva a partida; se outra chamada já pegou, pula
      const reserva = ok(await sb.from("partidas").update({ processada: true }).eq("id", p.id).eq("processada", false).select("id"));
      if (!reserva.length) continue;
      try {
        // juvenil (60_juvenis_e_formador.sql) não joga partida oficial: fica fora da escalação, da forma e da moral, mas treina mais abaixo
        const lado = id => ({ clube: clubes[id], elenco: (elencos[id] || []).filter(j => !j.juvenil), tatica: taticas[id] || null, saude: saudeDoClube(saude[id], clubes[id]) });
        const { lances, resultado, situacao, minutos, posicoes, momento, copa, lib, vencedor, ordens } = calcularPartida({
          partida: p, casa: lado(p.casa), fora: lado(p.fora),
          minutosTransmissao: ligas[p.liga_id].minutos_transmissao, semente: Math.floor(Math.random() * 2147483647),
        });
        ok(await sb.from("lances").insert(lances));
        ok(await sb.from("resultados").insert(resultado));
        if (ordens && ordens.length) await sb.from("ordens_partida").upsert(ordens); // sem o 90_ordens_privadas.sql só falha em silêncio
        // lesões, suspensões e amarelos para os próximos jogos
        const efeitos = { situacao: situacao.map(m => ({ id: +String(m.id).slice(1), fora: m.fora, motivo: m.motivo, amarelos: m.amarelos })), momento: [], treinos: [] };
        // copa: cartões e suspensões próprios, a trava de clube e quem passou de fase (só aparecem no apito final)
        if (copa) {
          efeitos.copa = copa.map(m => ({ id: +String(m.id).slice(1), amarelos: m.amarelos, fora: m.fora, clube: m.clube })); efeitos.vencedor = vencedor;
          const novoC = Object.fromEntries(copa.map(m => [m.id, m]));
          for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (novoC[j.id]) { j.amarelosCopa = novoC[j.id].amarelos; j.foraCopa = novoC[j.id].fora; j.copaClube = novoC[j.id].clube; }
        }
        // Libertadores e Sul-Americana: cartões e suspensões continentais
        if (lib && lib.length) {
          efeitos.lib = lib.map(m => ({ id: +String(m.id).slice(1), amarelos: m.amarelos, fora: m.fora }));
          const novoL = Object.fromEntries(lib.map(m => [m.id, m]));
          for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (novoL[j.id]) { j.amarelosLib = novoL[j.id].amarelos; j.foraLib = novoL[j.id].fora; }
        }
        aplicarSituacao(elencos[p.casa] || [], situacao); aplicarSituacao(elencos[p.fora] || [], situacao);
        // recém-chegados: um jogo a menos para entrosar (sem efeito antes do 86_entrosamento.sql)
        await sb.rpc("entrosar_partida", { p_partida: p.id });
        for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (j.entrosar > 0) j.entrosar--;
        // forma e moral depois do jogo (sem efeito antes do 30_forma_e_moral.sql)
        if (momento.length) {
          efeitos.momento = momento.map(m => ({ id: +String(m.id).slice(1), forma: m.forma, moral: m.moral, exp: m.exp }));
          const novo = Object.fromEntries(momento.map(m => [m.id, m]));
          for (const lado of [p.casa, p.fora]) for (const j of elencos[lado] || []) if (novo[j.id]) { j.forma = novo[j.id].forma; j.moral = novo[j.id].moral; j.exp = novo[j.id].exp; }
        }
        // caixa da rodada (TV, patrocínio, salários, bilheteria, obras, humor da torcida): com o 34_caixa_no_apito_final.sql, só o público
        // é sorteado agora (ele aparece na abertura da transmissão) e o resto fica para o apito final, junto dos outros efeitos
        let caixaAdiado = false;
        if (adiar) caixaAdiado = !(await sb.rpc("definir_publico", { p_partida: p.id })).error;
        if (!caixaAdiado) await sb.rpc("lancar_rodada", { p_partida: p.id });
        efeitos.caixa = caixaAdiado;
        // sessão de treino dos dois elencos, só em partida de liga; lesionado não treina (sem efeito antes do 27_treino.sql)
        if (!p.fase || p.fase === "liga") {
          const treinos = [], chaveG = p.liga_id + ":" + p.grupo;
          // a sessão vale 22 / rodadas do grupo (2 × (clubes − 1)): A, B e países somam o mesmo na temporada
          if (!rodadasDoGrupo[chaveG]) { const { count } = await sb.from("clubes").select("id", { count: "exact", head: true }).eq("liga_id", p.liga_id).eq("grupo", p.grupo); rodadasDoGrupo[chaveG] = 2 * ((count || 0) - 1); }
          const fatorDoGrupo = fatorDaTemporada(rodadasDoGrupo[chaveG]);
          for (const lado of [p.casa, p.fora]) { const areas = qualidadeDoTreino(comissoes ? comissoes[lado] || [] : null, (elencos[lado] || []).filter(j => j.idade > CONFIG_TREINO.idadeSemContar).length, !(clubes[lado] || {}).dono); for (const j of elencos[lado] || []) {
            if (j.fora > 0 && j.motivo === "lesão") continue;
            const jogou = (minutos[j.id] || 0) >= CONFIG_TREINO.minutosParaBonus;
            const r = treinar(j, { tal: talentos[j.id], ct: ctDoClube(clubes[lado]), jogou, areas, fator: fatorDoGrupo });
            // posição nova (59_posicao_nova_e_safra.sql): só em clube com dirigente; jogar na posição acelera
            const a = (clubes[lado] || {}).dono && j.aprende ? aprenderPosicao(j, { jogouNa: jogou && posicoes && posicoes[j.id] === j.aprende.pos }) : null;
            if (r || a) { treinos.push({ id: +String(j.id).slice(1), at: r ? r.at : j.at, pts: r ? r.pts : (j.pts || j.at.map(() => 0)), ...(a ? { fam: a.fam, aprende: a.aprende } : {}) });
              if (r) { j.at = r.at; j.pts = r.pts; } if (a) { j.fam = a.fam; j.aprende = a.aprende; } }
          } }
          efeitos.treinos = treinos;
          if (!caixaAdiado) await sb.rpc("lancar_treinadores", { p_partida: p.id }); // salário dos treinadores; sem efeito antes do 28_treinadores.sql
        }
        // os efeitos ficam guardados até o apito final; sem a coluna (antes do SQL 33), são gravados na hora, como antes
        if (adiar) ok(await sb.from("resultados").update({ efeitos }).eq("partida_id", p.id)); else await gravarEfeitos(sb, efeitos);
        calculadas++;
      } catch (e) { // desfaz a reserva, para a partida ser calculada na próxima chamada
        await sb.from("lances").delete().eq("partida_id", p.id);
        await sb.from("resultados").delete().eq("partida_id", p.id);
        await sb.from("partidas").update({ processada: false }).eq("id", p.id);
        erros.push(`partida ${p.id}: ${e.message}`);
      }
    }
    return json({ calculadas, erros });
  } catch (e) {
    return json({ erro: e.message }, 500);
  }
});
'''

saida = CABECALHO + "\n".join(modulo(m) for m in MODULOS) + RODAPE
destino = os.path.join(RAIZ, "supabase", "functions", "rodada", "index.ts")
io.open(destino, "w", encoding="utf-8", newline="\n").write(saida)
print("gerado:", destino, "-", len(saida) // 1024, "KB,", saida.count("\n"), "linhas")


# ---------- função "mercado": compra pela multa rescisória, com reposição nos clubes sem dono ----------
MODULOS_MERCADO = ["rng", "modelo", "gerador", "economia", "base"]
CABECALHO_MERCADO = """// @ts-nocheck
// ARQUIVO GERADO por ferramentas/empacotar_funcao.py. Não editar à mão: mudar os módulos de src/ e gerar de novo.
//
// Trem Soccer · função do servidor do mercado. Recebe o pedido de compra pela multa rescisória de um dirigente logado,
// gera o jogador de reposição quando o vendedor é um clube sem dono e manda o banco fazer a transferência
// (as regras e os limites são conferidos lá, em comprar_pela_multa, do 19_mercado.sql).
//
// Como publicar: painel do Supabase → Edge Functions → Deploy a new function → Via Editor → nome "mercado" →
// colar este arquivo inteiro → Deploy. Depois, nas configurações da função, desligar "Verify JWT".
import { createClient } from "npm:@supabase/supabase-js@2";

// >>> módulos embutidos
"""
RODAPE_MERCADO = r"""// <<< módulos embutidos
const { criarRng } = __rng, { notaBruta, paisDoGrupo } = __modelo, { gerarJogador, semAcento } = __gerador, { contratoInicial, salarioDeMercado } = __economia, { jovensDaBase } = __base;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
const NOMES = "https://doc2342.github.io/Trem-Soccer/dados/nomes.json";
let nomes = null; // base de nomes, buscada uma vez e guardada enquanto a função fica no ar

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return json({ erro: "Função sem acesso ao banco: faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." }, 500);
    const sb = createClient(url, chave, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem } = token ? await sb.auth.getUser(token) : { data: null };
    if (!quem || !quem.user) return json({ erro: "É preciso entrar na conta." });
    const pedido = await req.json().catch(() => ({}));
    // peneira da base: os jovens são gerados aqui, conforme o nível da base do clube, e gravados pelo banco (35_base_e_dispensa.sql)
    if (pedido.acao === "peneira") {
      const { data: ativo } = await sb.rpc("meu_clube_de", { p_user: quem.user.id }); // o clube ativo (100_clube_ativo_no_servidor.sql): com dois clubes, a busca por dono traria os dois
      const { data: meu } = ativo ? await sb.from("clubes").select("id, perfil, liga_id, base_nivel").eq("id", ativo).maybeSingle() : { data: null };
      if (!meu) return json({ erro: "Você não tem clube." });
      const { data: lg } = await sb.from("ligas").select("temporada").eq("id", meu.liga_id).maybeSingle();
      if (!nomes) nomes = await (await fetch(NOMES)).json();
      const { data: premio } = await sb.rpc("premio_da_diretoria", { p_clube: meu.id, p_temporada: lg ? lg.temporada : 0 }); // 153: com 95+, um garoto a mais (antes do 153, nada)
      const jovens = jovensDaBase(criarRng(Math.floor(Math.random() * 2147483647)), { nivel: meu.base_nivel || 0, momento: "peneira", perfil: meu.perfil, nomes, temporada: lg ? lg.temporada : 0, extra: (premio || 0) >= 95 ? 1 : 0,
        usa: ((((await sb.from("taticas").select("dados").eq("clube_id", meu.id).maybeSingle()).data || {}).dados || {}).vagas || []),
        jaTem: ((await sb.from("jogadores").select("*").eq("clube_id", meu.id).lte("idade", 21)).data || []).filter(j => !j.escolinha).map(j => j.pos), // o da escolinha (155) não conta
        usados: new Set(((await sb.from("jogadores").select("nome").eq("clube_id", meu.id)).data || []).map(j => semAcento(j.nome))), // camisa sem repetir no elenco
        juvenis: !(await sb.from("jogadores").select("juvenil").limit(1)).error }); // juvenis sem contrato só depois do 60_juvenis_e_formador.sql
      const r = await sb.rpc("receber_jovens", { p_user: quem.user.id, p_lista: jovens });
      if (r.error) return json({ erro: r.error.message });
      return json({ ok: true, mensagem: r.data });
    }
    const idJogador = +String(pedido.jogador || "").replace(/^j/, "");
    if (!idJogador) return json({ erro: "Jogador não informado." });
    // juvenil assina o primeiro contrato: o salário de mercado sai dos atributos de hoje (60_juvenis_e_formador.sql)
    if (pedido.acao === "profissionalizar") {
      const { data: jv } = await sb.from("jogadores").select("id, idade, pos, fam, at, juvenil").eq("id", idJogador).maybeSingle();
      if (!jv || !jv.juvenil) return json({ erro: "Esse jogador não é juvenil." });
      const r = await sb.rpc("profissionalizar_jogador", { p_user: quem.user.id, p_jogador: idJogador, p_mercado: salarioDeMercado(jv), p_temporadas: Math.round(+pedido.temporadas) || 1 });
      if (r.error) return json({ erro: r.error.message });
      return json({ ok: true, mensagem: r.data });
    }

    const { data: j } = await sb.from("jogadores").select("*").eq("id", idJogador).maybeSingle();
    if (!j) return json({ erro: "Jogador não encontrado." });
    const { data: clube } = await sb.from("clubes").select("id, dono, perfil, liga_id, grupo").eq("id", j.clube_id).maybeSingle();
    let reposicao = null;
    if (clube && !clube.dono) { // clube sem dono: entra no lugar um jogador gerado da mesma nota, para o clube não enfraquecer
      const { data: liga } = await sb.from("ligas").select("temporada").eq("id", clube.liga_id).maybeSingle();
      if (!nomes) nomes = await (await fetch(NOMES)).json();
      const rng = criarRng(Math.floor(Math.random() * 2147483647));
      const novo = gerarJogador(rng, { id: null, pos: j.pos, alvo: notaBruta(j.at, j.pos), idade: rng.int(20, 28), pais: paisDoGrupo(clube.grupo), perfil: clube.perfil, nomes,
        usados: new Set(((await sb.from("jogadores").select("nome").eq("clube_id", clube.id)).data || []).map(x => semAcento(x.nome))) }); // da nacionalidade do clube: não ocupa vaga de estrangeiro
      const c = contratoInicial(rng, novo, liga ? liga.temporada : 0);
      reposicao = { nome: novo.nome, nome_completo: novo.nome_completo, pais: novo.pais, idade: novo.idade, pos: novo.pos, fam: novo.fam, at: novo.at, tal: novo.tal,
        salario: c.salario, salario_mercado: c.mercado, contrato_ate: c.contrato_ate, protegido_ate: c.protegido_ate };
    }
    const { data, error } = await sb.rpc("comprar_pela_multa", { p_user: quem.user.id, p_jogador: idJogador,
      p_salario: Math.round(+pedido.salario), p_temporadas: Math.round(+pedido.temporadas), p_reposicao: reposicao, p_mercado: salarioDeMercado(j) }); // valor de hoje: a multa e o salário mínimo partem dele (66_multa_e_bots.sql)
    if (error) return json({ erro: error.message });
    return json({ ok: true, mensagem: data });
  } catch (e) {
    return json({ erro: e.message }, 500);
  }
});
"""
saida = CABECALHO_MERCADO + "\n".join(modulo(m) for m in MODULOS_MERCADO) + RODAPE_MERCADO
destino = os.path.join(RAIZ, "supabase", "functions", "mercado", "index.ts")
os.makedirs(os.path.dirname(destino), exist_ok=True)
io.open(destino, "w", encoding="utf-8", newline="\n").write(saida)
print("gerado:", destino, "-", len(saida) // 1024, "KB,", saida.count("\n"), "linhas")
