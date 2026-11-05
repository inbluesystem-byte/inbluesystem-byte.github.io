/* DTORDEN — lógica principal de la app */
(function () {
  var ITEMS = ["Dribling", "Defensa", "Ataque", "Lanzamiento", "Libres", "Rebotes", "Estado físico", "Conceptos",
    "Actitud", "Compañerismo", "Interpretación", "Velocidad", "Salto", "Fuerza", "Liderazgo"];

  var $ = function (id) { return document.getElementById(id); };
  var estado = { nombre: "", jugadores: [], citaJugadores: [], citados: [], reservas: [] };

  // =========================================================
  //  UTILIDADES DE INTERFAZ
  // =========================================================
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toast(msg, tipo) {
    var t = document.createElement("div");
    t.className = "toast " + (tipo || "");
    t.textContent = msg;
    $("toasts").appendChild(t);
    setTimeout(function () { t.remove(); }, tipo === "err" ? 5000 : 3200);
  }

  function errorToast(err) { toast(err && err.message ? err.message : String(err), "err"); }

  // Modal genérico. botones: [{texto, clase, valor}] -> Promise con el valor del botón
  var cerrarModalActual = null;
  function modal(titulo, cuerpo, botones) {
    if (cerrarModalActual) cerrarModalActual(null);
    $("modal_title").textContent = titulo;
    var body = $("modal_body"); body.innerHTML = "";
    if (typeof cuerpo === "string") body.innerHTML = cuerpo; else if (cuerpo) body.appendChild(cuerpo);
    var foot = $("modal_foot"); foot.innerHTML = "";
    $("modal").hidden = false;
    return new Promise(function (resolve) {
      cerrarModalActual = function (v) { $("modal").hidden = true; cerrarModalActual = null; resolve(v); };
      (botones || []).forEach(function (b) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn " + (b.clase || "btn-outline");
        btn.innerHTML = b.texto;
        btn.addEventListener("click", function () {
          var v = typeof b.valor === "function" ? b.valor() : b.valor;
          if (v !== undefined) cerrarModalActual(v);
        });
        foot.appendChild(btn);
      });
    });
  }
  function cerrarModal() { if (cerrarModalActual) cerrarModalActual(null); }

  function confirmar(titulo, texto, textoOk) {
    return modal(titulo, "<p>" + esc(texto) + "</p>", [
      { texto: "Cancelar", valor: false },
      { texto: textoOk || "Confirmar", clase: "btn-danger", valor: true }
    ]);
  }

  function pedirTexto(titulo, etiqueta) {
    var wrap = document.createElement("form");
    wrap.innerHTML = '<label class="field"><span>' + esc(etiqueta) + '</span><input type="text" id="modal_input" autocomplete="off"></label>';
    var p = modal(titulo, wrap, [
      { texto: "Cancelar", valor: null },
      { texto: "Aceptar", clase: "btn-primary", valor: function () { var v = $("modal_input").value.trim(); return v || undefined; } }
    ]);
    wrap.addEventListener("submit", function (e) { e.preventDefault(); var v = $("modal_input").value.trim(); if (v) cerrarModalActual(v); });
    setTimeout(function () { $("modal_input").focus(); }, 30);
    return p;
  }

  function ocupado(btn, si, textoOcupado) {
    if (si) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.textContent = textoOcupado || "Procesando…"; }
    else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
  }

  function descargarTxt(texto, nombre) {
    var blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function copiar(texto) {
    if (navigator.clipboard) return navigator.clipboard.writeText(texto).then(function () { toast("Copiado al portapapeles", "ok"); });
    var ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove(); toast("Copiado al portapapeles", "ok");
  }

  function compartir(texto) {
    if (navigator.share) return navigator.share({ text: texto }).catch(function () {});
    window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank");
  }

  function esEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  // =========================================================
  //  ARRANQUE Y SESIÓN
  // =========================================================
  function mostrar(pantalla) {
    $("splash").hidden = true;
    $("auth").hidden = pantalla !== "auth";
    $("app").hidden = pantalla !== "app";
  }

  function mostrarForm(id) {
    ["form_login", "form_registro", "form_recuperar"].forEach(function (f) { $(f).hidden = f !== id; });
    if (id === "form_recuperar") { $("recu_paso2").hidden = true; $("recu_btn").textContent = "Enviar código"; }
  }

  async function iniciar() {
    if (!Sesion.token) return mostrar("auth");
    try {
      var r = await api("validarSesion");
      entrar(r.nombre || Sesion.nombre);
    } catch (e) {
      if (!e.auth) {
        // Sin conexión: igual abrimos la app con el nombre guardado
        entrar(Sesion.nombre);
        errorToast(e);
      } else mostrar("auth");
    }
  }

  function entrar(nombre) {
    estado.nombre = nombre || "";
    $("user_name").textContent = estado.nombre ? "Coach " + estado.nombre : "";
    mostrar("app");
    if (!$("contenedor_bloques").children.length) Pizarra.generar($("contenedor_bloques"));
    cargarEquipos();
  }

  window.addEventListener("dt:sesion-vencida", function (e) {
    toast(e.detail || "Tu sesión venció.", "err");
    cerrarModal();
    mostrarForm("form_login");
    mostrar("auth");
  });

  // ---------- Login ----------
  $("form_login").addEventListener("submit", async function (e) {
    e.preventDefault();
    var u = $("login_user").value.trim(), p = $("login_pass").value;
    if (!esEmail(u)) return toast("El usuario debe ser un email válido.", "err");
    var btn = this.querySelector("button[type=submit]");
    ocupado(btn, true, "Ingresando…");
    try {
      var r = await api("login", { usuario: u, password: p });
      if (!r.success) return toast(r.msg || "Usuario o contraseña incorrectos.", "err");
      Sesion.guardar(r.token, r.nombre);
      $("login_pass").value = "";
      entrar(r.nombre);
    } catch (err) { errorToast(err); }
    finally { ocupado(btn, false); }
  });

  // ---------- Registro ----------
  $("form_registro").addEventListener("submit", async function (e) {
    e.preventDefault();
    var n = $("reg_nombre").value.trim(), em = $("reg_email").value.trim(), p = $("reg_pass").value;
    if (!n || !em || !p) return toast("Completá todos los campos.", "err");
    if (!esEmail(em)) return toast("El usuario debe ser un email válido.", "err");
    if (p.length < 6) return toast("La contraseña debe tener al menos 6 caracteres.", "err");
    var btn = this.querySelector("button[type=submit]");
    ocupado(btn, true, "Creando cuenta…");
    try {
      var r = await api("registrar", { nombre: n, email: em, pass: p });
      toast(r.msg, r.success ? "ok" : "err");
      if (r.success) { $("login_user").value = em; mostrarForm("form_login"); }
    } catch (err) { errorToast(err); }
    finally { ocupado(btn, false); }
  });

  // ---------- Recuperar ----------
  $("form_recuperar").addEventListener("submit", async function (e) {
    e.preventDefault();
    var em = $("recu_email").value.trim();
    var btn = $("recu_btn");
    if (!esEmail(em)) return toast("Ingresá un email válido.", "err");
    try {
      if ($("recu_paso2").hidden) {
        ocupado(btn, true, "Enviando…");
        var r = await api("enviarCodigo", { email: em });
        ocupado(btn, false);
        toast(r.msg, r.success ? "ok" : "err");
        if (r.success) { $("recu_paso2").hidden = false; btn.textContent = "Cambiar contraseña"; $("recu_codigo").focus(); }
      } else {
        var c = $("recu_codigo").value.trim(), np = $("recu_pass").value;
        if (!c || !np) return toast("Completá el código y la nueva contraseña.", "err");
        ocupado(btn, true, "Guardando…");
        var r2 = await api("cambiarPassword", { email: em, codigo: c, nuevaPass: np });
        ocupado(btn, false);
        toast(r2.msg, r2.success ? "ok" : "err");
        if (r2.success) { $("login_user").value = em; mostrarForm("form_login"); }
      }
    } catch (err) { ocupado(btn, false); errorToast(err); }
  });

  document.querySelectorAll("[data-goto]").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); mostrarForm(a.dataset.goto); });
  });

  // ---------- Logout ----------
  $("btn_logout").addEventListener("click", async function () {
    var ok = await confirmar("Cerrar sesión", "¿Querés salir de tu cuenta en este dispositivo?", "Salir");
    if (!ok) return;
    api("logout").catch(function () {});
    Sesion.borrar();
    $("lista_jugadores").innerHTML = "";
    mostrarForm("form_login");
    mostrar("auth");
  });

  // ---------- Mi cuenta: privacidad y borrar cuenta ----------
  $("btn_cuenta").addEventListener("click", function () {
    var body = document.createElement("div");
    body.innerHTML = '<p>Sesión iniciada como <b></b>.</p>' +
      '<p><a href="privacidad.html" target="_blank" rel="noopener">Ver política de privacidad</a></p>' +
      '<div class="card" style="border-color:#e3b5b0;box-shadow:none;margin:16px 0 0">' +
      '<b>Eliminar mi cuenta</b><p class="muted" style="margin-bottom:12px">Se borran para siempre tu usuario, tus equipos, jugadores y entrenamientos. No se puede deshacer.</p>' +
      '<label class="field"><span>Confirmá tu contraseña</span><input type="password" id="del_pass" autocomplete="current-password"></label></div>';
    body.querySelector("b").textContent = estado.nombre || "coach";
    modal("Mi cuenta", body, [
      { texto: "Cerrar", valor: null },
      { texto: '<svg><use href="#i-trash"/></svg>Eliminar cuenta', clase: "btn-danger", valor: function () { borrarCuenta(); } }
    ]);
  });

  async function borrarCuenta() {
    var pass = $("del_pass").value;
    if (!pass) return toast("Escribí tu contraseña para confirmar.", "err");
    var email = "";
    try { email = (await api("validarSesion")).usuario; } catch (e) { return errorToast(e); }
    var ok = await confirmar("Eliminar cuenta", "¿Seguro? Se borran todos tus datos y no se pueden recuperar.", "Sí, eliminar todo");
    if (!ok) return;
    try {
      var r = await api("eliminarCuenta", { usuario: email, password: pass });
      toast(r.msg, r.success ? "ok" : "err");
      if (r.success) { Sesion.borrar(); mostrarForm("form_login"); mostrar("auth"); }
    } catch (err) { errorToast(err); }
  }

  // ---------- Pestañas ----------
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t === tab); });
      document.querySelectorAll(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view_" + tab.dataset.tab); });
      window.scrollTo(0, 0);
    });
  });

  // =========================================================
  //  PIZARRA
  // =========================================================
  $("btn_guardar").addEventListener("click", async function () {
    var titulo = $("plan_titulo").value.trim();
    if (!titulo) { $("plan_titulo").focus(); return toast("Poné un título al entrenamiento.", "err"); }
    var btn = this;
    ocupado(btn, true, "Generando PDF…");
    $("link_pdf").hidden = true;
    var d = Pizarra.exportar();
    d.titulo = titulo;
    d.dia = $("plan_dia").value; d.hora = $("plan_hora").value; d.lugar = $("plan_lugar").value;
    d.objetivos = $("plan_objetivos").value; d.observaciones = $("plan_observaciones").value;
    try {
      var r = await api("guardarEntrenamiento", d);
      if (!r.success) return toast(r.msg, "err");
      toast(r.msg || "Guardado", "ok");
      $("link_pdf").href = r.url; $("link_pdf").hidden = false;
    } catch (err) { errorToast(err); }
    finally { ocupado(btn, false); }
  });

  $("btn_reset").addEventListener("click", async function () {
    var ok = await confirmar("Nuevo entrenamiento", "Se borran todos los dibujos y textos de la pizarra (lo ya guardado no se pierde).", "Resetear");
    if (!ok) return;
    ["plan_titulo", "plan_dia", "plan_hora", "plan_lugar", "plan_objetivos", "plan_observaciones"].forEach(function (id) { $(id).value = ""; });
    $("link_pdf").hidden = true;
    Pizarra.generar($("contenedor_bloques"));
    window.scrollTo(0, 0);
  });

  $("btn_historial").addEventListener("click", abrirHistorial);

  async function abrirHistorial() {
    var lista = document.createElement("div");
    lista.className = "list";
    lista.innerHTML = '<div class="list-empty">Cargando…</div>';
    modal("Historial de entrenamientos", lista, [{ texto: "Cerrar", valor: null }]);
    try {
      var items = await api("listarEntrenamientos");
      if (!items.length) { lista.innerHTML = '<div class="list-empty">Todavía no guardaste entrenamientos.</div>'; return; }
      lista.innerHTML = "";
      items.forEach(function (it) {
        var row = document.createElement("div");
        row.className = "row";
        row.innerHTML = '<div class="row-main"><div class="row-title">' + esc(it.titulo) + '</div><div class="row-sub">' + esc(it.dia) + "</div></div>" +
          '<button class="btn btn-dark btn-sm" data-a="abrir">Abrir</button>' +
          (it.url ? '<a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="' + esc(it.url) + '"><svg><use href="#i-download"/></svg>PDF</a>' : "") +
          '<button class="btn btn-danger-outline btn-sm" data-a="borrar" title="Borrar"><svg><use href="#i-trash"/></svg></button>';
        row.querySelector('[data-a="abrir"]').addEventListener("click", function () { cargarEntrenamiento(it.titulo); });
        row.querySelector('[data-a="borrar"]').addEventListener("click", async function () {
          var ok = await confirmar("Borrar entrenamiento", "¿Borrar \"" + it.titulo + "\" del historial?", "Borrar");
          if (!ok) return abrirHistorial();
          try { var r = await api("eliminarEntrenamiento", { titulo: it.titulo }); toast(r.msg, r.success ? "ok" : "err"); }
          catch (err) { errorToast(err); }
          abrirHistorial();
        });
        lista.appendChild(row);
      });
    } catch (err) { lista.innerHTML = '<div class="list-empty">' + esc(err.message) + "</div>"; }
  }

  async function cargarEntrenamiento(titulo) {
    cerrarModal();
    try {
      var r = await api("buscarEntrenamiento", { titulo: titulo });
      if (!r.success) return toast(r.msg, "err");
      $("plan_titulo").value = titulo;
      $("plan_dia").value = r.dia || ""; $("plan_hora").value = r.hora || ""; $("plan_lugar").value = r.lugar || "";
      $("plan_objetivos").value = r.objetivos || ""; $("plan_observaciones").value = r.observaciones || "";
      Pizarra.cargar(r.dibujos, r.textos);
      if (r.url) { $("link_pdf").href = r.url; $("link_pdf").hidden = false; } else $("link_pdf").hidden = true;
      window.scrollTo(0, 0);
      toast("Entrenamiento cargado", "ok");
    } catch (err) { errorToast(err); }
  }

  // =========================================================
  //  PLANTEL
  // =========================================================
  async function cargarEquipos(seleccionar) {
    try {
      var eq = await api("listarEquipos");
      [["sel_equipo", seleccionar || $("sel_equipo").value], ["sel_equipo_cita", $("sel_equipo_cita").value]].forEach(function (par) {
        var sel = $(par[0]);
        sel.innerHTML = '<option value="">Seleccioná un equipo…</option>';
        eq.forEach(function (e) { var o = document.createElement("option"); o.value = e; o.textContent = e; sel.appendChild(o); });
        if (par[1] && eq.indexOf(par[1]) !== -1) sel.value = par[1];
      });
    } catch (err) { errorToast(err); }
  }

  $("sel_equipo").addEventListener("change", cargarJugadores);

  async function cargarJugadores() {
    var eq = $("sel_equipo").value;
    var cont = $("lista_jugadores");
    cont.innerHTML = "";
    estado.jugadores = [];
    actualizarVacio();
    if (!eq) return;
    try {
      var jugs = await api("listarJugadores", { equipo: eq });
      if ($("sel_equipo").value !== eq) return;
      jugs.forEach(function (j) { renderJugador(j, false); });
      actualizarVacio();
    } catch (err) { errorToast(err); }
  }

  function actualizarVacio() {
    var eq = $("sel_equipo").value;
    var vacio = $("plantel_vacio");
    vacio.hidden = estado.jugadores.length > 0;
    vacio.textContent = eq ? "Este equipo todavía no tiene jugadores. Agregá el primero." : "Seleccioná o creá un equipo para ver sus jugadores.";
  }

  function calcularMedia(stats, asis, clases) {
    var suma = stats.reduce(function (a, b) { return a + Number(b || 0); }, 0);
    var pres = (Number(asis || 0) / (Number(clases || 0) || 1)) * 10;
    return ((suma / 15 + pres) / 2).toFixed(2);
  }

  function renderJugador(j, nuevo) {
    var jug = {
      nombre: j.nombre,
      stats: (j.stats && j.stats.length ? j.stats : Array(15).fill(5)).map(function (v) { return Number(v) || 1; }),
      asistencias: Number(j.asistencias || 0), clases: Number(j.clases || 0)
    };
    estado.jugadores.push(jug);
    var card = document.createElement("div");
    card.className = "card player" + (nuevo ? " dirty" : "");
    var pct = jug.clases ? Math.round(jug.asistencias / jug.clases * 100) : 0;
    card.innerHTML =
      '<div class="player-head"><span class="player-name"></span><span class="media"><small>Media</small><b>0.00</b></span></div>' +
      '<div class="stats">' + ITEMS.map(function (name, i) {
        return '<div class="stat"><label>' + name + ' <b>' + jug.stats[i] + '</b></label><input type="range" min="1" max="10" value="' + jug.stats[i] + '" data-i="' + i + '"></div>';
      }).join("") + "</div>" +
      '<div class="player-foot"><div class="attendance">Asistencia <b>' + jug.asistencias + " / " + jug.clases + "</b> (" + pct + '%)<div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="btn-row"><button class="btn btn-danger-outline btn-sm" data-a="del" title="Eliminar jugador"><svg><use href="#i-trash"/></svg></button>' +
      '<button class="btn btn-success btn-sm" data-a="save"><svg><use href="#i-save"/></svg>Guardar</button></div></div>';
    card.querySelector(".player-name").textContent = jug.nombre;
    var mediaEl = card.querySelector(".media b");
    var refrescar = function () { mediaEl.textContent = calcularMedia(jug.stats, jug.asistencias, jug.clases); };
    refrescar();

    card.querySelectorAll("input[type=range]").forEach(function (r) {
      r.addEventListener("input", function () {
        var i = Number(r.dataset.i);
        jug.stats[i] = Number(r.value);
        r.previousElementSibling.querySelector("b").textContent = r.value;
        card.classList.add("dirty");
        refrescar();
      });
    });

    card.querySelector('[data-a="save"]').addEventListener("click", async function () {
      var btn = this; ocupado(btn, true, "…");
      try {
        var r = await api("guardarJugador", { equipo: $("sel_equipo").value, nombre: jug.nombre, stats: jug.stats, asistencias: jug.asistencias, clases: jug.clases });
        if (r.success) {
          card.classList.remove("dirty"); toast(jug.nombre + " guardado", "ok");
          if (nuevo) { nuevo = false; cargarEquipos($("sel_equipo").value); }
        } else toast(r.msg, "err");
      } catch (err) { errorToast(err); }
      finally { ocupado(btn, false); }
    });

    card.querySelector('[data-a="del"]').addEventListener("click", async function () {
      var ok = await confirmar("Eliminar jugador", "¿Eliminar a " + jug.nombre + " del equipo?", "Eliminar");
      if (!ok) return;
      try {
        if (!nuevo) await api("eliminarJugador", { equipo: $("sel_equipo").value, nombre: jug.nombre });
        card.remove();
        estado.jugadores.splice(estado.jugadores.indexOf(jug), 1);
        actualizarVacio();
      } catch (err) { errorToast(err); }
    });

    $("lista_jugadores").appendChild(card);
    return card;
  }

  $("btn_nuevo_equipo").addEventListener("click", async function () {
    var n = await pedirTexto("Nuevo equipo", "Nombre del equipo");
    if (!n) return;
    var sel = $("sel_equipo");
    if (![].some.call(sel.options, function (o) { return o.value === n; })) {
      var o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o);
    }
    sel.value = n;
    await cargarJugadores();
    toast("Equipo creado. Se guarda cuando guardes el primer jugador.", "ok");
  });

  $("btn_agregar_jugador").addEventListener("click", async function () {
    if (!$("sel_equipo").value) return toast("Primero seleccioná o creá un equipo.", "err");
    var n = await pedirTexto("Agregar jugador", "Nombre del jugador");
    if (!n) return;
    if (estado.jugadores.some(function (j) { return j.nombre.toLowerCase() === n.toLowerCase(); })) return toast("Ya hay un jugador con ese nombre.", "err");
    var card = renderJugador({ nombre: n, stats: Array(15).fill(5), asistencias: 0, clases: 0 }, true);
    actualizarVacio();
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    toast("Ajustá sus valores y tocá Guardar.", "");
  });

  $("btn_del_equipo").addEventListener("click", async function () {
    var eq = $("sel_equipo").value;
    if (!eq) return toast("Seleccioná un equipo para eliminar.", "err");
    var ok = await confirmar("Eliminar equipo", "Se eliminará \"" + eq + "\" y todos sus jugadores. Esta acción no se puede deshacer.", "Eliminar equipo");
    if (!ok) return;
    try {
      var r = await api("eliminarEquipo", { equipo: eq });
      toast(r.msg, r.success ? "ok" : "err");
      $("sel_equipo").value = "";
      await cargarEquipos("");
      cargarJugadores();
    } catch (err) { errorToast(err); }
  });

  // ---------- Asistencia ----------
  $("btn_asistencia").addEventListener("click", async function () {
    var eq = $("sel_equipo").value;
    if (!eq) return toast("Seleccioná un equipo primero.", "err");
    var body = document.createElement("div");
    var hoy = new Date(); hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
    body.innerHTML = '<label class="field"><span>Fecha</span><input type="date" id="fecha_asis" value="' + hoy.toISOString().slice(0, 10) + '"></label>' +
      '<div class="check-all"><span>Marcá los presentes</span><a href="#" id="marcar_todos">Marcar todos</a></div><div class="list" id="check_list"></div>' +
      '<div id="asis_reporte" hidden style="margin-top:14px"><textarea id="reporte_text" rows="9" readonly style="font-family:ui-monospace,Consolas,monospace;font-size:13px"></textarea></div>';
    var lista = body.querySelector("#check_list");
    if (!estado.jugadores.length) lista.innerHTML = '<div class="list-empty">No hay jugadores en este equipo.</div>';
    estado.jugadores.forEach(function (j) {
      var l = document.createElement("label"); l.className = "check-row";
      l.innerHTML = '<input type="checkbox"><span></span>';
      l.querySelector("span").textContent = j.nombre;
      l.querySelector("input").value = j.nombre;
      lista.appendChild(l);
    });
    body.querySelector("#marcar_todos").addEventListener("click", function (e) {
      e.preventDefault(); lista.querySelectorAll("input").forEach(function (c) { c.checked = true; });
    });
    var reporte = "";
    modal("Tomar asistencia · " + eq, body, [
      { texto: "Cerrar", valor: null },
      { texto: '<svg><use href="#i-download"/></svg>TXT', clase: "btn-outline", valor: function () { if (reporte) descargarTxt(reporte, "Asistencia_" + $("fecha_asis").value + ".txt"); else toast("Primero guardá la asistencia.", "err"); } },
      { texto: '<svg><use href="#i-check"/></svg>Guardar asistencia', clase: "btn-success", valor: function () { guardarAsistencia(); } }
    ]);

    var guardando = false;
    async function guardarAsistencia() {
      if (guardando || reporte) return reporte && toast("La asistencia de hoy ya se guardó.", "");
      var pre = [], aus = [];
      lista.querySelectorAll("input").forEach(function (c) { (c.checked ? pre : aus).push(c.value); });
      guardando = true;
      try {
        var r = await api("asistenciaGrupal", { equipo: eq, presentes: pre });
        if (!r.success) return toast(r.msg, "err");
        reporte = "REPORTE DE ASISTENCIA · DTORDEN\nEQUIPO: " + eq + "\nFECHA: " + $("fecha_asis").value +
          "\n------------------------------\nPRESENTES (" + pre.length + "):\n" + pre.join(", ") +
          "\n\nAUSENTES (" + aus.length + "):\n" + aus.join(", ");
        $("reporte_text").value = reporte;
        $("asis_reporte").hidden = false;
        toast(r.msg, "ok");
        cargarJugadores();
      } catch (err) { errorToast(err); }
      finally { guardando = false; }
    }
  });

  // =========================================================
  //  CITACIÓN
  // =========================================================
  $("sel_equipo_cita").addEventListener("change", async function () {
    var eq = this.value;
    estado.citados = []; estado.reservas = []; estado.citaJugadores = [];
    renderCitacion();
    if (!eq) return;
    $("cita_disponibles").innerHTML = '<div class="list-empty">Cargando…</div>';
    try {
      estado.citaJugadores = await api("listarCitacion", { equipo: eq });
      renderCitacion();
    } catch (err) { errorToast(err); }
  });

  function renderCitacion() {
    var disp = $("cita_disponibles"), sel = $("cita_seleccionados");
    disp.innerHTML = ""; sel.innerHTML = "";
    if (!estado.citaJugadores.length) disp.innerHTML = '<div class="list-empty">Seleccioná un equipo.</div>';
    estado.citaJugadores.forEach(function (j, i) {
      var esM = estado.citados.indexOf(j.nombre) !== -1, esR = estado.reservas.indexOf(j.nombre) !== -1;
      var row = document.createElement("div");
      row.className = "row" + (esM ? " is-m" : esR ? " is-r" : "");
      row.innerHTML = '<span class="rank">' + (i + 1) + '</span><div class="row-main"><div class="row-title"></div><div class="row-sub">Media ' + esc(j.media) + "</div></div>" +
        '<button class="btn btn-sm m" title="Citar">Citar</button><button class="btn btn-sm r" title="Reserva">Reserva</button>';
      row.querySelector(".row-title").textContent = j.nombre;
      row.querySelector(".m").addEventListener("click", function () { asignar(j.nombre, "M"); });
      row.querySelector(".r").addEventListener("click", function () { asignar(j.nombre, "R"); });
      disp.appendChild(row);
    });
    var agregar = function (n, tipo, idx) {
      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<span class="rank">' + idx + '</span><div class="row-main"><div class="row-title"></div></div><span class="badge-type ' + tipo.toLowerCase() + '">' + (tipo === "M" ? "CITADO" : "RESERVA") + "</span>" +
        '<button class="btn btn-sm q" title="Quitar"><svg><use href="#i-x"/></svg></button>';
      row.querySelector(".row-title").textContent = n;
      row.querySelector(".q").addEventListener("click", function () { quitar(n); });
      sel.appendChild(row);
    };
    estado.citados.forEach(function (n, i) { agregar(n, "M", i + 1); });
    estado.reservas.forEach(function (n, i) { agregar(n, "R", "R" + (i + 1)); });
    if (!estado.citados.length && !estado.reservas.length) sel.innerHTML = '<div class="list-empty">Todavía no hay convocados.</div>';
    $("c_cita").textContent = estado.citados.length;
    $("c_res").textContent = estado.reservas.length;
  }

  function asignar(n, tipo) {
    if (tipo === "M") {
      if (estado.citados.indexOf(n) !== -1) return;
      if (estado.citados.length >= 12) return toast("Máximo 12 citados.", "err");
      estado.reservas = estado.reservas.filter(function (x) { return x !== n; });
      estado.citados.push(n);
    } else {
      if (estado.reservas.indexOf(n) !== -1) return;
      if (estado.reservas.length >= 6) return toast("Máximo 6 reservas.", "err");
      estado.citados = estado.citados.filter(function (x) { return x !== n; });
      estado.reservas.push(n);
    }
    renderCitacion();
  }

  function quitar(n) {
    estado.citados = estado.citados.filter(function (x) { return x !== n; });
    estado.reservas = estado.reservas.filter(function (x) { return x !== n; });
    renderCitacion();
  }

  $("btn_generar_cita").addEventListener("click", function () {
    var rival = $("cita_rival").value.trim(), fecha = $("cita_fecha").value, lugar = $("cita_lugar").value.trim();
    if (!rival || !fecha) return toast("Completá la fecha y el rival.", "err");
    if (!estado.citados.length) return toast("Elegí al menos un citado.", "err");
    var f = fecha.split("-").reverse().join("/");
    var rep = "CITACIÓN · DTORDEN\n" + ($("sel_equipo_cita").value ? "EQUIPO: " + $("sel_equipo_cita").value + "\n" : "") +
      "------------------------------\nFECHA: " + f + "\nRIVAL: " + rival + "\nLUGAR: " + (lugar || "-") +
      "\n------------------------------\nCITADOS (" + estado.citados.length + "):\n";
    estado.citados.forEach(function (n, i) { rep += (i + 1) + ". " + n + "\n"; });
    if (estado.reservas.length) {
      rep += "\nRESERVAS (" + estado.reservas.length + "):\n";
      estado.reservas.forEach(function (n) { rep += "- " + n + "\n"; });
    }
    rep += "------------------------------\n¡VAMOS EQUIPO!";
    $("reporte_cita_text").value = rep;
    $("cita_reporte").hidden = false;
    $("cita_reporte").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("btn_txt_cita").addEventListener("click", function () {
    descargarTxt($("reporte_cita_text").value, "Citacion_" + ($("cita_rival").value.trim() || "partido").replace(/[^\w\-áéíóúñ ]/gi, "") + ".txt");
  });

  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () { copiar($(b.dataset.copy).value); });
  });
  document.querySelectorAll("[data-share]").forEach(function (b) {
    b.addEventListener("click", function () { compartir($(b.dataset.share).value); });
  });

  // ---------- Modal: cerrar ----------
  $("modal_close").addEventListener("click", cerrarModal);
  $("modal").addEventListener("click", function (e) { if (e.target === this) cerrarModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrarModal(); });

  // ---------- Service worker (necesario para instalar la app) ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  if (!window.DTORDEN_CONFIG || /PEGAR_AQUI/.test(window.DTORDEN_CONFIG.API_URL)) {
    setTimeout(function () { toast("Falta configurar la URL de la API en js/config.js", "err"); }, 600);
  }

  iniciar();
})();
