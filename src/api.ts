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
