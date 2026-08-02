# v20 — Sem teto de ciclos, geração assíncrona com barra de progresso

## O problema

O teto de 150 ciclos (introduzido na v18 só para evitar travar a aba) tinha um
efeito colateral sério: **limitar ciclos limita quantas chances de especiação —
logo, de bifurcação — uma linhagem tem**. Uma árvore gerada com 150 ciclos tem
sensivelmente menos ramificação que uma gerada com 500 ou 1000, porque cada ciclo
extra é mais uma chance da população-mãe sobreviver como linhagem irmã
(`PROB_SOBREVIVENCIA_MAE`). O teto estava, sem intenção, empobrecendo exatamente a
genealogia que a v19 passou a expor.

## A correção

**O teto de ciclos foi removido.** A proteção real contra explosão continua
existindo — `MAX_ESPECIES_POR_DERIVACAO` (3000 espécies por linhagem) no motor —,
mas ela nunca dependeu do número de ciclos em si, só do resultado.

**`derivarLinhagem` passou a ser assíncrona e fatiada no tempo.** O motor cede o
controle ao navegador a cada ~12ms de trabalho contínuo, em vez de rodar do início
ao fim de uma vez. Isso resolve o problema que o teto de ciclos existia para
evitar (a aba travando), sem precisar limitar ciclo nenhum.

**Barra de progresso real** nos dois pontos que rodam deriva:
- **Gerar Ecossistema**: mostra "Primordial X de N…" e uma barra 0-100% combinando
  quantos primordiais já terminaram com o progresso do que está em andamento.
- **Derivar** (uma espécie específica): barra 0-100% do ciclo em curso.

Ambos os modais trocam o formulário pela barra assim que a geração começa, e o
botão de fechar some enquanto o processo roda — não dá para fechar no meio.

## Medido

| Ciclos | Espécies geradas |
|---|---|
| 35 (teto antigo, faixa alta do padrão) | 7 |
| 150 (teto antigo) | 93 |
| 500 | 482 |
| 1000 | 1.115 |

Sem o teto, uma árvore com 1000 ciclos chega a 1.115 espécies — mais de 10x o que o
teto de 150 permitia, com bifurcação real ao longo de toda a simulação.

## O que não muda

Todos os round-trips de seed continuam em 100% de fidelidade depois da mudança —
tornar `derivarLinhagem` assíncrona não alterou a lógica interna de mutação, só
onde ela cede o controle ao navegador.
