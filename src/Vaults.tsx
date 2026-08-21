import {useCallback,useEffect,useState} from 'react';
import {ArrowDownToLine,ArrowUpFromLine,Lock,LockOpen,Plus,RefreshCw,Search,Target,WalletCards} from 'lucide-react';
import {api,money} from './api';

// Coffres clients — l'épargne que le client constitue au comptoir ou depuis la
// boutique, et avec laquelle il paie ensuite.
//
// L'écran ne se contentait jusqu'ici d'une liste brute : un identifiant, un
// solde, aucun moyen d'enregistrer le billet reçu au comptoir. Ici, versement
// et retrait passent par le serveur dans une transaction verrouillée, et un
// mouvement en espèces alimente la session de caisse ouverte — sinon l'écart
// constaté à la clôture serait exactement celui du versement.

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
    setError('');setMessage('');
    try{
      const detail=await api<Detail>(`/api/vaults/${id}/detail`);
      setCurrent(detail);setMove({amount:'',method:'cash',note:''});
      setGoal({goal:String(detail.vault.goal??0),goalRef:detail.vault.goalRef??''});
    }catch(reason){setError((reason as Error).message)}
  };

  // Versement et retrait partagent le même formulaire : c'est le même geste
  // au comptoir, seul le sens change.
  const submitMove=async(direction:'deposit'|'withdraw')=>{
    if(!current)return;
    const amount=Number(move.amount);
    if(!amount||amount<=0){setError('Saisissez un montant supérieur à zéro.');return}
    setBusy(direction);setError('');setMessage('');
    try{
      await api(`/api/vaults/${current.vault.id}/${direction}`,{method:'POST',
        body:JSON.stringify({amount,method:move.method,note:move.note})});
      setMessage(direction==='deposit'?`Versement de ${money(amount)} enregistré.`:`Retrait de ${money(amount)} enregistré.`);
      setMove({amount:'',method:move.method,note:''});
      await open(current.vault.id);await load(search);
    }catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  const saveGoal=async()=>{
    if(!current)return;
    setBusy('goal');setError('');setMessage('');
    try{
      await api(`/api/vaults/${current.vault.id}/goal`,{method:'POST',body:JSON.stringify({goal:Number(goal.goal)||0,goalRef:goal.goalRef})});
      setMessage('Objectif enregistré.');await open(current.vault.id);await load(search);
    }catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  const setStatus=async(status:string)=>{
    if(!current)return;
    if(status==='closed'&&!confirm('Clôturer ce coffre ? Le solde doit être à zéro.'))return;
    setBusy('status');setError('');setMessage('');
    try{
      await api(`/api/vaults/${current.vault.id}/status`,{method:'POST',body:JSON.stringify({status})});
      setMessage(`Coffre ${statusLabels[status]?.toLowerCase()}.`);await open(current.vault.id);await load(search);
    }catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  const startOpening=async()=>{
    setOpening(true);setError('');setMessage('');
    try{setCandidates(await api<Candidate[]>('/api/vaults-candidates'))}
    catch(reason){setError((reason as Error).message)}
  };

  const createVault=async()=>{
    setBusy('open');setError('');setMessage('');
    try{
      const created=await api<{id:number}>('/api/vaults/open',{method:'POST',
        body:JSON.stringify({customerId:Number(newVault.customerId),goal:Number(newVault.goal)||0,goalRef:newVault.goalRef})});
      setMessage('Coffre ouvert.');setOpening(false);setNewVault({customerId:'',goal:'0',goalRef:''});
      await load(search);await open(created.id);
    }catch(reason){setError((reason as Error).message)}
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
        <div><h3><WalletCards/>Coffres clients</h3><p>L’encours est de l’argent qui appartient aux clients : il n’est pas un produit de la boutique.</p></div>
        <div>
          <label className="vault-search"><Search/><input value={search} placeholder="Nom ou téléphone" onChange={event=>{setSearch(event.target.value);void load(event.target.value)}}/></label>
          <button className="compact" onClick={()=>void load(search)}><RefreshCw/>Actualiser</button>
          <button className="primary compact" onClick={()=>void startOpening()}><Plus/>Ouvrir un coffre</button>
        </div>
      </header>
      {opening&&<div className="vault-open-form settings-fields">
        <label>Client sans coffre<select value={newVault.customerId} onChange={event=>setNewVault({...newVault,customerId:event.target.value})}>
          <option value="">— Choisir —</option>
          {candidates.map(item=><option key={item.id} value={item.id}>{item.name}{item.phone?` — ${item.phone}`:''}</option>)}
        </select></label>
        <label>Objectif (F)<input type="number" min="0" step="1000" value={newVault.goal} onChange={event=>setNewVault({...newVault,goal:event.target.value})}/></label>
        <label className="field-wide">Intitulé de l’objectif<input value={newVault.goalRef} onChange={event=>setNewVault({...newVault,goalRef:event.target.value})} placeholder="Valise Ndar 65 · départ décembre"/></label>
        <div className="vault-open-actions">
          <button className="primary compact" onClick={()=>void createVault()} disabled={!newVault.customerId||busy==='open'}>Ouvrir</button>
          <button className="compact" onClick={()=>setOpening(false)}>Annuler</button>
        </div>
        {candidates.length===0&&<p className="hint">Tous les clients actifs ont déjà un coffre.</p>}
      </div>}
      {loading&&rows.length===0?<div className="loading"><i/><span>Chargement des coffres…</span></div>
        :rows.length===0?<p className="empty">Aucun coffre ouvert pour l’instant.</p>
        :<table><thead><tr><th>Client</th><th>Téléphone</th><th className="align-right">Solde</th><th>Objectif</th><th>Mouvements</th><th>Dernier</th><th>État</th></tr></thead>
          <tbody>{rows.map(row=>{
            const progress=row.goal>0?Math.min(100,Math.round(row.balance*100/row.goal)):0;
            return <tr key={row.id} className={current?.vault.id===row.id?'selected':''} onClick={()=>void open(row.id)}>
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

    {current&&<section className="panel vault-detail">
      <header>
        <div><h3>{current.customer.name}</h3><p>{current.customer.phone||'sans téléphone'} · solde <b>{money(current.vault.balance)}</b>{current.vault.goalRef?` · objectif : ${current.vault.goalRef}`:''}</p></div>
        <div>
          {current.vault.status!=='closed'
            ?<button className="compact" onClick={()=>void setStatus('closed')} disabled={busy==='status'}><Lock/>Clôturer</button>
            :<button className="compact" onClick={()=>void setStatus('open')} disabled={busy==='status'}><LockOpen/>Rouvrir</button>}
        </div>
      </header>

      <div className="vault-actions">
        <div className="settings-fields">
          <label>Montant (F)<input type="number" min="0" step="500" value={move.amount} onChange={event=>setMove({...move,amount:event.target.value})}/></label>
          <label>Moyen<select value={move.method} onChange={event=>setMove({...move,method:event.target.value})}>{methods.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="field-wide">Note<input value={move.note} onChange={event=>setMove({...move,note:event.target.value})} placeholder="Versement reçu au comptoir"/></label>
        </div>
        <div className="vault-buttons">
          <button className="primary" onClick={()=>void submitMove('deposit')} disabled={busy!==''||current.vault.status==='closed'}><ArrowDownToLine/>Versement</button>
          <button onClick={()=>void submitMove('withdraw')} disabled={busy!==''||current.vault.status==='closed'}><ArrowUpFromLine/>Retrait</button>
        </div>
        <p className="hint">Un mouvement en espèces alimente la session de caisse ouverte : le tiroir et le coffre restent cohérents.</p>
      </div>

      <div className="settings-fields vault-goal">
        <label>Objectif (F)<input type="number" min="0" step="1000" value={goal.goal} onChange={event=>setGoal({...goal,goal:event.target.value})}/></label>
        <label>Intitulé<input value={goal.goalRef} onChange={event=>setGoal({...goal,goalRef:event.target.value})}/></label>
        <div className="vault-open-actions"><button className="compact" onClick={()=>void saveGoal()} disabled={busy==='goal'}><Target/>Enregistrer l’objectif</button></div>
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
    </section>}
  </div>;
}
