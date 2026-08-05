# v25 — Plano Unificado DRN2: Fases 1-5 (bugs, evolução, DNA por táxon, árvore reversa, geografia)

Implementação completa do `plano-unificado-drn2.md`, nesta ordem. Cada item abaixo referencia o item correspondente do plano.

## Fase 1 — Bugs

- **4.1** Reino `Ba` (Bactéria) adicionado ao schema: esqueleto de genes próprio e minimalista (sem torso/membros/crânio/olhos/asas/cauda), locomoção restrita a natação/fixo, reprodução por fissão binária, dieta restrita a decomposição/quimiossíntese, tegumento fixo em mucosa, defesa só por veneno (toxina), sem sistema nervoso centralizado. Descrição textual e labels de reino atualizados.
- **4.2** Extinção por saturação de linhagens agora é explícita: `node.extinta`, `node.auExtincao`, `node.motivoExtincao` são setados de fato (antes só existia um contador agregado). Evento de log dedicado, badge visual na lista e na árvore, refletido nos exports .txt e em `auFimDeVida`.
- **4.3** Mamíferos com asa agora são travados em asa membranosa (`asaTipo: "mb"`, tipo morcego) — antes podiam sortear asa penada/quitinosa/élitro, incoerente com pelo/couro nu. Regra de correção retroativa para espécimes já existentes/importados.
- **4.4** Plantas/fungos com descrição/imagem de animal — diagnosticado, correção adiada para a Fase 3 (resolvida junto da expansão de DNA por táxon).

## Fase 2 — Regras Evolutivas

- **5.1** Barreira de reino na deriva: só bactéria (`Ba`) pode ressortear `reino` livremente; qualquer outra espécie tem o reino travado pra sempre — só `classe` (filo) continua variando.
- **5.2** Todo primordial nasce bactéria (`reino` fixo em `"Ba"` na criação).
- **5.3** Reinos "Artificial/construto" (Ar) e "Espiritual/etéreo" (Sp) removidos por completo — da tabela, de todos os blocos condicionais do motor, de `tegTipo`/`asaTipo` (valores "Etéreo"/"Etérea"). Import de projetos salvos antes desta fase migra `Ar`/`Sp` automaticamente para `An`, com aviso.
- **5.4** Edição manual de espécie já viva deixou de sobrescrever o nó in-place (alteração de DNA em vida) — agora gera um nó FILHO novo (especiação manual/dirigida), preservando a mãe original intacta.
- **5.5** Migração entre domínios (divisões espaciais dentro de uma massa): cada divisão passa a ter um bioma prevalecente (`massa.divisoesBiomas`), com topologia circular de vizinhança. Ao perder uma colisão de população, metade dos indivíduos afetados migra pra uma divisão vizinha (mantendo a população de origem) em vez de só morrer; evento de log dedicado.

## Fase 3 — Expansão do DNA por Táxon

36 genes novos, aprovados sem alterações, cobrindo MAM, AVE, REP, AMP, PSC, INS, MOL, Pl, Fu e Ba — tabelas em `T`, steps condicionados a classe/reino, registro em `GENE_TABLE_MAP`/`ESCALAR_KEYS`, estrato de mutação (`metamorfoseTipo` do INS em Estrato I por ser central ao plano corporal; resto dos categóricos em Estrato II; escalares em Estrato III), guard de aplicabilidade por táxon na deriva (`GENE_TAXON_APLICAVEL`, mesmo padrão do guard de reino), e frase própria em `describeCreatureProse` (que o prompt de imagem já reaproveita automaticamente).

## Fase 4 — Árvore Reversa, Busca por DNA, DNA nos Logs

- **7.1** DNA visível em todo lugar: log on-screen, card da árvore genealógica, lista de espécies.
- **7.2** Busca por trecho de DNA (substring, case-insensitive) na lista de espécies.
- **7.3** Árvore reversa: busca de trilha de deriva até um DNA-alvo colado (bate 100%, fatiada no tempo), parser leve do código DRN2 focado nos campos que a distância genômica compara, serialização/importação de trilha (copiar da busca, colar na criação de um primordial novo pra reaplicar exatamente os mesmos valores).

## Fase 5 — Geografia/Biomas

- **9.1** Editar era geográfica já adicionada (nome + AU de início).
- **9.2** Excluir massa de terra da era atual, com reatribuição obrigatória de espécies vinculadas antes de remover.
- **9.3** Toggle individual de bioma específico dentro de um domínio (mantém o domínio, desliga só aquele bioma).
- **9.4** Bioma por divisão + configuração manual/aleatória (resolvido junto do pré-requisito da Fase 2, item 5.5).
- **9.5** Domínios climáticos customizados: além dos 5 embutidos, o usuário pode criar novos domínios agrupando um subconjunto dos 27 biomas já existentes sob um nome próprio (aditivo — não altera os domínios/biomas originais). Persistido no export/import do projeto.

## Observação de escopo

O item 9.5 foi implementado como agrupamento de biomas já existentes sob novos nomes de domínio, não como autoria de biomas inteiramente novos com regras de compatibilidade (`exige`/`vantagem`/`letal`) próprias — isso exigiria uma UI de autoria de regras, fora do escopo razoável desta entrega.
