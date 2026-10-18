// Simula o banco para testar a página da Base em jogo.html sem conta: cole no console (ou rode pela ferramenta do navegador) com a página aberta.
// Clube 5 com 14 jovens, um jogo da liga de base com relatório e um da Copinha. O que for salvo em taticas_base fica em window.__tb.
(async () => {
  const { gerarElenco } = await import("./src/gerador.js"); const { criarRng } = await import("./src/rng.js");
  const nomes = await (await fetch("./dados/nomes.json")).json();
  const el = gerarElenco(criarRng(7), { nivel: 20, nomes, prefixoId: "" }).slice(0, 14).map((j, i) => ({ ...j, id: 100 + i, clube_id: 5, juvenil: i < 10, idade: i < 10 ? 17 : 20, formador: 5, salario: i < 10 ? null : 10 }));
  const est = [{ po: 51, f: 12, ng: 3, xg: 2.12, es: 2, fa: 5, am: 2, vm: 0 }, { po: 49, f: 10, ng: 1, xg: 1.05, es: 3, fa: 4, am: 0, vm: 1 }], an = [["O placar reflete o jogo."], ["Faltou pontaria."]];
  const jog = el.slice(0, 11).map((j, i) => ({ id: "j" + j.id, n: j.nome, t: 0, p: j.pos, g: i === 9 ? 2 : 0, a: 0, nota: 6.5, min: 90 }));
  const ini = new Date(Date.now() - 86400000).toISOString(), dep = new Date(Date.now() + 86400000).toISOString();
  const M = { ligas: [{ id: 1, temporada: 13, nome: "Liga", rodadas_por_temporada: 18 }],
    clubes: [{ id: 5, nome: "Trem Fantasma", grupo: "A", divisao: 1, dono: "u1", base_nivel: 3, ct_nivel: 2, pais: "Brasil" }, { id: 6, nome: "Candal FC", grupo: "A", divisao: 1, pais: "Brasil" }],
    jogadores: el, taticas: [{ clube_id: 5, dados: { vagas: ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "MC", "ML", "FC", "SC"], jog: [] } }], taticas_base: window.__tb ? [window.__tb] : [],
    base_jogos: [{ id: 1, liga_id: 1, temporada: 13, grupo: "A", rodada: 1, casa: 5, fora: 6, inicio: ini, processada: true, gols_casa: 2, gols_fora: 0, dados: { jogadores: jog, est, an } },
      { id: 2, liga_id: 1, temporada: 13, grupo: "A", rodada: 2, casa: 6, fora: 5, inicio: dep, processada: false },
      { id: 3, liga_id: 1, temporada: 13, fase: "copinha", copinha_fase: 2, casa: 5, fora: 6, inicio: ini, processada: true, gols_casa: 1, gols_fora: 1, vencedor: 5, dados: { jogadores: jog, est, an, penaltis: [4, 3] } }] };
  window.__fetch0 = window.__fetch0 || window.fetch;
  window.fetch = async (u, o = {}) => { const url = String(u.url || u);
    if (!url.includes("supabase.co")) return window.__fetch0(u, o);
    const obj = (new Headers(o.headers || {}).get("Accept") || "").includes("pgrst.object");
    const m = url.match(/\/(rest\/v1\/rpc|rest\/v1)\/([^?]+)/), tab = m ? m[2] : "";
    const resp = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
    if (m && m[1].endsWith("rpc")) return tab === "meu_clube" ? resp(5) : resp({ code: "PGRST202", message: "could not find the function" }, 404);
    if ((o.method || "GET") !== "GET") { if (tab === "taticas_base") { const b = JSON.parse(o.body); window.__tb = { ...b, atualizada_em: new Date().toISOString() }; M.taticas_base = [window.__tb]; } return resp([], 201); }
    let l = M[tab] || []; if (tab === "clubes" && /id=eq\.5/.test(url)) l = l.filter(c => c.id === 5);
    if (tab === "taticas" && obj) l = l.filter(t => t.clube_id === 5);
    if (obj) return l.length ? resp(l[0]) : resp({ code: "PGRST116", message: "0 rows" }, 406);
    return resp(l); };
  await window.__teste.carregar({ user: { id: "u1", email: "teste@x" } });
})();
