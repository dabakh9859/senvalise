import {useCallback,useEffect,useState} from 'react';
import {ArrowRight,BadgeInfo,CheckCircle2,Package,Receipt,RefreshCw,ShoppingBag,TriangleAlert,WalletCards} from 'lucide-react';
import {api,money} from './api';
import type {User} from './Sidebar';

// L'écran d'accueil, écrit pour quelqu'un qui n'est pas comptable.
//
// L'ancien tableau de bord montrait huit graphiques : ancienneté des créances,
// affluence par jour et par heure, camembert par catégorie, classements. Ce
// sont de bons outils — ils vivent maintenant dans la page Rapports, dont
// c'est le métier. Mais la personne qui ouvre l'application le matin ne pose
// pas ces questions-là. Elle en pose quatre : combien est entré, combien est
// sorti, ce qu'on me doit, ce qui cloche.
//
// D'où la forme : chaque chiffre part avec sa phrase. « Encaissé » seul ne
// veut rien dire pour qui n'a pas l'habitude ; « l'argent que vous avez
// réellement reçu » se comprend sans qu'on l'explique. Et ce qui demande une
// action est écrit en français, avec le bouton qui mène là où l'on agit.
//
// Le vendeur voit un écran différent, décidé par le serveur : il n'a pas accès
// aux coûts d'achat, et le bénéfice de la boutique ne le regarde pas.

type Figure={key:string;label:string;sentence:string;amount:number;count:number;isMoney:boolean;tone:string;warning:string};
type Task={key:string;text:string;action:string;cta:string;tone:string};
type Best={name:string;units:number;total:number};
type Cash={open:boolean;holder?:string;expected?:number;opening?:number;openedAt?:string};
type Payload={role:'manager'|'vendor';today:Figure[];month:Figure[];tasks:Task[];best:Best[];cash:Cash};

const hour=(iso?:string)=>iso?new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'';
// Le bonjour n'est pas de la décoration : il dit à qui l'écran s'adresse, et
// « Bonsoir » à 20 h vaut mieux qu'un titre figé qui sonne faux la moitié du
// temps.
const greeting=()=>{const h=new Date().getHours();return h<12?'Bonjour':h<18?'Bon après-midi':'Bonsoir'};
const longDay=()=>new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());

export default function Dashboard({user,onPage}:{user:User;onPage:(id:string)=>void}){
  const[data,setData]=useState<Payload|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setData(await api<Payload>('/api/overview'))}
    catch(problem){setError((problem as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  if(loading&&!data)return <div className="loading"><i/><span>Un instant…</span></div>;
  if(error&&!data)return <div className="panel error">{error}</div>;
  if(!data)return null;

  const manager=data.role==='manager';
  return <div className="home">
    <header className="home-head">
      <div>
        <h1>{greeting()}, {String(user.name).split(' ')[0]}</h1>
        <p>{longDay()}</p>
      </div>
      <button className="refresh-button" onClick={()=>void load()} disabled={loading}>
        <RefreshCw className={loading?'spin':''}/><span>Actualiser</span>
      </button>
    </header>

    {/* Les raccourcis d'abord : neuf fois sur dix, on ouvre l'application pour
        faire une de ces trois choses, pas pour lire un chiffre. */}
    <section className="home-actions">
      <button className="home-action primary" onClick={()=>onPage('pos')}><ShoppingBag/><span><b>Nouvelle vente</b><small>encaisser un client</small></span></button>
      <button className="home-action" onClick={()=>onPage('cash-sessions')}><WalletCards/><span><b>{data.cash.open?'Ma caisse':'Ouvrir la caisse'}</b><small>{data.cash.open?`${money(data.cash.expected??0)} attendus · ouverte à ${hour(data.cash.openedAt)}`:'fond de caisse du matin'}</small></span></button>
      <button className="home-action" onClick={()=>onPage('expenses')}><Receipt/><span><b>Enregistrer une dépense</b><small>eau, courant, livreur…</small></span></button>
      <button className="home-action" onClick={()=>onPage('products')}><Package/><span><b>Produits</b><small>stock et catalogue</small></span></button>
    </section>

    <FigureRow title={manager?'Aujourd’hui':'Ma journée'} figures={data.today}/>

    {/* Ce qui demande une action passe avant les chiffres du mois : une rupture
        de stock ne se découvre pas en faisant défiler un écran. */}
    <section className="panel home-tasks">
      <h2>{data.tasks.length?'À regarder':'Tout est en ordre'}</h2>
      {data.tasks.length===0
        ?<p className="home-allgood"><CheckCircle2/>Rien ne demande votre attention en ce moment.</p>
        :<ul>{data.tasks.map(task=><li key={task.key} className={`tone-${task.tone}`}>
          <TriangleAlert/><span>{task.text}</span>
          <button onClick={()=>onPage(task.action)}>{task.cta}<ArrowRight/></button>
        </li>)}</ul>}
    </section>

    {manager&&<FigureRow title="Ce mois-ci" figures={data.month}/>}

    {manager&&<section className="panel home-best">
      <h2>Ce qui se vend le mieux ce mois-ci</h2>
      {data.best.length===0
        ?<p className="empty">Aucune vente enregistrée ce mois-ci.</p>
        :<ul>{data.best.map((row,index)=><li key={row.name}>
          <b className="home-rank">{index+1}</b>
          <span>{row.name}</span>
          <small>{row.units} vendu{row.units>1?'s':''}</small>
          <strong>{money(row.total)}</strong>
        </li>)}</ul>}
    </section>}

    {manager&&<p className="home-more">
      Pour les détails — marge, compte de résultat, créances par ancienneté —
      <button onClick={()=>onPage('reports')}>ouvrez les Rapports</button>. Pour l’historique de ce qui
      s’est passé, <button onClick={()=>onPage('journal')}>le journal d’activité</button>.
    </p>}
  </div>;
}

// Une rangée de chiffres, chacun avec sa phrase. Le nombre est gros parce
// qu'il se lit de loin ; la phrase est en dessous parce qu'on la lit une fois,
// puis on ne la lit plus.
function FigureRow({title,figures}:{title:string;figures:Figure[]}){
  if(figures.length===0)return null;
  return <section className="home-figures">
    <h2>{title}</h2>
    <div>{figures.map(figure=><article key={figure.key} className={`home-figure tone-${figure.tone}`}>
      <small>{figure.label}</small>
      <strong>{figure.isMoney?money(figure.amount):figure.count}</strong>
      <span>{figure.sentence}</span>
      {figure.warning&&<em className="home-warning"><BadgeInfo/>{figure.warning}</em>}
    </article>)}</div>
  </section>;
}
