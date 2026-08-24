import {FormEvent,useCallback,useEffect,useMemo,useState} from 'react';
import {CalendarDays,ImagePlus,Pencil,Plus,Receipt,RefreshCw,Settings2,Trash2,Wallet} from 'lucide-react';
import Modal from './Modal';
import {api,apiForm,money} from './api';
import type {User} from './Sidebar';

// Les dépenses quotidiennes.
//
// La page tenait sur une seule journée : un graphique, quatre totaux, un
// formulaire de neuf champs posé à gauche en permanence. Pour savoir ce qui
// avait été dépensé la semaine passée, il fallait cliquer sept fois sur une
// flèche.
//
// Elle suit maintenant la forme des factures : une liste, un filtre de
// périodes, et la saisie dans une fenêtre. Cette fenêtre est coupée en deux —
// à droite les postes de dépense avec leur image, à gauche le montant et la
// date. On reconnaît un compteur électrique plus vite qu'on ne lit le mot
// « électricité », et le poste choisi est de loin la partie la plus longue à
// saisir au clavier.

type Named={id:number;name:string};
type Expense={id:number;reference:string;spentOn:string;category:string;label:string;amount:number;paymentMethod:string;supplierId:number|null;userId:number;note:string;supplier?:Named|null;user?:Named|null};
type ExpenseType={id:number;name:string;slug:string;imageUrl:string;position:number;active:boolean};
type Method={id:string;label:string;active:boolean};
type Range={from:string;to:string};

const fallbackMethods:Method[]=[{id:'cash',label:'Espèces',active:true},{id:'wave',label:'Wave',active:true},{id:'orange_money',label:'Orange Money',active:true},{id:'card',label:'Carte bancaire',active:true},{id:'bank_transfer',label:'Virement',active:true}];

const isoDay=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const today=()=>isoDay(new Date());
const shiftDay=(days:number)=>{const date=new Date();date.setDate(date.getDate()+days);return isoDay(date)};
const monthStart=()=>{const date=new Date();date.setDate(1);return isoDay(date)};
const dayLabel=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(`${iso.slice(0,10)}T12:00:00`));
const shortDate=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short'}).format(new Date(`${iso.slice(0,10)}T12:00:00`));

// Les périodes qu'on demande vraiment. « Du 3 au 17 » existe aussi, mais reste
// derrière un bouton : c'est le cas rare.
const presets:{id:string;label:string;range:()=>Range}[]=[
  {id:'today',label:'Aujourd’hui',range:()=>({from:today(),to:today()})},
  {id:'week',label:'7 derniers jours',range:()=>({from:shiftDay(-6),to:today()})},
  {id:'month',label:'30 derniers jours',range:()=>({from:shiftDay(-29),to:today()})},
  {id:'calendar',label:'Ce mois-ci',range:()=>({from:monthStart(),to:today()})},
];

export default function Expenses({user}:{user:User}){
  const[preset,setPreset]=useState('today');
  const[range,setRange]=useState<Range>(()=>presets[0].range());
  const[rows,setRows]=useState<Expense[]>([]);
  const[types,setTypes]=useState<ExpenseType[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[message,setMessage]=useState('');
  const[dialog,setDialog]=useState<''|'record'|'types'>('');
  const[editing,setEditing]=useState<Expense|null>(null);
  const isAdmin=user.role==='manager';

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setRows(await api<Expense[]>(`/api/expenses?from=${range.from}&to=${range.to}&limit=500`)??[])}
    catch(problem){setError((problem as Error).message)}
    finally{setLoading(false)}
  },[range]);
  const loadTypes=useCallback(async()=>{
    try{setTypes(await api<ExpenseType[]>('/api/expense-types')??[])}catch{/* la saisie reste possible sans image */}
  },[]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{void loadTypes()},[loadTypes]);

  const total=useMemo(()=>rows.reduce((sum,row)=>sum+Number(row.amount??0),0),[rows]);
  // Les dépenses se lisent par jour : un total quotidien en tête de groupe
  // répond à « combien hier ? » sans additionner de tête.
  const groups=useMemo(()=>{
    const map=new Map<string,Expense[]>();
    for(const row of rows){const key=row.spentOn.slice(0,10);map.set(key,[...(map.get(key)??[]),row])}
    return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
  },[rows]);
  const typeOf=(slug:string)=>types.find(item=>item.slug===slug);

  const choose=(id:string)=>{
    setPreset(id);
    const found=presets.find(item=>item.id===id);
    if(found)setRange(found.range());
  };
  const remove=async(row:Expense)=>{
    if(!confirm(`Supprimer définitivement la dépense « ${row.label} » de ${money(row.amount)} ?`))return;
    setError('');setMessage('');
    try{await api(`/api/expenses/${row.id}`,{method:'DELETE'});setMessage('Dépense supprimée.');await load()}
    catch(problem){setError((problem as Error).message)}
  };

  return <div className="expenses-page">
    <section className="panel expense-bar">
      <div className="expense-periods">
        {presets.map(item=><button key={item.id} className={preset===item.id?'active':''} onClick={()=>choose(item.id)}>{item.label}</button>)}
        <button className={preset==='custom'?'active':''} onClick={()=>setPreset('custom')}><CalendarDays/>Du… au…</button>
      </div>
      {preset==='custom'&&<div className="expense-custom">
        <label>Du<input type="date" value={range.from} max={range.to} onChange={event=>setRange({...range,from:event.target.value})}/></label>
        <label>Au<input type="date" value={range.to} min={range.from} max={today()} onChange={event=>setRange({...range,to:event.target.value})}/></label>
      </div>}
      <div className="expense-actions">
        <button className="refresh-button" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?'spin':''}/><span>Actualiser</span></button>
        <button onClick={()=>setDialog('types')}><Settings2/>Types de dépense</button>
        <button className="primary" onClick={()=>{setEditing(null);setDialog('record')}}><Plus/>Enregistrer une dépense</button>
      </div>
    </section>

    <section className="panel expense-total">
      <div><small>TOTAL DE LA PÉRIODE</small><strong>{money(total)}</strong></div>
      <span>{rows.length} dépense{rows.length!==1?'s':''} · du {shortDate(range.from)} au {shortDate(range.to)}</span>
    </section>

    {error&&<div className="panel error">{error}</div>}
    {message&&<div className="panel success">{message}</div>}

    <section className="panel expense-list">
      {loading?<div className="loading"><i/><span>Lecture des dépenses…</span></div>
        :groups.length===0?<p className="empty">Aucune dépense sur cette période.</p>
        :groups.map(([day,items])=><div className="expense-day" key={day}>
          <h3>{dayLabel(day)}<b>{money(items.reduce((sum,row)=>sum+row.amount,0))}</b></h3>
          <ul>{items.map(row=>{const type=typeOf(row.category);return <li key={row.id}>
            <span className="expense-icon">{type?.imageUrl?<img src={type.imageUrl} alt=""/>:<Receipt/>}</span>
            <span className="expense-what"><b>{type?.name??row.label}</b>
              <small>{[row.note,row.user?.name].filter(Boolean).join(' · ')||row.reference}</small></span>
            <span className="expense-amount">{money(row.amount)}</span>
            <span className="expense-row-actions">
              <button title="Modifier" aria-label={`Modifier ${row.label}`} onClick={()=>{setEditing(row);setDialog('record')}}><Pencil/></button>
              {isAdmin&&<button className="danger" title="Supprimer" aria-label={`Supprimer ${row.label}`} onClick={()=>void remove(row)}><Trash2/></button>}
            </span>
          </li>})}</ul>
        </div>)}
    </section>

    {dialog==='record'&&<RecordExpense types={types} editing={editing}
      onClose={()=>{setDialog('');setEditing(null)}}
      onDone={saved=>{setDialog('');setEditing(null);setMessage(saved);void load()}}/>}
    {dialog==='types'&&<ManageTypes types={types} onClose={()=>setDialog('')} onChanged={()=>void loadTypes()}/>}
  </div>;
}

// Saisie d'une dépense : le poste à droite, le reste à gauche.
function RecordExpense({types,editing,onClose,onDone}:{types:ExpenseType[];editing:Expense|null;onClose:()=>void;onDone:(message:string)=>void}){
  const usable=types.filter(item=>item.active||item.slug===editing?.category);
  const[slug,setSlug]=useState(editing?.category??usable[0]?.slug??'');
  const[amount,setAmount]=useState(editing?String(editing.amount):'');
  const[note,setNote]=useState(editing?.note??'');
  const[spentOn,setSpentOn]=useState(editing?editing.spentOn.slice(0,10):today());
  const[method,setMethod]=useState(editing?.paymentMethod??'cash');
  const[methods,setMethods]=useState<Method[]>(fallbackMethods);
  const[error,setError]=useState('');const[saving,setSaving]=useState(false);

  useEffect(()=>{
    api<{paymentMethods:Method[]}>('/api/checkout-settings')
      .then(config=>{const active=(config.paymentMethods??[]).filter(item=>item.active);if(active.length)setMethods(active)})
      .catch(()=>{/* la liste de secours fait l'affaire */});
  },[]);

  const chosen=types.find(item=>item.slug===slug);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(!slug){setError('Choisissez un type de dépense.');return}
    if(!(Number(amount)>0)){setError('Le montant doit être supérieur à zéro.');return}
    setSaving(true);setError('');
    // Le libellé enregistré est le nom du poste : c'est lui qui s'affiche dans
    // le journal du gérant et sur les rapports.
    const body={spentOn,category:slug,label:chosen?.name??slug,amount:Number(amount),
      paymentMethod:method,supplierId:editing?.supplierId??null,note:note.trim()};
    try{
      if(editing)await api(`/api/expenses/${editing.id}`,{method:'PUT',body:JSON.stringify(body)});
      else await api('/api/expenses',{method:'POST',body:JSON.stringify(body)});
      onDone(editing?`Dépense « ${body.label} » modifiée.`:`Dépense « ${body.label} » enregistrée (${money(body.amount)}).`);
    }catch(problem){setError((problem as Error).message);setSaving(false)}
  };

  return <Modal wide eyebrow="DÉPENSE" title={editing?'Modifier la dépense':'Enregistrer une dépense'}
    subtitle="Choisissez le poste à droite, puis indiquez le montant." onClose={onClose}
    footer={<><button type="button" onClick={onClose}>Annuler</button>
      <button className="primary" form="expense-form" disabled={saving}>{saving?'Enregistrement…':editing?'Enregistrer les modifications':'Enregistrer la dépense'}</button></>}>
    <div className="expense-record">
      <form id="expense-form" onSubmit={submit} className="expense-record-form">
        {error&&<div className="error">{error}</div>}
        <div className="expense-chosen">{chosen?.imageUrl?<img src={chosen.imageUrl} alt=""/>:<Receipt/>}
          <span>{chosen?.name??'Aucun poste choisi'}</span></div>
        <label className="cash-big-field">Montant
          <input type="number" min="1" step="1" autoFocus value={amount} onChange={event=>setAmount(event.target.value)} placeholder="0"/>
        </label>
        <label>Référence <small>(facultative)</small>
          <input value={note} onChange={event=>setNote(event.target.value)} placeholder="N° de reçu, nom du fournisseur…"/>
        </label>
        <label>Date<input type="date" value={spentOn} max={today()} onChange={event=>setSpentOn(event.target.value||today())}/></label>
        <label>Réglée par
          <select value={method} onChange={event=>setMethod(event.target.value)}>
            {methods.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <small>Une dépense en espèces sort de la caisse ouverte.</small>
        </label>
      </form>
      <div className="expense-types-pick">
        {usable.map(item=><button type="button" key={item.id} className={item.slug===slug?'active':''} onClick={()=>setSlug(item.slug)}>
          {item.imageUrl?<img src={item.imageUrl} alt=""/>:<Receipt/>}
          <span>{item.name}</span>
        </button>)}
      </div>
    </div>
  </Modal>;
}

// Gestion des postes : renommer, illustrer, ajouter, retirer.
function ManageTypes({types,onClose,onChanged}:{types:ExpenseType[];onClose:()=>void;onChanged:()=>void}){
  const[rows,setRows]=useState(types);
  const[name,setName]=useState('');
  const[error,setError]=useState('');
  const[busy,setBusy]=useState(0);

  const refresh=async()=>{
    try{const fresh=await api<ExpenseType[]>('/api/expense-types');setRows(fresh??[]);onChanged()}
    catch(problem){setError((problem as Error).message)}
  };
  const add=async(event:FormEvent)=>{
    event.preventDefault();
    if(!name.trim())return;
    setError('');
    try{await api('/api/expense-types',{method:'POST',body:JSON.stringify({name:name.trim(),active:true})});setName('');await refresh()}
    catch(problem){setError((problem as Error).message)}
  };
  const save=async(row:ExpenseType,patch:Partial<ExpenseType>)=>{
    setError('');
    try{await api(`/api/expense-types/${row.id}`,{method:'PUT',body:JSON.stringify({...row,...patch})});await refresh()}
    catch(problem){setError((problem as Error).message)}
  };
  const upload=async(row:ExpenseType,file?:File)=>{
    if(!file)return;
    setBusy(row.id);setError('');
    try{const body=new FormData();body.append('image',file);await apiForm(`/api/expense-types/${row.id}/image`,body);await refresh()}
    catch(problem){setError((problem as Error).message)}
    finally{setBusy(0)}
  };
  const remove=async(row:ExpenseType)=>{
    if(!confirm(`Retirer le type « ${row.name} » ? Les dépenses déjà enregistrées le gardent.`))return;
    setError('');
    try{await api(`/api/expense-types/${row.id}`,{method:'DELETE'});await refresh()}
    catch(problem){setError((problem as Error).message)}
  };

  return <Modal wide eyebrow="DÉPENSES" title="Types de dépense"
    subtitle="Nommez vos postes et donnez-leur une image : la saisie devient un choix." onClose={onClose}
    footer={<button className="primary" type="button" onClick={onClose}>Terminé</button>}>
    {error&&<div className="error">{error}</div>}
    <form className="expense-type-add" onSubmit={add}>
      <input value={name} onChange={event=>setName(event.target.value)} placeholder="Nom du poste — gardien, livreur, thé…"/>
      <button className="primary" disabled={!name.trim()}><Plus/>Ajouter</button>
    </form>
    <ul className="expense-type-list">{rows.map(row=><li key={row.id}>
      <label className={busy===row.id?'expense-type-image uploading':'expense-type-image'} title="Changer l’image">
        {row.imageUrl?<img src={row.imageUrl} alt=""/>:<ImagePlus/>}
        <input type="file" accept="image/png,image/jpeg" onChange={event=>{void upload(row,event.target.files?.[0]);event.target.value=''}}/>
      </label>
      <input className="expense-type-name" defaultValue={row.name} onBlur={event=>{if(event.target.value.trim()&&event.target.value!==row.name)void save(row,{name:event.target.value.trim()})}}/>
      <label className="expense-type-active" title="Proposé à la saisie">
        <input type="checkbox" checked={row.active} onChange={event=>void save(row,{active:event.target.checked})}/>
        <span>Actif</span>
      </label>
      <button type="button" className="danger" title="Retirer" aria-label={`Retirer ${row.name}`} onClick={()=>void remove(row)}><Trash2/></button>
    </li>)}</ul>
    <p className="expense-type-hint"><Wallet/>Retirer un poste ne touche pas aux dépenses déjà enregistrées : elles restent dans les rapports.</p>
  </Modal>;
}
