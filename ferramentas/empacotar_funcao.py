# -*- coding: utf-8 -*-
"""Gera supabase/functions/rodada/index.ts: a função do servidor com o motor embutido.

O Supabase não deixa a função importar código do site do jogo, então os módulos de src/ são copiados para dentro
de um arquivo só. Cada módulo vira um bloco isolado que devolve o que exporta.

Uso: python ferramentas/empacotar_funcao.py   (rodar de novo sempre que o motor mudar, e publicar a função outra vez)
"""
import io, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULOS = ["rng", "modelo", "saude", "escalacao", "motor", "bot", "relatorio", "rodada", "treino"]  # em ordem de dependência

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
const { calcularPartida, aplicarSituacao } = __rodada;
const { treinar, CONFIG_TREINO, qualidadeDoTreino } = __treino;
const { saudeDoClube } = __saude;

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
  for (const m of (e && e.situacao) || []) await sb.from("jogadores").update({ fora_jogos: m.fora, fora_motivo: m.motivo, amarelos: m.amarelos }).eq("id", m.id);
  if (e && e.momento && e.momento.length) await sb.rpc("aplicar_momento", { p_lista: e.momento });
  if (e && e.treinos && e.treinos.length) await sb.rpc("aplicar_treino", { p_lista: e.treinos });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return json({ erro: "Função sem acesso ao banco: faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." }, 500);
    const sb = createClient(url, chave, { auth: { persistSession: false } });
    if (!(await autorizado(req, sb))) return json({ erro: "Não autorizado." }, 401);
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    // leilões de jogadores livres e ofertas à liga que venceram (sem efeito antes do 21_jogadores_livres.sql)
    try { for (const l of (await sb.from("ligas").select("id")).data || []) { await sb.rpc("resolver_leiloes", { p_liga: l.id }); await sb.rpc("anunciar_aposentadorias", { p_liga: l.id }); await sb.rpc("copa_avancar", { p_liga: l.id }); } } catch (e) { /* segue para as partidas */ }
    // Lesões, suspensões, amarelos, forma, moral e treino de cada partida só são gravados no apito final (33_efeitos_no_apito_final.sql):
    // ficam guardados no resultado até lá, para a página do clube não entregar o que ainda está passando na transmissão.
    const adiar = !(await sb.from("resultados").select("efeitos").limit(1)).error;
    if (adiar) {
      const vencidos = (await sb.from("resultados").select("partida_id, efeitos").not("efeitos", "is", null).lte("libera_em", new Date().toISOString()).order("libera_em").limit(200)).data || [];
      for (const r of vencidos) { await gravarEfeitos(sb, r.efeitos, r.partida_id); await sb.from("resultados").update({ efeitos: null }).eq("partida_id", r.partida_id); }
    }

    const pendentes = ok(await sb.from("partidas").select("*").eq("processada", false).lte("inicio", new Date().toISOString())
      .order("inicio").order("id").limit(MAXIMO_POR_CHAMADA));
    if (!pendentes.length) return json({ calculadas: 0, erros: [] });
    const todasAsLigas = Object.fromEntries(ok(await sb.from("ligas").select("*")).map(l => [l.id, l]));
    const jogaveis = pendentes.filter(p => !todasAsLigas[p.liga_id].pausada); // liga pausada não tem partida calculada
    if (!jogaveis.length) return json({ calculadas: 0, erros: [], pausada: true });
    pendentes.length = 0; pendentes.push(...jogaveis);

    const ids = [...new Set(pendentes.flatMap(p => [p.casa, p.fora]))];
    const ligas = Object.fromEntries(ok(await sb.from("ligas").select("*").in("id", [...new Set(pendentes.map(p => p.liga_id))])).map(l => [l.id, l]));
    const clubes = Object.fromEntries(ok(await sb.from("clubes").select("id, nome, dono, perfil, ultimo_acesso, ct_nivel, medico_nivel, fisio_nivel").in("id", ids)).map(c => [c.id, c]));
    const taticas = Object.fromEntries(ok(await sb.from("taticas").select("clube_id, dados").in("clube_id", ids)).map(t => [t.clube_id, t.dados]));
    const elencos = {};
    for (let i = 0; i < ids.length; i += 20) { // em blocos, para não passar do limite de linhas por consulta
      const linhas = ok(await sb.from("jogadores").select("*").in("clube_id", ids.slice(i, i + 20)).order("id"));
      for (const l of linhas) (elencos[l.clube_id] = elencos[l.clube_id] || []).push({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal, fora: l.fora_jogos || 0, motivo: l.fora_motivo || null, amarelos: l.amarelos || 0, treino: l.treino || null, pts: l.treino_pts || null, forma: l.forma == null ? null : l.forma, moral: l.moral == null ? null : l.moral, exp: l.exp == null ? null : +l.exp, pe: l.pe || null });
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
        const lado = id => ({ clube: clubes[id], elenco: elencos[id] || [], tatica: taticas[id] || null, saude: saudeDoClube(saude[id], clubes[id]) });
        const { lances, resultado, situacao, minutos, momento } = calcularPartida({
          partida: p, casa: lado(p.casa), fora: lado(p.fora),
          minutosTransmissao: ligas[p.liga_id].minutos_transmissao, semente: Math.floor(Math.random() * 2147483647),
        });
        ok(await sb.from("lances").insert(lances));
        ok(await sb.from("resultados").insert(resultado));
        // lesões, suspensões e amarelos para os próximos jogos
        const efeitos = { situacao: situacao.map(m => ({ id: +String(m.id).slice(1), fora: m.fora, motivo: m.motivo, amarelos: m.amarelos })), momento: [], treinos: [] };
        aplicarSituacao(elencos[p.casa] || [], situacao); aplicarSituacao(elencos[p.fora] || [], situacao);
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
          const treinos = [];
          for (const lado of [p.casa, p.fora]) { const areas = qualidadeDoTreino(comissoes ? comissoes[lado] || [] : null, (elencos[lado] || []).filter(j => j.idade > CONFIG_TREINO.idadeSemContar).length, !(clubes[lado] || {}).dono); for (const j of elencos[lado] || []) {
            if (j.fora > 0 && j.motivo === "lesão") continue;
            const r = treinar(j, { tal: talentos[j.id], ct: (clubes[lado] || {}).ct_nivel || 0, jogou: (minutos[j.id] || 0) >= CONFIG_TREINO.minutosParaBonus, areas });
            if (r) { treinos.push({ id: +String(j.id).slice(1), at: r.at, pts: r.pts }); j.at = r.at; j.pts = r.pts; }
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
const { criarRng } = __rng, { notaBruta } = __modelo, { gerarJogador } = __gerador, { contratoInicial } = __economia, { jovensDaBase } = __base;

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
      const { data: meu } = await sb.from("clubes").select("id, perfil, liga_id, base_nivel").eq("dono", quem.user.id).maybeSingle();
      if (!meu) return json({ erro: "Você não tem clube." });
      const { data: lg } = await sb.from("ligas").select("temporada").eq("id", meu.liga_id).maybeSingle();
      if (!nomes) nomes = await (await fetch(NOMES)).json();
      const jovens = jovensDaBase(criarRng(Math.floor(Math.random() * 2147483647)), { nivel: meu.base_nivel || 0, momento: "peneira", perfil: meu.perfil, nomes, temporada: lg ? lg.temporada : 0 });
      const r = await sb.rpc("receber_jovens", { p_user: quem.user.id, p_lista: jovens });
      if (r.error) return json({ erro: r.error.message });
      return json({ ok: true, mensagem: r.data });
    }
    const idJogador = +String(pedido.jogador || "").replace(/^j/, "");
    if (!idJogador) return json({ erro: "Jogador não informado." });

    const { data: j } = await sb.from("jogadores").select("*").eq("id", idJogador).maybeSingle();
    if (!j) return json({ erro: "Jogador não encontrado." });
    const { data: clube } = await sb.from("clubes").select("id, dono, perfil, liga_id").eq("id", j.clube_id).maybeSingle();
    let reposicao = null;
    if (clube && !clube.dono) { // clube sem dono: entra no lugar um jogador gerado da mesma nota, para o clube não enfraquecer
      const { data: liga } = await sb.from("ligas").select("temporada").eq("id", clube.liga_id).maybeSingle();
      if (!nomes) nomes = await (await fetch(NOMES)).json();
      const rng = criarRng(Math.floor(Math.random() * 2147483647));
      const novo = gerarJogador(rng, { id: null, pos: j.pos, alvo: notaBruta(j.at, j.pos), idade: rng.int(20, 28), perfil: clube.perfil, nomes });
      const c = contratoInicial(rng, novo, liga ? liga.temporada : 0);
      reposicao = { nome: novo.nome, pais: novo.pais, idade: novo.idade, pos: novo.pos, fam: novo.fam, at: novo.at, tal: novo.tal,
        salario: c.salario, salario_mercado: c.mercado, contrato_ate: c.contrato_ate, protegido_ate: c.protegido_ate };
    }
    const { data, error } = await sb.rpc("comprar_pela_multa", { p_user: quem.user.id, p_jogador: idJogador,
      p_salario: Math.round(+pedido.salario), p_temporadas: Math.round(+pedido.temporadas), p_reposicao: reposicao });
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
