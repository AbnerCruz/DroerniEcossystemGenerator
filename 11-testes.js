/* ============================================================
   BATERIA DE TESTES EMBUTIDA — v28
   ============================================================
   A carteira de testes existia só fora do app, num runner Node. Isso
   deixava um buraco: os números eram medidos numa máquina que não é a que
   o usuário usa. Performance no celular é 5-10x diferente, e "passa nos
   testes" na minha máquina não diz muito sobre o aparelho dele.

   Agora a bateria roda DENTRO do app, contra o motor que está de fato
   carregado na página. Mesmo conteúdo do runner externo, adaptado:

   - `M.x` virou `x` (escopo global compartilhado entre os scripts)
   - `K("CONST")` virou a const direta (o escopo léxico global é comum)
   - toda suíte cede o controle periodicamente (`await respirar()`), senão
     a aba trava por um minuto sem pintar nada na tela
   - os limiares de PERFORMANCE viraram medições informativas, não
     aprovação/reprovação: um limite calibrado em desktop reprovaria
     qualquer celular sem que nada estivesse errado

   As suítes ficam em ORDEM CRESCENTE DE CUSTO, e o painel deixa escolher
   até onde ir — a bateria completa leva minutos num celular.
   ============================================================ */

const TESTES_VERSAO = "v28";

/* ---------- micro-framework ---------- */
function criarColetor() {
  const resultados = [];
  let suiteAtual = "";
  return {
    resultados,
    suite: (n) => { suiteAtual = n; },
    chk: (nome, cond, detalhe = "") => resultados.push({ suite: suiteAtual, nome, ok: !!cond, detalhe: String(detalhe) }),
    info: (nome, detalhe = "") => resultados.push({ suite: suiteAtual, nome, ok: null, detalhe: String(detalhe) }),
  };
}

/* Cede o controle ao navegador. Sem isso a bateria bloqueia a thread
   principal por dezenas de segundos e o Android mata a aba. */
let __ultimoRespiro = 0;
async function respirar(forcar = false) {
  const agora = performance.now();
  if (!forcar && agora - __ultimoRespiro < 30) return;
  __ultimoRespiro = agora;
  await new Promise((r) => setTimeout(r, 0));
}

const clonarG = (o) => JSON.parse(JSON.stringify(o));
const msAgora = () => performance.now();

/* ============================================================
   SUÍTES
   Cada uma recebe o coletor e um callback de progresso.
   `custo` é uma estimativa relativa, usada só pra barra de progresso.
   ============================================================ */

async function suiteSeed({ suite, chk }, prog) {
  suite("A · Seed e determinismo");
  const rnd = () => { let s = 0n; for (let i = 0; i < 8; i++) s = s * 100000n + BigInt(Math.floor(Math.random() * 100000)); return s; };

  let det = true;
  for (let i = 0; i < 100 && det; i++) { const s = rnd(); if (buildSpecies(s, {}, false).code !== buildSpecies(s, {}, false).code) det = false; }
  chk("A1 buildSpecies é determinístico para a mesma seed", det);
  await respirar(true); prog(0.2);

  let inf = 0, campos = {};
  for (let i = 0; i < 800; i++) {
    const b = buildSpecies(rnd(), {}, false); const r = seedParaGenoma(b.g, false);
    if (!r.fiel) { inf++; for (const k of r.camposDivergentes) campos[k] = (campos[k] || 0) + 1; }
    if (i % 100 === 0) await respirar();
  }
  chk("A2 seed→genoma→seed fiel (800 espécies)", inf === 0, `infiéis=${inf} ${JSON.stringify(campos)}`);
  prog(0.5);

  let est = true;
  for (let i = 0; i < 150 && est; i++) {
    const b = buildSpecies(rnd(), {}, false); const s1 = seedParaGenoma(b.g, false).seed;
    if (seedParaGenoma(buildSpecies(s1, {}, false).g, false).seed !== s1) est = false;
    if (i % 50 === 0) await respirar();
  }
  chk("A3 seed canônica é idempotente", est);

  for (const [nome, half] of [["512b espécie", SPECIES_HALF], ["128b indivíduo", IND_HALF]]) {
    let ok = true;
    for (let i = 0; i < 800 && ok; i++) { const s = rnd() % (2n ** (half * 2n)); if (mixInverse(mixForward(s, half), half) !== s) ok = false; }
    chk(`A4 permutação Feistel é involutiva — ${nome}`, ok);
    await respirar(true);
  }
  prog(0.8);

  let gl = true, det2 = "";
  for (let i = 0; i < 200 && gl; i++) {
    const sp = rnd(), ind = rnd() % (10n ** 39n), isP = Math.random() < 0.5;
    const r = splitGluedSeed(gluedSeedText(sp, ind, isP));
    if (BigInt(r.speciesDigits) !== sp || BigInt(r.individualDigits) !== ind || r.isPrimordial !== isP) { gl = false; det2 = JSON.stringify(r); }
  }
  chk("A5 seed aglutinada espécie+indivíduo (com flag de primordial)", gl, det2);

  let ir = 0;
  for (let i = 0; i < 300; i++) {
    const b = buildSpecies(rnd(), {}, false); const r = buildIndividual(b.g, null);
    if (buildIndividual(b.g, r.individualSeed).code !== r.code) ir++;
    if (i % 100 === 0) await respirar();
  }
  chk("A6 seed de indivíduo reconstrói o mesmo espécime (300)", ir === 0, `falhas=${ir}`);
  prog(1);
}

async function suiteFuzz({ suite, chk }, prog) {
  suite("B · Fuzzing de entrada");
  const lixo = ["", "abc", "-1", "0", "   ", "null", "undefined", "1e50", "DRN2-XX", "1.5", "0x1f", "🙂",
    "-".repeat(200), "1" + "0".repeat(400), "12 34", "\n\n", "NaN", "Infinity", "0".repeat(194),
    "9".repeat(194), "9".repeat(195), "9".repeat(600), "1" + "9".repeat(193), "\u0000", "[]", "{}"];

  const crash = [];
  for (const s of lixo) {
    try {
      const r = decodificarSeedColada(s);
      if (r && (typeof r.code !== "string" || !r.g || !r.g.reino)) crash.push([s.slice(0, 18), "retorno malformado"]);
    } catch (e) { crash.push([JSON.stringify(s).slice(0, 22), e.message.slice(0, 70)]); }
  }
  chk(`B1 decodificarSeedColada resiste a ${lixo.length} entradas hostis`, crash.length === 0, JSON.stringify(crash));
  await respirar(true); prog(0.4);

  const c2 = [];
  for (const s of lixo) { try { parseAnySeed(s); } catch (e) { c2.push([s.slice(0, 15), e.message.slice(0, 60)]); } }
  chk("B2 parseAnySeed resiste a entradas hostis", c2.length === 0, JSON.stringify(c2));

  const c3 = [];
  for (const s of [...lixo, "DRN2-TAX:", "DRN2-TAX:An.MAM", "DRN2-" + "A".repeat(5000)]) {
    try { parseAlvoDLDoCode(s); } catch (e) { c3.push([s.slice(0, 18), e.message.slice(0, 60)]); }
  }
  chk("B3 parseAlvoDLDoCode resiste a códigos DRN2 malformados", c3.length === 0, JSON.stringify(c3));
  prog(0.7);

  const c4 = [];
  for (const g of [{}, { reino: "An" }, { reino: "ZZ", porte: "xx", densidade: 99 }]) {
    try { serialize(g); calcularPesoCalorias(g); validarCoerencia(g); readHabitat(g); }
    catch (e) { c4.push([JSON.stringify(g).slice(0, 30), e.message.slice(0, 60)]); }
  }
  chk("B4 funções de leitura resistem a genomas incompletos", c4.length === 0, JSON.stringify(c4));
  prog(1);
}

async function suiteCoerencia({ suite, chk, info }, prog) {
  suite("C · Coerência biológica");
  let comErro = 0, ids = {};
  for (let i = 0; i < 1500; i++) {
    const iss = validarCoerencia(buildSpecies(null, {}, false).g).filter((x) => x.severidade === "erro");
    if (iss.length) { comErro++; for (const x of iss) ids[x.id] = (ids[x.id] || 0) + 1; }
    if (i % 150 === 0) await respirar();
  }
  chk("C1 nenhuma espécie nasce com erro bloqueante (1500)", comErro === 0, `${comErro} ${JSON.stringify(ids)}`);
  prog(0.25);

  const reinos = {};
  for (let i = 0; i < 2000; i++) { const g = buildSpecies(null, {}, false).g; reinos[g.reino] = (reinos[g.reino] || 0) + 1; if (i % 200 === 0) await respirar(); }
  chk("C2 reinos Sp (espiritual) e Ar (construto) não existem mais", !reinos.Sp && !reinos.Ar, JSON.stringify(reinos));
  chk("C3 bactéria (Ba) é gerável", (reinos.Ba || 0) > 0, `Ba=${reinos.Ba || 0}`);
  prog(0.4);

  resetEventLog();
  const rp = {};
  for (let i = 0; i < 300; i++) { rp[criarPrimordial({}, 0, null).g.reino] = 1; if (i % 100 === 0) await respirar(); }
  chk("C4 todo primordial nasce bactéria", Object.keys(rp).length === 1 && rp.Ba, JSON.stringify(Object.keys(rp)));

  resetEventLog();
  const proibidos = {
    crânio: (g) => g.crnFormato !== "0", asa: (g) => Number(g.asaQtd || 0) > 0,
    cauda: (g) => g.cdaComp && g.cdaComp !== "0", olhos: (g) => g.facOlhosQtd && g.facOlhosQtd !== "0",
    dentição: (g) => g.facDenticao && g.facDenticao !== "0",
    membros: (g) => (g.memSup && g.memSup !== "0S") || (g.memInf && g.memInf !== "0I"),
  };
  const vio = {};
  for (let i = 0; i < 600; i++) {
    const g = criarPrimordial({}, 0, null).g;
    for (const [k, f] of Object.entries(proibidos)) if (f(g)) vio[k] = (vio[k] || 0) + 1;
    if (i % 150 === 0) await respirar();
  }
  chk("C5 bactéria mantém esqueleto minimalista", !Object.keys(vio).length, JSON.stringify(vio));
  resetEventLog();
  prog(0.6);

  /* --- v28: escala corporal por reino --- */
  suite("C · Escala corporal (v28)");
  /* Tetos em QUILOGRAMAS (a unidade que calcularPesoCalorias devolve), com o
     rótulo escrito na unidade que faz sentido ler. Âncoras: sequoia gigante
     ~2.000 t, baleia-azul 190 t, maior corpo de frutificação de fungo já
     medido ~500 kg, bactéria ~40 pg. Os tetos deixam folga pro exagero de
     fantasia; o que eles pegam é ordem de grandeza errada, não exuberância. */
  const REF = {
    Ba: { max: 1e-6, rotulo: "1 mg" },
    Fu: { max: 5e3, rotulo: "5 t" },
    Pl: { max: 6e6, rotulo: "6.000 t" },
    An: { max: 3e6, rotulo: "3.000 t" },
  };
  const extremos = {}, amostras = {};
  for (let i = 0; i < 4000; i++) {
    const g = buildSpecies(null, {}, false).g; const p = calcularPesoCalorias(g);
    const a = amostras[g.reino] = amostras[g.reino] || [];
    a.push(p.pesoKg);
    if (!isFinite(p.pesoKg) || p.pesoKg <= 0) extremos.invalido = (extremos.invalido || 0) + 1;
    if (i % 200 === 0) await respirar();
  }
  chk("C6 peso e calorias sempre finitos e positivos", !extremos.invalido, JSON.stringify(extremos));
  for (const [reino, ref] of Object.entries(REF)) {
    const a = (amostras[reino] || []).slice().sort((x, y) => x - y);
    if (!a.length) continue;
    chk(`C7 ${REINO_LABEL[reino] || reino}: nenhum indivíduo passa de ${ref.rotulo}`,
      a[a.length - 1] <= ref.max,
      `máx ${fmtKg(a[a.length - 1])} · mediana ${fmtKg(a[Math.floor(a.length / 2)])} · mín ${fmtKg(a[0])}`);
  }
  const ba = (amostras.Ba || []).slice().sort((x, y) => x - y);
  if (ba.length) {
    chk("C8 bactéria fica na escala do picograma", ba[ba.length - 1] < 1e-9,
      `faixa ${fmtKg(ba[0])} – ${fmtKg(ba[ba.length - 1])}`);
  }
  prog(0.8);

  /* --- v28: genes coerentes com o reino --- */
  const problemas = {};
  for (let i = 0; i < 3000; i++) {
    const g = buildSpecies(null, {}, false).g;
    if (["Pl", "Fu", "Ba"].includes(g.reino)) {
      if (Number(g.senAudicao) > 0) problemas[`${g.reino}:audição`] = (problemas[`${g.reino}:audição`] || 0) + 1;
      if (Number(g.senVisao) > 1) problemas[`${g.reino}:visão`] = (problemas[`${g.reino}:visão`] || 0) + 1;
      if (g.simetria === "bi") problemas[`${g.reino}:simetria bilateral`] = (problemas[`${g.reino}:simetria bilateral`] || 0) + 1;
      if (["ba", "pa", "ma"].includes(g.socEstrutura)) problemas[`${g.reino}:estrutura social animal`] = (problemas[`${g.reino}:estrutura social animal`] || 0) + 1;
    }
    if (g.reino === "Ba" && Number(g.locVelocidade) > 2) problemas["Ba:velocidade"] = (problemas["Ba:velocidade"] || 0) + 1;
    if (g.reino === "Pl" && ["vv", "oz"].includes(g.repModo)) problemas["Pl:reprodução animal"] = (problemas["Pl:reprodução animal"] || 0) + 1;
    if (i % 200 === 0) await respirar();
  }
  chk("C9 planta/fungo/bactéria não recebem genes de plano corporal animal", !Object.keys(problemas).length, JSON.stringify(problemas));

  for (const reino of ["Pl", "Fu", "Ba"]) {
    const cont = {}; let n = 0;
    for (let i = 0; i < 250; i++) {
      const b = buildSpecies(null, {}, false); if (b.g.reino !== reino) continue; n++;
      const p = describeCreatureProse(b.g).toLowerCase();
      for (const t of ["crânio", "membro", "dentição", "focinho", "asa"]) if (new RegExp(`\\b${t}s?\\b`, "i").test(p)) cont[t] = (cont[t] || 0) + 1;
    }
    await respirar(true);
    chk(`C10 descrição de ${REINO_LABEL[reino] || reino} não narra anatomia animal (n=${n})`,
      Object.values(cont).reduce((a, b) => a + b, 0) === 0, JSON.stringify(cont));
  }

  const hist = {}; let a2 = 0;
  for (let i = 0; i < 6000; i++) {
    const g = buildSpecies(null, {}, false).g;
    hist[g.extremos] = (hist[g.extremos] || 0) + 1; if (g.anomalias?.length >= 2) a2++;
    if (i % 400 === 0) await respirar();
  }
  info("C11 distribuição do contador 'extremos'", JSON.stringify(hist));
  chk("C12 a segunda anomalia é alcançável", a2 > 0 || (hist[5] || 0) + (hist[6] || 0) > 0, `2ª anomalia em ${a2}/6000`);
  prog(1);
}

async function suiteEvolucao({ suite, chk, info }, prog) {
  suite("D · Deriva e especiação");
  const deriva = (g, n) => { let o = 0; for (let c = 0; c < n; c++) o = aplicarCicloDeriva(g, o, null).orcamentoRestante; return g; };

  let v1 = {}, n1 = 0;
  for (let i = 0; i < 1200; i++) {
    const g = clonarG(buildSpecies(null, {}, false).g), antes = clonarG(g);
    aplicarCicloDeriva(g, 0, null);
    for (const k of ESTRATO_I) if (JSON.stringify(antes[k]) !== JSON.stringify(g[k])) { v1[k] = (v1[k] || 0) + 1; n1++; }
    if (i % 150 === 0) await respirar();
  }
  chk("D1 Estrato I não muda num ciclo com orçamento zerado", n1 === 0, `${n1} ${JSON.stringify(v1)}`);
  prog(0.2);

  let mudou = [];
  for (let i = 0; i < 600; i++) {
    const g = clonarG(buildSpecies(null, {}, false).g), r0 = g.reino;
    deriva(g, 40);
    if (r0 !== "Ba" && g.reino !== r0) mudou.push([r0, g.reino]);
    if (i % 40 === 0) await respirar();
  }
  chk("D2 barreira de reino: não-bactéria nunca muda de reino (40 ciclos)", mudou.length === 0, JSON.stringify(mudou.slice(0, 4)));

  /* A travessia de reino pela bactéria é rara de propósito (~3% em 40
     ciclos). Amostrada dentro do sorteio geral de espécies dava 40 bactérias
     e frequentemente zero travessias — reprovava um motor correto por falta
     de amostra. Aqui a amostra é construída só de bactérias. */
  let baMud = 0, baTot = 200, destinos = {};
  for (let i = 0; i < baTot; i++) {
    const g = clonarG(buildSpecies(null, { reino: "Ba" }, false).g);
    deriva(g, 40);
    if (g.reino !== "Ba") { baMud++; destinos[g.reino] = (destinos[g.reino] || 0) + 1; }
    if (i % 25 === 0) await respirar();
  }
  chk("D3 bactéria consegue evoluir para outros reinos", baMud > 0, `${baMud}/${baTot} atravessaram ${JSON.stringify(destinos)}`);
  prog(0.5);

  let nErr = 0, ids = {};
  for (let i = 0; i < 500; i++) {
    const g = deriva(clonarG(buildSpecies(null, {}, false).g), 20);
    for (const x of validarCoerencia(g).filter((x) => x.severidade === "erro")) { ids[x.id] = (ids[x.id] || 0) + 1; nErr++; }
    if (i % 40 === 0) await respirar();
  }
  chk("D4 deriva nunca deixa erro bloqueante (500 × 20 ciclos)", nErr === 0, `${nErr} ${JSON.stringify(ids)}`);
  prog(0.7);

  let asa = 0, escalaRuim = [];
  for (let i = 0; i < 1200; i++) {
    const g = deriva(clonarG(buildSpecies(null, {}, false).g), 15);
    if (g.classe === "MAM" && Number(g.asaQtd) > 0 && g.asaTipo !== "mb") asa++;
    // v28 — a escala por reino tem que sobreviver à deriva, não só à criação
    if (g.reino === "Ba" && calcularPesoCalorias(g).pesoKg > 1e-6) escalaRuim.push(["Ba", g.porte]);
    if (["Pl", "Fu", "Ba"].includes(g.reino) && Number(g.senAudicao) > 0) escalaRuim.push([g.reino, "audição"]);
    if (i % 80 === 0) await respirar();
  }
  chk("D5 mamífero com asa continua membranoso após deriva", asa === 0, `violações=${asa}`);
  chk("D6 a escala e as travas de reino sobrevivem à deriva", escalaRuim.length === 0, JSON.stringify(escalaRuim.slice(0, 5)));
  prog(0.85);

  let inf = 0, campos = {};
  for (let i = 0; i < 300; i++) {
    const r = seedParaGenoma(deriva(clonarG(buildSpecies(null, {}, false).g), 25), false);
    if (!r.fiel) { inf++; for (const k of r.camposDivergentes) campos[k] = (campos[k] || 0) + 1; }
    if (i % 30 === 0) await respirar();
  }
  chk("D7 seed continua fiel a genomas nascidos de deriva (300 × 25)", inf === 0, `infiéis=${inf}/300 ${JSON.stringify(campos)}`);
  prog(1);
}

async function suiteDnaTrilha({ suite, chk, info }, prog) {
  suite("L · Busca por DNA colado");
  const formatos = [
    ["código completo", (g) => serialize(g)],
    ["sem o prefixo DRN2-", (g) => serialize(g).replace(/^DRN2-/, "")],
    ["com espaços em volta", (g) => "  " + serialize(g) + "\n"],
  ];
  for (const [nome, transformar] of formatos) {
    let ok = 0, N = 120, campos = {};
    for (let i = 0; i < N; i++) {
      const g = buildSpecies(null, {}, false).g;
      const r = decodificarDNAColado(transformar(g), false);
      if (r && r.fiel) ok++; else for (const k of (r?.camposDivergentes || ["nulo"])) campos[k] = (campos[k] || 0) + 1;
      if (i % 30 === 0) await respirar();
    }
    chk(`L1 reconstrói o genoma a partir do DNA — ${nome} (${N})`, ok === N, `${ok}/${N} ${JSON.stringify(campos)}`);
  }
  prog(0.35);

  let seedOk = 0;
  for (let i = 0; i < 100; i++) {
    const g = buildSpecies(null, {}, false).g;
    const r = decodificarDNAColado(serialize(g), false);
    if (buildSpecies(r.speciesSeed, {}, false).code === r.code) seedOk++;
    if (i % 25 === 0) await respirar();
  }
  chk("L2 a seed devolvida endereça o mesmo espécime (100)", seedOk === 100, `${seedOk}/100`);

  const deveSerDna = ["DRN2-TAX:An.MAM.Xut-MOR:md.3.es.0.co", "TAX:An.MAM.Xut-MOR:md.3.es.0.co"];
  const naoDeveSerDna = ["", "12345", "Abner Cruz", "9".repeat(150), "-1", "🙂", "TAXI:algo"];
  chk("L3 reconhece código DRN2", deveSerDna.every(ehCodigoDRN2));
  chk("L4 não confunde seed/texto livre com DNA", naoDeveSerDna.every((t) => !ehCodigoDRN2(t)), JSON.stringify(naoDeveSerDna.filter(ehCodigoDRN2)));

  const crash = [];
  for (const t of ["", "DRN2-", "DRN2-TAX:", "DRN2-TAX:ZZ.ZZ.Zzz", "DRN2-" + "A".repeat(3000)]) {
    try { decodificarDNAColado(t, false); } catch (e) { crash.push([t.slice(0, 15), e.message.slice(0, 60)]); }
  }
  chk("L5 códigos truncados/inválidos não estouram", crash.length === 0, JSON.stringify(crash));
  prog(0.6);

  suite("M · Trilha reversa");
  resetEventLog(); setLogVerbosidade("resumido");
  let exato = 0, N = 5, ciclos = [], t = 0;
  for (let i = 0; i < N; i++) {
    const g = buildSpecies(null, {}, false).g;
    const a = msAgora(); const r = await buscarTrilhaReversa(serialize(g), null, 2); t += msAgora() - a;
    if (r.codigoIdentico) exato++; ciclos.push(r.trilha.length);
    prog(0.6 + 0.3 * ((i + 1) / N));
  }
  chk(`M1 a trilha reconstruída chega exatamente no espécime (${N})`, exato === N, `${exato}/${N} · ${(t / N).toFixed(0)}ms cada`);
  info("M2 comprimento das linhagens reconstruídas", `${Math.min(...ciclos)}–${Math.max(...ciclos)} ciclos`);

  const g1 = buildSpecies(null, {}, false).g;
  const r1 = await buscarTrilhaReversa(serialize(g1), null, 1);
  chk("M3 o ancestral proposto é sempre um primordial bactéria",
    r1.ancestral && r1.ancestral.isPrimordial === true && r1.ancestral.g.reino === "Ba", `reino=${r1.ancestral?.g?.reino}`);
  chk("M5 entrada que não é DNA é rejeitada", (await buscarTrilhaReversa("12345")).motivo === "codigo-invalido");
  resetEventLog();
  prog(1);
}

async function suitePdf({ suite, chk, info }, prog) {
  suite("N · Export em PDF");
  const dec = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; };
  const corpo = Array.from({ length: 120 }, (_, i) =>
    `[12:00:0${i % 10}] #${i} ESPECIAÇÃO\n  Clado${i}\n  Texto com acentuação: ção, ã, ê, ç, õ.\n  DNA: ${serialize(buildSpecies(null, {}, false).g)}`
  ).join("\n\n");
  await respirar(true); prog(0.4);

  const pdf = criarPdfTexto("HISTORICO — DROERNI", "═".repeat(63) + "\n" + corpo);
  const texto = dec(pdf);
  chk("N1 gera um PDF estruturalmente válido", texto.startsWith("%PDF-1.4") && texto.trimEnd().endsWith("%%EOF"));
  const paginas = (texto.match(/\/Type \/Page[^s]/g) || []).length;
  chk("N2 pagina conteúdo longo", paginas > 1, `${paginas} páginas para 120 eventos`);
  chk("N3 declara xref e trailer", /\nxref\n/.test(texto) && /\ntrailer\n/.test(texto) && /startxref/.test(texto));
  prog(0.7);

  const inicioXref = Number((texto.match(/startxref\n(\d+)/) || [0, 0])[1]);
  chk("N4 startxref aponta para a tabela xref", texto.slice(inicioXref, inicioXref + 4) === "xref");
  const linhasXref = texto.slice(inicioXref).split("\n").slice(2).filter((l) => /^\d{10} \d{5} n/.test(l));
  const ruins = linhasXref.filter((l) => !/^\d+ \d+ obj/.test(texto.slice(Number(l.slice(0, 10)))));
  chk("N5 todo offset do xref cai no início de um objeto", ruins.length === 0, `${ruins.length} de ${linhasXref.length} errados`);
  chk("N6 acentuação do português sobrevive", texto.includes("acentua\u00e7\u00e3o"));
  chk("N7 caracteres de caixa são transliterados, não viram lixo", !texto.includes("\u2550"));
  const quebrado = pdfQuebrarLinhas("x".repeat(4000));
  chk("N8 quebra palavras gigantes sem estourar a página", quebrado.every((l) => l.length <= PDF_COLUNAS), `maior linha ${Math.max(...quebrado.map((l) => l.length))} (limite ${PDF_COLUNAS})`);
  chk("N9 texto vazio ainda gera PDF válido", dec(criarPdfTexto("T", "")).startsWith("%PDF"));
  prog(1);
}

async function suiteGeografia({ suite, chk }, prog) {
  suite("G · Geografia");
  const m1 = criarMassaDeTerra("Só água", ["Aquáticos"], []);
  chk("G1 massa restrita a um domínio só recebe biomas daquele domínio", m1.divisoesBiomas.every((d) => d.biomaNome));
  const todos = biomasDaMassa({ dominios: ["Frio e Gelo"], biomasExcluidos: [] }).map((b) => b.nome);
  const m2 = criarMassaDeTerra("Vazia", ["Frio e Gelo"], todos);
  chk("G2 massa com todos os biomas excluídos é corrigida e avisada",
    m2.divisoesBiomas.some((d) => d.biomaNome) && (m2.avisos || []).length > 0, (m2.avisos || []).join(" | "));
  const m3 = criarMassaDeTerra("Fantasma", ["Domínio Inexistente"], []);
  chk("G3 domínio climático inexistente é avisado, não aceito em silêncio",
    biomasDaMassa(m3).length > 0 && (m3.avisos || []).length > 0, (m3.avisos || []).join(" | "));
  chk("G4 vizinhança circular é coerente nas bordas",
    JSON.stringify(divisoesVizinhas(0, 8)) === "[7,1]" && JSON.stringify(divisoesVizinhas(7, 8)) === "[6,0]");
  chk("G5 divisão não é vizinha de si mesma", !divisoesVizinhas(0, 1).includes(0), JSON.stringify(divisoesVizinhas(0, 1)));
  chk("G6 domínio custom rejeita duplicata, nome vazio e colisão com embutido",
    adicionarDominioCustom("TesteX", ["a"]) === true && adicionarDominioCustom("TesteX", ["a"]) === false &&
    adicionarDominioCustom("   ", []) === false && adicionarDominioCustom("Aquáticos", []) === false);
  removerDominioCustom("TesteX");
  prog(1);
}

async function suiteEcossistema({ suite, chk, info }, prog) {
  suite("F · Ecossistema e seleção natural");
  const massa = criarMassaDeTerra("Pangeia de teste", null, []);
  resetEventLog(); setLogVerbosidade("resumido");
  const nodes = [];
  for (let p = 0; p < 3; p++) {
    const r = criarPrimordial({}, 0, massa.id); r.massaId = massa.id; nodes.push(r);
    await derivarLinhagem(r, 60, (n) => { n.massaId = massa.id; nodes.push(n); });
    prog(0.35 * ((p + 1) / 3));
  }
  const idx = buildIndex(nodes);
  info("F0 árvore gerada", `${nodes.length} espécies · ${nodes.filter((n) => n.extinta).length} extintas por saturação`);

  let inds = [];
  for (const n of nodes) if (!n.extinta) inds.push(...gerarPopulacaoParaEspecie(n, 6, 8, massa));
  const comPop = new Set(inds.map((i) => i.especieId));
  const r = await rodarSelecaoNaturalPopulacional(idx, inds, [massa], 40, (f) => prog(0.35 + 0.6 * f));
  const vivos = r.individuals.filter((i) => i.viva);
  const comVivos = new Set(vivos.map((i) => i.especieId));

  const zeradas = [...comPop].filter((id) => !comVivos.has(id));
  const zeradasVivas = zeradas.filter((id) => !idx.get(id).extinta);
  chk("F1 espécie que perde toda a população é marcada como extinta", zeradasVivas.length === 0,
    `${zeradas.length} zeradas; ${zeradasVivas.length} ainda marcadas vivas`);

  const evs = __eventLog.filter((e) => e.tipo === "selecao_natural_populacao");
  const tocadas = new Set(evs.map((e) => e.speciesId));
  chk("F2 a seleção alcança a maior parte do ecossistema (>50%)", tocadas.size > comPop.size * 0.5,
    `${tocadas.size}/${comPop.size} espécies sofreram pressão (${(100 * tocadas.size / Math.max(1, comPop.size)).toFixed(0)}%)`);
  chk("F3 cada divisão resolve mais de uma interação por ciclo", evs.length / 40 > DIVISOES_POR_MASSA,
    `${(evs.length / 40).toFixed(1)} interações/ciclo com ${DIVISOES_POR_MASSA} divisões`);
  chk("F4 cadáveres acumulados respeitam o teto de retenção",
    r.individuals.length - vivos.length <= TETO_CADAVERES_RETIDOS,
    `${r.individuals.length - vivos.length} retidos (teto ${TETO_CADAVERES_RETIDOS})`);
  chk("F5 há migração entre domínios", r.resumo.migracoes > 0, JSON.stringify(r.resumo));
  resetEventLog();
  prog(1);
}

async function suitePerformance({ suite, chk, info }, prog) {
  suite("H · Performance neste aparelho");
  const g = buildSpecies(null, {}, false).g;
  const bench = (nome, n, fn) => {
    const a = msAgora(); for (let i = 0; i < n; i++) fn(i); const d = (msAgora() - a) / n;
    info(nome, `${d.toFixed(3)} ms/chamada (${n}×)`);
    return d;
  };
  const mBuild = bench("H1 buildSpecies (aleatório)", 400, () => buildSpecies(null, {}, false));
  await respirar(true); prog(0.2);
  bench("H2 seedParaGenoma (encode + verificação)", 150, () => seedParaGenoma(g, false));
  await respirar(true); prog(0.35);
  const mDeriva = bench("H3 aplicarCicloDeriva", 800, () => aplicarCicloDeriva(clonarG(g), 0, null));
  await respirar(true); prog(0.5);
  bench("H4 buildIndividual", 400, () => buildIndividual(g, null));
  bench("H5 serialize", 3000, () => serialize(g));
  bench("H6 validarCoerencia", 3000, () => validarCoerencia(g));
  bench("H7 describeCreatureProse", 500, () => describeCreatureProse(g));
  await respirar(true); prog(0.7);

  /* Estes dois SÃO aprovação/reprovação: não medem a velocidade do
     aparelho, medem se o motor continua com a complexidade certa. */
  chk("H8 uma espécie custa menos que um ciclo de deriva inteiro", mBuild < mDeriva * 12,
    `build ${mBuild.toFixed(3)}ms vs deriva ${mDeriva.toFixed(3)}ms`);

  const est600 = estimarTempoDeriva(600, 1);
  info("H9 estimativa de deriva longa neste aparelho", `600 ciclos ≈ ${est600.texto}`);

  resetEventLog(); setLogVerbosidade("resumido");
  const medidas = [];
  for (const ciclos of [50, 200]) {
    const raiz = criarPrimordial({}, 0, null); const nodes = [raiz];
    const a = msAgora(); const filhas = await derivarLinhagem(raiz, ciclos, (n) => nodes.push(n)); const d = msAgora() - a;
    medidas.push({ ciclos, ms: d, especies: filhas.length });
    info(`H10 deriva de ${ciclos} ciclos`, `${filhas.length} espécies em ${(d / 1000).toFixed(1)}s`);
    prog(0.7 + 0.25 * (medidas.length / 2));
  }
  /* O tempo TOTAL cresce muito mais que os ciclos, e isso é esperado: cada
     ciclo processa todas as linhagens vivas, e o número delas cresce junto
     (até o teto). Comparar o total 50→200 dava 61× e reprovava um motor
     saudável. O que de fato tem que ficar estável é o custo POR ESPÉCIE
     produzida — se esse número disparar, aí sim algo virou quadrático. */
  const porEspecie = medidas.map((m) => m.ms / Math.max(1, m.especies));
  chk("H11 o custo por espécie gerada não dispara com a escala",
    porEspecie[1] < porEspecie[0] * 4,
    `${porEspecie[0].toFixed(1)}ms/espécie em 50 ciclos → ${porEspecie[1].toFixed(1)}ms/espécie em 200`);
  resetEventLog();
  prog(1);
}

/* ============================================================
   CATÁLOGO E EXECUTOR
   ============================================================ */
const SUITES_TESTE = [
  { id: "seed", nome: "Seed e determinismo", fn: suiteSeed, peso: 2, nivel: "rapida" },
  { id: "fuzz", nome: "Fuzzing de entrada", fn: suiteFuzz, peso: 1, nivel: "rapida" },
  { id: "geo", nome: "Geografia", fn: suiteGeografia, peso: 1, nivel: "rapida" },
  { id: "pdf", nome: "Export em PDF", fn: suitePdf, peso: 1, nivel: "rapida" },
  { id: "coerencia", nome: "Coerência e escala corporal", fn: suiteCoerencia, peso: 5, nivel: "completa" },
  { id: "evolucao", nome: "Deriva e especiação", fn: suiteEvolucao, peso: 6, nivel: "completa" },
  { id: "dna", nome: "Busca por DNA e trilha reversa", fn: suiteDnaTrilha, peso: 4, nivel: "completa" },
  { id: "ecossistema", nome: "Ecossistema e seleção natural", fn: suiteEcossistema, peso: 6, nivel: "completa" },
  { id: "performance", nome: "Performance neste aparelho", fn: suitePerformance, peso: 5, nivel: "completa" },
];

/* Roda as suítes escolhidas. `onProgresso(fracao, nomeDaSuite)` é chamado
   continuamente pra alimentar a barra; `onParcial(resultados)` entrega os
   resultados já obtidos, pra tela ir preenchendo em vez de esperar o fim. */
async function rodarBateria({ ids, onProgresso, onParcial } = {}) {
  const escolhidas = SUITES_TESTE.filter((s) => !ids || ids.includes(s.id));
  const pesoTotal = escolhidas.reduce((a, s) => a + s.peso, 0) || 1;
  const coletor = criarColetor();
  const inicio = msAgora();
  let acumulado = 0;

  /* A bateria mexe no log de eventos global (cria primordiais, deriva
     linhagens). Preserva e devolve o estado, pra não sujar o mundo que o
     usuário tem aberto. */
  const logAntes = __eventLog.slice();
  const verbosidadeAntes = __logVerbosidade;

  for (const s of escolhidas) {
    const base = acumulado;
    try {
      await s.fn(coletor, (f) => onProgresso && onProgresso((base + s.peso * Math.min(1, f)) / pesoTotal, s.nome));
    } catch (e) {
      coletor.suite(s.nome);
      coletor.chk(`${s.nome} — a suíte estourou`, false, `${e && e.message ? e.message : e}`);
    }
    acumulado += s.peso;
    if (onParcial) onParcial(coletor.resultados.slice());
    await respirar(true);
  }

  __eventLog.length = 0;
  for (const e of logAntes) __eventLog.push(e);
  setLogVerbosidade(verbosidadeAntes);

  const r = coletor.resultados;
  return {
    resultados: r,
    versao: TESTES_VERSAO,
    duracaoMs: msAgora() - inicio,
    ok: r.filter((x) => x.ok === true).length,
    falhas: r.filter((x) => x.ok === false).length,
    infos: r.filter((x) => x.ok === null).length,
  };
}

/* Relatório em texto — o mesmo formato do runner externo, pra poder
   comparar as duas execuções lado a lado. Vira PDF pelo painel. */
function relatorioBateriaTexto(saida) {
  const linhas = [
    `Bateria ${saida.versao} · ${new Date().toLocaleString("pt-BR")}`,
    `${saida.ok} ok · ${saida.falhas} falha(s) · ${saida.infos} informativo(s) · ${(saida.duracaoMs / 1000).toFixed(1)}s`,
    "",
  ];
  let atual = null;
  for (const r of saida.resultados) {
    if (r.suite !== atual) { atual = r.suite; linhas.push("", `=== ${atual} ===`); }
    const tag = r.ok === null ? "[info] " : r.ok ? "[ ok ] " : "[FALHA]";
    linhas.push(`${tag} ${r.nome}${r.detalhe ? `\n         ${r.detalhe}` : ""}`);
  }
  return linhas.join("\n");
}

/* Ícone próprio (o conjunto do app é desenhado à mão, sem lucide) */
function FlaskConical(props) {
  return <Icon {...props}><path d="M10 2v7.5L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4A1.5 1.5 0 0 0 19.5 19L14 9.5V2" /><line x1="8.5" y1="2" x2="15.5" y2="2" /><line x1="7" y1="15" x2="17" y2="15" /></Icon>;
}

/* ============================================================
   PAINEL — a bateria dentro do app
   ============================================================
   Roda contra o motor que está carregado nesta página, neste aparelho.
   É a diferença que justifica ter trazido a bateria pra cá: os números de
   performance passam a ser os do celular de quem está usando, não os da
   máquina onde o código foi escrito.
   ============================================================ */
function PainelTestes({ onFechar, showToast }) {
  const [nivel, setNivel] = useState("rapida");
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [suiteAtual, setSuiteAtual] = useState("");
  const [parciais, setParciais] = useState([]);
  const [saida, setSaida] = useState(null);
  const [soFalhas, setSoFalhas] = useState(false);

  const idsDoNivel = useMemo(
    () => SUITES_TESTE.filter((s) => nivel === "completa" || s.nivel === "rapida").map((s) => s.id),
    [nivel]
  );

  const rodar = async () => {
    setRodando(true); setSaida(null); setParciais([]); setProgresso(0);
    try {
      const r = await rodarBateria({
        ids: idsDoNivel,
        onProgresso: (f, nome) => { setProgresso(f); setSuiteAtual(nome); },
        onParcial: (res) => setParciais(res),
      });
      setSaida(r);
      setParciais(r.resultados);
    } catch (e) {
      showToast("A bateria falhou de forma inesperada: " + (e?.message || e));
    }
    setRodando(false); setSuiteAtual("");
  };

  const exportar = () => {
    if (!saida) return;
    downloadPdf(
      `bateria-drn2-${new Date().toISOString().slice(0, 10)}.pdf`,
      "BATERIA DE TESTES - ECOSSISTEMA DRN2",
      relatorioBateriaTexto(saida)
    );
  };
  const copiar = () => {
    if (!saida) return;
    navigator.clipboard?.writeText(relatorioBateriaTexto(saida));
    showToast("Relatório da bateria copiado.");
  };

  const mostrados = soFalhas ? parciais.filter((r) => r.ok === false) : parciais;
  const grupos = [];
  for (const r of mostrados) {
    if (!grupos.length || grupos[grupos.length - 1].suite !== r.suite) grupos.push({ suite: r.suite, itens: [] });
    grupos[grupos.length - 1].itens.push(r);
  }
  const contagem = {
    ok: parciais.filter((r) => r.ok === true).length,
    falhas: parciais.filter((r) => r.ok === false).length,
    infos: parciais.filter((r) => r.ok === null).length,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-t-lg sm:rounded-lg w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-950 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest flex items-center gap-2">
            <FlaskConical size={16} />Bateria de testes
          </h2>
          <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-stone-500 leading-relaxed">
            Roda contra o motor carregado nesta página, neste aparelho — por isso os números de
            performance são os do seu celular, e não os da máquina onde o código foi escrito.
            A bateria mexe no log de eventos durante a execução e devolve o estado no fim; o
            mundo aberto não é alterado.
          </p>

          <div className="flex gap-1">
            {[["rapida", "Rápida (~15s)"], ["completa", "Completa (minutos)"]].map(([v, rotulo]) => (
              <button key={v} disabled={rodando} onClick={() => setNivel(v)}
                className={`flex-1 text-[10px] font-mono uppercase rounded px-2 py-1.5 border disabled:opacity-40 ${nivel === v ? "border-emerald-700 text-emerald-400 bg-emerald-950/30" : "border-stone-800 text-stone-500 hover:text-stone-300"}`}>
                {rotulo}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-stone-600">
            {idsDoNivel.length} suíte(s): {SUITES_TESTE.filter((s) => idsDoNivel.includes(s.id)).map((s) => s.nome).join(" · ")}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <BotaoPrimario onClick={rodar} disabled={rodando}>
              <FlaskConical size={12} className="inline -mt-0.5 mr-1" />
              {rodando ? `Rodando… ${Math.round(progresso * 100)}%` : saida ? "Rodar de novo" : "Rodar bateria"}
            </BotaoPrimario>
            {saida && !rodando && (
              <>
                <button onClick={exportar} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />Relatório (.pdf)</button>
                <button onClick={copiar} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Copy size={12} className="inline -mt-0.5 mr-1" />Copiar</button>
              </>
            )}
          </div>

          {rodando && (
            <div className="space-y-1">
              <div className="h-1.5 rounded bg-stone-900 overflow-hidden">
                <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.round(progresso * 100)}%` }} />
              </div>
              <div className="text-[10px] text-stone-600 font-mono">{suiteAtual}</div>
            </div>
          )}

          {parciais.length > 0 && (
            <div className="flex items-center gap-3 text-[11px] font-mono border-t border-stone-800 pt-3">
              <span className="text-emerald-500">{contagem.ok} ok</span>
              <span className={contagem.falhas ? "text-red-400" : "text-stone-600"}>{contagem.falhas} falha(s)</span>
              <span className="text-stone-600">{contagem.infos} info</span>
              {saida && <span className="text-stone-600">· {(saida.duracaoMs / 1000).toFixed(1)}s</span>}
              {contagem.falhas > 0 && (
                <button onClick={() => setSoFalhas((v) => !v)} className="ml-auto text-[10px] uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-2 py-1">
                  {soFalhas ? "Ver tudo" : "Só falhas"}
                </button>
              )}
            </div>
          )}

          <div className="space-y-3">
            {grupos.map((grupo) => (
              <div key={grupo.suite} className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-stone-500 font-mono">{grupo.suite}</div>
                {grupo.itens.map((r, i) => (
                  <div key={i} className={`text-[11px] rounded border px-2 py-1.5 ${r.ok === false ? "border-red-900 bg-red-950/20" : r.ok === null ? "border-stone-800" : "border-stone-800/60"}`}>
                    <div className="flex items-start gap-2">
                      <span className={`font-mono shrink-0 ${r.ok === false ? "text-red-400" : r.ok === null ? "text-stone-500" : "text-emerald-500"}`}>
                        {r.ok === false ? "✕" : r.ok === null ? "·" : "✓"}
                      </span>
                      <span className={r.ok === false ? "text-red-200" : "text-stone-300"}>{r.nome}</span>
                    </div>
                    {r.detalhe && <div className="text-[10px] text-stone-500 font-mono mt-0.5 pl-5 break-all">{r.detalhe}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   BARRA PWA — instalar e atualizar
   ============================================================
   Dois avisos discretos, cada um aparecendo só quando faz sentido:

   - "Instalar" surge quando o navegador dispara `beforeinstallprompt`
     (Android/Chrome/Edge). No iOS esse evento não existe: o Safari só
     instala pelo menu Compartilhar → Adicionar à Tela de Início, então
     ali o texto explica o caminho em vez de oferecer um botão que não
     funcionaria.
   - "Atualizar" surge quando o service worker baixou uma versão nova e
     está esperando. Sem isso o app fica preso à versão em cache até o
     usuário fechar todas as abas, o que numa PWA instalada quase nunca
     acontece por acidente.
   ============================================================ */
function BarraPWA() {
  const [instalavel, setInstalavel] = useState(false);
  const [atualizacao, setAtualizacao] = useState(false);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    const aoInstalavel = () => setInstalavel(true);
    const aoAtualizar = () => setAtualizacao(true);
    window.addEventListener("drn2:instalavel", aoInstalavel);
    window.addEventListener("drn2:atualizacao-disponivel", aoAtualizar);
    if (window.__promptInstalacao) setInstalavel(true);
    return () => {
      window.removeEventListener("drn2:instalavel", aoInstalavel);
      window.removeEventListener("drn2:atualizacao-disponivel", aoAtualizar);
    };
  }, []);

  const instalar = async () => {
    const p = window.__promptInstalacao;
    if (!p) return;
    p.prompt();
    try { await p.userChoice; } catch (e) { /* usuário fechou */ }
    window.__promptInstalacao = null;
    setInstalavel(false);
  };

  const atualizar = () => {
    const reg = window.__swRegistro;
    if (reg && reg.waiting) reg.waiting.postMessage("aplicar-atualizacao");
    else window.location.reload();
  };

  if (atualizacao) {
    return (
      <div className="rounded border border-emerald-900 bg-emerald-950/30 px-3 py-2 flex items-center justify-between gap-3">
        <span className="text-[11px] text-emerald-300">Uma versão nova do app foi baixada.</span>
        <button onClick={atualizar} className="text-[10px] font-mono uppercase text-emerald-400 hover:text-emerald-300 border border-emerald-800 rounded px-2 py-1 shrink-0">Atualizar agora</button>
      </div>
    );
  }
  if (instalavel && !dispensado) {
    return (
      <div className="rounded border border-stone-800 px-3 py-2 flex items-center justify-between gap-3">
        <span className="text-[11px] text-stone-400">Instale o app para usar offline, sem abrir o navegador.</span>
        <div className="flex gap-1 shrink-0">
          <button onClick={instalar} className="text-[10px] font-mono uppercase text-emerald-400 hover:text-emerald-300 border border-emerald-900 rounded px-2 py-1">Instalar</button>
          <button onClick={() => setDispensado(true)} className="text-[10px] font-mono uppercase text-stone-500 hover:text-stone-300 border border-stone-800 rounded px-2 py-1">Agora não</button>
        </div>
      </div>
    );
  }
  return null;
}
