import {FormEvent,useCallback,useEffect,useMemo,useState} from 'react';
import {Banknote,CalendarDays,ChevronLeft,ChevronRight,Pencil,Plus,Receipt,RefreshCw,Trash2,TriangleAlert,Wallet,X} from 'lucide-react';
import {Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {api,money} from './api';
import {useChartTheme} from './chartTheme';
import type {User} from './Sidebar';

type Named={id:number;name:string};
type Expense={id:number;reference:string;spentOn:string;category:string;label:string;amount:number;paymentMethod:string;supplierId:number|null;userId:number;note:string;supplier?:Named|null;user?:Named|null};
type Group={name:string;amount:number;count:number};
type Point={date:string;amount:number;count:number};
type Summary={
  date:string;day:{amount:number;count:number};
  month:{amount:number;count:number;from:string;categories:Group[]};
  categories:Group[];methods:Group[];trend:Point[];
  sales:{billed:number;collected:number;net:number};
};
type Method={id:string;label:string;active:boolean};
type FormState={spentOn:string;amount:string;category:string;label:string;paymentMethod:string;supplierId:string;note:string};

// Les postes de dépense courants d'une boutique : le vendeur choisit, il ne saisit pas.
const categories=[
  {value:'achats',label:'Achats et marchandises'},
  {value:'transport',label:'Transport et livraison'},
  {value:'carburant',label:'Carburant'},
  {value:'loyer',label:'Loyer'},
  {value:'salaires',label:'Salaires et primes'},
  {value:'electricite',label:'Électricité'},
  {value:'eau',label:'Eau'},
  {value:'telecom',label:'Téléphone et internet'},
  {value:'fournitures',label:'Fournitures'},
  {value:'entretien',label:'Entretien et réparations'},
  {value:'marketing',label:'Publicité et marketing'},
  {value:'taxes',label:'Taxes et impôts'},
  {value:'banque',label:'Frais bancaires'},
  {value:'restauration',label:'Restauration'},
  {value:'divers',label:'Divers'},
];
const fallbackMethods:Method[]=[{id:'cash',label:'Espèces',active:true},{id:'wave',label:'Wave',active:true},{id:'orange_money',label:'Orange Money',active:true},{id:'card',label:'Carte bancaire',active:true},{id:'bank_transfer',label:'Virement',active:true}];
const categoryLabel=(value:string)=>categories.find(item=>item.value===value)?.label??value;

const isoDay=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const today=()=>isoDay(new Date());
const shiftDay=(iso:string,days:number)=>{const date=new Date(`${iso}T12:00:00`);date.setDate(date.getDate()+days);return isoDay(date)};
const longDate=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${iso}T12:00:00`));
const shortDate=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(new Date(iso));
const monthLabel=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(iso));
const emptyForm=(date:string):FormState=>({spentOn:date,amount:'',category:'achats',label:'',paymentMethod:'cash',supplierId:'',note:''});

export default function Expenses({user}:{user:User}){
  const[date,setDate]=useState(today());
  const[rows,setRows]=useState<Expense[]>([]);
  const[summary,setSummary]=useState<Summary|null>(null);
  const[suppliers,setSuppliers]=useState<Named[]>([]);
  const[methods,setMethods]=useState<Method[]>(fallbackMethods);
  const[form,setForm]=useState<FormState>(()=>emptyForm(today()));
  const[editing,setEditing]=useState<Expense|null>(null);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState('');
  const[message,setMessage]=useState('');
  const isAdmin=user.role==='manager';

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const[list,stats]=await Promise.all([api<Expense[]>(`/api/expenses?date=${date}`),api<Summary>(`/api/expenses/summary?date=${date}`)]);
      setRows(list??[]);setSummary(stats);
    }catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[date]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{
    api<Named[]>('/api/suppliers').then(setSuppliers).catch(()=>{});
    api<{paymentMethods:Method[]}>('/api/checkout-settings').then(config=>{const active=(config.paymentMethods??[]).filter(method=>method.active);if(active.length)setMethods(active)}).catch(()=>{});
  },[]);
  useEffect(()=>{if(!editing)setForm(current=>({...current,spentOn:date}))},[date,editing]);

  const total=useMemo(()=>rows.reduce((sum,row)=>sum+Number(row.amount??0),0),[rows]);
  const biggest=useMemo(()=>rows.reduce((max,row)=>Math.max(max,Number(row.amount??0)),0),[rows]);
  const isToday=date===today();

  const startEdit=(row:Expense)=>{
    setEditing(row);setMessage('');setError('');
    setForm({spentOn:row.spentOn.slice(0,10),amount:String(row.amount),category:row.category||'divers',label:row.label,paymentMethod:row.paymentMethod||'cash',supplierId:row.supplierId?String(row.supplierId):'',note:row.note??''});
  };
  const cancelEdit=()=>{setEditing(null);setForm(emptyForm(date))};
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    const amount=Number(form.amount);
    if(!amount||amount<=0){setError('Le montant de la dépense doit être supérieur à zéro');return}
    if(!form.label.trim()){setError('Indiquez à quoi correspond la dépense');return}
    setSaving(true);setError('');setMessage('');
    const body={spentOn:form.spentOn||date,category:form.category,label:form.label.trim(),amount,paymentMethod:form.paymentMethod,supplierId:form.supplierId?Number(form.supplierId):null,note:form.note.trim()};
    try{
      if(editing)await api(`/api/expenses/${editing.id}`,{method:'PUT',body:JSON.stringify(body)});
      else await api('/api/expenses',{method:'POST',body:JSON.stringify(body)});
      setMessage(editing?`Dépense « ${body.label} » modifiée.`:`Dépense « ${body.label} » enregistrée (${money(amount)}).`);
      setEditing(null);setForm(emptyForm(body.spentOn));
      if(body.spentOn!==date)setDate(body.spentOn);else await load();
    }catch(reason){setError((reason as Error).message)}
    finally{setSaving(false)}
  };
  const remove=async(row:Expense)=>{
    if(!confirm(`Supprimer définitivement la dépense « ${row.label} » de ${money(row.amount)} ?`))return;
    setError('');setMessage('');
    try{await api(`/api/expenses/${row.id}`,{method:'DELETE'});if(editing?.id===row.id)cancelEdit();setMessage('Dépense supprimée.');await load()}
    catch(reason){setError((reason as Error).message)}
  };

  return <div className="expenses-page">
    <section className="expense-daybar">
      <div className="expense-day-nav">
        <button type="button" onClick={()=>setDate(shiftDay(date,-1))} title="Jour précédent" aria-label="Jour précédent"><ChevronLeft/></button>
        <label className="expense-day-picker"><CalendarDays/><input type="date" value={date} max={today()} onChange={event=>setDate(event.target.value||today())}/></label>
        <button type="button" onClick={()=>setDate(shiftDay(date,1))} disabled={isToday} title="Jour suivant" aria-label="Jour suivant"><ChevronRight/></button>
      </div>
      <div className="expense-day-title"><strong>{longDate(date)}</strong><span>{isToday?'Journée en cours':'Journée passée'} · {rows.length} dépense{rows.length!==1?'s':''}</span></div>
      <button type="button" className="expense-today" onClick={()=>setDate(today())} disabled={isToday}>Aujourd’hui</button>
      <button type="button" className="refresh-button" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?'spin':''}/><span>Actualiser</span></button>
    </section>

    {error&&<div className="error resource-error">{error}</div>}
    {message&&<div className="success resource-error">{message}</div>}

    <section className="expense-cards">
      <article className="summary-card tone-danger"><span>DÉPENSES DU JOUR</span><strong>{money(total)}</strong><small>{rows.length} ligne{rows.length!==1?'s':''} · plus forte {money(biggest)}</small></article>
      <article className="summary-card tone-info"><span>CUMUL DU MOIS</span><strong>{money(summary?.month.amount??0)}</strong><small>{summary?.month.count??0} dépense{(summary?.month.count??0)!==1?'s':''} en {summary?monthLabel(summary.month.from):'—'}</small></article>
      <article className="summary-card tone-success"><span>ENCAISSÉ LE MÊME JOUR</span><strong>{money(summary?.sales.collected??0)}</strong><small>{money(summary?.sales.billed??0)} facturé</small></article>
      <article className={`summary-card tone-${(summary?.sales.net??0)>=0?'success':'danger'}`}><span>SOLDE DE LA JOURNÉE</span><strong>{money(summary?.sales.net??0)}</strong><small>encaissé moins dépenses</small></article>
    </section>

    <div className="expense-layout">
      <form className="panel expense-form" onSubmit={submit}>
        <header>
          <div><small>{editing?'MODIFICATION':'NOUVELLE DÉPENSE'}</small><h2>{editing?editing.reference:'Enregistrer une dépense'}</h2></div>
          {editing&&<button type="button" className="icon" onClick={cancelEdit} title="Annuler la modification"><X/></button>}
        </header>
        <div className="expense-fields">
          <label className="expense-amount-field">Montant (F CFA)<input type="number" min="1" step="1" inputMode="numeric" placeholder="0" value={form.amount} onChange={event=>setForm({...form,amount:event.target.value})} required/></label>
          <label>Catégorie<select value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="field-wide">Libellé<input placeholder="Ex. Taxi livraison Sacré-Cœur" value={form.label} onChange={event=>setForm({...form,label:event.target.value})} required/></label>
          <label>Payé par<select value={form.paymentMethod} onChange={event=>setForm({...form,paymentMethod:event.target.value})}>{methods.map(method=><option key={method.id} value={method.id}>{method.label}</option>)}</select></label>
          <label>Date de la dépense<input type="date" value={form.spentOn} max={today()} onChange={event=>setForm({...form,spentOn:event.target.value})}/></label>
          <label>Fournisseur (facultatif)<select value={form.supplierId} onChange={event=>setForm({...form,supplierId:event.target.value})}><option value="">Aucun</option>{suppliers.map(supplier=><option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label className="field-wide">Note (facultatif)<textarea rows={2} placeholder="Précision utile pour le contrôle de caisse" value={form.note} onChange={event=>setForm({...form,note:event.target.value})}/></label>
        </div>
        <button className="primary" type="submit" disabled={saving}>{editing?<Pencil/>:<Plus/>}{saving?'Enregistrement…':editing?'Enregistrer les modifications':'Ajouter la dépense'}</button>
      </form>

      <section className="panel expense-list">
        <header><div><small>REGISTRE DU JOUR</small><h2>Dépenses du {shortDate(`${date}T12:00:00`)}</h2></div><strong>{money(total)}</strong></header>
        {loading?<div className="loading"><i/><span>Chargement…</span></div>
        :rows.length===0?<div className="empty"><Receipt/><h3>Aucune dépense ce jour-là</h3><p>Ajoutez la première dépense avec le formulaire de gauche.</p></div>
        :<div className="table-wrap"><table className="records-table">
          <thead><tr><th>Libellé</th><th>Catégorie</th><th>Paiement</th><th className="align-right">Montant</th><th className="actions-heading">Actions</th></tr></thead>
          <tbody>{rows.map(row=><tr key={row.id}>
            <td><strong>{row.label}</strong>{row.note&&<small className="expense-note">{row.note}</small>}{row.supplier?.name&&<small className="expense-note">Fournisseur · {row.supplier.name}</small>}</td>
            <td><span className="semantic-badge neutral"><Receipt/>{categoryLabel(row.category)}</span></td>
            <td>{methods.find(method=>method.id===row.paymentMethod)?.label??row.paymentMethod??'—'}</td>
            <td className="align-right expense-amount">{money(row.amount)}</td>
            <td><div className="row-actions">
              <button className="action-button" onClick={()=>startEdit(row)} title="Modifier"><Pencil/><span>Modifier</span></button>
              {isAdmin&&<button className="action-button danger" onClick={()=>void remove(row)} title="Supprimer"><Trash2/><span>Supprimer</span></button>}
            </div></td>
          </tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>Total de la journée</td><td className="align-right expense-amount">{money(total)}</td><td/></tr></tfoot>
        </table></div>}
      </section>
    </div>

    <section className="expense-analytics">
      <article className="chart-card">
        <header><h2>Répartition du jour</h2><p>Où est parti l’argent le {shortDate(`${date}T12:00:00`)}.</p></header>
        <Breakdown items={summary?.categories??[]} labelOf={categoryLabel} icon={<Receipt/>}/>
      </article>
      <article className="chart-card">
        <header><h2>Moyens de paiement</h2><p>Comment les dépenses ont été réglées.</p></header>
        <Breakdown items={summary?.methods??[]} labelOf={value=>methods.find(method=>method.id===value)?.label??value} icon={<Wallet/>}/>
      </article>
      <article className="chart-card">
        <header><h2>Postes du mois</h2><p>Cumul de {summary?monthLabel(summary.month.from):'—'}.</p></header>
        <Breakdown items={summary?.month.categories??[]} labelOf={categoryLabel} icon={<Banknote/>}/>
      </article>
      <article className="chart-card expense-trend-card">
        <header><h2>30 derniers jours</h2><p>Dépenses quotidiennes jusqu’au {shortDate(`${date}T12:00:00`)}.</p></header>
        <TrendChart points={summary?.trend??[]}/>
      </article>
    </section>
  </div>;
}

function Breakdown({items,labelOf,icon}:{items:Group[];labelOf:(value:string)=>string;icon:React.ReactNode}){
  if(!items.length)return <div className="empty-chart">{icon}<span>Aucune dépense sur cette période.</span></div>;
  const max=Math.max(...items.map(item=>item.amount),1);
  const total=items.reduce((sum,item)=>sum+item.amount,0);
  return <div className="ranking">{items.slice(0,8).map(item=><div key={item.name}>
    <span title={labelOf(item.name)}>{labelOf(item.name)}</span>
    <div><i style={{width:`${item.amount/max*100}%`}}/></div>
    <strong title={`${item.count} dépense${item.count!==1?'s':''}`}>{money(item.amount)}{total?` · ${Math.round(item.amount/total*100)} %`:''}</strong>
  </div>)}</div>;
}

function TrendChart({points}:{points:Point[]}){
  const chart=useChartTheme();
  if(!points.some(point=>point.amount>0))return <div className="empty-chart"><TriangleAlert/><span>Aucune dépense enregistrée sur les 30 derniers jours.</span></div>;
  return <div className="chart-small"><ResponsiveContainer width="100%" height="100%"><BarChart data={points} margin={{top:8,right:6,left:0,bottom:0}}>
    <CartesianGrid stroke={chart.grid} vertical={false}/>
    <XAxis dataKey="date" tickFormatter={value=>shortDate(String(value))} axisLine={false} tickLine={false} minTickGap={24}/>
    <YAxis tickFormatter={value=>new Intl.NumberFormat('fr-FR',{notation:'compact',maximumFractionDigits:1}).format(Number(value))} axisLine={false} tickLine={false} width={54}/>
    <Tooltip content={<TrendTooltip/>} cursor={{fill:chart.surface}}/>
    <Bar dataKey="amount" name="Dépenses" fill={chart.series[2]} radius={[4,4,0,0]} maxBarSize={22}/>
  </BarChart></ResponsiveContainer></div>;
}

function TrendTooltip({active,payload,label}:{active?:boolean;payload?:Array<{value:number}>;label?:string}){
  if(!active||!payload?.length)return null;
  return <div className="chart-tooltip"><strong>{label?new Date(label).toLocaleDateString('fr-FR'):''}</strong><div><i style={{background:'var(--chart-3)'}}/><span>Dépenses</span><b>{money(payload[0].value)}</b></div></div>;
}
