import {FormEvent,lazy,Suspense,useEffect,useState} from 'react';
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


export default function App(){
  const[user,setUser]=useState<User|null>(null);
  // Le tableau de bord est réservé au gérant : un vendeur ouvre l'application
  // sur la caisse, qui est son poste de travail.
  const[page,setPage]=useState('dashboard');
  // La marque est publique : elle se charge avant la connexion, sinon l'écran
  // de login afficherait un logo générique puis le vrai, après coup.
  const[brand,setBrand]=useState<Brand|null>(null);
  // Pièce à ouvrir en arrivant sur un écran : la caisse s'en sert pour envoyer
  // la gérante sur la facture qu'elle vient d'émettre.
  const[openDocument,setOpenDocument]=useState<{resource:string;id:number}|null>(null);
  useEffect(()=>{api<Brand>('/api/public/branding').then(setBrand).catch(()=>{})},[]);
  useEffect(()=>{if(localStorage.getItem('sv_token'))api<User>('/api/me').then(setUser).catch(()=>localStorage.removeItem('sv_token'))},[]);
  if(!user)return <Login onLogin={setUser} brand={brand}/>;
  const manager=user.role==='manager';
  const home=manager?'dashboard':'pos';
  const requested=allNav.find(item=>item.id===page)??allNav[0];
  // Filet côté écran : une page réservée ne s'ouvre pas, même si son
  // identifiant est forcé. L'API refuse déjà les données correspondantes.
  const current=requested.manager&&!manager?allNav.find(item=>item.id===home)??allNav[0]:requested;
  const view=current.id;
  const logout=()=>{localStorage.removeItem('sv_token');setUser(null)};
  return <div className="app-shell rail-layout">
    <Sidebar user={user} onPage={setPage} onLogout={logout} brand={brand??undefined}/>
    <main className="main-area">
      <TopNavigation user={user} page={page} onPage={setPage}/>
      {view!=='dashboard'&&<header className="page-header"><div><small>ESPACE DE TRAVAIL</small><h1>{current.label}</h1></div>{view==='pos'&&<button className="header-action" onClick={()=>setPage('sales')}><FileText/>Voir les factures</button>}<time>{new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(new Date())}</time></header>}
      <section className={view==='dashboard'?'dashboard-content':'page-content'}><Suspense fallback={<Loading/>}>{view==='dashboard'?<Dashboard/>:view==='pos'?<EnhancedPOS onOpenInvoice={id=>{setOpenDocument({resource:'sales',id});setPage('sales')}}/>:view==='expenses'?<Expenses user={user}/>:view==='checkout-settings'?<CheckoutSettings/>:view==='reports'?<Reports/>:view==='shop-overview'?<ShopOverview onPage={setPage}/>:view==='shop-orders'?<ShopOrders/>:view==='shop-catalog'?<ShopCatalog/>:view==='shop-customers'?<ShopCustomers/>:view==='shop-delivery'?<ShopDelivery/>:view==='messaging'?<Messaging/>:view==='campaigns'?<Campaigns/>:view==='debts'?<Debts/>:view==='vaults'?<Vaults/>:view==='branding'?<Branding/>:current.resource?<ResourcePage title={current.label} resource={current.resource} user={user} openId={openDocument?.resource===current.resource?openDocument.id:undefined} onOpened={()=>setOpenDocument(null)}/>:null}</Suspense></section>
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
