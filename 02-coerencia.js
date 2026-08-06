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

const ALTURA_POR_PORTE_REINO = {
  /* Animal — do menor artrópode a algo bem acima da baleia-azul.
     mn 2cm (inseto) · pq 25cm (rato/pardal) · md 1,7m (humano/lobo)
     gr 4,5m (elefante/girafa) · cl 10m (sauropode) · tt 24m (fantasia) */
  An: { mn: 0.02, pq: 0.25, md: 1.7, gr: 4.5, cl: 10.0, tt: 24.0 },
  /* Planta — do musgo à sequoia, com o topo em escala de fantasia.
     mn 2cm (musgo) · pq 40cm (herbácea) · md 3m (arbusto/bambu)
     gr 20m (árvore) · cl 90m (sequoia, o limite hidráulico real) */
  Pl: { mn: 0.02, pq: 0.40, md: 3.0, gr: 20.0, cl: 90.0, tt: 150.0 },
  /* Fungo — do bolor ao maior corpo de frutificação conhecido.
     mn 2mm (bolor) · pq 6cm (cogumelo comum) · md 30cm (políporo)
     gr 1,5m (Phellinus gigante) · cl 4m (fantasia) */
  Fu: { mn: 0.002, pq: 0.06, md: 0.30, gr: 1.5, cl: 4.0, tt: 8.0 },
  /* Bactéria — micrômetros. mn 0,2µm (Mycoplasma, o menor conhecido)
     pq 5µm (bacilo típico). Os degraus acima estão travados no motor
     (v28: portePorReino restringe Ba a mn/pq), mas ficam definidos aqui
     para o caso de a deriva levar uma bactéria a um porte maior — a
     Thiomargarita namibiensis chega a 0,75mm de verdade. */
  Ba: { mn: 0.0000002, pq: 0.000005, md: 0.00005, gr: 0.00075, cl: 0.002, tt: 0.005 },
};
/* Fallback: se um reino novo aparecer, usa a régua animal. */
const ALTURA_POR_PORTE = ALTURA_POR_PORTE_REINO.An;

function alturaDePorte(g) {
  const tabela = ALTURA_POR_PORTE_REINO[g.reino] || ALTURA_POR_PORTE;
  return tabela[g.porte] ?? tabela.md;
}

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
  if (["S", "Z"].includes(g.locPrimario)) return 0.006; // serpentiforme/fásico: corpo fino e longo
  if (g.morTorso === "se") return 0.008;  // torso serpentino
  if (g.morTorso === "al") return 0.012;  // alongado
  if (g.morTorso === "co") return 0.026;  // compacto
  return 0.018; // proporcional — padrão
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
function calcularPesoCalorias(g) {
  const alturaM = alturaDePorte(g);
  const densKgM3 = DENSIDADE_KGM3[g.densidade] ?? 1000;
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
