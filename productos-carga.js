/* Carga de productos de Nicom — la misma para todas las pantallas (Productos, Cotizaciones, Ventas, Publicaciones ML, Análisis de competencia).
   Por qué existe: antes cada pantalla traía los productos con su propio ciclo. Con más de 5.000 productos, las tandas del fondo
   se pasaban del tiempo permitido por Supabase ("statement timeout"), la pantalla no avisaba y se quedaba con una parte (ej. 3.000 de 5.820),
   y los productos que quedaban fuera no se podían buscar ni editar.
   Qué hace:
   - pide los productos en tandas de 500, de a 2 a la vez (no se atora el servidor)
   - siempre ordena con "id" como desempate (sin eso, productos con el mismo nombre se repiten o se saltan entre tanda y tanda)
   - si una tanda falla, la reintenta hasta 3 veces antes de rendirse
   - compara con el total real de la base y, si no se cargó todo, muestra un aviso visible con botón "Reintentar"
   Uso: const r = await NicomProductos.cargarTodos(supabase, "id, nombre, ...", { orden: [{col:"nombre",asc:true}], reintentar: cargarProductos });
        r.filas = productos cargados · r.total = total real en la base (o null) · r.completo = true si se cargó todo */
(function () {
  var TANDA = 500, PARALELO = 2, REINTENTOS = 3, ID_AVISO = "aviso-carga-productos";

  function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // Pide una tanda; si el servidor falla, espera un poco y vuelve a intentar.
  async function pedirTanda(supabase, columnas, orden, desde) {
    var ultimoError = null;
    for (var intento = 0; intento <= REINTENTOS; intento++) {
      if (intento > 0) await esperar(700 * intento);
      var q = supabase.from("productos").select(columnas);
      orden.forEach(function (o) { q = q.order(o.col, { ascending: o.asc }); });
      var r = await q.range(desde, desde + TANDA - 1);
      if (!r.error) return r.data || [];
      ultimoError = r.error;
    }
    throw ultimoError;
  }

  function quitarAviso() {
    var a = document.getElementById(ID_AVISO);
    if (a && a.parentNode) a.parentNode.removeChild(a);
  }

  function mostrarAviso(cargados, total, reintentar) {
    quitarAviso();
    var a = document.createElement("div");
    a.id = ID_AVISO;
    a.setAttribute("role", "alert");
    a.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:99999;max-width:92vw;background:#b42318;color:#fff;padding:10px 14px;border-radius:8px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center";
    var t = document.createElement("span");
    t.textContent = total != null
      ? "Solo se cargaron " + cargados + " de " + total + " productos. Algunos no aparecerán en las búsquedas."
      : "No se pudieron cargar todos los productos (van " + cargados + "). Algunos no aparecerán en las búsquedas.";
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "Reintentar";
    b.style.cssText = "background:#fff;color:#b42318;border:0;border-radius:6px;padding:6px 12px;font:600 14px system-ui,sans-serif;cursor:pointer";
    b.onclick = function () {
      quitarAviso();
      if (typeof reintentar === "function") reintentar(); else location.reload();
    };
    a.appendChild(t); a.appendChild(b);
    document.body.appendChild(a);
  }

  async function cargarTodos(supabase, columnas, opciones) {
    opciones = opciones || {};
    var orden = opciones.orden || [{ col: "created_at", asc: false }, { col: "id", asc: true }];
    if (!orden.some(function (o) { return o.col === "id"; })) orden = orden.concat([{ col: "id", asc: true }]);

    // Total real de productos en la base, para saber si faltó alguno.
    var total = null;
    try {
      var c = await supabase.from("productos").select("id", { count: "exact", head: true });
      if (!c.error && typeof c.count === "number") total = c.count;
    } catch (e) {}

    var filas = [], desde = 0, fin = false, fallo = null;
    while (!fin) {
      var lote = [];
      for (var k = 0; k < PARALELO; k++) {
        lote.push(pedirTanda(supabase, columnas, orden, desde + k * TANDA).then(
          function (d) { return { ok: true, data: d }; },
          function (e) { return { ok: false, err: e }; }
        ));
      }
      var res = await Promise.all(lote);
      for (var i = 0; i < res.length; i++) {
        if (!res[i].ok) { fallo = res[i].err; fin = true; break; }
        filas = filas.concat(res[i].data);
        if (res[i].data.length < TANDA) { fin = true; break; }
      }
      desde += PARALELO * TANDA;
    }

    if (fallo) console.error("Error cargando productos", fallo);
    var completo = !fallo && (total == null || filas.length >= total);
    if (completo) quitarAviso(); else mostrarAviso(filas.length, total, opciones.reintentar);
    return { filas: filas, total: total, completo: completo };
  }

  window.NicomProductos = { cargarTodos: cargarTodos };
})();
