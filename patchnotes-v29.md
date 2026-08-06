# v29 — membros coerentes, diversidade de reinos, trilha que vira árvore

Cinco pedidos e relatos desta rodada, mais uma correção que caiu no colo por
consequência da terceira.

---

## 1. Réptil com oito membros — era bug de genoma, não de redação

**O que estava acontecendo.** `memSup` e `memInf` eram decididos de forma
independente: a locomoção primária derivava as pernas (quadrúpede → 4
inferiores), a trava da classe permitia mais 2 superiores, e `memApendices`
somava mais 2 por cima. Nenhum teto comum. O espécime relatado tinha mesmo os
oito membros no DNA — a ficha estava descrevendo com fidelidade um bicho
impossível.

**O que mudou.**

- **Orçamento total de membros por plano corporal** (`ORCAMENTO_MEMBROS`):
  tetrápode (MAM/AVE/REP/AMP) = 4 membros locomotores ao todo; artrópode e
  molusco = 8; peixe = 0 (barbatana é terminação, não membro). Se as pernas já
  são quatro, não sobra par superior.
- **Apêndice não é membro.** Vertebrado passa a ter `memApendices` fixo em 0;
  peixe aceita até 2 (barbilhões); molusco até 4 (o tentáculo tem gene próprio);
  artrópodo segue livre (antenas).
- **Asa é o par de membros superiores modificado**, não um quinto e sexto
  membro: tetrápode só ganha asa se o par superior estiver livre e as pernas
  couberem no teto de quatro, e no máximo um par de asas (mamíferos saíam com
  4 e 6 asas). Tetrápode de voo primário já nasce com o plano corporal alado.
- A trava ficou do lado da **asa** (Estrato II) e não do membro (Estrato I),
  de propósito: assim um ciclo de deriva barato nunca reescreve o plano
  corporal de graça — para virar alada, a linhagem paga antes a mudança
  estrutural nos membros. A regra da seed continua valendo (a correção é
  idempotente: reaplicar sobre o genoma corrigido não muda nada).
- **A prosa mudou** para não deixar o leitor somar números soltos. Agora:
  "Tem 4 membro(s) locomotor(es) ao todo — 0 superior(es) e 4 inferior(es)…",
  e apêndice aparece separado, dito pelo que é ("apêndice não-locomotor —
  antena, barbilhão ou tentáculo").

**Medido.** Em 3000 espécies sorteadas: 1686 tetrápodes, **0** com plano
corporal impossível (antes: ~9% dos tetrápodes tinham 6+ membros ou apêndice
extra).

---

## 2. Pouca diversidade em 1000 ciclos

**O que estava acontecendo.** Medido na v28, deriva de 1000 ciclos a partir de
um primordial: 2649 espécies, **83% ainda bactérias**. Das 1686 especiações
saídas de mãe bactéria, só **27 (1,6%)** atravessavam a barreira de reino.

A barreira não era a culpada — ela permite a travessia. O problema era
estatístico: `reino` é 1 gene entre os 11 do Estrato I, o Estrato I só é
sorteado em 12% das tentativas e custa 12 de orçamento, o que dá ~0,34% de
chance por ciclo. E pior: para uma bactéria, quase todo o resto do Estrato I
está travado por reino (membros, crânio, focinho, modo reprodutivo são fixos),
então a maioria dos sorteios de Estrato I gastava orçamento **sem mudar nada**
e ainda assim disparava especiação por outras vias. O mundo enchia de
bactérias ligeiramente diferentes umas das outras.

**O que mudou.** A bactéria — e só ela, que é quem pode atravessar — sorteia
`reino` em 1/3 das tentativas de Estrato I. Continua sendo deriva: sujeita a
orçamento, à normalização e à mesma barreira de sempre (quem não é bactéria
nunca muda de reino).

**Medido**, mesma deriva de 1000 ciclos, três rodadas: bactéria cai para
20-43% e os quatro reinos aparecem em volume. A variância é alta de propósito
— uma linhagem que salta cedo domina, e isso é radiação adaptativa, não erro.

---

## 3. Interações quase pararam num mundo diverso (consequência do item 2)

Descoberto pela bateria de testes logo depois da mudança acima: com os quatro
reinos no mundo, ecossistemas inteiros ficavam **sem nenhuma interação** —
medido, em alguns mundos apenas 2 de 51 espécies tinham par interagível, e a
seleção natural não tinha em que agir.

Duas regras estavam calibradas para um mundo todo bacteriano:

- **Competição** exigia dieta **e** locomoção primária idênticas. Num mundo de
  bactérias (locomoção N/F, dieta "de") isso batia quase sempre; com
  diversidade, virou coincidência rara. Agora nicho é **mesma base alimentar
  disputada no mesmo meio** (aquático / semiaquático / terrestre): dois
  herbívoros do mesmo pântano competem, ande um saltando e o outro rastejando.
- **Predação** aceitava qualquer coisa lenta e mole como presa — e planta,
  fungo e bactéria são, por definição, lentos e moles. Um carnívoro "predava"
  um arbusto. Presa de predação agora é bicho; comer planta é herbivoria, e
  herbívoro nem entra nessa regra.

---

## 4. Árvore genealógica: filtrar extintas, e reino antes do clado

- Botão **"Só vivas / Mostrando extintas"** na Fase 3, valendo para a árvore,
  a lista e a busca por trecho de DNA. O filtro **preserva os ancestrais
  extintos que ainda têm descendência viva** — sem isso, esconder os mortos
  quebraria o galho no meio e as vivas sumiriam junto com eles. Ancestral
  extinto mantido continua esmaecido, como já era.
- Cabeçalho de cada linhagem passa a contar **N viva(s) · M extinta(s)**.
- **O reino aparece antes do clado**, em etiqueta curta e colorida (ANI / PLA /
  FUN / BAC), na árvore e nos cards — dá pra identificar a espécie sem abrir.
  O reino saiu do bloco de metadados da direita, onde ficava escondido no
  celular.

---

## 5. Trilha de deriva agora gera a linhagem de verdade

Até aqui a trilha só sabia ser **copiada**: virava um texto `TRILHA1|…` que
você colava, à mão, no campo de importação da criação de primordial — e o app
jogava fora os passos intermediários, que são justamente a árvore que a busca
acabou de descobrir.

Novo botão **"Gerar linhagem na árvore"** no painel de trilha do visor de
espécie, nos dois sentidos:

- **Adiante** — a linhagem nasce pendurada na espécie atual e termina numa
  espécie com o DNA-alvo.
- **Para trás** — cria o ancestral primordial hipotético e as intermediárias.
  Se a espécie de destino for hoje uma raiz (primordial sem ancestral), ela
  **deixa de ser primordial e passa a descender da linhagem reconstruída** —
  junto com toda a subárvore dela, que herda o primordialId novo. Se ela já
  tiver ancestral, a linhagem entra como ramo paralelo.

O corte de espécie usa o **mesmo critério da deriva automática**: gene de
Estrato I muda, ou 6 genes de Estrato II acumulados. O nó final é o genoma que
a busca de fato alcançou, então bate exatamente no alvo. Cada espécie nova
ganha população de indivíduos, como qualquer outra.

---

## 6. Busca por seed/DNA: linhagem até a primordial

A busca decodificava o espécime e parava ali — um endereço no espaço de
possibilidades, sem passado nenhum. Agora, no mesmo painel:

- **"Reconstruir linhagem"** roda a trilha reversa a partir do espécime
  encontrado e mostra o ancestral primordial sorteado e o número de ciclos
  ("Sortear outra" devolve outra trilha, igualmente válida — a deriva descarta
  informação, o passado não é único).
- **"Gerar linhagem no mundo"** materializa tudo na árvore.

Efeito colateral bem-vindo: esse é o caminho para trazer ao mundo um espécime
**derivado** achado por seed. Antes o app só sabia adicionar primordiais e
avisava que uma derivada não entrava sem espécie-mãe — agora ela entra junto
com a linhagem inteira que a produziu.

---

## Bateria de testes

De 66 para **79 checagens, 0 falhas** (rodada 6 vezes seguidas), mais 16
medições informativas. Três suítes novas:

- **O · Orçamento de membros** — teto por classe, apêndice em vertebrado, asa
  consumindo o par superior, o caso do réptil quadrúpede, e a prosa declarando
  o total.
- **P · Diversidade de reinos** — a deriva atravessa a barreira, a bactéria não
  domina a árvore inteira, e **só** bactéria muda de reino (a barreira segue
  valendo). O limiar é folgado de propósito: em deriva curta o resultado é
  legitimamente volátil, e a proporção fica como medição informativa.
- **Q · Materializar trilha** — o último nó é o próprio alvo, elos pai/filho
  íntegros, raiz primordial, datas crescentes, trilha vazia não cria nada.

E duas correções na suíte F (ecossistema), que passou a falhar de forma
intermitente depois do item 2 — em ambos os casos o teste é que estava
calibrado para o mundo antigo:

- o cenário é reposto até ter massa crítica de espécies vivas (a suíte mede o
  motor de seleção, não a sorte da árvore);
- F2 passou a cobrar alcance sobre as espécies que têm **par interagível** na
  própria divisão, não sobre todas as que dividem território — com quatro
  reinos, co-habitar não implica ter com quem competir.

---

## Pendência ainda aberta (desde a v26)

`simularSelecaoNatural` e `rodarCicloSelecaoIndividual` fazem `Object.assign` no
genoma de espécie viva — alteram o DNA sem gerar nó filho. É a mesma
incoerência que a Fase 2 (item 5.4) corrigiu só para a edição manual, e você
já disse que alteração genética sem deriva não faz sentido. Continua esperando
sua decisão sobre como resolver.
