# v31 — dragão ocidental (hexápode)

Pedido único: também o dragão ocidental — quatro pernas **e** duas asas.

## Por que isso é diferente do que a v30 liberou

A v30 deu asa ao réptil, mas manteve a regra da v29: em todo vertebrado
tetrápode, a asa **é** o par de membros superiores modificado — nunca um
quinto e sexto membro. Isso produz o wyvern (2 pernas + 2 asas, 4 membros ao
todo), que é biologicamente correto: nenhum vertebrado real tem seis membros,
porque toda asa de vertebrado (morcego, ave, pterossauro) é braço
reaproveitado.

O dragão ocidental — 4 pernas **funcionais** e um par de asas **separado** —
não existe em nenhum vertebrado real por esse exato motivo. É, de fato, o
argumento biológico clássico contra a existência de dragões "de verdade". Mas
é também o dragão mais reconhecível de todos, e você pediu explicitamente por
ele.

## O que mudou

A asa deixou de consumir o orçamento de pernas/braços **só para a classe
REP** (`CLASSES_ASA_INDEPENDENTE`). Mamífero, ave e anfíbio continuam com a
regra da v29 — asa = braço modificado, teto de 4 membros. Só o réptil ganhou
a exceção: agora os dois planos corporais coexistem dentro da mesma classe,
dependendo de como saem `locPrimario` e `memInf`:

- **Wyvern** — `locPrimario` voo/planeio, pernas reduzidas a 2, asas no lugar
  dos braços. 4 membros ao todo. (era o único disponível desde a v30)
- **Dragão ocidental** — `locPrimario` quadrúpede (ou outro modo terrestre),
  4 pernas inteiras, asas como estrutura adicional. 6 membros ao todo. (novo)

O teto de **1 par de asas continua valendo** para réptil (`asaQtd` restrito a
0/2) — sem isso a tabela permitiria 4, 6 ou 8 asas, e uma hidra alada não foi
pedida.

Qual dos dois planos sai depende do sorteio (a maioria dos répteis voadores
ainda tende a wyvern, porque a tabela de locomoção não foi enviesada para um
lado). Para garantir o dragão ocidental especificamente, force no editor
manual ou na busca dirigida: `locPrimario: Q` (ou outro modo terrestre) +
`asaQtd: 2`.

## Testado

Construí um exemplar dirigido — réptil titânico (24m, ~359 toneladas), 4
pernas, 2 asas membranosas, chifres, cuspe/jato, magia Ápice — confirmando
`MEM:0S.4I` (4 pernas, 0 braços) e `ASA:2.mb` como blocos separados no
código, exatamente como o plano corporal pede.

Suíte O ganhou três checagens novas: dragão ocidental é montável em REP com
exatamente 6 membros (4+2), o teto de 1 par de asas se mantém mesmo forçado a
4+, e mamífero alado continua proibido do plano hexápode (a exceção é só do
réptil).

Bateria: 82 checagens, 0 falhas (rodada 4× seguidas sem falha; numa 5ª rodada
a suíte F de ecossistema falhou por variância de amostra pequena — mesma
instabilidade estatística já registrada e aceita na v29, não relacionada a
esta mudança).
