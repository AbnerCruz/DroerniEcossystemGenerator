/* ============================================================
   ZIP MÍNIMO (método STORED, sem compressão) — puro JS, sem
   bibliotecas externas. Suficiente pra .md de texto (que já
   comprime mal) e evita depender de qualquer CDN de zip lib.
   ============================================================ */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function strToBytes(str) { return new TextEncoder().encode(str); }
function u16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
function u32(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF]; }
function dosDateTime() {
  const d = new Date();
  const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
  const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
  return { time, date };
}

/* files: [{ name: "pasta/arquivo.md", content: "texto..." }] -> Uint8Array do .zip */
function criarZipStored(files) {
  const { time, date } = dosDateTime();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = strToBytes(f.name);
    const dataBytes = strToBytes(f.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0),
    ];
    chunks.push(new Uint8Array(localHeader), nameBytes, dataBytes);

    const centralHeader = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset),
    ];
    central.push(new Uint8Array(centralHeader), nameBytes);

    offset += localHeader.length + nameBytes.length + dataBytes.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;

  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(centralStart), ...u16(0),
  ];

  const total = [...chunks, ...central, new Uint8Array(eocd)];
  let totalLen = 0; for (const t of total) totalLen += t.length;
  const out = new Uint8Array(totalLen);
  let pos = 0; for (const t of total) { out.set(t, pos); pos += t.length; }
  return out;
}

/* ============================================================
   v27 — GERADOR DE PDF MÍNIMO
   ============================================================
   Os registros históricos passaram de .txt para .pdf. Poderia ter entrado
   uma biblioteca via CDN (jsPDF), mas isso contraria dois compromissos do
   projeto: o app não tem build step e cada dependência nova é mais uma coisa
   que pode sumir da rede no meio de uma sessão. E o que a gente precisa é
   modesto: texto monoespaçado paginado, sem imagens, sem fontes embutidas.
   Então o PDF é montado à mão aqui, como o ZIP logo acima já era.

   Especificação usada: PDF 1.4, página A4 (595×842pt), fonte base-14
   Courier (não precisa ser embutida — todo leitor de PDF já a tem), uma
   stream de conteúdo por página, xref clássico (não cross-reference stream).

   LIMITAÇÃO CONHECIDA — as fontes base-14 usam WinAnsiEncoding, que cobre o
   português inteiro (á, ç, ã, õ, ê) mas NÃO cobre os caracteres de desenho
   de caixa que os relatórios usavam (═ │ ├ └ ─). Eles são transliterados
   para ASCII na entrada; o resultado visual é praticamente o mesmo numa
   fonte monoespaçada. */

const PDF_LARGURA = 595.28, PDF_ALTURA = 841.89;
const PDF_MARGEM = 42;
const PDF_FONTE_PT = 8.5;
const PDF_ENTRELINHA = 11.2;
const PDF_LARGURA_CHAR = PDF_FONTE_PT * 0.6; // Courier é 600/1000 de em
const PDF_COLUNAS = Math.floor((PDF_LARGURA - PDF_MARGEM * 2) / PDF_LARGURA_CHAR);
const PDF_LINHAS_POR_PAGINA = Math.floor((PDF_ALTURA - PDF_MARGEM * 2 - PDF_ENTRELINHA) / PDF_ENTRELINHA);

/* Caracteres fora do WinAnsiEncoding que aparecem nos relatórios. Mapeados
   para o equivalente ASCII mais próximo em vez de virarem lixo. */
const PDF_TRANSLITERA = {
  "═": "=", "─": "-", "│": "|", "├": "+", "└": "+", "┌": "+", "┐": "+", "┘": "+", "┬": "+", "┴": "+", "┼": "+",
  "•": "*", "·": "-", "→": "->", "←": "<-", "↔": "<->", "…": "...", "–": "-", "—": "-",
  "“": '"', "”": '"', "‘": "'", "’": "'", "×": "x", "≈": "~", "≥": ">=", "≤": "<=", "™": "(TM)",
};

function pdfNormalizarTexto(t) {
  let s = String(t ?? "");
  for (const [de, para] of Object.entries(PDF_TRANSLITERA)) s = s.split(de).join(para);
  // qualquer coisa acima de U+00FF não existe em WinAnsi: vira "?"
  return s.replace(/[^\x00-\xFF]/g, "?");
}

/* Escapa para string literal PDF e converte para bytes latin-1. */
function pdfEscaparTexto(t) {
  return pdfNormalizarTexto(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/* Quebra em linhas que cabem na largura da página, preservando as quebras
   originais e sem cortar palavra no meio quando dá pra evitar. */
function pdfQuebrarLinhas(texto, colunas = PDF_COLUNAS) {
  const saida = [];
  for (const bruta of pdfNormalizarTexto(texto).split("\n")) {
    if (bruta.length <= colunas) { saida.push(bruta); continue; }
    // preserva a indentação da linha original nas continuações
    const indent = (bruta.match(/^\s*/) || [""])[0].slice(0, 8);
    let resto = bruta;
    let primeira = true;
    while (resto.length > 0) {
      const largura = primeira ? colunas : colunas - indent.length;
      if (resto.length <= largura) { saida.push((primeira ? "" : indent) + resto); break; }
      let corte = resto.lastIndexOf(" ", largura);
      if (corte <= largura * 0.5) corte = largura; // palavra gigante (DNA, seed): corta seco
      saida.push((primeira ? "" : indent) + resto.slice(0, corte));
      resto = resto.slice(corte).replace(/^ /, "");
      primeira = false;
    }
  }
  return saida;
}

/* Monta o PDF. `titulo` vira o cabeçalho repetido em toda página; o rodapé
   traz "página N de M" e a data de geração. Retorna Uint8Array. */
function criarPdfTexto(titulo, texto) {
  const linhas = pdfQuebrarLinhas(texto);
  const uteis = PDF_LINHAS_POR_PAGINA - 3; // cabeçalho + separador + rodapé
  const paginas = [];
  for (let i = 0; i < linhas.length; i += uteis) paginas.push(linhas.slice(i, i + uteis));
  if (!paginas.length) paginas.push([""]);

  const dataGeracao = new Date().toLocaleString("pt-BR");
  const streams = paginas.map((linhasPagina, idx) => {
    const partes = ["BT", `/F1 ${PDF_FONTE_PT} Tf`, `${PDF_ENTRELINHA} TL`,
      `1 0 0 1 ${PDF_MARGEM} ${PDF_ALTURA - PDF_MARGEM} Tm`];
    const cabecalho = pdfEscaparTexto(titulo);
    const rodape = pdfEscaparTexto(`pagina ${idx + 1} de ${paginas.length}  ·  gerado em ${dataGeracao}`.replace("·", "-"));
    partes.push(`(${cabecalho}) Tj`, "T*", `(${pdfEscaparTexto("-".repeat(PDF_COLUNAS))}) Tj`, "T*");
    for (const l of linhasPagina) partes.push(`(${pdfEscaparTexto(l)}) Tj`, "T*");
    // rodapé fixo no pé da página
    partes.push("ET", "BT", `/F1 7 Tf`, `1 0 0 1 ${PDF_MARGEM} ${PDF_MARGEM - 12} Tm`, `(${rodape}) Tj`, "ET");
    return partes.join("\n");
  });

  /* Objetos: 1=Catalog, 2=Pages, 3=Font, 4..=Page/Contents alternados */
  const objetos = [];
  const idPrimeiraPagina = 4;
  const idsPaginas = paginas.map((_, i) => idPrimeiraPagina + i * 2);

  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objetos[2] = `<< /Type /Pages /Count ${paginas.length} /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  paginas.forEach((_, i) => {
    const idPagina = idsPaginas[i], idConteudo = idPagina + 1;
    objetos[idPagina] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_LARGURA.toFixed(2)} ${PDF_ALTURA.toFixed(2)}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${idConteudo} 0 R >>`;
    objetos[idConteudo] = { stream: streams[i] };
  });

  /* Serialização em latin-1: cada char vira 1 byte, então o offset em
     caracteres é igual ao offset em bytes — que é o que o xref exige. */
  let corpo = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i < objetos.length; i++) {
    const obj = objetos[i];
    if (obj === undefined) continue;
    offsets[i] = corpo.length;
    if (typeof obj === "object" && obj.stream !== undefined) {
      corpo += `${i} 0 obj\n<< /Length ${obj.stream.length} >>\nstream\n${obj.stream}\nendstream\nendobj\n`;
    } else {
      corpo += `${i} 0 obj\n${obj}\nendobj\n`;
    }
  }
  const inicioXref = corpo.length;
  const total = objetos.length;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) {
    xref += offsets[i] === undefined
      ? "0000000000 65535 f \n"
      : `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  corpo += xref + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  const bytes = new Uint8Array(corpo.length);
  for (let i = 0; i < corpo.length; i++) bytes[i] = corpo.charCodeAt(i) & 0xff;
  return bytes;
}
