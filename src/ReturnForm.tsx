import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,PackageCheck,Search} from 'lucide-react';
import Modal from './Modal';
import {api,money} from './api';
import type {CheckoutConfig} from './CheckoutSettings';

// Enregistrer un retour, comme il se passe au comptoir.
//
// L'ancien formulaire demandait un identifiant de facture, un identifiant de
// déclinaison, une quantité et un montant de remboursement — quatre nombres
// que personne n'a en tête quand une cliente repose une valise sur le
// comptoir. Le montant surtout se calcule au prorata de la ligne : il était
// tapé de mémoire, et le serveur refusait.
//
// L'écran suit désormais le geste réel : on cherche la facture par son numéro
// ou par le nom de la cliente, on voit ses articles, on coche ce qui revient,
// on ajuste la quantité si elle ne revient qu'en partie. Le remboursement se
// calcule tout seul et reste modifiable à la baisse — un article rendu abîmé
// n'est pas toujours remboursé en entier.

type SaleRow={id:number;reference:string;customer:string;createdAt:string;total:number;paid:number;status:string;itemsCount:number};
type Line={variantId:number;name:string;detail:string;sold:number;returned:number;remaining:number;unitPrice:number;maxRefund:number;lineTotal:number;refunded:number};
type Detail={id:number;reference:string;customer:string;paid:number;refunded:number;refundable:number;lines:Line[]};
type Picked={quantity:number;amount:string};

const reasons=['Article défectueux','Ne convient pas','Erreur de commande','Article non conforme'];
const day=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(iso));

export default function ReturnForm({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
  const[query,setQuery]=useState('');
  const[sales,setSales]=useState<SaleRow[]>([]);
  const[searching,setSearching]=useState(true);
  const[detail,setDetail]=useState<Detail|null>(null);
  const[picked,setPicked]=useState<Record<number,Picked>>({});
  const[reason,setReason]=useState(reasons[0]);
  const[restock,setRestock]=useState(true);
  const[method,setMethod]=useState('');
  const[methods,setMethods]=useState<{id:string;label:string}[]>([]);
  const[error,setError]=useState('');
  const[saving,setSaving]=useState(false);
  const searchBox=useRef<HTMLInputElement>(null);

  useEffect(()=>{searchBox.current?.focus()},[]);
  useEffect(()=>{
    api<CheckoutConfig>('/api/checkout-settings')
      .then(config=>setMethods(config.paymentMethods.filter(item=>item.active).map(({id,label})=>({id,label}))))
      .catch(()=>{/* la liste sert de confort : sans elle, le retour suit le moyen de la facture */});
  },[]);

  // La recherche attend une pause de frappe : sans cela, chaque lettre part au
  // serveur et les réponses reviennent dans le désordre.
  useEffect(()=>{
    if(detail)return;
    const timer=setTimeout(()=>{
      setSearching(true);
      api<SaleRow[]>(`/api/returns/sales/search?q=${encodeURIComponent(query)}`)
        .then(setSales).catch(problem=>setError((problem as Error).message)).finally(()=>setSearching(false));
    },query?250:0);
    return()=>clearTimeout(timer);
  },[query,detail]);

  const openSale=useCallback(async(id:number)=>{
    setError('');
    try{
      const loaded=await api<Detail>(`/api/returns/lines/${id}`);
      setDetail(loaded);setPicked({});
    }catch(problem){setError((problem as Error).message)}
  },[]);

  const toggle=(line:Line)=>setPicked(current=>{
    const next={...current};
    if(next[line.variantId])delete next[line.variantId];
    // Cocher, c'est rendre tout ce qui reste : c'est le cas courant, et la
    // quantité se corrige juste à côté quand ce n'en est qu'une partie.
    else next[line.variantId]={quantity:line.remaining,amount:String(line.maxRefund)};
    return next;
  });

  // Changer la quantité rebascule le remboursement au prorata : le vendeur
  // n'a pas à faire la règle de trois, et le serveur la refait à l'identique.
  const setQuantity=(line:Line,quantity:number)=>setPicked(current=>{
    const clamped=Math.max(1,Math.min(line.remaining,quantity||1));
    return {...current,[line.variantId]:{quantity:clamped,amount:String(Math.floor(line.maxRefund*clamped/(line.remaining||1)))}};
  });

  const lines=detail?.lines??[];
  const chosen=lines.filter(line=>picked[line.variantId]);
  const refund=chosen.reduce((sum,line)=>sum+(Number(picked[line.variantId].amount)||0),0);
  const tooMuch=detail?refund>detail.refundable:false;

  const submit=async()=>{
    if(!detail||chosen.length===0)return;
    setSaving(true);setError('');
    try{
      await api('/api/returns/process',{method:'POST',body:JSON.stringify({
        saleId:detail.id,reason,restock,refundMethod:method,
        items:chosen.map(line=>({variantId:line.variantId,quantity:picked[line.variantId].quantity,amount:Number(picked[line.variantId].amount)||0})),
      })});
      onSaved();onClose();
    }catch(problem){setError((problem as Error).message)}
    finally{setSaving(false)}
  };

  const footer=detail?<>
    <div className="return-total">
      <small>À REMBOURSER</small>
      <strong className={tooMuch?'over':''}>{money(refund)}</strong>
      {tooMuch&&<span>Cette facture n’a encaissé que {money(detail.refundable)} remboursables.</span>}
    </div>
    <button type="button" onClick={onClose}>Annuler</button>
    <button className="primary" type="button" disabled={saving||chosen.length===0||tooMuch} onClick={()=>void submit()}>
      <PackageCheck/>{saving?'Enregistrement…':`Enregistrer le retour${chosen.length?` (${chosen.length} article${chosen.length>1?'s':''})`:''}`}
    </button>
  </>:undefined;

  return <Modal wide eyebrow="RETOUR CLIENT"
    title={detail?`Facture ${detail.reference}`:'Quelle facture ?'}
    subtitle={detail?detail.customer:'Cherchez par numéro de facture, nom ou téléphone du client.'}
    onClose={onClose} footer={footer}>
    {error&&<div className="error">{error}</div>}

    {!detail?<div className="return-search">
      <div className="search">
        <Search/>
        <input ref={searchBox} value={query} onChange={event=>setQuery(event.target.value)}
          placeholder="Numéro de facture, nom du client…" aria-label="Rechercher une facture"/>
      </div>
      {searching&&sales.length===0
        ?<div className="loading"><i/><span>Recherche…</span></div>
        :sales.length===0
          ?<p className="empty">Aucune facture ne correspond.</p>
          :<ul className="return-sales">{sales.map(sale=><li key={sale.id}>
            <button type="button" onClick={()=>void openSale(sale.id)}>
              <span className="return-sale-ref">{sale.reference}</span>
              <span className="return-sale-who">{sale.customer}</span>
              <span className="return-sale-when">{day(sale.createdAt)} · {sale.itemsCount} article(s)</span>
              <span className="return-sale-amount">{money(sale.total)}</span>
            </button>
          </li>)}</ul>}
    </div>:<div className="return-picker">
      <button type="button" className="return-back" onClick={()=>{setDetail(null);setPicked({})}}><ArrowLeft/>Changer de facture</button>

      <ul className="return-lines">{lines.map(line=>{
        const choice=picked[line.variantId];
        const done=line.remaining<=0;
        return <li key={line.variantId} className={`${choice?'picked':''}${done?' done':''}`}>
          <label className="return-line-pick">
            <input type="checkbox" checked={!!choice} disabled={done} onChange={()=>toggle(line)}/>
            <span className="return-line-name">
              <b>{line.name}</b>
              <small>{[line.detail,`${money(line.unitPrice)} l’unité`].filter(Boolean).join(' · ')}</small>
            </span>
          </label>
          <span className="return-line-state">
            {done?<em>déjà rendu en entier</em>
              :<>{line.remaining} sur {line.sold} rendable(s){line.returned>0&&<small>{line.returned} déjà rendu(s)</small>}</>}
          </span>
          {choice&&<div className="return-line-inputs">
            <label>Quantité rendue
              <input type="number" min={1} max={line.remaining} value={choice.quantity}
                onChange={event=>setQuantity(line,Number(event.target.value))}/>
            </label>
            <label>Remboursement
              <input type="number" min={0} max={line.maxRefund} value={choice.amount}
                onChange={event=>setPicked(current=>({...current,[line.variantId]:{...choice,amount:event.target.value}}))}/>
            </label>
          </div>}
        </li>;
      })}</ul>

      <div className="return-settings">
        <label>Motif du retour
          <input list="return-reasons" value={reason} onChange={event=>setReason(event.target.value)} placeholder="Pourquoi l’article revient-il ?"/>
          <datalist id="return-reasons">{reasons.map(item=><option key={item} value={item}/>)}</datalist>
        </label>
        <label>Remboursé par
          <select value={method} onChange={event=>setMethod(event.target.value)}>
            <option value="">Comme la facture</option>
            {methods.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="return-restock">
          <input type="checkbox" checked={restock} onChange={event=>setRestock(event.target.checked)}/>
          <span><b>Remettre en stock</b><small>À décocher si l’article revient cassé ou inutilisable.</small></span>
        </label>
      </div>
    </div>}
  </Modal>;
}
