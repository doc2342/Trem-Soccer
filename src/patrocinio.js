import { criarRng } from "./rng.js";
// Marcas de patrocínio (decidido em 17/10/2026): só cosméticas. As "grandes" patrocinam apenas a Série A.
export const MARCAS = {
  grupo_trem: { nome: "Grupo Trem", grande: true, bordao: "Tudo parado, só o Trem anda." },
  dobet: { nome: "DObet", grande: true, bordao: "Aposte no seu faro." },
  central_do_dobr: { nome: "Central do DO-BR", grande: true, bordao: "A casa de quem vive de Dugout." },
  central_do_mercado: { nome: "Central do Mercado", bordao: "Quem compra primeiro, ri por último." },
  gazeta_dugoutense: { nome: "Gazeta Dugoutense", bordao: "A notícia chega antes da bola." },
  podcast_10min: { nome: "Podcast 10 min de Dugout Online", bordao: "Dez minutos, zero enrolação." },
  dugout_dos_crias: { nome: "Dugout dos Crias", bordao: "Da base para o mundo." },
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
