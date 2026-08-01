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
  const isPrimordial = modo === "editar" ? node.isPrimordial : true;
  const [overrides, setOverrides] = useState({});
  const [g, setG] = useState(() => buildSpecies(null, baseManual, isPrimordial).g);
  const [auInicial, setAuInicial] = useState(modo === "criar" ? "0" : String(node.auSurgimento));
  const [massaId, setMassaId] = useState(modo === "criar" ? (eraAtual.massas[0]?.id || "") : node.massaId);

  const recalcular = (novosOverrides) => {
    const manual = { ...baseManual, ...novosOverrides };
    const built = buildSpecies(null, manual, isPrimordial);
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
    onSalvar({ g, auInicial: Number(auInicial) || 0, massaId: massaId || null });
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-t-lg sm:rounded-lg w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-950 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest">{modo === "criar" ? "Nova Espécie Primordial" : `Editar · ${node.clado}`}</h2>
          <button onClick={onCancelar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {modo === "criar" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase text-stone-500 font-mono">Ano de surgimento (bi)</label>
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
            <div className="text-[10px] font-mono text-stone-500 break-all">{g.code}</div>
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
            {podeConfirmar ? <><Check size={12} className="inline -mt-0.5 mr-1" />Confirmar {modo === "criar" ? "e Criar" : "Mudanças"}</> : `Corrija ${erros.length} erro(s) pra confirmar`}
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
function SpeciesViewer({ node, idx, eras, massaIdx, onFechar, onEditar, onDeletar, onClonar, onExportarMd, onDerivar, onNovoIndividuo, individuosDaEspecie, showToast }) {
  const pesoCal = useMemo(() => calcularPesoCalorias(node.g), [node]);
  const massa = massaIdx.get(node.massaId);
  const habitat = useMemo(() => readHabitatNaMassa(node.g, massa), [node, massa]);
  const ancestral = node.pais[0] ? idx.get(node.pais[0]) : null;
  const descendentes = node.filhos.map((id) => idx.get(id)).filter(Boolean);

  const copiarDNA = () => { navigator.clipboard?.writeText(node.code); showToast("DNA copiado."); };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-t-lg sm:rounded-lg w-full sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-950 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest flex items-center gap-2">
            <Dna size={16} />{node.clado} {node.isPrimordial && <Badge className="border-amber-800 text-amber-500">primordial</Badge>}
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

          <div className="flex items-center gap-4 text-xs">
            <div><span className="text-stone-500">Ancestral: </span>{ancestral ? <span className="text-emerald-400">{ancestral.clado}</span> : <span className="text-stone-600">nenhum</span>}</div>
            <div><span className="text-stone-500">Descendentes: </span><span className="text-stone-300">{descendentes.length}</span></div>
            <div><span className="text-stone-500">Indivíduos: </span><span className="text-stone-300">{individuosDaEspecie.length}</span></div>
          </div>

          {individuosDaEspecie.length > 0 && (
            <div className="space-y-1">
              {individuosDaEspecie.map((ind) => (
                <div key={ind.id} className="text-xs flex items-center gap-2 text-stone-400"><User size={12} />{ind.nome} — FOR:{ind.attrVaried.FOR} AGI:{ind.attrVaried.AGI} CON:{ind.attrVaried.CON} PER:{ind.attrVaried.PER} INT:{ind.attrVaried.INT} CAR:{ind.attrVaried.CAR}</div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-stone-950 border-t border-stone-800 px-4 py-3 flex flex-wrap gap-2">
          <button onClick={copiarDNA} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Copy size={12} className="inline -mt-0.5 mr-1" />Copiar DNA</button>
          <button onClick={onExportarMd} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />Exportar .md</button>
          <button onClick={onDerivar} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><GitBranch size={12} className="inline -mt-0.5 mr-1" />Derivar</button>
          <button onClick={onNovoIndividuo} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><User size={12} className="inline -mt-0.5 mr-1" />Novo Indivíduo</button>
          <button onClick={onClonar} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5">Clonar</button>
          <button onClick={onEditar} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5">Editar</button>
          <button onClick={onDeletar} className="text-[11px] font-mono uppercase text-red-500 hover:text-red-300 border border-red-900 rounded px-3 py-1.5 ml-auto"><Trash size={12} className="inline -mt-0.5 mr-1" />Deletar</button>
        </div>
      </div>
    </div>
  );
}
