/* ============================================================
   v34 — MONTADOR MANUAL DE DNA
   ============================================================

   Relato: "tentei criar o ser humano manualmente, mas o motor de gerar
   primordial só permite bactéria — está excelente! Mas essa construção é
   necessária, então podemos colocar ela no motor de busca por seeds."

   A sugestão é a certa e foi seguida. O raciocínio por trás dela:

   O motor de primordial NÃO deve afrouxar. Toda forma primordial é
   bactéria, e isso é uma decisão de mundo — o humanoide tem que ser
   alcançado por especiação, não decretado na raiz. Afrouxar ali para
   permitir montar um humano destruiria a única regra que faz a árvore
   genealógica significar alguma coisa.

   Mas montar um humano gene a gene continua sendo necessário: é assim que
   se define o DESTINO. E o app já tinha as duas pontas do caminho —
   `buscarTrilhaReversa` acha uma trilha de deriva que chega num DNA-alvo
   partindo de uma bactéria, e "Gerar linhagem no mundo" materializa essa
   trilha em espécies reais. O que faltava era a ponta de cima: uma forma de
   PRODUZIR o DNA-alvo sem ter que escrever o código DRN2 à mão.

   Então o montador não cria espécie nenhuma. Ele produz um genoma
   arbitrário — sem trava de primordial, sem trava de bactéria, sob as
   mesmas travas de coerência de qualquer espécie derivada — e entrega esse
   genoma à busca no formato exato de um DNA colado. Dali em diante o
   caminho já existente assume: trilha reversa, e a linhagem inteira nasce
   no mundo, com o humano na ponta e uma bactéria na raiz.

   Em uma frase: a busca ganhou um teclado. O motor de primordial não mudou
   uma linha.
   ============================================================ */

/* Presets de ponto de partida. Não são "espécies prontas" — são só combinações
   iniciais que poupam vinte cliques antes de o usuário começar a ajustar. */
const PRESETS_MONTADOR = [
  { id: "livre", label: "Do zero (sorteado)", manual: {} },
  {
    id: "humanoide", label: "Humanoide",
    manual: {
      reino: "An", classe: "MAM", locPrimario: "B", memSup: "2S", memInf: "2I",
      memApendices: "0X", memTerm: "pa", asaQtd: 0, cdaComp: "0",
      crnFormato: "hu", facFocinho: "pl", facDenticao: "mx", facOlhosQtd: 2,
      memProp: "pr", morTorso: "pr", tegTipo: "Pe",
      socSencienciaBruta: 9, socEstrutura: "ba", repModo: "vv", repProle: 1,
      porte: "md", dieBase: "on", defEstrategia: "fu",
      /* Sem fixar a tolerância hídrica, 15% dos sorteios caíam em "aquático
         obrigatório" — e a trava de coerência então trocava o bipedalismo
         por natação ou modo serpentiforme, entregando um "humanoide" que
         nadava. Mesófilo é o valor que deixa o plano bípede de pé. */
      tolHidrica: "ms",
    },
  },
  {
    /* v39 — o preset "Humanoide" acima chega a hominídeo e para ali: ele não
       fixa nenhum dos 12 diagnósticos, então prognatismo, arcada e razão de
       membros caem no sorteio e o resultado oscila entre sapiens e
       australopiteco. Este preset fixa os doze e o tegumento nu — é o
       Homo sapiens pleno, não um humanoide genérico. */
    id: "humano", label: "Humano (Homo sapiens)",
    manual: {
      reino: "An", classe: "MAM", locPrimario: "B", memSup: "2S", memInf: "2I",
      memApendices: "0X", memTerm: "mo", asaQtd: 0, cdaComp: "0",
      crnFormato: "hu", facFocinho: "pl", facDenticao: "mx", facOlhosQtd: 2,
      facOlhosTipo: "rd", facOrelha: "rd", memProp: "pr", morTorso: "pr",
      tegTipo: "Cr", tegPadrao: "ls", crnChifreQtd: "0", crnCrista: "0", crnPescoco: "pr",
      socSencienciaBruta: 9, socEstrutura: "ba", repModo: "vv", repProle: 1,
      porte: "md", dieBase: "on", dieRestricao: "0", defEstrategia: "fu", defArma: "0",
      tolHidrica: "ms", tolTermica: "tp", tolCiclo: "di", simetria: "bi",
      senEspecial: "0", mag: "A0", repMaturacao: 7, repLongevidade: 7,
      termorregulacao: "el", pelagemDensidade: 0, dentesTipo: "hc",
      gestacao: "pl", glandulaMamaria: "fa",
      // os 12 diagnósticos
      facPrognatismo: "or", crnMento: "pj", crnToro: "au", crnAbobada: "gl",
      facNariz: "pj", facEsclera: "vi", memRazao: "pn", memPreensao: "pc",
      locPostura: "er", vocAparato: "ar", pelSudorese: 8, dimorfismo: 2,
    },
  },
  {
    id: "quadrupede", label: "Quadrúpede terrestre",
    manual: { reino: "An", classe: "MAM", locPrimario: "Q", memSup: "0S", memInf: "4I", asaQtd: 0, porte: "md", tolHidrica: "ms" },
  },
  {
    id: "reptil-alado", label: "Réptil alado",
    manual: { reino: "An", classe: "REP", locPrimario: "V", memSup: "0S", memInf: "2I", asaQtd: 2, asaTipo: "mb", tegTipo: "Es", tolHidrica: "ms" },
  },
  {
    id: "peixe", label: "Aquático",
    manual: { reino: "An", classe: "PSC", locPrimario: "N", memSup: "0S", memInf: "0I", asaQtd: 0, tolHidrica: "aq" },
  },
  {
    id: "planta", label: "Planta",
    manual: { reino: "Pl", locPrimario: "F", memSup: "0S", memInf: "0I", asaQtd: 0 },
  },
];

function Hammer(props) {
  return <Icon {...props}><path d="M15 12l-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9" /><path d="M17.6 6.4a2 2 0 0 0-2.8 0L12 9l3 3 2.8-2.8a2 2 0 0 0 0-2.8z" /><path d="M14 4l6 6" /></Icon>;
}

/* ------------------------------------------------------------
   O montador em si. `onUsar(genoma)` devolve o genoma pronto para
   quem chamou — na prática, a busca, que o trata como DNA colado.
   ------------------------------------------------------------ */
function MontadorDNA({ onUsar, onCancelar, showToast }) {
  const [overrides, setOverrides] = useState({});
  const [preset, setPreset] = useState("livre");
  /* isPrimordial = false, sempre e por definição. O montador existe
     justamente para o que NÃO é primordial; as travas de primordial (nasce
     bactéria, magia baixa, sem apêndice) não têm o que fazer aqui. */
  const [g, setG] = useState(() => buildSpecies(null, {}, false, false).g);

  const [dnaColado, setDnaColado] = useState("");
  const [avisoColagem, setAvisoColagem] = useState(null);

  /* v37 — ver 05-ui-especie.js para o diagnóstico completo: a edição aplica
     só o campo tocado, sobre o genoma da tela, com normalização ESTÁVEL
     (mesma edição -> mesmo resultado). É o que impede o arrasto do slider de
     embaralhar o resto da criatura. */
  const aplicarEdicao = (chave, valor) => {
    setG((atual) => normalizarGenomaEstavel({ ...atual, [chave]: valor }, false));
  };
  const gerarDoZero = (novos, baseManual) => {
    const built = buildSpecies(null, { ...(baseManual ?? presetAtualManual()), ...novos }, false, false);
    setG(built.g);
  };
  const presetAtualManual = () => (PRESETS_MONTADOR.find((p) => p.id === preset) || {}).manual || {};

  const aplicarPreset = (id) => {
    const base = (PRESETS_MONTADOR.find((p) => p.id === id) || {}).manual || {};
    setPreset(id);
    setOverrides({});
    gerarDoZero({}, base); // troca de preset é recomeço deliberado, não edição
  };
  const setCampo = (chave, valor) => {
    setOverrides((o) => ({ ...o, [chave]: valor }));
    aplicarEdicao(chave, valor);
  };

  /* ------------------------------------------------------------
     v37 — COLAR UM DNA PARA EDITAR
     ------------------------------------------------------------
     Pedido: "implementar a possibilidade de colar um DNA na construção
     manual para editar ele."

     Não precisou de parser novo: `parseAlvoDLDoCode` já lê o código DRN2
     COMPLETO desde a v26 (os quatro campos concatenados sem separador são
     desambiguados casando com os valores reais das tabelas, não por posição
     de caractere). Ele é a mesma leitura que a busca por DNA-alvo usa, o
     que garante por construção que colar aqui e colar lá entendem o mesmo
     código do mesmo jeito.

     O código lido entra como conjunto de overrides — ou seja, todo gene que
     veio no código fica FIXADO. Isso importa: sem isso, "resortear o que não
     foi fixado" jogaria fora o DNA que o usuário acabou de colar. Depois da
     leitura, `normalizarGenoma` fecha as lacunas (um código pode omitir
     blocos, como ASA e CDA quando a espécie não os tem) e aplica as travas.

     Relatamos quantos genes o código trouxe e quantos a trava teve de
     ajustar — se o código veio de uma versão antiga ou foi editado à mão,
     é aí que o usuário vê. */
  const colarDNA = () => {
    const texto = dnaColado.trim();
    if (!texto) return;
    if (!ehCodigoDRN2(texto)) {
      setAvisoColagem({ erro: true, texto: "Isso não parece um código DRN2. Ele começa com \"DRN2-\" e traz blocos como TAX:, MOR:, LOC:." });
      return;
    }
    /* `genomaDeCodigoDRN2` já existe no motor desde a v27 e é EXATAMENTE a
       reconstrução que este botão precisa — não escrevi uma nova. Ela
       resolve três coisas que uma leitura ingênua erra, e eu errei antes de
       encontrá-la (medido: 66% dos códigos não voltavam idênticos):

       - genes DERIVADOS (socSenciencia vem de socSencienciaBruta): escrever
         o valor visível não adianta, porque a normalização recalcula a
         partir da fonte. Ela ajusta a fonte pelo delta, em rodadas.
       - campos-ESPELHO (memInf guarda o estado em memInfRaw): idem.
       - ANOMALIAS: a quantidade é derivada de `extremos`; só QUAIS são pode
         ser fixado.

       Usar a mesma função da busca por DNA garante, por construção, que
       colar aqui e colar na busca entendem o mesmo código do mesmo jeito. */
    let reconstruido;
    try { reconstruido = genomaDeCodigoDRN2(texto, false); }
    catch { reconstruido = null; }
    if (!reconstruido) {
      setAvisoColagem({ erro: true, texto: "O código foi lido, mas não trouxe nenhum gene reconhecível." });
      return;
    }
    /* Os genes que vieram no código ficam FIXADOS como override — senão
       "resortear o que não foi fixado" jogaria fora o DNA recém-colado.
       Ficam de fora os derivados e o `memInf`, que o motor recalcula
       sozinho e que fixados apareceriam como "ajustados pela trava" sem
       nada de errado ter acontecido. */
    const lido = parseAlvoDLDoCode(texto);
    const overridesNovos = {};
    let ajustados = 0;
    for (const [k, v] of Object.entries(lido)) {
      if (v === undefined || v === "" || k.startsWith("__")) continue;
      if (GENES_SEMPRE_DERIVADOS.has(k) || k === "memInf") continue;
      overridesNovos[k] = reconstruido[k];
      if (String(reconstruido[k]) !== String(v)) ajustados++;
    }
    setG(reconstruido);
    setOverrides(overridesNovos);
    setPreset("livre");
    const total = Object.keys(overridesNovos).length;
    const fiel = serialize(reconstruido) === texto.trim();
    setAvisoColagem({
      erro: false,
      texto: `DNA carregado: ${total} gene(s) lidos e fixados.` +
        (fiel ? " O código reconstruído bate exatamente com o colado."
              : ajustados ? ` ${ajustados} gene(s) foram ajustados pelas travas de coerência — o código pedia algo que a classe/reino não permite.`
              : " Alguns campos derivados podem diferir do código original."),
    });
  };
  const resortear = () => gerarDoZero(overrides); // mantém overrides, resorteia o resto do zero

  const issues = useMemo(() => validarCoerencia(g), [g]);
  const erros = issues.filter((i) => i.severidade === "erro");
  const avisos = issues.filter((i) => i.severidade === "aviso");
  const pesoCal = useMemo(() => calcularPesoCalorias(g), [g]);
  const code = useMemo(() => serialize(g), [g]);

  /* v37 — chamava `recalcular`, que não existe desde a v36: o botão
     "corrigir" dos avisos de coerência lançava ReferenceError. Mesmo bug
     estava no editor de espécie (05-ui-especie.js), corrigido junto. */
  const aplicarCorrecao = (issue) => {
    const g2 = clonarGenoma(g);
    issue.corrigir(g2);
    const novos = { ...overrides };
    for (const k of Object.keys(g2)) if (g2[k] !== g[k]) novos[k] = g2[k];
    setOverrides(novos);
    setG(normalizarGenomaEstavel(g2, false));
  };

  const copiarCodigo = () => { navigator.clipboard?.writeText(code); showToast("DNA copiado."); };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-stone-500 leading-relaxed">
        Monte o genoma gene a gene, sem as travas de forma primordial. Isto não cria
        espécie nenhuma — produz um <span className="text-stone-300">DNA-alvo</span>.
        Depois de usar, o resultado cai na busca, de onde a trilha reversa reconstrói
        a linhagem inteira desde uma bactéria até ele.
      </p>

      {/* v37 — colar um DNA existente para editar */}
      <div className="rounded border border-stone-800 p-2.5 space-y-1.5">
        <label className="text-[10px] uppercase text-stone-500 font-mono">Colar um DNA para editar</label>
        <textarea value={dnaColado} onChange={(e) => { setDnaColado(e.target.value); setAvisoColagem(null); }} rows={2}
          placeholder="DRN2-TAX:An.REP-MOR:gr.5.bi..."
          className="w-full text-[10px] font-mono bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-stone-300 placeholder-stone-600 focus:border-emerald-700 focus:outline-none" />
        <div className="flex gap-2">
          <button onClick={colarDNA} disabled={!dnaColado.trim()}
            className={`text-[11px] font-mono uppercase border rounded px-3 py-1.5 ${dnaColado.trim() ? "border-emerald-800 text-emerald-400 hover:bg-emerald-950/30" : "border-stone-800 text-stone-600"}`}>
            <Check size={12} className="inline -mt-0.5 mr-1" />Carregar DNA
          </button>
          <button onClick={() => { setDnaColado(code); setAvisoColagem(null); }}
            className="text-[11px] font-mono uppercase text-stone-500 hover:text-stone-300 border border-stone-800 rounded px-3 py-1.5">
            usar o atual
          </button>
        </div>
        {avisoColagem && (
          <p className={`text-[10px] ${avisoColagem.erro ? "text-red-400" : "text-emerald-500"}`}>{avisoColagem.texto}</p>
        )}
        <p className="text-[10px] text-stone-600">
          Todo gene que vier no código fica fixado, então "resortear" não o descarta.
          Serve tanto para retomar uma criatura anotada quanto para partir de uma espécie que já existe no mundo.
        </p>
      </div>

      <div>
        <label className="text-[10px] uppercase text-stone-500 font-mono">Ponto de partida</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {PRESETS_MONTADOR.map((p) => (
            <button key={p.id} onClick={() => aplicarPreset(p.id)}
              className={`px-2.5 py-1.5 rounded border text-[11px] ${preset === p.id
                ? "border-emerald-700 bg-emerald-950/30 text-emerald-200"
                : "border-stone-800 text-stone-400 hover:border-stone-600"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-stone-600 mt-1">
          Só um atalho: qualquer gene continua editável abaixo, inclusive os que o preset fixou.
        </p>
      </div>

      <ListaGruposEditaveis g={g} setCampo={setCampo} overridesAtivos={new Set(Object.keys(overrides))} isPrimordial={false} />

      <button onClick={resortear} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-2">
        <Dices size={12} className="inline -mt-0.5 mr-1" />Resortear o que não foi fixado
      </button>

      <div className="rounded border border-stone-800 bg-stone-900/40 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 text-[10px] font-mono text-stone-500 break-all">{code}</div>
          <button onClick={copiarCodigo} className="shrink-0 text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-2 py-1.5"><Copy size={12} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-stone-500">Peso: </span><span className="text-stone-200 font-data">{fmtKg(pesoCal.pesoKg)}</span></div>
          <div><span className="text-stone-500">Altura ref.: </span><span className="text-stone-200 font-data">{fmtNum(pesoCal.alturaM)} m</span></div>
        </div>
        <p className="text-xs text-stone-400 leading-relaxed">{describeCreatureProse(g)}</p>
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

      <div className="flex gap-2">
        <BotaoPrimario disabled={erros.length > 0} onClick={() => onUsar(g)}>
          {erros.length > 0 ? `Corrija ${erros.length} erro(s)` : <><Check size={12} className="inline -mt-0.5 mr-1" />Usar como DNA-alvo</>}
        </BotaoPrimario>
        <button onClick={onCancelar} className="text-[11px] font-mono uppercase text-stone-500 px-3">cancelar</button>
      </div>
    </div>
  );
}
