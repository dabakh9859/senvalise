import {useCallback,useEffect,useMemo,useState} from 'react';
import {BellRing,CircleAlert,FileText,RefreshCw,Send} from 'lucide-react';
import {api,money,openFile} from './api';

// Créances clients et relance des impayés.
//
// L'écran montre la dette telle qu'elle est — toutes les factures non soldées,
// sans filtre de courtoisie — mais l'envoi, lui, respecte le délai configuré :
// le gérant doit voir ce qu'on lui doit, sans pouvoir harceler par accident.
// La colonne « Dernière relance » rend cette règle lisible avant le clic.

type Debt={
  customerId:number;name:string;phone:string;invoices:number;due:number;
  oldestDays:number;lastInvoice:string;lastSaleId:number;lastRemindAt:string|null;
};
type Payload={
  rows:Debt[];total:number;count:number;
  settings:{minAmount:number;afterDays:number;cooldownDays:number;channel:string;body:string};
};

const shortDate=(value:string|null)=>value?new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short'}).format(new Date(value)):'—';

// Une créance ancienne coûte plus qu'une créance récente du même montant :
// l'ancienneté est donc traitée comme un niveau d'alerte, pas comme une date.
const ageTone=(days:number)=>days>=60?'late':days>=30?'warn':'';

export default function Debts(){
  const[data,setData]=useState<Payload|null>(null);
  const[selected,setSelected]=useState<number[]>([]);
  const[channel,setChannel]=useState('whatsapp');
  const[body,setBody]=useState('');
  const[force,setForce]=useState(false);
  const[loading,setLoading]=useState(true);
  const[sending,setSending]=useState(false);
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      // Sans seuil : l'écran montre toute la créance. Les seuils configurés ne
      // gouvernent que la relance automatique, et sont rappelés en tête.
      const result=await api<Payload>('/api/debts?after=0&min=0');
      setData(result);setChannel(result.settings.channel);setBody(result.settings.body);
      // Une sélection portant sur des clients qui ont soldé entre-temps
      // enverrait des relances sans objet.
      setSelected(current=>current.filter(id=>result.rows.some(row=>row.customerId===id)));
    }catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  // Memoise : sans cela la valeur par defaut [] est une nouvelle reference a
  // chaque rendu, et les totaux se recalculent en boucle.
  const rows=useMemo(()=>data?.rows??[],[data]);
  const toggle=(id:number)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  const allSelected=rows.length>0&&selected.length===rows.length;
  const selectedTotal=useMemo(()=>rows.filter(row=>selected.includes(row.customerId)).reduce((sum,row)=>sum+row.due,0),[rows,selected]);
  const unreachable=useMemo(()=>rows.filter(row=>!row.phone.trim()).length,[rows]);

  const remind=async()=>{
    if(!selected.length)return;
    setSending(true);setError('');setMessage('');
    try{
      const result=await api<{queued:number;skipped:number}>('/api/debts/remind',{method:'POST',
        body:JSON.stringify({customerIds:selected,channel,body,force})});
      setMessage(result.queued
        ?`${result.queued} relance(s) mise(s) en file${result.skipped?`, ${result.skipped} écartée(s)`:''}. L’envoi se fait en arrière-plan.`
        :`Aucune relance envoyée : ${result.skipped} destinataire(s) écarté(s) (numéro manquant, relance récente ou envoi déjà en attente).`);
      setSelected([]);void load();
    }catch(reason){setError((reason as Error).message)}
    finally{setSending(false)}
  };

  if(loading&&!data)return <div className="loading"><i/><span>Calcul des créances…</span></div>;

  return <div className="debts-page">
    <div className="debt-summary">
      <div className="panel stat"><small>CRÉANCE TOTALE</small><strong>{money(data?.total??0)}</strong><span>{data?.count??0} client(s) concerné(s)</span></div>
      <div className="panel stat"><small>SÉLECTION</small><strong>{money(selectedTotal)}</strong><span>{selected.length} client(s)</span></div>
      <div className="panel stat"><small>SEUIL AUTOMATIQUE</small><strong>{money(data?.settings.minAmount??0)}</strong><span>relance auto à partir de {data?.settings.afterDays??0} jour(s)</span></div>
      <div className="panel stat"><small>DÉLAI DE COURTOISIE</small><strong>{data?.settings.cooldownDays??0} j</strong><span>entre deux relances</span></div>
    </div>

    <section className="panel debt-composer">
      <header><div><h3><BellRing/>Relancer la sélection</h3><p>Le message part par la file d’envoi, à débit plafonné.</p></div>
        <button className="primary compact" onClick={()=>void remind()} disabled={!selected.length||sending}><Send/>{sending?'Envoi…':`Relancer ${selected.length||''}`}</button></header>
      {message&&<div className="success">{message}</div>}
      {error&&<div className="error">{error}</div>}
      <div className="settings-fields">
        <label>Canal<select value={channel} onChange={event=>setChannel(event.target.value)}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label>
        <label className="setting-switch"><input type="checkbox" checked={force} onChange={event=>setForce(event.target.checked)}/><span><b>Ignorer le délai de courtoisie</b><small>À réserver aux relances décidées au cas par cas.</small></span></label>
        <label className="field-wide">Message<textarea rows={3} value={body} onChange={event=>setBody(event.target.value)}/><small>Jetons : {'{{nom}}'} · {'{{reference}}'} · {'{{reste}}'} · {'{{echeance}}'} · {'{{lien}}'} · {'{{boutique}}'}</small></label>
      </div>
      {unreachable>0&&<p className="hint"><CircleAlert/>{unreachable} client(s) sans numéro exploitable : ils apparaissent dans la liste mais ne peuvent pas être relancés.</p>}
    </section>

    <section className="panel debt-table">
      <header><div><h3>Clients débiteurs</h3><p>Toutes les factures non soldées, hors ventes annulées.</p></div>
        <button className="compact" onClick={()=>void load()}><RefreshCw/>Actualiser</button></header>
      {rows.length===0
        ?<p className="empty">Aucune créance en cours. Rien à relancer.</p>
        :<table>
          <thead><tr>
            <th><input type="checkbox" checked={allSelected} onChange={()=>setSelected(allSelected?[]:rows.filter(row=>row.phone.trim()).map(row=>row.customerId))} aria-label="Tout sélectionner"/></th>
            <th>Client</th><th>Téléphone</th><th>Factures</th><th>Ancienneté</th><th>Dernière relance</th><th className="align-right">Solde dû</th><th/>
          </tr></thead>
          <tbody>{rows.map(row=><tr key={row.customerId} className={selected.includes(row.customerId)?'selected':''}>
            <td><input type="checkbox" checked={selected.includes(row.customerId)} disabled={!row.phone.trim()} onChange={()=>toggle(row.customerId)} aria-label={`Sélectionner ${row.name}`}/></td>
            <td><strong>{row.name}</strong><span>{row.lastInvoice}</span></td>
            <td>{row.phone||<em>absent</em>}</td>
            <td>{row.invoices}</td>
            <td><span className={`age-badge ${ageTone(row.oldestDays)}`}>{row.oldestDays} j</span></td>
            <td>{shortDate(row.lastRemindAt)}</td>
            <td className="align-right"><strong>{money(row.due)}</strong></td>
            <td><button type="button" className="icon" title="Ouvrir la dernière facture en PDF" onClick={()=>void openFile(`/api/documents/invoice/${row.lastSaleId}/pdf`).catch(reason=>setError((reason as Error).message))}><FileText/></button></td>
          </tr>)}</tbody>
        </table>}
    </section>
  </div>;
}
