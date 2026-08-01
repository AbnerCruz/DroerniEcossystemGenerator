/* ============================================================
   BLOCO 2 — PESO, CALORIAS E VALIDAÇÃO DE COERÊNCIA (v17)
   Camada NOVA, puramente derivada dos genes já existentes —
   não consome dígitos de seed, não altera o motor DRN2 original.
   ============================================================ */

/* Altura de referência (m) por porte — escala não-linear, cada
   degrau ~3x o anterior. "tt" (titânico) chega a ~45m. */
const ALTURA_POR_PORTE = { mn: 0.10, pq: 0.60, md: 1.80, gr: 6.00, cl: 18.00, tt: 45.00 };

/* Densidade (0-9, escalar já existente no genoma) -> kg/m³ real.
   0 = quase-gasoso/etéreo, 9 = pétreo/metálico denso. */
const DENSIDADE_KGM3 = [50, 200, 400, 600, 800, 1000, 1300, 1800, 3000, 7000];

/* Fator de forma (corrige volume ~ esfera/elipsoide genérico para
   silhuetas mais alongadas ou mais compactas). Não é um gene novo,
   só um ajuste de leitura sobre locPrimario/morTorso existentes. */
function fatorForma(g) {
  if (["S", "Z"].includes(g.locPrimario)) return 0.02; // serpentiforme/fásico: corpo fino e longo
  if (g.morTorso === "se") return 0.025; // torso serpentino
  if (g.morTorso === "al") return 0.035; // alongado
  if (g.morTorso === "co") return 0.07;  // compacto
  return 0.05; // proporcional — padrão
}

/* Multiplicador metabólico por dieta — dita o quanto a "caloria" do
   peso*30 realmente se aplica (fotossintéticos/não-alimentares comem
   ínfimo ou nada). */
const METABOLISMO_POR_DIETA = { ft: 0.05, qm: 0.05, ni: 0, au: 0.3 };
function multMetabolico(g) { return METABOLISMO_POR_DIETA[g.dieBase] ?? 1; }

/* Tolerância térmica -> número (regula gasto calórico de termorregulação).
   Frio custa mais caro metabolicamente que quente, em média. */
const TOL_TERMICA_NUM = { tp: 5, qt: 3, fr: 8, eu: 5 };

/* Deriva respiração (não é gene — é leitura de tolHidrica) */
function respiracaoDerivada(g) {
  if (g.tolHidrica === "aq") return "brânquias";
  if (g.tolHidrica === "sa") return "mista (brânquias/ar)";
  return "ar";
}

/* Peso e calorias — puramente função do genoma, recalculado sempre
   que a espécie é confirmada. Retorna também os intermediários,
   pra exibir no SpeciesViewer e pra validação poder explicar erros. */
function calcularPesoCalorias(g) {
  const alturaM = ALTURA_POR_PORTE[g.porte] ?? 1.8;
  const densKgM3 = DENSIDADE_KGM3[g.densidade] ?? 1000;
  const k = fatorForma(g);
  const volumeM3 = k * Math.pow(alturaM, 3);
  const pesoKg = Math.max(0.001, volumeM3 * densKgM3);
  const tolNum = TOL_TERMICA_NUM[g.tolTermica] ?? 5;
  // Escala alométrica (lei de Kleiber, ~peso^0.75) em vez de linear:
  // metabolismo real não cresce 1:1 com a massa — animais grandes gastam
  // proporcionalmente MENOS por kg que animais pequenos. 70*peso^0.75 é a
  // constante padrão usada pra mamíferos; mantemos como base universal.
  const caloriasDia = 70 * Math.pow(pesoKg, 0.75) * (tolNum / 5) * multMetabolico(g);
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
    id: "peso-extremo-baixo",
    severidade: "aviso",
    aplica: (g) => {
      const { pesoKg, alturaM } = calcularPesoCalorias(g);
      return pesoKg < alturaM * 5; // abaixo disso, mais leve que isopor pro tamanho
    },
    mensagem: (g) => {
      const { pesoKg } = calcularPesoCalorias(g);
      return `Peso resultante (${pesoKg.toFixed(1)}kg) muito baixo pro porte "${g.porte}" — considere aumentar a densidade.`;
    },
    corrigir: (g) => { g.densidade = Math.min(9, g.densidade + 2); },
  },
  {
    id: "colossal-densidade-baixa",
    severidade: "aviso",
    aplica: (g) => ["cl", "tt"].includes(g.porte) && g.densidade <= 1,
    mensagem: (g) => `Porte ${g.porte === "tt" ? "titânico" : "colossal"} com densidade muito baixa (${g.densidade}) produz um corpo praticamente etéreo — confirme se é intencional (ex.: espécie feita de gás/energia).`,
    corrigir: (g) => { g.densidade = 4; },
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
