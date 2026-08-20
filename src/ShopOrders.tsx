import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowRight,FileText,MapPin,Phone,RefreshCw,Search,TriangleAlert,X} from 'lucide-react';
import {api,money} from './api';
import {orderStates} from './ShopOverview';

// Commandes du site. Une commande web n'est pas une ligne de base : elle se
// suit dans un pipeline, puis devient une facture qui sort le stock. Les deux
// gestes vivent ici pour qu'on n'ait pas à ressaisir la vente au comptoir.

type Item={id:number;variantId:number;productName:string;quantity:number;unitPrice:number;total:number};
type Order={id:number;reference:string;createdAt:string;status:string;paymentMethod:string;total:number;
  deliveryFee:number;deliveryZone:string;address:string;saleId:number|null;customerId:number;
  customer:string;phone:string;email:string;items:Item[];units:number;next:string[]};

const methodLabels:Record<string,string>={cash:'Espèces',wave:'Wave',orange_money:'Orange Money',card:'Carte bancaire',credit:'Crédit',bank_transfer:'Virement',vault:'Coffre'};
const longDate=(value:string)=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const shortDate=(value:string)=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(value));
const filters=[
  {id:'all',label:'Toutes'},{id:'pending',label:'En attente'},{id:'processing',label:'En préparation'},
  {id:'shipped',label:'Expédiées'},{id:'delivered',label:'Livrées'},{id:'cancelled',label:'Annulées'},
];

export default function ShopOrders(){
  const[orders,setOrders]=useState<Order[]>([]);
  const[filter,setFilter]=useState('all');
  const[query,setQuery]=useState('');
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[open,setOpen]=useState<Order|null>(null);
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setOrders(await api<Order[]>(`/api/boutique/orders?status=${filter}`))}
    catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[filter]);
  useEffect(()=>{void load()},[load]);

  const shown=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    if(!needle)return orders;
    return orders.filter(order=>`${order.reference} ${order.customer} ${order.phone} ${order.deliveryZone}`.toLowerCase().includes(needle));
  },[orders,query]);

  const refresh=async(id:number)=>{
    const rows=await api<Order[]>(`/api/boutique/orders?status=${filter}`);
    setOrders(rows);
    setOpen(rows.find(order=>order.id===id)??null);
  };
  const move=async(order:Order,status:string)=>{
    setBusy(true);setError('');
    try{await api(`/api/boutique/orders/${order.id}/status`,{method:'POST',body:JSON.stringify({status})});await refresh(order.id);
      setNotice(`${order.reference} : ${orderStates[status]?.label.toLowerCase()??status}`)}
    catch(reason){setError((reason as Error).message)}
    finally{setBusy(false)}
  };
  const invoice=async(order:Order,paid:boolean)=>{
    setBusy(true);setError('');
    try{
      const result=await api<{sale:{reference:string}}>(`/api/boutique/orders/${order.id}/invoice`,{method:'POST',body:JSON.stringify({paid})});
      await refresh(order.id);
      setNotice(`Facture ${result.sale.reference} créée, stock mis à jour.`);
    }catch(reason){setError((reason as Error).message)}
    finally{setBusy(false)}
  };

  if(loading&&!orders.length)return <div className="report-loading"><i/><span>Chargement des commandes…</span></div>;
  if(error&&!orders.length)return <div className="report-error"><TriangleAlert/><h2>Commandes injoignables.</h2><p>{error}</p><button className="primary" onClick={()=>void load()}>Réessayer</button></div>;

  return <div className="shop-page">
    <div className="report-toolbar">
      <div className="report-presets">{filters.map(item=>
        <button key={item.id} className={filter===item.id?'active':''} onClick={()=>setFilter(item.id)}>{item.label}</button>)}
      </div>
      <div className="search shop-search"><Search/><input placeholder="Référence, client, zone…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
      <div className="report-actions">
        <button onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?'spin':''}/><span>Actualiser</span></button>
      </div>
    </div>
    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success shop-notice">{notice}</div>}

    <div className="panel shop-card">
      {shown.length===0?<p className="report-empty">Aucune commande dans cette vue.</p>:
      <div className="report-table-wrap"><table className="report-table">
        <thead><tr>
          <th>Date</th><th>Référence</th><th>Client</th><th>Zone</th><th>Règlement</th>
          <th className="num">Articles</th><th className="num">Total</th><th>Statut</th><th>Facture</th><th/>
        </tr></thead>
        <tbody>{shown.map(order=>
          <tr key={order.id} className={open?.id===order.id?'is-open':''}>
            <td>{shortDate(order.createdAt)}</td>
            <td><b>{order.reference}</b></td>
            <td>{order.customer||'—'}</td>
            <td>{order.deliveryZone||'—'}</td>
            <td>{methodLabels[order.paymentMethod]??order.paymentMethod}</td>
            <td className="num">{order.units}</td>
            <td className="num">{money(order.total)}</td>
            <td><span className={`state ${orderStates[order.status]?.tone??'cancelled'}`}>{orderStates[order.status]?.label??order.status}</span></td>
            <td>{order.saleId?<span className="state paid">Facturée</span>:<span className="state cancelled">—</span>}</td>
            <td><button className="ghost compact" onClick={()=>setOpen(order)}>Ouvrir<ArrowRight/></button></td>
          </tr>)}</tbody>
      </table></div>}
    </div>

    {open&&<div className="overlay" onMouseDown={()=>setOpen(null)}>
      <div className="modal order-modal" onMouseDown={event=>event.stopPropagation()}>
        <div className="modal-head">
          <div><small>COMMANDE WEB</small><h2>{open.reference}</h2></div>
          <button type="button" className="icon" onClick={()=>setOpen(null)}><X/></button>
        </div>
        <div className="order-meta">
          <div><span>Passée le</span><b>{longDate(open.createdAt)}</b></div>
          <div><span>Statut</span><b><span className={`state ${orderStates[open.status]?.tone??'cancelled'}`}>{orderStates[open.status]?.label??open.status}</span></b></div>
          <div><span>Client</span><b>{open.customer||'—'}</b></div>
          <div><span><Phone/>Contact</span><b>{open.phone||open.email||'—'}</b></div>
          <div className="wide"><span><MapPin/>Livraison</span><b>{open.address||'—'}{open.deliveryZone?` · ${open.deliveryZone}`:''}</b></div>
          <div><span>Règlement</span><b>{methodLabels[open.paymentMethod]??open.paymentMethod}</b></div>
        </div>

        <table className="report-table compact">
          <thead><tr><th>Article</th><th className="num">Qté</th><th className="num">Prix</th><th className="num">Total</th></tr></thead>
          <tbody>{open.items.map(item=>
            <tr key={item.id}><td>{item.productName}</td><td className="num">{item.quantity}</td>
              <td className="num">{money(item.unitPrice)}</td><td className="num">{money(item.total)}</td></tr>)}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>Livraison</td><td className="num">{money(open.deliveryFee)}</td></tr>
            <tr><td colSpan={3}>Total commande</td><td className="num">{money(open.total)}</td></tr>
          </tfoot>
        </table>

        <div className="order-actions">
          {open.next.map(status=>
            <button key={status} className={status==='cancelled'?'danger':''} disabled={busy} onClick={()=>void move(open,status)}>
              {status==='cancelled'?'Annuler la commande':`Marquer ${orderStates[status]?.label.toLowerCase()??status}`}
            </button>)}
          {!open.next.length&&<span className="shop-hint">Commande terminée : plus de transition possible.</span>}
        </div>
        <div className="order-invoice">
          {open.saleId
            ?<p className="shop-hint"><FileText/> Déjà facturée — la vente est enregistrée et le stock a été sorti.</p>
            :<>
              <p className="shop-hint"><FileText/> Facturer crée la vente, sort le stock des articles et relie la commande à la facture.</p>
              <div className="order-actions">
                <button disabled={busy||open.status==='cancelled'} onClick={()=>void invoice(open,false)}>Facturer, reste à encaisser</button>
                <button className="primary" disabled={busy||open.status==='cancelled'} onClick={()=>void invoice(open,true)}>Facturer et marquer réglée</button>
              </div>
            </>}
        </div>
      </div>
    </div>}
  </div>;
}
