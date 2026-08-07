/* ============================================================
   BLOCO 2 — PESO, CALORIAS E VALIDAÇÃO DE COERÊNCIA (v17)
   Camada NOVA, puramente derivada dos genes já existentes —
   não consome dígitos de seed, não altera o motor DRN2 original.
   ============================================================ */

function fmtNum(n, casas = 1) { return (n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: casas }); }
/* v28 — a escala de massa deixou de ser só "kg ou toneladas". Com a régua
   corporal por reino, uma bactéria pesa da ordem de picogramas e um bolor de
   miligramas: `fmtNum(kg)` devolvia "0 kg" para todos eles, que é
   exatamente o tipo de número irreal que motivou esta revisão. O formatador
   agora desce até o picograma e sobe até a tonelada. */
function fmtKg(kg) {
  if (!isFinite(kg) || kg <= 0) return "—";
  if (kg >= 1000) return `${fmtNum(kg / 1000)} t`;
  if (kg >= 1) return `${fmtNum(kg)} kg`;
  if (kg >= 1e-3) return `${fmtNum(kg * 1e3, 1)} g`;
  if (kg >= 1e-6) return `${fmtNum(kg * 1e6, 1)} mg`;
  if (kg >= 1e-9) return `${fmtNum(kg * 1e9, 1)} µg`;
  if (kg >= 1e-12) return `${fmtNum(kg * 1e12, 2)} ng`;
  return `${fmtNum(kg * 1e15, 4)} pg`; // idem: evita "2.4e-3 pg"
}

/* v28 — idem para comprimento: micrômetros para bactéria, milímetros para
   bolor, metros para o resto. */
function fmtComprimento(m) {
  if (!isFinite(m) || m <= 0) return "—";
  if (m >= 1) return `${fmtNum(m, 2)} m`;
  if (m >= 0.01) return `${fmtNum(m * 100, 1)} cm`;
  if (m >= 1e-3) return `${fmtNum(m * 1000, 1)} mm`;
  if (m >= 1e-6) return `${fmtNum(m * 1e6, 2)} µm`;
  /* v28 — toPrecision devolve notação científica quando o expoente passa de
     um limite ("2.0e+2 nm" para 200 nm), que é exatamente o caso comum aqui.
     fmtNum arredonda sem trocar de notação. */
  return `${fmtNum(m * 1e9, 1)} nm`;
}

/* ============================================================
   v28 — ESCALA CORPORAL POR REINO
   ============================================================
   O modelo antigo tinha uma única tabela de altura por porte e uma única
   tabela de densidade, aplicadas igualmente a animal, planta, fungo e
   bactéria. Medido na v27, em 20.000 espécies:

     bactéria: mediana 175 kg, máximo 31.894 TONELADAS, altura até 45 m
     animal:   máximo 44.651 t (uma baleia-azul tem 190 t)
     todos:    densidade até 7.000 kg/m³, que é a do ferro
               densidade mínima 50 kg/m³, mais leve que cortiça

   Uma bactéria é um organismo unicelular: a escala dela é o micrômetro, e
   a massa é da ordem de picogramas. Não é um bicho pequeno — é outra ordem
   de grandeza inteira, e tratar as duas coisas com a mesma régua era o que
   fazia o número sair absurdo.

   Agora cada reino tem sua própria régua de tamanho, ancorada em
   referências reais, com folga para o exagero de fantasia no topo. */

/* v32 — A ALTURA DEIXOU DE SER UM DE SEIS VALORES.

   Até a v31 o porte mapeava para UM número: todo animal "médio" tinha
   exatamente 1,70 m, todo "grande" exatamente 4,50 m. Como o peso é
   k · altura³ · densidade, e tanto k quanto a densidade também eram
   discretos, o sistema inteiro só conseguia produzir umas poucas dezenas de
   pesos distintos — um lobo, um humano e um cervo saíam idênticos. Era essa
   quantização, mais do que a fórmula, que fazia o peso "não parecer real".

   Agora cada porte é uma FAIXA, e a posição dentro dela é lida do próprio
   genoma (`posicaoNaFaixa`): determinística, estável entre sessões, sem
   campo novo no genoma e sem consumir dígito de seed. As âncoras continuam
   sendo as referências reais da v28 — o valor pontual antigo de cada porte
   cai perto do meio da faixa correspondente, então nenhuma ordem de
   grandeza muda; o que passa a existir é variação contínua dentro dela.

   A interpolação é GEOMÉTRICA (min · (max/min)^t), não linear: tamanho de
   organismo se distribui em escala logarítmica, e numa faixa como a da
   planta grande (6 m a 35 m) a interpolação linear amontoaria quase tudo
   no topo. */
const FAIXA_ALTURA_POR_PORTE_REINO = {
  /* Animal. mn 5mm-8cm (ácaro a besouro) · pq 8cm-70cm (rato a lince)
     md 70cm-3m (lobo, humano, cavalo) · gr 3m-7m (elefante, girafa)
     cl 7m-15m (sauropode) · tt 15m-30m (fantasia) */
  An: { mn: [0.005, 0.08], pq: [0.08, 0.70], md: [0.70, 3.0], gr: [3.0, 7.0], cl: [7.0, 15.0], tt: [15.0, 30.0] },
  /* Planta — do musgo à sequoia (90 m é o limite hidráulico real do
     transporte de água), com o topo em escala de fantasia. */
  Pl: { mn: [0.005, 0.08], pq: [0.08, 1.0], md: [1.0, 6.0], gr: [6.0, 35.0], cl: [35.0, 95.0], tt: [95.0, 160.0] },
  /* Fungo — do bolor ao maior corpo de frutificação conhecido. */
  Fu: { mn: [0.0005, 0.01], pq: [0.01, 0.15], md: [0.15, 0.60], gr: [0.60, 2.0], cl: [2.0, 5.0], tt: [5.0, 9.0] },
  /* Bactéria — micrômetros. Piso no Mycoplasma (0,1 µm, o menor organismo
     conhecido); os portes altos alcançam a Thiomargarita namibiensis, que
     chega a 0,75 mm de verdade. O motor restringe Ba a mn/pq, mas as faixas
     acima ficam definidas caso a deriva leve a bactéria além disso. */
  Ba: { mn: [1e-7, 8e-7], pq: [8e-7, 1.5e-5], md: [1.5e-5, 1e-4], gr: [1e-4, 8e-4], cl: [8e-4, 2.5e-3], tt: [2.5e-3, 6e-3] },
};
const FAIXA_ALTURA_POR_PORTE = FAIXA_ALTURA_POR_PORTE_REINO.An; // fallback

/* Hash estável (FNV-1a) — usado só para dar a cada espécie uma posição
   própria dentro da faixa do seu porte. Não é aleatoriedade: roda igual em
   qualquer sessão e em qualquer aparelho. */
function hashEstavel(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/* Posição (0..1) da espécie dentro da faixa do seu porte.

   Metade vem de um viés BIOLÓGICO legível — tronco alongado e membros
   longos puxam para o topo da faixa, corpo compacto e prole numerosa puxam
   para o fundo — e metade de um hash de genes estáveis, que é o que dá variação
   entre espécies de morfologia grosseira parecida. Só genes que teriam a
   ver com tamanho entram na conta, para o peso não oscilar a cada ciclo de
   deriva por causa de um gene irrelevante como a cor do tegumento. */
function posicaoNaFaixa(g) {
  let vies = 0.5;
  if (g.morTorso === "al" || g.morTorso === "se") vies += 0.10;
  if (g.morTorso === "co") vies -= 0.10;
  if (g.memProp === "lo") vies += 0.07;
  if (g.memProp === "ex") vies += 0.12;
  if (g.memProp === "cu") vies -= 0.07;
  if (g.crnPescoco === "lo") vies += 0.05;
  if (g.crnPescoco === "el") vies += 0.10;
  // estratégia de vida: maturação lenta = corpo maior; prole numerosa = menor
  vies += (Number(g.repMaturacao ?? 4) - 4) * 0.022;
  vies -= (Number(g.repProle ?? 4) - 4) * 0.022;
  if (g.reino === "Pl") {
    if (g.morForma === "av") vies += 0.15;   // arbórea
    if (g.morForma === "co") vies += 0.05;   // colunar
    if (g.morForma === "ta" || g.morForma === "tr") vies -= 0.15; // tapete, trepadeira
  }
  vies = Math.max(0, Math.min(1, vies));
  /* v34 — o clado saiu do genoma; o ruído de variação individual passa a
     ser semeado só por genes reais, que é o que ele deveria ter usado desde
     sempre (o clado era nome próprio e não dizia nada do corpo). */
  const ruido = hashEstavel(String(g.densidade) + "|" + g.porte + "|" + g.reino + "|" + (g.classe || ""));
  return Math.max(0, Math.min(1, vies * 0.5 + ruido * 0.5));
}

function alturaDePorte(g) {
  const tabela = FAIXA_ALTURA_POR_PORTE_REINO[g.reino] || FAIXA_ALTURA_POR_PORTE;
  const faixa = tabela[g.porte] || tabela.md;
  const t = posicaoNaFaixa(g);
  return faixa[0] * Math.pow(faixa[1] / faixa[0], t);
}

/* Valor único de referência por porte (o meio geométrico da faixa), mantido
   porque a bateria de testes e alguns pontos da UI consultam a tabela
   pontual. É praticamente o valor da v28. */
const ALTURA_POR_PORTE_REINO = Object.fromEntries(
  Object.entries(FAIXA_ALTURA_POR_PORTE_REINO).map(([reino, portes]) => [
    reino,
    Object.fromEntries(Object.entries(portes).map(([p, faixa]) => [p, Math.sqrt(faixa[0] * faixa[1])])),
  ])
);
const ALTURA_POR_PORTE = ALTURA_POR_PORTE_REINO.An;

/* Densidade (escalar 0-9 do genoma) -> kg/m³ REAL de tecido vivo.
   A faixa antiga (50 a 7.000) não descrevia nada vivo em nenhuma das
   pontas. A nova cobre de madeira balsa (160) a concha/dente
   mineralizado (2.200), passando pelo valor de referência da água e da
   carne (1.000-1.060). O motor restringe a faixa por reino (v28). */
const DENSIDADE_KGM3 = [160, 300, 450, 600, 800, 1000, 1060, 1300, 1700, 2200];

/* Fator de forma (corrige volume ~ esfera/elipsoide genérico para
   silhuetas mais alongadas ou mais compactas). Não é um gene novo,
   só um ajuste de leitura sobre locPrimario/morTorso existentes. */
function fatorForma(g, alturaM) {
  /* v28 — plantas e fungos não têm "torso", e o fator genérico de 0,05
     tratava uma árvore como um bloco maciço de 20m: uma árvore de 20m saía
     com 400 m³, contra os ~20 m³ reais de um carvalho adulto. A fração do
     cubo da altura que a biomassa realmente ocupa é MUITO menor num
     organismo ramificado, e menor ainda num fungo de lâminas finas. */
  if (g.reino === "Pl") {
    /* v28 — teto geométrico por altura. Uma forma compacta (rosácea, colunar)
       descreve bem uma suculenta de 40 cm, mas a mesma fração de volume numa
       planta de 90 m daria 30.909 toneladas — dez vezes a árvore mais pesada
       já medida. Acima de 10 m, qualquer coisa que se sustente é tronco mais
       copa vazada, independente do gene de forma: o cálculo respeita isso. */
    const tetoAltura = alturaM >= 10 ? 0.006 : alturaM >= 3 ? 0.020 : 1;
    const bruto = (() => {
    /* Valores conferidos contra T.morFormaPl (arbustiva, arbórea, tapete,
       trepadeira, rosácea, colunar, amorfa). A fração do cubo da altura que
       a biomassa ocupa cai muito num organismo ramificado e cai mais ainda
       num que cresce em folha ou fio. */
      if (g.morForma === "av") return 0.0035; // arbórea: tronco + copa vazada
      if (g.morForma === "ar") return 0.0060; // arbustiva: ramificação densa e baixa
      if (g.morForma === "co") return 0.0400; // colunar: cacto/caule maciço
      if (g.morForma === "ta") return 0.0015; // tapete/rasteira: lâmina fina
      if (g.morForma === "tr") return 0.0025; // trepadeira: cordão
      if (g.morForma === "ro") return 0.0300; // rosácea: compacta
      return 0.0080;                          // amorfa
    })();
    return Math.min(bruto, tetoAltura);
  }

  if (g.reino === "Fu") return g.morForma === "es" ? 0.006 : 0.012; // esporângio filiforme vs chapéu
  if (g.reino === "Ba") return 0.30;                                // célula: quase um cilindro cheio
  /* v28 — o lado ANIMAL também estava calibrado alto demais, e o erro
     compunha com o cubo da altura. Com o fator antigo de 0,05, um humano de
     1,7 m saía com 246 kg, e um "titânico" de 24 m com 2.128 toneladas —
     onze baleias-azuis. A fração do cubo da altura que um corpo animal
     realmente ocupa é da ordem de 1,5%, não 5%: conferido contra humano
     (1,7 m / ~80 kg), elefante (4,5 m / ~6 t) e sauropode (10 m / ~30 t).
     As proporções relativas entre as silhuetas foram mantidas. */
  const bruto = ["S", "Z"].includes(g.locPrimario) ? 0.006 // serpentiforme/fásico: corpo fino e longo
    : g.morTorso === "se" ? 0.008   // torso serpentino
    : g.morTorso === "al" ? 0.012   // alongado
    : g.morTorso === "co" ? 0.026   // compacto
    : 0.018;                        // proporcional — padrão
  /* v32 — TETO GEOMÉTRICO TAMBÉM DO LADO ANIMAL. A planta já tinha o dela
     desde a v28; o animal não, e com a altura agora contínua isso passou a
     doer: um "titânico" de 30 m com silhueta compacta saía com 686 t, três
     vezes e meia uma baleia-azul (190 t, e ela é o teto absoluto da vida
     terrestre conhecida). A lei do quadrado-cubo é o motivo físico: corpo
     grande não é corpo pequeno em escala — ele fica proporcionalmente mais
     esguio, mais oco e mais dependente de sustentação, senão o próprio peso
     esmaga a estrutura. Conferido contra baleia-azul (30 m / 190 t, o que
     dá k ≈ 0,007) e sauropode (30 m / ~70 t). Abaixo de 3 m nada muda. */
  if (alturaM <= 3) return bruto;
  /* A rampa vai até 30 m — o topo da faixa "titânico" — e não até 20 m. Com
     o corte em 20 m, tudo entre 20 e 30 m ficava com o MESMO fator de forma
     e voltava a engordar com o cubo da altura: o maior animal do sistema
     batia 203 t contra as 190 t da baleia-azul. Ancorado em 30 m / ~0,006,
     um aquático de 30 m sai por volta de 165 t, que é a ordem certa. */
  const t = Math.min(1, Math.log(alturaM / 3) / Math.log(30 / 3));
  const teto = 0.018 * Math.pow(0.0060 / 0.018, t);
  return Math.min(bruto, teto);
}

/* Multiplicador metabólico por dieta — dita o quanto a "caloria" do
   peso*30 realmente se aplica (fotossintéticos/não-alimentares comem
   ínfimo ou nada). */
const METABOLISMO_POR_DIETA = { ft: 0.05, qm: 0.05, ni: 0, au: 0.3 };
function multMetabolico(g) { return METABOLISMO_POR_DIETA[g.dieBase] ?? 1; }

/* v28 — multiplicador metabólico por reino. A lei de Kleiber com constante
   70 é calibrada para MAMÍFEROS. Um vegetal parado gasta uma fração disso;
   um procarionte, ao contrário, tem taxa metabólica por unidade de massa
   ordens de grandeza MAIOR que a de qualquer animal (razão superfície/volume
   altíssima) — usar a constante de mamífero numa bactéria subestimava o
   metabolismo dela em várias ordens. */
const METABOLISMO_POR_REINO = { An: 1, Pl: 0.15, Fu: 0.25, Ba: 3.0 };

/* Tolerância térmica -> número (regula gasto calórico de termorregulação).
   Frio custa mais caro metabolicamente que quente, em média. */
const TOL_TERMICA_NUM = { tp: 5, qt: 3, fr: 8, eu: 5 };

/* Deriva respiração (não é gene — é leitura de tolHidrica) */
function respiracaoDerivada(g) {
  /* v28 — "brânquias" só existe em animal. Uma planta aquática faz troca
     gasosa por difusão pela superfície; um fungo e uma bactéria idem. */
  if (g.reino === "Ba") return "difusão direta pela membrana";
  if (g.reino === "Pl" || g.reino === "Fu") return g.tolHidrica === "aq" ? "difusão em meio aquático" : "difusão pela superfície";
  if (g.tolHidrica === "aq") return "brânquias";
  if (g.tolHidrica === "sa") return "mista (brânquias/ar)";
  return "ar";
}

/* Peso e calorias — puramente função do genoma, recalculado sempre
   que a espécie é confirmada. Retorna também os intermediários,
   pra exibir no SpeciesViewer e pra validação poder explicar erros. */
/* v32 — DENSIDADE EFETIVA. O gene de densidade dá o tecido "base"; três
   adaptações reais deslocam esse número o suficiente para importar no peso:

     - voo: osso pneumático, sacos aéreos e musculatura oca. Uma ave é
       sensivelmente menos densa que um mamífero do mesmo volume.
     - vida aquática obrigatória: a seleção empurra para flutuabilidade
       neutra, ou seja, para a densidade da própria água. Não é um
       multiplicador — é uma atração em direção a ~1030 kg/m³, que pode
       subir ou descer a densidade conforme o gene.
     - tegumento mineralizado (pedra, metal, cristal) e blindagem pesada:
       concha e placa óssea sobem a densidade média do corpo.

   Sem isso, um pterossauro de 6 m saía com a mesma densidade de um
   rinoceronte, e o peso de qualquer voador ficava impossível de sustentar
   no ar. */
function densidadeEfetiva(g) {
  let d = DENSIDADE_KGM3[g.densidade] ?? 1000;
  const voa = ["V", "P"].includes(g.locPrimario) || (g.asaQtd !== 0 && Number(g.asaFuncionalidade || 0) >= 6);
  if (voa) d *= 0.72;
  if (g.tolHidrica === "aq") d = d * 0.4 + 1030 * 0.6; // puxa para flutuabilidade neutra
  if (["Pd", "Me", "Cn"].includes(g.tegTipo)) d *= 1.18;
  else if (Number(g.defBlindagem || 0) >= 8) d *= 1.08;
  /* Nada de porte grande é mineralizado por inteiro: o tegumento de pedra ou
     metal é casca, não maciço, e a fração de esqueleto/carapaça sobre o
     volume total cai com o tamanho. Sem este teto, um colossal de tegumento
     pétreo saía com densidade de concha em cada centímetro cúbico. */
  if (g.reino === "An") {
    const tetoPorPorte = { gr: 1400, cl: 1250, tt: 1150 };
    const teto = tetoPorPorte[g.porte];
    if (teto) d = Math.min(d, teto);
  }
  return Math.max(120, Math.min(2600, d));
}

function calcularPesoCalorias(g) {
  const alturaM = alturaDePorte(g);
  const densKgM3 = densidadeEfetiva(g);
  const k = fatorForma(g, alturaM);
  const volumeM3 = k * Math.pow(alturaM, 3);
  /* v28 — o piso de 1 grama (`Math.max(0.001, …)`) foi o que impediu o
     modelo de expressar qualquer coisa microscópica: toda bactéria caía
     nele. O piso agora é o de uma massa fisicamente coerente com uma
     única célula. */
  const pesoKg = Math.max(1e-18, volumeM3 * densKgM3);
  const tolNum = TOL_TERMICA_NUM[g.tolTermica] ?? 5;
  // Escala alométrica (lei de Kleiber, ~peso^0.75) em vez de linear:
  // metabolismo real não cresce 1:1 com a massa — animais grandes gastam
  // proporcionalmente MENOS por kg que animais pequenos. 70*peso^0.75 é a
  // constante padrão usada pra mamíferos; o fator por reino (v28) corrige
  // para os outros três, que não seguem a calibração de mamífero.
  const caloriasDia = 70 * Math.pow(pesoKg, 0.75) * (tolNum / 5)
    * multMetabolico(g) * (METABOLISMO_POR_REINO[g.reino] ?? 1);
  return { alturaM, densKgM3, volumeM3, pesoKg, caloriasDia, respiracao: respiracaoDerivada(g) };
}

/* ============================================================
   REGRAS DE COERÊNCIA
   Cada regra: { id, severidade: 'erro'|'aviso', aplica(g)->bool,
   mensagem(g)->string, corrigir(g)-> muta g in-place quando o
   usuário aceita a correção sugerida }.
   'erro' bloqueia a confirmação. 'aviso' aparece mas não bloqueia
   (usado só para o resultado numérico de peso, que é derivado,
   não escolhido diretamente pelo usuário).
   ============================================================ */
const REGRAS_COERENCIA = [
  {
    id: "cranio-presas",
    severidade: "erro",
    aplica: (g) => g.crnFormato === "0" && g.facDenticao !== "0",
    mensagem: () => "Crânio ausente não pode ter dentição definida (presas/dentes exigem estrutura craniana).",
    corrigir: (g) => { g.facDenticao = "0"; },
  },
  {
    id: "cranio-focinho",
    severidade: "erro",
    aplica: (g) => g.crnFormato === "0" && g.facFocinho !== "0",
    mensagem: () => "Crânio ausente não pode ter focinho proeminente.",
    corrigir: (g) => { g.facFocinho = "0"; },
  },
  {
    id: "herbivoro-presas",
    severidade: "erro",
    aplica: (g) => g.dieBase === "hb" && ["cn", "pr"].includes(g.facDenticao),
    mensagem: () => "Herbívoro não pode ter dentição canina ou presas venenosas — use molares/incisivos ou placa moedora.",
    corrigir: (g) => { g.facDenticao = "pl"; },
  },
  {
    id: "aquatico-asas",
    severidade: "erro",
    aplica: (g) => g.tolHidrica === "aq" && g.asaQtd > 0,
    mensagem: () => "Aquático obrigatório (respira por brânquias) não pode ter asas funcionais para voo aéreo sustentado.",
    corrigir: (g) => { g.asaQtd = 0; g.asaTipo = "0"; },
  },
  {
    id: "aquatico-voo",
    severidade: "erro",
    aplica: (g) => g.tolHidrica === "aq" && ["V", "P"].includes(g.locPrimario),
    mensagem: () => "Aquático obrigatório não pode ter locomoção primária de voo/planeio.",
    corrigir: (g) => { g.locPrimario = "N"; },
  },
  {
    /* A regra anterior comparava peso (kg) com altura×5 (m) — grandezas
       diferentes. Consequência medida: para porte "mn" (0,10 m) o limiar
       era 0,5 kg enquanto o peso máximo possível, já com densidade 9, é
       0,35 kg — 100% das espécies minúsculas nasciam com um aviso que
       era matematicamente impossível de resolver, e o botão "ajustar"
       (densidade +2) não mudava nada. A checagem agora olha a densidade
       efetiva em kg/m³, que é o que de fato caracteriza um corpo leve
       demais, e vale igual em qualquer porte. */
    id: "densidade-implausivel",
    severidade: "aviso",
    /* v28 — o limiar era 200 kg/m³ numa escala que começava em 50. Na escala
       nova o degrau 0 já vale 160 kg/m³ (madeira balsa), que é uma densidade
       PLAUSÍVEL para fungo e para planta de crescimento rápido — o aviso
       disparava em todo fungo leve sem nada de errado. Passa a ser um aviso
       só para o reino animal, onde tecido abaixo de 400 kg/m³ realmente
       exigiria corpo oco ou cheio de gás. */
    aplica: (g) => {
      if (g.reino !== "An") return false;
      const dens = DENSIDADE_KGM3[g.densidade] ?? 1000;
      return dens < 400;
    },
    mensagem: (g) => {
      const dens = DENSIDADE_KGM3[g.densidade] ?? 1000;
      const { pesoKg } = calcularPesoCalorias(g);
      return `Densidade corporal de ${dens} kg/m³ (peso ${fmtKg(pesoKg)}) é mais leve que madeira — num animal, só se sustenta em corpo oco, cheio de gás ou de tecido esponjoso. Confirme se é intencional.`;
    },
    corrigir: (g) => { g.densidade = Math.max(g.densidade, 4); },
  },
  {
    id: "colossal-densidade-baixa",
    severidade: "aviso",
    aplica: (g) => ["cl", "tt"].includes(g.porte) && g.densidade <= 1,
    mensagem: (g) => `Porte ${g.porte === "tt" ? "titânico" : "colossal"} com densidade muito baixa (${g.densidade}) produz um corpo praticamente etéreo — confirme se é intencional (ex.: espécie feita de gás/energia).`,
    corrigir: (g) => { g.densidade = 4; },
  },
  {
    // Fase 1, item 4.3 — corrige retroativamente mamíferos já existentes/
    // importados com asa incoerente (a trava em CLASSE_TRAVAS.MAM só
    // previne casos novos gerados dali pra frente).
    id: "asa-pele-incoerente-mamifero",
    severidade: "erro",
    aplica: (g) => g.classe === "MAM" && Number(g.asaQtd) > 0 && g.asaTipo !== "mb",
    mensagem: () => "Mamífero com asa deve ter asa membranosa (tipo morcego) — pelo/couro nu não sustenta pena, élitro ou asa etérea/vegetal.",
    corrigir: (g) => { g.asaTipo = "mb"; },
  },
];

/* Roda todas as regras e devolve issues; usado tanto em tempo real
   (enquanto o usuário edita) quanto no gate final do botão "Confirmar". */
function validarCoerencia(g) {
  const issues = [];
  for (const regra of REGRAS_COERENCIA) {
    if (regra.aplica(g)) {
      issues.push({ id: regra.id, severidade: regra.severidade, mensagem: regra.mensagem(g), corrigir: regra.corrigir });
    }
  }
  return issues;
}

function temErroBloqueante(issues) { return issues.some((i) => i.severidade === "erro"); }

/* Aplica, em lugar, as correções de todos os erros BLOQUEANTES de um
   genoma e renormaliza. Usado pelo motor de deriva (aplicarCicloDeriva) —
   até a v17 a validação só existia no editor manual e no sorteio de
   primordiais, então espécies nascidas por deriva escapavam dela.
   Renormaliza depois de corrigir porque a correção mexe em genes
   condicionantes (ex.: zerar asaQtd deixa asaTipo órfão). Repete no
   máximo 3 vezes: a normalização pode reintroduzir um erro, e sem teto
   isso vira laço infinito. Devolve quantas rodadas foram necessárias. */
function aplicarCorrecoesAutomaticas(g) {
  let rodadas = 0;
  for (let i = 0; i < 3; i++) {
    const bloqueantes = validarCoerencia(g).filter((x) => x.severidade === "erro");
    if (!bloqueantes.length) break;
    for (const issue of bloqueantes) issue.corrigir(g);
    const limpo = normalizarGenoma(g, g.isPrimordial);
    Object.assign(g, limpo);
    rodadas++;
  }
  return rodadas;
}
