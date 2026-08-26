import {useCallback,useEffect,useState} from 'react';
import {BellRing,Check,TriangleAlert} from 'lucide-react';
import Modal from './Modal';
import {api} from './api';

// Réglage des seuils d'alerte, par lot.
//
// Le seuil dit à partir de quand un article doit être racheté. Sans lui,
// l'alerte de rupture ne remonte que les stocks à zéro — c'est-à-dire des
// ventes déjà perdues, quand tout l'intérêt est d'être prévenu avant.
//
// Le poser article par article décourage : sur cinquante références, personne
// ne le fait, et la fonction reste lettre morte. On le règle donc sur une
// catégorie entière, ou sur tout le catalogue, en une fois.

type Row={categoryId:number;category:string;total:number;missing:number};
type State={categories:Row[];total:number;missing:number};

export default function StockThresholds({onClose,onDone}:{onClose:()=>void;onDone:()=>void}){
  const[state,setState]=useState<State|null>(null);
  const[scope,setScope]=useState('0');
  const[threshold,setThreshold]=useState('5');
  // Par défaut on n'écrase pas : un seuil posé à la main sur un article
  // précis est une décision, un réglage de masse ne doit pas l'effacer.
  const[onlyMissing,setOnlyMissing]=useState(true);
  const[note,setNote]=useState('');
  const[error,setError]=useState('');
  const[saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    try{setState(await api<State>('/api/stock/thresholds'))}
    catch(problem){setError((problem as Error).message)}
  },[]);
  useEffect(()=>{void load()},[load]);

  const apply=async()=>{
    setSaving(true);setError('');setNote('');
    try{
      const result=await api<{updated:number}>('/api/stock/thresholds',{method:'POST',body:JSON.stringify({
        categoryId:Number(scope)||0,alertAt:Number(threshold)||0,onlyMissing,
      })});
      setNote(result.updated===0
        ?'Aucun article ne correspondait : ils ont déjà tous un seuil.'
        :`Seuil appliqué à ${result.updated} article${result.updated>1?'s':''}.`);
      await load();onDone();
    }catch(problem){setError((problem as Error).message)}
    finally{setSaving(false)}
  };

  const target=state?.categories.find(row=>String(row.categoryId)===scope);
  const concerned=scope==='0'?(onlyMissing?state?.missing??0:state?.total??0)
    :(onlyMissing?target?.missing??0:target?.total??0);

  return <Modal eyebrow="STOCK" title="Seuils d’alerte"
    subtitle="À partir de combien de pièces faut-il être prévenu qu’un article va manquer ?"
    onClose={onClose}
    footer={<><button type="button" onClick={onClose}>Fermer</button>
      <button className="primary" type="button" disabled={saving||concerned===0} onClick={()=>void apply()}>
        <Check/>{saving?'Application…':`Appliquer à ${concerned} article${concerned>1?'s':''}`}</button></>}>
    {error&&<div className="error">{error}</div>}
    {!state?<div className="loading"><i/><span>Lecture du catalogue…</span></div>:<div className="thresholds">
      {state.missing>0
        ?<p className="thresholds-warn"><TriangleAlert/>
          <span><b>{state.missing} article{state.missing>1?'s':''} sur {state.total} n’{state.missing>1?'ont':'a'} aucun seuil.</b>
          {' '}Pour {state.missing>1?'ces articles':'cet article'}, vous ne serez prévenu qu’une fois le stock à zéro — donc trop tard.</span></p>
        :<p className="thresholds-ok"><BellRing/>Tous vos articles ont un seuil : l’alerte vous préviendra avant la rupture.</p>}

      <label>Sur quels articles ?
        <select value={scope} onChange={event=>setScope(event.target.value)}>
          <option value="0">Tout le catalogue · {state.total} article{state.total>1?'s':''}</option>
          {state.categories.map(row=><option key={row.categoryId} value={String(row.categoryId)}>
            {row.category} · {row.total} article{row.total>1?'s':''}{row.missing>0?` (${row.missing} sans seuil)`:''}
          </option>)}
        </select>
      </label>

      <label className="cash-big-field">Prévenir à partir de
        <input type="number" min="0" max="1000" value={threshold} onChange={event=>setThreshold(event.target.value)}/>
        <small>pièces restantes. Une valise qui part à deux par semaine se rachète vers 5.</small>
      </label>

      <label className="thresholds-only">
        <input type="checkbox" checked={onlyMissing} onChange={event=>setOnlyMissing(event.target.checked)}/>
        <span><b>Ne toucher qu’aux articles sans seuil</b>
          <small>À décocher pour remplacer aussi les seuils déjà réglés à la main.</small></span>
      </label>

      {note&&<p className="thresholds-note">{note}</p>}
    </div>}
  </Modal>;
}
