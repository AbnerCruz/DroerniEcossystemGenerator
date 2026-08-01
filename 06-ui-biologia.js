/* ============================================================
   GERAÇÃO EM MASSA — tenta até 5x por primordial pra nunca
   commitar um genoma com contradição bloqueante (a validação
   nunca é "avisar depois": aqui ela filtra ANTES de existir).
   ============================================================ */
function gerarPrimordialValido(auInicial, massaId) {
  let g = buildSpecies(null, {}, true).g;
  for (let tent = 0; tent < 5 && temErroBloqueante(validarCoerencia(g)); tent++) g = buildSpecies(null, {}, true).g;
  return commitPrimordialFromGenome(g, auInicial, massaId);
}

function ModalGerarEcossistema({ eraAtual, onGerar, onFechar }) {
  const [qtd, setQtd] = useState("5");
  const [ciclosMin, setCiclosMin] = useState("15");
  const [ciclosMax, setCiclosMax] = useState("35");

  const gerar = () => {
    const n = Math.max(1, Math.min(30, Number(qtd) || 1));
    const cMin = Math.max(0, Number(ciclosMin) || 0), cMax = Math.max(cMin, Number(ciclosMax) || cMin);
    onGerar(n, cMin, cMax);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-lg w-full max-w-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest">Gerar Ecossistema</h2>
          <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>
        <div>
          <label className="text-[10px] uppercase text-stone-500 font-mono">Nº de primordiais (1-30)</label>
          <CampoNumero value={qtd} onChange={setQtd} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[10px] uppercase text-stone-500 font-mono">Ciclos de deriva (mín)</label><CampoNumero value={ciclosMin} onChange={setCiclosMin} /></div>
          <div><label className="text-[10px] uppercase text-stone-500 font-mono">Ciclos de deriva (máx)</label><CampoNumero value={ciclosMax} onChange={setCiclosMax} /></div>
        </div>
        <p className="text-[10px] text-stone-600">Cada primordial nasce em uma massa aleatória da era atual e deriva um nº aleatório de ciclos dentro da faixa acima. Contradições de coerência são automaticamente re-sorteadas antes de existir.</p>
        <BotaoPrimario onClick={gerar}>Gerar</BotaoPrimario>
      </div>
    </div>
  );
}

function ModalDerivar({ node, onDerivar, onFechar }) {
  const [ciclos, setCiclos] = useState("5");
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-lg w-full max-w-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest">Derivar · {node.clado}</h2>
          <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>
        <div><label className="text-[10px] uppercase text-stone-500 font-mono">Ciclos de deriva</label><CampoNumero value={ciclos} onChange={setCiclos} /></div>
        <BotaoPrimario onClick={() => onDerivar(Math.max(1, Number(ciclos) || 1))}>Derivar</BotaoPrimario>
      </div>
    </div>
  );
}

/* ============================================================
   LISTA DE ESPÉCIES — agrupada por árvore primordial
   ============================================================ */
function CardEspecie({ node, onClick, individuosCount }) {
  const pesoCal = useMemo(() => calcularPesoCalorias(node.g), [node]);
  return (
    <button onClick={onClick} className="w-full text-left rounded border border-stone-800 hover:border-emerald-800 bg-stone-950/50 p-2.5 transition-colors">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-stone-200">{node.clado}</span>
        {node.isPrimordial && <Badge className="border-amber-800 text-amber-500">primordial</Badge>}
      </div>
      <div className="text-[10px] text-stone-500 mt-1">{REINO_LABEL[node.g.reino] || node.g.reino} · {fmtKg(pesoCal.pesoKg)} · {fmtAU(node.auSurgimento)}</div>
      <div className="flex gap-2 mt-1 text-[10px] text-stone-600">
        {node.filhos.length > 0 && <span>{node.filhos.length} descendente(s)</span>}
        {individuosCount > 0 && <span>{individuosCount} indivíduo(s)</span>}
      </div>
    </button>
  );
}

function PainelBiologia({ eras, nodes, setNodes, individuals, setIndividuals, onAbrirViewer, onCriarPrimordial, showToast }) {
  const [modalEcossistema, setModalEcossistema] = useState(false);
  const eraAtual = eras[eras.length - 1];
  const primordiais = nodes.filter((n) => n.isPrimordial);

  const gerarEcossistema = (n, cMin, cMax) => {
    const novos = [];
    for (let i = 0; i < n; i++) {
      const massa = eraAtual.massas[Math.floor(Math.random() * eraAtual.massas.length)];
      const auInicial = eraAtual.auInicio + Math.random() * 0.5;
      const primordial = gerarPrimordialValido(auInicial, massa?.id);
      novos.push(primordial);
      const ciclos = cMin + Math.floor(Math.random() * (cMax - cMin + 1));
      if (ciclos > 0) {
        const filhas = derivarLinhagem(primordial, ciclos, (filha) => novos.push(filha));
      }
    }
    setNodes((prev) => [...prev, ...novos]);
    setModalEcossistema(false);
    showToast(`Ecossistema gerado: ${n} primordial(is), ${novos.length} espécie(s) no total.`);
  };

  return (
    <Section title="Fase 3 · Biologia" accent="text-emerald-500">
      <div className="flex flex-wrap gap-2 mb-4">
        <BotaoPrimario onClick={() => setModalEcossistema(true)}><Sparkles size={12} className="inline -mt-0.5 mr-1" />Gerar Ecossistema</BotaoPrimario>
        <button onClick={onCriarPrimordial} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-2"><Dices size={12} className="inline -mt-0.5 mr-1" />Criar Primordial Manualmente</button>
      </div>

      {primordiais.length === 0 && <div className="text-xs text-stone-600 py-6 text-center">Nenhuma espécie ainda. Gere um ecossistema ou crie um primordial manualmente.</div>}

      <div className="space-y-4">
        {primordiais.map((prim) => {
          const linhagem = nodes.filter((n) => n.primordialId === prim.id);
          return (
            <div key={prim.id}>
              <div className="text-[10px] uppercase tracking-widest text-stone-600 font-mono mb-1.5">{prim.clado} · {linhagem.length} espécie(s) na linhagem</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {linhagem.map((n) => (
                  <CardEspecie key={n.id} node={n} onClick={() => onAbrirViewer(n.id)} individuosCount={individuals.filter((i) => i.especieId === n.id).length} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modalEcossistema && <ModalGerarEcossistema eraAtual={eraAtual} onGerar={gerarEcossistema} onFechar={() => setModalEcossistema(false)} />}
    </Section>
  );
}

/* ============================================================
   LOG DO ECOSSISTEMA
   ============================================================ */
function PainelLog({ eventLog }) {
  const [expandido, setExpandido] = useState(false);
  const itens = expandido ? eventLog : eventLog.slice(-8);
  return (
    <Section title="Histórico de Eventos" accent="text-stone-500" right={eventLog.length > 8 && <button onClick={() => setExpandido((v) => !v)} className="text-[10px] font-mono text-stone-500 hover:text-emerald-400">{expandido ? "recolher" : `ver todos (${eventLog.length})`}</button>}>
      {eventLog.length === 0 ? <div className="text-xs text-stone-600">Nenhum evento ainda.</div> : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {itens.slice().reverse().map((e) => (
            <div key={e.seq} className="text-[11px] font-data border-l-2 border-stone-800 pl-2 py-0.5">
              <span className="text-stone-600">[#{e.seq}]</span> <span className="text-emerald-600">{e.tipoLabel}</span> <span className="text-stone-400">{e.clado}</span>
              <div className="text-stone-600">{e.texto}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
