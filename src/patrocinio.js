import { criarRng } from "./rng.js";
// Marcas de patrocínio (decidido em 17/10/2026): só cosméticas. As "grandes" patrocinam apenas a Série A.
export const MARCAS = {
  grupo_trem: { nome: "Grupo Trem", grande: true, bordao: "Tudo parado, só o Trem anda." },
  dobet: { nome: "DObet", grande: true, bordao: "Aposte no seu faro." },
  central_do_dobr: { nome: "Central do DO-BR", grande: true, bordao: "A casa de quem vive de Dugout." },
  central_do_mercado: { nome: "Central do Mercado", bordao: "Quem compra primeiro, ri por último." },
  gazeta_dugoutense: { nome: "Gazeta Dugoutense", curto: "Gazeta", bordao: "A notícia chega antes da bola." },
  podcast_10min: { nome: "Podcast 10 min de Dugout Online", curto: "Podcast 10 min", bordao: "Dez minutos, zero enrolação." },
  dugout_dos_crias: { nome: "Dugout dos Crias", curto: "Crias", bordao: "Da base para o mundo." },
  mestres_do_dugout: { nome: "Mestres do Dugout", bordao: "Quem sabe, joga." },
};
export const selo = (marca, px = 40) => MARCAS[marca] ? `<img src="patrocinios/${marca}.png" width="${px}" height="${px}" alt="${MARCAS[marca].nome}" title="${MARCAS[marca].nome}" style="vertical-align:middle;object-fit:contain">` : "";
export const PROPOSTAS = {
  segura: ["Segura", "Quase tudo garantido em luvas. Bônus pequeno por uma meta fácil."],
  mista: ["Mista", "Parte garantida, parte no bônus. Meta no nível do seu time."],
  agressiva: ["Agressiva", "Pouco garantido. Bônus alto se o time superar as expectativas."],
};

// Patrocinadores das placas (decidido em 18/10/2026): só cosméticos, sem dinheiro, sorteados por jogo. Só letreiro até existirem as artes.
// cor = fundo da placa, txt = letra
export const PLACAS = [
  { nome: "Olheiro Express", bordao: "Achou o craque? A gente entrega.", cor: "#f2c14e", txt: "#111111" },
  { nome: "Fisio 24h", bordao: "Lesão de 3 rodadas? Aqui sai em 2.", cor: "#0a7d3b", txt: "#ffffff" },
  { nome: "Bar do Lateral", bordao: "Ninguém passa sem tomar uma.", cor: "#7b1e24", txt: "#ffffff" },
  { nome: "Rádio Escanteio", bordao: "Toda bola parada, ao vivo.", cor: "#1e5bc6", txt: "#ffffff" },
  { nome: "Chuteira Veloz", bordao: "Do banco ao gol em 9 segundos.", cor: "#f26b21", txt: "#111111" },
  { nome: "Pizzaria Pênalti", bordao: "Na marca da cal e no ponto certo.", cor: "#c8102e", txt: "#ffffff" },
  { nome: "Seguros Zagueiro", bordao: "A gente segura até carrinho por trás.", cor: "#0f5c4d", txt: "#f2c14e" },
  { nome: "Barbearia Camisa 10", bordao: "Corte de craque, preço de reserva.", cor: "#111111", txt: "#ffffff" },
];
// placa fixa: convite para a turma criar a própria marca
export const ANUNCIE = { nome: "Anuncie aqui", bordao: "Sua marca no Trem Soccer. Fale com a administração.", cor: "#ffffff", txt: "#111111", convite: true };
// as placas de um jogo (ou de um estádio): a mesma semente dá sempre as mesmas, para todo mundo
export const placasDoJogo = (semente, n = 4) => criarRng((semente | 0) * 7919 + 13).embaralhar(PLACAS).slice(0, n);

// Naming rights (18/10/2026): só cosméticos. Quem administra a liga escolhe a marca de cada competição aqui (null = nome puro).
// Chaves: A, B (B1 a B3), C (C1 e C2), COPA, LIB, SUL.
export const NAMING = { A: "dobet", B: "gazeta_dugoutense", C: "dugout_dos_crias", COPA: "grupo_trem", LIB: "central_do_dobr", SUL: "central_do_mercado" };
const DIVISAO_DO_GRUPO = { A: "A", B: "B", C: "B", F: "B", D: "C", E: "C" };
// "Brasileiro Série B1" → "Brasileiro Gazeta Série B1"; "Copa do Brasil" → "Copa Grupo Trem do Brasil"; "Libertadores" → "Copa Central do DO-BR Libertadores"
export function batizar(g, nome) {
  const m = MARCAS[NAMING[DIVISAO_DO_GRUPO[g] || g]]; if (!m) return nome;
  const n = m.curto || m.nome;
  return DIVISAO_DO_GRUPO[g] ? nome.replace("Brasileiro ", `Brasileiro ${n} `) : g === "COPA" ? `Copa ${n} do Brasil` : `Copa ${n} ${nome}`;
}
// Jogo patrocinado: o jogo de liga da rodada entre os mais bem colocados (menor soma das posições antes da rodada; empate: o de menor id),
// com uma marca sorteada. lista = os jogos de liga daquele grupo e rodada; ordem = ids dos clubes na tabela antes da rodada.
export function jogoPatrocinado(lista, ordem = []) {
  if (!lista.length) return null;
  const pos = id => { const k = ordem.indexOf(id); return k < 0 ? 99 : k; }, ids = lista.map(p => p.id).sort((a, b) => a - b);
  const jogo = lista.slice().sort((a, b) => pos(a.casa) + pos(a.fora) - pos(b.casa) - pos(b.fora) || a.id - b.id)[0];
  const marca = criarRng(ids[0] * 31 + ids.length).pick(Object.keys(MARCAS));
  return { id: jogo.id, marca, nome: `Jogo ${MARCAS[marca].curto || MARCAS[marca].nome} da rodada` };
}
