# v30 — réptil pode ter asas (dragão)

Pedido único: liberar réptil com asas.

## O que mudou

A classe REP tinha `asaQtd: { fixed: 0 }` desde a Fase 3 (v25) — decisão de
design de então ("réptil: escama, ovíparo, **sem asa**, crânio ossificado"),
não bug. Removida.

- **Tipo de asa travado em membranosa** (`mb`) — é a única coerente com
  escama/couro (pterossauro, wyvern). Pena e élitro continuam exclusivos de
  ave e inseto.
- **Locomoção primária de réptil ganhou voo e planeio** (`V`, `P`) na lista de
  modos possíveis — sem isso, o réptil só *tinha* asa, nunca *voava* com ela
  como modo principal.
- **Teto de membros continua o mesmo** (Fase v29): a asa é o par de membros
  superiores modificado, não um quinto e sexto membro. Um réptil alado sai
  como wyvern — duas pernas, duas asas — não como o dragão ocidental de seis
  membros; esse plano corporal já não existia em nenhuma classe do sistema
  (nem mamífero, nem ave), então mantive a mesma regra aqui em vez de abrir
  uma exceção só para réptil.
- Réptil aquático obrigatório continua sem poder voar como modo primário — a
  água já bloqueia esse conjunto de locomoções, para qualquer classe.
- Réptil com magia ≥A4 pode voar **sem** asa física (voo por levitação, regra
  que já existia para todas as classes) — medido: ~14% dos répteis-voadores
  saem assim. Se você quer garantir asa física em vez de deixar no sorteio,
  force `asaQtd` no editor manual.

## Testado

Construí um exemplar dirigido — réptil titânico (24m, ~216 toneladas), voo
primário, 2 asas membranosas, escama blindada, cuspe/jato como sopro à
distância, magia Ápice (A9) — e confirmei em 300 amostras que nenhum plano
corporal saiu quebrado (sem 3+ membros locomotores, sem apêndice extra, sem
tipo de asa incoerente com escama).

Bateria: 79 checagens, 0 falhas (rodada 4×).
