/* ============================================================
   v35 — CAMPOS EDITÁVEIS, EXPANDIDOS E AGRUPADOS
   ============================================================
   Relato: "a área de montar o DNA não me permite montar precisamente.
   Formato, número de membros, etc. Quanto mais editável for o aplicativo
   melhor. Com o sistema de travas sempre ativo para manter a coerência."

   Até a v34 só 12 genes eram editáveis aqui — o resto sempre foi sorteado.
   Isso não era limitação técnica: o motor já aceita QUALQUER gene como
   override manual (é assim que a deriva, a busca por DNA-alvo e a
   reconstrução por seed funcionam). A lista curta era só a UI não
   oferecendo os controles.

   Esta versão expõe todos os genes que fazem sentido editar à mão — cerca
   de 45, contra 12 — organizados em grupos temáticos e colapsáveis, para
   que a tela não vire uma parede única em celular. Cada grupo abre por
   padrão só se tiver algum campo aplicável ao reino/classe atual.

   SOBRE AS TRAVAS: nenhuma delas foi relaxada. `tabela(g)` decide se o
   campo aparece (ex.: "Glândula mamária" só para classe MAM); o valor
   ESCOLHIDO continua passando pelo mesmo `categoricalStep`/`scalarStep`
   que a geração aleatória usa, com as mesmas restrições de reino/classe.
   Se o usuário fixar um valor que deixou de ser válido depois de outra
   escolha (ex.: fixar 6 membros superiores e depois trocar para Molusco,
   que exige memSup="0S"), a normalização reescreve esse campo — o sistema
   nunca entra em estado incoerente, só avisa via `validarCoerencia` quando
   a correção automática não é suficiente.

   Campos ESCALARES (0-9) usam slider; os limites (`limitesEscalar`) já
   variam por reino, então o slider em si muda de faixa conforme o
   contexto — outra trava em ação, visível.
   ============================================================ */
const GRUPOS_CAMPOS_EDITAVEIS = [
  {
    titulo: "Taxonomia",
    campos: [
      { chave: "reino", label: "Reino", tabela: () => T.reino },
      { chave: "classe", label: "Classe (só p/ Animal)", tabela: (g) => (g.reino === "An" ? T.classeAn : null) },
      { chave: "mag", label: "Nível de magia", tabela: (g) => (g.isPrimordial ? T.mag.filter((r) => Number(String(r.value).slice(1)) <= 3) : T.mag) },
    ],
  },
  {
    titulo: "Morfologia geral",
    campos: [
      { chave: "porte", label: "Porte", tabela: () => T.porte },
      { chave: "simetria", label: "Simetria", tabela: () => T.simetria },
      { chave: "densidade", label: "Densidade corporal", tipo: "scalar", limites: (g) => limitesEscalar(g, "densidade") },
      { chave: "morForma", label: "Forma de crescimento", tabela: (g) => (g.reino === "Pl" ? T.morFormaPl : g.reino === "Fu" ? T.morFormaFu : g.reino === "Ba" ? T.morFormaBa : null) },
      { chave: "morTorso", label: "Proporção de tronco", tabela: (g) => (g.reino === "An" ? T.morTorso : null) },
    ],
  },
  {
    titulo: "Locomoção e membros",
    campos: [
      { chave: "locPrimario", label: "Locomoção primária", tabela: () => T.locPrim },
      { chave: "locSecundario", label: "Locomoção secundária", tabela: () => T.locSec },
      { chave: "locVelocidade", label: "Velocidade", tipo: "scalar", limites: (g) => limitesEscalar(g, "locVelocidade") },
      /* memInf não entra aqui: é DERIVADO de locPrimario (bípede => 2, quadrúpede
         => 4 …) na maioria das classes, e um override nele seria sobrescrito
         de volta pelo motor a cada normalização. Quem quer controlar o número
         de pernas controla via locPrimario — é o gene que de fato decide. */
      { chave: "memSup", label: "Membros superiores", tabela: (g) => T.memSup },
      { chave: "memTerm", label: "Terminação dos membros", tabela: () => T.memTerm },
      { chave: "memProp", label: "Proporção dos membros", tabela: () => T.memProp },
      { chave: "asaQtd", label: "Asas (quantidade)", tabela: () => T.asaQtd },
      { chave: "asaTipo", label: "Tipo de asa", tabela: (g) => (g.asaQtd ? T.asaTipo : null) },
      { chave: "cdaComp", label: "Comprimento da cauda", tabela: (g) => (g.reino === "An" ? T.cdaComp : null) },
      { chave: "cdaTipo", label: "Tipo de cauda", tabela: (g) => (g.reino === "An" && g.cdaComp && g.cdaComp !== "0" ? T.cdaTipo : null) },
    ],
  },
  {
    titulo: "Crânio e face",
    campos: [
      { chave: "crnFormato", label: "Formato do crânio", tabela: (g) => (g.reino === "An" ? T.crnFormato : null) },
      { chave: "crnPescoco", label: "Pescoço", tabela: (g) => (g.reino === "An" ? T.crnPescoco : null) },
      { chave: "crnChifreQtd", label: "Chifres (quantidade)", tabela: (g) => (g.reino === "An" ? T.crnChifreQtd : null) },
      { chave: "crnChifreForma", label: "Formato do chifre", tabela: (g) => (g.reino === "An" && g.crnChifreQtd && g.crnChifreQtd !== "0" ? T.crnChifreForma : null) },
      { chave: "crnCrista", label: "Crista", tabela: (g) => (g.reino === "An" ? T.crnCrista : null) },
      { chave: "facFocinho", label: "Focinho", tabela: (g) => (g.reino === "An" ? T.facFocinho : null) },
      { chave: "facOrelha", label: "Orelha", tabela: (g) => (g.reino === "An" ? T.facOrelha : null) },
      { chave: "facOlhosQtd", label: "Olhos (quantidade)", tabela: (g) => (g.reino === "An" ? T.facOlhosQtd : null) },
      { chave: "facOlhosTipo", label: "Tipo de olho", tabela: (g) => (g.reino === "An" && g.facOlhosQtd ? T.facOlhosTipo : null) },
      { chave: "facDenticao", label: "Dentição", tabela: (g) => (g.reino === "An" ? T.facDenticao : null) },
    ],
  },
  {
    titulo: "Tegumento",
    campos: [
      { chave: "tegTipo", label: "Tipo de tegumento", tabela: () => T.tegTipo },
      { chave: "tegCor", label: "Cor", tabela: () => T.tegCor },
      { chave: "tegCorIntensidade", label: "Intensidade da cor", tipo: "scalar", limites: () => ({}) },
      { chave: "tegPadrao", label: "Padrão", tabela: () => T.tegPadrao },
      { chave: "tegResistencia", label: "Resistência", tipo: "scalar", limites: () => ({}) },
    ],
  },
  {
    titulo: "Dieta e reprodução",
    campos: [
      { chave: "dieBase", label: "Dieta", tabela: (g) => (g.reino === "Ba" ? T.dieBase.filter((r) => ["de", "qm", "ft"].includes(r.value)) : T.dieBase) },
      { chave: "dieRestricao", label: "Restrição alimentar", tabela: () => T.dieRestricao },
      { chave: "dieFrequencia", label: "Frequência alimentar", tipo: "scalar", limites: () => ({}) },
      { chave: "repModo", label: "Modo de reprodução", tabela: () => T.repModo },
      { chave: "repProle", label: "Tamanho da prole", tipo: "scalar", limites: () => ({}) },
      { chave: "repMaturacao", label: "Maturação (velocidade)", tipo: "scalar", limites: () => ({}) },
      { chave: "repLongevidade", label: "Longevidade", tipo: "scalar", limites: () => ({}) },
    ],
  },
  {
    titulo: "Sentidos e defesa",
    campos: [
      { chave: "senVisao", label: "Visão", tipo: "scalar", limites: (g) => limitesEscalar(g, "senVisao") },
      { chave: "senOlfato", label: "Olfato", tipo: "scalar", limites: (g) => limitesEscalar(g, "senOlfato") },
      { chave: "senAudicao", label: "Audição", tipo: "scalar", limites: (g) => limitesEscalar(g, "senAudicao") },
      { chave: "senTato", label: "Tato", tipo: "scalar", limites: () => ({}) },
      { chave: "senEspecial", label: "Sentido especial", tabela: () => T.senEspecial },
      { chave: "senEspecialIntensidade", label: "Intensidade do sentido especial", tipo: "scalar", limites: (g) => (g.senEspecial && g.senEspecial !== "0" ? {} : { min: 0, max: 0 }) },
      { chave: "defArma", label: "Arma", tabela: () => T.defArma },
      { chave: "defBlindagem", label: "Blindagem", tipo: "scalar", limites: () => ({}) },
      { chave: "defEstrategia", label: "Estratégia de defesa", tabela: () => T.defEstrategia },
    ],
  },
  {
    titulo: "Social e tolerância",
    campos: [
      { chave: "socEstrutura", label: "Estrutura social", tabela: () => T.socEstrutura },
      { chave: "socAgressividade", label: "Agressividade", tipo: "scalar", limites: () => ({}) },
      { chave: "socSencienciaBruta", label: "Cognição", tipo: "scalar", limites: () => ({}) },
      { chave: "tolHidrica", label: "Tolerância hídrica", tabela: () => T.tolHidrica },
      { chave: "tolTermica", label: "Tolerância térmica", tabela: () => T.tolTermica },
      { chave: "tolCiclo", label: "Ciclo de atividade", tabela: () => T.tolCiclo },
    ],
  },
  /* v35 — GENES POR TÁXON. Cada grupo só faz sentido (e só aparece) para
     o reino/classe que ele descreve — a mesma condição de GENE_TAXON_APLICAVEL
     no motor (01-core-motor.js), repetida aqui do lado da UI porque a UI
     decide o que MOSTRAR e o motor decide o que VALE; as duas precisam
     concordar, senão o campo aparece para uma espécie que não pode tê-lo. */
  {
    titulo: "Mamífero",
    aplicavel: (g) => g.classe === "MAM",
    campos: [
      { chave: "glandulaMamaria", label: "Glândula mamária", tabela: () => T.glandulaMamaria },
      { chave: "dentesTipo", label: "Tipo de dentição", tabela: () => T.dentesTipo },
      { chave: "termorregulacao", label: "Termorregulação", tabela: () => T.termorregulacao },
      { chave: "gestacao", label: "Gestação", tabela: () => T.gestacao },
    ],
  },
  {
    titulo: "Ave",
    aplicavel: (g) => g.classe === "AVE",
    campos: [
      { chave: "bicoFormato", label: "Formato do bico", tabela: () => T.bicoFormato },
      { chave: "penaFuncao", label: "Função da penugem", tabela: () => T.penaFuncao },
      { chave: "migratorio", label: "Padrão migratório", tabela: () => T.migratorio },
    ],
  },
  {
    titulo: "Réptil",
    aplicavel: (g) => g.classe === "REP",
    campos: [
      { chave: "escamaTipo", label: "Tipo de escama", tabela: () => T.escamaTipo },
      { chave: "venenoAparato", label: "Aparato de veneno", tabela: () => T.venenoAparato },
      { chave: "regeneracaoCauda", label: "Regeneração de cauda", tabela: () => T.regeneracaoCauda },
    ],
  },
  {
    titulo: "Anfíbio",
    aplicavel: (g) => g.classe === "AMP",
    campos: [
      { chave: "metamorfose", label: "Metamorfose", tabela: () => T.metamorfose },
      { chave: "peleToxinas", label: "Toxinas na pele", tabela: () => T.peleToxinas },
    ],
  },
  {
    titulo: "Peixe",
    aplicavel: (g) => g.classe === "PSC",
    campos: [
      { chave: "nadadeiraConfiguracao", label: "Configuração de nadadeira", tabela: () => T.nadadeiraConfiguracao },
      { chave: "bexigaNatatoria", label: "Bexiga natatória", tabela: () => T.bexigaNatatoria },
    ],
  },
  {
    titulo: "Inseto / artrópode",
    aplicavel: (g) => g.classe === "INS",
    campos: [
      { chave: "metamorfoseTipo", label: "Tipo de metamorfose", tabela: () => T.metamorfoseTipo },
      { chave: "patasQtdEspecializada", label: "Especialização das patas", tabela: () => T.patasQtdEspecializada },
      { chave: "venenoOuFerroao", label: "Veneno ou ferrão", tabela: () => T.venenoOuFerroao },
      { chave: "coloniaTipo", label: "Estrutura de colônia", tabela: () => T.coloniaTipo },
    ],
  },
  {
    titulo: "Molusco",
    aplicavel: (g) => g.classe === "MOL",
    campos: [
      { chave: "concha", label: "Concha", tabela: () => T.concha },
      { chave: "tentaculosQtd", label: "Tentáculos", tabela: () => T.tentaculosQtd },
      { chave: "tintaDefensiva", label: "Tinta defensiva", tabela: () => T.tintaDefensiva },
    ],
  },
  {
    titulo: "Planta",
    aplicavel: (g) => g.reino === "Pl",
    campos: [
      { chave: "raizTipo", label: "Tipo de raiz", tabela: () => T.raizTipo },
      { chave: "folhaTipo", label: "Tipo de folha", tabela: () => T.folhaTipo },
      { chave: "reproducaoEstrutura", label: "Estrutura reprodutiva", tabela: () => T.reproducaoEstrutura },
    ],
  },
  {
    titulo: "Fungo",
    aplicavel: (g) => g.reino === "Fu",
    campos: [
      { chave: "corpoFrutiferoTipo", label: "Corpo frutífero", tabela: () => T.corpoFrutiferoTipo },
      { chave: "esporoDispersao", label: "Dispersão de esporos", tabela: () => T.esporoDispersao },
    ],
  },
  {
    titulo: "Bactéria",
    aplicavel: (g) => g.reino === "Ba",
    campos: [
      { chave: "paredeCelularTipo", label: "Parede celular", tabela: () => T.paredeCelularTipo },
      { chave: "metabolismoTipo", label: "Metabolismo", tabela: () => T.metabolismoTipo },
      { chave: "formaColonia", label: "Forma de colônia", tabela: () => T.formaColonia },
    ],
  },
];

/* Achatada, para quem só precisa iterar todos os campos (ex.: nada hoje,
   mantida por compatibilidade e clareza — GRUPOS_CAMPOS_EDITAVEIS é a fonte
   de verdade). */
const CAMPOS_EDITAVEIS = GRUPOS_CAMPOS_EDITAVEIS.flatMap((gr) => gr.campos);

/* ------------------------------------------------------------
   v36 — OPÇÕES INVÁLIDAS FICAM DESABILITADAS, NÃO SILENCIOSAMENTE
   REJEITADAS.

   Pedido: "se por acaso for por inconsistência é só não permitir a
   seleção." Antes desta versão, escolher uma opção incoerente com o resto
   do genoma era ACEITA pelo clique e revertida em silêncio pela trava —
   o usuário via o campo "não pegar" sem entender por quê.

   Esta função não reimplementa nenhuma trava: ela RODA o motor de verdade
   (a mesma `normalizarGenoma` usada para aplicar a edição) uma vez por
   opção da tabela, com o resto do genoma atual como contexto, e verifica
   se o valor pedido sobreviveu. Reimplementar as regras à parte correria o
   risco de divergir da trava real assim que o motor mudasse — rodar o
   motor de verdade elimina esse risco por construção, ao custo de uma
   chamada extra ao motor por opção (~0,2ms cada; medido: uma tabela de 14
   linhas custa ~3ms, imperceptível). Só é calculada para o grupo ABERTO na
   tela — grupos recolhidos não pagam esse custo. */
function opcoesValidasParaCampo(g, campo, isPrimordial) {
  const tabela = campo.tabela(g);
  if (!tabela) return null;
  const base = { ...g };
  delete base[campo.chave];
  const validos = new Set();
  for (const row of tabela) {
    const teste = normalizarGenoma({ ...base, [campo.chave]: row.value }, isPrimordial);
    if (String(teste[campo.chave]) === String(row.value)) validos.add(String(row.value));
  }
  return validos;
}

/* ------------------------------------------------------------
   Renderiza um grupo de campos editáveis (select ou slider), com
   cabeçalho colapsável. Compartilhado pelo editor de espécie e pelo
   montador — um único lugar para a UI de campo a campo. `g` é o genoma
   atual (decide quais campos do grupo se aplicam); `setCampo` recebe
   (chave, valor). Grupos sem nenhum campo aplicável não renderizam nada.
   ------------------------------------------------------------ */

/* ------------------------------------------------------------
   v37 — SLIDER QUE CONFIRMA AO SOLTAR, NÃO A CADA PIXEL
   ------------------------------------------------------------
   Relato: "percebi um bug nos sliders na construção manual do dna, ao
   mexer os sliders às vezes resorteia uma configuração."

   Duas causas somadas, e as duas precisam de correção — arrumar só uma
   deixa o sintoma vivo:

   1) `normalizarGenoma` RESSORTEIA os genes que a edição invalidou. Correto
      como comportamento, aleatório como implementação. Resolvido no motor
      por `normalizarGenomaEstavel` (mesma edição -> mesmo resultado).

   2) `<input type="range">` dispara `onChange` em TODO valor intermediário
      do arrasto. Ir de 3 a 7 disparava cinco edições, cinco normalizações e
      cinco cascatas de trava — cada uma partindo do resultado da anterior,
      não do genoma original. Mesmo com sorteio determinístico, o caminho
      percorrido importava: chegar em 7 arrastando dava um genoma diferente
      de chegar em 7 direto, e voltar para 3 não devolvia o ponto de
      partida.

   O slider passa a ter valor LOCAL durante o arrasto (a tela responde na
   hora, sem travamento) e só confirma no motor quando o dedo solta —
   `onPointerUp`/`onTouchEnd`/`onMouseUp` para o arrasto, `onKeyUp` para
   teclado, `onBlur` como rede de segurança. Uma edição por gesto, em vez
   de uma por pixel: além de acabar com o embaralhamento, corta o custo de
   `opcoesValidasParaCampo` (que roda o motor uma vez por opção) na mesma
   proporção.

   O `useEffect` ressincroniza o valor local quando o genoma muda por fora
   (outro campo editado, resorteio, DNA colado) — sem ele, o slider ficaria
   exibindo o valor antigo depois que uma trava mexesse no gene. */
function SliderGene({ campo, min, max, valor, setCampo }) {
  const [local, setLocal] = useState(valor);
  const arrastando = useRef(false);
  useEffect(() => { if (!arrastando.current) setLocal(valor); }, [valor]);

  const confirmar = () => {
    arrastando.current = false;
    if (Number(local) !== Number(valor)) setCampo(campo.chave, Number(local));
  };

  if (min === max) {
    return (
      <div>
        <label className="text-[10px] uppercase text-stone-500 font-mono truncate block">{campo.label}</label>
        <div className="text-center text-xs text-stone-600 font-data py-1.5">— (fixo em {min})</div>
      </div>
    );
  }
  const mostrado = Math.min(max, Math.max(min, Number(local)));
  return (
    <div>
      <label className="text-[10px] uppercase text-stone-500 font-mono truncate block">{campo.label}</label>
      <input type="range" min={min} max={max} value={mostrado}
        onChange={(e) => { arrastando.current = true; setLocal(Number(e.target.value)); }}
        onPointerUp={confirmar} onTouchEnd={confirmar} onMouseUp={confirmar}
        onKeyUp={confirmar} onBlur={confirmar}
        className="w-full accent-emerald-600" />
      <div className={`text-center text-xs font-data ${mostrado !== valor ? "text-amber-500" : "text-stone-400"}`}>
        {mostrado}{mostrado !== valor ? " · solte para aplicar" : ""}
      </div>
    </div>
  );
}

function GrupoCamposEditaveis({ grupo, g, setCampo, abertoPadrao, isPrimordial }) {
  const [aberto, setAberto] = useState(abertoPadrao);
  if (grupo.aplicavel && !grupo.aplicavel(g)) return null;
  const camposVisiveis = grupo.campos.filter((c) => {
    if (c.tipo === "scalar") return true;
    const t = c.tabela(g);
    return !!t;
  });
  if (!camposVisiveis.length) return null;
  return (
    <div className="border border-stone-800 rounded">
      <button onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between px-2.5 py-2 text-left">
        <span className="text-[10px] uppercase tracking-widest text-stone-400 font-mono">{grupo.titulo}</span>
        {aberto ? <ChevronDown size={12} className="text-stone-600" /> : <ChevronRight size={12} className="text-stone-600" />}
      </button>
      {aberto && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 pt-0">
          {camposVisiveis.map((campo) => {
            if (campo.tipo === "scalar") {
              const lim = campo.limites ? campo.limites(g) : {};
              const min = lim.min ?? 0, max = lim.max ?? 9;
              const valor = Math.min(max, Math.max(min, Number(g[campo.chave] ?? min)));
              return (
                <SliderGene key={campo.chave} campo={campo} min={min} max={max}
                  valor={valor} setCampo={setCampo} />
              );
            }
            const tabela = campo.tabela(g);
            /* Só calcula para o que está de fato na tela (grupo aberto) —
               ver comentário de opcoesValidasParaCampo acima. */
            const validos = opcoesValidasParaCampo(g, campo, isPrimordial);
            return (
              <div key={campo.chave}>
                <label className="text-[10px] uppercase text-stone-500 font-mono truncate block">{campo.label}</label>
                <select value={g[campo.chave]} onChange={(e) => setCampo(campo.chave, isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}
                  className="bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-xs text-stone-200 w-full">
                  {tabela.map((row) => {
                    const valido = !validos || validos.has(String(row.value));
                    return (
                      <option key={String(row.value)} value={row.value} disabled={!valido}>
                        {row.label}{!valido ? " — indisponível agora" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Lista completa dos grupos, na ordem definida acima. `overridesAtivos` é
   o conjunto de chaves com valor manual fixado nesta sessão — usado só
   para decidir quais grupos abrem por padrão (o que já tem algo fixado
   fica visível de cara; o resto começa recolhido, pra não virar parede). */
function ListaGruposEditaveis({ g, setCampo, overridesAtivos, isPrimordial }) {
  return (
    <div className="space-y-1.5">
      {GRUPOS_CAMPOS_EDITAVEIS.map((grupo, i) => (
        <GrupoCamposEditaveis
          key={grupo.titulo}
          grupo={grupo}
          g={g}
          setCampo={setCampo}
          isPrimordial={isPrimordial}
          abertoPadrao={i < 3 || grupo.campos.some((c) => overridesAtivos?.has(c.chave))}
        />
      ))}
    </div>
  );
}

/* Fase 2, item 5.4 — edição manual de espécie já viva deixou de sobrescrever
   o nó existente in-place (alteração de DNA em vida, incoerente) e passa a
   ser uma ESPECIAÇÃO MANUAL: cria um nó filho novo a partir do genoma
   editado, preservando o nó-mãe original intacto — mesmo padrão de
   especiar() (Fase 2 do motor), mas com os genes escolhidos manualmente em
   vez de mutação por pressão evolutiva. */
function commitEspeciacaoManualFromGenome(mae, g, auInicial, massaId) {
  const g2 = { ...g, isPrimordial: false };
  const id = novoId();
  const segs = segsDoFilho(mae); // v34 — antes do push em mae.filhos
  const novoLinhagemId = fmtLinhagem(segs);
  const auFilha = Math.max(mae.auSurgimento + 1e-6, auInicial ?? mae.auSurgimento);
  const filho = {
    id, linhagemSegs: segs, linhagemId: novoLinhagemId, g: g2, code: serialize(g2), auSurgimento: auFilha,
    pais: [mae.id], filhos: [], primordialId: mae.primordialId, ordem: 0,
    ciclosDecorridos: 0, orcamento: 0, acumEstratoII: new Set(), historico: [],
    isPrimordial: false, extinta: false, massaId: massaId || mae.massaId || null,
    origemEdicaoManual: true,
  };
  mae.filhos.push(id);
  emitirEvento({
    tipo: "especiacao-manual", tipoLabel: "ESPECIAÇÃO MANUAL", speciesId: id, linhagemId: novoLinhagemId,
    maeId: mae.id, maeLinhagem: mae.linhagemId, primordialId: filho.primordialId, primordialLinhagem: mae.primordialLinhagem || mae.linhagemId,
    auSurgimento: filho.auSurgimento,
    texto: `${novoLinhagemId} especia manualmente a partir de ${mae.linhagemId} (edição dirigida pelo usuário). Surge em ${auTextoLog(filho.auSurgimento)}.`,
    code: filho.code, codeAntes: mae.code,
  });
  return filho;
}

/* Constrói um primordial a partir de um genoma JÁ ROLADO (preview),
   sem re-sortear — garante que "Confirmar" salva exatamente o que
   foi mostrado na pré-visualização. */
function commitPrimordialFromGenome(g, auInicial, massaId) {
  const code = serialize(g);
  const id = novoId();
  const segs = proximoPrimordialSegs(); // v34 — endereço de linhagem
  const node = {
    id, g, code, auSurgimento: auInicial ?? 0,
    linhagemSegs: segs, linhagemId: fmtLinhagem(segs),
    pais: [], filhos: [], primordialId: id, ordem: 0, ciclosDecorridos: 0,
    orcamento: 0, acumEstratoII: new Set(), historico: [], isPrimordial: true,
    extinta: false, massaId: massaId || null,
  };
  emitirEvento({
    tipo: "primordial", tipoLabel: "PRIMORDIAL SURGE", speciesId: id, linhagemId: node.linhagemId,
    primordialId: id, primordialLinhagem: node.linhagemId, auSurgimento: node.auSurgimento,
    texto: `Espécie primordial ${node.linhagemId} (${REINO_LABEL_LOG[g.reino] || g.reino}) surge em ${auTextoLog(node.auSurgimento)}, sem ancestral.`,
    code,
  });
  return node;
}

/* ============================================================
   EDITOR DE ESPÉCIE — usado tanto pra criar primordial (modo
   'criar') quanto pra editar uma existente (modo 'editar').
   Unificado: baseManual = genoma anterior (editar) ou {} (criar);
   overrides = campos que o usuário tocou; a cada mudança o motor
   inteiro roda de novo sobre {...baseManual, ...overrides} — as
   travas de classe resolvem sozinhas o que ficou incompatível
   (ex.: mudar reino pra Planta descarta dentição/crânio antigos).
   ============================================================ */
function SpeciesEditor({ modo, node, eraAtual, onSalvar, onCancelar }) {
  const baseManual = modo === "editar" ? { ...node.g } : {};
  // Fase 2, item 5.4 — editar sempre resulta numa especiação manual (nó
  // filho novo, nunca primordial), então a pré-visualização já roda sob as
  // travas de NÃO-primordial, para não mostrar um preview que passa nas
  // travas de primordial (ex.: magia A0-A3) e falhar ao normalizar como filho.
  const isPrimordial = modo === "criar";
  const [overrides, setOverrides] = useState({});
  const [g, setG] = useState(() => buildSpecies(null, baseManual, isPrimordial, false).g);
  const [auInicial, setAuInicial] = useState(modo === "criar" ? "0" : String(node.auSurgimento));
  const [massaId, setMassaId] = useState(modo === "criar" ? (eraAtual.massas[0]?.id || "") : node.massaId);
  const [trilhaImportar, setTrilhaImportar] = useState(""); // Fase 4, item 7.3 — só usado em modo "criar"

  /* v36 — DUAS SEMÂNTICAS DE RECÁLCULO, ANTES CONFUNDIDAS NUMA SÓ.

     Relato: "eu clico na opção e fica resorteando as configurações e
     portanto perco as configurações anteriores que coloquei."

     Diagnóstico: `recalcular` chamava `buildSpecies` do ZERO a cada clique,
     com manual = só os overrides explícitos. Todo gene que o usuário não
     tinha fixado — inclusive os que ele via na tela, só não tinha marcado
     como override — era resortado de novo, com `Math.random()` novo, em
     TODO clique. Não era só o campo clicado: a tela inteira embaralhava.

     A correção usa `normalizarGenoma`, que já existe no motor com
     exatamente esta semântica (documentada lá: "cada gene mantém seu valor
     atual sempre que ainda for uma opção válida... é recalculado só quando
     deixou de ser válido" — o "modo dirigido" da Estação DRN2). Editar um
     campo agora parte do que JÁ ESTÁ NA TELA (`g`), não do zero: só o campo
     tocado muda de propósito; o resto permanece, e só é recalculado se a
     mudança o tornou de fato incoerente.

     "Sortear tudo" e "Resortear não-fixados" continuam com a semântica
     antiga — eles EXISTEM para embaralhar, então usam `buildSpecies` do
     zero mesmo. */
  /* v37 — DUAS CORREÇÕES SOBRE A DA v36.

     (a) `normalizarGenomaEstavel` no lugar de `normalizarGenoma`. A v36
     acertou em partir do genoma da tela, mas o RESSORTEIO dos genes que a
     edição invalida continuava usando `Math.random()` — então a mesma
     edição, repetida, dava resultados diferentes. Num <select> isso passa
     quase despercebido (um clique, um resultado); num SLIDER não, porque
     arrastar dispara uma edição por valor intermediário e cada uma
     resorteia de novo. Era o relato: "ao mexer os sliders às vezes
     resorteia uma configuração". Com a normalização estável, a mesma
     edição sobre o mesmo genoma dá sempre o mesmo resultado, e arrastar de
     volta devolve exatamente a configuração anterior.

     (b) A edição aplica SÓ o campo tocado, e não o mapa inteiro de
     overrides por cima do genoma atual. Reaplicar overrides antigos a cada
     clique ressuscitava valores que uma trava já tinha revertido, e a
     cascata resultante mudava campos que o usuário não tocou. O mapa de
     overrides continua existindo — ele registra o que foi fixado à mão,
     que é o que o resorteio precisa preservar —, só deixou de ser
     reaplicado a cada edição. */
  const aplicarEdicao = (chave, valor) => {
    setG((atual) => normalizarGenomaEstavel({ ...atual, [chave]: valor }, isPrimordial));
  };
  const resortear = (novosOverrides) => {
    const manual = { ...baseManual, ...novosOverrides };
    const built = buildSpecies(null, manual, isPrimordial, false);
    setG(built.g);
  };
  const setCampo = (chave, valor) => {
    setOverrides((o) => ({ ...o, [chave]: valor }));
    aplicarEdicao(chave, valor);
  };
  const sortear = () => { setOverrides({}); resortear({}); };
  const sortearDeNovo = () => resortear(overrides); // mantém overrides, resorteia o resto do zero

  const issues = useMemo(() => validarCoerencia(g), [g]);
  const erros = issues.filter((i) => i.severidade === "erro");
  const avisos = issues.filter((i) => i.severidade === "aviso");
  const pesoCal = useMemo(() => calcularPesoCalorias(g), [g]);
  const habitat = useMemo(() => readHabitatNaMassa(g, eraAtual.massas.find((m) => m.id === massaId)), [g, massaId, eraAtual]);

  /* v37 — esta função chamava `recalcular(novos)`, que não existe desde a
     v36 (virou aplicarEdicao/resortear): clicar em "corrigir" num aviso de
     coerência lançava ReferenceError e não corrigia nada. Agora aplica o
     genoma já corrigido e o normaliza, que é o que a correção pretendia. */
  const aplicarCorrecao = (issue) => {
    const g2 = clonarGenoma(g);
    issue.corrigir(g2);
    const novos = { ...overrides };
    for (const k of Object.keys(g2)) if (g2[k] !== g[k]) novos[k] = g2[k];
    setOverrides(novos);
    setG(normalizarGenomaEstavel(g2, isPrimordial));
  };

  const podeConfirmar = erros.length === 0;
  const confirmar = () => {
    if (!podeConfirmar) return;
    // Fase 4, item 7.3 — se uma trilha foi colada, reaplica os valores
    // exatos encontrados pela busca em cima do genoma recém-criado, em vez
    // de rodar deriva aleatória; o resultado final bate exatamente com o
    // DNA-alvo original (nos campos que a busca comparou).
    let gFinal = g;
    if (modo === "criar" && trilhaImportar.trim()) {
      gFinal = JSON.parse(JSON.stringify(g));
      aplicarTrilhaImportada(gFinal, trilhaImportar.trim());
    }
    onSalvar({ g: gFinal, auInicial: Number(auInicial) || 0, massaId: massaId || null });
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-t-lg sm:rounded-lg w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-950 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest">{modo === "criar" ? "Nova Espécie Primordial" : `Especiação Manual · a partir de ${node.linhagemId}`}</h2>
          <button onClick={onCancelar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {modo === "criar" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase text-stone-500 font-mono">Ano de surgimento (AU = 10.000 anos)</label>
                <CampoNumero value={auInicial} onChange={setAuInicial} placeholder="0" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-stone-500 font-mono">Massa de terra</label>
                <select value={massaId} onChange={(e) => setMassaId(e.target.value)} className="bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-sm text-stone-200 w-full">
                  {eraAtual.massas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Fase 4, item 7.3 — importar trilha de deriva encontrada pela busca
              (SpeciesViewer › "Buscar Trilha até DNA-alvo" › "Copiar Trilha").
              Reaplica os valores exatos ao confirmar, em vez de deriva aleatória. */}
          {modo === "criar" && (
            <div>
              <label className="text-[10px] uppercase text-stone-500 font-mono">Importar trilha de deriva (opcional — cole o texto "TRILHA1|..." copiado da busca)</label>
              <textarea
                value={trilhaImportar}
                onChange={(e) => setTrilhaImportar(e.target.value)}
                placeholder="TRILHA1|{...}|{...}|..."
                rows={2}
                className="w-full text-[11px] font-mono bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-stone-300 placeholder-stone-600 focus:border-emerald-700 focus:outline-none"
              />
            </div>
          )}

          <ListaGruposEditaveis g={g} setCampo={setCampo} overridesAtivos={new Set(Object.keys(overrides))} isPrimordial={isPrimordial} />

          <div className="flex gap-2">
            {modo === "criar" && <BotaoPrimario onClick={sortear} className="!bg-stone-800 !text-stone-300"><Dices size={12} className="inline -mt-0.5 mr-1" />Sortear tudo</BotaoPrimario>}
            <button onClick={sortearDeNovo} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-2">
              <Dices size={12} className="inline -mt-0.5 mr-1" />Resortear não-fixados
            </button>
          </div>

          <div className="rounded border border-stone-800 bg-stone-900/40 p-3 space-y-2">
            {/* g é o ctx do genoma, não o objeto retornado por buildSpecies —
                não existe g.code, então esta linha renderizava vazia. */}
            <div className="text-[10px] font-mono text-stone-500 break-all">{serialize(g)}</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-stone-500">Peso: </span><span className="text-stone-200 font-data">{fmtKg(pesoCal.pesoKg)}</span></div>
              <div><span className="text-stone-500">Calorias/dia: </span><span className="text-stone-200 font-data">{fmtNum(pesoCal.caloriasDia)} kcal</span></div>
              <div><span className="text-stone-500">Altura ref.: </span><span className="text-stone-200 font-data">{fmtNum(pesoCal.alturaM)} m</span></div>
              <div><span className="text-stone-500">Respiração: </span><span className="text-stone-200 font-data">{pesoCal.respiracao}</span></div>
            </div>
            <div className="text-xs">
              <span className="text-stone-500">Habitat viável: </span>
              <span className="text-stone-300">{habitat.primary.length ? habitat.primary.join(", ") : (habitat.marginal.length ? habitat.marginal.join(", ") + " (marginal)" : "nenhum bioma viável nesta massa")}</span>
            </div>
          </div>

          {(erros.length > 0 || avisos.length > 0) && (
            <div className="space-y-1.5">
              {erros.map((i) => (
                <div key={i.id} className="flex items-start gap-2 text-xs bg-red-950/40 border border-red-900 rounded px-2.5 py-2">
                  <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 text-red-300">{i.mensagem}</div>
                  <button onClick={() => aplicarCorrecao(i)} className="text-[10px] font-mono uppercase text-red-400 hover:text-red-200 shrink-0 underline">corrigir</button>
                </div>
              ))}
              {avisos.map((i) => (
                <div key={i.id} className="flex items-start gap-2 text-xs bg-amber-950/30 border border-amber-900 rounded px-2.5 py-2">
                  <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 text-amber-300">{i.mensagem}</div>
                  <button onClick={() => aplicarCorrecao(i)} className="text-[10px] font-mono uppercase text-amber-400 hover:text-amber-200 shrink-0 underline">ajustar</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-stone-950 border-t border-stone-800 px-4 py-3 flex gap-2">
          <BotaoPrimario disabled={!podeConfirmar} onClick={confirmar}>
            {podeConfirmar ? <><Check size={12} className="inline -mt-0.5 mr-1" />{modo === "criar" ? "Confirmar e Criar" : "Confirmar Especiação"}</> : `Corrija ${erros.length} erro(s) pra confirmar`}
          </BotaoPrimario>
          <button onClick={onCancelar} className="text-[11px] font-mono uppercase text-stone-500 px-3">cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SPECIES VIEWER — modal ao clicar numa espécie na lista
   ============================================================ */
function SpeciesViewer({ node, idx, eras, massaIdx, onFechar, onEditar, onDeletar, onClonar, onExportarMd, onDerivar, onNovoIndividuo, onNavegar, onAbrirIndividuo, individuosDaEspecie, onMaterializarTrilha, showToast }) {
  const pesoCal = useMemo(() => calcularPesoCalorias(node.g), [node]);
  const massa = massaIdx.get(node.massaId);
  const habitat = useMemo(() => readHabitatNaMassa(node.g, massa), [node, massa]);
  const ancestral = node.pais[0] ? idx.get(node.pais[0]) : null;
  const descendentes = node.filhos.map((id) => idx.get(id)).filter(Boolean);
  // Fase 4, item 7.3 — busca de trilha de deriva até um DNA-alvo colado
  const [trilhaAberta, setTrilhaAberta] = useState(false);
  const [alvoCodigo, setAlvoCodigo] = useState("");
  const [buscandoTrilha, setBuscandoTrilha] = useState(false);
  const [progressoTrilha, setProgressoTrilha] = useState(0);
  const [resultadoTrilha, setResultadoTrilha] = useState(null);
  /* v27 — a busca de trilha ganhou sentido inverso. "Adiante" é a de sempre:
     parte DESTA espécie e anda pra frente até um DNA-alvo colado. "Para trás"
     responde a outra pergunta — de onde este espécime pode ter vindo —
     sorteando ancestrais primordiais e devolvendo uma trilha que realmente
     chega nele. São várias as trilhas possíveis (a deriva descarta
     informação, então o passado não é recuperável do genoma atual), e é por
     isso que rodar de novo devolve outra: o botão diz "Sortear outra". */
  const [sentidoTrilha, setSentidoTrilha] = useState("adiante"); // "adiante" | "atras"
  const buscarTrilha = async () => {
    if (sentidoTrilha === "adiante" && !alvoCodigo.trim()) return;
    setBuscandoTrilha(true); setProgressoTrilha(0); setResultadoTrilha(null);
    const r = sentidoTrilha === "atras"
      ? await buscarTrilhaReversa(node.code, (f) => setProgressoTrilha(f))
      : await buscarTrilhaParaAlvo(node, alvoCodigo.trim(), (f) => setProgressoTrilha(f));
    setResultadoTrilha(r);
    setBuscandoTrilha(false);
  };
  const copiarTrilha = () => {
    if (!resultadoTrilha?.sucesso) return;
    // na trilha reversa a origem é o ancestral hipotético sorteado, não este nó
    const origem = resultadoTrilha.ancestral || node;
    const texto = serializarTrilha(origem, resultadoTrilha);
    navigator.clipboard?.writeText(texto);
    showToast("Trilha copiada — cole no campo de importação ao criar um primordial novo.");
  };
  /* v29 — gerar a linhagem encontrada como espécies de verdade na árvore.
     Antes o único destino de uma trilha era o texto copiado; agora ela
     vira nós, com os passos intermediários que a busca descobriu. */
  const gerarDaTrilha = () => {
    if (!resultadoTrilha?.sucesso || !onMaterializarTrilha) return;
    const criados = onMaterializarTrilha(resultadoTrilha, sentidoTrilha === "atras" ? { alvoNode: node } : { origemNode: node });
    if (criados) { setResultadoTrilha(null); onFechar(); }
  };
  const copiarAncestral = () => {
    if (!resultadoTrilha?.ancestral) return;
    navigator.clipboard?.writeText(resultadoTrilha.ancestral.code);
    showToast("DNA do ancestral hipotético copiado.");
  };
  // Linhagem completa (caminhoAtePrimordial) e parentesco lateral de
  // primeiro grau (irmaos) — ambos existiam prontos no motor e nunca
  // eram chamados por nenhuma tela.
  const caminho = useMemo(() => caminhoAtePrimordial(node.id, idx), [node, idx]);
  const irmaosLista = useMemo(() => irmaos(node.id, idx), [node, idx]);

  const copiarDNA = () => { navigator.clipboard?.writeText(node.code); showToast("DNA copiado."); };
  const speciesSeed = useMemo(() => seedParaGenoma(node.g, node.isPrimordial).seed, [node]);
  const copiarSeed = () => { navigator.clipboard?.writeText(gluedSeedText(speciesSeed, null, node.isPrimordial)); showToast("Seed da espécie copiada."); };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-t-lg sm:rounded-lg w-full sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-950 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest flex items-center gap-2">
            <Dna size={16} />{node.linhagemId} {node.isPrimordial && <Badge className="border-amber-800 text-amber-500">primordial</Badge>}
            {node.extinta && <Badge className="border-red-800 text-red-500">extinta · {fmtAU(node.auExtincao)}</Badge>}
          </h2>
          <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-[10px] font-mono text-stone-500 break-all bg-stone-900/40 rounded p-2">{node.code}</div>
          <p className="text-xs text-stone-400 leading-relaxed">{describeCreatureProse(node.g)}</p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-stone-800 p-2"><div className="text-stone-500">Peso</div><div className="text-stone-200 font-data">{fmtKg(pesoCal.pesoKg)}</div></div>
            <div className="rounded border border-stone-800 p-2"><div className="text-stone-500">Calorias/dia</div><div className="text-stone-200 font-data">{fmtNum(pesoCal.caloriasDia)} kcal</div></div>
            <div className="rounded border border-stone-800 p-2"><div className="text-stone-500">Ano de surgimento</div><div className="text-stone-200 font-data">{fmtAU(node.auSurgimento)}</div></div>
            <div className="rounded border border-stone-800 p-2"><div className="text-stone-500">Massa de terra</div><div className="text-stone-200 font-data">{massa?.nome || "—"}</div></div>
          </div>

          <div className="text-xs">
            <div className="text-stone-500 mb-1">Habitat derivado</div>
            <div className="text-stone-300">{habitat.primary.length ? habitat.primary.join(", ") : "—"}</div>
            {habitat.marginal.length > 0 && <div className="text-stone-500 mt-1">Marginal: {habitat.marginal.join(", ")}</div>}
          </div>

          <div className="text-xs">
            <div className="text-stone-500 mb-1.5">Linhagem até a primordial</div>
            <div className="flex flex-wrap items-center gap-1">
              {caminho.map((n, i) => (
                <React.Fragment key={n.id}>
                  {i > 0 && <ChevronRight size={10} className="text-stone-700 shrink-0" />}
                  <button
                    disabled={n.id === node.id}
                    onClick={() => onNavegar(n.id)}
                    className={`font-mono text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${n.id === node.id ? "border-emerald-700 bg-emerald-950/50 text-emerald-400 cursor-default" : "border-stone-800 text-stone-400 hover:text-emerald-400 hover:border-emerald-800"}`}>
                    {n.linhagemId}{n.isPrimordial ? " · primordial" : ""}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          {irmaosLista.length > 0 && (
            <div className="text-xs">
              <div className="text-stone-500 mb-1">Parentesco de primeiro grau · irmãos (mesmo ancestral direto)</div>
              <div className="flex flex-wrap gap-1.5">
                {irmaosLista.map((s) => (
                  <button key={s.id} onClick={() => onNavegar(s.id)} className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-stone-800 text-stone-400 hover:text-emerald-400 hover:border-emerald-800">
                    {s.linhagemId}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs">
            <div><span className="text-stone-500">Ancestral: </span>{ancestral ? <button onClick={() => onNavegar(ancestral.id)} className="text-emerald-400 hover:underline">{ancestral.linhagemId}</button> : <span className="text-stone-600">nenhum</span>}</div>
            <div><span className="text-stone-500">Descendentes: </span><span className="text-stone-300">{descendentes.length}</span></div>
            <div><span className="text-stone-500">Indivíduos: </span><span className="text-stone-300">{individuosDaEspecie.length}</span></div>
          </div>

          {individuosDaEspecie.length > 0 && (
            <div className="space-y-1">
              <div className="text-stone-500 text-[10px] uppercase tracking-widest font-mono">População (clique num indivíduo pra ver o painel completo)</div>
              {individuosDaEspecie.map((ind) => (
                <button key={ind.id} onClick={() => onAbrirIndividuo(ind)}
                  className={`w-full text-left text-xs flex items-center gap-2 rounded border border-stone-800 hover:border-emerald-800 px-2 py-1.5 ${ind.viva === false ? "text-stone-600" : "text-stone-400 hover:text-emerald-400"}`}>
                  <User size={12} />{ind.nome}{ind.viva === false && <Badge className="border-red-900 text-red-500">morto</Badge>} — FOR:{ind.attrVaried.FOR} AGI:{ind.attrVaried.AGI} CON:{ind.attrVaried.CON} PER:{ind.attrVaried.PER} INT:{ind.attrVaried.INT} CAR:{ind.attrVaried.CAR}
                </button>
              ))}
            </div>
          )}

          <PromptImagemBox g={node.g} individual={null} linhagemId={node.linhagemId} showToast={showToast} />

          {/* Fase 4, item 7.3 — árvore reversa: buscar trilha de deriva até um DNA-alvo colado */}
          {trilhaAberta && (
            <div className="rounded border border-stone-800 p-2.5 space-y-2">
              <div className="text-stone-500 text-[10px] uppercase tracking-widest font-mono">Trilha de deriva</div>
              <div className="flex gap-1">
                {[["adiante", "Adiante (até um DNA-alvo)"], ["atras", "Para trás (de onde veio)"]].map(([v, rotulo]) => (
                  <button key={v} onClick={() => { setSentidoTrilha(v); setResultadoTrilha(null); }}
                    className={`flex-1 text-[10px] font-mono uppercase rounded px-2 py-1.5 border ${sentidoTrilha === v ? "border-emerald-700 text-emerald-400 bg-emerald-950/30" : "border-stone-800 text-stone-500 hover:text-stone-300"}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
              {sentidoTrilha === "adiante" ? (
                <textarea
                  value={alvoCodigo}
                  onChange={(e) => setAlvoCodigo(e.target.value)}
                  placeholder="Cole aqui o código DRN2 do DNA-alvo (ex.: DRN2-TAX:An.MAM.Xyz-...)"
                  className="w-full text-[11px] font-mono bg-stone-900 border border-stone-800 rounded px-2 py-1.5 text-stone-300 placeholder-stone-600 focus:border-emerald-700 focus:outline-none"
                  rows={2}
                />
              ) : (
                <p className="text-[10px] text-stone-500 leading-relaxed">
                  Reconstrói uma linhagem que chega em <span className="font-mono text-stone-300">{node.linhagemId}</span> a
                  partir de um ancestral primordial (bactéria) sorteado. Não existe "a" trilha certa: a deriva
                  descarta informação, então vários caminhos diferentes chegam ao mesmo genoma. Esta é <span className="text-stone-300">uma</span> das
                  possíveis — sortear de novo devolve outra, igualmente válida.
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <button disabled={buscandoTrilha || (sentidoTrilha === "adiante" && !alvoCodigo.trim())} onClick={buscarTrilha} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5 disabled:opacity-40">
                  {buscandoTrilha ? `Buscando… ${Math.round(progressoTrilha * 100)}%`
                    : sentidoTrilha === "atras" ? (resultadoTrilha ? "Sortear outra" : "Reconstruir linhagem") : "Buscar"}
                </button>
                {resultadoTrilha?.sucesso && (
                  <button onClick={gerarDaTrilha} className="text-[11px] font-mono uppercase text-emerald-400 hover:text-emerald-200 border border-emerald-800 bg-emerald-950/30 rounded px-3 py-1.5">
                    <GitBranch size={12} className="inline -mt-0.5 mr-1" />Gerar linhagem na árvore
                  </button>
                )}
                {resultadoTrilha?.sucesso && (
                  <button onClick={copiarTrilha} className="text-[11px] font-mono uppercase text-emerald-500 hover:text-emerald-300 border border-emerald-900 rounded px-3 py-1.5">
                    <Copy size={12} className="inline -mt-0.5 mr-1" />Copiar Trilha ({resultadoTrilha.ciclos} ciclo(s))
                  </button>
                )}
              </div>
              {resultadoTrilha && !buscandoTrilha && (
                <div className="space-y-2">
                  <div className="text-[11px] text-stone-500">
                    {resultadoTrilha.motivo === "codigo-invalido" ? "Código DRN2 inválido — confira o formato colado."
                      : resultadoTrilha.motivo === "barreira-de-reino" ? resultadoTrilha.motivoTexto
                      : resultadoTrilha.sucesso
                        ? (sentidoTrilha === "atras"
                          ? `Linhagem reconstruída: ${resultadoTrilha.ciclos} ciclo(s) de deriva do ancestral até ${node.linhagemId}.`
                          : `Bateu 100% no alvo em ${resultadoTrilha.ciclos} ciclo(s) de deriva aceitos.`)
                      : resultadoTrilha.motivoTexto
                        || `Não bateu 100% dentro do limite de tentativas (distância residual: ${resultadoTrilha.dlFinal}).`}
                  </div>
                  {resultadoTrilha.sucesso && (
                    <p className="text-[10px] text-stone-600 leading-relaxed">
                      "Gerar linhagem na árvore" materializa esses ciclos como espécies de verdade
                      {sentidoTrilha === "atras"
                        ? `: o ancestral primordial, as espécies intermediárias e — se ${node.linhagemId} for hoje uma raiz sem ancestral — ${node.linhagemId} passa a descender delas em vez de virar uma cópia.`
                        : `, penduradas em ${node.linhagemId}, terminando numa espécie com o DNA-alvo.`}
                    </p>
                  )}
                  {sentidoTrilha === "atras" && resultadoTrilha.ancestral && (
                    <div className="rounded border border-stone-800 bg-stone-900/40 p-2 space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-stone-500 font-mono">Ancestral primordial hipotético</div>
                      <div className="text-[11px] text-stone-300 font-mono">{resultadoTrilha.ancestral.linhagemId}</div>
                      <div className="text-[10px] font-mono text-stone-500 break-all">{resultadoTrilha.ancestral.code}</div>
                      <button onClick={copiarAncestral} className="text-[10px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-2 py-1">
                        <Copy size={11} className="inline -mt-0.5 mr-1" />Copiar DNA do ancestral
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-stone-950 border-t border-stone-800 px-4 py-3 flex flex-wrap gap-2">
          <button onClick={copiarDNA} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Copy size={12} className="inline -mt-0.5 mr-1" />Copiar DNA</button>
          <button onClick={copiarSeed} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Copy size={12} className="inline -mt-0.5 mr-1" />Copiar Seed</button>
          <button onClick={onExportarMd} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />Exportar .md</button>
          <button onClick={onDerivar} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><GitBranch size={12} className="inline -mt-0.5 mr-1" />Derivar</button>
          <button onClick={onNovoIndividuo} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><User size={12} className="inline -mt-0.5 mr-1" />Novo Indivíduo</button>
          <button onClick={() => setTrilhaAberta((v) => !v)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5">{trilhaAberta ? "Fechar Trilha de Deriva" : "Trilha de Deriva"}</button>
          <button onClick={onClonar} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5">Clonar</button>
          <button onClick={onEditar} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5">Editar</button>
          <button onClick={onDeletar} className="text-[11px] font-mono uppercase text-red-500 hover:text-red-300 border border-red-900 rounded px-3 py-1.5 ml-auto"><Trash size={12} className="inline -mt-0.5 mr-1" />Deletar</button>
        </div>
      </div>
    </div>
  );
}
