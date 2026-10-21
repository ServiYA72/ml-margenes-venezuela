import{createClient}from"https://esm.sh/@supabase/supabase-js@2";
const sb=createClient("https://tkhzuopapvclmcgxyood.supabase.co","sb_publishable_KQB6B6uLIPr-xKdNDc8iEw_7tcWM5gS",{auth:{autoRefreshToken:false,persistSession:true}});
(async()=>{try{
 const{data:{session}}=await sb.auth.getSession();if(!session)return;
 const{data,error}=await sb.rpc("credito_cobros",{p_dias:0});if(error||!data)return;
 const venc=data.filter(x=>x.atraso>0).length,hoy=data.filter(x=>x.atraso===0).length,n=venc+hoy;if(!n)return;
 const col=venc?"#C1553B":"#D4A843",txt=`${venc?venc+" cuota(s) vencida(s)":""}${venc&&hoy?" · ":""}${hoy?hoy+" vence(n) hoy":""}`;
 const a=document.querySelector('a[href="creditos.html"]');
 if(a&&!a.querySelector(".cb-n")){const b=document.createElement("span");b.className="cb-n";b.textContent=n;b.style.cssText=`background:${col};color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:8px;font-weight:600`;a.appendChild(b)}
 const h=document.querySelector("header");
 if(h&&!h.querySelector(".cb-bell")){const l=document.createElement("a");l.className="cb-bell";l.href="creditos.html";l.title=txt;l.innerHTML=`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg><span style="position:absolute;top:-6px;right:-8px;background:${col};color:#fff;border-radius:10px;padding:0 6px;font-size:10.5px;font-weight:700">${n}</span>`;l.style.cssText="position:relative;margin-left:auto;color:var(--gold,#D4A843);padding:6px 10px;display:inline-flex";h.appendChild(l)}
}catch(e){}})();
