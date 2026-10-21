/* Nicom — Limpiar: una sola herramienta para vaciar secciones en todo el software.
   Uso: poner data-limpiable="Nombre" en el contenedor (panel, details…).
   - Se agrega solo un botón "↺ Limpiar" arriba a la derecha.
   - cnLimpiar(idOElemento, {silencioso:true}) limpia desde código.
   - El contenedor recibe el evento "cn:limpiar" para reiniciar su estado interno.
   - window.cnHook = {sinConfirmar, antes(root), despues(estado, root)} para integrarse con Deshacer. */
(function () {
  var css = '.cn-limpiar{position:absolute;top:10px;right:12px;z-index:2;background:transparent;border:1px solid var(--line,#2c3a34);color:var(--muted,#8FA69B);font:inherit;font-size:11.5px;padding:3px 10px;cursor:pointer;line-height:1.4}' +
    '.cn-limpiar:hover{color:var(--paper,#EDE8DE);border-color:var(--gold,#C9A227)}' +
    '[data-limpiable]>h2,[data-limpiable]>summary{padding-right:96px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function campos(root) { return root.querySelectorAll('input,select,textarea'); }
  function ignorar(el) { return el.type === 'hidden' || el.type === 'button' || el.type === 'submit' || el.hasAttribute('data-no-limpiar'); }
  function sucio(root) {
    var l = campos(root);
    for (var i = 0; i < l.length; i++) {
      var el = l[i]; if (ignorar(el)) continue;
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== el.defaultChecked) return true; }
      else if (el.type === 'file') { if (el.value) return true; }
      else if (el.tagName === 'SELECT') { if (Array.prototype.some.call(el.options, function (o) { return o.selected !== o.defaultSelected; }) && el.selectedIndex > 0) return true; }
      else if (el.value !== el.defaultValue) return true;
    }
    return false;
  }
  function reset(root) {
    if (root.hasAttribute('data-limpiar-solo-evento')) return;
    campos(root).forEach(function (el) {
      if (ignorar(el)) return;
      var antes;
      if (el.type === 'checkbox' || el.type === 'radio') { antes = el.checked; el.checked = el.defaultChecked; if (antes !== el.checked) el.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (el.type === 'file') { el.value = ''; }
      else if (el.tagName === 'SELECT') {
        antes = el.selectedIndex; var d = -1;
        for (var i = 0; i < el.options.length; i++) if (el.options[i].defaultSelected) { d = i; break; }
        el.selectedIndex = d >= 0 ? d : 0;
        if (antes !== el.selectedIndex) el.dispatchEvent(new Event('change', { bubbles: true }));
      } else { antes = el.value; el.value = el.defaultValue; if (antes !== el.value) el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    root.querySelectorAll('[data-limpiar-vaciar]').forEach(function (e) { e.innerHTML = ''; });
    root.querySelectorAll('[data-limpiar-ocultar]').forEach(function (e) { e.style.display = 'none'; });
    root.querySelectorAll('.msg').forEach(function (e) { e.textContent = ''; });
  }
  function nombre(root) {
    if (root.dataset.limpiable) return root.dataset.limpiable;
    var h = root.querySelector('h2,summary'); return h ? h.textContent.trim().slice(0, 50) : 'esta sección';
  }
  window.cnLimpiar = function (r, o) {
    o = o || {};
    var root = typeof r === 'string' ? document.getElementById(r) : r; if (!root) return false;
    var H = window.cnHook || {};
    if (!o.silencioso && !H.sinConfirmar && (sucio(root) || (typeof root.cnTieneEstado === 'function' && root.cnTieneEstado()))) {
      if (!confirm('¿Limpiar «' + nombre(root) + '»? Se borra lo que escribiste en esta sección.')) return false;
    }
    var estado = H.antes ? H.antes(root) : null;
    reset(root);
    root.dispatchEvent(new CustomEvent('cn:limpiar'));
    if (H.despues) H.despues(estado, root);
    return true;
  };
  function montar() {
    document.querySelectorAll('[data-limpiable]').forEach(function (root) {
      if (root.querySelector(':scope>.cn-limpiar')) return;
      if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cn-limpiar';
      b.textContent = '↺ ' + (root.dataset.limpiableTexto || 'Limpiar'); b.title = 'Vaciar esta sección';
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); window.cnLimpiar(root); });
      root.appendChild(b);
    });
  }
  // Si el navegador devuelve lo último escrito (recargar / volver atrás), cada sección vuelve limpia.
  function alCargar() {
    var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
    if (nav.type === 'reload' || nav.type === 'back_forward')
      document.querySelectorAll('[data-limpiable]').forEach(function (r) { if (r.getAttribute('data-limpiable-recarga') !== 'no') reset(r); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
  if (document.readyState === 'complete') alCargar(); else window.addEventListener('load', alCargar);
})();
