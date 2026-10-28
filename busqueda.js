/* Búsqueda de productos de Nicom — las mismas reglas en todo el sistema (Catálogo, Cotizaciones, Ventas, Dashboard…):
   - palabras en cualquier orden, sin importar acentos, mayúsculas ni plurales ("tarjetas de vídeo" = "tarjeta de video")
   - sinónimos (los mismos de la base de datos: tarjeta gráfica = tarjeta de video, laptop = portátil…)
   - orden por relevancia: primero el nombre que empieza con lo buscado, luego el que lo contiene, luego otros campos
   - si no hay nada exacto, tolera errores de tipeo ("tarjta de vidoe")
   Uso: NicomBusqueda.filtrar(lista, texto, { nombre: p => p.nombre, extra: p => "...", bonus: p => 0 }) */
(function () {
  var URL_SB = "https://tkhzuopapvclmcgxyood.supabase.co", KEY = "sb_publishable_KQB6B6uLIPr-xKdNDc8iEw_7tcWM5gS";
  var sinonimos = [];
  var VACIAS = { de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, para: 1, con: 1, y: 1, en: 1, un: 1, una: 1, por: 1, sin: 1, a: 1, o: 1 };

  // Los sinónimos salen de la base de datos (una sola lista para todo el sistema).
  try {
    fetch(URL_SB + "/rest/v1/rpc/busq_sinonimos", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: "{}" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d) { if (Array.isArray(d)) { sinonimos = d.map(function (g) { return String(g).split("|"); }); window.dispatchEvent(new Event("nicom-busqueda-lista")); } })
      .catch(function () {});
  } catch (e) {}

  function norm(t) {
    return " " + String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim() + " ";
  }
  function singular(w) {
    if (w.length > 5 && /[rlndz]es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /[^s]s$/.test(w) && !/(us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function grupoDe(w) { for (var i = 0; i < sinonimos.length; i++) if (sinonimos[i].indexOf(w) >= 0) return sinonimos[i]; return null; }

  // Convierte lo escrito en una lista de requisitos; cada requisito se cumple con cualquiera de sus formas.
  function consulta(texto) {
    var frase = norm(texto).trim();
    if (!frase) return null;
    var q = " " + frase.split(" ").map(singular).join(" ") + " ", conds = [];
    sinonimos.forEach(function (g) {
      var largas = g.filter(function (x) { return x.indexOf(" ") > 0; }).sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < largas.length; i++) if (q.indexOf(" " + largas[i] + " ") >= 0) { conds.push(g); q = q.split(" " + largas[i] + " ").join(" "); break; }
    });
    q.trim().split(" ").forEach(function (w) { if (w && !VACIAS[w]) conds.push(grupoDe(w) || [w]); });
    return conds.length ? { frase: frase, conds: conds } : null;
  }

  // Como antes: el texto puede estar dentro de otra palabra ("3060" encuentra "RTX3060"); al inicio de palabra suma más.
  function tiene(txt, alts) { for (var i = 0; i < alts.length; i++) if (txt.indexOf(alts[i]) >= 0) return true; return false; }
  function alInicio(txt, alts) { for (var i = 0; i < alts.length; i++) if (txt.indexOf(" " + alts[i]) >= 0) return true; return false; }
  function empieza(txt, alts) { for (var i = 0; i < alts.length; i++) if (txt.indexOf(" " + alts[i]) === 0) return true; return false; }

  // Parecido entre dos palabras (0 a 1), tolera letras cambiadas, de más, de menos o invertidas.
  function parecido(a, b) {
    var m = a.length, n = b.length; if (!m || !n) return 0;
    if (Math.abs(m - n) > 2) return 0;
    var d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      var c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return 1 - d[m][n] / Math.max(m, n);
  }
  function mejorParecido(alts, palabras) {
    var mx = 0;
    alts.forEach(function (a) {
      if (a.length < 4 || a.indexOf(" ") >= 0) return;
      palabras.forEach(function (w) { if (w.length >= 3) { var s = parecido(a, w.slice(0, a.length + 2)); if (s > mx) mx = s; } });
    });
    return mx;
  }

  var cache = new WeakMap();
  function textos(p, op) {
    // Si el producto se editó (cambió su nombre o datos), se vuelve a preparar su texto.
    var rn = String(op.nombre(p) || ""), rx = String(op.extra ? op.extra(p) || "" : ""), c = cache.get(p);
    if (!c || c.rn !== rn || c.rx !== rx) { c = { rn: rn, rx: rx, n: norm(rn), x: norm(rx) }; c.w = c.n.trim().split(" "); cache.set(p, c); }
    return c;
  }

  function filtrar(lista, texto, op) {
    op = op || {}; op.nombre = op.nombre || function (p) { return p.nombre; };
    var c = consulta(texto);
    if (!c) return lista.slice();
    var nc = c.conds.length, primera = c.conds[0], res = [];
    lista.forEach(function (p) {
      var t = textos(p, op), enNombre = 0, palabra = 0;
      for (var i = 0; i < nc; i++) {
        var k = c.conds[i];
        if (tiene(t.n, k)) { enNombre++; if (alInicio(t.n, k)) palabra++; }
        else if (!tiene(t.x, k)) return;
      }
      var pt = (t.n.indexOf(" " + c.frase) === 0 ? 120 : t.n.indexOf(" " + c.frase + " ") >= 0 ? 30 : 0) + 40 * enNombre / nc + 15 * palabra / nc + (empieza(t.n, primera) ? 35 : 0) + (op.bonus ? op.bonus(p) : 0);
      res.push({ p: p, s: pt });
    });
    // Nada exacto: segunda pasada que tolera errores de tipeo
    if (!res.length) {
      lista.forEach(function (p) {
        var t = textos(p, op), suma = 0;
        for (var i = 0; i < nc; i++) {
          var k = c.conds[i];
          if (tiene(t.n, k) || tiene(t.x, k)) { suma += 1; continue; }
          var s = mejorParecido(k, t.w);
          if (s < 0.6) return;
          suma += s;
        }
        res.push({ p: p, s: 100 * suma / nc + (op.bonus ? op.bonus(p) : 0) });
      });
    }
    res.forEach(function (r, i) { r.i = i; });
    res.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    return res.map(function (r) { return r.p; });
  }

  window.NicomBusqueda = { filtrar: filtrar, normalizar: norm };
})();
