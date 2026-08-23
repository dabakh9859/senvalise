import {ReactNode,useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowDownRight,ArrowUpRight,Download,Minus,Printer,RefreshCw,TriangleAlert} from 'lucide-react';
import {api,money} from './api';
import {printDocument} from './print';

// Rapports : la lecture comptable de la boutique sur une période choisie.
// Le tableau de bord montre la tendance du moment ; ici on déroule ce que la
// période a produit, ligne à ligne, dans des tableaux triables et exportables.
// Aucune courbe : ce que l'on vient chercher ici, ce sont des montants exacts
// et des totaux qui se recoupent, pas une impression visuelle.

type Totals={revenue:number;collected:number;receivables:number;cogs:number;grossMargin:number;expenses:number;refunds:number;netResult:number;invoices:number;units:number;averageBasket:number};
type Day={date:string;billed:number;collected:number;margin:number;count:number};
type Product={name:string;sku:string;category:string;units:number;revenue:number;cost:number;margin:number};
type Named={name:string;count:number;amount:number;extra:number;margin:number};
type Receivable={name:string;phone:string;invoices:number;due:number;oldestDays:number};
type SaleRow={id:number;date:string;reference:string;customer:string;seller:string;channel:string;method:string;status:string;total:number;paid:number;due:number;margin:number};
type StockRow={sku:string;product:string;stock:number;cost:number;price:number;costValue:number;retailValue:number;sold:number};
type StockTotals={units:number;cost:number;retail:number;margin:number};
type Report={
  from:string;to:string;previousFrom:string;previousTo:string;
  totals:Totals;previous:Totals;days:Day[];products:Product[];categories:Named[];sellers:Named[];
  methods:Named[];expenses:Named[];receivables:Receivable[];journal:SaleRow[];journalTruncated:boolean;
  stock:StockRow[];stockTotals:StockTotals;
};

const iso=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const startOfMonth=(offset=0)=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth()+offset,1)};
const endOfMonth=(offset=0)=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth()+offset+1,0)};
const daysAgo=(n:number)=>{const d=new Date();d.setDate(d.getDate()-n);return d};

const presets:{id:string;label:string;range:()=>[Date,Date]}[]=[
  {id:'month',label:'Ce mois',range:()=>[startOfMonth(),new Date()]},
  {id:'previous',label:'Mois dernier',range:()=>[startOfMonth(-1),endOfMonth(-1)]},
  {id:'30d',label:'30 jours',range:()=>[daysAgo(29),new Date()]},
  {id:'quarter',label:'Trimestre',range:()=>[startOfMonth(-2),new Date()]},
  {id:'year',label:'Année',range:()=>[new Date(new Date().getFullYear(),0,1),new Date()]},
];

const percent=(part:number,whole:number)=>whole?Math.round(part/whole*100):0;
const longDate=(value:string)=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value));
const shortDate=(value:string)=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(value));
const methodLabels:Record<string,string>={cash:'Espèces',wave:'Wave',orange_money:'Orange Money',card:'Carte bancaire',credit:'Crédit',bank_transfer:'Virement',legacy:'Reprise'};
const statusLabels:Record<string,string>={paid:'Soldée',partial:'Partielle',pending:'Impayée',cancelled:'Annulée'};
const channelLabels:Record<string,string>={pos:'Comptoir',online:'Boutique',quote:'Devis'};

// Une colonne sait s'afficher, se trier, s'exporter et se totaliser. Les quatre
// usages partent de la même définition, donc l'export CSV ne peut pas dériver
// de ce qui est affiché à l'écran.
type Column<T>={
  key:string;label:string;
  cell:(row:T)=>ReactNode;
  sort:(row:T)=>number|string;
  csv:(row:T)=>string|number;
  numeric?:boolean;
  total?:(rows:T[])=>ReactNode;
};

const sum=<T,>(rows:T[],pick:(row:T)=>number)=>rows.reduce((acc,row)=>acc+pick(row),0);
const moneyTotal=<T,>(pick:(row:T)=>number)=>(rows:T[])=>money(sum(rows,pick));
const countTotal=<T,>(pick:(row:T)=>number)=>(rows:T[])=>String(sum(rows,pick));

function downloadCsv<T>(name:string,columns:Column<T>[],rows:T[]){
  const escape=(value:string|number)=>{const text=String(value??'');return /[";\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text};
  const lines=[columns.map(column=>escape(column.label)).join(';')];
  rows.forEach(row=>lines.push(columns.map(column=>escape(column.csv(row))).join(';')));
  // Le point-virgule et le BOM sont ce qu'attend Excel en configuration
  // française : sans eux le fichier s'ouvre en une seule colonne, accents cassés.
  const blob=new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=`${name}.csv`;
  document.body.appendChild(link);link.click();link.remove();
  URL.revokeObjectURL(url);
}

export default function Reports(){
  const[range,setRange]=useState<{from:string;to:string}>(()=>{const[from,to]=presets[0].range();return{from:iso(from),to:iso(to)}});
  const[preset,setPreset]=useState('month');
  const[data,setData]=useState<Report|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[tab,setTab]=useState('journal');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setData(await api<Report>(`/api/reports?from=${range.from}&to=${range.to}`))}
    catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[range.from,range.to]);
  useEffect(()=>{void load()},[load]);

  const applyPreset=(id:string)=>{
    const found=presets.find(item=>item.id===id);
    if(!found)return;
    const[from,to]=found.range();
    setPreset(id);setRange({from:iso(from),to:iso(to)});
  };
  const setBound=(key:'from'|'to')=>(value:string)=>{setPreset('custom');setRange(current=>({...current,[key]:value}))};

  const tabs=useMemo(()=>data?buildTabs(data):[],[data]);
  const active=tabs.find(item=>item.id===tab)??tabs[0];

  if(!data&&loading)return <div className="report-loading"><i/><span>Construction du rapport…</span></div>;
  if(!data)return <div className="report-error"><TriangleAlert/><h2>Le rapport n’a pas pu être établi.</h2><p>{error||'Réessayez dans un instant.'}</p><button className="primary" onClick={()=>void load()}>Réessayer</button></div>;

  const t=data.totals;
  const label=`Rapport SenValise ${shortDate(data.from)} au ${shortDate(data.to)}`;

  return <div className={`reports ${loading?'is-refreshing':''}`}>
    <div className="report-toolbar no-print">
      <div className="report-presets">
        {presets.map(item=><button key={item.id} className={preset===item.id?'active':''} onClick={()=>applyPreset(item.id)}>{item.label}</button>)}
      </div>
      <div className="report-dates">
        <label>Du<input type="date" value={range.from} max={range.to} onChange={event=>setBound('from')(event.target.value)}/></label>
        <label>Au<input type="date" value={range.to} min={range.from} onChange={event=>setBound('to')(event.target.value)}/></label>
      </div>
      <div className="report-actions">
        <button onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?'spin':''}/><span>Actualiser</span></button>
        <button onClick={()=>void printDocument('report-sheet',label,'SenValise — document interne')}><Printer/><span>Imprimer</span></button>
      </div>
    </div>

    <div id="report-sheet" className="report-sheet">
      <header className="report-head">
        <div><h1>Rapport d’activité</h1><p>Du {longDate(data.from)} au {longDate(data.to)}</p></div>
        <div className="report-compare"><span>Comparé au</span><strong>{shortDate(data.previousFrom)} – {shortDate(data.previousTo)}</strong></div>
      </header>

      <section className="pnl">
        <h2>Compte de résultat</h2>
        <table>
          <tbody>
            <PnlRow label="Chiffre d’affaires facturé" value={t.revenue} previous={data.previous.revenue}/>
            <PnlRow label="Coût d’achat des marchandises vendues" charge value={-t.cogs} previous={-data.previous.cogs} muted/>
            <PnlRow label="Marge brute" value={t.grossMargin} previous={data.previous.grossMargin} strong note={`${percent(t.grossMargin,t.revenue)} % du chiffre d’affaires`}/>
            <PnlRow label="Dépenses d’exploitation" charge value={-t.expenses} previous={-data.previous.expenses} muted/>
            <PnlRow label="Retours et remboursements" charge value={-t.refunds} previous={-data.previous.refunds} muted/>
            <PnlRow label="Résultat net" value={t.netResult} previous={data.previous.netResult} strong final/>
          </tbody>
        </table>
      </section>

      <section className="report-facts">
        <Fact label="Bénéfice de la période" value={money(t.netResult)}
          note={t.revenue>0&&t.cogs===0
            ?'⚠ prix d’achat non renseignés : ce montant est le chiffre d’affaires, pas un bénéfice'
            :`marge de ${money(t.grossMargin)} moins ${money(t.expenses + t.refunds)} de dépenses et retours`}
          tone={t.revenue>0&&t.cogs===0?'warn':t.netResult>0?'ok':t.netResult<0?'bad':undefined}/>
        <Fact label="Encaissé sur la période" value={money(t.collected)} note="règlements datés, hors factures antérieures"/>
        <Fact label="Reste à encaisser" value={money(t.receivables)} note={`${data.receivables.length} client${data.receivables.length>1?'s':''} concerné${data.receivables.length>1?'s':''}`} tone={t.receivables?'warn':undefined}/>
        <Fact label="Factures émises" value={String(t.invoices)} note={`panier moyen ${money(t.averageBasket)}`}/>
        <Fact label="Articles vendus" value={String(t.units)} note={`${data.products.length} référence${data.products.length>1?'s':''} concernée${data.products.length>1?'s':''}`}/>
        <Fact label="Stock à ce jour" value={money(data.stockTotals.cost)} note={`${data.stockTotals.units} unités · ${money(data.stockTotals.retail)} au prix de vente`}/>
      </section>

      <section className="report-detail">
        <div className="report-tabs no-print">
          {tabs.map(item=><button key={item.id} className={active?.id===item.id?'active':''} onClick={()=>setTab(item.id)}>{item.label}<em>{item.count}</em></button>)}
        </div>
        {active?.node}
        {active?.id==='journal'&&data.journalTruncated&&<p className="report-note">Seules les {data.journal.length} ventes les plus récentes sont listées ; affinez la période pour tout voir.</p>}
      </section>
    </div>
  </div>;
}

function PnlRow({label,value,previous,strong,muted,final,note,charge}:{label:string;value:number;previous:number;strong?:boolean;muted?:boolean;final?:boolean;note?:string;charge?:boolean}){
  return <tr className={`${strong?'strong':''} ${final?'final':''} ${muted?'muted':''}`.trim()}>
    <th>{label}{note&&<small>{note}</small>}</th>
    <td className={value<0?'negative':''}>{money(value)}</td>
    <td className="delta"><Delta value={value} previous={previous} charge={charge}/></td>
  </tr>;
}

// Sur une charge, dépenser plus est une dégradation : la variation garde son
// signe réel (une hausse s'affiche « + »), seule la couleur change de camp.
// Sans cela une hausse de coût s'affichait « −46 % », ce qui se lit à l'envers.
function Delta({value,previous,charge}:{value:number;previous:number;charge?:boolean}){
  const current=charge?Math.abs(value):value;
  const before=charge?Math.abs(previous):previous;
  if(!before)return <span className="delta-none"><Minus/>—</span>;
  const change=Math.round((current-before)/Math.abs(before)*100);
  if(change===0)return <span className="delta-none"><Minus/>stable</span>;
  const good=charge?change<0:change>0;
  return <span className={good?'delta-good':'delta-bad'}>{change>0?<ArrowUpRight/>:<ArrowDownRight/>}{change>0?'+':''}{change} %</span>;
}

function Fact({label,value,note,tone}:{label:string;value:string;note:string;tone?:string}){
  return <div className={`fact ${tone??''}`.trim()}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

type Tab={id:string;label:string;count:number;node:ReactNode};

function DataTable<T extends object>({name,columns,rows,empty}:{name:string;columns:Column<T>[];rows:T[];empty:string}){
  // Tri vide = ordre du serveur, déjà pertinent (montant décroissant, date
  // décroissante). On ne trie côté navigateur que sur demande explicite.
  const[sortKey,setSortKey]=useState('');
  const[direction,setDirection]=useState(-1);
  const sorted=useMemo(()=>{
    const column=columns.find(item=>item.key===sortKey);
    if(!column)return rows;
    return[...rows].sort((left,right)=>{
      const a=column.sort(left),b=column.sort(right);
      if(typeof a==='number'&&typeof b==='number')return(a-b)*direction;
      return String(a).localeCompare(String(b),'fr')*direction;
    });
  },[rows,columns,sortKey,direction]);
  const toggle=(key:string)=>{if(key===sortKey){setDirection(current=>-current);return}setSortKey(key);setDirection(-1)};
  const hasTotals=columns.some(column=>column.total);
  return <div className="report-table-block">
    <div className="report-table-head no-print">
      <span>{rows.length} ligne{rows.length>1?'s':''}</span>
      <button className="ghost" onClick={()=>downloadCsv(name,columns,sorted)} disabled={!rows.length}><Download/><span>Exporter en CSV</span></button>
    </div>
    {rows.length===0?<p className="report-empty">{empty}</p>:<div className="report-table-wrap">
      <table className="report-table">
        <thead><tr>{columns.map(column=>
          <th key={column.key} className={`${column.numeric?'num':''} ${sortKey===column.key?`sorted ${direction<0?'desc':'asc'}`:''}`.trim()} onClick={()=>toggle(column.key)}>{column.label}</th>
        )}</tr></thead>
        <tbody>{sorted.map((row,index)=>
          <tr key={index}>{columns.map(column=><td key={column.key} className={column.numeric?'num':''}>{column.cell(row)}</td>)}</tr>
        )}</tbody>
        {hasTotals&&<tfoot><tr>{columns.map((column,index)=>
          <td key={column.key} className={column.numeric?'num':''}>{column.total?column.total(sorted):index===0?'Total':''}</td>
        )}</tr></tfoot>}
      </table>
    </div>}
  </div>;
}

function Rate({part,whole}:{part:number;whole:number}){
  const value=percent(part,whole);
  return <span className="rate"><i style={{width:`${Math.max(0,Math.min(100,value))}%`}}/><b>{value} %</b></span>;
}

function buildTabs(data:Report):Tab[]{
  const collected=sum(data.methods,row=>row.amount);
  const spent=sum(data.expenses,row=>row.amount);
  const activeDays=data.days.filter(day=>day.count||day.collected);

  const journal:Column<SaleRow>[]=[
    {key:'date',label:'Date',cell:row=>shortDate(row.date),sort:row=>new Date(row.date).getTime(),csv:row=>row.date.slice(0,10)},
    {key:'reference',label:'Facture',cell:row=>row.reference,sort:row=>row.reference,csv:row=>row.reference},
    {key:'customer',label:'Client',cell:row=>row.customer,sort:row=>row.customer,csv:row=>row.customer},
    {key:'seller',label:'Vendeur',cell:row=>row.seller,sort:row=>row.seller,csv:row=>row.seller},
    {key:'channel',label:'Canal',cell:row=>channelLabels[row.channel]??row.channel,sort:row=>row.channel,csv:row=>channelLabels[row.channel]??row.channel},
    {key:'method',label:'Règlement',cell:row=>methodLabels[row.method]??row.method,sort:row=>row.method,csv:row=>methodLabels[row.method]??row.method},
    {key:'status',label:'Statut',cell:row=><span className={`state ${row.status}`}>{statusLabels[row.status]??row.status}</span>,sort:row=>row.status,csv:row=>statusLabels[row.status]??row.status},
    {key:'total',label:'Total',numeric:true,cell:row=>money(row.total),sort:row=>row.total,csv:row=>row.total,total:moneyTotal<SaleRow>(row=>row.total)},
    {key:'paid',label:'Réglé',numeric:true,cell:row=>money(row.paid),sort:row=>row.paid,csv:row=>row.paid,total:moneyTotal<SaleRow>(row=>row.paid)},
    {key:'due',label:'Reste dû',numeric:true,cell:row=>row.due?<b className="due">{money(row.due)}</b>:'—',sort:row=>row.due,csv:row=>row.due,total:moneyTotal<SaleRow>(row=>row.due)},
    {key:'margin',label:'Marge',numeric:true,cell:row=>money(row.margin),sort:row=>row.margin,csv:row=>row.margin,total:moneyTotal<SaleRow>(row=>row.margin)},
  ];
  const products:Column<Product>[]=[
    {key:'name',label:'Produit',cell:row=>row.name,sort:row=>row.name,csv:row=>row.name},
    {key:'sku',label:'SKU',cell:row=>row.sku,sort:row=>row.sku,csv:row=>row.sku},
    {key:'category',label:'Catégorie',cell:row=>row.category,sort:row=>row.category,csv:row=>row.category},
    {key:'units',label:'Vendus',numeric:true,cell:row=>String(row.units),sort:row=>row.units,csv:row=>row.units,total:countTotal<Product>(row=>row.units)},
    {key:'revenue',label:'Chiffre d’affaires',numeric:true,cell:row=>money(row.revenue),sort:row=>row.revenue,csv:row=>row.revenue,total:moneyTotal<Product>(row=>row.revenue)},
    {key:'cost',label:'Coût d’achat',numeric:true,cell:row=>money(row.cost),sort:row=>row.cost,csv:row=>row.cost,total:moneyTotal<Product>(row=>row.cost)},
    {key:'margin',label:'Marge',numeric:true,cell:row=>money(row.margin),sort:row=>row.margin,csv:row=>row.margin,total:moneyTotal<Product>(row=>row.margin)},
    {key:'rate',label:'Taux',numeric:true,cell:row=><Rate part={row.margin} whole={row.revenue}/>,sort:row=>percent(row.margin,row.revenue),csv:row=>percent(row.margin,row.revenue)},
  ];
  const categories:Column<Named>[]=[
    {key:'name',label:'Catégorie',cell:row=>row.name,sort:row=>row.name,csv:row=>row.name},
    {key:'count',label:'Articles',numeric:true,cell:row=>String(row.count),sort:row=>row.count,csv:row=>row.count,total:countTotal<Named>(row=>row.count)},
    {key:'amount',label:'Chiffre d’affaires',numeric:true,cell:row=>money(row.amount),sort:row=>row.amount,csv:row=>row.amount,total:moneyTotal<Named>(row=>row.amount)},
    {key:'margin',label:'Marge',numeric:true,cell:row=>money(row.margin),sort:row=>row.margin,csv:row=>row.margin,total:moneyTotal<Named>(row=>row.margin)},
    {key:'rate',label:'Taux',numeric:true,cell:row=><Rate part={row.margin} whole={row.amount}/>,sort:row=>percent(row.margin,row.amount),csv:row=>percent(row.margin,row.amount)},
  ];
  const sellers:Column<Named>[]=[
    {key:'name',label:'Vendeur',cell:row=>row.name,sort:row=>row.name,csv:row=>row.name},
    {key:'count',label:'Factures',numeric:true,cell:row=>String(row.count),sort:row=>row.count,csv:row=>row.count,total:countTotal<Named>(row=>row.count)},
    {key:'amount',label:'Facturé',numeric:true,cell:row=>money(row.amount),sort:row=>row.amount,csv:row=>row.amount,total:moneyTotal<Named>(row=>row.amount)},
    {key:'extra',label:'Réglé',numeric:true,cell:row=>money(row.extra),sort:row=>row.extra,csv:row=>row.extra,total:moneyTotal<Named>(row=>row.extra)},
    {key:'margin',label:'Marge dégagée',numeric:true,cell:row=>money(row.margin),sort:row=>row.margin,csv:row=>row.margin,total:moneyTotal<Named>(row=>row.margin)},
  ];
  const methods:Column<Named>[]=[
    {key:'name',label:'Moyen de paiement',cell:row=>methodLabels[row.name]??row.name,sort:row=>row.name,csv:row=>methodLabels[row.name]??row.name},
    {key:'count',label:'Règlements',numeric:true,cell:row=>String(row.count),sort:row=>row.count,csv:row=>row.count,total:countTotal<Named>(row=>row.count)},
    {key:'amount',label:'Encaissé',numeric:true,cell:row=>money(row.amount),sort:row=>row.amount,csv:row=>row.amount,total:moneyTotal<Named>(row=>row.amount)},
    {key:'share',label:'Part',numeric:true,cell:row=><Rate part={row.amount} whole={collected}/>,sort:row=>row.amount,csv:row=>percent(row.amount,collected)},
  ];
  const expenses:Column<Named>[]=[
    {key:'name',label:'Poste de dépense',cell:row=>row.name,sort:row=>row.name,csv:row=>row.name},
    {key:'count',label:'Lignes',numeric:true,cell:row=>String(row.count),sort:row=>row.count,csv:row=>row.count,total:countTotal<Named>(row=>row.count)},
    {key:'amount',label:'Montant',numeric:true,cell:row=>money(row.amount),sort:row=>row.amount,csv:row=>row.amount,total:moneyTotal<Named>(row=>row.amount)},
    {key:'share',label:'Part',numeric:true,cell:row=><Rate part={row.amount} whole={spent}/>,sort:row=>row.amount,csv:row=>percent(row.amount,spent)},
  ];
  const receivables:Column<Receivable>[]=[
    {key:'name',label:'Client',cell:row=>row.name,sort:row=>row.name,csv:row=>row.name},
    {key:'phone',label:'Téléphone',cell:row=>row.phone||'—',sort:row=>row.phone,csv:row=>row.phone},
    {key:'invoices',label:'Factures',numeric:true,cell:row=>String(row.invoices),sort:row=>row.invoices,csv:row=>row.invoices,total:countTotal<Receivable>(row=>row.invoices)},
    {key:'due',label:'Reste dû',numeric:true,cell:row=><b className="due">{money(row.due)}</b>,sort:row=>row.due,csv:row=>row.due,total:moneyTotal<Receivable>(row=>row.due)},
    {key:'oldestDays',label:'Ancienneté',numeric:true,cell:row=><span className={row.oldestDays>60?'state pending':row.oldestDays>30?'state partial':'state paid'}>{row.oldestDays} j</span>,sort:row=>row.oldestDays,csv:row=>row.oldestDays},
  ];
  const stock:Column<StockRow>[]=[
    {key:'product',label:'Produit',cell:row=>row.product,sort:row=>row.product,csv:row=>row.product},
    {key:'sku',label:'SKU',cell:row=>row.sku,sort:row=>row.sku,csv:row=>row.sku},
    {key:'stock',label:'En stock',numeric:true,cell:row=>String(row.stock),sort:row=>row.stock,csv:row=>row.stock,total:countTotal<StockRow>(row=>row.stock)},
    {key:'sold',label:'Vendus',numeric:true,cell:row=>String(row.sold),sort:row=>row.sold,csv:row=>row.sold,total:countTotal<StockRow>(row=>row.sold)},
    {key:'cost',label:'Coût unitaire',numeric:true,cell:row=>money(row.cost),sort:row=>row.cost,csv:row=>row.cost},
    {key:'price',label:'Prix de vente',numeric:true,cell:row=>money(row.price),sort:row=>row.price,csv:row=>row.price},
    {key:'costValue',label:'Valeur au coût',numeric:true,cell:row=>money(row.costValue),sort:row=>row.costValue,csv:row=>row.costValue,total:moneyTotal<StockRow>(row=>row.costValue)},
    {key:'retailValue',label:'Valeur au prix',numeric:true,cell:row=>money(row.retailValue),sort:row=>row.retailValue,csv:row=>row.retailValue,total:moneyTotal<StockRow>(row=>row.retailValue)},
  ];
  const days:Column<Day>[]=[
    {key:'date',label:'Jour',cell:row=>shortDate(row.date),sort:row=>new Date(row.date).getTime(),csv:row=>row.date.slice(0,10)},
    {key:'count',label:'Factures',numeric:true,cell:row=>String(row.count),sort:row=>row.count,csv:row=>row.count,total:countTotal<Day>(row=>row.count)},
    {key:'billed',label:'Facturé',numeric:true,cell:row=>money(row.billed),sort:row=>row.billed,csv:row=>row.billed,total:moneyTotal<Day>(row=>row.billed)},
    {key:'collected',label:'Encaissé',numeric:true,cell:row=>money(row.collected),sort:row=>row.collected,csv:row=>row.collected,total:moneyTotal<Day>(row=>row.collected)},
    {key:'margin',label:'Marge',numeric:true,cell:row=>money(row.margin),sort:row=>row.margin,csv:row=>row.margin,total:moneyTotal<Day>(row=>row.margin)},
  ];

  return[
    {id:'journal',label:'Journal des ventes',count:data.journal.length,node:<DataTable name="ventes" columns={journal} rows={data.journal} empty="Aucune vente sur la période."/>},
    {id:'products',label:'Produits',count:data.products.length,node:<DataTable name="produits" columns={products} rows={data.products} empty="Aucun article vendu sur la période."/>},
    {id:'categories',label:'Catégories',count:data.categories.length,node:<DataTable name="categories" columns={categories} rows={data.categories} empty="Aucune catégorie mouvementée."/>},
    {id:'sellers',label:'Vendeurs',count:data.sellers.length,node:<DataTable name="vendeurs" columns={sellers} rows={data.sellers} empty="Aucune vente attribuée."/>},
    {id:'methods',label:'Encaissements',count:data.methods.length,node:<DataTable name="encaissements" columns={methods} rows={data.methods} empty="Aucun règlement enregistré."/>},
    {id:'expenses',label:'Dépenses',count:data.expenses.length,node:<DataTable name="depenses" columns={expenses} rows={data.expenses} empty="Aucune dépense sur la période."/>},
    {id:'receivables',label:'Créances',count:data.receivables.length,node:<DataTable name="creances" columns={receivables} rows={data.receivables} empty="Aucune facture impayée."/>},
    {id:'stock',label:'Stock',count:data.stock.length,node:<DataTable name="stock" columns={stock} rows={data.stock} empty="Aucune référence active."/>},
    {id:'days',label:'Jour par jour',count:activeDays.length,node:<DataTable name="journalier" columns={days} rows={activeDays} empty="Aucun mouvement sur la période."/>},
  ];
}
