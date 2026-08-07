# v36 — Edição estável: escolhas não se perdem, opções incoerentes ficam desabilitadas

Um relato, duas correções pedidas na mesma frase: *"eu clico na opção e
fica resorteando as configurações e portanto perco as configurações
anteriores que coloquei. Corrija, se por acaso for por inconsistência é só
não permitir a seleção."*

---

## O diagnóstico

Não era inconsistência — ou melhor, era só uma pequena parte do problema.
`recalcular`, chamada a cada clique no editor de espécie e no montador de
DNA (ambos da v34/v35), reconstruía o genoma **do zero** a cada edição, com
`manual` contendo só os campos que o usuário tinha explicitamente fixado.

Todo gene que o usuário via na tela mas não tinha marcado como override —
a cor do tegumento, a dieta, a estrutura social, tudo — era resorteado de
novo, com um `Math.random()` novo, em **todo clique**. Não era só o campo
tocado: a tela inteira embaralhava a cada seleção. O usuário fixava
"Réptil", via um resultado, clicava em "Porte: Grande", e a cor, a dieta e
uma dúzia de outros campos que ele tinha acabado de ver mudavam de novo —
dando exatamente a sensação de "perder o que coloquei antes", porque na
prática cada clique era um sorteio novo do resto da espécie.

## A correção

Editar um campo agora usa `normalizarGenoma` — uma função que já existia no
motor com exatamente esta semântica, usada em outros pontos do sistema
sob o nome de "modo dirigido": ela parte do genoma **que já está na tela**,
aplica só a mudança pedida, e mantém todo o resto como estava, recalculando
apenas o que a mudança tornou de fato incoerente.

Duas semânticas distintas, antes misturadas numa função só:

- **Editar um campo** (clicar numa opção) → parte do que está na tela, só
  a mudança pedida se aplica, o resto fica.
- **"Sortear tudo" / "Resortear não-fixados"** → continuam gerando do
  zero, porque esses botões existem justamente para embaralhar. Verificado
  que continuam produzindo variação de verdade (30 sorteios seguidos, mais
  de 20 saem visivelmente diferentes) — a correção não podia silenciosamente
  travar esses dois botões também.

## Opções incoerentes ficam desabilitadas na tela

A segunda metade do pedido: quando uma opção seria rejeitada pela trava de
qualquer forma, ela nem aparece clicável. Cada `<select>` agora calcula,
para o grupo que está de fato aberto na tela, quais das suas opções o
motor de fato aceitaria dado o resto do genoma atual — e desabilita as
demais, com o rótulo "— indisponível agora".

Um molusco só pode ter `0S` de membros superiores (não tem braço); ao
abrir o campo, as outras seis opções da tabela aparecem cinzas e
inclicáveis, em vez de aceitar o clique e reverter sozinhas depois. Uma
bactéria só tem tegumento mucoso disponível — mesma lógica.

**Como é calculado, e por quê desse jeito:** a função não reimplementa
nenhuma trava — ela roda o motor de verdade (a mesma `normalizarGenoma`
usada para aplicar a edição) uma vez por opção da tabela, e verifica se o
valor sobreviveu. Reimplementar as regras à parte correria o risco de
divergir da trava real assim que o motor mudasse; rodar o motor de verdade
elimina esse risco por construção. O custo é uma chamada extra ao motor
por opção — medido em ~0,2ms cada, então uma tabela de 14 linhas custa
~3ms, imperceptível — e só é pago para o grupo que está aberto na tela;
grupos recolhidos não calculam nada.

## Bateria de testes

**183 checagens, 0 falhas**, rodada 3 vezes seguidas. Uma suíte nova:

- **CC · Edição estável e opções desabilitadas** — editar um campo não
  altera campos não relacionados (200 amostras, 0 instabilidades); uma
  sequência de 5 edições incrementais, como o usuário faz na prática,
  preserva todas as escolhas anteriores; nenhuma opção marcada como
  disponível é na verdade rejeitada pelo motor (0 falsos positivos); os
  dois casos concretos do relato (molusco sem braço, bactéria com
  tegumento único) aparecem corretamente restritos a uma opção só; e os
  botões de resorteio continuam resorteando de verdade.
