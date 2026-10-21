/* Calculadora flotante Nicom: precio directo y de Mercado Libre. Se arrastra, se minimiza y recuerda su posición. */
(function(){
if(window.__calcNicom)return;window.__calcNicom=1;
var URL_="https://tkhzuopapvclmcgxyood.supabase.co",KEY="sb_publishable_KQB6B6uLIPr-xKdNDc8iEw_7tcWM5gS";
var bcv=null,bin=null,com=10,seq=0,tm=null;
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}
var st=document.createElement("style");st.textContent=
'#cn-btn{position:fixed;right:18px;bottom:18px;z-index:9998;display:flex;align-items:center;gap:8px;padding:11px 16px;background:var(--gold,#C9A227);color:#0F1B17;border:0;font:600 13.5px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.45);border-radius:999px}'+
'#cn-win{position:fixed;z-index:9999;width:340px;max-width:calc(100vw - 16px);display:none;background:var(--surface,#16241F);color:var(--paper,#EDE8DE);border:1px solid var(--line,#2C3F37);box-shadow:0 14px 44px rgba(0,0,0,.6);font:14px "IBM Plex Sans",system-ui,sans-serif}'+
'#cn-win *{box-sizing:border-box}'+
'#cn-h{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surface-2,#1D2E27);border-bottom:1px solid var(--line,#2C3F37);cursor:move;touch-action:none;user-select:none}'+
'#cn-h b{flex:1;font-size:14px}#cn-h span{font-size:11px;color:var(--muted,#8FA69B)}'+
'#cn-h button{background:none;border:0;color:var(--muted,#8FA69B);font-size:16px;cursor:pointer;padding:2px 6px}'+
'#cn-b{padding:12px}#cn-win.min #cn-b{display:none}'+
'#cn-b label{display:block;font-size:12px;color:var(--muted,#8FA69B);margin-bottom:4px}'+
'#cn-b input{width:100%;padding:9px 10px;background:var(--ink,#0F1B17);border:1px solid var(--line,#2C3F37);color:var(--paper,#EDE8DE);font:600 16px "IBM Plex Sans",system-ui,sans-serif}'+
'.cn-f{display:grid;grid-template-columns:1fr 1fr;gap:10px}'+
'.cn-seg{display:grid;grid-template-columns:1fr 1fr;margin:10px 0;border:1px solid var(--line,#2C3F37)}'+
'.cn-seg button{padding:8px;background:none;border:0;color:var(--muted,#8FA69B);font:500 13px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer}'+
'.cn-seg button.on{background:var(--paper,#EDE8DE);color:#0F1B17;font-weight:600}'+
'.cn-o{margin-top:10px;padding:10px 12px;font-size:12.5px;color:var(--muted,#8FA69B);line-height:1.6;border-left:4px solid}'+
'.cn-o h4{margin:0 0 2px;font-size:12px;letter-spacing:.04em;text-transform:uppercase}'+
'.cn-dir{border-color:#3FA796;background:rgba(63,167,150,.10)}.cn-dir h4,.cn-dir .cn-m{color:#4FE0C4}'+
'.cn-mlb{border-color:#E8B923;background:rgba(232,185,35,.10)}.cn-mlb h4,.cn-mlb .cn-m{color:#FFD24A}'+
'.cn-m{font:700 30px "IBM Plex Sans",system-ui,sans-serif;line-height:1.15}'+
'.cn-o b{color:var(--paper,#EDE8DE)}'+
'.cn-g{color:#5DF08A;font-weight:700;font-size:14px}.cn-r{color:#FF6B57;font-weight:700}'+
'#cn-pie{font-size:11.5px;color:var(--muted,#8FA69B);margin-top:6px}';
document.head.appendChild(st);
var btn=document.createElement("button");btn.id="cn-btn";btn.type="button";btn.setAttribute("aria-label","Abrir calculadora de precios");
btn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h4"/></svg>Calculadora';
var w=document.createElement("div");w.id="cn-win";w.setAttribute("role","dialog");w.setAttribute("aria-label","Calculadora de precios");
w.innerHTML='<div id="cn-h"><b>Calculadora de precios</b><span id="cn-t"></span><button type="button" id="cn-min" aria-label="Minimizar">–</button><button type="button" id="cn-x" aria-label="Cerrar">✕</button></div>'+
'<div id="cn-b"><div class="cn-f"><div><label for="cn-c">Te costó ($)</label><input id="cn-c" type="number" inputmode="decimal" min="0" step="0.01" value="100"></div><div><label for="cn-p">Quieres ganar (%)</label><input id="cn-p" type="number" inputmode="decimal" min="0" step="0.5" value="30"></div></div>'+
'<div class="cn-seg"><button type="button" data-c="10" class="on">Clásica 10%</button><button type="button" data-c="12">Premium 12%</button></div>'+
'<div class="cn-o cn-dir"><h4>Vendes directo</h4><div class="cn-m" id="cn-d">—</div><div id="cn-dbs">&nbsp;</div><div>Ganas <span class="cn-g" id="cn-dg">—</span></div></div>'+
'<div class="cn-o cn-mlb"><h4>Publicas en Mercado Libre</h4><div class="cn-m" id="cn-ml">—</div><div>Cobras <b id="cn-mbs">—</b> (<b id="cn-mbi">—</b> a Binance)</div><div>Comisión de ML: <span class="cn-r" id="cn-mc">—</span></div><div>Ganas <span class="cn-g" id="cn-mg">—</span></div></div>'+
'<div id="cn-pie">Si el precio da ,00 se deja así; si da otros centavos, sube a ,99.</div></div>';
document.body.appendChild(btn);document.body.appendChild(w);
function $(i){return document.getElementById(i)}
function bs(a){return"Bs "+a.toLocaleString("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2})}
function usd(a){return"$"+a.toLocaleString("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2})}
function sube99(a){if(Math.abs(a-Math.round(a))<.005)return Math.round(a);var t=Math.floor(a)+.99;if(t<a-1e-9)t+=1;return Math.round(t*100)/100}
function rpc(modo,costo,valor,c){return fetch(URL_+"/rest/v1/rpc/calcular_precios",{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify({p_costo_usd:costo,p_modo:modo,p_valor:valor,p_comision_ml_pct:c,p_tasa_bcv:bcv,p_tasa_binance:bin})}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(a){return Array.isArray(a)?a[0]:a})}
function calc(){clearTimeout(tm);tm=setTimeout(function(){
  var a=parseFloat($("cn-c").value),p=parseFloat($("cn-p").value);
  if(!(a>0)||isNaN(p)||p<0||!bcv)return;var e=++seq;
  rpc("porcentaje",a,p,0).then(function(o){return rpc("neta",a,parseFloat(o.ganancia_deseada_usd),com).then(function(s){
    if(e!==seq)return;var i=sube99(parseFloat(o.precio_efectivo_usd)),u=sube99(parseFloat(s.precio_bcv_usd_equiv)),l=u*bcv,d=l/bin,m=d*com/100;
    $("cn-d").textContent=usd(i);$("cn-dbs").textContent=bs(i*bin)+" a tasa Binance";$("cn-dg").textContent=usd(i-a);
    $("cn-ml").textContent=usd(u);$("cn-mbs").textContent=bs(l);$("cn-mbi").textContent=usd(d);$("cn-mc").textContent=usd(m);$("cn-mg").textContent=usd(d-m-a)})})
  .catch(function(){if(e===seq)$("cn-pie").textContent="No se pudo calcular ahora. Revisa tu conexión."})},250)}
function tasas(){fetch(URL_+"/rest/v1/tasas_cambio?select=tasa_bcv,tasa_binance&order=fecha.desc&limit=1",{headers:{apikey:KEY}}).then(function(r){return r.json()}).then(function(a){var t=a&&a[0];bcv=t?parseFloat(t.tasa_bcv):null;bin=t?parseFloat(t.tasa_binance):null;if(!(bcv>0&&bin>0))throw 0;$("cn-t").innerHTML="BCV <b>"+bcv.toLocaleString("es-VE",{maximumFractionDigits:2})+"</b> · Bin <b>"+bin.toLocaleString("es-VE",{maximumFractionDigits:2})+"</b>";calc()}).catch(function(){$("cn-t").textContent="sin tasa"})}
["cn-c","cn-p"].forEach(function(i){$(i).addEventListener("input",calc)});
w.querySelectorAll(".cn-seg button").forEach(function(b){b.addEventListener("click",function(){com=parseFloat(b.dataset.c);w.querySelectorAll(".cn-seg button").forEach(function(x){x.classList.toggle("on",x===b)});calc()})});
function poner(x,y){var W=window.innerWidth,H=window.innerHeight,r=w.getBoundingClientRect();x=Math.max(4,Math.min(x,W-Math.min(r.width,W)-4));y=Math.max(4,Math.min(y,H-44));w.style.left=x+"px";w.style.top=y+"px";w.style.right="auto";w.style.bottom="auto"}
function abrir(){w.style.display="block";btn.style.display="none";var p=(ls("cn_pos")||"").split(",");if(p.length===2&&!isNaN(p[0]))poner(+p[0],+p[1]);else poner(window.innerWidth-360,window.innerHeight-w.offsetHeight-24);if(!bcv)tasas();else calc()}
function cerrar(){w.style.display="none";btn.style.display="flex"}
btn.onclick=abrir;$("cn-x").onclick=cerrar;
$("cn-min").onclick=function(){w.classList.toggle("min");this.textContent=w.classList.contains("min")?"+":"–"};
var h=$("cn-h"),dx=0,dy=0,on=false;
h.addEventListener("pointerdown",function(e){if(e.target.tagName==="BUTTON")return;on=true;var r=w.getBoundingClientRect();dx=e.clientX-r.left;dy=e.clientY-r.top;h.setPointerCapture(e.pointerId)});
h.addEventListener("pointermove",function(e){if(on)poner(e.clientX-dx,e.clientY-dy)});
h.addEventListener("pointerup",function(){if(!on)return;on=false;var r=w.getBoundingClientRect();ls("cn_pos",Math.round(r.left)+","+Math.round(r.top))});
window.addEventListener("resize",function(){if(w.style.display==="block"){var r=w.getBoundingClientRect();poner(r.left,r.top)}});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&w.style.display==="block")cerrar()});
window.abrirCalculadora=abrir;
})();
