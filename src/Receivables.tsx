import {useCallback,useEffect,useMemo,useState} from 'react';
import {ChevronDown,Clock3,HandCoins,Mail,MessageCircle,Phone,Send,Users} from 'lucide-react';
import {api,money} from './api';

// Créances et relances.
//
// L'impayé existait déjà, mais éclaté entre une carte du tableau de bord, un
// graphique d'ancienneté et un tableau au fond des rapports — de quoi savoir
// combien on attend, jamais de quoi appeler quelqu'un. Cet écran répond à la
// seule question du comptoir : qui dois-je relancer, et que lui dire.

type Line={saleId:number;reference:string;date:string;total:number;paid:number;due:number;days:number;bucket:string};
type Customer={customerId:number;name:string;phone:string;email:string;due:number;invoices:number;oldestDays:number;bucket:string;lastReminderAt:string|null;reminders:number;lines:Line[]};
type Bucket={label:string;amount:number;count:number};
type Data={totals:{outstanding:number;invoices:number;customers:number;overdue:number};buckets:Bucket[];customers:Customer[]};
type Channel='whatsapp'|'sms'|'email';

const channels:{id:Channel;label:string;icon:typeof Phone}[]=[
  {id:'whatsapp',label:'WhatsApp',icon:MessageCircle},
  {id:'sms',label:'SMS',icon:Phone},
  {id:'email',label:'E-mail',icon:Mail},
];

const day=(value:string)=>new Date(value).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
const since=(value:string|null)=>{
  if(!value)return 'jamais relancé';
  const days=Math.floor((Date.now()-new Date(value).getTime())/86400000);
  return days<=0?'relancé aujourd’hui':days===1?'relancé hier':`relancé il y a ${days} jours`;
};
// L'ancienneté se lit d'un coup d'œil : plus c'est vieux, plus c'est chaud.
const tone=(bucket:string)=>bucket==='1–30 j'?'fresh':bucket==='31–60 j'?'warm':bucket==='61–90 j'?'hot':'critical';

export default function Receivables(){
  const[data,setData]=useState<Data|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[filter,setFilter]=useState<string>('all');
  const[query,setQuery]=useState('');
  const[open,setOpen]=useState<number|null>(null);
  const[draft,setDraft]=useState<Customer|null>(null);

  const load=useCallback(()=>{
    setLoading(true);setError('');
    api<Data>('/api/receivables').then(setData).catch(reason=>setError((reason as Error).message)).finally(()=>setLoading(false));
  },[]);
  useEffect(load,[load]);

  const shown=useMemo(()=>{
    if(!data)return [];
    const needle=query.trim().toLowerCase();
    return data.customers.filter(customer=>
      (filter==='all'||customer.bucket===filter)&&
      (!needle||`${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(needle)));
  },[data,filter,query]);

  if(loading&&!data)return <div className="loading"><i/><span>Chargement des créances…</span></div>;
  if(error&&!data)return <div className="error resource-error">{error}</div>;
  if(!data)return null;

  const totals=data.totals;
  return <>
    <section className="receivable-summary">
      <div className="receivable-headline">
        <span>RESTE À ENCAISSER</span>
        <strong>{money(totals.outstanding)}</strong>
        <small>{totals.invoices} facture{totals.invoices!==1?'s':''} · {totals.customers} client{totals.customers!==1?'s':''}</small>
      </div>
      <div className="receivable-buckets">
        {data.buckets.map(bucket=><button
            key={bucket.label}
            className={`receivable-bucket ${tone(bucket.label)} ${filter===bucket.label?'active':''}`}
            onClick={()=>setFilter(filter===bucket.label?'all':bucket.label)}
            aria-pressed={filter===bucket.label}>
          <span>{bucket.label}</span>
          <strong>{money(bucket.amount)}</strong>
          <small>{bucket.count} facture{bucket.count!==1?'s':''}</small>
        </button>)}
      </div>
    </section>

    <div className="toolbar">
      <div className="search"><Users/><input placeholder="Rechercher un client, un téléphone…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
      {filter!=='all'&&<button className="compact" onClick={()=>setFilter('all')}>Voir toutes les anciennetés</button>}
    </div>

    {error&&<div className="error resource-error">{error}</div>}

    {shown.length===0
      ? <div className="empty"><HandCoins/><h3>Rien à recouvrer</h3><p>{query||filter!=='all'?'Aucun client ne correspond à ce filtre.':'Toutes les factures sont réglées.'}</p></div>
      : <div className="receivable-list">
          {shown.map(customer=><article key={customer.customerId} className={`receivable-card ${tone(customer.bucket)}`}>
            <header onClick={()=>setOpen(open===customer.customerId?null:customer.customerId)}>
              <div className="receivable-who">
                <h3>{customer.name}</h3>
                <p>{customer.phone||customer.email||'aucun contact enregistré'}</p>
              </div>
              <div className="receivable-figures">
                <b>{money(customer.due)}</b>
                <span className={`receivable-age ${tone(customer.bucket)}`}><Clock3/>{customer.oldestDays} j</span>
              </div>
              <div className="receivable-meta">
                <span>{customer.invoices} facture{customer.invoices!==1?'s':''}</span>
                <small>{since(customer.lastReminderAt)}</small>
              </div>
              <button className="receivable-relaunch" onClick={event=>{event.stopPropagation();setDraft(customer)}}><Send/>Relancer</button>
              <ChevronDown className={open===customer.customerId?'rotated':''}/>
            </header>
            {open===customer.customerId&&<div className="receivable-lines">
              <table>
                <thead><tr><th>Facture</th><th>Date</th><th>Total</th><th>Payé</th><th>Reste dû</th><th>Ancienneté</th></tr></thead>
                <tbody>{customer.lines.map(line=><tr key={line.saleId}>
                  <td>{line.reference}</td>
                  <td>{day(line.date)}</td>
                  <td>{money(line.total)}</td>
                  <td>{money(line.paid)}</td>
                  <td className="due">{money(line.due)}</td>
                  <td><span className={`receivable-age ${tone(line.bucket)}`}>{line.days} j</span></td>
                </tr>)}</tbody>
              </table>
            </div>}
          </article>)}
        </div>}

    {draft&&<ReminderDialog customer={draft} onClose={()=>setDraft(null)} onSent={()=>{setDraft(null);load()}}/>}
  </>;
}

// Rien n'expédie réellement de message dans l'application : la relance est
// rédigée puis consignée, et le vendeur l'envoie depuis son téléphone. Le
// texte est donc affiché et copiable — c'est le livrable, pas un détail.
function ReminderDialog({customer,onClose,onSent}:{customer:Customer;onClose:()=>void;onSent:()=>void}){
  const[channel,setChannel]=useState<Channel>(customer.phone?'whatsapp':'email');
  const[body,setBody]=useState('');
  const[sending,setSending]=useState(false);
  const[error,setError]=useState('');
  const[sent,setSent]=useState<{subject:string;body:string;recipient:string}|null>(null);
  const[copied,setCopied]=useState(false);

  const submit=async()=>{
    setSending(true);setError('');
    try{
      const result=await api<{message:{subject:string;body:string;recipient:string}}>(`/api/receivables/${customer.customerId}/reminder`,
        {method:'POST',body:JSON.stringify({channel,body:body.trim()})});
      setSent(result.message);
    }catch(reason){setError((reason as Error).message)}
    finally{setSending(false)}
  };
  const copy=async()=>{
    if(!sent)return;
    try{await navigator.clipboard.writeText(sent.body);setCopied(true);setTimeout(()=>setCopied(false),2000)}
    catch{setError('Copie impossible : sélectionnez le texte à la main.')}
  };

  return <div className="overlay" onMouseDown={onClose}>
    <div className="modal reminder-modal" onMouseDown={event=>event.stopPropagation()}>
      <div className="modal-head">
        <div><small>RELANCE</small><h2>{customer.name}</h2></div>
        <button className="icon" onClick={onClose} aria-label="Fermer">×</button>
      </div>

      {sent
        ? <div className="reminder-done">
            <p className="reminder-ready">Relance enregistrée pour <strong>{sent.recipient}</strong>. Envoyez-la depuis votre téléphone :</p>
            <pre className="reminder-text">{sent.body}</pre>
            <div className="modal-actions">
              <button onClick={()=>void copy()}>{copied?'Copié':'Copier le texte'}</button>
              <button className="primary" onClick={onSent}>Terminé</button>
            </div>
          </div>
        : <>
            <p className="reminder-context">
              <strong>{money(customer.due)}</strong> dus sur {customer.invoices} facture{customer.invoices!==1?'s':''},
              la plus ancienne remonte à {customer.oldestDays} jours. {since(customer.lastReminderAt)}.
            </p>
            <div className="reminder-channels">
              {channels.map(item=>{
                const missing=item.id==='email'?!customer.email:!customer.phone;
                return <button key={item.id} className={`${channel===item.id?'active':''} ${missing?'missing':''}`}
                    disabled={missing} title={missing?'Contact non renseigné pour ce canal':undefined}
                    onClick={()=>setChannel(item.id)}><item.icon/>{item.label}</button>;
              })}
            </div>
            <label className="reminder-body">Message
              <textarea rows={4} value={body} placeholder="Laissez vide pour utiliser le modèle « Relance solde »." onChange={event=>setBody(event.target.value)}/>
            </label>
            {error&&<div className="error">{error}</div>}
            <div className="modal-actions">
              <button onClick={onClose}>Annuler</button>
              <button className="primary" disabled={sending} onClick={()=>void submit()}><Send/>{sending?'Enregistrement…':'Préparer la relance'}</button>
            </div>
          </>}
    </div>
  </div>;
}
