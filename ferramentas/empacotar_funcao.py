# -*- coding: utf-8 -*-
"""Gera supabase/functions/rodada/index.ts: a função do servidor com o motor embutido.

O Supabase não deixa a função importar código do site do jogo, então os módulos de src/ são copiados para dentro
de um arquivo só. Cada módulo vira um bloco isolado que devolve o que exporta.

Uso: python ferramentas/empacotar_funcao.py   (rodar de novo sempre que o motor mudar, e publicar a função outra vez)
"""
import io, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULOS = ["rng", "modelo", "escalacao", "motor", "bot", "relatorio", "rodada"]  # em ordem de dependência

RE_IMPORT = re.compile(r'^import\s*\{([^}]*)\}\s*from\s*"\./(\w+)\.js";\s*$', re.M | re.S)
RE_EXPORT = re.compile(r'^export\s+(?=(?:async\s+)?(?:const|let|function)\s+(\w+))', re.M)


def modulo(nome):
    s = io.open(os.path.join(RAIZ, "src", nome + ".js"), encoding="utf-8").read()
    s = RE_IMPORT.sub(lambda m: "const {%s} = __%s;" % (m.group(1), m.group(2)), s)
    exportados = RE_EXPORT.findall(s)
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

RODAPE = '''// <<< motor embutido
const { calcularPartida } = __rodada;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAXIMO_POR_CHAMADA = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return json({ erro: "Função sem acesso ao banco: faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." }, 500);
    const sb = createClient(url, chave, { auth: { persistSession: false } });
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

    const pendentes = ok(await sb.from("partidas").select("*").eq("processada", false).lte("inicio", new Date().toISOString())
      .order("inicio").order("id").limit(MAXIMO_POR_CHAMADA));
    if (!pendentes.length) return json({ calculadas: 0, erros: [] });

    const ids = [...new Set(pendentes.flatMap(p => [p.casa, p.fora]))];
    const ligas = Object.fromEntries(ok(await sb.from("ligas").select("id, minutos_transmissao").in("id", [...new Set(pendentes.map(p => p.liga_id))])).map(l => [l.id, l]));
    const clubes = Object.fromEntries(ok(await sb.from("clubes").select("id, nome, dono, ultimo_acesso").in("id", ids)).map(c => [c.id, c]));
    const taticas = Object.fromEntries(ok(await sb.from("taticas").select("clube_id, dados").in("clube_id", ids)).map(t => [t.clube_id, t.dados]));
    const elencos = {};
    for (let i = 0; i < ids.length; i += 20) { // em blocos, para não passar do limite de linhas por consulta
      const linhas = ok(await sb.from("jogadores").select("*").in("clube_id", ids.slice(i, i + 20)).order("id"));
      for (const l of linhas) (elencos[l.clube_id] = elencos[l.clube_id] || []).push({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal });
    }

    let calculadas = 0;
    const erros = [];
    for (const p of pendentes) {
      // reserva a partida; se outra chamada já pegou, pula
      const reserva = ok(await sb.from("partidas").update({ processada: true }).eq("id", p.id).eq("processada", false).select("id"));
      if (!reserva.length) continue;
      try {
        const lado = id => ({ clube: clubes[id], elenco: elencos[id] || [], tatica: taticas[id] || null });
        const { lances, resultado } = calcularPartida({
          partida: p, casa: lado(p.casa), fora: lado(p.fora),
          minutosTransmissao: ligas[p.liga_id].minutos_transmissao, semente: Math.floor(Math.random() * 2147483647),
        });
        ok(await sb.from("lances").insert(lances));
        ok(await sb.from("resultados").insert(resultado));
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
