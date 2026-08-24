import {FormEvent,lazy,Suspense,useCallback,useEffect,useState} from 'react';
import {FileText} from 'lucide-react';
import {api} from './api';
import Sidebar,{allNav,type Brand,User} from './Sidebar';
import ResourcePage from './ResourcePage';
import TopNavigation from './TopNavigation';
import EnhancedPOS from './POS';
import CheckoutSettings from './CheckoutSettings';

const Dashboard=lazy(()=>import('./Dashboard'));
const Expenses=lazy(()=>import('./Expenses'));
const Reports=lazy(()=>import('./Reports'));
const ShopOverview=lazy(()=>import('./ShopOverview'));
const ShopOrders=lazy(()=>import('./ShopOrders'));
const ShopCatalog=lazy(()=>import('./ShopCatalog'));
const ShopCustomers=lazy(()=>import('./ShopCustomers'));
const ShopDelivery=lazy(()=>import('./ShopDelivery'));
const Messaging=lazy(()=>import('./Messaging'));
const Campaigns=lazy(()=>import('./Campaigns'));
const Debts=lazy(()=>import('./Debts'));
const Vaults=lazy(()=>import('./Vaults'));
const Branding=lazy(()=>import('./Branding'));
const Journal=lazy(()=>import('./Journal'));
const Cash=lazy(()=>import('./Cash'));


// pageFromUrl lit l'écran demandé dans l'adresse. Une adresse inconnue — un
// favori d'une ancienne version, une faute de frappe — rend une chaîne vide :
// l'application choisit alors l'accueil du rôle plutôt que d'afficher une page
// blanche.
function pageFromUrl(){
  const id=window.location.pathname.replace(/^\/+|\/+$/g,'');
  return allNav.some(item=>item.id===id)?id:'';
}

export default function App(){
  const[user,setUser]=useState<User|null>(null);
  // Le tableau de bord est réservé au gérant : un vendeur ouvre l'application
  // sur la caisse, qui est son poste de travail.
  // L'écran ouvert vit dans l'adresse. Il n'y était pas : actualiser la page
  // ramenait systématiquement au tableau de bord, on ne pouvait ni mettre un
  // écran en favori ni l'envoyer à un collègue, et le bouton Retour du
  // navigateur sortait de l'application.
  //
  // Pas de bibliothèque de routage pour autant : l'identifiant d'écran sert
  // directement de chemin, et il n'existe donc aucune table de correspondance
  // à tenir à jour quand un écran est ajouté.
  const[page,setPageState]=useState(pageFromUrl);
  const setPage=useCallback((id:string)=>{
    setPageState(id);
    if(pageFromUrl()!==id)window.history.pushState({page:id},'',`/${id}`);
  },[]);
  // Retour et Suivant du navigateur : l'adresse mène, l'écran suit.
  useEffect(()=>{
    const onPop=()=>setPageState(pageFromUrl());
    window.addEventListener('popstate',onPop);
    return()=>window.removeEventListener('popstate',onPop);
  },[]);
  // La marque est publique : elle se charge avant la connexion, sinon l'écran
  // de login afficherait un logo générique puis le vrai, après coup.
  const[brand,setBrand]=useState<Brand|null>(null);
  // Pièce à ouvrir en arrivant sur un écran : la caisse s'en sert pour envoyer
  // la gérante sur la facture qu'elle vient d'émettre.
  const[openDocument,setOpenDocument]=useState<{resource:string;id:number}|null>(null);
  useEffect(()=>{api<Brand>('/api/public/branding').then(setBrand).catch(()=>{})},[]);
  useEffect(()=>{if(localStorage.getItem('sv_token'))api<User>('/api/me').then(setUser).catch(()=>localStorage.removeItem('sv_token'))},[]);
  const manager=user?.role==='manager';
  // L'accueil est le même pour les deux rôles : le serveur y répond
  // différemment — le vendeur y voit sa caisse et ses ventes du jour, pas le
  // bénéfice de la boutique. Il ouvrait auparavant directement sur la caisse,
  // et n'avait donc aucun écran lui disant ce qu'il restait à faire.
  const home='dashboard';
  const requested=allNav.find(item=>item.id===page)??allNav.find(item=>item.id===home)??allNav[0];
  // Filet côté écran : une page réservée ne s'ouvre pas, même si son
  // identifiant est forcé. L'API refuse déjà les données correspondantes.
  const current=requested.manager&&!manager?allNav.find(item=>item.id===home)??allNav[0]:requested;
  const view=current.id;
  // L'adresse suit l'écran réellement affiché. Deux cas la font diverger :
  // arriver sur « / », et un vendeur qui force une adresse réservée au gérant.
  // Sans cette remise en accord, actualiser renverrait ailleurs que là où l'on
  // se trouve — le défaut même qu'on corrige.
  useEffect(()=>{
    if(!user)return;
    if(pageFromUrl()!==view)window.history.replaceState({page:view},'',`/${view}`);
    document.title=`${current.label} · SenValise`;
  },[user,view,current.label]);

  if(!user)return <Login onLogin={setUser} brand={brand}/>;
  const logout=()=>{localStorage.removeItem('sv_token');setUser(null)};
  return <div className="app-shell rail-layout">
    <Sidebar user={user} onPage={setPage} onLogout={logout} brand={brand??undefined}/>
    <main className="main-area">
      <TopNavigation user={user} page={page} onPage={setPage}/>
      {view!=='dashboard'&&<header className="page-header"><div><small>ESPACE DE TRAVAIL</small><h1>{current.label}</h1></div>{view==='pos'&&<button className="header-action" onClick={()=>setPage('sales')}><FileText/>Voir les factures</button>}<time>{new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(new Date())}</time></header>}
      <section className={view==='dashboard'?'dashboard-content':'page-content'}><Suspense fallback={<Loading/>}>{view==='dashboard'?<Dashboard user={user} onPage={setPage}/>:view==='pos'?<EnhancedPOS onOpenInvoice={id=>{setOpenDocument({resource:'sales',id});setPage('sales')}}/>:view==='expenses'?<Expenses user={user}/>:view==='checkout-settings'?<CheckoutSettings/>:view==='reports'?<Reports/>:view==='shop-overview'?<ShopOverview onPage={setPage}/>:view==='shop-orders'?<ShopOrders/>:view==='shop-catalog'?<ShopCatalog/>:view==='shop-customers'?<ShopCustomers/>:view==='shop-delivery'?<ShopDelivery/>:view==='messaging'?<Messaging/>:view==='campaigns'?<Campaigns/>:view==='debts'?<Debts/>:view==='vaults'?<Vaults/>:view==='branding'?<Branding/>:view==='journal'?<Journal onPage={setPage}/>:view==='cash-sessions'?<Cash/>:current.resource?<ResourcePage title={current.label} resource={current.resource} user={user} openId={openDocument?.resource===current.resource?openDocument.id:undefined} onOpened={()=>setOpenDocument(null)}/>:null}</Suspense></section>
    </main>
  </div>;
}

function Login({onLogin,brand}:{onLogin:(user:User)=>void;brand:Brand|null}){
  // Les identifiants de demonstration etaient pre-remplis : pratique en
  // demo, mais ils partaient tels quels en production.
  const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[error,setError]=useState('');
  const submit=async(event:FormEvent)=>{event.preventDefault();setError('');try{const result=await api<{token:string;user:User}>('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('sv_token',result.token);onLogin(result.user)}catch(reason){setError((reason as Error).message)}};
  return <div className="login-screen"><form onSubmit={submit}><div className="login-brand">{brand?.logoUrl?<img src={brand.logoUrl} alt=""/>:<span>{(brand?.siteName??'SenValise').slice(0,2).toUpperCase()}</span>}<strong>{brand?.siteName??'SenValise'}</strong></div><h1>Connexion</h1><p>Accédez à votre espace de gestion.</p><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Mot de passe<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<div className="error">{error}</div>}<button className="primary" type="submit">Se connecter</button></form></div>;
}

function Loading(){return <div className="loading"><i/><span>Chargement…</span></div>}
