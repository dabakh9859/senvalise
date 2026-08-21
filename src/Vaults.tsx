import {useCallback,useEffect,useState} from 'react';
import {ArrowDownToLine,ArrowUpFromLine,Info,Lock,LockOpen,Plus,RefreshCw,Search,Target,WalletCards} from 'lucide-react';
import {api,money} from './api';
import Modal from './Modal';

// Coffres clients — l'épargne que le client constitue puis dépense en boutique.
//
// Le coffre appartient au client : il l'ouvre lui-même depuis la boutique, à
// sa première visite sur la page « Mon coffre ». Cet écran est le poste de
// contrôle du comptoir — voir les encours, enregistrer un versement reçu en
// main propre, rembourser, fixer un objectif, clôturer. L'ouverture depuis
// ici reste possible, mais c'est une exception : elle sert au client de
// passage, qui n'a pas de compte sur le site.
//
// Versement et retrait passent par le serveur dans une transaction verrouillée,
// et un mouvement en espèces alimente la session de caisse ouverte — sinon
// l'écart constaté à la clôture serait exactement celui du versement.

type Vault={
  id:number;customerId:number;name:string;phone:string;balance:number;goal:number;goalRef:string;
  status:string;deposits:number;lastMoveAt:string|null;openedAt:string;ordersPaid:number;ordersTotal:number;
};
type Totals={balance:number;open:number;closed:number;monthIn:number;monthOut:number};
type Move={id:number;createdAt:string;amount:number;method:string;reference:string;note:string};
type Order={id:number;reference:string;status:string;total:number;createdAt:string};
type Detail={vault:{id:number;goal:number;goalRef:string;status:string;balance:number};customer:{name:string;phone:string;email:string};moves:Move[];orders:Order[]};
type Candidate={id:number;name:string;phone:string};

const methods=[
  {value:'cash',label:'Espèces'},{value:'wave',label:'Wave'},
  {value:'orange_money',label:'Orange Money'},{value:'bank_transfer',label:'Virement'},
];
const methodLabel=(value:string)=>methods.find(item=>item.value===value)?.label??value;
const statusLabels:Record<string,string>={open:'Ouvert',suspended:'Suspendu',closed:'Clôturé'};
const shortDate=(value:string|null)=>value?new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'2-digit'}).format(new Date(value)):'—';

export default function Vaults(){
  const[rows,setRows]=useState<Vault[]>([]);
  const[totals,setTotals]=useState<Totals|null>(null);
  const[search,setSearch]=useState('');
  const[current,setCurrent]=useState<Detail|null>(null);
  const[candidates,setCandidates]=useState<Candidate[]>([]);
  const[opening,setOpening]=useState(false);
  const[newVault,setNewVault]=useState({customerId:'',goal:'0',goalRef:''});
  const[move,setMove]=useState({amount:'',method:'cash',note:''});
  const[goal,setGoal]=useState({goal:'',goalRef:''});
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState('');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');
  // Erreur propre à la fenêtre ouverte : affichée dedans, elle resterait
  // invisible derrière si on la posait sur la page.
  const[modalError,setModalError]=useState('');

  const load=useCallback(async(term:string)=>{
    setLoading(true);
    try{
      const result=await api<{rows:Vault[];totals:Totals}>(`/api/vaults-overview${term?`?q=${encodeURIComponent(term)}`:''}`);
      setRows(result.rows);setTotals(result.totals);
    }catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load('')},[load]);

  const open=async(id:number)=>{
    setError('');setModalError('');setMessage('');
    try{
      const detail=await api<Detail>(`/api/vaults/${id}/detail`);
      setCurrent(detail);setMove({amount:'',method:'cash',note:''});
      setGoal({goal:String(detail.vault.goal??0),goalRef:detail.vault.goalRef??''});
    }catch(reason){setError((reason as Error).message)}
  };

  // Versement et retrait partagent le même formulaire : c'est le même geste au
  // comptoir, seul le sens change.
  const submitMove=async(direction:'deposit'|'withdraw')=>{
    if(!current)return;
    const amount=Number(move.amount);
    if(!amount||amount<=0){setModalError('Saisissez un montant supérieur à zéro.');return}
    setBusy(direction);setModalError('');
    try{
      await api(`/api/vaults/${current.vault.id}/${direction}`,{method:'POST',
        body:JSON.stringify({amount,method:move.method,note:move.note})});
      setMove({amount:'',method:move.method,note:''});
      await open(current.vault.id);await load(search);
      setMessage(direction==='deposit'?`Versement de ${money(amount)} enregistré.`:`Retrait de ${money(amount)} enregistré.`);
    }catch(reason){setModalError((reason as Error).message)}
    finally{setBusy('')}
  };

  const saveGoal=async()=>{
    if(!current)return;
    setBusy('goal');setModalError('');
    try{
      await api(`/api/vaults/${current.vault.id}/goal`,{method:'POST',body:JSON.stringify({goal:Number(goal.goal)||0,goalRef:goal.goalRef})});
      await open(current.vault.id);await load(search);setMessage('Objectif enregistré.');
    }catch(reason){setModalError((reason as Error).message)}
    finally{setBusy('')}
  };

  const setStatus=async(status:string)=>{
    if(!current)return;
    setBusy('status');setModalError('');
    try{
      await api(`/api/vaults/${current.vault.id}/status`,{method:'POST',body:JSON.stringify({status})});
      await open(current.vault.id);await load(search);setMessage(`Coffre ${statusLabels[status]?.toLowerCase()}.`);
    }catch(reason){setModalError((reason as Error).message)}
    finally{setBusy('')}
  };

  const startOpening=async()=>{
    setOpening(true);setModalError('');setMessage('');
    setNewVault({customerId:'',goal:'0',goalRef:''});
    try{setCandidates(await api<Candidate[]>('/api/vaults-candidates'))}
    catch(reason){setModalError((reason as Error).message)}
  };

  const createVault=async()=>{
    setBusy('open');setModalError('');
    try{
      const created=await api<{id:number}>('/api/vaults/open',{method:'POST',
        body:JSON.stringify({customerId:Number(newVault.customerId),goal:Number(newVault.goal)||0,goalRef:newVault.goalRef})});
      setOpening(false);setMessage('Coffre ouvert.');
      await load(search);await open(created.id);
    }catch(reason){setModalError((reason as Error).message)}
    finally{setBusy('')}
  };

  return <div className="vaults-page">
    <div className="debt-summary">
      <div className="panel stat"><small>ENCOURS TOTAL</small><strong>{money(totals?.balance??0)}</strong><span>argent des clients détenu</span></div>
      <div className="panel stat"><small>COFFRES OUVERTS</small><strong>{totals?.open??0}</strong><span>{totals?.closed??0} clôturé(s)</span></div>
      <div className="panel stat"><small>VERSEMENTS DU MOIS</small><strong>{money(totals?.monthIn??0)}</strong><span>entrées</span></div>
      <div className="panel stat"><small>RETRAITS DU MOIS</small><strong>{money(totals?.monthOut??0)}</strong><span>sorties</span></div>
    </div>

    {message&&<div className="panel success">{message}</div>}
    {error&&<div className="panel error">{error}</div>}

    <section className="panel vault-list">
      <header>
        <div><h3><WalletCards/>Coffres clients</h3><p>Les clients ouvrent leur coffre depuis la boutique. L’encours est de l’argent qui leur appartient : ce n’est pas un produit de la boutique.</p></div>
        <div>
          <label className="vault-search"><Search/><input value={search} placeholder="Nom ou téléphone" onChange={event=>{setSearch(event.target.value);void load(event.target.value)}}/></label>
          <button className="compact" onClick={()=>void load(search)}><RefreshCw/>Actualiser</button>
          <button className="primary compact" onClick={()=>void startOpening()}><Plus/>Ouvrir un coffre</button>
        </div>
      </header>
      {loading&&rows.length===0?<div className="loading"><i/><span>Chargement des coffres…</span></div>
        :rows.length===0?<p className="empty">Aucun coffre pour l’instant. Un coffre naît à la première visite d’un client sur sa page « Mon coffre ».</p>
        :<table><thead><tr><th>Client</th><th>Téléphone</th><th className="align-right">Solde</th><th>Objectif</th><th>Mouvements</th><th>Dernier</th><th>État</th></tr></thead>
          <tbody>{rows.map(row=>{
            const progress=row.goal>0?Math.min(100,Math.round(row.balance*100/row.goal)):0;
            return <tr key={row.id} onClick={()=>void open(row.id)}>
              <td><strong>{row.name}</strong>{row.goalRef&&<span>{row.goalRef}</span>}</td>
              <td>{row.phone||<em>—</em>}</td>
              <td className="align-right"><strong>{money(row.balance)}</strong></td>
              <td>{row.goal>0
                ?<div className="goal-gauge" title={`${progress} % de ${money(row.goal)}`}><i style={{width:`${progress}%`}}/><span>{progress} %</span></div>
                :<em>—</em>}</td>
              <td>{row.deposits}</td>
              <td>{shortDate(row.lastMoveAt)}</td>
              <td><span className={`campaign-badge ${row.status==='open'?'sent':row.status==='closed'?'failed':'sending'}`}>{statusLabels[row.status]??row.status}</span></td>
            </tr>})}</tbody></table>}
    </section>

    {opening&&<Modal eyebrow="EXCEPTION DE COMPTOIR" title="Ouvrir un coffre"
      subtitle="Réservé au client de passage : un client inscrit sur la boutique ouvre son coffre lui-même."
      onClose={()=>setOpening(false)}
      footer={<>
        <button type="button" onClick={()=>setOpening(false)}>Annuler</button>
        <button type="button" className="primary" onClick={()=>void createVault()} disabled={!newVault.customerId||busy==='open'}>{busy==='open'?'Ouverture…':'Ouvrir le coffre'}</button>
      </>}>
      <div className="form-help"><Info/><span>Seuls les clients actifs sans coffre apparaissent ici.</span></div>
      <div className="form-grid">
        <label>Client<select value={newVault.customerId} onChange={event=>setNewVault({...newVault,customerId:event.target.value})}>
          <option value="">— Choisir —</option>
          {candidates.map(item=><option key={item.id} value={item.id}>{item.name}{item.phone?` — ${item.phone}`:''}</option>)}
        </select></label>
        <label>Objectif (F)<input type="number" min="0" step="1000" value={newVault.goal} onChange={event=>setNewVault({...newVault,goal:event.target.value})}/></label>
        <label className="field-wide">Intitulé de l’objectif<input value={newVault.goalRef} onChange={event=>setNewVault({...newVault,goalRef:event.target.value})} placeholder="Valise Ndar 65 · départ décembre"/></label>
      </div>
      {candidates.length===0&&<p className="empty">Tous les clients actifs ont déjà un coffre.</p>}
      {modalError&&<div className="error">{modalError}</div>}
    </Modal>}

    {current&&<Modal wide eyebrow="COFFRE CLIENT" title={current.customer.name}
      subtitle={`${current.customer.phone||'sans téléphone'} · solde ${money(current.vault.balance)}${current.vault.goalRef?` · objectif : ${current.vault.goalRef}`:''}`}
      onClose={()=>setCurrent(null)}
      footer={<>
        {current.vault.status!=='closed'
          ?<button type="button" onClick={()=>void setStatus('closed')} disabled={busy==='status'}><Lock/>Clôturer</button>
          :<button type="button" onClick={()=>void setStatus('open')} disabled={busy==='status'}><LockOpen/>Rouvrir</button>}
        <button type="button" className="primary" onClick={()=>setCurrent(null)}>Fermer</button>
      </>}>
      {modalError&&<div className="error">{modalError}</div>}

      <div className="vault-actions">
        <div className="form-grid">
          <label>Montant (F)<input type="number" min="0" step="500" value={move.amount} onChange={event=>setMove({...move,amount:event.target.value})} autoFocus/></label>
          <label>Moyen<select value={move.method} onChange={event=>setMove({...move,method:event.target.value})}>{methods.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="field-wide">Note<input value={move.note} onChange={event=>setMove({...move,note:event.target.value})} placeholder="Versement reçu au comptoir"/></label>
        </div>
        <div className="vault-buttons">
          <button type="button" className="primary" onClick={()=>void submitMove('deposit')} disabled={busy!==''||current.vault.status==='closed'}><ArrowDownToLine/>Versement</button>
          <button type="button" onClick={()=>void submitMove('withdraw')} disabled={busy!==''||current.vault.status==='closed'}><ArrowUpFromLine/>Retrait</button>
        </div>
        <p className="hint"><Info/>Un mouvement en espèces alimente la session de caisse ouverte : le tiroir et le coffre restent cohérents.</p>
      </div>

      <div className="form-grid vault-goal">
        <label>Objectif (F)<input type="number" min="0" step="1000" value={goal.goal} onChange={event=>setGoal({...goal,goal:event.target.value})}/></label>
        <label>Intitulé<input value={goal.goalRef} onChange={event=>setGoal({...goal,goalRef:event.target.value})}/></label>
        <div className="vault-open-actions"><button type="button" className="compact" onClick={()=>void saveGoal()} disabled={busy==='goal'}><Target/>Enregistrer l’objectif</button></div>
      </div>

      <h4>Historique</h4>
      {current.moves.length===0?<p className="empty">Aucun mouvement.</p>
        :<table><thead><tr><th>Date</th><th>Référence</th><th>Moyen</th><th>Note</th><th className="align-right">Montant</th></tr></thead>
          <tbody>{current.moves.map(row=><tr key={row.id}>
            <td>{shortDate(row.createdAt)}</td>
            <td>{row.reference}</td>
            <td>{methodLabel(row.method)}</td>
            <td>{row.note||'—'}</td>
            <td className="align-right"><strong className={row.amount<0?'move-out':'move-in'}>{row.amount<0?'− ':'+ '}{money(Math.abs(row.amount))}</strong></td>
          </tr>)}</tbody></table>}

      {current.orders.length>0&&<>
        <h4>Commandes payées au coffre</h4>
        <table><thead><tr><th>Date</th><th>Référence</th><th>État</th><th className="align-right">Montant</th></tr></thead>
          <tbody>{current.orders.map(row=><tr key={row.id}>
            <td>{shortDate(row.createdAt)}</td><td>{row.reference}</td><td>{row.status}</td>
            <td className="align-right">{money(row.total)}</td>
          </tr>)}</tbody></table>
      </>}
    </Modal>}
  </div>;
}
