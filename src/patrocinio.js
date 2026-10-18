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
export const PROPOSTAS = { segura: ["Segura", "Mais luvas, meta fácil de cumprir."], mista: ["Mista", "Metade a metade."], agressiva: ["Agressiva", "Poucas luvas, bônus alto por uma meta difícil."] };
