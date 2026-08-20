import {FormEvent,lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {ArrowDownToLine,Package,Plus,Search,ShoppingCart,Tags,Trash2,X} from 'lucide-react';
import {api,Entity,money} from './api';
import Sidebar,{allNav,User} from './Sidebar';
import ResourcePage from './ResourcePage';
import TopNavigation from './TopNavigation';
import EnhancedPOS from './POS';
import CheckoutSettings from './CheckoutSettings';

const Dashboard=lazy(()=>import('./Dashboard'));
const Expenses=lazy(()=>import('./Expenses'));
const Reports=lazy(()=>import('./Reports'));
const ShopOverview=lazy(()=>import('./ShopOverview'));
const ShopOrders=lazy(()=>import('./ShopOrders'));
const ShopCatalog=lazy(()=>import('./ShopCatalog'));
const ShopCustomers=lazy(()=>import('./ShopCustomers'));
const ShopDelivery=lazy(()=>import('./ShopDelivery'));

const labels:Record<string,string>={name:'Nom',email:'E-mail',phone:'Téléphone',address:'Adresse',status:'Statut',reference:'Référence',total:'Total',paid:'Payé',stock:'Stock',price:'Prix',cost:'Coût',sku:'SKU',barcode:'Code-barres',color:'Couleur',size:'Taille',role:'Rôle',channel:'Canal',subject:'Sujet',balance:'Solde',goal:'Objectif',fee:'Tarif',delay:'Délai'};

export default function App(){
  const[user,setUser]=useState<User|null>(null);
  // Le tableau de bord est réservé au gérant : un vendeur ouvre l'application
  // sur la caisse, qui est son poste de travail.
  const[page,setPage]=useState('dashboard');
  useEffect(()=>{if(localStorage.getItem('sv_token'))api<User>('/api/me').then(setUser).catch(()=>localStorage.removeItem('sv_token'))},[]);
  if(!user)return <Login onLogin={setUser}/>;
  const manager=user.role==='manager';
  const home=manager?'dashboard':'pos';
  const requested=allNav.find(item=>item.id===page)??allNav[0];
  // Filet côté écran : une page réservée ne s'ouvre pas, même si son
  // identifiant est forcé. L'API refuse déjà les données correspondantes.
  const current=requested.manager&&!manager?allNav.find(item=>item.id===home)??allNav[0]:requested;
  const view=current.id;
  const logout=()=>{localStorage.removeItem('sv_token');setUser(null)};
  return <div className="app-shell rail-layout">
    <Sidebar user={user} onPage={setPage} onLogout={logout}/>
    <main className="main-area">
      <TopNavigation user={user} page={page} onPage={setPage}/>
      {view!=='dashboard'&&<header className="page-header"><div><small>ESPACE DE TRAVAIL</small><h1>{current.label}</h1></div><time>{new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(new Date())}</time></header>}
      <section className={view==='dashboard'?'dashboard-content':'page-content'}><Suspense fallback={<Loading/>}>{view==='dashboard'?<Dashboard/>:view==='pos'?<EnhancedPOS/>:view==='expenses'?<Expenses user={user}/>:view==='checkout-settings'?<CheckoutSettings/>:view==='reports'?<Reports/>:view==='shop-overview'?<ShopOverview onPage={setPage}/>:view==='shop-orders'?<ShopOrders/>:view==='shop-catalog'?<ShopCatalog/>:view==='shop-customers'?<ShopCustomers/>:view==='shop-delivery'?<ShopDelivery/>:current.resource?<ResourcePage title={current.label} resource={current.resource} user={user}/>:null}</Suspense></section>
    </main>
  </div>;
}

function Login({onLogin}:{onLogin:(user:User)=>void}){
  const[email,setEmail]=useState('gerant@senvalise.sn');const[password,setPassword]=useState('ChangeMe123!');const[error,setError]=useState('');
  const submit=async(event:FormEvent)=>{event.preventDefault();setError('');try{const result=await api<{token:string;user:User}>('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('sv_token',result.token);onLogin(result.user)}catch(reason){setError((reason as Error).message)}};
  return <div className="login-screen"><form onSubmit={submit}><div className="login-brand"><span>SV</span><strong>SenValise</strong></div><h1>Connexion</h1><p>Accédez à votre espace de gestion.</p><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Mot de passe<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<div className="error">{error}</div>}<button className="primary" type="submit">Se connecter</button></form></div>;
}

function Resource({title,resource}:{title:string;resource:string}){
  const[data,setData]=useState<Entity[]>([]);const[loading,setLoading]=useState(true);const[query,setQuery]=useState('');const[modal,setModal]=useState(false);
  const load=()=>{setLoading(true);api<Entity[]>(`/api/${resource}`).then(setData).finally(()=>setLoading(false))};useEffect(load,[resource]);
  const shown=useMemo(()=>data.filter(row=>JSON.stringify(row).toLowerCase().includes(query.toLowerCase())),[data,query]);
  const columns=useMemo(()=>{const preferred=['reference','name','sku','email','phone','status','stock','price','total','paid','balance','role','createdAt'];const keys=new Set(data.flatMap(Object.keys));return preferred.filter(key=>keys.has(key)).slice(0,6)},[data]);
  const remove=async(id:number)=>{if(!confirm('Supprimer définitivement cet élément ?'))return;await api(`/api/${resource}/${id}`,{method:'DELETE'});load()};
  return <><div className="toolbar"><div className="search"><Search/><input placeholder={`Rechercher dans ${title.toLowerCase()}…`} value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="primary compact" onClick={()=>setModal(true)}><Plus/>Nouveau</button></div><div className="panel table-panel">{loading?<Loading/>:shown.length===0?<Empty title={title}/>:<div className="table-wrap"><table><thead><tr>{columns.map(column=><th key={column}>{labels[column]??column}</th>)}<th/></tr></thead><tbody>{shown.map(row=><tr key={row.id}>{columns.map(column=><td key={column}>{['total','paid','price','cost','balance'].includes(column)?money(row[column]):column==='createdAt'?new Date(String(row[column])).toLocaleDateString('fr-FR'):<Value value={row[column]}/>}</td>)}<td><button className="icon danger" onClick={()=>void remove(row.id)}><Trash2/></button></td></tr>)}</tbody></table></div>}</div>{modal&&<QuickCreate resource={resource} onClose={()=>setModal(false)} onDone={()=>{setModal(false);load()}}/>}</>;
}
function Value({value}:{value:unknown}){if(typeof value==='boolean')return <span className={`badge ${value?'ok':''}`}>{value?'Oui':'Non'}</span>;if(value===null||value===undefined)return <>—</>;return <>{String(value)}</>}
const fields:Record<string,string[]>={customers:['name','phone','email','address'],suppliers:['name','phone','email','address'],categories:['name','slug','description'],products:['name','slug','description'],variants:['productId','sku','barcode','color','size','cost','price','stock','alertAt'],arrivals:['reference','currency','exchangeRate','shipping','customs','otherFees'],documents:['reference','type','status','total','notes'],orders:['reference','status','total','deliveryFee','deliveryZone','address'],vaults:['customerId','balance','goal','status'],messages:['recipient','channel','type','subject','body','status'],'message-templates':['name','channel','type','subject','body'],'contact-messages':['name','email','phone','subject','body','status'],'home-blocks':['kind','title','body','imageUrl','link','position'],'delivery-zones':['name','fee','delay'],users:['name','email','password','role'],default:['name','status']};
function QuickCreate({resource,onClose,onDone}:{resource:string;onClose:()=>void;onDone:()=>void}){
  const formFields=fields[resource]??fields.default;const[form,setForm]=useState<Record<string,string>>({});const[error,setError]=useState('');
  const submit=async(event:FormEvent)=>{event.preventDefault();try{const body=Object.fromEntries(Object.entries(form).map(([key,value])=>[key,/Id$|cost|price|stock|alertAt|total|fee|balance|goal|shipping|customs|otherFees/.test(key)?Number(value):value]));await api(`/api/${resource}`,{method:'POST',body:JSON.stringify(body)});onDone()}catch(reason){setError((reason as Error).message)}};
  return <div className="overlay" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><small>NOUVEL ENREGISTREMENT</small><h2>Ajouter</h2></div><button type="button" className="icon" onClick={onClose}><X/></button></div><div className="form-grid">{formFields.map(field=><label key={field}>{labels[field]??field}<input required={['name','reference','sku','password'].includes(field)} type={field==='password'?'password':/Id$|cost|price|stock|total|fee|balance|goal/.test(field)?'number':'text'} value={form[field]??''} onChange={e=>setForm({...form,[field]:e.target.value})}/></label>)}</div>{error&&<div className="error">{error}</div>}<div className="modal-actions"><button type="button" onClick={onClose}>Annuler</button><button className="primary" type="submit">Enregistrer</button></div></form></div>;
}

type Variant=Entity&{sku:string;color:string;size:string;stock:number;alertAt?:number;price:number;productId:number;active?:boolean};type CartLine={variant:Variant;quantity:number};
function POS(){
  const[items,setItems]=useState<Variant[]>([]);const[cart,setCart]=useState<CartLine[]>([]);const[query,setQuery]=useState('');const[paid,setPaid]=useState('');const[method,setMethod]=useState('cash');const[message,setMessage]=useState('');
  useEffect(()=>{api<Variant[]>('/api/variants').then(rows=>setItems(rows.filter(row=>row.active!==false&&row.stock>0)))},[]);const total=cart.reduce((sum,line)=>sum+line.variant.price*line.quantity,0);
  const add=(variant:Variant)=>setCart(current=>{const found=current.find(line=>line.variant.id===variant.id);return found?current.map(line=>line.variant.id===variant.id?{...line,quantity:Math.min(variant.stock,line.quantity+1)}:line):[...current,{variant,quantity:1}]});
  const checkout=async()=>{try{const sale=await api<{reference:string}>('/api/sales/checkout',{method:'POST',body:JSON.stringify({paymentMethod:method,paid:Number(paid||total),items:cart.map(line=>({variantId:line.variant.id,quantity:line.quantity}))})});setMessage(`Vente ${sale.reference} enregistrée`);setCart([]);setPaid('')}catch(reason){setMessage((reason as Error).message)}};
  return <div className="pos"><div><div className="search"><Search/><input autoFocus placeholder="Nom, SKU ou code-barres…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="product-grid">{items.filter(item=>JSON.stringify(item).toLowerCase().includes(query.toLowerCase())).slice(0,30).map(variant=>{const low=Boolean(variant.alertAt&&variant.stock<=variant.alertAt);return <button key={variant.id} onClick={()=>add(variant)}><span className="product-icon"><Tags/></span><strong>{variant.sku}</strong><small>{variant.color} · {variant.size}</small><div><b>{money(variant.price)}</b><em className={low?'stock-low':'stock-ok'}>{low?'Stock faible':'En stock'} · {variant.stock}</em></div></button>})}</div></div><aside className="cart"><div><small>VENTE EN COURS</small><h2>Panier <span>{cart.reduce((sum,line)=>sum+line.quantity,0)}</span></h2></div><div className="cart-lines">{cart.length===0?<div className="empty-mini"><ShoppingCart/><p>Ajoutez un article</p></div>:cart.map(line=><div className="cart-line" key={line.variant.id}><div><strong>{line.variant.sku}</strong><small>{money(line.variant.price)} × {line.quantity}</small></div><div className="qty"><button onClick={()=>setCart(current=>current.map(item=>item.variant.id===line.variant.id?{...item,quantity:Math.max(1,item.quantity-1)}:item))}>−</button><span>{line.quantity}</span><button onClick={()=>add(line.variant)}>+</button></div><b>{money(line.variant.price*line.quantity)}</b></div>)}</div><div className="cart-bottom"><div className="total"><span>Total</span><strong>{money(total)}</strong></div><label>Mode de paiement<select value={method} onChange={e=>setMethod(e.target.value)}><option value="cash">Espèces</option><option value="wave">Wave</option><option value="orange_money">Orange Money</option><option value="card">Carte</option><option value="credit">Crédit</option></select></label><label>Montant reçu<input type="number" value={paid} placeholder={String(total)} onChange={e=>setPaid(e.target.value)}/></label>{message&&<div className={message.includes('enregistrée')?'success':'error'}>{message}</div>}<button className="primary checkout" disabled={!cart.length} onClick={()=>void checkout()}><ArrowDownToLine/>Encaisser {money(total)}</button></div></aside></div>;
}
function Loading(){return <div className="loading"><i/><span>Chargement…</span></div>}
function Empty({title}:{title:string}){return <div className="empty"><Package/><h3>Aucun élément</h3><p>Les premiers éléments de « {title} » apparaîtront ici.</p></div>}
