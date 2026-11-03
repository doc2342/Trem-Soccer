// Saúde do motor: um relatório só, gerado do código, da auditoria, dos logs do hook e do git. Não mede nada novo (sim_cruzada e sim_grade medem).
// Uso: node ferramentas/relatorio_motor.mjs [arquivo da tabela do sim_cruzada]   Escreve docs/superpowers/specs/2026-11-02-saude-do-motor.md
// Classes de cada atributo: 1 não lido; 2 lido, sem efeito demonstrado; 3 efeito em cenário controlado; 4 efeito estatístico; 5 validado na integração
import fs from "node:fs";
import { execSync } from "node:child_process";
import { ATRIBUTOS } from "../src/modelo.js";

const raiz = new URL("../", import.meta.url), ler = f => fs.readFileSync(new URL(f, raiz), "utf8");
const fontes = ["src/motor.js", "src/grade.js"].map(f => [f, ler(f).split("\n")]);
const leituras = k => fontes.flatMap(([f, l]) => l.flatMap((t, i) => new RegExp(`\\b(A|IDX)\\.${k}\\b`).test(t) ? [`${f.replace("src/", "")}:${i + 1}`] : []));

// atributos com teste de sensibilidade no teste_mecanicas, régua de 300 jogos e hook aprovado
const VALIDADOS = {
  plo: "lançamento: parcela pelo alto cai com o Passe longo", agr: "duelo apertado, pressão e falta", vel: "pressão", res: "pressão", equ: "pressão",
  mov: "entrelinhas: acerto sobe com a Movimentação", com: "basculação por faixa, troca de corredor, buraco", for: "goleiro no contato; duelo aéreo",
};
// a auditoria de 02/11 (antes das 6 mecânicas): maior efeito de +18 no atributo, em gols, em qualquer linha
const auditoria = (() => { const m = {}, t = ler("docs/superpowers/specs/2026-11-02-auditoria-atributos.md"), g = t.slice(t.indexOf("## Gols"), t.indexOf("## xG"));
  for (const l of g.split("\n")) { const c = l.split("|").map(x => x.trim()); if (c.length > 6 && ATRIBUTOS.some(a => a.k === c[1])) m[c[1]] = Math.max(0, ...c.slice(2, 7).flatMap(x => [...x.matchAll(/[+-]\d?\.\d+/g)].map(v => Math.abs(+v[0])))); }
  return m; })();
const classe = a => { const n = leituras(a.k).length;
  if (!n) return [1, "—"];
  if (VALIDADOS[a.k]) return [5, VALIDADOS[a.k]];
  if ((auditoria[a.k] || 0) >= 0.03) return [4, `auditoria de 02/11, até ${auditoria[a.k].toFixed(3)} gols; não revalidado depois das mecânicas`];
  return [2, `auditoria de 02/11, até ${(auditoria[a.k] || 0).toFixed(3)} gols`]; };

const MATRIZ = [
  ["Lançamento", "duelo aéreo, segunda bola, reposição", "mecanicas 1; cruzada"], ["Agressividade", "duelo, falta, cartão, pressão, terceiro homem", "mecanicas 2; cruzada"],
  ["Pressão", "foto do lance, escolha do passo, Decisões", "mecanicas 3; cruzada"], ["Entrelinhas", "passe no espaço, escolha do passo, Movimentação", "mecanicas 4; cruzada"],
  ["Comunicação", "basculação, virada, buraco, chance", "mecanicas 5; teste_grade; cruzada"], ["Força do goleiro", "cruzamento, segunda bola, rebote, escanteio", "mecanicas 6; rebote_gol_contra; cruzada"],
  ["Volume de cruzamentos", "escolha do passo, condução, Drible, Cruzamento", "mecanicas 7"],
  ["Movimentação", "passe no espaço, contra-ataque, terceiro homem", "mecanicas 8"],
  ["Zagueiro de lado no trio", "manchas da grade, duelo do lado", "mecanicas 9"],
  ["Cruzamento por poste", "cruzamento, cutback, marcação do lateral e do meio", "mecanicas 10"],
];
const REGISTROS = [
  "Pressão 2 reduz as faltas do time que pressiona (17,2 para 13,3 por jogo): contraintuitivo, sem defeito comprovado; olhar no ajuste fino.",
  "Cruzamento na classe 2 é do 4-2-3-1 da auditoria: nas formações com pontas ou meias de lado ele vale (+0,057 e +0,082 gols); o volume de cruzamentos é da etapa Atacantes.",
  "Comunicação não soma ao Posicionamento no xG sofrido (Posicionamento 45: 1,641; os dois: 1,648).",
  "Comunicação no buraco tem efeito pequeno: buraco de 1,26 para 1,12, cruzamentos de 378 para 374.",
  "Cobertura pela qualidade de quem cobre não chega ao jogo: o empréstimo é limitado pela falta da zona (Comunicação retirada desse caminho).",
  "Bola no chão: o lateral às vezes lança para a própria faixa 3 (5,6% dos lançamentos rasteiros); narrado como \"segue com a bola\".",
  "4-4-2 espelho: 3,26 gols, 2,77 sem entrelinhas, 1,85 no 4-2-3-1: causa não achada; investigação posterior, sem calibrar agora.",
  "A falha do commit da mecânica 3 não voltou e seu log se perdeu: a causa não foi confirmada. A trava de custo em blocos dava falso alarme sob carga, e foi corrigida.",
];

const logs = fs.existsSync(new URL("logs-testes/", raiz)) ? fs.readdirSync(new URL("logs-testes/", raiz)).sort().map(f => JSON.parse(ler("logs-testes/" + f))) : [];
const commits = execSync('git log --format="%h %s" --grep="Revisão de mecânicas"').toString().trim().split("\n").reverse().map(l => l.slice(0, 96));
const tab = ATRIBUTOS.map(a => { const [c, e] = classe(a), l = leituras(a.k); return { a, c, e, l }; });
const cont = n => tab.filter(t => t.c === n).length;
const texto = `# Saúde do motor

Gerado por \`ferramentas/relatorio_motor.mjs\`. Não editar à mão.

**Atributos:** ${cont(1)} não lidos · ${cont(2)} sem efeito demonstrado · ${cont(3) + cont(4)} com efeito não revalidado · ${cont(5)} validados na integração.

## Mecânicas

| Mecânica | Dependências diretas | Regressão |
|---|---|---|
${MATRIZ.map(l => `| ${l.join(" | ")} |`).join("\n")}

## Commits

${commits.map(c => `- ${c}`).join("\n")}

## Atributos

| Atributo | Classe | Evidência | Lido em |
|---|---|---|---|
${tab.map(({ a, c, e, l }) => `| ${a.nome} | ${c} | ${e} | ${l.slice(0, 5).join(", ")}${l.length > 5 ? ` e mais ${l.length - 5}` : ""} |`).join("\n")}

## Validação cruzada

${process.argv[2] ? fs.readFileSync(process.argv[2], "utf8").trim() : "Rodar sim_cruzada e passar a tabela."}

## Histórico do hook

| Rodada | HEAD | Aprovados | Reprovados |
|---|---|---|---|
${logs.map(l => `| ${l.id.slice(0, 16)} | ${l.commit} | ${l.aprovados}/${l.total} | ${l.reprovados.map(r => `${r.f} (${r.tipo})`).join(", ") || "—"} |`).join("\n") || "| — | — | — | — |"}

## Regressões e pontos em aberto

${REGISTROS.map(r => `- ${r}`).join("\n")}
`;
fs.writeFileSync(new URL("docs/superpowers/specs/2026-11-02-saude-do-motor.md", raiz), texto);
console.log(`classes 1 a 5: ${[1, 2, 3, 4, 5].map(cont).join(" ")}`);
