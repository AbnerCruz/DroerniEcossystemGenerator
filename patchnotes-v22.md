# v22 — Correção dos dois achados do relatório de evolução/seleção natural

## Achado 1: teto de linhagens ativas estrangulava a bifurcação

**Causa raiz identificada no relatório:** quando o teto de 15 linhagens ativas
simultâneas saturava (o que acontecia em 97% dos casos elegíveis), a lógica só
tentava "sacrificar uma linhagem mais antiga" olhando um recorte parcial da
rodada e exigindo idade *estritamente* maior — e ainda por cima, extinguir
sempre "a mais antiga" penalizava sistematicamente as linhagens-mãe mais
bem-sucedidas (que sobrevivem por mais rodadas acumulam idade maior, e eram
sempre as primeiras candidatas ao sacrifício). Resultado: quase metade das
sobrevivências vencidas no sorteio de 60% eram perdidas em silêncio, sem log,
sem chance de acontecer depois.

**Correção — duas partes:**
1. A checagem do teto deixou de acontecer no meio do loop (com um recorte
   parcial e injusto). Agora toda mãe que vence o sorteio entra na rodada sem
   restrição, e o teto é aplicado **uma vez só**, ao final, sobre a população
   inteira que tentou entrar.
2. A eliminação, quando o teto estoura, deixou de ser "sempre a mais antiga"
   e passou a ser **por sorteio**, sem viés de idade — removendo o efeito
   colateral de punir justamente as linhagens mais persistentes.
3. `MAX_LINHAGENS_ATIVAS` subiu de 15 para 40. Fazia sentido mantê-lo baixo
   quando a simulação era síncrona (v17-v19); a v20 tornou o motor assíncrono
   e fatiado no tempo, então um teto maior só significa "demora mais em
   segundo plano com barra de progresso", não "trava a aba".

**Medido:** nós com 2+ filhos (bifurcação real) foram de 13,2% para **21,7%**
no mesmo teste (600 ciclos), e a árvore final ficou consideravelmente maior em
termos absolutos. A ferramenta agora avisa quando linhagens são perdidas por
concorrência ("Recalcular Interações" e "Gerar Ecossistema" mostram quantas, e
sob qual teto), algo que antes acontecia sem nenhuma visibilidade.

## Achado 2: pressão de seleção natural sem efeito em ~36% das aplicações

**Causa raiz identificada no relatório:** cada clique em "Recalcular
Interações" aplicava um único ciclo de deriva com orçamento vindo de uma única
rolagem de pressão (0-9). Se essa rolagem sorteasse um gene caro demais logo de
cara, o ciclo inteiro encerrava ali — sem "próximo ciclo" pra herdar o saldo
não gasto, ao contrário da deriva de linhagem normal.

**Correção:** a interação agora roda **2 minirrodadas em sequência**, com o
orçamento de uma carregando para a outra — o mesmo mecanismo de acúmulo já
usado (e validado) na deriva de linhagem, só que aplicado 2 vezes numa única
interação em vez de depender de uma rolagem isolada. `aplicarCicloDeriva` em si
não foi tocada — ela continua exatamente como estava, calibrada e testada para
a deriva de linhagem normal.

**Medido:** taxa de "sem efeito nenhum" caiu de 35,8% para **6,6%**; média de
genes alterados por interação subiu de 1,07 para **2,62**. Mutação de Estrato I
continua rara (0,15% das aplicações) — a interação segue sendo "um empurrão",
não um salto evolutivo.

## Validação

Bateria completa de coerência e fidelidade de seed re-executada após as duas
correções: 0% de erro bloqueante em 5.000 espécies novas e em 1.166 espécies
passadas por geração + deriva + seleção natural repetida; 100% de fidelidade de
seed em todos os estágios.
