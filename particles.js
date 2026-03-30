// ─────────────────────────────────────────────────────────────
//  Living Particle Field
//  Content nodes disguised as particles. When mouse approaches,
//  the particle is magnetically attracted to cursor and its
//  image card reveals above the mouse pointer.
// ─────────────────────────────────────────────────────────────

(() => {
  "use strict";

  const canvas = document.getElementById("particle-canvas");
  const ctx = canvas.getContext("2d");
  const imageLayer = document.getElementById("image-layer");
  const connLayer = document.getElementById("connection-layer");
  connLayer.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  let W, H;
  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    connLayer.setAttribute("viewBox", `0 0 ${W} ${H}`);
  };
  window.addEventListener("resize", resize);
  resize();

  // ── Mouse ─────────────────────────────────────────────────
  const mouse = { x: -9999, y: -9999, active: false };
  document.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });
  document.addEventListener("mouseleave", () => {
    mouse.active = false;
  });

  // ── Config ────────────────────────────────────────────────
  const CFG = {
    // Decorative background particles
    bgParticleCount: 250,
    bgSizeMin: 1,
    bgSizeMax: 5,
    bgSpeedMin: 0.08,
    bgSpeedMax: 0.4,
    bgDriftAmp: 0.25,
    bgDriftFreq: 0.0006,

    // Content-node particles
    nodeSize: 3.5,            // drawn dot size (looks like a regular particle)
    nodeSpeedMin: 0.04,
    nodeSpeedMax: 0.18,
    nodeDriftAmp: 0.12,
    nodeDriftFreq: 0.0004,

    // Magnet behavior
    magnetRadius: 150,        // px: how close mouse must be to start attracting
    magnetStrength: 0.08,     // lerp factor toward mouse each frame
    magnetDuration: 2500,     // ms: how long the particle stays magnetized
    magnetCooldown: 800,      // ms: grace period after magnet ends before re-trigger

    // Image reveal
    cardOffsetY: -20,         // px: card appears this much above the particle
  };

  // ── Background Particles (pure decoration) ────────────────
  class BgParticle {
    constructor() { this.init(true); }
    init(scatter) {
      this.x = Math.random() * W;
      this.y = scatter ? Math.random() * H : -6;
      this.r = CFG.bgSizeMin + Math.random() * (CFG.bgSizeMax - CFG.bgSizeMin);
      this.vx = (Math.random() - 0.5) * CFG.bgSpeedMax * 0.5;
      this.vy = CFG.bgSpeedMin + Math.random() * (CFG.bgSpeedMax - CFG.bgSpeedMin);
      this.phase = Math.random() * Math.PI * 2;
      this.alpha = 0.2 + Math.random() * 0.6;
    }
    update(t) {
      this.x += this.vx + Math.sin(t * CFG.bgDriftFreq + this.phase) * CFG.bgDriftAmp;
      this.y += this.vy;
      if (this.y > H + 10) this.init(false);
      if (this.x < -10) this.x += W + 20;
      if (this.x > W + 10) this.x -= W + 20;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(30, 28, 26, ${this.alpha})`;
      ctx.fill();
    }
  }

  const bgParticles = Array.from({ length: CFG.bgParticleCount }, () => new BgParticle());

  // ── Content-Node Particles ────────────────────────────────
  // They look like normal dots. When mouse gets close, they
  // become magnetized and follow the cursor. Image card
  // appears above the particle while magnetized.
  const nodes = [];
  const connectionEls = [];

  // Preload images
  CONTENT_NODES.forEach((n) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = n.image;
  });

  function initNodes() {
    imageLayer.innerHTML = "";
    connLayer.innerHTML = "";
    nodes.length = 0;
    connectionEls.length = 0;

    CONTENT_NODES.forEach((data) => {
      const w = data.size;
      const h = data.size * 0.66;

      // DOM card (hidden until magnetized)
      const card = document.createElement("div");
      card.className = "node-card";
      card.style.width = w + "px";
      card.style.height = h + "px";
      const img = document.createElement("img");
      img.src = data.image;
      img.alt = data.label;
      img.loading = "lazy";
      card.appendChild(img);
      imageLayer.appendChild(card);

      // DOM label
      const label = document.createElement("div");
      label.className = "node-label";
      label.textContent = data.label;
      imageLayer.appendChild(label);

      nodes.push({
        data,
        el: card,
        labelEl: label,
        w, h,
        // particle position
        x: 60 + Math.random() * (W - 120),
        y: 60 + Math.random() * (H - 120),
        vx: (Math.random() - 0.5) * CFG.nodeSpeedMax,
        vy: CFG.nodeSpeedMin + Math.random() * (CFG.nodeSpeedMax - CFG.nodeSpeedMin),
        phase: Math.random() * Math.PI * 2,
        // magnet state
        magnetized: false,
        magnetStart: 0,       // timestamp when magnet activated
        magnetEnd: 0,         // timestamp when magnet ended
        // visibility
        visible: false,
      });
    });

    // SVG connection lines
    const drawn = new Set();
    CONTENT_NODES.forEach((data) => {
      data.connections.forEach((cid) => {
        const key = Math.min(data.id, cid) + "-" + Math.max(data.id, cid);
        if (drawn.has(key)) return;
        drawn.add(key);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.classList.add("connection-line");
        connLayer.appendChild(line);
        connectionEls.push({ el: line, from: data.id, to: cid, visible: false });
      });
    });
  }

  initNodes();
  window.addEventListener("resize", () => { resize(); initNodes(); });

  // ── Per-frame update ──────────────────────────────────────
  function updateNodes(t, now) {
    // --- Phase 1: Move particles & handle magnet ---
    nodes.forEach((n) => {
      const dx = mouse.x - n.x;
      const dy = mouse.y - n.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cooldownOk = (now - n.magnetEnd) > CFG.magnetCooldown;

      // Activate magnet
      if (!n.magnetized && mouse.active && dist < CFG.magnetRadius && cooldownOk) {
        n.magnetized = true;
        n.magnetStart = now;
      }

      // Expire magnet
      if (n.magnetized && (now - n.magnetStart) > CFG.magnetDuration) {
        n.magnetized = false;
        n.magnetEnd = now;
      }

      if (n.magnetized && mouse.active) {
        // Iron-to-magnet: lerp toward mouse
        n.x += dx * CFG.magnetStrength;
        n.y += dy * CFG.magnetStrength;
      } else {
        // Normal drift
        n.x += n.vx + Math.sin(t * CFG.nodeDriftFreq + n.phase) * CFG.nodeDriftAmp;
        n.y += n.vy;
      }

      // Wrap edges
      if (n.y > H + 60) { n.y = -60; n.x = 60 + Math.random() * (W - 120); }
      if (n.x < -60) n.x = W + 60;
      if (n.x > W + 60) n.x = -60;
    });

    // --- Phase 2: Determine which nodes to reveal ---
    // A node is revealed if it is currently magnetized,
    // or if it is connected to a magnetized node.
    const revealed = new Set();
    nodes.forEach((n) => {
      if (n.magnetized) {
        revealed.add(n.data.id);
        n.data.connections.forEach((cid) => revealed.add(cid));
      }
    });

    // --- Phase 3: Update DOM positions & visibility ---
    nodes.forEach((n) => {
      const show = revealed.has(n.data.id);

      // Position the card above the particle
      n.el.style.left = (n.x - n.w / 2) + "px";
      n.el.style.top = (n.y - n.h / 2 + CFG.cardOffsetY) + "px";
      n.labelEl.style.left = n.x + "px";
      n.labelEl.style.top = (n.y + n.h / 2 + CFG.cardOffsetY + 6) + "px";

      if (show && !n.visible) {
        n.el.classList.add("visible");
        n.labelEl.classList.add("visible");
        n.visible = true;
      } else if (!show && n.visible) {
        n.el.classList.remove("visible");
        n.labelEl.classList.remove("visible");
        n.visible = false;
      }
    });

    // --- Phase 4: Connection lines ---
    connectionEls.forEach((ce) => {
      const fromN = nodes.find((n) => n.data.id === ce.from);
      const toN = nodes.find((n) => n.data.id === ce.to);
      const show = fromN && toN && fromN.visible && toN.visible;

      if (show) {
        ce.el.setAttribute("x1", fromN.x);
        ce.el.setAttribute("y1", fromN.y);
        ce.el.setAttribute("x2", toN.x);
        ce.el.setAttribute("y2", toN.y);
      }
      if (show && !ce.visible) {
        ce.el.classList.add("visible");
        ce.visible = true;
      } else if (!show && ce.visible) {
        ce.el.classList.remove("visible");
        ce.visible = false;
      }
    });
  }

  // ── Draw content-node dots on canvas ──────────────────────
  function drawNodeDots() {
    nodes.forEach((n) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, CFG.nodeSize, 0, Math.PI * 2);
      ctx.fillStyle = n.magnetized
        ? "rgba(30, 28, 26, 0.85)"
        : "rgba(30, 28, 26, 0.45)";
      ctx.fill();
    });
  }

  // ── Main loop ─────────────────────────────────────────────
  let tick = 0;
  function animate() {
    tick++;
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);

    // Background particles
    bgParticles.forEach((p) => { p.update(tick); p.draw(); });

    // Content-node particles (drawn as dots on canvas + DOM cards)
    drawNodeDots();
    updateNodes(tick, now);

    requestAnimationFrame(animate);
  }
  animate();

  // ── Search ────────────────────────────────────────────────
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("search-btn");

  function handleSearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return;
    const match = CONTENT_NODES.find(
      (n) => n.label.toLowerCase().includes(q) ||
             n.tags.some((t) => t.toLowerCase().includes(q))
    );
    if (match) {
      const ne = nodes.find((n) => n.data.id === match.id);
      if (ne) {
        // Trigger magnet on that node
        ne.magnetized = true;
        ne.magnetStart = performance.now();
        mouse.x = ne.x;
        mouse.y = ne.y;
        mouse.active = true;
      }
    }
  }

  searchBtn.addEventListener("click", handleSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
})();
