// Gera supabase/106_teto_acima_da_nota.sql com a nota de teto (melhor posição natural) de cada jogador da liga, lida agora.
// Uso: node ferramentas/sql_teto_acima_da_nota.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { notaDeTeto } from "../src/modelo.js";
const banco = readFileSync(new URL("../src/banco.js", import.meta.url), "utf8");
const url = banco.match(/https:\/\/[a-z]+\.supabase\.co/)[0], key = banco.match(/sb_publishable_[\w-]+/)[0];
const todos = [];
for (let de = 0; ; de += 1000) {
  const r = await fetch(`${url}/rest/v1/jogadores?select=id,pos,fam,at&order=id&offset=${de}&limit=1000`, { headers: { apikey: key } }).then(r => r.json());
  todos.push(...r); if (r.length < 1000) break;
}
const linhas = todos.filter(j => notaDeTeto(j) > 25).map(j => `(${j.id}, ${notaDeTeto(j).toFixed(2)})`);
writeFileSync(new URL("../supabase/106_teto_acima_da_nota.sql", import.meta.url), `-- Trem Soccer · conserta jogadores que nasceram acima do próprio teto.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Não exige republicar função.
-- Pode ser executado mais de uma vez. O resultado lista quem foi corrigido.
--
-- O jovem que repõe um aposentado em clube sem dirigente chegava com a nota do aposentado (menos até 5) e um talento sorteado à parte:
-- nascia, por exemplo, com nota 43 e teto 31 (src/virada.js corrigido). Aqui, quem está mais de 2 pontos acima do teto (2 é a folga máxima
-- que o treino permite) ganha o talento que põe o teto na nota de hoje. Os relatórios pagos desses jogadores são refeitos com o talento novo.
-- As notas foram lidas em ${new Date().toISOString().slice(0, 10)} por ferramentas/sql_teto_acima_da_nota.mjs (nota da melhor posição natural).

drop table if exists _acima;
create temp table _acima as
  with nota(jogador_id, nota) as (values
${linhas.join(",\n")}
  )
  select o.jogador_id, j.nome, n.nota, o.tal as tal_antigo, round(23 + 0.20 * coalesce(o.tal, 50), 1) as teto_antigo,
         least(100, ceil((n.nota - 23) / 0.20))::int as tal_novo
    from nota n join jogadores_ocultos o on o.jogador_id = n.jogador_id join jogadores j on j.id = n.jogador_id
   where 23 + 0.20 * coalesce(o.tal, 50) + 2 < n.nota;

update jogadores_ocultos o set tal = a.tal_novo from _acima a where o.jogador_id = a.jogador_id;

update relatorios r set minimo = (f.faixa)[1], maximo = (f.faixa)[2]
  from (select r2.clube_id, r2.jogador_id, r2.nivel,
               teto_em_faixa(r2.jogador_id, case r2.nivel when 1 then 16 when 2 then 8 else 4 end, 'r' || r2.nivel) as faixa
          from relatorios r2 join _acima a on a.jogador_id = r2.jogador_id) f
 where r.clube_id = f.clube_id and r.jogador_id = f.jogador_id and r.nivel = f.nivel;

select nome, nota, teto_antigo, tal_antigo, tal_novo, round(23 + 0.20 * tal_novo, 1) as teto_novo from _acima order by nota desc;
`);
console.log(todos.length, "jogadores;", linhas.length, "linhas no SQL");
