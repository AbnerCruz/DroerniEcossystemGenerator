/* ============================================================
   v32 — FILTROS, LINHA DO TEMPO E MOTOR DE TRILHA MULTI-ALVO
   ============================================================
   Três peças de interface que compartilham o mesmo problema: dar acesso a
   uma árvore que hoje pode ter milhares de nós sem obrigar o usuário a
   rolar por ela.

   - PainelFiltros    desenha-se sozinho a partir de FILTROS_ESPECIE
                      (01-core-motor.js). Não há uma linha de UI por gene:
                      acrescentar um filtro no motor faz o controle aparecer
                      aqui de graça.
   - SliderEras       corte temporal — mostra o mundo como ele era num AU.
   - ModalTrilhaMultiAlvo   o "adicionar DNA alvo" quantas vezes quiser,
                      alimentando gerarLinhagemMultiAlvo.
   ============================================================ */

/* ---------- controles genéricos ---------- */

function ChipOpcao({ ativo, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-data px-1.5 py-0.5 rounded border transition-colors ${
        ativo ? "border-emerald-700 bg-emerald-950/60 text-emerald-400" : "border-stone-800 text-stone-500 hover:text-stone-300"
      }`}
    >
      {children}
    </button>
  );
}

function FiltroMulti({ filtro, valor, onChange, ctx }) {
  const opcoes = useMemo(() => filtro.opcoes(ctx) || [], [filtro, ctx]);
  const marcados = valor || [];
  const alternar = (v) =>
    onChange(marcados.includes(v) ? marcados.filter((x) => x !== v) : [...marcados, v]);
  if (!opcoes.length) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-stone-500 font-mono">{filtro.label}</span>
        {marcados.length > 0 && (
          <button onClick={() => onChange([])} className="text-[9px] font-mono uppercase text-stone-600 hover:text-red-400">limpar</button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {opcoes.map((o) => (
          <ChipOpcao key={o.value} ativo={marcados.includes(o.value)} onClick={() => alternar(o.value)}>
            {o.label}
          </ChipOpcao>
        ))}
      </div>
    </div>
  );
}

function FiltroFaixa({ filtro, valor, onChange }) {
  const v = valor || {};
  const set = (campo, texto) => {
    const num = texto === "" ? undefined : Number(texto);
    onChange({ ...v, [campo]: Number.isFinite(num) ? num : undefined });
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-stone-500 font-mono">{filtro.label}</span>
        {(v.min !== undefined || v.max !== undefined) && (
          <button onClick={() => onChange({})} className="text-[9px] font-mono uppercase text-stone-600 hover:text-red-400">limpar</button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input type="number" inputMode="decimal" placeholder="mín" value={v.min ?? ""} onChange={(e) => set("min", e.target.value)}
          className="w-full text-[11px] font-data bg-stone-950 border border-stone-800 rounded px-2 py-1 text-stone-300 placeholder-stone-700 focus:border-emerald-700 focus:outline-none" />
        <span className="text-stone-700 text-xs">–</span>
        <input type="number" inputMode="decimal" placeholder="máx" value={v.max ?? ""} onChange={(e) => set("max", e.target.value)}
          className="w-full text-[11px] font-data bg-stone-950 border border-stone-800 rounded px-2 py-1 text-stone-300 placeholder-stone-700 focus:border-emerald-700 focus:outline-none" />
      </div>
    </div>
  );
}

function FiltroBool({ filtro, valor, onChange }) {
  /* Três estados de propósito: sim, não e desligado. Um checkbox comum só
     tem dois, e "desmarcado" acabaria significando "só as que NÃO têm" — o
     que filtraria sem o usuário ter pedido nada. */
  const opcoes = [
    { v: true, rotulo: "sim" },
    { v: false, rotulo: "não" },
    { v: null, rotulo: "tanto faz" },
  ];
  const atual = typeof valor === "boolean" ? valor : null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1">{filtro.label}</div>
      <div className="flex gap-1">
        {opcoes.map((o) => (
          <ChipOpcao key={String(o.v)} ativo={atual === o.v} onClick={() => onChange(o.v === null ? undefined : o.v)}>
            {o.rotulo}
          </ChipOpcao>
        ))}
      </div>
    </div>
  );
}

/* ---------- painel completo ---------- */

function PainelFiltros({ estado, setEstado, ctx, totalNodes, totalVisiveis }) {
  const [aberto, setAberto] = useState(false);
  const [grupoAberto, setGrupoAberto] = useState(GRUPO_FILTRO.TAXONOMIA);
  const ativos = contarFiltrosAtivos(estado);

  const grupos = useMemo(() => {
    const m = new Map();
    for (const f of FILTROS_ESPECIE) {
      if (!m.has(f.grupo)) m.set(f.grupo, []);
      m.get(f.grupo).push(f);
    }
    return [...m.entries()];
  }, []);

  const setCampo = (id, valor) =>
    setEstado((e) => ({ ...e, campos: { ...(e.campos || {}), [id]: valor } }));

  const limparTudo = () => setEstado((e) => ({ ...e, campos: {}, texto: "" }));

  return (
    <div className="rounded border border-stone-800 bg-stone-950/40 mb-3">
      <div className="flex items-center gap-2 p-2">
        <input
          type="text"
          value={estado.texto || ""}
          onChange={(e) => setEstado((s) => ({ ...s, texto: e.target.value }))}
          placeholder="Buscar por id de linhagem ou trecho do DNA (ex.: TAX:An.MAM)"
          className="flex-1 min-w-0 text-[11px] font-mono bg-stone-900 border border-stone-800 rounded px-2.5 py-1.5 text-stone-300 placeholder-stone-600 focus:border-emerald-700 focus:outline-none"
        />
        <button
          onClick={() => setAberto((v) => !v)}
          className={`text-[10px] font-mono uppercase px-2.5 py-1.5 rounded border shrink-0 ${
            ativos > 0 ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-500 hover:text-stone-300"
          }`}
        >
          Filtros{ativos > 0 ? ` (${ativos})` : ""}
        </button>
      </div>

      {(ativos > 0 || aberto) && (
        <div className="px-2 pb-2 text-[10px] font-mono text-stone-600 flex items-center gap-2">
          <span>{totalVisiveis} de {totalNodes} espécie(s)</span>
          {ativos > 0 && (
            <button onClick={limparTudo} className="text-stone-500 hover:text-red-400 uppercase">limpar todos</button>
          )}
        </div>
      )}

      {aberto && (
        <div className="border-t border-stone-800 p-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            {grupos.map(([nome]) => (
              <ChipOpcao key={nome} ativo={grupoAberto === nome} onClick={() => setGrupoAberto(nome)}>{nome}</ChipOpcao>
            ))}
          </div>
          <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
            {grupos
              .filter(([nome]) => nome === grupoAberto)
              .flatMap(([, lista]) => lista)
              .map((f) => {
                const valor = (estado.campos || {})[f.id];
                const comum = { filtro: f, valor, onChange: (v) => setCampo(f.id, v), ctx };
                if (f.tipo === "multi") return <FiltroMulti key={f.id} {...comum} />;
                if (f.tipo === "faixa") return <FiltroFaixa key={f.id} {...comum} />;
                return <FiltroBool key={f.id} {...comum} />;
              })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- slider de eras / linha do tempo ---------- */

/* Corte temporal. A escala é o AU (1 AU = 1 milhão de anos), e os limites
   saem do próprio mundo: do primeiro primordial ao ano corrente. Os "marcos"
   (ausRelevantes) viram degraus clicáveis, porque num mundo com milhares de
   espécies arrastar o dedo até o AU exato de um evento é impossível no
   celular — o slider dá a varredura, os marcos dão a precisão. */
function SliderEras({ nodes, eras, anoAtual, au, setAu }) {
  const limites = useMemo(() => {
    let min = Infinity, max = 0;
    for (const n of nodes) {
      if (n.auSurgimento < min) min = n.auSurgimento;
      if (n.auSurgimento > max) max = n.auSurgimento;
      if (typeof n.auExtincao === "number" && n.auExtincao > max) max = n.auExtincao;
    }
    if (!Number.isFinite(min)) min = 0;
    max = Math.max(max, anoAtual || 0, min + 1);
    return { min, max };
  }, [nodes, anoAtual]);

  const ligado = Number.isFinite(au);
  const valor = ligado ? au : limites.max;
  const passo = Math.max((limites.max - limites.min) / 1000, 1e-6);

  const eraDoAu = useMemo(() => eraVigenteEmAU(eras, valor), [eras, valor]);
  const vivas = useMemo(
    () => (ligado ? nodes.filter((n) => n.auSurgimento <= valor && valor <= auFimDeVida(n)) .length : nodes.filter((n) => !n.extinta).length),
    [nodes, valor, ligado]
  );

  return (
    <div className="rounded border border-stone-800 bg-stone-950/40 p-2.5 mb-3">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[10px] uppercase tracking-widest text-stone-500 font-mono">Linha do tempo</span>
        <button
          onClick={() => setAu(ligado ? null : limites.max)}
          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
            ligado ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-500 hover:text-stone-300"
          }`}
        >
          {ligado ? "corte ligado" : "mundo inteiro"}
        </button>
      </div>

      <input
        type="range"
        min={limites.min}
        max={limites.max}
        step={passo}
        value={valor}
        onChange={(e) => setAu(Number(e.target.value))}
        className="w-full accent-emerald-600"
      />

      <div className="flex items-center justify-between text-[10px] font-mono text-stone-600 mt-1">
        <span>{fmtAU(limites.min)}</span>
        <span className={ligado ? "text-emerald-500" : "text-stone-500"}>
          {ligado ? fmtAU(valor) : "sem corte"} · {vivas} espécie(s)
          {eraDoAu ? ` · ${eraDoAu.nome}` : ""}
        </span>
        <span>{fmtAU(limites.max)}</span>
      </div>

      {ligado && (
        <p className="text-[10px] text-stone-600 mt-1.5">
          Mostrando o mundo como ele era em {fmtAU(valor)}: só espécies já surgidas e ainda não extintas nesse ano.
        </p>
      )}
    </div>
  );
}

/* ---------- motor de trilha multi-alvo ---------- */

function ModalTrilhaMultiAlvo({ eraAtual, nodesDisponiveis, onGerar, onFechar, rodando, progresso, relatorio }) {
  const [alvos, setAlvos] = useState([]);
  const [rascunho, setRascunho] = useState("");
  const [origemId, setOrigemId] = useState(""); // "" = ancestral primordial hipotético
  const [massaId, setMassaId] = useState(eraAtual?.massas?.[0]?.id || "");
  const [auInicial, setAuInicial] = useState("0");
  const [erro, setErro] = useState("");

  const adicionar = () => {
    const codigo = rascunho.trim();
    if (!codigo) return;
    if (!ehCodigoDRN2(codigo)) { setErro("Isso não parece um código DRN2 (deve começar com DRN2- e trazer os blocos TAX:, MOR: etc.)."); return; }
    if (alvos.includes(codigo)) { setErro("Esse DNA já está na lista."); return; }
    setAlvos((a) => [...a, codigo]);
    setRascunho("");
    setErro("");
  };
  const remover = (i) => setAlvos((a) => a.filter((_, k) => k !== i));

  const sortearAlvo = () => {
    /* Atalho honesto: sorteia uma espécie completa e joga o código dela no
       campo. Serve pra montar uma linhagem inteira sem ter um DNA de
       origem externa em mãos — que é o caso mais comum quando se está só
       explorando. */
    const g = buildSpecies(null, {}, false, false).g;
    setRascunho(serialize(g));
    setErro("");
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-t-lg sm:rounded-lg w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-950 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest">Motor de Trilha · vários DNAs-alvo</h2>
          {!rodando && <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>}
        </div>

        <div className="p-4 space-y-3">
          {rodando ? (
            <BarraProgresso fracao={progresso} label={`Buscando trilha ${Math.min(alvos.length, Math.ceil(progresso * alvos.length) + 1)} de ${alvos.length}…`} />
          ) : (
            <>
              <p className="text-[11px] text-stone-500">
                Cada DNA-alvo vira um ramo. O primeiro define o tronco; os seguintes se
                penduram no nó já existente mais próximo geneticamente deles — então dois
                alvos parecidos divergem tarde e dois muito diferentes divergem perto da raiz.
                Alvos parecidos compartilham ancestrais de verdade, sem você precisar dizer isso.
              </p>

              <div>
                <label className="text-[10px] uppercase text-stone-500 font-mono">Adicionar DNA-alvo (código DRN2)</label>
                <textarea
                  value={rascunho}
                  onChange={(e) => { setRascunho(e.target.value); setErro(""); }}
                  placeholder="DRN2-TAX:An.REP.Xyz-MOR:..."
                  rows={2}
                  className="w-full text-[11px] font-mono bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-stone-300 placeholder-stone-600 focus:border-emerald-700 focus:outline-none"
                />
                <div className="flex gap-2 mt-1.5">
                  <button onClick={adicionar} disabled={!rascunho.trim()}
                    className="text-[10px] font-mono uppercase text-emerald-400 hover:text-emerald-200 border border-emerald-900 rounded px-2.5 py-1 disabled:opacity-40">
                    + adicionar alvo
                  </button>
                  <button onClick={sortearAlvo} className="text-[10px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-2.5 py-1">
                    <Dices size={11} className="inline -mt-0.5 mr-1" />sortear um
                  </button>
                </div>
                {erro && <div className="text-[10px] text-red-400 mt-1">{erro}</div>}
              </div>

              {alvos.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase text-stone-500 font-mono">{alvos.length} alvo(s) na fila</div>
                  {alvos.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 rounded border border-stone-800 bg-stone-900/40 px-2 py-1.5">
                      <span className="text-[10px] font-mono text-emerald-700 shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-[9px] font-mono text-stone-400 break-all flex-1">{a}</span>
                      <button onClick={() => remover(i)} className="text-stone-600 hover:text-red-500 shrink-0"><Trash size={12} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] uppercase text-stone-500 font-mono">Partir de</label>
                  <select value={origemId} onChange={(e) => setOrigemId(e.target.value)}
                    className="bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-xs text-stone-200 w-full">
                    <option value="">Ancestral primordial novo (bactéria sorteada)</option>
                    {(nodesDisponiveis || []).map((n) => (
                      <option key={n.id} value={n.id}>{n.linhagemId} · {REINO_CURTO[n.g.reino] || n.g.reino}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-stone-500 font-mono">AU inicial</label>
                  <CampoNumero value={auInicial} onChange={setAuInicial} placeholder="0" />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-stone-500 font-mono">Massa de terra</label>
                  <select value={massaId} onChange={(e) => setMassaId(e.target.value)}
                    className="bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-xs text-stone-200 w-full">
                    {(eraAtual?.massas || []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
              </div>

              <BotaoPrimario disabled={alvos.length === 0}
                onClick={() => onGerar({ alvos, origemId: origemId || null, massaId, auInicial: Number(auInicial) || 0 })}>
                Gerar linhagem ramificada ({alvos.length} alvo{alvos.length === 1 ? "" : "s"})
              </BotaoPrimario>
            </>
          )}

          {relatorio && relatorio.length > 0 && !rodando && (
            <div className="space-y-1 pt-2 border-t border-stone-800">
              <div className="text-[10px] uppercase text-stone-500 font-mono">Resultado</div>
              {relatorio.map((r, i) => (
                <div key={i} className={`text-[10px] rounded border px-2 py-1.5 ${r.sucesso ? "border-emerald-900 bg-emerald-950/20 text-emerald-300" : "border-amber-900 bg-amber-950/20 text-amber-300"}`}>
                  Alvo {r.indice + 1}: {r.sucesso ? "bateu 100%" : "parcial"}
                  {r.ciclos !== undefined && ` · ${r.ciclos} ciclo(s) · ${r.nosCriados} nó(s)`}
                  {r.ancoraLinhagem ? ` · ramificou de ${r.ancoraLinhagem}` : " · linhagem-tronco"}
                  {r.motivo ? ` — ${r.motivo}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
