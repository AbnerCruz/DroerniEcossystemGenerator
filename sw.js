/* ============================================================
   SERVICE WORKER — v31
   ============================================================
   O app é servido pelo GitHub Pages, que dá https (requisito do
   service worker) mas não tem backend nenhum. Todo o offline mora aqui.

   Duas famílias de recurso, com estratégias diferentes:

   1) CASCA DO APP (index.html, os 10 arquivos .js, os patchnotes, o
      manifesto, os ícones) — servida da rede primeiro, caindo pro cache.
      Assim uma versão nova publicada no Pages aparece na próxima abertura
      com internet, mas o app continua abrindo sem internet nenhuma.

   2) BIBLIOTECAS DE CDN (React, ReactDOM, Babel Standalone, Tailwind,
      marked) — cache primeiro, para sempre. São arquivos versionados e
      imutáveis; buscá-los da rede a cada abertura é só latência. É também
      o que torna o offline REAL: sem eles em cache o app não renderiza
      nada, por mais que os .js locais estejam guardados.

   Consequência honesta, que a UI também informa: a primeira abertura
   precisa de internet. Depois dela o app roda offline indefinidamente,
   inclusive instalado na tela inicial.
   ============================================================ */

const VERSAO = "drn2-v35";
const CACHE_CASCA = `${VERSAO}-casca`;
const CACHE_CDN = `${VERSAO}-cdn`;

/* Caminhos relativos: o app vive num subdiretório no GitHub Pages
   (usuario.github.io/repositorio/), então nada de barra inicial. */
const CASCA = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./01-core-motor.js",
  "./02-coerencia.js",
  "./03-zip.js",
  "./04-ui-fases.js",
  "./05-ui-especie.js",
  "./06-ui-biologia.js",
  "./07-exports.js",
  "./08-patchnotes.js",
  "./09-populacao-seed.js",
  "./10-app.js",
  "./11-testes.js",
  "./12-filtros-ui.js",
  "./13-persistencia.js",
  "./14-montador.js",
  "./patchnotes-manifest.json",
  /* v28 — os .md dos patchnotes precisam entrar aqui explicitamente. O
     fetch deles é rede-primeiro-com-cache, então eles só ficariam guardados
     DEPOIS de o usuário abrir o painel de versões com internet — quem
     instalasse e ficasse offline abriria um painel vazio. Lista literal em
     vez de derivada do manifesto porque o worker instala antes de qualquer
     fetch do app, e `cachearTolerante` já perdoa entrada que não exista. */
  "./patchnotes-v17.md",
  "./patchnotes-v18.md",
  "./patchnotes-v19.md",
  "./patchnotes-v20.md",
  "./patchnotes-v21.md",
  "./patchnotes-v22.md",
  "./patchnotes-v23.md",
  "./patchnotes-v24.md",
  "./patchnotes-v25.md",
  "./patchnotes-v26.md",
  "./patchnotes-v27.md",
  "./patchnotes-v28.md",
  "./patchnotes-v29.md",
  "./patchnotes-v30.md",
  "./patchnotes-v31.md",
  "./patchnotes-v32.md",
  "./patchnotes-v33.md",
  "./patchnotes-v34.md",
  "./patchnotes-v35.md",
];

const CDN = [
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7/babel.min.js",
  "https://cdn.tailwindcss.com",
  "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.0/marked.min.js",
];

/* Um recurso que falhe não pode derrubar a instalação inteira do worker —
   `cache.addAll` é tudo-ou-nada e um único 404 (um patchnote renomeado,
   por exemplo) deixaria o app sem offline nenhum. Daí o addAll manual,
   tolerante a falha individual. */
async function cachearTolerante(cache, urls) {
  await Promise.all(urls.map(async (url) => {
    try {
      const req = new Request(url, url.startsWith("http") ? { mode: "cors", credentials: "omit" } : {});
      const resp = await fetch(req, { cache: "reload" });
      if (resp && (resp.ok || resp.type === "opaque")) await cache.put(url, resp);
    } catch (e) { /* recurso indisponível agora; será buscado sob demanda */ }
  }));
}

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    const [casca, cdn] = await Promise.all([caches.open(CACHE_CASCA), caches.open(CACHE_CDN)]);
    await Promise.all([cachearTolerante(casca, CASCA), cachearTolerante(cdn, CDN)]);
    /* Assume o controle já nesta abertura em vez de esperar a próxima:
       quem acabou de instalar o app espera que ele funcione offline agora,
       não depois de fechar e reabrir. */
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => !n.startsWith(VERSAO)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* Permite que a página peça a ativação imediata de um worker novo
   (o botão "Atualizar agora" que aparece quando há versão nova). */
self.addEventListener("message", (evento) => {
  if (evento.data === "aplicar-atualizacao") self.skipWaiting();
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;

  const ehCDN = CDN.some((base) => req.url.startsWith(base.split("?")[0])) ||
    /(^https:\/\/(unpkg\.com|cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com))/.test(req.url);

  if (ehCDN) {
    // cache-primeiro: arquivos de versão fixa, não mudam
    evento.respondWith((async () => {
      const cache = await caches.open(CACHE_CDN);
      const guardado = await cache.match(req, { ignoreSearch: false });
      if (guardado) return guardado;
      try {
        const resp = await fetch(req);
        if (resp && (resp.ok || resp.type === "opaque")) cache.put(req, resp.clone());
        return resp;
      } catch (e) {
        // sem rede e sem cache: devolve erro legível em vez de estourar
        return new Response("", { status: 504, statusText: "Biblioteca indisponível offline" });
      }
    })());
    return;
  }

  // mesma origem: rede-primeiro, cache como rede de segurança
  if (new URL(req.url).origin === self.location.origin) {
    evento.respondWith((async () => {
      const cache = await caches.open(CACHE_CASCA);
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (e) {
        const guardado = await cache.match(req) || await cache.match("./index.html");
        if (guardado) return guardado;
        return new Response("Recurso indisponível offline.", { status: 504 });
      }
    })());
  }
});
