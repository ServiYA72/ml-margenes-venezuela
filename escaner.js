/* Lector de código de barras: el lector actúa como teclado y termina con Enter.
   Uso: cnEscaner("id-del-buscador",{cache:()=>productosCache, codigo:p=>codigoBarras(p), elegir:id=>elegirProducto(id)}) */
(function(){
 const dig=s=>String(s||"").replace(/\D/g,""),low=s=>String(s||"").trim().toLowerCase();
 function aviso(t,ok){let b=document.getElementById("cn-esc-toast");if(!b){b=document.createElement("div");b.id="cn-esc-toast";b.style.cssText="position:fixed;left:50%;bottom:22px;transform:translateX(-50%);padding:10px 18px;font:600 14px 'IBM Plex Sans',sans-serif;z-index:99;border:1px solid;box-shadow:0 8px 24px rgba(0,0,0,.4)";document.body.appendChild(b)}
  b.style.background=ok?"#16241F":"#2a1612";b.style.color=ok?"#3FA796":"#E0654F";b.style.borderColor=ok?"#3FA796":"#C1553B";b.textContent=t;b.style.display="block";clearTimeout(b._t);b._t=setTimeout(()=>b.style.display="none",2200)}
 window.cnEscaner=function(id,o){const el=document.getElementById(id);if(!el||el.dataset.escaner)return;el.dataset.escaner="1";
  el.addEventListener("keydown",e=>{if(e.key!=="Enter")return;const q=el.value.trim();if(q.length<4)return;e.preventDefault();
   const n=dig(q),prods=Object.values(o.cache()||{}),
    hit=prods.find(p=>{const c=dig(o.codigo?o.codigo(p):"");return c&&n&&c===n})||prods.find(p=>p.sku&&low(p.sku)===low(q));
   if(hit){el.value="";el.dispatchEvent(new Event("input"));o.elegir(hit.id);aviso("✔ "+(hit.nombre||"Producto").slice(0,60),!0);try{navigator.vibrate&&navigator.vibrate(30)}catch(x){}}
   else if(n.length>=6&&n===q.replace(/\s/g,""))aviso("Código "+q+" no registrado en tus productos",!1)})};
})();
