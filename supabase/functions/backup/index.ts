// @ts-nocheck
// Trem Soccer · função do servidor que faz o backup do banco.
// Copia todas as tabelas do jogo para um arquivo compactado, guardado numa área privada do próprio Supabase
// (Storage, balde "backups"), e apaga os backups com mais de 14 dias. Um arquivo por dia: rodar de novo no mesmo dia substitui.
//
// Como publicar: painel do Supabase → Edge Functions → Deploy a new function → Via Editor → nome "backup" →
// colar este arquivo inteiro → Deploy. Depois, nas configurações da função, desligar "Verify JWT".
// Para baixar um backup: painel do Supabase → Storage → backups.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

// tabela e coluna usada para ordenar
const TABELAS = [["ligas", "id"], ["clubes", "id"], ["jogadores", "id"], ["jogadores_ocultos", "jogador_id"], ["taticas", "clube_id"], ["escalacoes", "id"],
  ["partidas", "id"], ["lances", "id"], ["resultados", "partida_id"], ["pedidos", "id"], ["admins", "user_id"], ["financas", "clube_id"], ["lancamentos", "id"], ["obras", "id"], ["divisoes", "liga_id"], ["historico", "clube_id"],
  ["transferencias", "id"], ["propostas", "id"], ["ofertas_livres", "id"], ["estado_inicial", "liga_id"]];
const BALDE = "backups", DIAS = 14, PAGINA = 1000;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return json({ erro: "Função sem acesso ao banco: faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." }, 500);
    const sb = createClient(url, chave, { auth: { persistSession: false } });
    if (!(await autorizado(req, sb))) return json({ erro: "Não autorizado." }, 401);

    // O arquivo vai sendo compactado página a página, com o texto cru do banco (sem montar tudo na memória:
    // com as tabelas inteiras e um JSON.stringify só, a função estourava o limite e o Supabase respondia 546).
    const feito_em = new Date().toISOString();
    const gz = new CompressionStream("gzip"), escrita = gz.writable.getWriter(), saida = new Response(gz.readable).arrayBuffer();
    const enc = new TextEncoder(), escreve = t => escrita.write(enc.encode(t));
    let kbSemCompactar = 0;
    const linhas = {}, puladas = [];
    await escreve(`{"feito_em":${JSON.stringify(feito_em)},"tabelas":{`);
    let primeira = true;
    for (const [tabela, ordem] of TABELAS) {
      let n = 0, aberta = false;
      for (let de = 0; ; de += PAGINA) {
        const r = await fetch(`${url}/rest/v1/${tabela}?select=*&order=${ordem}&offset=${de}&limit=${PAGINA}`, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } });
        const texto = await r.text();
        if (!r.ok) { puladas.push(`${tabela}${n ? ` (só ${n} linhas)` : ""}: ${texto.slice(0, 200)}`); break; }
        if (!aberta) { await escreve(`${primeira ? "" : ","}${JSON.stringify(tabela)}:[`); aberta = true; primeira = false; }
        const corpo = texto.trim().slice(1, -1); // tira os colchetes da página
        const faixa = /^(\d+)-(\d+)/.exec(r.headers.get("content-range") || "");
        const lidas = faixa ? +faixa[2] - +faixa[1] + 1 : corpo ? JSON.parse(texto).length : 0;
        if (corpo) { await escreve((n ? "," : "") + corpo); kbSemCompactar += corpo.length / 1024; }
        n += lidas;
        if (lidas < PAGINA) break;
      }
      if (aberta) { await escreve("]"); linhas[tabela] = n; }
    }
    // contas: só o identificador e o e-mail, para religar cada clube ao seu dirigente numa restauração
    const { data: contas } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const usuarios = (contas && contas.users || []).map(u => ({ id: u.id, email: u.email }));
    await escreve(`},"usuarios":${JSON.stringify(usuarios)}}`);
    await escrita.close();
    const compactado = await saida;

    await sb.storage.createBucket(BALDE, { public: false }); // se já existe, o erro é ignorado
    const nome = `backup-${feito_em.slice(0, 10)}.json.gz`;
    const envio = await sb.storage.from(BALDE).upload(nome, compactado, { contentType: "application/gzip", upsert: true });
    if (envio.error) return json({ erro: "Não consegui guardar o backup: " + envio.error.message }, 500);

    // guarda só os mais recentes
    const { data: arquivos } = await sb.storage.from(BALDE).list("", { limit: 1000 });
    const nomes = (arquivos || []).map(a => a.name).filter(n => /^backup-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n)).sort();
    const velhos = nomes.slice(0, Math.max(0, nomes.length - DIAS));
    if (velhos.length) await sb.storage.from(BALDE).remove(velhos);

    return json({ arquivo: nome, kb: Math.round(compactado.byteLength / 1024), kbSemCompactar: Math.round(kbSemCompactar), linhas, usuarios: usuarios.length, guardados: nomes.length - velhos.length, apagados: velhos, puladas });
  } catch (e) {
    return json({ erro: e.message }, 500);
  }
});
