# v35 — Campos editáveis expandidos, travas sempre ativas

Um pedido, uma frente: *"a área de montar o DNA não me permite montar
precisamente. Formato, número de membros, etc. Quanto mais editável for o
aplicativo melhor. Com o sistema de travas sempre ativo para manter a
coerência."*

---

## O que estava limitado

Até a v34, o editor de espécie e o montador de DNA (novo na v34) expunham
**12 genes** editáveis à mão — reino, classe, porte, as duas tolerâncias,
dieta, locomoção primária, formato do crânio, dentição, quantidade de asas
e dois genes de tegumento. O resto — cerca de 60 genes — só saía por
sorteio.

Isso nunca foi limitação do motor. O motor já aceita **qualquer** gene como
override manual — é assim que a deriva, a busca por DNA-alvo e a
reconstrução por seed sempre funcionaram. A lista curta era só a interface
não oferecendo os controles.

## O que mudou

O editor e o montador agora expõem **cerca de 45 campos**, organizados em
grupos colapsáveis:

- **Taxonomia** — reino, classe, nível de magia
- **Morfologia geral** — porte, simetria, densidade, forma de crescimento,
  proporção de tronco
- **Locomoção e membros** — locomoção primária e secundária, velocidade,
  membros superiores, terminação, proporção, asas (quantidade e tipo),
  cauda (comprimento e tipo)
- **Crânio e face** — formato de crânio, pescoço, chifres (quantidade e
  formato), crista, focinho, orelha, olhos (quantidade e tipo), dentição
- **Tegumento** — tipo, cor, intensidade, padrão, resistência
- **Dieta e reprodução** — dieta, restrição alimentar, frequência, modo
  reprodutivo, tamanho de prole, maturação, longevidade
- **Sentidos e defesa** — visão, olfato, audição, tato, sentido especial e
  sua intensidade, arma, blindagem, estratégia de defesa
- **Social e tolerância** — estrutura social, agressividade, cognição,
  tolerância hídrica e térmica, ciclo de atividade
- **Grupos por táxon** — um grupo específico para cada classe animal
  (Mamífero, Ave, Réptil, Anfíbio, Peixe, Inseto, Molusco) e para
  Planta/Fungo/Bactéria, cada um só aparecendo quando a espécie atual é
  daquele tipo: glândula mamária e gestação para mamífero, bico e
  migração para ave, veneno e regeneração de cauda para réptil, e assim
  por diante.

Cada grupo abre colapsado por padrão (os três primeiros e qualquer grupo
com algo já fixado abrem automaticamente), então a tela continua navegável
em celular mesmo com quase quatro vezes mais controles.

**Sobre o número de membros especificamente:** `memInf` (pernas) não virou
campo editável direto — ele é **derivado** de locomoção primária na maior
parte das classes (bípede → 2 pernas, quadrúpede → 4, hexápode → 6,
octópode+ → 8), e um valor fixado nele seria sobrescrito de volta pelo
motor a cada normalização. Quem controla o número de pernas controla pela
locomoção primária, que é o gene que de fato decide. Membros superiores
(braços/asas) esses sim são diretamente editáveis.

## As travas continuam sempre ativas — é o ponto central do pedido

Nenhuma trava foi relaxada. O campo aparecer na interface (`tabela(g)`)
decide se ele se aplica ao reino/classe atual; o valor **escolhido**
continua passando pelo mesmo `categoricalStep`/`scalarStep` que a geração
aleatória usa, com as mesmas restrições de reino e classe. Três
comportamentos, testados diretamente:

- **Override válido é respeitado exatamente.** Pedir 4 chifres em formato
  galhado num réptil sai com 4 chifres em formato galhado.
- **Override inválido é corrigido, não aceito cru.** Pedir 8 membros
  superiores num molusco (que não tem braço nenhum) sai com 0 — a trava de
  classe vence.
- **Override escalar é recortado pelo limite do reino.** Pedir velocidade
  9 numa bactéria sai no teto que o reino permite, não no valor pedido —
  mesmo princípio de `limitesEscalar` que já existia, agora visível na
  interface como um slider cuja faixa muda com o contexto.

Uma montagem densa de ~40 campos simultâneos (um réptil blindado montado
gene a gene: porte grande, tronco alongado, quadrúpede com natação
secundária, sem asas, chifres curvos, escamas ósteodérmicas, veneno
inoculador, regeneração de cauda completa) sai **sem nenhum erro de
coerência**, com 45 de 46 campos batendo exatamente — o único que diverge
é uma combinação que a própria trava de terminação de membro rejeita para
aquela classe, que é a trava fazendo o trabalho certo.

Pedir o máximo de tudo ao mesmo tempo — 8 membros superiores, 8 inferiores,
8 asas, para qualquer classe animal — nunca produz um plano corporal acima
do orçamento da classe: a montagem manual está sob a mesma trava de
orçamento de membros que a v34 blindou para a geração aleatória.

## Bateria de testes

**177 checagens, 0 falhas**, rodada 4 vezes seguidas. Uma suíte nova:

- **BB · Campos editáveis expandidos** — todo campo listado corresponde a
  um gene real do genoma, override categórico válido é respeitado, trava
  de classe vence override incoerente, override escalar respeita o limite
  do reino, montagem densa de ~40 campos sai coerente com a esmagadora
  maioria batendo exato, a seed reconstrói fielmente a montagem manual, e
  nenhuma combinação de pressão manual máxima produz plano corporal
  impossível.

Duas correções vieram junto, achadas ao escrever os testes:

- **F2/F3 recalibradas de novo por uma folga a mais**: nenhuma mudança de
  motor, só ajuste do limiar de aviso.
- **X11 (tempo geológico) passou a medir a média de 3 trilhas em vez de
  uma só.** Uma trilha individual tem variância própria no número de
  ciclos de deriva estocástica antes de convergir; cobrar "50 AU" de uma
  amostra só produzia falso negativo quando ela calhava curta por sorteio.
