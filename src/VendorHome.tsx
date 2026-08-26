import {useCallback,useEffect,useState} from 'react';
import {ArrowRight,CheckCircle2,Package,Receipt,RefreshCw,ShoppingBag,TriangleAlert,WalletCards} from 'lucide-react';
import {api,money} from './api';
import type {User} from './Sidebar';

// L'accueil du vendeur.
//
// Il ouvrait l'application directement sur la caisse — ce qui est juste, c'est
// son poste — mais rien ne lui disait ce qu'il restait à faire : une caisse
// laissée ouverte la veille, un client à relancer, un produit en rupture qu'il
// proposera pour rien.
//
// Cet écran est le sien et n'est que le sien : le gérant garde son tableau de
// bord d'analyse, intact. Ni bénéfice, ni coût d'achat, ni chiffre d'affaires
// de la boutique — il n'y a pas accès, et ce serait autant une fuite qu'un
// bruit. Il voit ce sur quoi il agit.

type Task={key:string;text:string;action:string;cta:string;tone:string};
type Cash={open:boolean;id?:number;expected?:number;opening?:number;openedAt?:string};
type Payload={sales:number;units:number;collected:number;cash:Cash;tasks:Task[]};

const hour=(iso?:string)=>iso?new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'';
// « Bonsoir » à 20 h vaut mieux qu'un titre figé qui sonne faux la moitié du
// temps.
const greeting=()=>{const h=new Date().getHours();return h<12?'Bonjour':h<18?'Bon après-midi':'Bonsoir'};
const today=()=>new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());

export default function VendorHome({user,onPage}:{user:User;onPage:(id:string)=>void}){
  const[data,setData]=useState<Payload|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setData(await api<Payload>('/api/vendor-home'))}
    catch(problem){setError((problem as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  if(loading&&!data)return <div className="loading"><i/><span>Un instant…</span></div>;
  if(error&&!data)return <div className="panel error">{error}</div>;
  if(!data)return null;

  return <div className="home">
    <header className="home-head">
      <div><h1>{greeting()}, {String(user.name).split(' ')[0]}</h1><p>{today()}</p></div>
      <button className="refresh-button" onClick={()=>void load()} disabled={loading}>
        <RefreshCw className={loading?'spin':''}/><span>Actualiser</span></button>
    </header>

    {/* Les raccourcis d'abord : neuf fois sur dix, on ouvre l'application pour
        faire une de ces choses, pas pour lire un chiffre. */}
    <section className="home-actions">
      <button className="home-action primary" onClick={()=>onPage('pos')}><ShoppingBag/><span><b>Nouvelle vente</b><small>encaisser un client</small></span></button>
      <button className="home-action" onClick={()=>onPage('cash-sessions')}><WalletCards/><span><b>{data.cash.open?'Ma caisse':'Ouvrir la caisse'}</b><small>{data.cash.open?`${money(data.cash.expected??0)} attendus · ouverte à ${hour(data.cash.openedAt)}`:'fond de caisse du matin'}</small></span></button>
      <button className="home-action" onClick={()=>onPage('expenses')}><Receipt/><span><b>Enregistrer une dépense</b><small>eau, courant, livreur…</small></span></button>
      <button className="home-action" onClick={()=>onPage('products')}><Package/><span><b>Produits</b><small>stock et catalogue</small></span></button>
    </section>

    <section className="home-figures">
      <h2>Ma journée</h2>
      <div>
        <article className="home-figure tone-neutral">
          <small>MES VENTES AUJOURD’HUI</small><strong>{data.sales}</strong>
          <span>{data.units<=1?`${data.units} article vendu`:`${data.units} articles vendus`}</span>
        </article>
        <article className={`home-figure tone-${data.collected?'good':'neutral'}`}>
          <small>ENCAISSÉ PAR MOI</small><strong>{money(data.collected)}</strong>
          <span>les règlements que vous avez enregistrés</span>
        </article>
        {data.cash.open&&<article className="home-figure tone-neutral">
          <small>DANS MA CAISSE</small><strong>{money(data.cash.expected??0)}</strong>
          <span>montant attendu à la clôture</span>
        </article>}
      </div>
    </section>

    <section className="panel home-tasks">
      <h2>{data.tasks.length?'À faire':'Tout est en ordre'}</h2>
      {data.tasks.length===0
        ?<p className="home-allgood"><CheckCircle2/>Rien ne demande votre attention en ce moment.</p>
        :<ul>{data.tasks.map(task=><li key={task.key} className={`tone-${task.tone}`}>
          <TriangleAlert/><span>{task.text}</span>
          <button onClick={()=>onPage(task.action)}>{task.cta}<ArrowRight/></button>
        </li>)}</ul>}
    </section>
  </div>;
}
