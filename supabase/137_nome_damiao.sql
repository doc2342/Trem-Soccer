-- O nome "Damião" estava com a codificação quebrada em dados/nomes.json ("DamiÃ§o"); os jogadores já gerados com ele são corrigidos aqui.
update public.jogadores set nome = replace(nome, 'DamiÃ§o', 'Damião') where nome like '%DamiÃ§o%';
