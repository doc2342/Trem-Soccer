// Trem Soccer · função do servidor que calcula as partidas cujo horário já chegou.
// Roda dentro do Supabase, com acesso total ao banco, e usa o mesmo motor das páginas (carregado do site do jogo).
// Pode ser chamada por qualquer um e quantas vezes for: ela só calcula partida vencida e ainda não calculada,
// e reserva cada partida antes de calcular, então duas chamadas ao mesmo tempo não duplicam nada.
//
// Como publicar: painel do Supabase → Edge Functions → Deploy a new function → Via Editor → nome "rodada" →
// colar este arquivo → Deploy. Depois, nas configurações da função, desligar "Verify JWT".
// Quando o motor mudar no site, publicar a função de novo para ela baixar a versão nova.
import { createClient } from "npm:@supabase/supabase-js@2";
import { calcularPartida } from "https://doc2342.github.io/Trem-Soccer/src/rodada.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAXIMO_POR_CHAMADA = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return json({ erro: "Função sem acesso ao banco: faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." }, 500);
    const sb = createClient(url, chave, { auth: { persistSession: false } });
    // deno-lint-ignore no-explicit-any
    const ok = ({ data, error }: any) => { if (error) throw new Error(error.message); return data; };

    const pendentes = ok(await sb.from("partidas").select("*").eq("processada", false).lte("inicio", new Date().toISOString())
      .order("inicio").order("id").limit(MAXIMO_POR_CHAMADA));
    if (!pendentes.length) return json({ calculadas: 0, erros: [] });

    // deno-lint-ignore no-explicit-any
    const ids = [...new Set(pendentes.flatMap((p: any) => [p.casa, p.fora]))] as number[];
    // deno-lint-ignore no-explicit-any
    const ligas = Object.fromEntries(ok(await sb.from("ligas").select("id, minutos_transmissao").in("id", [...new Set(pendentes.map((p: any) => p.liga_id))])).map((l: any) => [l.id, l]));
    // deno-lint-ignore no-explicit-any
    const clubes = Object.fromEntries(ok(await sb.from("clubes").select("id, nome, dono, ultimo_acesso").in("id", ids)).map((c: any) => [c.id, c]));
    // deno-lint-ignore no-explicit-any
    const taticas = Object.fromEntries(ok(await sb.from("taticas").select("clube_id, dados").in("clube_id", ids)).map((t: any) => [t.clube_id, t.dados]));
    // deno-lint-ignore no-explicit-any
    const elencos: Record<number, any[]> = {};
    for (let i = 0; i < ids.length; i += 20) { // em blocos, para não passar do limite de linhas por consulta
      const linhas = ok(await sb.from("jogadores").select("*").in("clube_id", ids.slice(i, i + 20)).order("id"));
      for (const l of linhas) {
        (elencos[l.clube_id] = elencos[l.clube_id] || []).push({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal });
      }
    }

    let calculadas = 0;
    const erros: string[] = [];
    for (const p of pendentes) {
      // reserva a partida; se outra chamada já pegou, pula
      const reserva = ok(await sb.from("partidas").update({ processada: true }).eq("id", p.id).eq("processada", false).select("id"));
      if (!reserva.length) continue;
      try {
        const lado = (id: number) => ({ clube: clubes[id], elenco: elencos[id] || [], tatica: taticas[id] || null });
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
        erros.push(`partida ${p.id}: ${(e as Error).message}`);
      }
    }
    return json({ calculadas, erros });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
