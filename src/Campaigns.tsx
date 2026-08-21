import {useCallback,useEffect,useMemo,useState} from 'react';
import {CircleAlert,Megaphone,Play,Plus,RefreshCw,Save,Trash2,Users,X} from 'lucide-react';
import {api} from './api';

// Campagnes publicitaires WhatsApp et SMS.
//
// L'audience est décrite par des critères, jamais par une liste figée : entre
// la préparation d'une campagne et son lancement, des clients s'inscrivent,
// d'autres soldent leur facture. Les critères sont donc résolus au moment du
// lancement, puis matérialisés en messages — passé ce point la campagne ne
// bouge plus et son bilan devient stable.
//
// Le consentement WhatsApp de la fiche client est exigé côté serveur pour ce
// canal : une publicité n'a pas le même statut qu'une facture.

type Campaign={
  id:number;name:string;channel:string;status:string;audience:string;zone:string;activeDays:number;
  subject:string;body:string;scheduledAt:string|null;startedAt:string|null;finishedAt:string|null;
  total:number;sent:number;failed:number;skipped:number;
};
type Preview={count:number;sample:{name:string;phone:string;preview:string}[];sms:{parts:number;unicode:boolean;billed:number}};
type Report={campaign:Campaign;messages:{id:number;recipient:string;status:string;error:string;body:string}[]};

const audiences=[
  {value:'all',label:'Tous les clients'},
  {value:'buyers',label:'Clients ayant déjà acheté'},
  {value:'debtors',label:'Clients avec un solde dû'},
  {value:'shop',label:'Clients inscrits sur la boutique'},
];
const statusLabels:Record<string,string>={draft:'Brouillon',sending:'En cours',sent:'Terminée',cancelled:'Annulée'};
const blank={name:'',channel:'whatsapp',audience:'all',zone:'',activeDays:0,subject:'',body:'',scheduledAt:''};

export default function Campaigns(){
  const[rows,setRows]=useState<Campaign[]>([]);
  const[draft,setDraft]=useState<typeof blank&{id?:number}>(blank);
  const[preview,setPreview]=useState<Preview|null>(null);
  const[report,setReport]=useState<Report|null>(null);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState('');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);
    try{setRows(await api<Campaign[]>('/api/campaigns'))}
    catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  // Une campagne lancée ne s'édite plus : la modifier après coup ferait mentir
  // le bilan affiché, qui compte des messages déjà partis.
  const locked=draft.id!==undefined&&rows.find(row=>row.id===draft.id)?.status!=='draft';

  const save=async()=>{
    setBusy('save');setError('');setMessage('');
    try{
      const payload={...draft,activeDays:Number(draft.activeDays)||0,
        scheduledAt:draft.scheduledAt?new Date(draft.scheduledAt).toISOString():null};
      const saved=draft.id
        ?await api<Campaign>(`/api/campaigns/${draft.id}`,{method:'PUT',body:JSON.stringify(payload)})
        :await api<Campaign>('/api/campaigns',{method:'POST',body:JSON.stringify({...payload,status:'draft'})});
      setDraft({...blank,...saved,scheduledAt:saved.scheduledAt?saved.scheduledAt.slice(0,16):''});
      setMessage('Campagne enregistrée.');await load();
    }catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  const loadPreview=async(id:number)=>{
    setBusy('preview');setError('');
    try{setPreview(await api<Preview>(`/api/campaigns/${id}/preview`))}
    catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  const send=async(id:number)=>{
    if(!confirm('Lancer cette campagne ? Les messages partiront progressivement, au débit configuré.'))return;
    setBusy('send');setError('');setMessage('');
    try{
      const result=await api<{queued:number;skipped:number}>(`/api/campaigns/${id}/send`,{method:'POST'});
      setMessage(`${result.queued} message(s) en file${result.skipped?`, ${result.skipped} écarté(s)`:''}.`);
      await load();void openReport(id);
    }catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  const cancel=async(id:number)=>{
    if(!confirm('Annuler les envois restants ? Les messages déjà partis ne sont pas rappelés.'))return;
    setBusy('cancel');
    try{await api(`/api/campaigns/${id}/cancel`,{method:'POST'});await load();void openReport(id)}
    catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  const remove=async(id:number)=>{
    if(!confirm('Supprimer cette campagne ?'))return;
    try{await api(`/api/campaigns/${id}`,{method:'DELETE'});setDraft(blank);setReport(null);await load()}
    catch(reason){setError((reason as Error).message)}
  };

  const openReport=useCallback(async(id:number)=>{
    try{setReport(await api<Report>(`/api/campaigns/${id}/report`))}
    catch(reason){setError((reason as Error).message)}
  },[]);

  const edit=(row:Campaign)=>{
    setDraft({...blank,...row,scheduledAt:row.scheduledAt?row.scheduledAt.slice(0,16):''});
    setPreview(null);void loadPreview(row.id);
    if(row.status!=='draft')void openReport(row.id);else setReport(null);
  };

  // Le coût d'une diffusion SMS se joue sur le nombre de segments : un accent
  // fait passer de 160 à 70 caractères par segment, donc double la facture.
  const smsWarning=useMemo(()=>draft.channel==='sms'&&preview&&preview.sms.parts>1
    ?`${preview.sms.parts} segments par message${preview.sms.unicode?' (accents détectés)':''} — ${preview.sms.billed} SMS facturés au total.`
    :'',[draft.channel,preview]);

  return <div className="campaigns-page">
    <section className="panel campaign-list">
      <header><div><h3><Megaphone/>Campagnes</h3><p>Diffusions WhatsApp et SMS vers les clients consentants.</p></div>
        <div><button className="compact" onClick={()=>void load()}><RefreshCw/>Actualiser</button>
        <button className="primary compact" onClick={()=>{setDraft(blank);setPreview(null);setReport(null)}}><Plus/>Nouvelle</button></div></header>
      {loading?<div className="loading"><i/><span>Chargement…</span></div>
        :rows.length===0?<p className="empty">Aucune campagne pour l’instant.</p>
        :<table><thead><tr><th>Nom</th><th>Canal</th><th>État</th><th>Envoyés</th><th>Échecs</th><th/></tr></thead>
          <tbody>{rows.map(row=><tr key={row.id} className={draft.id===row.id?'selected':''} onClick={()=>edit(row)}>
            <td><strong>{row.name||'Sans titre'}</strong><span>{audiences.find(item=>item.value===row.audience)?.label}</span></td>
            <td>{row.channel==='sms'?'SMS':'WhatsApp'}</td>
            <td><span className={`campaign-badge ${row.status}`}>{statusLabels[row.status]??row.status}</span></td>
            <td>{row.sent}/{row.total}</td>
            <td>{row.failed||'—'}</td>
            <td onClick={event=>event.stopPropagation()}>
              {row.status==='draft'&&<button className="icon danger" title="Supprimer" onClick={()=>void remove(row.id)}><Trash2/></button>}
              {row.status==='sending'&&<button className="icon" title="Annuler les envois restants" onClick={()=>void cancel(row.id)}><X/></button>}
            </td>
          </tr>)}</tbody></table>}
    </section>

    <section className="panel campaign-editor">
      <header><div><h3>{draft.id?'Modifier la campagne':'Nouvelle campagne'}</h3><p>{locked?'Campagne lancée : le contenu n’est plus modifiable.':'Le message est personnalisé pour chaque destinataire.'}</p></div>
        <div>{!locked&&<button className="compact" onClick={()=>void save()} disabled={busy==='save'||!draft.name.trim()}><Save/>Enregistrer</button>}
        {draft.id&&<button className="compact" onClick={()=>void loadPreview(draft.id as number)} disabled={busy==='preview'}><Users/>Aperçu</button>}
        {draft.id&&!locked&&<button className="primary compact" onClick={()=>void send(draft.id as number)} disabled={busy==='send'}><Play/>Lancer</button>}</div></header>
      {message&&<div className="success">{message}</div>}
      {error&&<div className="error">{error}</div>}
      <div className="settings-fields">
        <label>Nom interne<input value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})} disabled={locked} placeholder="Promo Tabaski"/></label>
        <label>Canal<select value={draft.channel} onChange={event=>setDraft({...draft,channel:event.target.value})} disabled={locked}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label>
        <label>Audience<select value={draft.audience} onChange={event=>setDraft({...draft,audience:event.target.value})} disabled={locked}>{audiences.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Zone (facultatif)<input value={draft.zone} onChange={event=>setDraft({...draft,zone:event.target.value})} disabled={locked} placeholder="dakar"/></label>
        <label>Actifs depuis (jours, 0 = sans condition)<input type="number" min="0" value={draft.activeDays} onChange={event=>setDraft({...draft,activeDays:Number(event.target.value)})} disabled={locked}/></label>
        <label>Départ programmé (facultatif)<input type="datetime-local" value={draft.scheduledAt} onChange={event=>setDraft({...draft,scheduledAt:event.target.value})} disabled={locked}/></label>
        <label className="field-wide">Objet (SMS : non transmis)<input value={draft.subject} onChange={event=>setDraft({...draft,subject:event.target.value})} disabled={locked}/></label>
        <label className="field-wide">Message<textarea rows={4} value={draft.body} onChange={event=>setDraft({...draft,body:event.target.value})} disabled={locked}/><small>Jetons : {'{{nom}}'} · {'{{telephone}}'} · {'{{boutique}}'} · {'{{date}}'}</small></label>
      </div>
      {draft.channel==='whatsapp'&&<p className="hint"><CircleAlert/>Seuls les clients ayant coché le consentement WhatsApp sur leur fiche recevront cette campagne.</p>}
      {smsWarning&&<p className="hint"><CircleAlert/>{smsWarning}</p>}
      {preview&&<div className="campaign-preview">
        <strong>{preview.count} destinataire(s)</strong>
        {preview.sample.length===0?<p className="empty">Aucun client ne correspond à ces critères.</p>
          :<ul>{preview.sample.map((item,index)=><li key={index}><b>{item.name}</b><small>{item.phone}</small><p>{item.preview}</p></li>)}</ul>}
      </div>}
    </section>

    {report&&<section className="panel campaign-report">
      <header><div><h3>Bilan — {report.campaign.name}</h3>
        <p>{report.campaign.sent} envoyé(s) · {report.campaign.failed} échec(s) · {report.campaign.skipped} écarté(s)</p></div>
        <button className="compact" onClick={()=>void openReport(report.campaign.id)}><RefreshCw/>Actualiser</button></header>
      <table><thead><tr><th>Destinataire</th><th>État</th><th>Motif</th></tr></thead>
        <tbody>{report.messages.map(row=><tr key={row.id}>
          <td>{row.recipient}</td>
          <td><span className={`campaign-badge ${row.status}`}>{row.status}</span></td>
          <td>{row.error||'—'}</td>
        </tr>)}</tbody></table>
    </section>}
  </div>;
}
