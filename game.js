/* ETEscape — Fuga da Escola · graphic novel
   Regras do plano: 5 minutos, penalidades de 15 s, minigame (escolha 4) e puzzle (escolha 14).
   O relógio só corre enquanto o jogador decide ou joga um desafio. */
(() => {
  "use strict";

  /* ============================================================
     CONFIGURAÇÃO
     ============================================================ */
  const TEMPO_TOTAL = 300;
  const PENALIDADE = 15;
  const URGENTE = 30;
  const PERIGO = 60;

  // Caminhos das imagens (troque aqui para usar outras artes)
  const A = {
    logo: "assets/menu/logo.png",
    noite: "assets/menu/escola_noite.jpg",
    fogo: "assets/menu/escola_fogo_sprite.png",
    sala: "assets/fase_01/sala_seguranca.png",
    gaveta: "assets/fase_01/gaveta_chave_sprite.png",
    corredor: "assets/fase_02/corredor_cartazes.jpg",
    avisos: "assets/fase_03/avisos_extintor.png",
    portas: "assets/fase_04/portas_fogo.png",
    chama: "assets/fx/chama.png",
  };

  const RETRATOS = {
    neutro: "assets/char/neutro.png",
    pensando: "assets/char/pensando.png",
    preocupado: "assets/char/preocupado.png",
    choro: "assets/char/choro.png",
    choro_aberto: "assets/char/choro_aberto.png",
  };

  // Sprites (folhas de quadros)
  const SPR = {
    fogo: { src: A.fogo, cols: 5, rows: 2, frames: 9, fps: 8 },
    gaveta: { src: A.gaveta, cols: 5, rows: 3, frames: 11, fps: 8 },
  };

  // Fundos de cena: w/h = tamanho da imagem (para o enquadramento); fx = efeitos
  const FUNDOS = {
    logo: { img: A.logo, w: 2000, h: 1200 },
    noite: { img: A.noite, w: 1600, h: 960 },
    fogo: { sprite: SPR.fogo, w: 1920, h: 1170 },
    sala: { img: A.sala, w: 1920, h: 1080, fx: ["fumaca-topo"] },
    corredor: { img: A.corredor, w: 1600, h: 960, fx: ["fumaca-esq"] },
    avisos: { img: A.avisos, w: 2000, h: 1200, fx: ["chama", "brasas"] },
    portas: { img: A.portas, w: 1920, h: 1080, fx: ["brasas"] },
  };

  /* ============================================================
     ESTADO E UTILITÁRIOS
     ============================================================ */
  const $ = (id) => document.getElementById(id);
  const criar = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };

  const el = {
    palco: $("palco"), arteBox: $("arte-box"), perigo: $("perigo"),
    faixa: $("faixa"), retrato: $("retrato"), texto: $("texto"), textoC: $("texto-conteudo"),
    caret: $("caret"), escolhas: $("escolhas"),
    sfx: $("sfx"), menos: $("menos"), flash: $("flash"), cortina: $("cortina"),
    tagFase: $("tag-fase"), relogio: $("relogio"), estadoR: $("estado-relogio"),
    tempo: $("tempo"), barra: $("barra-tempo"), btnSom: $("btn-som"), btnOlho: $("btn-olho"),
    cartao: $("cartao"), cartaoT: $("cartao-t"), cartaoS: $("cartao-s"),
    desafio: $("desafio"), caixa: $("desafio-caixa"),
    como: $("como"), final: $("final"), finalBox: $("final-box"),
    finalT: $("final-t"), finalP: $("final-p"), finalTempo: $("final-tempo"),
  };

  class Cancelado extends Error {}

  const E = {
    sid: 0,
    limpezas: [],
    avanco: null,
    pular: null,
    teclas: null,
    relogio: false,
    ultimo: 0,
    tempo: TEMPO_TOTAL,
    viuMapa: false,
    fundo: null,
    focoEl: null,
    pararSprite: null,
    mudo: false,
  };

  try { E.mudo = localStorage.getItem("ete-mudo") === "1"; } catch (_) { /* sem storage */ }

  const MQ_RETRATO = window.matchMedia("(orientation: portrait) and (max-width: 820px)");

  function novaSessao() {
    E.sid++;
    const l = E.limpezas.splice(0);
    l.forEach((f) => { try { f(); } catch (_) { /* ignora */ } });
    E.avanco = null;
    E.pular = null;
    E.teclas = null;
    return E.sid;
  }
  const checar = (sid) => { if (sid !== E.sid) throw new Cancelado(); };
  function reg(fn) {
    E.limpezas.push(fn);
    return () => {
      const i = E.limpezas.indexOf(fn);
      if (i >= 0) E.limpezas.splice(i, 1);
    };
  }
  function espera(sid, ms) {
    return new Promise((res, rej) => {
      if (sid !== E.sid) return rej(new Cancelado());
      const t = setTimeout(() => { off(); res(); }, ms);
      const off = reg(() => { clearTimeout(t); rej(new Cancelado()); });
    });
  }
  async function rodar(fn) {
    try { await fn(); } catch (e) { if (!(e instanceof Cancelado)) console.error(e); }
  }
  const fmt = (s) => {
    const n = Math.max(0, Math.ceil(s));
    return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  };

  /* ============================================================
     SOM (bips retrô com WebAudio)
     ============================================================ */
  const SOM = (() => {
    let ac = null;
    function ctx() {
      if (E.mudo) return null;
      if (!ac) {
        try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
      }
      if (ac.state === "suspended") ac.resume().catch(() => {});
      return ac;
    }
    function tom(f, d, tipo, v, t0, f2) {
      const c = ctx();
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      const t = c.currentTime + (t0 || 0);
      o.type = tipo || "square";
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.linearRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(v || 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + d + 0.02);
    }
    return {
      blip() { tom(480 + Math.random() * 80, 0.04, "square", 0.012); },
      clique() { tom(660, 0.05, "square", 0.03); },
      ruim() { tom(260, 0.2, "sawtooth", 0.05, 0, 110); },
      batida() { tom(90, 0.16, "square", 0.08, 0, 40); },
      acerto() { tom(880, 0.08, "square", 0.04); tom(1175, 0.1, "square", 0.04, 0.07); },
      bom() { [523, 659, 784, 1047].forEach((f, i) => tom(f, 0.14, "square", 0.04, i * 0.1)); },
      alarme() { tom(880, 0.22, "square", 0.03); tom(660, 0.22, "square", 0.03, 0.24); },
    };
  })();

  /* ============================================================
     RELÓGIO
     ============================================================ */
  function atualizarRelogio() {
    el.tempo.textContent = fmt(E.tempo);
    el.barra.style.width = Math.max(0, E.tempo) / TEMPO_TOTAL * 100 + "%";
    el.relogio.classList.toggle("urgente", E.tempo <= URGENTE);
    const jogando = el.palco.dataset.tela === "jogo";
    el.perigo.classList.toggle("on", jogando && E.tempo <= PERIGO);
  }
  function relogio(on) {
    E.relogio = on;
    E.ultimo = performance.now();
    el.relogio.classList.toggle("parado", !on);
    el.estadoR.textContent = on ? "CORRENDO" : "PAUSADO";
  }
  setInterval(() => {
    const agora = performance.now();
    const dt = (agora - E.ultimo) / 1000;
    E.ultimo = agora;
    if (!E.relogio || document.hidden || MQ_RETRATO.matches) return;
    E.tempo -= dt;
    atualizarRelogio();
    if (E.tempo <= 0) { E.tempo = 0; atualizarRelogio(); fimTempo(); }
  }, 200);

  /* ============================================================
     ARTE: fundos, sprites, efeitos
     ============================================================ */
  function animarSprite(elem, s) {
    elem.style.backgroundImage = `url("${s.src}")`;
    elem.style.backgroundSize = `${s.cols * 100}% ${s.rows * 100}%`;
    let i = 0;
    const pos = () => {
      const c = i % s.cols, r = Math.floor(i / s.cols);
      elem.style.backgroundPosition =
        `${s.cols > 1 ? c / (s.cols - 1) * 100 : 0}% ${s.rows > 1 ? r / (s.rows - 1) * 100 : 0}%`;
    };
    pos();
    const t = setInterval(() => { i = (i + 1) % s.frames; pos(); }, 1000 / s.fps);
    return () => clearInterval(t);
  }

  // Fumaça pixelada gerada em canvas (ruído de valor, 3 níveis de cinza-violeta)
  const cacheFumaca = {};
  function urlFumaca(semente) {
    if (cacheFumaca[semente]) return cacheFumaca[semente];
    const W = 96, H = 54;
    let s = semente;
    const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const grade = (gw, gh) => Array.from({ length: gh + 1 }, () => Array.from({ length: gw + 1 }, rnd));
    const amostra = (g, gw, gh, x, y) => {
      const fx = x / W * gw, fy = y / H * gh;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const a = g[y0][x0], b = g[y0][x0 + 1], c = g[y0 + 1][x0], d = g[y0 + 1][x0 + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const g1 = grade(6, 4), g2 = grade(14, 8);
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const cx = cv.getContext("2d");
    const im = cx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = amostra(g1, 6, 4, x, y) * 0.65 + amostra(g2, 14, 8, x, y) * 0.35;
        const i = (y * W + x) * 4;
        let r = 0, gg = 0, b = 0, al = 0;
        if (n > 0.72) { r = 70; gg = 60; b = 120; al = 190; }
        else if (n > 0.6) { r = 105; gg = 95; b = 160; al = 140; }
        else if (n > 0.5) { r = 140; gg = 130; b = 190; al = 90; }
        im.data[i] = r; im.data[i + 1] = gg; im.data[i + 2] = b; im.data[i + 3] = al;
      }
    }
    cx.putImageData(im, 0, 0);
    cacheFumaca[semente] = cv.toDataURL();
    return cacheFumaca[semente];
  }

  function montarFx(lista, box) {
    const fx = criar("div", "fx");
    (lista || []).forEach((nome) => {
      if (nome.startsWith("fumaca")) {
        const im = criar("img", "fumaca " + (nome === "fumaca-esq" ? "esq" : "topo"));
        im.alt = "";
        im.src = urlFumaca(nome === "fumaca-esq" ? 7 : 21);
        fx.appendChild(im);
      } else if (nome === "chama") {
        const im = criar("img", "chama");
        im.alt = "";
        im.src = A.chama;
        fx.appendChild(im);
      } else if (nome === "brasas") {
        for (let i = 0; i < 14; i++) {
          const b = criar("i", "brasa");
          b.style.left = Math.random() * 98 + "%";
          b.style.animationDuration = 3 + Math.random() * 4 + "s";
          b.style.animationDelay = -Math.random() * 6 + "s";
          if (i % 3 === 0) b.style.background = "#ffd84a";
          fx.appendChild(b);
        }
      }
    });
    box.appendChild(fx);
  }

  function aplicarFundo(chave) {
    const f = FUNDOS[chave];
    if (E.pararSprite) { E.pararSprite(); E.pararSprite = null; }
    el.arteBox.innerHTML = "";
    el.arteBox.style.setProperty("--r", String(f.w / f.h));
    if (f.img) {
      const im = criar("img", "arte-img");
      im.alt = "";
      im.src = f.img;
      el.arteBox.appendChild(im);
    } else {
      const d = criar("div", "arte-sprite");
      el.arteBox.appendChild(d);
      E.pararSprite = animarSprite(d, f.sprite);
    }
    montarFx(f.fx, el.arteBox);
    const foco = criar("div", "foco");
    el.arteBox.appendChild(foco);
    E.focoEl = foco;
    E.fundo = chave;
  }
  async function cortina(sid, escurecer) {
    el.cortina.classList.toggle("on", escurecer);
    await espera(sid, 240);
  }
  async function mudarFundo(sid, chave) {
    if (E.fundo === chave) return;
    await cortina(sid, true);
    aplicarFundo(chave);
    await cortina(sid, false);
  }
  function mostrarFoco(r) {
    if (!r || !E.focoEl) return;
    const f = E.focoEl;
    f.style.left = r[0] * 100 + "%";
    f.style.top = r[1] * 100 + "%";
    f.style.width = r[2] * 100 + "%";
    f.style.height = r[3] * 100 + "%";
    f.classList.add("on");
  }
  function esconderFoco() { if (E.focoEl) E.focoEl.classList.remove("on"); }

  /* ============================================================
     RETRATO, TEXTO, EFEITOS DE QUADRINHO
     ============================================================ */
  function setRetrato(expr) {
    if (expr === undefined) return;
    if (expr === null) {
      el.retrato.hidden = true;
      el.faixa.classList.add("sem-retrato");
      return;
    }
    el.retrato.hidden = false;
    el.faixa.classList.remove("sem-retrato");
    const src = RETRATOS[expr];
    if (!el.retrato.src.endsWith(src)) el.retrato.src = src;
  }
  function esconderTexto() {
    el.texto.hidden = true;
    el.caret.hidden = true;
    el.retrato.classList.remove("respira");
  }

  const N = (texto, o) => Object.assign({ tipo: "narr", texto }, o);
  const F = (texto, expr) => ({ tipo: "fala", texto, expr: expr || "neutro" });

  function digitar(sid, texto) {
    return new Promise((res, rej) => {
      if (sid !== E.sid) return rej(new Cancelado());
      let i = 0;
      el.textoC.textContent = "";
      const fim = () => {
        clearInterval(t);
        el.textoC.textContent = texto;
        E.pular = null;
        off();
        res();
      };
      const t = setInterval(() => {
        i++;
        el.textoC.textContent = texto.slice(0, i);
        if (i % 3 === 0) SOM.blip();
        if (i >= texto.length) fim();
      }, 22);
      E.pular = fim;
      const off = reg(() => { clearInterval(t); E.pular = null; rej(new Cancelado()); });
    });
  }
  function esperarAvanco(sid) {
    return new Promise((res, rej) => {
      if (sid !== E.sid) return rej(new Cancelado());
      el.caret.hidden = false;
      const off = reg(() => { E.avanco = null; rej(new Cancelado()); });
      E.avanco = () => { off(); el.caret.hidden = true; SOM.clique(); res(); };
    });
  }
  async function dizer(sid, p) {
    checar(sid);
    setRetrato(p.expr);
    el.faixa.classList.remove("com-escolhas");
    el.texto.className = "texto " + (p.tipo === "fala" ? "fala" : "narr");
    el.texto.hidden = false;
    el.retrato.classList.toggle("respira", p.tipo === "fala");
    await digitar(sid, p.texto);
    await esperarAvanco(sid);
  }
  async function sequencia(sid, passos) {
    for (const p of passos) await dizer(sid, p);
    esconderTexto();
  }

  async function efeito(sid, texto, som) {
    el.sfx.textContent = texto;
    el.sfx.style.fontSize = Math.min(6, 70 / Math.max(1, texto.length)) + "cqw";
    el.sfx.classList.remove("on");
    el.palco.classList.remove("tremer");
    void el.sfx.offsetWidth;
    el.sfx.classList.add("on");
    el.palco.classList.add("tremer");
    if (som && SOM[som]) SOM[som]();
    await espera(sid, 900);
    el.sfx.classList.remove("on");
    el.palco.classList.remove("tremer");
  }
  function mostrarMenos(seg) {
    el.menos.textContent = "-" + seg + "s";
    el.menos.classList.remove("on");
    void el.menos.offsetWidth;
    el.menos.classList.add("on");
    el.flash.classList.remove("on");
    void el.flash.offsetWidth;
    el.flash.classList.add("on");
  }
  async function penalizar(sid, seg, texto, som) {
    await efeito(sid, texto, som || "batida");
    E.tempo -= seg;
    mostrarMenos(seg);
    atualizarRelogio();
    SOM.ruim();
    if (E.tempo <= 0) { E.tempo = 0; atualizarRelogio(); fimTempo(); throw new Cancelado(); }
  }

  async function cartao(sid, titulo, sub) {
    el.tagFase.textContent = "";
    el.cartaoT.textContent = titulo;
    el.cartaoS.textContent = sub;
    el.cartao.classList.add("on");
    SOM.alarme();
    await new Promise((res, rej) => {
      if (sid !== E.sid) return rej(new Cancelado());
      const fim = () => { clearTimeout(t); off(); E.avanco = null; res(); };
      const t = setTimeout(fim, 1900);
      E.avanco = fim;
      const off = reg(() => { clearTimeout(t); E.avanco = null; rej(new Cancelado()); });
    }).finally(() => el.cartao.classList.remove("on"));
  }

  /* ============================================================
     DESAFIO 1 — minigame da gaveta (escolha 4)
     ============================================================ */
  function abrirDesafio() {
    el.caixa.innerHTML = "";
    el.desafio.classList.add("on");
    return el.caixa;
  }
  function fecharDesafio() {
    el.desafio.classList.remove("on");
    el.caixa.innerHTML = "";
  }

  function minigameGaveta(sid) {
    return new Promise((res, rej) => {
      if (sid !== E.sid) return rej(new Cancelado());
      const caixa = abrirDesafio();

      const visor = criar("div");
      const gv = criar("div", "gaveta");
      gv.style.aspectRatio = "16 / 9";
      const trilho = criar("div", "trilho");
      const zona = criar("div", "zona");
      zona.id = "mg-zona";
      const marc = criar("div", "marcador");
      marc.id = "mg-marc";
      trilho.append(zona, marc);
      visor.append(gv, trilho);

      const lado = criar("div", "desafio-lado");
      const h = criar("h2", "", "GAVETA EMPERRADA");
      const d = criar("p", "", "Pare o marcador na zona verde 3 vezes seguidas para pegar a chave. O tempo continua correndo!");
      const chaves = criar("div", "chaves");
      const status = criar("div", "status");
      const bt = criar("div", "linha-botoes");
      const bAgir = criar("button", "btn-grande", "ABRIR");
      bAgir.type = "button";
      bAgir.id = "mg-agir";
      const bSair = criar("button", "btn-grande sec", "VOLTAR");
      bSair.type = "button";
      bSair.id = "mg-sair";
      bt.append(bAgir, bSair);
      lado.append(h, d, chaves, status, bt);
      caixa.append(visor, lado);

      const pararSprite = animarSprite(gv, SPR.gaveta);
      const largura = 0.2, velIni = 0.8;
      let pos = 0, dir = 1, vel = velIni, acertos = 0, zonaIni = 0, ultimo = performance.now();
      let raf = 0, tm = 0, terminado = false;

      const novaZona = () => {
        zonaIni = 0.05 + Math.random() * (0.9 - largura);
        zona.style.left = zonaIni * 100 + "%";
        zona.style.width = largura * 100 + "%";
      };
      const desenhar = () => { chaves.textContent = "🔑".repeat(acertos) + "⬜".repeat(3 - acertos); };
      const loop = (t) => {
        const dt = (t - ultimo) / 1000;
        ultimo = t;
        pos += dir * vel * dt;
        if (pos >= 1) { pos = 1; dir = -1; }
        if (pos <= 0) { pos = 0; dir = 1; }
        marc.style.left = pos * 100 + "%";
        raf = requestAnimationFrame(loop);
      };
      const limpar = () => {
        terminado = true;
        cancelAnimationFrame(raf);
        clearTimeout(tm);
        pararSprite();
        document.removeEventListener("keydown", tecla);
        fecharDesafio();
      };
      const concluir = (v) => { off(); limpar(); relogio(false); res(v); };
      const agir = () => {
        if (terminado) return;
        if (pos >= zonaIni && pos <= zonaIni + largura) {
          acertos++;
          vel *= 1.2;
          SOM.acerto();
          status.textContent = "Boa!";
          if (acertos >= 3) {
            terminado = true;
            cancelAnimationFrame(raf);
            relogio(false);
            desenhar();
            status.textContent = "Você achou a chave! 🔑";
            SOM.bom();
            tm = setTimeout(() => concluir(true), 1100);
            return;
          }
          novaZona();
        } else {
          acertos = 0;
          vel = velIni;
          SOM.ruim();
          status.textContent = "Errou! Recomeçando...";
          novaZona();
        }
        desenhar();
      };
      function tecla(e) {
        if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
          e.preventDefault();
          agir();
        }
      }

      const off = reg(() => { limpar(); rej(new Cancelado()); });
      novaZona();
      desenhar();
      raf = requestAnimationFrame(loop);
      bAgir.addEventListener("pointerdown", (e) => { e.preventDefault(); agir(); });
      bAgir.addEventListener("click", (e) => e.preventDefault());
      bSair.addEventListener("click", () => { if (!terminado) concluir(false); });
      document.addEventListener("keydown", tecla);
      relogio(true);
    });
  }

  /* ============================================================
     DESAFIO 2 — puzzle do mapa (escolha 14)
     ============================================================ */
  function desenharMapa() {
    const c = document.createElement("canvas");
    c.width = 96; c.height = 96;
    const g = c.getContext("2d");
    const r = (x, y, w, h, cor) => { g.fillStyle = cor; g.fillRect(x, y, w, h); };
    const NAVY = "#0a0a4a", PAR = "#4b3fb0", PISO = "#2a1a6a", COR = "#b39dff", SALA = "#3a2a8a";
    const AMA = "#ffd84a", LAR = "#ff6b2c", VERM = "#e5102a", AZ = "#1a3cff", CRE = "#fff0c8", VERD = "#0f6a2a";

    r(0, 0, 96, 96, NAVY);
    [[3, 2], [20, 1], [44, 3], [60, 1], [88, 2], [2, 50], [93, 60], [2, 92], [50, 94], [75, 93]].forEach(([x, y]) => r(x, y, 1, 1, AMA));
    r(4, 4, 88, 88, PAR);
    r(6, 6, 84, 84, PISO);
    // salas
    r(8, 8, 30, 28, SALA); r(42, 8, 28, 28, SALA);
    r(8, 60, 28, 28, SALA); r(42, 60, 28, 28, SALA);
    // corredores
    r(6, 38, 66, 20, COR); r(72, 6, 18, 84, COR);
    // portas das salas
    r(18, 36, 10, 2, COR); r(52, 36, 10, 2, COR); r(14, 58, 10, 2, COR); r(52, 58, 10, 2, COR);
    // janelas
    [[12, 12], [22, 12], [46, 12], [58, 12], [12, 82], [46, 82], [58, 82]].forEach(([x, y]) => r(x, y, 6, 4, CRE));
    // sala de segurança (baixo à esquerda): armário e mesa
    r(10, 62, 9, 6, "#9a9a8a"); r(27, 62, 8, 5, "#5a4a3a");
    // sala do quadro de avisos (cima, meio): quadro e extintor
    r(46, 24, 12, 8, VERD); r(48, 26, 4, 4, CRE); r(54, 26, 3, 3, CRE); r(63, 24, 4, 9, VERM);
    // fogo
    const fogo = (x, y) => { r(x + 1, y, 3, 2, VERM); r(x, y + 2, 5, 3, LAR); r(x + 1, y + 3, 3, 2, AMA); };
    fogo(14, 22); fogo(28, 26); fogo(76, 12); fogo(82, 22); fogo(48, 70);
    // porta azul (topo) e vermelha (base)
    r(76, 4, 10, 3, AZ);
    r(76, 89, 10, 3, VERM);
    // você (estrela amarela) na sala de segurança
    r(19, 72, 3, 9, AMA); r(16, 75, 9, 3, AMA); r(19, 75, 3, 3, CRE);
    // rota tracejada: sala -> corredor -> corredor vertical -> porta vermelha
    const ponto = (x, y) => r(x, y, 2, 2, AMA);
    for (let y = 68; y >= 48; y -= 4) ponto(19, y);
    for (let x = 19; x <= 81; x += 4) ponto(x, 48);
    for (let y = 52; y <= 80; y += 4) ponto(81, y);
    // seta de saída
    r(80, 83, 4, 2, AMA); r(81, 85, 2, 2, AMA);
    return c;
  }

  function mapaPuzzle(sid) {
    return new Promise((res, rej) => {
      if (sid !== E.sid) return rej(new Cancelado());
      const caixa = abrirDesafio();
      const mestre = desenharMapa();
      const T = 32;

      const visor = criar("div", "grade-mapa");
      const lado = criar("div", "desafio-lado");
      const h = criar("h2", "", "MAPA RASGADO");
      const d = criar("p", "", "As peças estão fora do lugar. Toque em duas peças para trocá-las e monte o mapa da escola. O tempo continua correndo!");
      const status = criar("div", "status");
      const bt = criar("div", "linha-botoes");
      const bEsp = criar("button", "btn-grande sec", "👁 ESPIAR");
      bEsp.type = "button";
      const bSair = criar("button", "btn-grande sec", "VOLTAR");
      bSair.type = "button";
      bSair.id = "pz-sair";
      bt.append(bEsp, bSair);
      lado.append(h, d, status, bt);
      caixa.append(visor, lado);

      // embaralha (nunca já resolvido)
      let ordem;
      do {
        ordem = [0, 1, 2, 3, 4, 5, 6, 7, 8];
        for (let i = ordem.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
        }
      } while (ordem.every((v, i) => v === i) || ordem.filter((v, i) => v !== i).length < 5);

      let sel = null, terminado = false, espiando = null;
      const resolvido = () => ordem.every((v, i) => v === i);

      function render() {
        visor.innerHTML = "";
        ordem.forEach((id, pos) => {
          const b = criar("button", "peca" + (id === pos ? " certa" : "") + (sel === pos ? " sel" : ""));
          b.type = "button";
          b.dataset.pos = String(pos);
          b.dataset.id = String(id);
          b.setAttribute("aria-label", "Peça " + (pos + 1));
          const cv = document.createElement("canvas");
          cv.width = T; cv.height = T;
          cv.getContext("2d").drawImage(mestre, (id % 3) * T, Math.floor(id / 3) * T, T, T, 0, 0, T, T);
          b.appendChild(cv);
          b.addEventListener("click", () => clicar(pos));
          visor.appendChild(b);
        });
      }
      function clicar(pos) {
        if (terminado) return;
        SOM.clique();
        if (sel === null) sel = pos;
        else {
          if (sel !== pos) [ordem[sel], ordem[pos]] = [ordem[pos], ordem[sel]];
          sel = null;
        }
        render();
        if (resolvido()) ganhou();
      }
      function ganhou() {
        terminado = true;
        relogio(false);
        SOM.bom();
        visor.innerHTML = "";
        visor.className = "";
        const big = document.createElement("canvas");
        big.width = 96; big.height = 96;
        big.className = "mapa-completo";
        big.getContext("2d").drawImage(mestre, 0, 0);
        visor.appendChild(big);
        h.textContent = "MAPA COMPLETO!";
        d.textContent = "A rota amarela leva até a porta vermelha, no fim do corredor. Essa é a saída!";
        status.textContent = "";
        bt.innerHTML = "";
        const bOk = criar("button", "btn-grande", "CONTINUAR");
        bOk.type = "button";
        bOk.id = "pz-ok";
        bOk.addEventListener("click", () => concluir(true));
        bt.appendChild(bOk);
      }
      const limpar = () => { terminado = true; fecharDesafio(); };
      const concluir = (v) => { off(); limpar(); relogio(false); res(v); };
      const off = reg(() => { limpar(); rej(new Cancelado()); });

      bEsp.addEventListener("pointerdown", () => {
        if (terminado || espiando) return;
        espiando = mestre.cloneNode();
        espiando.getContext("2d").drawImage(mestre, 0, 0);
        espiando.className = "espiar";
        visor.appendChild(espiando);
      });
      const soltar = () => { if (espiando) { espiando.remove(); espiando = null; } };
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => bEsp.addEventListener(ev, soltar));
      bSair.addEventListener("click", () => { if (!terminado) concluir(false); });

      render();
      relogio(true);
    });
  }

  /* ============================================================
     HISTÓRIA: fases e escolhas (numeração do plano)
     tipos: penalidade | avancar | retorno | gaveta | mapa | vitoria
     foco = [x, y, w, h] normalizado sobre a imagem
     ============================================================ */
  const FASES = [
    {
      id: 1, titulo: "FASE 1", sub: "Sala de Segurança", tag: "FASE 1 · SALA DE SEGURANÇA", fundo: "sala",
      abertura: () => [
        F("Que barulho é esse?! A porta trancou... e eu estou preso na Sala de Segurança!", "preocupado"),
        N("Você tem 5 minutos para escapar. Alguns erros custam tempo."),
      ],
      opcoes: [
        { id: 1, rotulo: "Tentar abrir a janela", tipo: "penalidade", custo: PENALIDADE,
          foco: [0.005, 0.255, 0.125, 0.39], sfx: ["RANGE!", "batida"],
          depois: () => [N("Você força a janela com toda a força, mas ela não cede."), F("Não abre de jeito nenhum!", "preocupado")] },
        { id: 2, rotulo: "Tentar quebrar as grades e a janela", tipo: "penalidade", custo: PENALIDADE,
          foco: [0.005, 0.255, 0.125, 0.39], sfx: ["CRASH!", "batida"],
          depois: () => [N("Você pega uma cadeira e bate nas grades. Nada acontece."), F("Elas nem arranharam!", "preocupado")] },
        { id: 3, rotulo: "Forçar a porta", tipo: "penalidade", custo: PENALIDADE,
          foco: [0.87, 0.185, 0.12, 0.805], sfx: ["BAM! BAM!", "batida"],
          depois: () => [N("Você joga o corpo contra a porta. Ela nem se mexe."), F("Está trancada!", "preocupado")] },
        { id: 4, rotulo: "Procurar a chave", tipo: "gaveta",
          foco: [0.375, 0.305, 0.195, 0.605],
          antes: () => [N("Você revira a sala e encontra uma gaveta velha, emperrada e cheia de teias...")],
          depois: () => [F("Achei! A chave estava aqui!", "neutro"), N("A porta destranca e você corre para o corredor.")] },
      ],
    },
    {
      id: 2, titulo: "FASE 2", sub: "Corredores", tag: "FASE 2 · CORREDORES", fundo: "corredor",
      abertura: () => [
        N("O corredor se divide em dois caminhos."),
        N("À esquerda, uma nuvem de fumaça. À direita, o ar parece limpo."),
        F("Hmm... qual caminho eu pego?", "pensando"),
      ],
      opcoes: [
        { id: 5, rotulo: "Corredor com fumaça", tipo: "avancar", custo: PENALIDADE,
          foco: [0.03, 0.12, 0.45, 0.78], sfx: ["COF! COF!", "ruim"],
          depois: () => [F("*cof* *cof* Não consigo respirar!", "preocupado"), N("Você atravessa o corredor tossindo, com os olhos ardendo.")] },
        { id: 6, rotulo: "Corredor sem fumaça", tipo: "avancar", custo: 0,
          foco: [0.52, 0.12, 0.45, 0.78],
          depois: () => [N("Você segue abaixado pelo caminho livre de fumaça."), F("Essa foi por pouco! Vamos em frente!", "neutro")] },
      ],
    },
    {
      id: 3, titulo: "FASE 3", sub: "Extintor ou quadro de avisos", tag: "FASE 3 · EXTINTOR OU AVISOS", fundo: "avisos",
      abertura: () => [
        N("Um foco de fogo bloqueia o corredor. Na parede, há um extintor e um quadro de avisos."),
        F("Preciso decidir rápido!", "pensando"),
      ],
      opcoes: [
        { id: 11, rotulo: "Tentar apagar o fogo sozinho", tipo: "penalidade", custo: PENALIDADE,
          foco: [0.6, 0.31, 0.375, 0.69], sfx: ["FSSSH!", "ruim"],
          depois: () => [N("Você tenta usar o extintor, mas o fogo é grande demais."), F("Não vou conseguir sozinho!", "preocupado")] },
        { id: 12, rotulo: "Não apagar o fogo", tipo: "retorno",
          foco: [0.6, 0.31, 0.26, 0.69],
          depois: () => [N("Você desiste e recua. O fogo cresce atrás de você."), N("De volta ao início da fase...")] },
        { id: 13, rotulo: "Admirar os avisos", tipo: "penalidade", custo: PENALIDADE,
          foco: [0.25, 0.117, 0.35, 0.65], sfx: ["TIC TAC...", "ruim"],
          depois: () => [N("Você fica olhando os cartazes e perde um tempo precioso."), F("O que eu estou fazendo?! Não é hora disso!", "preocupado")] },
        { id: 14, rotulo: "Ver a rota de fuga", tipo: "mapa",
          foco: [0.38, 0.4, 0.17, 0.267],
          antes: () => [N("Entre os papéis do quadro, há um mapa rasgado da escola. As peças estão fora do lugar!")],
          depois: () => [F("Achei! A saída é pela porta vermelha, no fim do corredor!", "neutro")] },
      ],
    },
    {
      id: 4, titulo: "FASE 4", sub: "Portas azul e vermelha", tag: "FASE 4 · PORTAS AZUL E VERMELHA", fundo: "portas",
      abertura: () => {
        const l = [N("No fim do corredor, duas portas: uma azul e uma vermelha. O fogo está por toda parte.")];
        if (E.viuMapa) l.push(N("No mapa, a saída ficava depois da porta vermelha."));
        l.push(F("Qual delas é a certa?", "pensando"));
        return l;
      },
      opcoes: [
        { id: 7, rotulo: "Conferir a maçaneta da porta azul", cor: "azul", tipo: "retorno",
          foco: [0.727, 0.167, 0.182, 0.76], sfx: ["TSSSS!", "ruim"],
          depois: () => [N("AI! A maçaneta está fervendo! Há fogo do outro lado."), N("Você recua para o início do corredor...")] },
        { id: 8, rotulo: "Entrar direto pela porta azul", cor: "azul", tipo: "penalidade", custo: PENALIDADE,
          foco: [0.727, 0.167, 0.182, 0.76], sfx: ["FLAAASH!", "batida"],
          depois: () => [N("Você abre a porta e uma labareda te joga para trás!"), F("Fogo! Foi por pouco!", "preocupado")] },
        { id: 9, rotulo: "Conferir a maçaneta da porta vermelha", cor: "vermelha", tipo: "vitoria",
          foco: [0.09, 0.167, 0.185, 0.75], sfx: ["CLIC!", "acerto"],
          depois: () => [N("A maçaneta está fria. A porta se abre devagar..."), F("É a saída!", "neutro")] },
        { id: 10, rotulo: "Esperar ajuda perto da porta vermelha", cor: "vermelha", tipo: "penalidade", custo: PENALIDADE + 30,
          foco: [0.09, 0.167, 0.185, 0.75], sfx: ["TIC... TAC...", "ruim"],
          depois: () => [N("Você espera... e espera... mas ninguém aparece."), F("Esperar foi uma péssima ideia! Perdi muito tempo!", "preocupado")] },
      ],
    },
  ];

  /* ============================================================
     FLUXO DO JOGO
     ============================================================ */
  function menuEscolhas(sid, fase, usadas) {
    return new Promise((res, rej) => {
      if (sid !== E.sid) return rej(new Cancelado());
      setRetrato("pensando");
      esconderTexto();
      el.faixa.classList.add("com-escolhas");
      el.escolhas.innerHTML = "";
      fase.opcoes.forEach((o, i) => {
        const b = criar("button", "escolha" + (o.cor ? " " + o.cor : ""));
        b.type = "button";
        b.append(criar("b", "num", String(i + 1)), criar("span", "", o.rotulo));
        if (usadas.has(o.id)) { b.disabled = true; b.classList.add("usada"); }
        b.addEventListener("click", () => escolher(o));
        ["pointerenter", "focus"].forEach((ev) => b.addEventListener(ev, () => mostrarFoco(o.foco)));
        ["pointerleave", "blur"].forEach((ev) => b.addEventListener(ev, esconderFoco));
        el.escolhas.appendChild(b);
      });
      const limparUI = () => {
        relogio(false);
        esconderFoco();
        E.teclas = null;
        el.faixa.classList.remove("com-escolhas");
        el.escolhas.innerHTML = "";
      };
      const off = reg(() => { limparUI(); rej(new Cancelado()); });
      function escolher(o) {
        off();
        limparUI();
        SOM.clique();
        res(o);
      }
      E.teclas = (n) => {
        const o = fase.opcoes[n];
        if (o && !usadas.has(o.id)) escolher(o);
      };
      relogio(true);
    });
  }

  async function rodarFase(sid, fase) {
    await cartao(sid, fase.titulo, fase.sub);
    await mudarFundo(sid, fase.fundo);
    el.tagFase.textContent = fase.tag;
    await sequencia(sid, fase.abertura());
    const usadas = new Set();

    for (;;) {
      const o = await menuEscolhas(sid, fase, usadas);
      // efeito de quadrinho + custo de tempo (se houver)
      if (o.custo) await penalizar(sid, o.custo, o.sfx ? o.sfx[0] : "", o.sfx ? o.sfx[1] : "ruim");
      else if (o.sfx) await efeito(sid, o.sfx[0], o.sfx[1]);

      if (o.tipo === "penalidade") {
        usadas.add(o.id);
        await sequencia(sid, o.depois());
        continue;
      }
      if (o.tipo === "avancar") {
        await sequencia(sid, o.depois());
        return "avancar";
      }
      if (o.tipo === "retorno") {
        await sequencia(sid, o.depois());
        usadas.clear();
        await cortina(sid, true);
        await cortina(sid, false);
        await sequencia(sid, fase.abertura());
        continue;
      }
      if (o.tipo === "gaveta" || o.tipo === "mapa") {
        await sequencia(sid, o.antes());
        const ok = o.tipo === "gaveta" ? await minigameGaveta(sid) : await mapaPuzzle(sid);
        if (!ok) continue; // voltou sem resolver
        if (o.tipo === "gaveta") await efeito(sid, "CLIC!", "acerto");
        if (o.tipo === "mapa") E.viuMapa = true;
        await sequencia(sid, o.depois());
        return "avancar";
      }
      if (o.tipo === "vitoria") {
        await sequencia(sid, o.depois());
        return "vitoria";
      }
    }
  }

  async function intro(sid) {
    await mudarFundo(sid, "noite");
    await sequencia(sid, [
      N("ETESC-RJ. Fim de noite.", { expr: null }),
      N("A escola está quase vazia... e você ainda está lá dentro."),
    ]);
    SOM.alarme();
    await mudarFundo(sid, "fogo");
    await efeito(sid, "FLAAAAM!", "batida");
    await sequencia(sid, [N("De repente: fogo! Um incêndio toma conta do prédio e o alarme dispara.")]);
  }

  async function partida(sid) {
    await intro(sid);
    for (const fase of FASES) {
      const r = await rodarFase(sid, fase);
      if (r === "vitoria") return finalSucesso(sid);
    }
  }

  async function finalSucesso(sid) {
    await cartao(sid, "SAÍDA!", "Você conseguiu");
    await mudarFundo(sid, "noite");
    await sequencia(sid, [
      N("Você atravessa a porta e corre para fora da escola.", { expr: null }),
      F("Estou salvo! O campus está seguro!", "neutro"),
      N("Ao longe, as sirenes dos bombeiros se aproximam."),
    ]);
    mostrarFinal(true);
  }

  async function finalFracasso(sid) {
    esconderFoco();
    await mudarFundo(sid, "fogo");
    await efeito(sid, "TEMPO ESGOTADO!", "ruim");
    await sequencia(sid, [
      F("Não... o fogo está perto demais!", "choro_aberto"),
      F("Eu não vou conseguir sair...", "choro"),
      N("De repente, sirenes! Os bombeiros chegaram a tempo e resgatam você."),
      F("Obrigado... eu achei que não ia dar.", "neutro"),
    ]);
    mostrarFinal(false);
  }

  function fimTempo() {
    relogio(false);
    const sid = novaSessao();
    limparCena();
    rodar(() => finalFracasso(sid));
  }

  /* ============================================================
     TELAS: menu, jogo, final
     ============================================================ */
  function limparCena() {
    esconderTexto();
    esconderFoco();
    fecharDesafio();
    el.cartao.classList.remove("on");
    el.sfx.classList.remove("on");
    el.palco.classList.remove("tremer");
    el.faixa.classList.remove("com-escolhas");
    el.escolhas.innerHTML = "";
    el.final.classList.remove("on");
    el.cortina.classList.remove("on");
  }
  function setTela(t) {
    el.palco.dataset.tela = t;
    atualizarRelogio();
  }

  function mostrarFinal(ok) {
    limparCena();
    relogio(false);
    setTela("final");
    el.finalT.textContent = ok ? "SUCESSO" : "FRACASSO";
    el.finalBox.className = "final-box " + (ok ? "ok" : "ruim");
    el.finalP.textContent = ok
      ? "Você escapou com segurança para o campus!"
      : "O tempo acabou, mas a ajuda chegou e salvou você!";
    el.finalTempo.textContent = "Tempo restante: " + fmt(ok ? E.tempo : 0);
    el.final.classList.add("on");
    SOM[ok ? "bom" : "ruim"]();
  }

  function irMenu() {
    novaSessao();
    limparCena();
    relogio(false);
    setTela("menu");
    aplicarFundo("logo");
  }

  function novaPartida() {
    const sid = novaSessao();
    limparCena();
    E.tempo = TEMPO_TOTAL;
    E.viuMapa = false;
    relogio(false);
    el.retrato.hidden = true;
    el.faixa.classList.add("sem-retrato");
    setTela("jogo");
    atualizarRelogio();
    rodar(() => partida(sid));
  }

  /* ============================================================
     ENTRADAS
     ============================================================ */
  function avancar() {
    if (E.pular) { const f = E.pular; E.pular = null; f(); return; }
    if (E.avanco) { const f = E.avanco; E.avanco = null; f(); }
  }
  el.palco.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, .escolhas, .desafio, .final, .menu, .como")) return;
    avancar();
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest(".desafio")) return;
    if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowRight") {
      if (e.target.tagName === "BUTTON" && e.code !== "ArrowRight" && !E.avanco && !E.pular) return;
      if (E.avanco || E.pular) { e.preventDefault(); avancar(); }
      return;
    }
    if (/^[1-4]$/.test(e.key) && E.teclas) { E.teclas(Number(e.key) - 1); return; }
    if (e.key === "m" || e.key === "M") alternarSom();
    if (e.key === "h" || e.key === "H") el.palco.classList.toggle("ui-oculta");
  });

  function alternarSom() {
    E.mudo = !E.mudo;
    el.btnSom.textContent = E.mudo ? "🔇" : "🔊";
    try { localStorage.setItem("ete-mudo", E.mudo ? "1" : "0"); } catch (_) { /* sem storage */ }
    if (!E.mudo) SOM.clique();
  }
  el.btnSom.textContent = E.mudo ? "🔇" : "🔊";
  el.btnSom.addEventListener("click", (e) => { e.currentTarget.blur(); alternarSom(); });
  el.btnOlho.addEventListener("click", (e) => { e.currentTarget.blur(); el.palco.classList.toggle("ui-oculta"); });

  $("btn-jogar").addEventListener("click", (e) => { e.currentTarget.blur(); SOM.clique(); novaPartida(); });
  $("btn-como").addEventListener("click", (e) => { e.currentTarget.blur(); el.como.classList.add("on"); });
  $("btn-como-fechar").addEventListener("click", (e) => { e.currentTarget.blur(); el.como.classList.remove("on"); });
  $("btn-de-novo").addEventListener("click", (e) => { e.currentTarget.blur(); novaPartida(); });
  $("btn-menu").addEventListener("click", (e) => { e.currentTarget.blur(); irMenu(); });

  /* ============================================================
     INÍCIO: pré-carrega as imagens e mostra o menu
     ============================================================ */
  function precarregar(urls) {
    return Promise.all(urls.map((u) => new Promise((ok) => {
      const im = new Image();
      im.onload = im.onerror = () => ok();
      im.src = u;
    })));
  }
  atualizarRelogio();
  aplicarFundo("logo");
  precarregar([...Object.values(RETRATOS), ...Object.values(A)]);

  // Gancho de depuração/testes (somente leitura do estado)
  window.ETEscape = { estado: E };
})();
