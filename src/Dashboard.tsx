import {useCallback,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,ArrowDownRight,ArrowUpRight,BarChart3,Box,ChevronDown,RefreshCw,TriangleAlert,Users} from 'lucide-react';
import {
  Area,AreaChart,Bar,BarChart,CartesianGrid,Cell,Pie,PieChart,ResponsiveContainer,
  Tooltip,XAxis,YAxis,
} from 'recharts';
import {api,money} from './api';
import {useChartTheme} from './chartTheme';

type Period='7d'|'30d'|'90d'|'12m';
type NamedValue={name:string;value:number;count:number};
type Trend={date:string;billed:number;paid:number;count:number};
type Status={status:'paid'|'partial'|'pending';count:number;value:number};
type Ageing={label:string;value:number;count:number};
type Traffic={day:number;hour:number;count:number};
type Alert={id:number;sku:string;product:string;stock:number;alertAt:number};
type DashboardData={
  period:Period;from:string;to:string;growth:number;orders:number;
  summary:{revenue:number;paid:number;receivables:number;invoices:number;averageBasket:number};
  stock:{products:number;variants:number;units:number;value:number;low:number;out:number;alerts:Alert[]};
  customers:{total:number};trend:Trend[];ageing:Ageing[];paymentStatus:Status[];
  topProducts:NamedValue[];topCustomers:NamedValue[];categories:NamedValue[];traffic:Traffic[];
};

const periods:{id:Period;label:string}[]=[{id:'7d',label:'7 jours'},{id:'30d',label:'30 jours'},{id:'90d',label:'90 jours'},{id:'12m',label:'12 mois'}];
const compact=(value:number)=>new Intl.NumberFormat('fr-FR',{notation:'compact',maximumFractionDigits:1}).format(value);
const dateLabel=(date:string,period:Period)=>new Intl.DateTimeFormat('fr-FR',period==='12m'?{month:'short'}:{day:'numeric',month:'short'}).format(new Date(date));
const tooltipMoney=(value:unknown)=>money(Number(value));

export default function Dashboard(){
  const chart=useChartTheme();
  const[period,setPeriod]=useState<Period>('30d');
  const[data,setData]=useState<DashboardData|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[updated,setUpdated]=useState<Date|null>(null);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const result=await api<DashboardData>(`/api/dashboard?period=${period}`);setData({...result,trend:result.trend??[],ageing:result.ageing??[],paymentStatus:result.paymentStatus??[],topProducts:result.topProducts??[],topCustomers:result.topCustomers??[],categories:result.categories??[],traffic:result.traffic??[],stock:{...result.stock,alerts:result.stock.alerts??[]}});setUpdated(new Date())}catch(reason){setError((reason as Error).message)}finally{setLoading(false)}},[period]);
  useEffect(()=>{void load()},[load]);
  const range=data?`${new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(new Date(data.from))} – ${new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(data.to))}`:'—';
  if(!data&&loading)return <DashboardSkeleton/>;
  if(!data)return <div className="dashboard-error"><TriangleAlert/><h1>Le tableau de bord n’a pas pu se charger.</h1><p>{error||'Réessaie dans un instant.'}</p><button className="primary" onClick={()=>void load()}>Réessayer</button></div>;
  const collectedRate=data.summary.revenue?Math.round(data.summary.paid/data.summary.revenue*100):0;
  return <div className={`dashboard ${loading?'is-refreshing':''}`}>
    <div className="dashboard-heading">
      <div><h1>Tableau de bord</h1><p>{range} · {data.summary.invoices} facture{data.summary.invoices!==1?'s':''}</p></div>
      <button className="refresh-button" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?'spin':''}/><span>Actualiser</span></button>
    </div>

    <div className="period-row"><span>Période</span><div className="period-control">{periods.map(item=><button key={item.id} className={period===item.id?'active':''} onClick={()=>setPeriod(item.id)}>{item.label}</button>)}</div>{updated&&<small>Mis à jour à {updated.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</small>}</div>

    <section className="revenue-overview">
      <div><span>CHIFFRE D’AFFAIRES FACTURÉ</span><strong>{money(data.summary.revenue)}</strong></div>
      <div className={`growth ${data.growth>=0?'positive':'negative'}`}>{data.growth>=0?<ArrowUpRight/>:<ArrowDownRight/>}<strong>{data.growth>=0?'+':''}{Math.round(data.growth)} %</strong><span>vs période précédente</span></div>
    </section>

    <section className="summary-grid">
      <SummaryCard label="Encaissé" value={money(data.summary.paid)} detail={`${collectedRate} % du facturé`} progress={collectedRate} tone="success"/>
      <SummaryCard label="Reste à encaisser" value={money(data.summary.receivables)} detail="sur les factures de la période" tone={data.summary.receivables?'warning':'success'}/>
      <SummaryCard label="Factures émises" value={String(data.summary.invoices)} detail={`panier moyen ${money(data.summary.averageBasket)}`} tone="info"/>
      <SummaryCard label="Stock en alerte" value={String(data.stock.low+data.stock.out)} detail={`${data.stock.out} en rupture, ${data.stock.low} au plus bas`} tone={data.stock.out?'danger':data.stock.low?'warning':'success'} warn={data.stock.out>0}/>
      <SummaryCard label="Valeur du stock" value={money(data.stock.value)} detail={`${data.stock.units} unités · ${data.stock.variants} références`} tone="neutral"/>
    </section>

    <ChartCard className="trend-card" title="Facturé et encaissé, période par période" subtitle="L’écart entre les deux courbes représente ce qui reste à récupérer." details={<ValuesList items={data.trend.filter(point=>point.billed||point.paid).map(point=>({label:dateLabel(point.date,period),value:`${money(point.billed)} facturé · ${money(point.paid)} encaissé`}))}/>}>
      <div className="chart-large"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend} margin={{top:16,right:12,left:0,bottom:0}}>
        <defs><linearGradient id="billedArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chart.ink} stopOpacity=".18"/><stop offset="100%" stopColor={chart.ink} stopOpacity=".01"/></linearGradient></defs>
        <CartesianGrid stroke={chart.grid} vertical={false}/><XAxis dataKey="date" tickFormatter={v=>dateLabel(String(v),period)} axisLine={false} tickLine={false} minTickGap={26}/><YAxis tickFormatter={v=>compact(Number(v))} axisLine={false} tickLine={false} width={54}/>
        <Tooltip content={<MoneyTooltip/>}/><Area type="monotone" dataKey="billed" name="Facturé" stroke={chart.ink} strokeWidth={2.4} fill="url(#billedArea)"/><Area type="monotone" dataKey="paid" name="Encaissé" stroke={chart.success} strokeWidth={2} fill="transparent"/>
      </AreaChart></ResponsiveContainer></div><ChartLegend items={[[chart.ink,'Facturé'],[chart.success,'Encaissé']]}/>
    </ChartCard>

    <section className="analytics-grid">
      <ChartCard title="Créances par ancienneté" subtitle="Tout l’impayé en cours, quelle que soit la période." details={<ValuesList items={data.ageing.map(x=>({label:x.label,value:`${money(x.value)} · ${x.count} facture${x.count!==1?'s':''}`}))}/>}><SmallBars data={data.ageing.map(x=>({name:x.label,value:x.value}))}/></ChartCard>
      <ChartCard title="Statut d’encaissement" subtitle="Répartition des factures de la période." details={<ValuesList items={data.paymentStatus.map(x=>({label:x.status==='paid'?'Payée':x.status==='partial'?'Partiellement payée':'En attente',value:`${money(x.value)} · ${x.count} facture${x.count!==1?'s':''}`}))}/>}><PaymentStatus statuses={data.paymentStatus}/></ChartCard>
      <ChartCard title="Meilleurs produits" subtitle="Chiffre d’affaires sur la période." details={<ValuesList items={data.topProducts.map(x=>({label:x.name,value:`${money(x.value)} · ${x.count} unité${x.count!==1?'s':''}`}))}/>}><Ranking data={data.topProducts}/></ChartCard>
      <ChartCard title="Meilleurs clients" subtitle="Chiffre d’affaires facturé sur la période." details={<ValuesList items={data.topCustomers.map(x=>({label:x.name,value:`${money(x.value)} · ${x.count} achat${x.count!==1?'s':''}`}))}/>}><Ranking data={data.topCustomers}/></ChartCard>
      <ChartCard title="Ventes par catégorie" subtitle="Part de chaque famille de produits." details={<ValuesList items={data.categories.map(x=>({label:x.name,value:`${money(x.value)} · ${x.count} unité${x.count!==1?'s':''}`}))}/>}><CategoryChart data={data.categories}/></ChartCard>
      <ChartCard className="traffic-card" title="Affluence par jour et par heure" subtitle="Plus la case est foncée, plus l’heure est chargée." details={<ValuesList items={data.traffic.filter(x=>x.count>0).map(x=>({label:`${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][x.day-1]} · ${x.hour}h`,value:`${x.count} vente${x.count!==1?'s':''}`}))}/> }><Heatmap data={data.traffic}/></ChartCard>
      <ChartCard className="stock-card" title="Articles à réapprovisionner" subtitle={`${data.stock.out} rupture${data.stock.out!==1?'s':''} et ${data.stock.low} stock${data.stock.low!==1?'s':''} faible${data.stock.low!==1?'s':''}.`} details={<ValuesList items={data.stock.alerts.map(x=>({label:x.product,value:`${x.stock} en stock · seuil ${x.alertAt} · ${x.sku}`}))}/>}><StockAlerts items={data.stock.alerts}/></ChartCard>
      <ChartCard className="customer-card" title="Portefeuille client" subtitle="Vue rapide de la base clients." details={<ValuesList items={[{label:'Clients enregistrés',value:String(data.customers.total)},{label:'Commandes web sur la période',value:String(data.orders)},{label:'Références produits actives',value:String(data.stock.variants)}]}/>}><div className="customer-summary"><span><Users/></span><div><strong>{data.customers.total}</strong><small>clients enregistrés</small></div><div><strong>{data.orders}</strong><small>commandes web</small></div></div></ChartCard>
    </section>
  </div>;
}

function SummaryCard({label,value,detail,progress,warn,tone='neutral'}:{label:string;value:string;detail:string;progress?:number;warn?:boolean;tone?:'success'|'warning'|'danger'|'info'|'neutral'}){return <article className={`summary-card tone-${tone}`}><span>{label}</span><strong>{value}</strong><small className={warn?'warning-text':''}>{detail}</small>{progress!==undefined&&<div className="summary-progress"><i style={{width:`${Math.min(100,progress)}%`}}/></div>}</article>}
function ChartCard({title,subtitle,children,className='',details}:{title:string;subtitle:string;children:React.ReactNode;className?:string;details:React.ReactNode}){const[expanded,setExpanded]=useState(false);return <article className={`chart-card ${className} ${expanded?'values-expanded':''}`}><header><h2>{title}</h2><p>{subtitle}</p></header>{children}<button className="show-values" type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><ChevronDown className={expanded?'rotated':''}/>{expanded?'Masquer les valeurs':'Voir les valeurs'}</button>{expanded&&<div className="chart-values">{details}</div>}</article>}
function ValuesList({items}:{items:{label:string;value:string}[]}){return <div className="values-list">{items.length?items.map((item,index)=><div key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value}</strong></div>):<span className="no-values">Aucune valeur sur cette période.</span>}</div>}
function ChartLegend({items}:{items:[string,string][]}){return <div className="chart-legend">{items.map(([color,label])=><span key={label}><i style={{background:color}}/>{label}</span>)}</div>}
function MoneyTooltip({active,payload,label}:{active?:boolean;payload?:Array<{name:string;value:number;color:string}>;label?:string}){if(!active||!payload?.length)return null;return <div className="chart-tooltip"><strong>{label?new Date(label).toLocaleDateString('fr-FR'):''}</strong>{payload.map(x=><div key={x.name}><i style={{background:x.color}}/><span>{x.name}</span><b>{money(x.value)}</b></div>)}</div>}
function SmallBars({data}:{data:{name:string;value:number}[]}){
  const chart=useChartTheme();const source=data.length?data:[{name:'1–30 j',value:0},{name:'31–60 j',value:0},{name:'61–90 j',value:0},{name:'+90 j',value:0}];return <div className="chart-small"><ResponsiveContainer width="100%" height="100%"><BarChart data={source}><CartesianGrid stroke={chart.grid} vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>compact(Number(v))} axisLine={false} tickLine={false} width={45}/><Tooltip formatter={tooltipMoney}/><Bar dataKey="value" radius={[5,5,0,0]}>{source.map((_,i)=><Cell key={i} fill={chart.ageing[i%chart.ageing.length]}/>)}</Bar></BarChart></ResponsiveContainer></div>}
function PaymentStatus({statuses}:{statuses:Status[]}){
  const chart=useChartTheme();const config={paid:{label:'Payée',color:chart.success},partial:{label:'Partiellement payée',color:chart.warning},pending:{label:'En attente',color:chart.danger}};const total=statuses.reduce((s,x)=>s+x.count,0);return <div className="payment-status"><div className="status-bar">{statuses.map(x=><i key={x.status} style={{width:`${total?x.count/total*100:0}%`,background:config[x.status].color}}/>)}</div>{(['paid','partial','pending'] as const).map(status=>{const row=statuses.find(x=>x.status===status);return <div className="status-row" key={status}><i style={{background:config[status].color}}/><span>{config[status].label} ({row?.count??0})</span><strong>{money(row?.value??0)}</strong></div>})}</div>}
function Ranking({data}:{data:NamedValue[]}){if(!data.length)return <EmptyChart/>;const max=Math.max(...data.map(x=>x.value),1);return <div className="ranking">{data.slice(0,6).map((x,i)=><div key={`${x.name}-${i}`}><span title={x.name}>{x.name}</span><div><i style={{width:`${x.value/max*100}%`}}/></div><strong>{compact(x.value)}</strong></div>)}</div>}
function CategoryChart({data}:{data:NamedValue[]}){
  const chart=useChartTheme();if(!data.length)return <EmptyChart/>;const colors=chart.ramp;return <div className="category-chart"><div><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2}>{data.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={tooltipMoney}/></PieChart></ResponsiveContainer><strong>{money(data.reduce((s,x)=>s+x.value,0))}<small>Total</small></strong></div><div className="category-legend">{data.slice(0,5).map((x,i)=><span key={x.name}><i style={{background:colors[i%colors.length]}}/><b>{x.name}</b><small>{Math.round(x.value/data.reduce((s,y)=>s+y.value,0)*100)} %</small></span>)}</div></div>}
function Heatmap({data}:{data:Traffic[]}){const days=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];const hours=[9,10,11,12,13,14,15,16,17,18,19,20];const max=Math.max(1,...data.map(x=>x.count));const value=(day:number,hour:number)=>data.find(x=>x.day===day&&x.hour===hour)?.count??0;return <div className="heatmap"><div className="heat-hours">{hours.map((h,i)=><span key={h}>{i%3===0?`${h}h`:''}</span>)}</div>{days.map((day,di)=><div className="heat-row" key={day}><b>{day}</b>{hours.map(hour=>{const count=value(di+1,hour);return <i key={hour} title={`${day} ${hour}h : ${count} vente(s)`} style={{background:`rgba(38,42,49,${count?0.12+count/max*.78:.035})`}}/>})}</div>)}</div>}
function StockAlerts({items}:{items:Alert[]}){if(!items.length)return <div className="all-good"><Box/><strong>Stock sous contrôle</strong><span>Aucun article sous son seuil.</span></div>;return <div className="stock-alerts">{items.map(item=><div key={item.id}><span className={item.stock<=0?'out':'low'}><AlertTriangle/></span><div><strong>{item.product}</strong><small>{item.stock<=0?'Rupture de stock':`Stock faible · seuil ${item.alertAt}`} · {item.sku}</small></div><div className={`stock-meter ${item.stock<=0?'out':'low'}`}><i style={{width:`${Math.max(4,Math.min(100,item.alertAt?item.stock/item.alertAt*100:0))}%`}}/></div><b>{item.stock}</b></div>)}</div>}
function EmptyChart(){return <div className="empty-chart"><BarChart3/><span>Pas encore de données sur cette période.</span></div>}
function DashboardSkeleton(){return <div className="dashboard-skeleton"><i/><i/><div>{[1,2,3,4,5].map(x=><i key={x}/>)}</div><i/></div>}
