// Ligação com o Supabase. A URL e a chave abaixo são públicas por natureza: quem protege os dados são as regras do banco.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://gqsvsvrclyiroehymuot.supabase.co";
export const SUPABASE_CHAVE = "sb_publishable_Tsz8yf6kkgTn5Zj0M0d2Yw_eDoGeFjP";
export const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE);

// Erros do Supabase viram exceção com a mensagem do banco.
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

export const sessao = async () => (await sb.auth.getSession()).data.session;
export const enviarCodigo = email => sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.href.split("#")[0] } }).then(ok);
export const confirmarCodigo = (email, token) => sb.auth.verifyOtp({ email, token, type: "email" }).then(ok);
export const sair = () => sb.auth.signOut();

export const ehAdmin = () => sb.rpc("eh_admin").then(ok);
export const ligaAtual = () => sb.from("ligas").select("*").order("id", { ascending: false }).limit(1).maybeSingle().then(ok);
export const clubesDaLiga = ligaId => sb.from("clubes").select("id, grupo, dono, nome, sigla, escudo, uniforme, perfil").eq("liga_id", ligaId).order("grupo").order("nome").then(ok);
export const meuClube = userId => sb.from("clubes").select("*").eq("dono", userId).maybeSingle().then(ok);
export const assumirClube = (nome, sigla, escudo, uniforme) => sb.rpc("assumir_clube", { p_nome: nome, p_sigla: sigla, p_escudo: escudo, p_uniforme: uniforme }).then(ok);
export const editarVisual = (escudo, uniforme) => sb.rpc("editar_visual", { p_escudo: escudo, p_uniforme: uniforme }).then(ok);
export const registrarAcesso = () => sb.rpc("registrar_acesso").then(ok);

// Jogadores do banco no formato que o motor usa (id em texto, atributos em lista).
export const elencoDoClube = clubeId => sb.from("jogadores").select("*").eq("clube_id", clubeId).order("id").then(ok)
  .then(linhas => linhas.map(l => ({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal })));

// ---------- administração ----------
export const criarLiga = nome => sb.from("ligas").insert({ nome }).select().single().then(ok);
export async function criarClubeComElenco(ligaId, clube, elenco) {
  const c = await sb.from("clubes").insert({ liga_id: ligaId, ...clube }).select("id").single().then(ok);
  const linhas = await sb.from("jogadores").insert(elenco.map(j => ({ clube_id: c.id, nome: j.nome, pais: j.pais, idade: j.idade, pos: j.pos, fam: j.fam, at: j.at, principal: !!j.titular }))).select("id, nome").then(ok);
  const talento = Object.fromEntries(elenco.map(j => [j.nome, j.tal]));
  await sb.from("jogadores_ocultos").insert(linhas.map(l => ({ jogador_id: l.id, tal: talento[l.nome] }))).then(ok);
  return c.id;
}
export const apagarLiga = ligaId => sb.from("ligas").delete().eq("id", ligaId).then(ok);
