const base=import.meta.env.VITE_API_URL??'';
export type Entity=Record<string,unknown>&{id:number;createdAt?:string};
export const token=()=>localStorage.getItem('sv_token');
export async function api<T=unknown>(path:string,init:RequestInit={}):Promise<T>{const r=await fetch(base+path,{...init,headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{...{}}),...init.headers}});if(r.status===204)return undefined as T;const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error??`Erreur ${r.status}`);return data}
export async function apiForm<T=unknown>(path:string,body:FormData):Promise<T>{const r=await fetch(base+path,{method:'POST',body,headers:{...(token()?{Authorization:`Bearer ${token()}`}:{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error??`Erreur ${r.status}`);return data}
export const money=(n:unknown)=>new Intl.NumberFormat('fr-FR').format(Number(n??0))+' F';

// apiPage lit une page de résultats et le total renvoyé par le serveur.
// Sans ce total, l'écran ne peut pas savoir qu'il reste des lignes à charger.
export async function apiPage<T=unknown>(path:string):Promise<{rows:T[];total:number}>{const r=await fetch(base+path,{headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})}});const data=await r.json().catch(()=>([]));if(!r.ok)throw new Error((data as{error?:string}).error??`Erreur ${r.status}`);const rows=(Array.isArray(data)?data:[]) as T[];const header=r.headers.get('X-Total-Count');return{rows,total:header?Number(header):rows.length}}

// apiFile récupère un binaire protégé — un PDF de facture, par exemple. Un
// simple lien <a href="/api/..."> ne porterait pas le jeton : le navigateur
// n'ajoute pas d'en-tête Authorization, et le serveur répondrait 401. On passe
// donc par fetch, puis par une URL d'objet que l'onglet peut ouvrir.
export async function apiFile(path:string):Promise<string>{const r=await fetch(base+path,{headers:{...(token()?{Authorization:`Bearer ${token()}`}:{})}});if(!r.ok){const data=await r.json().catch(()=>({}));throw new Error((data as{error?:string}).error??`Erreur ${r.status}`)}return URL.createObjectURL(await r.blob())}

// openFile ouvre le binaire dans un nouvel onglet et libère l'URL d'objet une
// fois l'onglet servi : sans révocation, chaque aperçu garderait le fichier en
// mémoire jusqu'au rechargement de l'application.
export async function openFile(path:string):Promise<void>{const url=await apiFile(path);window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),60000)}

// printFile ouvre la boîte d'impression du navigateur sur un PDF protégé.
//
// Un lien vers /api/... ne porterait pas le jeton, et window.print() imprime la
// page affichée, pas un fichier. On récupère donc le PDF par fetch, on le pose
// dans un cadre invisible, et on demande l'impression de ce cadre : le vendeur
// obtient la boîte d'impression sans quitter la caisse.
//
// Le repli compte : certains navigateurs — Safari en tête — refusent
// d'imprimer un PDF logé dans un cadre. Le fichier s'ouvre alors dans un
// onglet, où la visionneuse offre son propre bouton d'impression. Mieux vaut
// un clic de plus qu'un bouton qui ne fait rien.
export async function printFile(path:string):Promise<void>{
  const url=await apiFile(path);
  const frame=document.createElement('iframe');
  frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  let done=false;
  const fallback=()=>{if(done)return;done=true;window.open(url,'_blank','noopener,noreferrer')};
  frame.onload=()=>{
    try{
      const view=frame.contentWindow;
      if(!view)throw new Error('cadre indisponible');
      view.focus();view.print();
      done=true;
    }catch{fallback()}
  };
  frame.onerror=fallback;
  document.body.appendChild(frame);
  // Si le cadre n'a pas chargé en cinq secondes, on n'attend pas davantage.
  setTimeout(fallback,5000);
  // Le cadre et l'URL d'objet sont libérés une fois la boîte d'impression
  // servie ; les retirer plus tôt annulerait l'impression en cours.
  setTimeout(()=>{frame.remove();URL.revokeObjectURL(url)},120000);
}
