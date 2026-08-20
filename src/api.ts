const base=import.meta.env.VITE_API_URL??'';
export type Entity=Record<string,unknown>&{id:number;createdAt?:string};
export const token=()=>localStorage.getItem('sv_token');
export async function api<T=unknown>(path:string,init:RequestInit={}):Promise<T>{const r=await fetch(base+path,{...init,headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{...{}}),...init.headers}});if(r.status===204)return undefined as T;const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error??`Erreur ${r.status}`);return data}
export async function apiForm<T=unknown>(path:string,body:FormData):Promise<T>{const r=await fetch(base+path,{method:'POST',body,headers:{...(token()?{Authorization:`Bearer ${token()}`}:{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error??`Erreur ${r.status}`);return data}
export const money=(n:unknown)=>new Intl.NumberFormat('fr-FR').format(Number(n??0))+' F';
