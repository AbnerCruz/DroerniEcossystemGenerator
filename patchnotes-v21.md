# v21 — Correção de resíduo de genoma + relatório de testes

## Correção

**Campo interno `memInfRaw` deixava resíduo órfão no genoma.** Quando a locomoção
de uma espécie muda por deriva para um valor que passa a *fixar* o número de
membros inferiores por tabela (ex.: vira quadrúpede → 4 pernas fixas), o gene
interno `memInfRaw` — usado só quando a locomoção NÃO fixa esse número — parava
de ser tocado, mas mantinha o valor de uma trajetória evolutiva anterior (de
antes da mudança). Não afetava a criatura em si (`memInf`, o gene visível, sempre
batia certo), só sujava o objeto interno do genoma e podia acusar falso positivo
na autoverificação de fidelidade da seed. Encontrado em 1 de 8.393 espécies
derivadas numa bateria de testes; corrigido explicitando a limpeza do campo nos
três ramos que fixam `memInf` por reino, classe ou locomoção. Re-testado em 7.832
espécies: 100,000% de fidelidade.

## Testes desta sessão (sem mudança de comportamento, só validação)

Bateria completa de coerência, performance e evolução/seleção natural — ver
relatório completo entregue na conversa. Dois achados foram **reportados mas
não corrigidos** nesta versão (aguardando decisão do usuário):

- `MAX_LINHAGENS_ATIVAS = 15` descarta silenciosamente ~49% das vezes em que uma
  linhagem-mãe "venceria" a chance de sobreviver à especiação (60% de sorteio),
  por falta de uma linhagem mais velha para sacrificar em seu lugar quando o teto
  de 15 linhagens simultâneas está saturado — o que hoje acontece em 97% dos casos
  elegíveis. É o freio real da bifurcação, mais restritivo que o teto de ciclos
  removido na v20.
- A pressão de "Recalcular Interações" (seleção natural entre contemporâneos,
  v19) não altera gene nenhum em 35,8% das aplicações, bem acima do ~1,6%
  esperado — o orçamento de um único ciclo de interação (0-9, sem acúmulo entre
  chamadas) às vezes sorteia um estrato caro demais no primeiro lance e descarta
  o resto do orçamento sem tentar algo mais barato.
