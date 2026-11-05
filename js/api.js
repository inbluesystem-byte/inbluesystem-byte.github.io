/* Comunicación con el backend de Apps Script (reemplaza a google.script.run) */
(function () {
  var pendientes = 0;
  var barra = function () { document.getElementById("progress").hidden = pendientes === 0; };

  var Sesion = {
    get token() { try { return localStorage.getItem("dt_token") || ""; } catch (e) { return ""; } },
    get nombre() { try { return localStorage.getItem("dt_nombre") || ""; } catch (e) { return ""; } },
    guardar: function (token, nombre) { try { localStorage.setItem("dt_token", token); localStorage.setItem("dt_nombre", nombre || ""); } catch (e) {} },
    borrar: function () { try { localStorage.removeItem("dt_token"); localStorage.removeItem("dt_nombre"); } catch (e) {} }
  };

  /**
   * api("listarEquipos", {...}) -> Promise con la respuesta del servidor.
   * Se usa Content-Type text/plain para evitar el "preflight" CORS, que Apps Script no soporta.
   */
  async function api(action, payload) {
    pendientes++; barra();
    try {
      var res = await fetch(window.DTORDEN_CONFIG.API_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: action, payload: payload || {}, token: Sesion.token })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var json = await res.json();
      var data = json.data;
      if (data && data.authError) {
        Sesion.borrar();
        window.dispatchEvent(new CustomEvent("dt:sesion-vencida", { detail: data.msg }));
        throw new ApiError(data.msg, true);
      }
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(navigator.onLine === false
        ? "Sin conexión a internet."
        : "No se pudo conectar con el servidor. Revisá tu conexión.", false);
    } finally {
      pendientes--; barra();
    }
  }

  function ApiError(msg, auth) { this.message = msg; this.auth = auth; }
  ApiError.prototype = Object.create(Error.prototype);

  window.api = api;
  window.Sesion = Sesion;
})();
