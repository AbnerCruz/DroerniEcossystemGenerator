/* ============================================================
   PATCHNOTES — lê patchnotes-manifest.json (lista de versões,
   mais recente primeiro) e o .md de cada uma sob demanda. Exige
   servir via http(s) (GitHub Pages, ou "python3 -m http.server"
   localmente) — fetch() de arquivo local (file://) é bloqueado
   pelo navegador por CORS, isso não é um bug do app.

   Tudo na raiz do projeto (sem subpastas) de propósito — só assim
   dá pra fazer upload direto pelo app do GitHub no celular, que
   não aceita upload de pastas.

   Pra adicionar uma versão nova no futuro: crie
   patchnotes-vXX.md e adicione uma entrada no TOPO da lista em
   patchnotes-manifest.json (o item [0] é sempre o padrão aberto).
   ============================================================ */
function PainelPatchnotes({ onFechar }) {
  const [manifest, setManifest] = useState(null);
  const [selecionadoId, setSelecionadoId] = useState(null);
  const [conteudo, setConteudo] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("patchnotes-manifest.json")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((lista) => {
        setManifest(lista);
        if (lista.length) setSelecionadoId(lista[0].id); // [0] = mais recente, é sempre o padrão
        else setCarregando(false);
      })
      .catch((e) => { setErro(`Não foi possível carregar patchnotes-manifest.json (${e.message}). Certifique-se de estar servindo o app via http(s) — abrir o index.html direto pelo disco (file://) bloqueia o fetch.`); setCarregando(false); });
  }, []);

  useEffect(() => {
    if (!selecionadoId || !manifest) return;
    const item = manifest.find((m) => m.id === selecionadoId);
    if (!item) return;
    setCarregando(true); setErro("");
    fetch(item.arquivo)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then((md) => { setConteudo(md); setCarregando(false); })
      .catch((e) => { setErro(`Erro ao carregar ${item.arquivo} (${e.message}).`); setCarregando(false); });
  }, [selecionadoId, manifest]);

  const html = useMemo(() => {
    if (!conteudo) return "";
    return window.marked ? window.marked.parse(conteudo) : `<pre>${conteudo}</pre>`;
  }, [conteudo]);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-t-lg sm:rounded-lg w-full sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b border-stone-800 px-4 py-3 flex items-center justify-between shrink-0">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest flex items-center gap-2"><FileText size={16} />Patchnotes</h2>
          <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>

        {manifest && manifest.length > 0 && (
          <div className="border-b border-stone-800 px-4 py-2 flex gap-1.5 overflow-x-auto shrink-0">
            {manifest.map((item, i) => (
              <button key={item.id} onClick={() => setSelecionadoId(item.id)}
                className={`shrink-0 text-[11px] font-mono px-2.5 py-1 rounded border whitespace-nowrap ${selecionadoId === item.id ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-500 hover:text-stone-300"}`}>
                {item.titulo || item.id}{i === 0 && <span className="ml-1.5 text-emerald-600">· atual</span>}
              </button>
            ))}
          </div>
        )}

        <div className="p-5 overflow-y-auto flex-1">
          {carregando && <div className="text-xs text-stone-600">Carregando…</div>}
          {erro && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-3">{erro}</div>}
          {!carregando && !erro && (
            <div className="prose-patchnotes text-sm text-stone-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>
    </div>
  );
}
