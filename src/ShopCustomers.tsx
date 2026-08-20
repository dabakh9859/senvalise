import {useCallback,useEffect,useMemo,useState} from 'react';
import {RefreshCw,Search,TriangleAlert} from 'lucide-react';
import {api,money} from './api';

// Clients du site : uniquement ceux qui ont ouvert un compte en ligne. Les
// clients créés au comptoir restent dans le module Clients de la gestion ; les
// confondre donnerait des chiffres de boutique faux.

type Row={id:number;name:string;phone:string;email:string;zone:string;createdAt:string;addresses:number;
  orders:number;spent:number;lastOrder:string|null;vault:number;consent:boolean};

const shortDate=(value:string|null)=>value?new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(value)):'—';

export default function ShopCustomers(){
  const[rows,setRows]=useState<Row[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[query,setQuery]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setRows(await api<Row[]>('/api/boutique/customers'))}
    catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  const shown=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    if(!needle)return rows;
    return rows.filter(row=>`${row.name} ${row.phone} ${row.email} ${row.zone}`.toLowerCase().includes(needle));
  },[rows,query]);
  const spent=shown.reduce((total,row)=>total+row.spent,0);
  const vault=shown.reduce((total,row)=>total+row.vault,0);

  if(loading&&!rows.length)return <div className="report-loading"><i/><span>Chargement des comptes…</span></div>;
  if(error&&!rows.length)return <div className="report-error"><TriangleAlert/><h2>Comptes injoignables.</h2><p>{error}</p><button className="primary" onClick={()=>void load()}>Réessayer</button></div>;

  return <div className="shop-page">
    <div className="report-toolbar">
      <div className="search shop-search"><Search/><input placeholder="Nom, téléphone, e-mail ou zone…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
      <div className="report-actions">
        <button onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?'spin':''}/><span>Actualiser</span></button>
      </div>
    </div>
    <section className="report-facts">
      <div className="fact"><span>Comptes en ligne</span><strong>{shown.length}</strong><small>sur {rows.length} au total</small></div>
      <div className="fact"><span>Commandé cumulé</span><strong>{money(spent)}</strong><small>hors commandes annulées</small></div>
      <div className="fact"><span>Encours des coffres</span><strong>{money(vault)}</strong><small>épargne déposée sur le site</small></div>
    </section>
    <div className="panel shop-card">
      {shown.length===0?<p className="report-empty">Aucun compte ne correspond.</p>:
      <div className="report-table-wrap"><table className="report-table">
        <thead><tr>
          <th>Client</th><th>Contact</th><th>Zone</th><th className="num">Adresses</th>
          <th className="num">Commandes</th><th className="num">Total commandé</th>
          <th className="num">Coffre</th><th>Dernière commande</th><th>Inscrit le</th><th>WhatsApp</th>
        </tr></thead>
        <tbody>{shown.map(row=>
          <tr key={row.id}>
            <td><b>{row.name}</b></td>
            <td>{row.phone||row.email||'—'}</td>
            <td>{row.zone||'—'}</td>
            <td className="num">{row.addresses}</td>
            <td className="num">{row.orders}</td>
            <td className="num">{money(row.spent)}</td>
            <td className="num">{row.vault?money(row.vault):'—'}</td>
            <td>{shortDate(row.lastOrder)}</td>
            <td>{shortDate(row.createdAt)}</td>
            <td>{row.consent?<span className="state paid">Accepté</span>:<span className="state cancelled">Non</span>}</td>
          </tr>)}</tbody>
      </table></div>}
    </div>
  </div>;
}
