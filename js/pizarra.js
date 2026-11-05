/* Pizarra táctica: 7 canchas (5 de media cancha y 2 de cancha entera) */
(function () {
  var TOTAL = 7;
  var ANCHO = 350;
  var HERRAMIENTAS = [
    { id: "lapiz", html: "✏", title: "Lápiz libre" },
    { id: "ataque", html: "X", title: "Atacante", cls: "x" },
    { id: "defensa", html: "O", title: "Defensor", cls: "o" },
    { id: "balon", html: '<span class="dot"></span>', title: "Balón" },
    { id: "cono", html: '<span class="tri"></span>', title: "Cono" },
    { id: "flecha", html: "→", title: "Movimiento / corte" },
    { id: "pase", html: "⇢", title: "Pase (línea punteada)" },
    { id: "drible", html: "≈›", title: "Drible (zigzag)" },
    { id: "cortina", html: "--×", title: "Cortina" },
    { id: "bloqueoCiego", html: "—|", title: "Bloqueo ciego" },
    { id: "bloqueo", html: "≠", title: "Bloqueo" }
  ];
  var LINEAS = ["flecha", "pase", "drible", "cortina", "bloqueoCiego"];
  var tableros = []; // { canvas, ctx, tool, historial: [] }

  function alto(i) { return i <= 5 ? 320 : 580; }

  function generar(contenedor) {
    contenedor.innerHTML = "";
    tableros = [];
    for (var i = 1; i <= TOTAL; i++) {
      var card = document.createElement("div");
      card.className = "card ejercicio";
      var tools = HERRAMIENTAS.map(function (h) {
        return '<button type="button" class="tool ' + (h.cls || "") + (h.id === "lapiz" ? " active" : "") +
          '" data-tool="' + h.id + '" title="' + h.title + '" aria-label="' + h.title + '">' + h.html + "</button>";
      }).join("");
      card.innerHTML =
        '<div class="ej-board">' +
          '<div class="ej-head"><span class="ej-num"><b>' + i + "</b>Ejercicio " + i + '</span><span class="ej-tag">' + (i <= 5 ? "Media cancha" : "Cancha entera") + "</span></div>" +
          '<div class="tools">' + tools + '<button type="button" class="tool" data-act="undo" title="Deshacer"><svg><use href="#i-undo"/></svg></button></div>' +
          '<div class="canvas-wrap"><canvas width="' + ANCHO + '" height="' + alto(i) + '"></canvas></div>' +
          '<div class="btn-row"><button type="button" class="btn btn-outline btn-sm" data-act="clear"><svg><use href="#i-eraser"/></svg>Borrar dibujo</button></div>' +
        "</div>" +
        '<div class="ej-text"><label class="field"><span>Descripción del ejercicio ' + i + '</span>' +
          '<textarea id="txt_' + i + '" placeholder="Consignas, tiempos, repeticiones, variantes…"></textarea></label></div>';
      contenedor.appendChild(card);

      var canvas = card.querySelector("canvas");
      var t = { canvas: canvas, ctx: canvas.getContext("2d"), tool: "lapiz", historial: [], num: i, card: card };
      tableros.push(t);
      dibujarCancha(t);
      conectar(t);
    }
  }

  function conectar(t) {
    t.card.querySelectorAll("[data-tool]").forEach(function (b) {
      b.addEventListener("click", function () {
        t.tool = b.dataset.tool;
        t.card.querySelectorAll("[data-tool]").forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });
    t.card.querySelector('[data-act="undo"]').addEventListener("click", function () {
      var prev = t.historial.pop();
      if (prev) t.ctx.putImageData(prev, 0, 0);
    });
    t.card.querySelector('[data-act="clear"]').addEventListener("click", function () {
      guardarHistorial(t);
      dibujarCancha(t);
    });
    iniciarPincel(t);
  }

  function guardarHistorial(t) {
    t.historial.push(t.ctx.getImageData(0, 0, t.canvas.width, t.canvas.height));
    if (t.historial.length > 25) t.historial.shift();
  }

  // ---------- Dibujo de la cancha ----------
  function dibujarCancha(t) {
    var ctx = t.ctx;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, t.canvas.width, t.canvas.height);
    ctx.strokeStyle = "#444"; ctx.lineWidth = 2;
    if (t.num <= 5) { ctx.strokeRect(15, 15, 320, 290); arriba(ctx, 15); }
    else {
      ctx.strokeRect(15, 15, 320, 550); arriba(ctx, 15); abajo(ctx, 565);
      ctx.beginPath(); ctx.moveTo(15, 290); ctx.lineTo(335, 290); ctx.stroke();
      ctx.beginPath(); ctx.arc(175, 290, 40, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  function arriba(ctx, y) {
    ctx.strokeRect(110, y, 130, 110);
    ctx.beginPath(); ctx.moveTo(145, y + 25); ctx.lineTo(205, y + 25); ctx.stroke();
    ctx.beginPath(); ctx.arc(175, y + 35, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(35, y); ctx.lineTo(35, y + 60); ctx.moveTo(315, y); ctx.lineTo(315, y + 60); ctx.stroke();
    ctx.beginPath(); ctx.arc(175, y + 60, 140, 0, Math.PI, false); ctx.stroke();
    ctx.beginPath(); ctx.arc(175, y + 110, 65, 0, Math.PI, false); ctx.stroke();
  }
  function abajo(ctx, y) {
    ctx.strokeRect(110, y, 130, -110);
    ctx.beginPath(); ctx.moveTo(145, y - 25); ctx.lineTo(205, y - 25); ctx.stroke();
    ctx.beginPath(); ctx.arc(175, y - 35, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(35, y); ctx.lineTo(35, y - 60); ctx.moveTo(315, y); ctx.lineTo(315, y - 60); ctx.stroke();
    ctx.beginPath(); ctx.arc(175, y - 60, 140, Math.PI, 0, false); ctx.stroke();
    ctx.beginPath(); ctx.arc(175, y - 110, 65, Math.PI, 0, false); ctx.stroke();
  }

  // ---------- Flechas y líneas ----------
  function dibujarFlecha(ctx, fx, fy, tx, ty, tipo) {
    var headlen = 12, dx = tx - fx, dy = ty - fy;
    var angle = Math.atan2(dy, dx), dist = Math.sqrt(dx * dx + dy * dy);
    ctx.save();
    ctx.beginPath(); ctx.lineWidth = 3; ctx.strokeStyle = "black"; ctx.lineCap = "round";
    ctx.setLineDash(tipo === "pase" || tipo === "cortina" ? [8, 8] : []);
    if (tipo === "drible") {
      ctx.moveTo(fx, fy);
      var steps = Math.floor(dist / 10);
      for (var i = 1; i <= steps; i++) {
        var k = i / steps, x = fx + dx * k, y = fy + dy * k, off = (i % 2 === 0 ? 1 : -1) * 7;
        ctx.lineTo(x + Math.cos(angle + Math.PI / 2) * off, y + Math.sin(angle + Math.PI / 2) * off);
      }
      ctx.lineTo(tx, ty);
    } else { ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); }
    ctx.stroke(); ctx.setLineDash([]);
    if (tipo === "cortina") {
      var s = 10; ctx.beginPath();
      ctx.moveTo(tx - s, ty - s); ctx.lineTo(tx + s, ty + s); ctx.moveTo(tx + s, ty - s); ctx.lineTo(tx - s, ty + s); ctx.stroke();
    } else if (tipo === "bloqueoCiego") {
      var sz = 15, sX = Math.cos(angle + Math.PI / 2) * sz, sY = Math.sin(angle + Math.PI / 2) * sz;
      ctx.beginPath(); ctx.moveTo(tx + sX, ty + sY); ctx.lineTo(tx - sX, ty - sY); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(tx, ty); ctx.lineTo(tx - headlen * Math.cos(angle - Math.PI / 6), ty - headlen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(tx, ty); ctx.lineTo(tx - headlen * Math.cos(angle + Math.PI / 6), ty - headlen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
    ctx.restore();
  }

  function sello(ctx, tool, x, y) {
    ctx.save(); ctx.setLineDash([]);
    if (tool === "cono") { ctx.fillStyle = "#27ae60"; ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x - 10, y + 10); ctx.lineTo(x + 10, y + 10); ctx.closePath(); ctx.fill(); }
    else if (tool === "balon") { ctx.fillStyle = "#e67e22"; ctx.strokeStyle = "#a04e0b"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else if (tool === "ataque") { ctx.strokeStyle = "red"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 8, y - 8); ctx.lineTo(x + 8, y + 8); ctx.moveTo(x + 8, y - 8); ctx.lineTo(x - 8, y + 8); ctx.stroke(); }
    else if (tool === "defensa") { ctx.strokeStyle = "blue"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); }
    else if (tool === "bloqueo") { ctx.strokeStyle = "black"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.moveTo(x - 5, y - 8); ctx.lineTo(x + 5, y + 8); ctx.stroke(); }
    ctx.restore();
  }

  // Convierte coordenadas de pantalla a coordenadas del canvas (corrige el escalado por CSS)
  function punto(canvas, e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  }

  function iniciarPincel(t) {
    var canvas = t.canvas, ctx = t.ctx, pintando = false, inicio = null, snap = null;
    canvas.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      var p = punto(canvas, e);
      guardarHistorial(t);
      if (t.tool === "lapiz") {
        pintando = true;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
      } else if (LINEAS.indexOf(t.tool) !== -1) {
        pintando = true; inicio = p; snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } else {
        sello(ctx, t.tool, p.x, p.y);
      }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!pintando) return;
      e.preventDefault();
      var p = punto(canvas, e);
      if (t.tool === "lapiz") {
        ctx.setLineDash([]); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#e67e22";
        ctx.lineTo(p.x, p.y); ctx.stroke();
      } else {
        ctx.putImageData(snap, 0, 0);
        dibujarFlecha(ctx, inicio.x, inicio.y, p.x, p.y, t.tool);
      }
    });
    var fin = function () { pintando = false; };
    canvas.addEventListener("pointerup", fin);
    canvas.addEventListener("pointercancel", fin);
  }

  // ---------- API pública ----------
  window.Pizarra = {
    generar: generar,
    exportar: function () {
      return {
        dibujos: tableros.map(function (t) { return t.canvas.toDataURL("image/png"); }),
        textos: tableros.map(function (t) { return document.getElementById("txt_" + t.num).value; })
      };
    },
    cargar: function (dibujos, textos) {
      tableros.forEach(function (t, i) {
        t.historial = [];
        document.getElementById("txt_" + t.num).value = (textos && textos[i]) || "";
        dibujarCancha(t);
        if (dibujos && dibujos[i]) {
          var img = new Image();
          img.onload = function () { t.ctx.drawImage(img, 0, 0); };
          img.src = dibujos[i];
        }
      });
    }
  };
})();
