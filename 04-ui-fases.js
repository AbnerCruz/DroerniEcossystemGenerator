/* ============================================================
   ÍCONES — SVG local (portado verbatim do v16)
   ============================================================ */
function Icon({ size = 24, className = "", children }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>;
}
function Dna(props) { return <Icon {...props}><path d="M2 15c6.667-6 13.333 0 20-6" /><path d="M2 9c6.667 6 13.333 0 20 6" /><path d="M6 4l2 2" /><path d="M16 18l2 2" /><path d="M16 6l2-2" /><path d="M6 20l2-2" /></Icon>; }
function GitBranch(props) { return <Icon {...props}><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></Icon>; }
function Sparkles(props) { return <Icon {...props}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M5 3v3" /><path d="M19 17v3" /><path d="M3 19h3" /><path d="M17 5h3" /></Icon>; }
function Leaf(props) { return <Icon {...props}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></Icon>; }
function Download(props) { return <Icon {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Icon>; }
function Upload(props) { return <Icon {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Icon>; }
function Copy(props) { return <Icon {...props}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>; }
function Check(props) { return <Icon {...props}><polyline points="20 6 9 17 4 12" /></Icon>; }
function ChevronRight(props) { return <Icon {...props}><polyline points="9 18 15 12 9 6" /></Icon>; }
function ChevronDown(props) { return <Icon {...props}><polyline points="6 9 12 15 18 9" /></Icon>; }
function X(props) { return <Icon {...props}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>; }
function Dices(props) { return <Icon {...props}><rect x="2" y="2" width="10" height="10" rx="2" /><circle cx="6" cy="6" r="0.7" fill="currentColor" stroke="none" /><circle cx="10" cy="10" r="0.7" fill="currentColor" stroke="none" /><rect x="12" y="12" width="10" height="10" rx="2" /><circle cx="15" cy="15" r="0.7" fill="currentColor" stroke="none" /><circle cx="19" cy="15" r="0.7" fill="currentColor" stroke="none" /><circle cx="15" cy="19" r="0.7" fill="currentColor" stroke="none" /><circle cx="19" cy="19" r="0.7" fill="currentColor" stroke="none" /></Icon>; }
function Trash(props) { return <Icon {...props}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Icon>; }
function Info(props) { return <Icon {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></Icon>; }
function Lock(props) { return <Icon {...props}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Icon>; }
function AlertTriangle(props) { return <Icon {...props}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>; }
function User(props) { return <Icon {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>; }
function FileText(props) { return <Icon {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></Icon>; }

/* ============================================================
   HELPERS DE UI (portado verbatim do v16)
   ============================================================ */
const REINO_LABEL = { An: "Animal", Pl: "Planta", Fu: "Fungo", Ar: "Construto", Sp: "Espiritual" };
function sortNomeIndividuo() {
  const s = CONS[Math.floor(Math.random() * CONS.length)] + VOG[Math.floor(Math.random() * VOG.length)] +
    CONS[Math.floor(Math.random() * CONS.length)] + VOG[Math.floor(Math.random() * VOG.length)] +
    CONS[Math.floor(Math.random() * CONS.length)];
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function Section({ title, children, accent, right }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-mono text-[11px] uppercase tracking-[0.2em] ${accent || "text-emerald-500"}`}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
function Badge({ children, className }) {
  return <span className={`inline-block text-[10px] font-data px-1.5 py-0.5 rounded border ${className || "border-stone-700 text-stone-400"}`}>{children}</span>;
}
function BotaoPrimario({ children, onClick, disabled, className }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-4 py-2 rounded font-mono text-[11px] uppercase tracking-wider transition-colors ${disabled ? "bg-stone-800 text-stone-600 cursor-not-allowed" : "bg-emerald-600 text-emerald-950 hover:bg-emerald-500"} ${className || ""}`}>
      {children}
    </button>
  );
}
function CampoTexto({ value, onChange, placeholder, className }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    className={`bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-emerald-700 w-full ${className || ""}`} />;
}
function CampoNumero({ value, onChange, placeholder, step, className }) {
  return <input type="number" step={step || "any"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    className={`bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-emerald-700 w-full ${className || ""}`} />;
}
function fmtNum(n) { return (n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }); }
function fmtKg(kg) { return kg >= 1000 ? `${fmtNum(kg / 1000)} t` : `${fmtNum(kg)} kg`; }
function fmtAU(au) { return au === 0 ? "AU 0 (marco zero)" : `${fmtNum(au)} bi anos`; }

/* ============================================================
   BARRA DE FASES — indicador do fluxo linear travado
   ============================================================ */
function BarraFases({ faseAtual, geoOk, erasOk }) {
  const itens = [
    { n: 1, label: "Geografia", ok: geoOk },
    { n: 2, label: "Eras Geológicas", ok: erasOk },
    { n: 3, label: "Biologia", ok: false },
  ];
  return (
    <div className="flex items-center gap-2 mb-6 font-mono text-[10px] uppercase tracking-widest">
      {itens.map((it, i) => (
        <React.Fragment key={it.n}>
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border ${faseAtual === it.n ? "border-emerald-600 text-emerald-400 bg-emerald-950/40" : it.ok ? "border-stone-700 text-stone-400" : "border-stone-800 text-stone-600"}`}>
            {it.ok ? <Check size={12} /> : faseAtual === it.n ? <span>{it.n}</span> : <Lock size={12} />}
            <span>{it.label}</span>
          </div>
          {i < itens.length - 1 && <ChevronRight size={14} className="text-stone-700" />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ============================================================
   FASE 1 — GEOGRAFIA
   Cria as massas de terra da Era Inicial (nome + domínios
   climáticos). Ao confirmar, vira a Era 1 e desbloqueia a Fase 2.
   Bloqueio: não há como avançar com 0 massas.
   ============================================================ */
function FaseGeografia({ onConfirmar, jaConfirmada, eras }) {
  const [massas, setMassas] = useState([{ tempId: 1, nome: "Pangeia Primordial", dominios: [...DOMINIOS_CLIMATICOS] }]);
  const [nextId, setNextId] = useState(2);

  const addMassa = () => { setMassas((m) => [...m, { tempId: nextId, nome: `Massa ${nextId}`, dominios: [...DOMINIOS_CLIMATICOS] }]); setNextId((n) => n + 1); };
  const rmMassa = (tempId) => setMassas((m) => m.filter((x) => x.tempId !== tempId));
  const setNome = (tempId, nome) => setMassas((m) => m.map((x) => (x.tempId === tempId ? { ...x, nome } : x)));
  const toggleDominio = (tempId, dom) => setMassas((m) => m.map((x) => {
    if (x.tempId !== tempId) return x;
    const tem = x.dominios.includes(dom);
    const dominios = tem ? x.dominios.filter((d) => d !== dom) : [...x.dominios, dom];
    return { ...x, dominios };
  }));

  const podeConfirmar = massas.length > 0 && massas.every((m) => m.nome.trim() && m.dominios.length > 0);

  if (jaConfirmada) {
    const era1 = eras[0];
    return (
      <Section title="Fase 1 · Geografia" accent="text-emerald-500" right={<Badge className="border-emerald-800 text-emerald-500"><Check size={10} className="inline -mt-0.5 mr-1" />confirmada</Badge>}>
        <div className="text-sm text-stone-400 mb-2">{era1.massas.length} massa(s) de terra definida(s) na Era Inicial:</div>
        <div className="flex flex-wrap gap-2">
          {era1.massas.map((m) => (
            <Badge key={m.id} className="border-stone-700 text-stone-300">{m.nome} · {m.dominios.length} domínios</Badge>
          ))}
        </div>
      </Section>
    );
  }

  return (
    <Section title="Fase 1 · Geografia" accent="text-emerald-500" right={<Badge className="border-amber-800 text-amber-500">em edição</Badge>}>
      <p className="text-xs text-stone-500 mb-4">Defina as massas de terra do mundo no início (Era Inicial). Cada massa carrega os domínios climáticos que ela oferece — isso restringe quais biomas específicos existirão nela.</p>
      <div className="space-y-3">
        {massas.map((m) => (
          <div key={m.tempId} className="rounded border border-stone-800 p-3 bg-stone-950/50">
            <div className="flex items-center gap-2 mb-2">
              <CampoTexto value={m.nome} onChange={(v) => setNome(m.tempId, v)} placeholder="Nome da massa" />
              {massas.length > 1 && <button onClick={() => rmMassa(m.tempId)} className="text-stone-600 hover:text-red-500 shrink-0"><Trash size={14} /></button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DOMINIOS_CLIMATICOS.map((dom) => (
                <button key={dom} onClick={() => toggleDominio(m.tempId, dom)}
                  className={`text-[10px] font-data px-2 py-1 rounded border ${m.dominios.includes(dom) ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-600"}`}>
                  {dom}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={addMassa} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5">+ Massa de terra</button>
      </div>
      <div className="mt-4 pt-3 border-t border-stone-800">
        {!podeConfirmar && <div className="text-[11px] text-amber-600 mb-2 flex items-center gap-1"><AlertTriangle size={12} />Toda massa precisa de nome e ao menos 1 domínio climático.</div>}
        <BotaoPrimario disabled={!podeConfirmar} onClick={() => onConfirmar(massas)}>Confirmar Geografia →</BotaoPrimario>
      </div>
    </Section>
  );
}

/* ============================================================
   FASE 2 — ERAS GEOLÓGICAS
   A Era 1 já existe (vinda da Fase 1). Aqui o usuário pode
   adicionar eras subsequentes, opcionalmente dividindo massas
   existentes em novas massas (usa dividirEra do motor). Uma vez
   com ao menos a Era 1, pode confirmar e seguir pra Fase 3 —
   dividir não é obrigatório.
   ============================================================ */
function FaseEras({ eras, setEras, onConfirmar, jaConfirmada, bloqueada }) {
  const [criando, setCriando] = useState(false);
  const [nomeEra, setNomeEra] = useState("");
  const [auDivisao, setAuDivisao] = useState("");
  const eraAtual = eras[eras.length - 1];
  // planoPorMassa: massaId -> null (mantém) | [{nome,dominios}] (divide em N)
  const [planoPorMassa, setPlanoPorMassa] = useState({});

  if (bloqueada) {
    return (
      <Section title="Fase 2 · Eras Geológicas" accent="text-stone-600">
        <div className="flex items-center gap-2 text-sm text-stone-600"><Lock size={14} />Complete a Fase 1 (Geografia) primeiro.</div>
      </Section>
    );
  }

  const iniciarDivisao = (massaId) => setPlanoPorMassa((p) => ({ ...p, [massaId]: p[massaId] ? null : [{ nome: "", dominios: [...(eraAtual.massas.find((m) => m.id === massaId)?.dominios || [])] }, { nome: "", dominios: [...(eraAtual.massas.find((m) => m.id === massaId)?.dominios || [])] }] }));
  const addParteDivisao = (massaId) => setPlanoPorMassa((p) => ({ ...p, [massaId]: [...(p[massaId] || []), { nome: "", dominios: [...DOMINIOS_CLIMATICOS] }] }));
  const setNomeParte = (massaId, i, nome) => setPlanoPorMassa((p) => ({ ...p, [massaId]: p[massaId].map((x, idx) => (idx === i ? { ...x, nome } : x)) }));
  const toggleDomParte = (massaId, i, dom) => setPlanoPorMassa((p) => ({
    ...p, [massaId]: p[massaId].map((x, idx) => idx === i ? { ...x, dominios: x.dominios.includes(dom) ? x.dominios.filter((d) => d !== dom) : [...x.dominios, dom] } : x),
  }));

  const podeConfirmarEra = nomeEra.trim() && auDivisao !== "" && !isNaN(Number(auDivisao));

  const confirmarNovaEra = () => {
    const novasMassasPorAntiga = {};
    for (const [massaId, partes] of Object.entries(planoPorMassa)) {
      if (partes && partes.length && partes.every((p) => p.nome.trim())) novasMassasPorAntiga[massaId] = partes;
    }
    const { novaEra } = dividirEra(eraAtual, nomeEra.trim(), novasMassasPorAntiga, Number(auDivisao));
    setEras((e) => [...e, novaEra]);
    setCriando(false); setNomeEra(""); setAuDivisao(""); setPlanoPorMassa({});
  };

  return (
    <Section title="Fase 2 · Eras Geológicas" accent="text-emerald-500"
      right={jaConfirmada ? <Badge className="border-emerald-800 text-emerald-500"><Check size={10} className="inline -mt-0.5 mr-1" />confirmada</Badge> : <Badge className="border-amber-800 text-amber-500">em edição</Badge>}>
      <div className="space-y-2 mb-4">
        {eras.map((era, i) => (
          <div key={era.id} className="rounded border border-stone-800 p-2.5 bg-stone-950/50 flex items-center justify-between text-xs">
            <div><span className="font-mono text-stone-300">{era.nome}</span><span className="text-stone-600 ml-2">{fmtAU(era.auInicio)}</span></div>
            <div className="text-stone-500">{era.massas.length} massa(s): {era.massas.map((m) => m.nome).join(", ")}</div>
          </div>
        ))}
      </div>

      {!jaConfirmada && !criando && (
        <button onClick={() => setCriando(true)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5">+ Nova era (dividir geografia)</button>
      )}

      {!jaConfirmada && criando && (
        <div className="rounded border border-stone-800 p-3 bg-stone-950/50 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <CampoTexto value={nomeEra} onChange={setNomeEra} placeholder="Nome da era" />
            <CampoNumero value={auDivisao} onChange={setAuDivisao} placeholder="Início (bi anos, ex: 3.2)" />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500 font-mono">Para cada massa: manter como está, ou dividir em novas massas</div>
          {eraAtual.massas.map((massa) => (
            <div key={massa.id} className="border border-stone-800 rounded p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-stone-300 font-mono">{massa.nome}</span>
                <button onClick={() => iniciarDivisao(massa.id)} className="text-[10px] font-mono uppercase text-stone-500 hover:text-emerald-400">
                  {planoPorMassa[massa.id] ? "cancelar divisão" : "dividir esta massa"}
                </button>
              </div>
              {planoPorMassa[massa.id] && (
                <div className="space-y-2 pl-2 border-l border-stone-800">
                  {planoPorMassa[massa.id].map((parte, i) => (
                    <div key={i}>
                      <CampoTexto value={parte.nome} onChange={(v) => setNomeParte(massa.id, i, v)} placeholder={`Nova massa ${i + 1}`} />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {DOMINIOS_CLIMATICOS.map((dom) => (
                          <button key={dom} onClick={() => toggleDomParte(massa.id, i, dom)}
                            className={`text-[9px] font-data px-1.5 py-0.5 rounded border ${parte.dominios.includes(dom) ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-600"}`}>
                            {dom}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => addParteDivisao(massa.id)} className="text-[10px] text-stone-500 hover:text-emerald-400">+ outra parte</button>
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <BotaoPrimario disabled={!podeConfirmarEra} onClick={confirmarNovaEra}>Adicionar Era</BotaoPrimario>
            <button onClick={() => { setCriando(false); setPlanoPorMassa({}); }} className="text-[11px] font-mono uppercase text-stone-500 px-3">cancelar</button>
          </div>
        </div>
      )}

      {!jaConfirmada && (
        <div className="mt-4 pt-3 border-t border-stone-800">
          <BotaoPrimario onClick={onConfirmar}>Confirmar Eras →</BotaoPrimario>
          <div className="text-[10px] text-stone-600 mt-1.5">Dividir em mais eras é opcional — só a Era Inicial já é suficiente pra avançar.</div>
        </div>
      )}
    </Section>
  );
}
