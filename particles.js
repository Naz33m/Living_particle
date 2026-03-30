// ─────────────────────────────────────────────────────────────
//  Living Particle Field
//  All particles drift visibly. Content-node particles look
//  identical but reveal image cards when the mouse approaches.
//  The closest node follows the mouse like iron to a magnet;
//  when the mouse reaches another node it hands off.
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
    // Background particles
    bgCount: 260,
    bgSizeMin: 1.2,
    bgSizeMax: 5.5,
    bgSpeedFactor: 1,       // multiplied into each particle's own speed

    // Content‑node particles (drawn as dots too)
    nodeDrawSize: 3.5,

    // Magnet
    catchRadius: 160,        // px — mouse distance to "catch" a node
    releaseRadius: 300,      // px — if active node drifts this far from mouse, release
    magnetLerp: 0.06,        // how fast particle follows mouse (0–1)
    magnetMaxTime: 3000,     // ms — max time a node stays magnetized
    magnetCooldown: 1200,    // ms — cooldown before same node can re‑catch

    // Connected‑node reveal distance (they don't follow, just reveal)
    connRevealFade: 600,     // ms — fade‑out after parent releases
  };

  // ── Background Particles ──────────────────────────────────
  // Visible, gently drifting in random directions.
  class Dot {
    constructor() { this.spawn(true); }
    spawn(scatter) {
      this.r = CFG.bgSizeMin + Math.random() * (CFG.bgSizeMax - CFG.bgSizeMin);
      this.x = Math.random() * W;
      this.y = scatter ? Math.random() * H : -(this.r + 5);
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.15 + Math.random() * 0.45) * CFG.bgSpeedFactor;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed + 0.12;   // slight downward bias
      this.wobblePhase = Math.random() * Math.PI * 2;
      this.wobbleAmp = 0.1 + Math.random() * 0.25;
      this.wobbleFreq = 0.003 + Math.random() * 0.004;
      this.alpha = 0.18 + Math.random() * 0.62;
    }
    update(t) {
      this.x += this.vx + Math.sin(t * this.wobbleFreq + this.wobblePhase) * this.wobbleAmp;
      this.y += this.vy;
      // wrap
      if (this.y > H + 10) this.spawn(false);
      if (this.x < -10) this.x += W + 20;
      if (this.x > W + 10) this.x -= W + 20;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(30,28,26,${this.alpha})`;
      ctx.fill();
    }
  }

  const dots = Array.from({ length: CFG.bgCount }, () => new Dot());

  // ── Content Nodes ─────────────────────────────────────────
  const nodes = [];
  const connectionEls = [];
  let activeNode = null;         // currently magnetized node (only one at a time)

  CONTENT_NODES.forEach((n) => { const i = new Image(); i.crossOrigin = "anonymous"; i.src = n.image; });

  function initNodes() {
    imageLayer.innerHTML = "";
    connLayer.innerHTML = "";
    nodes.length = 0;
    connectionEls.length = 0;
    activeNode = null;

    CONTENT_NODES.forEach((data) => {
      const w = data.size;
      const h = data.size * 0.66;

      // Card
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

      // Label
      const label = document.createElement("div");
      label.className = "node-label";
      label.textContent = data.label;
      imageLayer.appendChild(label);

      // Random drift direction
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.06 + Math.random() * 0.14;

      nodes.push({
        data, el: card, labelEl: label, w, h,
        // position
        x: 80 + Math.random() * (W - 160),
        y: 80 + Math.random() * (H - 160),
        // drift velocity
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 0.04,
        wobblePhase: Math.random() * Math.PI * 2,
        // state
        magnetized: false,
        magnetStart: 0,
        magnetEnd: 0,
        visible: false,
        fadeOutStart: 0,       // when connected‑reveal fading started
      });
    });

    // Connection lines
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

  // ── Helpers ───────────────────────────────────────────────
  function dist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── Per‑frame logic ───────────────────────────────────────
  function step(t, now) {

    // ─ 1. Decide which node (if any) is magnetized ─────────
    if (mouse.active) {
      // If we have an active node, check release conditions
      if (activeNode) {
        const d = dist(activeNode.x, activeNode.y, mouse.x, mouse.y);
        const expired = (now - activeNode.magnetStart) > CFG.magnetMaxTime;
        if (d > CFG.releaseRadius || expired || !mouse.active) {
          release(activeNode, now);
        }
      }

      // If no active node, try to catch the closest one in range
      if (!activeNode) {
        let best = null, bestDist = Infinity;
        nodes.forEach((n) => {
          if ((now - n.magnetEnd) < CFG.magnetCooldown) return; // still cooling
          const d = dist(n.x, n.y, mouse.x, mouse.y);
          if (d < CFG.catchRadius && d < bestDist) {
            best = n;
            bestDist = d;
          }
        });
        if (best) {
          best.magnetized = true;
          best.magnetStart = now;
          activeNode = best;
        }
      }

      // If active node exists but a CLOSER node appears, hand off
      if (activeNode) {
        let closer = null, closerDist = dist(activeNode.x, activeNode.y, mouse.x, mouse.y);
        nodes.forEach((n) => {
          if (n === activeNode) return;
          if ((now - n.magnetEnd) < CFG.magnetCooldown) return;
          const d = dist(n.x, n.y, mouse.x, mouse.y);
          if (d < CFG.catchRadius * 0.7 && d < closerDist) {
            closer = n;
            closerDist = d;
          }
        });
        if (closer) {
          release(activeNode, now);
          closer.magnetized = true;
          closer.magnetStart = now;
          activeNode = closer;
        }
      }
    } else if (activeNode) {
      release(activeNode, now);
    }

    // ─ 2. Move every content node ──────────────────────────
    nodes.forEach((n) => {
      if (n.magnetized && mouse.active) {
        // Lerp toward mouse
        n.x += (mouse.x - n.x) * CFG.magnetLerp;
        n.y += (mouse.y - n.y) * CFG.magnetLerp;
      } else {
        // Normal drift
        n.x += n.vx + Math.sin(t * 0.0004 + n.wobblePhase) * 0.12;
        n.y += n.vy;
        // Wrap
        if (n.y > H + 80) { n.y = -80; n.x = 80 + Math.random() * (W - 160); }
        if (n.x < -80) n.x = W + 80;
        if (n.x > W + 80) n.x = -80;
      }
    });

    // ─ 3. Determine revealed set ───────────────────────────
    const revealed = new Set();
    if (activeNode) {
      revealed.add(activeNode.data.id);
      activeNode.data.connections.forEach((cid) => revealed.add(cid));
    }
    // Also keep recently‑released connected nodes visible briefly
    nodes.forEach((n) => {
      if (!n.magnetized && n.fadeOutStart > 0 && (now - n.fadeOutStart) < CFG.connRevealFade) {
        revealed.add(n.data.id);
      }
    });

    // ─ 4. Update DOM ───────────────────────────────────────
    nodes.forEach((n) => {
      // Always position the card at the node's particle location
      n.el.style.left = (n.x - n.w / 2) + "px";
      n.el.style.top = (n.y - n.h / 2) + "px";
      n.labelEl.style.left = n.x + "px";
      n.labelEl.style.top = (n.y + n.h / 2 + 6) + "px";

      const show = revealed.has(n.data.id);
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

    // ─ 5. Connection lines ─────────────────────────────────
    connectionEls.forEach((ce) => {
      const a = nodes.find((n) => n.data.id === ce.from);
      const b = nodes.find((n) => n.data.id === ce.to);
      const show = a && b && a.visible && b.visible;
      if (show) {
        ce.el.setAttribute("x1", a.x);
        ce.el.setAttribute("y1", a.y);
        ce.el.setAttribute("x2", b.x);
        ce.el.setAttribute("y2", b.y);
      }
      if (show && !ce.visible) { ce.el.classList.add("visible"); ce.visible = true; }
      else if (!show && ce.visible) { ce.el.classList.remove("visible"); ce.visible = false; }
    });
  }

  function release(n, now) {
    n.magnetized = false;
    n.magnetEnd = now;
    // Mark connected nodes for gentle fade‑out
    n.data.connections.forEach((cid) => {
      const cn = nodes.find((o) => o.data.id === cid);
      if (cn) cn.fadeOutStart = now;
    });
    n.fadeOutStart = now;
    if (activeNode === n) activeNode = null;
  }

  // ── Draw node dots on canvas ──────────────────────────────
  function drawNodeDots() {
    nodes.forEach((n) => {
      // Don't draw the dot if the image card is visible (card replaces it)
      if (n.visible) return;
      ctx.beginPath();
      ctx.arc(n.x, n.y, CFG.nodeDrawSize, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(30,28,26,0.5)";
      ctx.fill();
    });
  }

  // ── Main loop ─────────────────────────────────────────────
  let tick = 0;
  function animate() {
    tick++;
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);

    dots.forEach((d) => { d.update(tick); d.draw(); });
    drawNodeDots();
    step(tick, now);

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
        ne.magnetized = true;
        ne.magnetStart = performance.now();
        activeNode = ne;
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
