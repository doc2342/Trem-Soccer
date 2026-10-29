// De onde saem os gols: separa os lances de finalização pela origem (bola parada ou jogada). Usado por sim_conversao.mjs e pela leitura da liga.
export function origem(d) {
  if (d.tipo === "escanteio") return "escanteio";
  if (d.tipo === "penalti") return "pênalti";
  if (d.tipo === "falta") return d.assist ? "falta alçada" : "falta direta";
  return /cobra a falta e aciona/.test(d.texto || "") ? "falta curta + jogada" : "jogada";
}
export const ORIGENS = ["jogada", "falta curta + jogada", "escanteio", "falta alçada", "falta direta", "pênalti"];
export function somar(acc, d) {
  if (!d.resultado) return;
  const o = acc[origem(d)] ||= { chutes: 0, gols: 0, xg: 0 };
  o.chutes++; o.xg += d.xg; if (d.resultado === "gol") o.gols++;
}
export function imprimir(acc, jogos, escanteios, faltas) {
  const total = Object.values(acc).reduce((s, o) => s + o.gols, 0);
  console.log(`origem                gols/jogo  % dos gols  chutes/jogo  gols/xG`);
  for (const k of ORIGENS) { const o = acc[k] || { chutes: 0, gols: 0, xg: 0 }; console.log(`${k.padEnd(21)} ${(o.gols / jogos).toFixed(3).padStart(8)}  ${(100 * o.gols / total).toFixed(1).padStart(9)}%  ${(o.chutes / jogos).toFixed(2).padStart(10)}  ${(o.gols / (o.xg || 1)).toFixed(2).padStart(7)}`); }
  const bp = ["escanteio", "falta alçada", "falta direta"].reduce((s, k) => s + (acc[k]?.gols || 0), 0);
  console.log(`bola parada sem pênalti: ${(100 * bp / total).toFixed(1)}% dos gols | com pênalti ${(100 * (bp + (acc["pênalti"]?.gols || 0)) / total).toFixed(1)}% | com a falta curta ${(100 * (bp + (acc["pênalti"]?.gols || 0) + (acc["falta curta + jogada"]?.gols || 0)) / total).toFixed(1)}%`);
  if (escanteios) console.log(`escanteios/jogo ${(escanteios / jogos).toFixed(1)} | 1 gol a cada ${(escanteios / (acc.escanteio?.gols || 1)).toFixed(0)} escanteios | faltas/jogo ${(faltas / jogos).toFixed(1)}`);
}
