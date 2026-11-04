document.documentElement.classList.add("js");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

/* ---------- dados para a análise depois ---------- */
const qs = new URLSearchParams(location.search);
const visita = {
  lead_id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2),
  utm_source: qs.get("utm_source") || "",
  utm_medium: qs.get("utm_medium") || "",
  utm_campaign: qs.get("utm_campaign") || "",
  utm_content: qs.get("utm_content") || "",
  referrer: document.referrer || "",
  dispositivo: matchMedia("(max-width: 760px)").matches ? "celular" : "computador",
  idioma: navigator.language || "",
  fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  inicio: Date.now(),
  scroll_max: 0,
  trocou_gancho: 0,
  videos_por_dia: "", // a calculadora saiu; a coluna continua na planilha
};
addEventListener("scroll", () => {
  const h = document.documentElement.scrollHeight - innerHeight;
  if (h > 0) visita.scroll_max = Math.max(visita.scroll_max, Math.round((scrollY / h) * 100));
}, { passive: true });

/* ---------- envio para a planilha (Apps Script) ---------- */
// Backup de segurança: o que o servidor não confirmou fica no navegador e é reenviado na próxima visita.
const PENDENTES = "lista_pendente";
const lerLista = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const gravarLista = (k, arr) => {
  try { if (arr.length) localStorage.setItem(k, JSON.stringify(arr.slice(-20))); else localStorage.removeItem(k); } catch { /* armazenamento bloqueado */ }
};
const mesmaLinha = (a, b) => a.lead_id === b.lead_id && a.evento === b.evento;

async function postar(url, linha) {
  try {
    // CORS padrão: com text/plain não há preflight, e o Apps Script responde {"ok":true} legível.
    // Se o script der erro, ele devolve uma página sem cabeçalho CORS e o fetch rejeita: conta como falha.
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(linha) });
    if (!res.ok) return false;
    const r = await res.json().catch(() => null);
    return Boolean(r && r.ok);
  } catch (e) {
    console.error("[lista]", e);
    return false;
  }
}

async function enviar(evento, campos) {
  const linha = {
    evento,
    data: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(visita).filter(([k]) => k !== "inicio")),
    segundos_na_pagina: Math.round((Date.now() - visita.inicio) / 1000),
    ...campos,
  };
  const url = window.LISTA_ENDPOINT;
  if (!url) {
    const arr = lerLista("lista_teste");
    arr.push(linha);
    gravarLista("lista_teste", arr);
    console.info("[lista] modo de teste, salvo no navegador:", linha);
    return true;
  }
  const ok = await postar(url, linha);
  const fila = lerLista(PENDENTES).filter((p) => !mesmaLinha(p, linha));
  if (!ok) fila.push(linha);
  gravarLista(PENDENTES, fila);
  return ok;
}

// reenvia, sem pressa, o que ficou pendente de visitas anteriores
setTimeout(async () => {
  const url = window.LISTA_ENDPOINT;
  const fila = lerLista(PENDENTES);
  if (!url || !fila.length) return;
  const enviados = [];
  for (const linha of fila) if (await postar(url, linha)) enviados.push(linha);
  if (enviados.length) gravarLista(PENDENTES, lerLista(PENDENTES).filter((p) => !enviados.some((e) => mesmaLinha(e, p))));
}, 4000);

/* ---------- menu do celular ---------- */
const bar = document.querySelector(".bar");
const menuBtn = $("menu-btn");
const menuAberto = () => menuBtn.getAttribute("aria-expanded") === "true";
function menu(abrir) {
  menuBtn.setAttribute("aria-expanded", String(abrir));
  bar.classList.toggle("aberto", abrir);
}
menuBtn.addEventListener("click", () => menu(!menuAberto()));
$("menu").addEventListener("click", (e) => { if (e.target.closest("a")) menu(false); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menuAberto()) { menu(false); menuBtn.focus(); }
});
document.addEventListener("click", (e) => { if (menuAberto() && !bar.contains(e.target)) menu(false); });
bar.addEventListener("focusout", (e) => { if (menuAberto() && e.relatedTarget && !bar.contains(e.relatedTarget)) menu(false); });
matchMedia("(min-width: 761px)").addEventListener("change", (m) => { if (m.matches) menu(false); });

/* ---------- entrada das partes de cada seção ---------- */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add("in");
    io.unobserve(e.target);
  }
}, { threshold: 0.15 });
document.querySelectorAll("section, .how-proof, .vs-cols, .kit-list, .wall").forEach((sec) => {
  sec.querySelectorAll(":scope > .rise, :scope .rise").forEach((el, i) => el.style.setProperty("--d", `${Math.min(i, 6) * 75}ms`));
});
document.querySelectorAll(".rise, .shutter, .shutter-soft").forEach((el) => io.observe(el));
// a moldura do hero entra quando quase metade dela está na tela: no celular isso acontece na primeira rolada, com o leitor olhando
const ioFrame = new IntersectionObserver(([e]) => { if (e.isIntersecting) { e.target.classList.add("in"); ioFrame.disconnect(); } }, { threshold: 0.4 });
ioFrame.observe(document.querySelector(".hero-frame"));

/* ---------- números da prova: contam do zero quando entram na tela ---------- */
function contar(b) {
  const m = b.textContent.trim().match(/^(\d+)(?:,(\d+))?(.*)$/);
  if (!m) return;
  const dec = m[2] ? m[2].length : 0, alvo = Number(m[1] + (dec ? "." + m[2] : "")), resto = m[3];
  const t0 = performance.now(), dur = 1400;
  (function passo(t) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);   // ease-out: corre no começo, assenta no fim
    b.textContent = (alvo * e).toFixed(dec).replace(".", ",") + resto;
    if (p < 1) requestAnimationFrame(passo);
  })(t0);
}
if (!reduce) {
  const ioNum = new IntersectionObserver((entries) => {
    for (const e of entries) { if (!e.isIntersecting) continue; ioNum.unobserve(e.target); contar(e.target); }
  }, { threshold: 0.6 });
  document.querySelectorAll(".hero-proof b").forEach((b) => ioNum.observe(b));
}
// itens dentro dos cards entram um a um depois do card
document.querySelectorAll(".kit-card, .vs-col, .proof, .oferta, .tiles").forEach((card) => {
  card.classList.add("cascata");
  card.querySelectorAll("li, details, .proof-links a").forEach((el, i) => el.style.setProperty("--i", i));
  if (!card.classList.contains("rise")) io.observe(card);
});

// o 2º passo do cadastro entra pergunta por pergunta (@starting-style lê o --i)
document.querySelectorAll(".perfil > *").forEach((el, i) => el.style.setProperty("--i", i));
// campo inválido: marca e dá uma sacudida curta (feedback, raro)
function invalido(el) {
  el.setAttribute("aria-invalid", "true");
  if (!reduce && el.animate) el.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
    { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  );
}

/* ---------- A/B: os dois arquétipos de gancho ---------- */
const ab = $("ab");
const shots = {
  a: {
    src: "img/gancho-a.jpg",
    alt: "Primeiro quadro do vídeo Pão na geladeira dura mais?, com título grande sobre a geladeira",
    nome: "Gancho A: Título de impacto",
    desc: "A pergunta que o público pesquisa, em letras enormes desde o quadro 0.",
    cap: "Na tela: “Pão na geladeira dura mais?”",
  },
  b: {
    src: "img/gancho-b.jpg",
    alt: "Primeiro quadro do vídeo Carregar à noite vicia?, com o celular-personagem ocupando a tela",
    nome: "Gancho B: Personagem em cena",
    desc: "O objeto vira personagem e ocupa a tela, grande e expressivo, desde o quadro 0.",
    cap: "Na tela: “Carregar o celular à noite toda vicia?”",
  },
};
new Image().src = shots.b.src;
const radios = ab.querySelectorAll("[role=radio]");
const abImg = $("ab-img");
let trocaAtual = 0;
async function trocarImagem(s) {
  const id = ++trocaAtual;
  if (reduce) { abImg.src = s.src; abImg.alt = s.alt; return; }
  abImg.classList.add("troca");
  await new Promise((r) => setTimeout(r, 200));
  if (id !== trocaAtual) return;
  abImg.src = s.src; abImg.alt = s.alt;
  try { await abImg.decode(); } catch { /* mostra assim mesmo */ }
  if (id === trocaAtual) abImg.classList.remove("troca");
}
function setMode(v) {
  if (ab.dataset.mode === v) return; // só conta troca de verdade
  ab.dataset.mode = v;
  radios.forEach((r) => { r.setAttribute("aria-checked", String(r.dataset.v === v)); r.tabIndex = r.dataset.v === v ? 0 : -1; });
  const s = shots[v];
  $("ab-name").textContent = s.nome;
  $("ab-desc").textContent = s.desc;
  $("ab-cap").textContent = s.cap;
  $("ab-live").textContent = `${s.nome}. ${s.cap}`;
  trocarImagem(s);
  visita.trocou_gancho++;
}
radios.forEach((r) => {
  r.addEventListener("click", () => setMode(r.dataset.v));
  r.addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const nv = ab.dataset.mode === "a" ? "b" : "a";
      setMode(nv);
      ab.querySelector(`[data-v="${nv}"]`).focus();
    }
  });
});
radios[1].tabIndex = -1;

/* ---------- prova real: ligar o som da narração ---------- */
const demo = $("demo");
const som = $("som");
if (demo && som) {
  som.hidden = false;
  const marcar = () => {
    const ligado = !demo.muted;
    som.setAttribute("aria-pressed", String(ligado));
    $("som-txt").textContent = ligado ? "Silenciar" : "Ativar som";
  };
  som.addEventListener("click", async () => {
    if (demo.muted) {
      demo.muted = false;
      demo.currentTime = 0; // começa a frase do início, com a legenda
      try { await demo.play(); } catch { demo.muted = true; }
    } else {
      demo.muted = true;
    }
    marcar();
  });
  demo.addEventListener("volumechange", marcar);
  // som só enquanto o vídeo está na tela
  new IntersectionObserver(([e]) => { if (!e.isIntersecting && !demo.muted) demo.muted = true; }, { threshold: 0.2 }).observe(demo);
}

/* ---------- capas: carrossel do celular acessível pelo teclado ---------- */
const wall = $("wall");
const celular = matchMedia("(max-width: 760px)");
const ajustarWall = () => { if (celular.matches) wall.tabIndex = 0; else wall.removeAttribute("tabindex"); };
celular.addEventListener("change", ajustarWall);
ajustarWall();


/* ---------- lista de espera em dois passos ---------- */
const f1 = $("form-lista");
const f2 = $("form-perfil");
const after = $("after");
const campo = (id) => document.getElementById(id);

// máscara do WhatsApp: (DD) 9XXXX-XXXX enquanto digita; o envio continua só com os dígitos
const whats = campo("whatsapp");
function formatarWhats(d) {
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2), n = d.slice(2);
  if (n.length <= 4) return `(${ddd}) ${n}`;
  const corte = n.length > 8 ? 5 : 4; // celular com 9 dígitos: 9XXXX-XXXX
  return `(${ddd}) ${n.slice(0, corte)}-${n.slice(corte)}`;
}
let whatsDigitos = "";
whats.addEventListener("input", (e) => {
  const pos = whats.selectionStart ?? whats.value.length;
  let digitos = whats.value.replace(/\D/g, "");
  let antes = whats.value.slice(0, pos).replace(/\D/g, "").length;
  // apagar um ( ) - ou espaço não muda os dígitos: apaga o dígito anterior
  if (e.inputType === "deleteContentBackward" && digitos === whatsDigitos && antes > 0) {
    digitos = digitos.slice(0, antes - 1) + digitos.slice(antes);
    antes--;
  }
  // colou com +55: tira o código do país
  if (digitos.length > 11 && digitos.startsWith("55")) { digitos = digitos.slice(2); antes = Math.max(0, antes - 2); }
  digitos = digitos.slice(0, 11);
  const novo = formatarWhats(digitos);
  whats.value = novo;
  whatsDigitos = digitos;
  if (document.activeElement === whats) {
    let i = 0;
    for (let vistos = 0; i < novo.length && vistos < Math.min(antes, digitos.length); i++) if (/\d/.test(novo[i])) vistos++;
    whats.setSelectionRange(i, i);
  }
});

const dados = () => ({
  nome: campo("nome").value.trim().replace(/\s+/g, " "),
  email: campo("email").value.trim(),
  whatsapp: campo("whatsapp").value.replace(/\D/g, ""),
  // aceita "@perfil", "perfil" ou o link do perfil
  instagram: campo("instagram").value.trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, ""),
});
const REGRAS = [
  ["nome", (d) => !d.nome || d.nome.length >= 2, "Confere o nome."],
  ["email", (d) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email), "Confere o e-mail: parece que faltou alguma parte."],
  ["whatsapp", (d) => d.whatsapp.length >= 10 && d.whatsapp.length <= 13, "Confere o WhatsApp: coloca o DDD e o número."],
  ["instagram", (d) => !d.instagram || /^[A-Za-z0-9._]{1,30}$/.test(d.instagram), "Confere o Instagram: só o @ do perfil, sem espaço."],
];
f1.addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = dados();
  REGRAS.forEach(([id]) => campo(id).removeAttribute("aria-invalid"));
  const erro = REGRAS.find(([, ok]) => !ok(d));
  if (!erro && !campo("aceite").checked) {
    after.textContent = "Marca o aceite para a gente poder te avisar.";
    campo("aceite").focus();
    return;
  }
  if (erro) {
    invalido(campo(erro[0]));
    after.textContent = erro[2];
    campo(erro[0]).focus();
    return;
  }
  const btn = f1.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Entrando…";
  const ok = await enviar("cadastro", { ...d, consentimento: "email+whatsapp " + new Date().toISOString() });
  btn.disabled = false; btn.textContent = "Entrar na lista";
  if (!ok) { after.textContent = "Não deu para salvar agora. Tenta de novo em instantes."; return; }
  inscrito();
  f1.hidden = true; f2.hidden = false;
  $("ok").focus();
});
f2.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = f2.querySelector("button[type=submit]");
  if (btn.disabled) return;
  const ig = campo("instagram");
  ig.removeAttribute("aria-invalid");
  if (!REGRAS[3][1](dados())) { invalido(ig); $("after2").textContent = REGRAS[3][2]; ig.focus(); return; }
  const r = new FormData(f2);
  btn.disabled = true; btn.textContent = "Salvando…";
  const ok = await enviar("perfil", {
    ...dados(),
    ja_posta: r.get("ja_posta") || "",
    nivel: r.get("nivel") || "",
    objetivo: r.get("objetivo") || "",
    seguidores: r.get("seguidores") || "",
    preco: r.get("preco") || "", // pergunta retirada em 04/11/2026 (preço fixado: 197 fundador, 397 cheio); coluna mantida
    nicho: (r.get("nicho") || "").trim().slice(0, 80),
  });
  if (!ok) {
    btn.disabled = false; btn.textContent = "Enviar respostas";
    $("after2").textContent = "Não deu para salvar as respostas agora. Tenta de novo em instantes.";
    return;
  }
  f2.innerHTML = '<p class="perfil-ok" tabindex="-1">Obrigado! Suas respostas ajudam a montar o kit. Até o lançamento.</p>';
  f2.querySelector("p").focus();
});

/* ---------- lista rápida: só o e-mail ---------- */
const fr = $("form-rapida");
fr.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email-rapido").value.trim();
  const msg = $("rapida-msg");
  $("email-rapido").removeAttribute("aria-invalid");
  if (!REGRAS[1][1]({ email })) {
    invalido($("email-rapido"));
    msg.textContent = REGRAS[1][2];
    $("email-rapido").focus();
    return;
  }
  const btn = fr.querySelector("button");
  btn.disabled = true; btn.textContent = "Entrando…";
  campo("email").value = email; // o 2º passo usa os mesmos campos
  const ok = await enviar("cadastro", { ...dados(), email, consentimento: "email (lista rápida) " + new Date().toISOString() });
  btn.disabled = false; btn.textContent = "Entrar na lista";
  if (!ok) { msg.textContent = "Não deu para salvar agora. Tenta de novo em instantes."; return; }
  inscrito();
  f1.hidden = true; f2.hidden = false;
  fr.closest(".rapida-box").innerHTML = '<div class="rapida-copy rapida-ok"><h2 tabindex="-1" id="rapida-ok">Pronto, você está na lista!</h2><p>Quer que o kit saia do seu jeito? <a href="#lista">Responda 5 perguntas rápidas</a> (opcional).</p></div>';
  $("rapida-ok").focus();
});

/* ---------- barra fixa do celular: aparece depois do hero, some perto dos formulários ---------- */
const fixa = $("fixa");
let jaInscrito = false;
const visiveis = new Set();
function atualizarFixa() {
  const mostrar = !jaInscrito && visiveis.size === 0;
  fixa.classList.toggle("on", mostrar);
  if (mostrar) fixa.removeAttribute("inert"); else fixa.setAttribute("inert", "");
}
const ioFixa = new IntersectionObserver((entries) => {
  for (const e of entries) { if (e.isIntersecting) visiveis.add(e.target); else visiveis.delete(e.target); }
  atualizarFixa();
});
document.querySelectorAll(".hero, #rapida, #lista, .end").forEach((el) => ioFixa.observe(el));
function inscrito() {
  jaInscrito = true;
  atualizarFixa();
  if (window.ttq) window.ttq.track("CompleteRegistration");
  if (window.fbq) window.fbq("track", "Lead");
}

/* ---------- pixels de conversão (IDs no config.js; vazios = desligados) ---------- */
if (window.TIKTOK_PIXEL_ID) {
  !function (w, d, t) {
    w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || []; ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"]; ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; }; for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]); ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; }; ttq.load = function (e, n) { var r = "https://analytics.tiktok.com/i18n/pixel/events.js"; ttq._i = ttq._i || {}, ttq._i[e] = [], ttq._i[e]._u = r, ttq._t = ttq._t || {}, ttq._t[e] = +new Date, ttq._o = ttq._o || {}, ttq._o[e] = n || {}; n = d.createElement("script"); n.type = "text/javascript", n.async = !0, n.src = r + "?sdkid=" + e + "&lib=" + t; e = d.getElementsByTagName("script")[0]; e.parentNode.insertBefore(n, e); };
    ttq.load(window.TIKTOK_PIXEL_ID); ttq.page();
  }(window, document, "ttq");
}
if (window.META_PIXEL_ID) {
  !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  window.fbq("init", window.META_PIXEL_ID); window.fbq("track", "PageView");
}

/* ---------- HERO 3D: as capas reais girando dentro do quadro 9:16 ---------- */
async function hero3d() {
  // roda também no celular (three.js chega com ~130 KB comprimido); só fica de fora quem pediu economia de dados ou menos movimento
  const economia = navigator.connection && navigator.connection.saveData;
  if (reduce || economia) return;
  let THREE;
  try { THREE = await import("./vendor/three.module.js"); } catch { return; }
  const stage = $("stage");
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100);
  camera.position.set(0, 0.2, 12.5);
  const loader = new THREE.TextureLoader();
  const ids = ["pao-geladeira", "ar-17", "descarga-tampa", "celular-arroz", "carregar-noite", "sabao-maquina"];
  // as capas paradas só saem depois que as texturas do 3D chegaram (sem quadro laranja vazio)
  let texs;
  try { texs = await Promise.all(ids.map((id) => loader.loadAsync(`img/capa-${id}.jpg`))); } catch { return; }
  texs.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; });
  // esteira: as capas sobem pela diagonal, uma atrás da outra, como numa linha de montagem
  const line = new THREE.Group();
  scene.add(line);
  const geo = new THREE.PlaneGeometry(1.6, 2.84);
  const N = 9;
  const cards = Array.from({ length: N }, (_, i) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texs[i % texs.length], side: THREE.DoubleSide, transparent: true }));
    line.add(m);
    return m;
  });
  let mx = 0, my = 0;
  addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  stage.querySelectorAll("img").forEach((i) => i.remove());
  stage.appendChild(renderer.domElement);
  // janela redimensionada: o quadro muda de tamanho e a cena acompanha
  new ResizeObserver(() => {
    const nw = stage.clientWidth, nh = stage.clientHeight;
    if (!nw || !nh) return;
    renderer.setSize(nw, nh);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
  }).observe(stage);
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(stage);
  const t0 = performance.now();
  (function loop(t) {
    requestAnimationFrame(loop);
    if (!visible) return;
    const s = (t - t0) / 1000;
    cards.forEach((m, i) => {
      const u = (i / N + s * 0.045) % 1;            // 0 = entra embaixo, 1 = sai em cima
      m.position.set(1.4 - u * 2.8, -6.2 + u * 12.4, Math.sin(u * Math.PI) * 2.2 - 1.4);
      m.rotation.set(-0.15, -0.55 + u * 1.1, 0.12);
      m.material.opacity = Math.min(1, Math.sin(u * Math.PI) * 3);
    });
    line.rotation.y = mx * 0.35 + Math.sin(s * 0.5) * 0.07;   // balanço próprio: no toque não há mouse para mover a esteira
    line.rotation.x = my * 0.2;
    renderer.render(scene, camera);
  })(t0);
}
hero3d();
