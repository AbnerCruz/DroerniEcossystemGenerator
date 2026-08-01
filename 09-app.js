/* ============================================================
   APP PRINCIPAL — v17
   ============================================================ */
function App() {
  const [eras, setEras] = useState([]);
  const [faseGeoConfirmada, setFaseGeoConfirmada] = useState(false);
  const [faseErasConfirmada, setFaseErasConfirmada] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [individuals, setIndividuals] = useState([]);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(null);
  const [editor, setEditor] = useState(null); // null | {modo:'criar'} | {modo:'editar', node}
  const [modalDerivarNode, setModalDerivarNode] = useState(null);
  const [toast, setToast] = useState("");
  const [logVersion, setLogVersion] = useState(0);
  const [patchnotesAberto, setPatchnotesAberto] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };
  const eventLog = useMemo(() => __eventLog, [logVersion]);
  const idx = useMemo(() => buildIndex(nodes), [nodes]);
  const massaIdx = useMemo(() => { const m = new Map(); for (const era of eras) for (const massa of era.massas) m.set(massa.id, massa); return m; }, [eras]);
  const eraAtual = eras.length ? eras[eras.length - 1] : null;

  const faseAtual = !faseGeoConfirmada ? 1 : !faseErasConfirmada ? 2 : 3;

  /* ---------- FASE 1 ---------- */
  const confirmarGeografia = (massasRascunho) => {
    const massas = massasRascunho.map((m) => criarMassaDeTerra(m.nome, m.dominios));
    const eraInicial = { id: novaIdEra(), nome: "Era 1", auInicio: 0, massas, eraAnteriorId: null };
    setEras([eraInicial]);
    setFaseGeoConfirmada(true);
    showToast(`Geografia confirmada: ${massas.length} massa(s) de terra.`);
  };

  /* ---------- FASE 2 ---------- */
  const confirmarEras = () => { setFaseErasConfirmada(true); showToast(`Eras confirmadas: ${eras.length} era(s). Biologia desbloqueada.`); };

  /* ---------- FASE 3 — criar / editar / deletar / clonar ---------- */
  const salvarNovoPrimordial = ({ g, auInicial, massaId }) => {
    const node = commitPrimordialFromGenome(g, auInicial, massaId);
    setNodes((prev) => [...prev, node]);
    setEditor(null); setLogVersion((v) => v + 1);
    showToast(`Primordial ${node.clado} criado.`);
  };
  const salvarEdicao = ({ g, auInicial, massaId }) => {
    const alvo = editor.node;
    setNodes((prev) => prev.map((n) => (n.id === alvo.id ? { ...n, g, code: serialize(g), auSurgimento: auInicial, massaId } : n)));
    emitirEvento({ tipo: "edicao", tipoLabel: "ESPÉCIE MODIFICADA", speciesId: alvo.id, clado: alvo.clado, primordialId: alvo.primordialId, primordialClado: alvo.clado, auSurgimento: auInicial, texto: `${alvo.clado} editada manualmente — validação ✓, recalculação ✓.`, code: serialize(g) });
    setEditor(null); setLogVersion((v) => v + 1);
    showToast(`${alvo.clado} atualizada e recalculada.`);
  };
  const deletarEspecie = (node) => {
    if (node.filhos.length > 0) { showToast("Remova (ou reatribua) os descendentes antes de deletar esta espécie."); return; }
    if (!window.confirm(`Deletar ${node.clado} definitivamente?`)) return;
    setNodes((prev) => prev.filter((n) => n.id !== node.id).map((n) => (n.pais.includes(node.id) ? { ...n, pais: [] } : n)));
    if (node.pais[0]) setNodes((prev) => prev.map((n) => (n.id === node.pais[0] ? { ...n, filhos: n.filhos.filter((f) => f !== node.id) } : n)));
    setSelectedSpeciesId(null);
    showToast(`${node.clado} deletada.`);
  };
  const clonarEspecie = (node) => {
    const gClone = JSON.parse(JSON.stringify(node.g));
    const novo = commitPrimordialFromGenome(gClone, node.auSurgimento, node.massaId);
    // clone é sempre um novo primordial independente — "mesmo genoma base, nova seed/identidade"
    setNodes((prev) => [...prev, novo]);
    showToast(`${node.clado} clonada como ${novo.clado} (nova espécie independente, mesmo genoma base).`);
  };
  const derivarEspecie = (node, ciclos) => {
    const novos = [];
    derivarLinhagem(node, ciclos, (filha) => novos.push(filha));
    setNodes((prev) => [...prev, ...novos]);
    setModalDerivarNode(null); setLogVersion((v) => v + 1);
    showToast(`${novos.length} nova(s) espécie(s) derivada(s) de ${node.clado}.`);
  };
  const novoIndividuo = (node) => {
    const r = buildIndividual(node.g, null);
    const individuo = { id: "ind" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), especieId: node.id, nome: sortNomeIndividuo(), ind: r.ind, code: r.code, individualSeed: r.individualSeed, attrBase: r.attrBase, attrVaried: r.attrVaried };
    setIndividuals((prev) => [...prev, individuo]);
    showToast(`Indivíduo ${individuo.nome} criado (${node.clado}).`);
  };

  /* ---------- import de projeto ---------- */
  const onImportarProjeto = (dados) => {
    setEras(dados.eras.length ? dados.eras : []);
    setNodes(dados.nodes);
    setIndividuals(dados.individuals);
    setFaseGeoConfirmada(dados.faseGeoConfirmada || dados.eras.length > 0);
    setFaseErasConfirmada(dados.faseErasConfirmada || dados.eras.length > 0);
    setSelectedSpeciesId(null); setEditor(null);
    setLogVersion((v) => v + 1);
  };

  const selectedNode = selectedSpeciesId ? idx.get(selectedSpeciesId) : null;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200" style={{ fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        .font-data { font-family: 'IBM Plex Mono', monospace; }
        .prose-patchnotes h1 { font-size: 1.05rem; font-weight: 600; color: #f5f5f4; margin: 0 0 .75rem; }
        .prose-patchnotes h2 { font-size: .85rem; text-transform: uppercase; letter-spacing: .08em; color: #34d399; margin: 1.25rem 0 .5rem; font-family: 'IBM Plex Mono', monospace; }
        .prose-patchnotes h3 { font-size: .8rem; font-weight: 600; color: #d6d3d1; margin: 1rem 0 .4rem; }
        .prose-patchnotes p { margin: 0 0 .75rem; }
        .prose-patchnotes ul { list-style: disc; padding-left: 1.25rem; margin: 0 0 .75rem; }
        .prose-patchnotes li { margin-bottom: .35rem; }
        .prose-patchnotes code { background: #1c1917; border: 1px solid #292524; border-radius: 3px; padding: 0 .3em; font-family: 'IBM Plex Mono', monospace; font-size: .85em; color: #a8a29e; }
        .prose-patchnotes strong { color: #e7e5e4; }
        .prose-patchnotes a { color: #34d399; text-decoration: underline; }
      `}</style>

      <header className="border-b border-stone-800 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 sticky top-0 bg-stone-950/95 backdrop-blur z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-full border border-emerald-700 flex items-center justify-center text-emerald-500"><GitBranch size={18} /></div>
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-stone-100 leading-none">Droerni · Ecossistema DRN2</h1>
            <p className="font-data text-[10px] text-stone-500 tracking-wider truncate">v17 · fluxo linear · coerência bloqueadora</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setPatchnotesAberto(true)} title="Patchnotes" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><FileText size={14} /></button>
          <PersistenceBar eras={eras} nodes={nodes} individuals={individuals} faseGeoConfirmada={faseGeoConfirmada} faseErasConfirmada={faseErasConfirmada} onImportar={onImportarProjeto} showToast={showToast} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <BarraFases faseAtual={faseAtual} geoOk={faseGeoConfirmada} erasOk={faseErasConfirmada} />

        {faseAtual === 1 && <FaseGeografia onConfirmar={confirmarGeografia} jaConfirmada={false} eras={eras} />}

        {faseGeoConfirmada && (
          <FaseEras eras={eras} setEras={setEras} onConfirmar={confirmarEras} jaConfirmada={faseErasConfirmada} bloqueada={false} />
        )}

        {faseAtual === 3 && (
          <>
            <PainelBiologia
              eras={eras} nodes={nodes} setNodes={setNodes}
              individuals={individuals} setIndividuals={setIndividuals}
              onAbrirViewer={setSelectedSpeciesId}
              onCriarPrimordial={() => setEditor({ modo: "criar" })}
              showToast={showToast}
            />
            {nodes.length > 0 && (
              <Section title="Exportar" accent="text-stone-500">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => exportarHistoricoTxt(eventLog)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />Histórico (.txt)</button>
                  <button onClick={() => exportarHistoriaGlobalTxt(nodes, idx)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />História Global (.txt)</button>
                  <button onClick={() => exportarFichasObsidianZip(nodes, idx)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />Fichas Obsidian (.zip)</button>
                </div>
              </Section>
            )}
            <PainelLog eventLog={eventLog} />
          </>
        )}
      </main>

      {editor?.modo === "criar" && eraAtual && (
        <SpeciesEditor modo="criar" eraAtual={eraAtual} onSalvar={salvarNovoPrimordial} onCancelar={() => setEditor(null)} />
      )}
      {editor?.modo === "editar" && eraAtual && (
        <SpeciesEditor modo="editar" node={editor.node} eraAtual={eraAtual} onSalvar={salvarEdicao} onCancelar={() => setEditor(null)} />
      )}

      {selectedNode && (
        <SpeciesViewer
          node={selectedNode} idx={idx} eras={eras} massaIdx={massaIdx}
          individuosDaEspecie={individuals.filter((i) => i.especieId === selectedNode.id)}
          onFechar={() => setSelectedSpeciesId(null)}
          onEditar={() => { setEditor({ modo: "editar", node: selectedNode }); setSelectedSpeciesId(null); }}
          onDeletar={() => deletarEspecie(selectedNode)}
          onClonar={() => clonarEspecie(selectedNode)}
          onExportarMd={() => exportarFichaUnicaMd(selectedNode, idx)}
          onDerivar={() => { setModalDerivarNode(selectedNode); setSelectedSpeciesId(null); }}
          onNovoIndividuo={() => novoIndividuo(selectedNode)}
          showToast={showToast}
        />
      )}

      {modalDerivarNode && (
        <ModalDerivar node={modalDerivarNode} onDerivar={(ciclos) => derivarEspecie(modalDerivarNode, ciclos)} onFechar={() => setModalDerivarNode(null)} />
      )}

      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-stone-900 border border-emerald-800 text-emerald-300 text-xs font-mono px-4 py-2 rounded shadow-lg z-50">{toast}</div>}

      {patchnotesAberto && <PainelPatchnotes onFechar={() => setPatchnotesAberto(false)} />}

      <footer className="max-w-4xl mx-auto px-4 sm:px-6 pb-10 pt-4 text-[10px] text-stone-700 font-data">DRN2 v17 · Droerni — fluxo linear, coerência bloqueadora, exports robustos</footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
