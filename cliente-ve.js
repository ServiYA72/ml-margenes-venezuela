/* Nicom — Datos de clientes en Venezuela: una sola herramienta para todas las pantallas
   (Clientes, Cotizaciones, Ventas, Campañas).
   - NicomVE.documento(texto): lee una cédula o un RIF escrito como sea y lo deja ordenado
     (V-12345678 / J-12345678-9), revisa el dígito verificador y dice si es persona natural o empresa.
   - NicomVE.estadoPorTelefono(tel): estado sugerido según el código de área de un teléfono fijo.
   - NicomVE.ESTADOS: estados de Venezuela con sus ciudades principales.
   - NicomVE.conectar({...}): conecta un formulario de cliente (ver abajo). */
(function () {
  var ESTADOS = {
    'Amazonas': ['Puerto Ayacucho'],
    'Anzoátegui': ['Barcelona', 'Puerto La Cruz', 'Lechería', 'El Tigre', 'Anaco', 'Cantaura'],
    'Apure': ['San Fernando de Apure', 'Guasdualito'],
    'Aragua': ['Maracay', 'Turmero', 'La Victoria', 'Cagua', 'Villa de Cura'],
    'Barinas': ['Barinas', 'Socopó', 'Barinitas'],
    'Bolívar': ['Ciudad Guayana', 'Puerto Ordaz', 'San Félix', 'Ciudad Bolívar', 'Upata'],
    'Carabobo': ['Valencia', 'Naguanagua', 'San Diego', 'Puerto Cabello', 'Guacara', 'Los Guayos', 'Tocuyito'],
    'Cojedes': ['San Carlos', 'Tinaquillo'],
    'Delta Amacuro': ['Tucupita'],
    'Distrito Capital': ['Caracas'],
    'Falcón': ['Coro', 'Punto Fijo', 'Tucacas', 'Chichiriviche'],
    'Guárico': ['San Juan de los Morros', 'Calabozo', 'Valle de la Pascua', 'Zaraza'],
    'La Guaira': ['La Guaira', 'Maiquetía', 'Catia La Mar', 'Macuto'],
    'Lara': ['Barquisimeto', 'Cabudare', 'Carora', 'El Tocuyo', 'Quíbor'],
    'Mérida': ['Mérida', 'El Vigía', 'Ejido', 'Tovar'],
    'Miranda': ['Los Teques', 'Guarenas', 'Guatire', 'Petare', 'Charallave', 'Ocumare del Tuy', 'Santa Teresa del Tuy', 'Higuerote', 'Baruta', 'Chacao', 'El Hatillo'],
    'Monagas': ['Maturín', 'Punta de Mata', 'Temblador'],
    'Nueva Esparta': ['Porlamar', 'La Asunción', 'Pampatar', 'Juan Griego'],
    'Portuguesa': ['Guanare', 'Acarigua', 'Araure'],
    'Sucre': ['Cumaná', 'Carúpano', 'Güiria'],
    'Táchira': ['San Cristóbal', 'Táriba', 'Rubio', 'San Antonio del Táchira', 'La Fría'],
    'Trujillo': ['Trujillo', 'Valera', 'Boconó'],
    'Yaracuy': ['San Felipe', 'Yaritagua', 'Chivacoa'],
    'Zulia': ['Maracaibo', 'San Francisco', 'Cabimas', 'Ciudad Ojeda', 'Machiques', 'Santa Bárbara del Zulia']
  };

  // Códigos de área de teléfonos fijos -> estado. Los celulares (0412, 0414, 0416, 0422, 0424, 0426)
  // no indican zona, así que no sugieren nada.
  var AREAS = {
    '212': 'Distrito Capital', '234': 'Miranda', '239': 'Miranda', '235': 'Guárico', '238': 'Guárico', '246': 'Guárico',
    '241': 'Carabobo', '242': 'Carabobo', '245': 'Carabobo', '249': 'Carabobo', '243': 'Aragua', '244': 'Aragua',
    '247': 'Apure', '248': 'Amazonas', '251': 'Lara', '252': 'Lara', '253': 'Lara', '254': 'Yaracuy',
    '255': 'Portuguesa', '256': 'Portuguesa', '257': 'Portuguesa', '258': 'Cojedes', '259': 'Falcón', '268': 'Falcón', '269': 'Falcón',
    '261': 'Zulia', '262': 'Zulia', '263': 'Zulia', '264': 'Zulia', '265': 'Zulia', '266': 'Zulia', '267': 'Zulia',
    '271': 'Trujillo', '272': 'Trujillo', '273': 'Barinas', '278': 'Barinas', '274': 'Mérida', '275': 'Mérida',
    '276': 'Táchira', '277': 'Táchira', '281': 'Anzoátegui', '282': 'Anzoátegui', '283': 'Anzoátegui',
    '285': 'Bolívar', '286': 'Bolívar', '288': 'Bolívar', '287': 'Delta Amacuro', '291': 'Monagas', '292': 'Monagas',
    '293': 'Sucre', '294': 'Sucre', '295': 'Nueva Esparta'
  };

  // Valor de cada letra para el dígito verificador del RIF (algoritmo del SENIAT).
  var LETRAS = { V: 1, E: 2, J: 3, P: 4, G: 5 };
  var PESOS = [3, 2, 7, 6, 5, 4, 3, 2];

  function digitoVerificador(letra, numero8) {
    if (!LETRAS[letra]) return null;
    var suma = LETRAS[letra] * 4;
    for (var i = 0; i < 8; i++) suma += parseInt(numero8.charAt(i), 10) * PESOS[i];
    var r = 11 - (suma % 11);
    return r >= 10 ? 0 : r;
  }

  function conDVPrevio(letra) { return (letra === 'J' || letra === 'G' || letra === 'C') ? true : false; }

  function documento(texto) {
    var limpio = String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!limpio) return { vacio: true };
    var letra = /^[VEJPGC]/.test(limpio) ? limpio.charAt(0) : 'V';
    var digitos = limpio.replace(/^[A-Z]/, '');
    if (!/^\d{2,10}$/.test(digitos) || (conDVPrevio(letra) === false && digitos.length < 5)) {
      return { valido: false, mensaje: 'Revisa el número: una cédula o RIF lleva entre 6 y 9 números (ej. V-12345678 o J-12345678-9).' };
    }
    var tipo = (letra === 'V' || letra === 'E' || letra === 'P') ? 'natural' : 'juridica';
    var res = { valido: true, letra: letra, tipo: tipo };

    // Empresas (J, G, C): el último número siempre es el dígito verificador.
    // Personas (V, E, P): con 9 números es un RIF (cédula + dígito); con 8 o menos es la cédula.
    var conDV = (letra === 'J' || letra === 'G' || letra === 'C') ? digitos.length >= 2 : digitos.length >= 9;
    if (conDV) {
      var num = digitos.slice(0, -1), dv = parseInt(digitos.slice(-1), 10);
      var num8 = ('00000000' + num).slice(-8);
      var esperado = digitoVerificador(letra, num8);
      res.numero = num8;
      res.formato = letra + '-' + num8 + '-' + dv;
      res.esRif = true;
      if (esperado !== null && esperado !== dv) {
        res.valido = false;
        res.mensaje = 'El RIF ' + res.formato + ' no es válido: el último número debería ser ' + esperado + '. Revisa si está bien escrito.';
        res.formatoSugerido = letra + '-' + num8 + '-' + esperado;
      }
    } else {
      // Cédula sin dígito verificador: se guarda como cédula y se calcula su RIF.
      res.numero = digitos;
      res.formato = letra + '-' + digitos;
      var dvCed = digitoVerificador(letra, ('00000000' + digitos).slice(-8));
      if (dvCed !== null) res.rif = letra + '-' + ('00000000' + digitos).slice(-8) + '-' + dvCed;
    }
    return res;
  }

  function estadoPorTelefono(tel) {
    var d = String(tel || '').replace(/\D/g, '');
    if (d.indexOf('58') === 0 && d.length >= 12) d = d.slice(2);
    if (d.charAt(0) === '0') d = d.slice(1);
    return AREAS[d.slice(0, 3)] || null;
  }

  function normalizarEstado(v) {
    var n = String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (!n) return '';
    if (n === 'vargas') return 'La Guaira';
    if (n === 'caracas' || n === 'dtto capital' || n === 'distrito federal') return 'Distrito Capital';
    for (var e in ESTADOS) if (e.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === n) return e;
    return v;
  }

  function llenarEstados(select, valor) {
    if (!select) return;
    var actual = normalizarEstado(valor != null ? valor : select.value);
    var html = '<option value="">— Estado —</option>';
    Object.keys(ESTADOS).forEach(function (e) { html += '<option value="' + e + '">' + e + '</option>'; });
    if (actual && !ESTADOS[actual]) html += '<option value="' + actual + '">' + actual + '</option>';
    select.innerHTML = html;
    select.value = actual || '';
  }

  function llenarCiudades(datalist, estado) {
    if (!datalist) return;
    var lista = estado && ESTADOS[estado] ? ESTADOS[estado] : Object.keys(ESTADOS).reduce(function (a, e) { return a.concat(ESTADOS[e]); }, []);
    datalist.innerHTML = lista.map(function (c) { return '<option value="' + c + '">'; }).join('');
  }

  function ciudadAEstado(ciudad) {
    var n = String(ciudad || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (!n) return null;
    for (var e in ESTADOS) {
      if (ESTADOS[e].some(function (c) { return c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === n; })) return e;
    }
    return null;
  }

  /* Conecta un formulario de cliente. Campos (todos por id, opcionales salvo doc):
     { doc, tipo, tel, estado (select), ciudad (input), aviso (elemento para mensajes),
       buscar: async function(documentoNormalizado) -> cliente o null,
       alEncontrar: function(cliente) }   */
  function conectar(o) {
    var $ = function (id) { return id ? document.getElementById(id) : null; };
    var doc = $(o.doc), tipo = $(o.tipo), tel = $(o.tel), est = $(o.estado), ciu = $(o.ciudad), aviso = $(o.aviso);
    var dlId = (o.ciudad || 'cv') + '-lista';
    var dl = document.getElementById(dlId);
    if (ciu && !dl) { dl = document.createElement('datalist'); dl.id = dlId; document.body.appendChild(dl); ciu.setAttribute('list', dlId); }
    if (est) { llenarEstados(est); est.addEventListener('change', function () { llenarCiudades(dl, est.value); }); }
    llenarCiudades(dl, est && est.value);
    var decir = function (texto, color) { if (aviso) { aviso.textContent = texto || ''; aviso.style.color = color || 'var(--muted)'; } };

    if (doc) doc.addEventListener('change', async function () {
      var r = documento(doc.value);
      if (r.vacio) return decir('');
      if (!r.valido) return decir(r.mensaje, 'var(--rust)');
      doc.value = r.formato;
      if (tipo) tipo.value = r.tipo;
      var texto = (r.tipo === 'natural' ? 'Persona natural' : 'Empresa') + (r.rif && !r.esRif ? ' · su RIF sería ' + r.rif : '') + ' · documento válido.';
      decir(texto, 'var(--teal)');
      if (typeof o.buscar === 'function') {
        try {
          var c = await o.buscar(r.formato.replace(/[^A-Z0-9]/g, ''));
          if (c) { if (o.alEncontrar) o.alEncontrar(c); decir('Ya tienes a ' + c.nombre + ' registrado con ese documento: se cargaron sus datos.', 'var(--teal)'); }
        } catch (e) { console.warn('NicomVE.buscar', e); }
      }
    });
    if (tel && est) tel.addEventListener('change', function () {
      if (est.value) return;
      var e = estadoPorTelefono(tel.value);
      if (e) { est.value = e; llenarCiudades(dl, e); decir('Estado sugerido por el código de área del teléfono: ' + e + '.', 'var(--muted)'); }
    });
    if (ciu && est) ciu.addEventListener('change', function () {
      if (est.value) return;
      var e = ciudadAEstado(ciu.value);
      if (e) { est.value = e; llenarCiudades(dl, e); }
    });
    return { refrescar: function (valorEstado) { if (est) llenarEstados(est, valorEstado); llenarCiudades(dl, est && est.value); decir(''); } };
  }

  function normDoc(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  window.NicomVE = { ESTADOS: ESTADOS, documento: documento, estadoPorTelefono: estadoPorTelefono, normalizarEstado: normalizarEstado,
    llenarEstados: llenarEstados, llenarCiudades: llenarCiudades, ciudadAEstado: ciudadAEstado, conectar: conectar, normDoc: normDoc };
})();
