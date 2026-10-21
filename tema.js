/* Modo claro / oscuro de Nicom. Va en el <head> para que no parpadee. Recuerda la elección. */
(function(){
var K="nicom_tema";
function leer(){try{return localStorage.getItem(K)}catch(e){return null}}
function guardar(v){try{localStorage.setItem(K,v)}catch(e){}}
var r=document.documentElement;
function aplicar(t){if(t==="claro")r.setAttribute("data-tema","claro");else r.removeAttribute("data-tema");var b=document.getElementById("tema-btn");if(b){b.innerHTML=t==="claro"?ICO_LUNA+"<span>Modo oscuro</span>":ICO_SOL+"<span>Modo claro</span>";b.setAttribute("aria-label",t==="claro"?"Cambiar a modo oscuro":"Cambiar a modo claro")}}
var ICO_SOL='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
var ICO_LUNA='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
var css=
/* marca visible en ambos modos */
'.sidebar-brand{align-items:center;gap:10px!important}'+
'.sidebar-brand .brand-logo,img.brand-logo{object-fit:contain;height:44px!important;width:auto;border-radius:11px}'+
'.sidebar-brand::after{content:"Nicom";font:700 21px "Fraunces",Georgia,serif;letter-spacing:.01em;color:var(--paper);order:1;flex:1}.sidebar-brand .sidebar-close{order:2}'+
'.sidebar.auto-colapsado #tema-btn span{display:none}.sidebar.auto-colapsado #tema-btn{justify-content:center;padding:9px 0}'+
/* botón del tema */
'#tema-btn{display:flex;align-items:center;gap:9px;padding:9px 10px;margin-top:10px;background:none;border:1px solid var(--line);color:var(--muted);font:500 13px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer;width:100%;border-radius:2px}'+
'#tema-btn:hover{color:var(--paper);background:var(--surface-2)}'+
'#tema-btn.flota{position:fixed;bottom:14px;left:14px;z-index:9990;width:auto;background:var(--surface);box-shadow:0 4px 14px rgba(0,0,0,.25)}'+
/* paleta clara */
'html[data-tema="claro"]{--ink:#EEF2F7;--surface:#FFFFFF;--surface-2:#E6EDF5;--line:#BFCCDB;--paper:#0A1A33;--muted:#40536B;--gold:#004AAD;--teal:#007A55;--rust:#B3261E;color-scheme:light}'+
'html[data-tema="claro"] body{background:var(--ink);color:var(--paper)}'+
'html[data-tema="claro"] .brand-logo{box-shadow:0 0 0 1px var(--line),0 3px 10px rgba(10,26,51,.18);filter:none!important}'+
'html[data-tema="claro"] .side-link.activo{background:rgba(0,74,173,.10);box-shadow:inset 3px 0 0 var(--gold);color:var(--paper)}'+
'html[data-tema="claro"] button.add:hover,html[data-tema="claro"] button.primary:hover,html[data-tema="claro"] button.submit:hover,html[data-tema="claro"] button.primario:hover{background:#003A88!important;color:#fff}'+
'html[data-tema="claro"] .panel,html[data-tema="claro"] .sidebar{box-shadow:0 1px 3px rgba(10,26,51,.08)}'+
'html[data-tema="claro"] th{color:#0A1A33;font-weight:700}'+
'html[data-tema="claro"] td,html[data-tema="claro"] .num{color:var(--paper)}'+
'html[data-tema="claro"] input,html[data-tema="claro"] select,html[data-tema="claro"] textarea{background:#fff;color:var(--paper);border-color:#9FB1C6}'+
'html[data-tema="claro"] .panel-brand{background:linear-gradient(180deg,#D6E3F4 0,#EAF1FA 100%)}'+
/* calculadora flotante en claro */
'html[data-tema="claro"] .cn-dir{background:rgba(0,122,85,.10)}html[data-tema="claro"] .cn-dir h4,html[data-tema="claro"] .cn-dir .cn-m{color:#00664A}'+
'html[data-tema="claro"] .cn-mlb{background:rgba(0,74,173,.09);border-color:#004AAD}html[data-tema="claro"] .cn-mlb h4,html[data-tema="claro"] .cn-mlb .cn-m{color:#003A88}'+
'html[data-tema="claro"] .cn-g{color:#00703F}html[data-tema="claro"] .cn-r{color:#B3261E}'+
'html[data-tema="claro"] #cn-btn{background:#004AAD;color:#fff}html[data-tema="claro"] .cn-seg button.on{background:#004AAD;color:#fff}';
var s=document.createElement("style");s.id="tema-css";s.textContent=css;(document.head||r).appendChild(s);
aplicar(leer()==="claro"?"claro":"oscuro");
function boton(){
  if(document.getElementById("tema-btn"))return;
  var b=document.createElement("button");b.type="button";b.id="tema-btn";
  b.onclick=function(){var n=r.getAttribute("data-tema")==="claro"?"oscuro":"claro";guardar(n);aplicar(n)};
  var sb=document.querySelector(".sidebar");
  if(sb){sb.appendChild(b)}else{b.className="flota";document.body.appendChild(b)}
  aplicar(r.getAttribute("data-tema")==="claro"?"claro":"oscuro");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boton);else boton();
})();
