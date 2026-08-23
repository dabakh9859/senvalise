import {useCallback,useEffect,useState} from 'react';
import {AlertTriangle,ArrowDownToLine,ArrowUpFromLine,BellRing,Box,Megaphone,MessageSquare,Package,Receipt,RefreshCw,ShoppingBag,ShoppingCart,Trash2,WalletCards} from 'lucide-react';
import {api,money} from './api';

// Journal de l'activité — la page que le gérant ouvre pour savoir ce qui s'est
// passé.
//
// Elle est écrite pour quelqu'un qui n'est pas à l'aise avec un ordinateur :
// pas de tableau à colonnes, pas de filtre à combiner, pas de vocabulaire
// technique. Trois boutons de période, quatre chiffres, et un fil de phrases
// groupées par jour — « Aujourd'hui », « Hier », puis la date.
//
// Ce qui demande une action est séparé du reste et placé en tête : une rupture
// de stock ou un impayé ne se découvrent pas en faisant défiler une liste.

type Event={at:string;kind:string;who:string;what:string;detail:string;amount:number;tone:string};
type Payload={
  days:number;
  summary:{sales:number;revenue:number;collected:number;expenses:number;returns:number;customers:number};
  attention:{outOfStock:number;lowStock:number;debtors:number;due:number;failedMessages:number;pendingOrders:number};
  events:Event[];
};

const icons:Record<string,typeof Box>={
  sale:ShoppingBag,payment:ArrowDownToLine,return:ArrowUpFromLine,expense:Receipt,
  stock:Package,'cash-open':WalletCards,'cash-close':WalletCards,vault:WalletCards,
  order:ShoppingCart,message:MessageSquare,delete:Trash2,campaign:Megaphone,
};

const periods=[{days:1,label:'Aujourd’hui'},{days:7,label:'7 derniers jours'},{days:30,label:'30 derniers jours'}];

// Les dates parlées valent mieux qu'un calendrier : personne ne compte les
// jours pour savoir si « 21 août » était hier.
const dayLabel=(iso:string)=>{
  const date=new Date(iso);
  const today=new Date();const yesterday=new Date();yesterday.setDate(today.getDate()-1);
  const same=(a:Date,b:Date)=>a.toDateString()===b.toDateString();
  if(same(date,today))return 'Aujourd’hui';
  if(same(date,yesterday))return 'Hier';
  return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(date);
};
const hour=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(iso));

export default function Journal({onPage}:{onPage:(id:string)=>void}){
  const[data,setData]=useState<Payload|null>(null);
  const[days,setDays]=useState(1);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');

  const load=useCallback(async(period:number)=>{
    setLoading(true);setError('');
    try{setData(await api<Payload>(`/api/journal?days=${period}`))}
    catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load(days)},[load,days]);

  if(loading&&!data)return <div className="loading"><i/><span>Lecture de l’activité…</span></div>;
  if(error)return <div className="panel error">{error}</div>;
  if(!data)return null;

  // Les alertes ne sont montrées que lorsqu'elles existent : un bandeau
  // toujours présent finit par ne plus être lu.
  const alerts=[
    data.attention.outOfStock>0&&{key:'stock',label:`${data.attention.outOfStock} produit${data.attention.outOfStock>1?'s':''} en rupture de stock`,action:'products',cta:'Voir les produits'},
    data.attention.lowStock>0&&{key:'low',label:`${data.attention.lowStock} produit${data.attention.lowStock>1?'s':''} bientôt en rupture`,action:'products',cta:'Voir les produits'},
    data.attention.debtors>0&&{key:'debt',label:`${data.attention.debtors} client${data.attention.debtors>1?'s doivent':' doit'} encore ${money(data.attention.due)}`,action:'debts',cta:'Voir les créances'},
    data.attention.pendingOrders>0&&{key:'order',label:`${data.attention.pendingOrders} commande${data.attention.pendingOrders>1?'s':''} du site à traiter`,action:'shop-orders',cta:'Voir les commandes'},
    data.attention.failedMessages>0&&{key:'msg',label:`${data.attention.failedMessages} message${data.attention.failedMessages>1?'s ne sont pas partis':' n’est pas parti'}`,action:'messages',cta:'Voir les messages'},
  ].filter(Boolean) as {key:string;label:string;action:string;cta:string}[];

  // Regroupement par jour : le fil se lit comme un cahier.
  const groups:{day:string;events:Event[]}[]=[];
  for(const event of data.events){
    const label=dayLabel(event.at);
    const last=groups[groups.length-1];
    if(last&&last.day===label)last.events.push(event);
    else groups.push({day:label,events:[event]});
  }

  const period=periods.find(item=>item.days===days)?.label??'';
  return <div className="journal-page">
    <section className="panel journal-head">
      <div><h2>Ce qui s’est passé</h2><p>{period.toLowerCase()}</p></div>
      <div className="journal-periods">
        {periods.map(item=><button key={item.days} className={item.days===days?'active':''} onClick={()=>setDays(item.days)}>{item.label}</button>)}
        <button className="journal-refresh" onClick={()=>void load(days)} aria-label="Actualiser"><RefreshCw/></button>
      </div>
    </section>

    {alerts.length>0&&<section className="panel journal-alerts">
      <h3><AlertTriangle/>À regarder</h3>
      <ul>{alerts.map(alert=><li key={alert.key}>
        <span>{alert.label}</span>
        <button onClick={()=>onPage(alert.action)}>{alert.cta}</button>
      </li>)}</ul>
    </section>}

    <div className="journal-figures">
      <div className="panel figure"><small>ARGENT ENCAISSÉ</small><strong>{money(data.summary.collected)}</strong><span>règlements reçus</span></div>
      <div className="panel figure"><small>VENTES</small><strong>{data.summary.sales}</strong><span>pour {money(data.summary.revenue)}</span></div>
      <div className="panel figure"><small>DÉPENSES</small><strong>{money(data.summary.expenses)}</strong><span>sorties d’argent</span></div>
      <div className="panel figure"><small>NOUVEAUX CLIENTS</small><strong>{data.summary.customers}</strong><span>fiches créées</span></div>
    </div>

    <section className="panel journal-feed">
      {groups.length===0
        ?<p className="empty">Rien ne s’est passé sur cette période.</p>
        :groups.map(group=><div className="journal-day" key={group.day}>
          <h3>{group.day}</h3>
          <ul>{group.events.map((event,index)=>{
            const Icon=icons[event.kind]??BellRing;
            return <li className={`journal-event tone-${event.tone}`} key={`${event.at}-${index}`}>
              <span className="journal-time">{hour(event.at)}</span>
              <span className="journal-icon"><Icon/></span>
              <span className="journal-text">
                <strong>{event.what}</strong>
                {event.detail&&<small>{event.detail}</small>}
              </span>
              <span className="journal-amount">{event.amount?money(event.amount):''}</span>
              <span className="journal-who">{event.who!=='—'?event.who:''}</span>
            </li>;
          })}</ul>
        </div>)}
    </section>
  </div>;
}
