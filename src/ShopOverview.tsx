import {useCallback,useEffect,useState} from 'react';
import {ArrowRight,Boxes,RefreshCw,ShoppingCart,TriangleAlert,Users,WalletCards} from 'lucide-react';
import {api,money} from './api';

// Vue d'ensemble de la boutique en ligne : ce qui attend une action, et l'état
// de la vitrine. Le tableau de bord général mélange comptoir et web ; ici on ne
// regarde que le site.

type StatusCount={status:string;count:number;amount:number};
type Named={name:string;count:number;value:number};
type OrderLine={id:number;reference:string;status:string;total:number;createdAt:string;deliveryZone:string};
type Overview={
  statuses:StatusCount[];
  orders:{month:number;revenue:number;today:number;toProcess:number;basket:number;toInvoice:number};
  catalog:{online:number;offline:number;empty:number;featured:number};
  customers:{accounts:number;new:number;vaults:number;vaultBalance:number};
  messages:number;top:Named[];zones:Named[];recent:OrderLine[];
};

export const orderStates:Record<string,{label:string;tone:string}>={
  pending:{label:'En attente',tone:'pending'},
  processing:{label:'En préparation',tone:'partial'},
  shipped:{label:'Expédiée',tone:'partial'},
  delivered:{label:'Livrée',tone:'paid'},
  cancelled:{label:'Annulée',tone:'cancelled'},
};
const shortDate=(value:string)=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(value));

export default function ShopOverview({onPage}:{onPage:(id:string)=>void}){
  const[data,setData]=useState<Overview|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setData(await api<Overview>('/api/boutique/overview'))}
    catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  if(!data&&loading)return <div className="report-loading"><i/><span>Lecture de la boutique…</span></div>;
  if(!data)return <div className="report-error"><TriangleAlert/><h2>Boutique injoignable.</h2><p>{error}</p><button className="primary" onClick={()=>void load()}>Réessayer</button></div>;

  const byStatus=(status:string)=>data.statuses.find(row=>row.status===status)?.count??0;
  return <div className="shop-page">
    <div className="report-toolbar no-print">
      <strong className="shop-title">Boutique en ligne</strong>
      <div className="report-actions">
        <button onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?'spin':''}/><span>Actualiser</span></button>
      </div>
    </div>

    <section className="report-facts">
      <Action label="Commandes à traiter" value={String(data.orders.toProcess)} note="en attente ou en préparation" tone={data.orders.toProcess?'warn':undefined} onClick={()=>onPage('shop-orders')}/>
      <Action label="À facturer" value={String(data.orders.toInvoice)} note="expédiées sans facture" tone={data.orders.toInvoice?'warn':undefined} onClick={()=>onPage('shop-orders')}/>
      <Action label="Commandes aujourd’hui" value={String(data.orders.today)} note={`${data.orders.month} sur 30 jours`} onClick={()=>onPage('shop-orders')}/>
      <Action label="Chiffre d’affaires web" value={money(data.orders.revenue)} note={`panier moyen ${money(data.orders.basket)} · 30 jours`}/>
      <Action label="Messages en attente" value={String(data.messages)} note="formulaire de contact" tone={data.messages?'warn':undefined} onClick={()=>onPage('contacts')}/>
    </section>

    <div className="shop-columns">
      <section className="panel shop-card">
        <h2>Suivi des commandes</h2>
        <div className="pipeline">
          {['pending','processing','shipped','delivered','cancelled'].map(status=>
            <button key={status} className="pipeline-step" onClick={()=>onPage('shop-orders')}>
              <span className={`state ${orderStates[status].tone}`}>{orderStates[status].label}</span>
              <strong>{byStatus(status)}</strong>
            </button>)}
        </div>
        <h3>Dernières commandes</h3>
        {data.recent.length===0?<p className="report-empty">Aucune commande pour l’instant.</p>:
        <table className="report-table compact"><tbody>{data.recent.map(order=>
          <tr key={order.id}>
            <td>{shortDate(order.createdAt)}</td>
            <td>{order.reference}</td>
            <td>{order.deliveryZone||'—'}</td>
            <td><span className={`state ${orderStates[order.status]?.tone??'cancelled'}`}>{orderStates[order.status]?.label??order.status}</span></td>
            <td className="num">{money(order.total)}</td>
          </tr>)}</tbody></table>}
        <button className="shop-link" onClick={()=>onPage('shop-orders')}>Ouvrir les commandes<ArrowRight/></button>
      </section>

      <section className="panel shop-card">
        <h2>État de la vitrine</h2>
        <ul className="shop-stats">
          <li><Boxes/><span>Produits en ligne</span><b>{data.catalog.online}</b></li>
          <li><Boxes/><span>Hors ligne</span><b>{data.catalog.offline}</b></li>
          <li className={data.catalog.empty?'alert':''}><TriangleAlert/><span>En vitrine sans stock</span><b>{data.catalog.empty}</b></li>
          <li><ShoppingCart/><span>Mis en avant</span><b>{data.catalog.featured}</b></li>
        </ul>
        <button className="shop-link" onClick={()=>onPage('shop-catalog')}>Gérer le catalogue en ligne<ArrowRight/></button>
        <h3>Clients du site</h3>
        <ul className="shop-stats">
          <li><Users/><span>Comptes</span><b>{data.customers.accounts}</b></li>
          <li><Users/><span>Nouveaux (30 j)</span><b>{data.customers.new}</b></li>
          <li><WalletCards/><span>Coffres ouverts</span><b>{data.customers.vaults}</b></li>
          <li><WalletCards/><span>Encours des coffres</span><b>{money(data.customers.vaultBalance)}</b></li>
        </ul>
        <button className="shop-link" onClick={()=>onPage('shop-customers')}>Voir les clients<ArrowRight/></button>
      </section>
    </div>

    <div className="shop-columns">
      <Ranking title="Produits les plus commandés" subtitle="30 derniers jours" rows={data.top} unit="vendus"/>
      <Ranking title="Zones de livraison" subtitle="30 derniers jours" rows={data.zones} unit="commandes"/>
    </div>
  </div>;
}

function Ranking({title,subtitle,rows,unit}:{title:string;subtitle:string;rows:Named[];unit:string}){
  const max=rows.reduce((top,row)=>Math.max(top,row.value),0);
  return <section className="panel shop-card">
    <h2>{title}<em>{subtitle}</em></h2>
    {rows.length===0?<p className="report-empty">Rien à afficher sur la période.</p>:
    <ul className="shop-ranking">{rows.map(row=>
      <li key={row.name}>
        <span>{row.name}</span>
        <i style={{width:`${max?Math.round(row.value/max*100):0}%`}}/>
        <small>{row.count} {unit}</small>
        <b>{money(row.value)}</b>
      </li>)}</ul>}
  </section>;
}

function Action({label,value,note,tone,onClick}:{label:string;value:string;note:string;tone?:string;onClick?:()=>void}){
  const content=<><span>{label}</span><strong>{value}</strong><small>{note}</small></>;
  if(!onClick)return <div className={`fact ${tone??''}`.trim()}>{content}</div>;
  return <button type="button" className={`fact clickable ${tone??''}`.trim()} onClick={onClick}>{content}</button>;
}
