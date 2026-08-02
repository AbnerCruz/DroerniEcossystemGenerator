# v18 — Auditoria, correções de coerência e performance

Revisão completa do pacote v17: testes automatizados sobre o motor, caça a bugs,
medição de performance e verificação de coerência dos resultados gerados.

## Motor evolutivo

- **Estrato I voltou a existir.** O orçamento de deriva era zerado a cada ciclo,
  então o teto por ciclo era `3d4−3` (máximo 9), abaixo dos 12 que o Estrato I
  custa. Medido no código antigo: **0 mutações de Estrato I em 29.459 ciclos** —
  reino, classe, simetria, locomoção primária, membros, modo reprodutivo, formato
  do crânio e tolerância hídrica nunca evoluíam. Agora o sorteio do estrato é
  independente do saldo: se o estrato sorteado não couber, o ciclo encerra e o
  saldo é guardado para o próximo. Resultado: **8,5% das especiações passam a ser
  disparadas por mudança estrutural**.
- **Pressão de seleção natural entre contemporâneos ligada à interface.**
  `simularSelecaoNatural` estava escrita e completa, mas nenhuma função a chamava.
  Novo botão **Recalcular Interações** na Fase 3: avalia predação e competição por
  nicho entre as espécies vivas de cada massa de terra e aplica um ciclo de deriva
  enviesado nas perdedoras.
- Orçamento da pressão de interação reduzido de 24 para 0 — a interação vale um
  ciclo enviesado, não um salto evolutivo (relevante agora que o Estrato I é
  alcançável).

## Calendário e escala de tempo

- **1 AU = 1.000.000 de anos**, fixado em `AU_EM_ANOS`. O motor sempre calculou em
  milhões, mas a interface e os exports rotulavam AU como *bilhões* e multiplicavam
  por `1e9` — erro de fator 1000 entre o que era computado e o que era lido.
- **Piso artificial de 1 AU por especiação removido.** Ele dominava o cálculo: com
  maturação típica, 20 ciclos acumulam ~0,02 AU, então quase toda especiação somava
  1 AU inventado e o eixo virava contagem de especiações. Um ecossistema padrão
  produzia espécies datadas em até **13,4 bilhões de anos**, mais velhas que o
  universo. Agora o AU carregado é o tempo real acumulado.
- `fmtAU` reescrita com escala progressiva: anos → mil anos → mi anos → bi anos.
- Ficha Obsidian ganha `ano_surgimento_au` além de `ano_surgimento_anos` (na escala
  correta).

## Coerência biológica

- **Armas naturais agora exigem a anatomia que as produz.** O gene `defArma` era
  sorteado solto. Na amostra antiga: 8,08% com `arma: chifres` sem nenhum chifre,
  3,20% com `presas` sem dentição, 2,84% com `garras` sem membro, 0,36% com `presas`
  sem crânio. Chifre exige `crnChifreQtd ≠ 0`; presa exige crânio com dentição;
  garra e constrição exigem membro ou apêndice; cuspe exige abertura oral; ataque
  áurico exige magia ≥ A3.
- **Trava de crânio para Réptil e Anfíbio.** MAM, AVE, PSC, INS e MOL já travavam
  `crnFormato`; REP e AMP não — 3,14% dos répteis nasciam sem crânio, origem das
  combinações contraditórias reportadas.
- **Aquático obrigatório não nasce mais com asas.** O gerador só enviesava contra
  (`bias`), enquanto a regra de coerência tratava isso como erro bloqueante; virou
  trava dura (`fixed: 0`).
- **Reprodução de plantas e seres espirituais restringida.** Plantas não tinham
  trava nenhuma: saíam plantas vivíparas e plantas "que não se reproduzem".
- **Validação de coerência alcança espécies derivadas.** Ela só rodava no editor
  manual e no sorteio de primordiais — 1,29% das espécies nascidas de deriva
  entravam no ecossistema com erro bloqueante. `aplicarCorrecoesAutomaticas` roda a
  cada ciclo, com renormalização e teto de 3 rodadas.
- `gerarPrimordialValido` deixou de poder commitar um genoma contraditório quando
  as 5 tentativas se esgotavam.

**Resultado medido em 5.000 espécies geradas do zero: 0,00% com erro bloqueante**
(era 0,30%) e **0 contradições** nas categorias auditadas (eram 5). Em 988 espécies
nascidas de deriva: **0 incoerências**.

## Regra de peso

- A regra `peso-extremo-baixo` comparava peso (kg) com `altura × 5` (m) — grandezas
  diferentes. Para porte minúsculo o limiar era 0,5 kg e o peso máximo possível, já
  com densidade 9, é 0,35 kg: **100% das espécies minúsculas carregavam um aviso
  matematicamente impossível de resolver**, e o botão "ajustar" não mudava nada.
- Substituída por `densidade-implausivel`, que olha densidade efetiva em kg/m³ e
  vale igual em qualquer porte, com isenção para reino Espiritual e tegumento
  etéreo. Taxa de aviso caiu de **17,74% para 2,32%**.

## Performance

- `validNumbers` e `scalarDomainIdx` memoizados. `validNumbers` varria 1..100
  chamando `pick()` a cada gene categórico (~40× por espécie, 2× por `buildSpecies`)
  sobre tabelas estáticas: era **~70% do custo de `runSpeciesSteps`**.
- `buildSpecies` ganhou o parâmetro `comSeed`. O segundo passe (encode) rodava
  sempre, mesmo quando o chamador só queria o genoma — o editor refaz isso a cada
  tecla digitada.
- **`buildSpecies` sem seed: 1,157 ms → 0,199 ms (5,8× mais rápido).** Com seed:
  0,633 ms.
- Teto de 150 ciclos nos modais de geração e derivação, com estimativa de tempo
  exibida antes de confirmar (digitar 300 travava a aba por ~18 s).
- Log limitado a 4.000 eventos, caindo sozinho para verbosidade resumida ao passar
  do teto e preservando sempre os eventos estruturais. O painel renderiza no máximo
  300 eventos; o histórico completo continua no export `.txt`.

## Interface e exports

- **Divisão de era passa a migrar as espécies.** `aplicarDivisaoEra` nunca era
  chamada: criar uma era nova gerava massas de terra novas mas deixava todas as
  espécies apontando para as massas antigas, então a divisão geográfica não tinha
  efeito nenhum sobre a biologia. Agora migra e registra o evento no log.
- Dividir em novas eras deixou de ser bloqueado depois de confirmar a Fase 2.
- **Resumo da geografia continua visível** depois de confirmada (antes o painel
  sumia da tela e o código do resumo era inalcançável).
- **A linha do DNA no editor renderizava vazia** — `g` é o ctx do genoma e não tem
  `.code`; passou a usar `serialize(g)`.
- **Eventos do "Gerar Ecossistema" não apareciam no log.** `__eventLog` é mutado em
  lugar, então o `useMemo` devolvia sempre a mesma referência e o React não via
  mudança. Clonar, deletar e criar indivíduo também não atualizavam.
- **Clonar espécie** deixava o nó marcado como primordial enquanto o genoma
  continuava com `isPrimordial: false`, e copiava o mesmo clado — o que colidia os
  `[[wikilinks]]` da ficha Obsidian. Agora o clone é um primordial de verdade, com
  clado próprio e genoma renormalizado.
- **Exports e interface mostravam habitats diferentes para a mesma espécie**: os
  exports usavam `readHabitat` (códice inteiro, sem geografia) e a tela usava
  `readHabitatNaMassa`. Unificados em `habitatDoNo`.
- Campo `seed` da ficha Obsidian era sempre vazio; agora é derivado com
  `seedParaGenoma`. Ficha ganha seção `## Habitat`.
- Aviso quando a deriva para por atingir o teto de espécies por linhagem.

## Correção de bug latente

- `parseAnySeed` chamava `textToSeed`, que **não existia em arquivo nenhum** —
  qualquer seed não-numérica derrubaria a aplicação com `ReferenceError`.
  Implementada (FNV-1a de 128 bits, determinística).

## O que continua igual

Os round-trips de seed seguem em **100% de fidelidade** depois de todas as
mudanças: 3.000/3.000 para espécie, 1.500/1.500 para indivíduo, 988/988 para
espécies nascidas de deriva. Todas as travas novas entram como `exclude`/`fixed` no
`categoricalStep`, portanto simétricas entre decode, encode e randomize.
