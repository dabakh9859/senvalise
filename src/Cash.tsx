import {FormEvent,useCallback,useEffect,useState} from 'react';
import {CalendarClock,CheckCircle2,LockKeyhole,TriangleAlert,Wallet,WalletCards} from 'lucide-react';
import Modal from './Modal';
import {api,money} from './api';

// La caisse du jour.
//
// Ouvrir le tiroir demandait de remplir cinq champs : utilisateur, statut,
// date d'ouverture, montant attendu, montant de clôture. Quatre n'ont qu'une
// valeur possible à cet instant — c'est moi, c'est maintenant, c'est ouvert,
// et l'attendu vaut le fond. Seul le fond initial est une vraie question.
//
// La clôture, elle, tient en un chiffre : ce que la caisse attend. Il est
// affiché en grand, on compte, on saisit. Un écart n'empêche pas de fermer —
// refuser reviendrait à laisser la caisse ouverte toute la nuit — mais la
// session part en rouge, et le gérant la retrouve dans son récapitulatif.

type Detail={label:string;amount:number};
type Current={open:boolean;id?:number;openedAt?:string;openingAmount?:number;expectedAmount?:number;detail?:Detail[]};
type Session={id:number;userId:number;status:string;openingAmount:number;expectedAmount:number;closingAmount:number;openedAt:string;closedAt:string|null;user?:{name:string}|null};

const moment=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
// Une caisse fermée sur un écart est un problème à regarder, pas une ligne de
// plus : elle se signale d'elle-même dans la liste.
const gapOf=(row:Session)=>row.status==='closed'?row.closingAmount-row.expectedAmount:0;

export default function Cash(){
  const[current,setCurrent]=useState<Current|null>(null);
  const[sessions,setSessions]=useState<Session[]>([]);
  const[dialog,setDialog]=useState<''|'open'|'close'|'past'>('');
  const[error,setError]=useState('');

  const load=useCallback(async()=>{
    try{
      const[now,rows]=await Promise.all([api<Current>('/api/cash/current'),api<Session[]>('/api/cash-sessions?limit=60')]);
      setCurrent(now);setSessions(rows);
    }catch(problem){setError((problem as Error).message)}
  },[]);
  useEffect(()=>{void load()},[load]);

  if(!current)return <div className="loading"><i/><span>Lecture de la caisse…</span></div>;

  return <div className="cash-page">
    {error&&<div className="panel error">{error}</div>}

    {current.open?<section className="panel cash-open">
      <header>
        <div><small>CAISSE OUVERTE</small><h2>{money(current.expectedAmount)}</h2>
          <p>attendus dans le tiroir · ouverte {moment(current.openedAt!)}</p></div>
        <button className="primary" onClick={()=>setDialog('close')}><LockKeyhole/>Clôturer la caisse</button>
      </header>
      <ul className="cash-detail">{(current.detail??[]).map(line=>
        <li key={line.label}><span>{line.label}</span><b className={line.amount<0?'out':''}>{money(line.amount)}</b></li>)}
      </ul>
    </section>:<section className="panel cash-closed">
      <WalletCards/>
      <div><h2>Aucune caisse ouverte</h2><p>Ouvrez le tiroir en indiquant le fond de caisse du matin.</p></div>
      <div className="cash-closed-actions">
        <button className="primary" onClick={()=>setDialog('open')}><Wallet/>Ouvrir la caisse</button>
        <button onClick={()=>setDialog('past')}><CalendarClock/>Saisir une caisse passée</button>
      </div>
    </section>}

    <section className="panel table-panel">
      <div className="table-wrap"><table className="records-table"><thead><tr>
        <th>Ouverte le</th><th>Vendeur</th><th>Fond</th><th>Attendu</th><th>Compté</th><th>Écart</th><th>État</th>
      </tr></thead><tbody>
        {sessions.length===0
          ?<tr><td colSpan={7} className="empty">Aucune session de caisse enregistrée.</td></tr>
          :sessions.map(row=>{const gap=gapOf(row);return <tr key={row.id} className={gap!==0?'cash-gap':''}>
            <td>{moment(row.openedAt)}</td>
            <td>{row.user?.name??'—'}</td>
            <td>{money(row.openingAmount)}</td>
            <td>{money(row.expectedAmount)}</td>
            <td>{row.status==='closed'?money(row.closingAmount):'—'}</td>
            <td>{gap!==0?<b className="cash-gap-amount">{gap>0?'+':''}{money(gap)}</b>:row.status==='closed'?<span className="cash-just"><CheckCircle2/>juste</span>:'—'}</td>
            <td>{row.status==='open'?<span className="badge open">Ouverte</span>:gap!==0?<span className="badge bad">Écart</span>:<span className="badge ok">Clôturée</span>}</td>
          </tr>})}
      </tbody></table></div>
    </section>

    {dialog==='open'&&<OpenForm onClose={()=>setDialog('')} onDone={()=>{setDialog('');void load()}}/>}
    {dialog==='close'&&current.open&&<CloseForm session={current} onClose={()=>setDialog('')} onDone={()=>{setDialog('');void load()}}/>}
    {dialog==='past'&&<PastForm onClose={()=>setDialog('')} onDone={()=>{setDialog('');void load()}}/>}
  </div>;
}

// Ouverture ordinaire : une seule question.
function OpenForm({onClose,onDone}:{onClose:()=>void;onDone:()=>void}){
  const[amount,setAmount]=useState('');
  const[error,setError]=useState('');const[saving,setSaving]=useState(false);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();setSaving(true);setError('');
    try{await api('/api/cash/open',{method:'POST',body:JSON.stringify({openingAmount:Number(amount)||0})});onDone()}
    catch(problem){setError((problem as Error).message);setSaving(false)}
  };
  return <Modal eyebrow="CAISSE" title="Ouvrir la caisse" subtitle="Comptez le fond de caisse du matin : c’est la seule chose à saisir." onClose={onClose}
    footer={<><button type="button" onClick={onClose}>Annuler</button>
      <button className="primary" form="cash-open" disabled={saving}>{saving?'Ouverture…':'Ouvrir la caisse'}</button></>}>
    <form id="cash-open" onSubmit={submit} className="cash-form">
      {error&&<div className="error">{error}</div>}
      <label className="cash-big-field">Fond de caisse
        <input type="number" min="0" step="1" autoFocus value={amount} onChange={event=>setAmount(event.target.value)} placeholder="0"/>
        <small>La date, le vendeur et l’état sont ceux de maintenant.</small>
      </label>
    </form>
  </Modal>;
}

// Clôture : le montant attendu d'abord, la saisie ensuite, l'écart en clair.
function CloseForm({session,onClose,onDone}:{session:Current;onClose:()=>void;onDone:()=>void}){
  const[counted,setCounted]=useState('');
  const[error,setError]=useState('');const[saving,setSaving]=useState(false);
  const expected=session.expectedAmount??0;
  const typed=counted.trim()==='';
  const gap=(Number(counted)||0)-expected;
  const submit=async()=>{
    setSaving(true);setError('');
    try{await api(`/api/cash/${session.id}/close`,{method:'POST',body:JSON.stringify({closingAmount:Number(counted)||0})});onDone()}
    catch(problem){setError((problem as Error).message);setSaving(false)}
  };
  return <Modal eyebrow="CAISSE" title="Clôturer la caisse" subtitle="Comptez le tiroir, puis saisissez ce que vous avez trouvé." onClose={onClose}
    footer={<><button type="button" onClick={onClose}>Annuler</button>
      <button className={gap!==0&&!typed?'danger':'primary'} type="button" disabled={saving||typed} onClick={()=>void submit()}>
        <LockKeyhole/>{saving?'Clôture…':gap!==0&&!typed?'Clôturer malgré l’écart':'Clôturer la caisse'}</button></>}>
    <div className="cash-close">
      {error&&<div className="error">{error}</div>}
      <div className="cash-expected"><small>MONTANT ATTENDU DANS LE TIROIR</small><strong>{money(expected)}</strong></div>
      <ul className="cash-detail">{(session.detail??[]).map(line=>
        <li key={line.label}><span>{line.label}</span><b className={line.amount<0?'out':''}>{money(line.amount)}</b></li>)}
      </ul>
      <label className="cash-big-field">Montant réellement compté
        <input type="number" min="0" step="1" autoFocus value={counted} onChange={event=>setCounted(event.target.value)} placeholder="0"/>
      </label>
      {!typed&&(gap===0
        ?<p className="cash-verdict ok"><CheckCircle2/>La caisse tombe juste.</p>
        :<p className="cash-verdict bad"><TriangleAlert/>
          {gap>0?`Il y a ${money(gap)} de trop dans le tiroir.`:`Il manque ${money(-gap)} dans le tiroir.`}
          {' '}Vous pouvez clôturer quand même : la session sera signalée en rouge au gérant.</p>)}
    </div>
  </Modal>;
}

// Rattrapage : la caisse d'un jour passé, saisie à la main. C'est le seul
// endroit où les dates et les montants se renseignent librement, et c'est
// volontairement un autre bouton — l'ouverture de tous les jours n'a pas à
// porter la complexité de ce cas rare.
function PastForm({onClose,onDone}:{onClose:()=>void;onDone:()=>void}){
  const[form,setForm]=useState({openedAt:'',closedAt:'',openingAmount:'',expectedAmount:'',closingAmount:''});
  const[error,setError]=useState('');const[saving,setSaving]=useState(false);
  const set=(key:keyof typeof form,value:string)=>setForm(current=>({...current,[key]:value}));
  const submit=async(event:FormEvent)=>{
    event.preventDefault();setSaving(true);setError('');
    try{
      await api('/api/cash-sessions',{method:'POST',body:JSON.stringify({
        status:'closed',
        openedAt:new Date(form.openedAt).toISOString(),
        closedAt:new Date(form.closedAt||form.openedAt).toISOString(),
        openingAmount:Number(form.openingAmount)||0,
        expectedAmount:Number(form.expectedAmount)||0,
        closingAmount:Number(form.closingAmount)||0,
      })});
      onDone();
    }catch(problem){setError((problem as Error).message);setSaving(false)}
  };
  return <Modal eyebrow="CAISSE" title="Saisir une caisse passée" subtitle="Pour rattraper une journée qui n’avait pas été ouverte dans l’application." onClose={onClose}
    footer={<><button type="button" onClick={onClose}>Annuler</button>
      <button className="primary" form="cash-past" disabled={saving}>{saving?'Enregistrement…':'Enregistrer la session'}</button></>}>
    <form id="cash-past" onSubmit={submit} className="cash-form cash-past">
      {error&&<div className="error">{error}</div>}
      <label>Ouverte le<input type="datetime-local" required value={form.openedAt} onChange={event=>set('openedAt',event.target.value)}/></label>
      <label>Clôturée le<input type="datetime-local" value={form.closedAt} onChange={event=>set('closedAt',event.target.value)}/></label>
      <label>Fond de caisse<input type="number" min="0" value={form.openingAmount} onChange={event=>set('openingAmount',event.target.value)}/></label>
      <label>Montant attendu<input type="number" min="0" value={form.expectedAmount} onChange={event=>set('expectedAmount',event.target.value)}/></label>
      <label>Montant compté<input type="number" min="0" value={form.closingAmount} onChange={event=>set('closingAmount',event.target.value)}/></label>
    </form>
  </Modal>;
}
