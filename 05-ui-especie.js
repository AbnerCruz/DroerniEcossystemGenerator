/* ============================================================
   CAMPOS EDITÁVEIS NO EDITOR (genes-chave — os ~50 restantes
   continuam sendo resolvidos pelo motor automaticamente a cada
   geração/edição, exatamente como no modo aleatório original)
   ============================================================ */
const CAMPOS_EDITAVEIS = [
  { chave: "reino", label: "Reino", tabela: () => T.reino },
  { chave: "classe", label: "Classe (só p/ Animal)", tabela: (g) => (g.reino === "An" ? T.classeAn : null) },
  { chave: "porte", label: "Porte", tabela: () => T.porte },
  { chave: "tolHidrica", label: "Tolerância Hídrica", tabela: () => T.tolHidrica },
  { chave: "tolTermica", label: "Tolerância Térmica", tabela: () => T.tolTermica },
  { chave: "dieBase", label: "Dieta", tabela: () => T.dieBase },
  { chave: "locPrimario", label: "Locomoção Primária", tabela: () => T.locPrim },
  { chave: "crnFormato", label: "Formato do Crânio", tabela: () => T.crnFormato },
  { chave: "facDenticao", label: "Dentição", tabela: () => T.facDenticao },
  { chave: "asaQtd", label: "Asas (quantidade)", tabela: () => T.asaQtd },
  { chave: "tegTipo", label: "Tegumento", tabela: () => T.tegTipo },
  { chave: "tegCor", label: "Cor", tabela: () => T.tegCor },
];

/* Fase 2, item 5.4 — edição manual de espécie já viva deixou de sobrescrever
   o nó existente in-place (alteração de DNA em vida, incoerente) e passa a
   ser uma ESPECIAÇÃO MANUAL: cria um nó filho novo a partir do genoma
   editado, preservando o nó-mãe original intacto — mesmo padrão de
   especiar() (Fase 2 do motor), mas com os genes escolhidos manualmente em
   vez de mutação por pressão evolutiva. */
function commitEspeciacaoManualFromGenome(mae, g, auInicial, massaId) {
  const novoClado = sortClado();
  const g2 = { ...g, clado: novoClado, isPrimordial: false };
  const id = novoId();
  const auFilha = Math.max(mae.auSurgimento + 1e-6, auInicial ?? mae.auSurgimento);
  const filho = {
    id, clado: novoClado, g: g2, code: serialize(g2), auSurgimento: auFilha,
    pais: [mae.id], filhos: [], primordialId: mae.primordialId, ordem: 0,
    ciclosDecorridos: 0, orcamento: 0, acumEstratoII: new Set(), historico: [],
    isPrimordial: false, extinta: false, massaId: massaId || mae.massaId || null,
    origemEdicaoManual: true,
  };
  mae.filhos.push(id);
  emitirEvento({
    tipo: "especiacao-manual", tipoLabel: "ESPECIAÇÃO MANUAL", speciesId: id, clado: novoClado,
    maeId: mae.id, maeClado: mae.clado, primordialId: filho.primordialId, primordialClado: mae.primordialClado || mae.clado,
    auSurgimento: filho.auSurgimento,
    texto: `${novoClado} especia manualmente a partir de ${mae.clado} (edição dirigida pelo usuário). Surge em ${auTextoLog(filho.auSurgimento)}.`,
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
  const node = {
    id, clado: g.clado, g, code, auSurgimento: auInicial ?? 0,
    pais: [], filhos: [], primordialId: id, ordem: 0, ciclosDecorridos: 0,
    orcamento: 0, acumEstratoII: new Set(), historico: [], isPrimordial: true,
    extinta: false, massaId: massaId || null,
  };
  emitirEvento({
    tipo: "primordial", tipoLabel: "PRIMORDIAL SURGE", speciesId: id, clado: node.clado,
    primordialId: id, primordialClado: node.clado, auSurgimento: node.auSurgimento,
    texto: `Espécie primordial ${node.clado} (${REINO_LABEL_LOG[g.reino] || g.reino}) surge em ${auTextoLog(node.auSurgimento)}, sem ancestral.`,
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

  const recalcular = (novosOverrides) => {
    const manual = { ...baseManual, ...novosOverrides };
    // sem seed: o editor recalcula a cada tecla e não usa speciesSeed
    const built = buildSpecies(null, manual, isPrimordial, false);
    setG(built.g);
  };
  const setCampo = (chave, valor) => {
    const novos = { ...overrides, [chave]: valor };
    setOverrides(novos);
    recalcular(novos);
  };
  const sortear = () => { setOverrides({}); recalcular({}); };
  const sortearDeNovo = () => recalcular(overrides); // mantém overrides, resorteia o resto

  const issues = useMemo(() => validarCoerencia(g), [g]);
  const erros = issues.filter((i) => i.severidade === "erro");
  const avisos = issues.filter((i) => i.severidade === "aviso");
  const pesoCal = useMemo(() => calcularPesoCalorias(g), [g]);
  const habitat = useMemo(() => readHabitatNaMassa(g, eraAtual.massas.find((m) => m.id === massaId)), [g, massaId, eraAtual]);

  const aplicarCorrecao = (issue) => {
    const g2 = JSON.parse(JSON.stringify(g));
    issue.corrigir(g2);
    // devolve os campos corrigidos como novos overrides, pra sobreviverem a futuros recálculos
    const novos = { ...overrides };
    for (const k of Object.keys(g2)) if (g2[k] !== g[k]) novos[k] = g2[k];
    setOverrides(novos);
    recalcular(novos);
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
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest">{modo === "criar" ? "Nova Espécie Primordial" : `Especiação Manual · a partir de ${node.clado}`}</h2>
          <button onClick={onCancelar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {modo === "criar" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase text-stone-500 font-mono">Ano de surgimento (AU = 1 mi anos)</label>
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

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CAMPOS_EDITAVEIS.map((campo) => {
              const tabela = campo.tabela(g);
              if (!tabela) return null;
              return (
                <div key={campo.chave}>
                  <label className="text-[10px] uppercase text-stone-500 font-mono truncate block">{campo.label}</label>
                  <select value={g[campo.chave]} onChange={(e) => setCampo(campo.chave, isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}
                    className="bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-xs text-stone-200 w-full">
                    {tabela.map((row) => <option key={String(row.value)} value={row.value}>{row.label}</option>)}
                  </select>
                </div>
              );
            })}
            <div>
              <label className="text-[10px] uppercase text-stone-500 font-mono">Densidade (0-9)</label>
              <input type="range" min="0" max="9" value={g.densidade} onChange={(e) => setCampo("densidade", Number(e.target.value))} className="w-full accent-emerald-600" />
              <div className="text-center text-xs text-stone-400 font-data">{g.densidade}</div>
            </div>
          </div>

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
            <Dna size={16} />{node.clado} {node.isPrimordial && <Badge className="border-amber-800 text-amber-500">primordial</Badge>}
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
                    {n.clado}{n.isPrimordial ? " · primordial" : ""}
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
                    {s.clado}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs">
            <div><span className="text-stone-500">Ancestral: </span>{ancestral ? <button onClick={() => onNavegar(ancestral.id)} className="text-emerald-400 hover:underline">{ancestral.clado}</button> : <span className="text-stone-600">nenhum</span>}</div>
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

          <PromptImagemBox g={node.g} individual={null} showToast={showToast} />

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
                  Reconstrói uma linhagem que chega em <span className="font-mono text-stone-300">{node.clado}</span> a
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
                          ? `Linhagem reconstruída: ${resultadoTrilha.ciclos} ciclo(s) de deriva do ancestral até ${node.clado}.`
                          : `Bateu 100% no alvo em ${resultadoTrilha.ciclos} ciclo(s) de deriva aceitos.`)
                      : resultadoTrilha.motivoTexto
                        || `Não bateu 100% dentro do limite de tentativas (distância residual: ${resultadoTrilha.dlFinal}).`}
                  </div>
                  {resultadoTrilha.sucesso && (
                    <p className="text-[10px] text-stone-600 leading-relaxed">
                      "Gerar linhagem na árvore" materializa esses ciclos como espécies de verdade
                      {sentidoTrilha === "atras"
                        ? `: o ancestral primordial, as espécies intermediárias e — se ${node.clado} for hoje uma raiz sem ancestral — ${node.clado} passa a descender delas em vez de virar uma cópia.`
                        : `, penduradas em ${node.clado}, terminando numa espécie com o DNA-alvo.`}
                    </p>
                  )}
                  {sentidoTrilha === "atras" && resultadoTrilha.ancestral && (
                    <div className="rounded border border-stone-800 bg-stone-900/40 p-2 space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-stone-500 font-mono">Ancestral primordial hipotético</div>
                      <div className="text-[11px] text-stone-300 font-mono">{resultadoTrilha.ancestral.clado}</div>
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
