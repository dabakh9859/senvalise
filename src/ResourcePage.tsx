import {Fragment,FormEvent,useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowDownToLine,Camera,ArrowUpFromLine,Boxes,Check,ChevronDown,CircleAlert,CircleCheck,CircleDollarSign,Clock3,Copy,ExternalLink,Eye,Globe2,ImagePlus,Layers3,Mail,MapPin,MessageCircle,MessageSquare,Package,Pencil,Phone,Plus,RotateCcw,Search,Settings,ShoppingCart,Tags,Trash2,Truck,UserRound,Users,WalletCards,X,XCircle} from 'lucide-react';
import {api,apiForm,apiPage,Entity,money} from './api';
import type {User} from './Sidebar';
import DocumentWorkspace from './InvoiceWorkspace';
import Modal from './Modal';
import DenominationPad from './DenominationPad';
import ReturnForm from './ReturnForm';

type Props={title:string;resource:string;user:User;openId?:number;onOpened?:()=>void};
type Dialog={mode:'detail'|'create'|'edit';row?:Entity;resource?:string;parent?:Entity}|null;

const labels:Record<string,string>={
  id:'Identifiant',createdAt:'Créé le',updatedAt:'Modifié le',name:'Nom',email:'E-mail',phone:'Téléphone',address:'Adresse',zone:'Zone',status:'Statut',reference:'Référence',total:'Total',subtotal:'Sous-total',discount:'Remise',taxRate:'Taux de TVA (%)',tax:'Montant TVA',paid:'Payé',stock:'Quantité en stock',stockBefore:'Stock avant',stockAfter:'Stock après',quantity:'Quantité',price:'Prix de vente',cost:'Coût',unitPrice:'Prix unitaire',unitCost:'Coût unitaire',landedCost:'Coût rendu',sku:'SKU',barcode:'Code-barres',color:'Couleur',size:'Taille',role:'Rôle',channel:'Canal',subject:'Sujet',body:'Contenu',description:'Description',notes:'Notes',note:'Note',balance:'Solde',goal:'Objectif',fee:'Tarif',delay:'Délai',type:'Type',reason:'Motif',paymentMethod:'Mode de paiement',refundMethod:'Mode de remboursement',amount:'Montant',currency:'Devise',exchangeRate:'Taux de change',shipping:'Transport',customs:'Douane',otherFees:'Autres frais',deliveryFee:'Frais de livraison',deliveryZone:'Zone de livraison',recipient:'Destinataire',error:'Erreur',slug:'Slug',blurb:'Accroche',tag:'Étiquette',flag:'Bandeau',cabin:'Format cabine',volume:'Volume (L)',weight:'Poids (kg)',area:'Secteur',lat:'Latitude',lon:'Longitude',goalRef:'Référence de l’objectif',story:'Descriptif long',active:'Actif',online:'En ligne',featured:'Mis en avant',primary:'Principale',restock:'Remettre en stock',whatsAppConsent:'Accord WhatsApp',secret:'Secret',position:'Position',imageUrl:'Image',link:'Lien',productId:'Produit',variantId:'Variante',categoryId:'Catégorie',brandId:'Marque',customerId:'Client',supplierId:'Fournisseur',userId:'Utilisateur',saleId:'Facture liée',convertedSaleId:'Facture créée',validUntil:'Valable jusqu’au',parentId:'Document parent',cashSessionId:'Session de caisse',openingAmount:'Fond initial',expectedAmount:'Montant attendu',closingAmount:'Montant clôturé',openedAt:'Ouverte le',closedAt:'Clôturée le',receivedAt:'Reçu le',dueAt:'Échéance',sentAt:'Envoyé le',items:'Lignes',variants:'Variantes',images:'Images',deposits:'Dépôts',movements:'Mouvements',alertAt:'Seuil d’alerte',alt:'Texte alternatif',url:'Adresse de l’image',title:'Titre',kind:'Type de bloc',key:'Clé',value:'Valeur',direction:'Sens',category:'Catégorie',method:'Moyen',productName:'Produit',quoteId:'Devis lié',arrivalId:'Arrivage',orderId:'Commande',vaultId:'Coffre',deliveryNoteId:'Bon de livraison',saleReturnId:'Retour',whatsappConsent:'Accord WhatsApp',payments:'Paiements',product:'Produit',customer:'Client',user:'Utilisateur',supplier:'Fournisseur',sale:'Facture',quote:'Devis',deliveryNote:'Bon de livraison',convertedSale:'Facture créée'
};

const configuredFields:Record<string,string[]>={
  customers:['name','phone','email','address','zone','whatsAppConsent','active'],
  suppliers:['name','phone','email','address'],
  categories:['name','slug','description'],
  brands:['name','slug'],
  products:['name','categoryId','price','stock','active','brandId','description','blurb','tag','online'],
  variants:['productId','sku','barcode','color','size','cost','price','stock','alertAt','active'],
  'stock/movements':['variantId','userId','type','reason','quantity','stockBefore','stockAfter','reference','note'],
  arrivals:['reference','supplierId','status','currency','exchangeRate','shipping','customs','otherFees','receivedAt'],
  sales:['reference','customerId','userId','channel','status','paymentMethod','subtotal','discount','taxRate','tax','total','paid'],
  returns:['reference','saleId','userId','reason','refundMethod','amount','restock'],
  quotes:['reference','customerId','userId','status','subtotal','discount','taxRate','tax','total','validUntil','notes'],
  'delivery-notes':['reference','saleId','customerId','userId','status','notes'],
  orders:['reference','customerId','status','paymentMethod','total','deliveryFee','deliveryZone','address'],
  vaults:['customerId','balance','goal','goalRef','status'],
  'cash-sessions':['userId','status','openingAmount','expectedAmount','closingAmount','openedAt','closedAt'],
  'cash-movements':['cashSessionId','userId','direction','category','amount','note'],
  messages:['customerId','recipient','channel','type','subject','body','status','sentAt','error'],
  'message-templates':['name','channel','type','subject','body'],
  'contact-messages':['name','email','phone','subject','body','status'],
  'home-blocks':['kind','title','body','imageUrl','link','position','active'],
  'delivery-zones':['name','slug','area','fee','delay','lat','lon','active'],
  users:['name','email','password','role','active'],
  settings:['key','value','secret']
};

const PAGE_SIZE=100;
// Champs qui ne servent qu'occasionnellement. Les laisser au premier plan
// noyait les trois ou quatre valeurs qu'on vient reellement changer — le nom,
// le prix, la mise en ligne. Ils restent accessibles, repliés.
const advancedFields:Record<string,string[]>={
  products:['brandId','description','blurb','tag','online','slug','flag','cabin','volume','weight','position','featured'],
};

// Champs qui n'existent qu'a la creation. Le prix et la quantite vivent en
// realite sur la declinaison ; le serveur fabrique celle-ci a partir d'eux.
// En modification ils disparaissent : le stock passe alors par le bloc dedie,
// qui inscrit un mouvement.
// Miroir du garde « managerOnly » de l'API : ce que le vendeur ne peut pas
// écrire. Le reste — produits, clients, ventes, dépenses, campagnes — lui est
// ouvert, parce que c'est lui qui tient le comptoir.
const managerOnlyResources=new Set(['brands','suppliers','arrivals','orders','vaults','home-blocks','settings','delivery-zones','users']);

const priceFields=new Set(['price','cost','amount','openingAmount','unitPrice']);
const creationOnlyFields:Record<string,string[]>={products:['stock']};

// Valeurs de depart d'une creation. Un produit cree decoche n'apparait nulle
// part — ni au catalogue, ni a la caisse — et on le cherche sans comprendre.
const creationDefaults:Record<string,Record<string,string|boolean>>={
  products:{active:true},
  variants:{active:true},
  customers:{active:true},
  users:{active:true},
};

const readonly=new Set(['id','createdAt','updatedAt','items','variants','images','deposits','movements']);
const moneyFields=new Set(['total','subtotal','discount','tax','paid','price','cost','unitPrice','unitCost','landedCost','balance','goal','fee','amount','shipping','customs','otherFees','deliveryFee','openingAmount','expectedAmount','closingAmount']);
const numericFields=new Set([...moneyFields,'productId','variantId','categoryId','brandId','customerId','supplierId','userId','saleId','parentId','cashSessionId','arrivalId','orderId','documentId','vaultId','saleReturnId','stock','stockBefore','stockAfter','quantity','alertAt','position','exchangeRate','volume','weight','lat','lon']);
const booleanFields=new Set(['active','online','featured','primary','restock','whatsAppConsent','whatsappConsent','secret','cabin']);
const dateFields=new Set(['openedAt','closedAt','receivedAt','dueAt','sentAt','validUntil']);
const longFields=new Set(['description','body','notes','note','address','error','blurb','story']);

type Tone='success'|'warning'|'danger'|'info'|'neutral';
type Choice={value:string;label:string};
type StateInfo={label:string;tone:Tone;icon:typeof CircleCheck};
const stateMap:Record<string,StateInfo>={
  paid:{label:'Payé',tone:'success',icon:CircleCheck},completed:{label:'Terminée',tone:'success',icon:CircleCheck},delivered:{label:'Livrée',tone:'success',icon:CircleCheck},accepted:{label:'Accepté',tone:'success',icon:CircleCheck},received:{label:'Réceptionné',tone:'success',icon:CircleCheck},sent:{label:'Envoyé',tone:'success',icon:CircleCheck},active:{label:'Actif',tone:'success',icon:CircleCheck},success:{label:'Réussi',tone:'success',icon:CircleCheck},
  pending:{label:'En attente',tone:'warning',icon:Clock3},partial:{label:'Paiement partiel',tone:'warning',icon:CircleAlert},ready:{label:'Prêt à livrer',tone:'info',icon:Truck},draft:{label:'Brouillon',tone:'neutral',icon:Clock3},processing:{label:'En préparation',tone:'info',icon:Clock3},shipped:{label:'Expédiée',tone:'info',icon:ArrowUpFromLine},open:{label:'Ouverte',tone:'info',icon:CircleCheck},
  cancelled:{label:'Annulé',tone:'danger',icon:XCircle},failed:{label:'Échec',tone:'danger',icon:XCircle},refunded:{label:'Remboursé',tone:'warning',icon:ArrowDownToLine},closed:{label:'Fermée',tone:'neutral',icon:CircleCheck},inactive:{label:'Inactif',tone:'neutral',icon:XCircle},
  manager:{label:'Administrateur',tone:'info',icon:CircleCheck},vendor:{label:'Vendeur',tone:'neutral',icon:CircleCheck},
  in:{label:'Entrée',tone:'success',icon:ArrowDownToLine},out:{label:'Sortie',tone:'danger',icon:ArrowUpFromLine}
};

const statusChoices:Record<string,Choice[]>={
  arrivals:[{value:'draft',label:'Brouillon'},{value:'pending',label:'En attente'},{value:'received',label:'Réceptionné'},{value:'cancelled',label:'Annulé'}],
  sales:[{value:'completed',label:'Terminée'},{value:'pending',label:'En attente'},{value:'cancelled',label:'Annulé'},{value:'refunded',label:'Remboursé'}],
  quotes:[{value:'draft',label:'Brouillon'},{value:'sent',label:'Envoyé'},{value:'accepted',label:'Accepté'},{value:'cancelled',label:'Annulé'}],
  'delivery-notes':[{value:'ready',label:'Prêt à livrer'},{value:'delivered',label:'Livré'},{value:'cancelled',label:'Annulé'}],
  orders:[{value:'pending',label:'En attente'},{value:'processing',label:'En préparation'},{value:'shipped',label:'Expédiée'},{value:'delivered',label:'Livrée'},{value:'cancelled',label:'Annulée'}],
  vaults:[{value:'active',label:'Actif'},{value:'closed',label:'Fermé'}],
  'cash-sessions':[{value:'open',label:'Ouverte'},{value:'closed',label:'Fermée'}],
  messages:[{value:'pending',label:'En attente'},{value:'sent',label:'Envoyé'},{value:'failed',label:'Échec'}],
  'contact-messages':[{value:'pending',label:'À traiter'},{value:'processing',label:'En cours'},{value:'completed',label:'Traité'}]
};
const relationResources:Record<string,string>={categoryId:'categories',brandId:'brands',productId:'products',variantId:'variants',customerId:'customers',supplierId:'suppliers',userId:'users',saleId:'sales',parentId:'documents',cashSessionId:'cash-sessions'};
const valueLabels:Record<string,string>={cash:'Espèces',wave:'Wave',orange_money:'Orange Money',card:'Carte bancaire',credit:'Crédit',bank_transfer:'Virement',mixte:'Paiement mixte',pos:'Boutique / caisse',online:'Boutique en ligne',whatsapp:'WhatsApp',email:'E-mail',invoice:'Facture',quote:'Devis',receipt:'Reçu',credit_note:'Avoir',order:'Commande',payment:'Paiement',information:'Information'};

const endpoint=(resource:string,id?:number)=>`/api/${resource}${id?`/${id}`:''}`;
const displayValue=(key:string,value:unknown)=>{
  if(value===null||value===undefined||value==='')return '—';
  if(booleanFields.has(key)||typeof value==='boolean')return value?'Oui':'Non';
  if(moneyFields.has(key))return money(value);
  if((key.endsWith('At')||dateFields.has(key))&&typeof value==='string')return new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  if(typeof value==='string'&&valueLabels[value])return valueLabels[value];
  return String(value);
};

function semanticInfo(field:string,value:unknown,row:Entity):StateInfo|null{
  if(field==='stock'){
    const stock=Number(value??0);const alertAt=Number(row.alertAt??0);
    if(stock<=0)return{label:`Rupture · ${stock}`,tone:'danger',icon:XCircle};
    if(alertAt>0&&stock<=alertAt)return{label:`Stock faible · ${stock}`,tone:'warning',icon:CircleAlert};
    return{label:`Disponible · ${stock}`,tone:'success',icon:CircleCheck};
  }
  if(field==='quantity'&&(row.type==='in'||row.type==='out')){const incoming=row.type==='in';return{label:`${incoming?'+':'−'}${Math.abs(Number(value))}`,tone:incoming?'success':'danger',icon:incoming?ArrowDownToLine:ArrowUpFromLine}}
  if(booleanFields.has(field)||typeof value==='boolean'){
    const enabled=Boolean(value);const names:Record<string,[string,string]>={active:['Actif','Inactif'],online:['En ligne','Hors ligne'],featured:['Mis en avant','Standard'],restock:['Remis en stock','Non remis en stock'],whatsAppConsent:['WhatsApp autorisé','WhatsApp non autorisé'],secret:['Protégé','Visible']};
    return{label:(names[field]??['Oui','Non'])[enabled?0:1],tone:enabled?'success':'neutral',icon:enabled?CircleCheck:XCircle};
  }
  if(typeof value==='string'&&(field==='status'||field==='role'||field==='direction'||field==='type'))return stateMap[value.toLowerCase()]??null;
  if(field==='paid'&&row.total!==undefined){const paid=Number(value??0),total=Number(row.total??0);if(total>0&&paid>=total)return{label:`Soldé · ${money(paid)}`,tone:'success',icon:CircleCheck};if(paid>0)return{label:`Partiel · ${money(paid)}`,tone:'warning',icon:CircleAlert};return{label:'Non payé',tone:'danger',icon:XCircle}}
  return null;
}

function SemanticValue({field,value,row}:{field:string;value:unknown;row:Entity}){const info=semanticInfo(field,value,row);if(!info)return <>{displayValue(field,value)}</>;const Icon=info.icon;return <span className={`semantic-badge ${info.tone}`} title={info.label}><Icon/>{info.label}</span>}
function Legend({resource}:{resource:string}){let entries:StateInfo[]=[];if(resource==='variants')entries=[{label:'Disponible',tone:'success',icon:CircleCheck},{label:'Stock faible',tone:'warning',icon:CircleAlert},{label:'Rupture',tone:'danger',icon:XCircle}];if(resource==='stock/movements')entries=[stateMap.in,stateMap.out];if(resource==='orders')entries=[stateMap.pending,stateMap.processing,stateMap.delivered,stateMap.cancelled];if(!entries.length)return null;return <div className="intuitive-legend"><strong>Repères :</strong>{entries.map(entry=>{const Icon=entry.icon;return <span className={`semantic-badge ${entry.tone}`} key={entry.label}><Icon/>{entry.label}</span>})}</div>}

function choicesFor(field:string,resource:string):Choice[]|undefined{
  if(field==='status')return statusChoices[resource];
  if(field==='role')return[{value:'manager',label:'Administrateur'},{value:'vendor',label:'Vendeur'}];
  if(field==='direction'||(field==='type'&&resource==='stock/movements'))return[{value:'in',label:'Entrée de stock'},{value:'out',label:'Sortie de stock'}];
  if(field==='paymentMethod'||field==='refundMethod')return[{value:'cash',label:'Espèces'},{value:'wave',label:'Wave'},{value:'orange_money',label:'Orange Money'},{value:'card',label:'Carte bancaire'},{value:'credit',label:'Crédit'},{value:'bank_transfer',label:'Virement'}];
  if(field==='channel')return[{value:'pos',label:'Boutique / caisse'},{value:'online',label:'Boutique en ligne'},{value:'whatsapp',label:'WhatsApp'},{value:'email',label:'E-mail'}];
  if(field==='type'&&(resource==='messages'||resource==='message-templates'))return[{value:'order',label:'Commande'},{value:'payment',label:'Paiement'},{value:'information',label:'Information'}];
  if(field==='currency')return[{value:'XOF',label:'Franc CFA (XOF)'},{value:'EUR',label:'Euro (EUR)'},{value:'USD',label:'Dollar américain (USD)'}];
  return undefined;
}

export default function ResourcePage({title,resource,user,openId,onOpened}:Props){
  const[data,setData]=useState<Entity[]>([]);
  const[loading,setLoading]=useState(true);
  const[query,setQuery]=useState('');
  // La recherche part au serveur : filtrer côté navigateur ne voyait que
  // les lignes déjà chargées, donc jamais au-delà de la première page.
  const[total,setTotal]=useState(0);
  const[loadingMore,setLoadingMore]=useState(false);
  const[dialog,setDialog]=useState<Dialog>(null);
  const[returning,setReturning]=useState(false);
  const[adjusting,setAdjusting]=useState<Entity|null>(null);
  const[error,setError]=useState('');
  const isAdmin=user.role==='manager';
  const canWrite=isAdmin||!managerOnlyResources.has(resource);
  // Le vendeur a les mêmes gestes que le gérant sur les factures : lignes,
  // règlements, signature, suppression. Le serveur les lui ouvre, l'écran doit
  // suivre — sinon les boutons restent cachés alors que l'action passerait.
  // Devis et bons de livraison gardent leurs verrous.
  const fullDocument=isAdmin||(dialog?.resource??resource)==='sales';
  const openLinked=async(kind:'sales'|'quotes'|'delivery-notes',row:Entity)=>{try{const full=await api<Entity>(endpoint(kind,row.id));setDialog({mode:'detail',row:full,resource:kind})}catch(reason){setError((reason as Error).message)}};
  const updateDocument=async(values:Record<string,unknown>)=>{if(!dialog?.row)return;const target=dialog.resource??resource;try{await api(endpoint(target,dialog.row.id),{method:'PUT',body:JSON.stringify({...dialog.row,...values})});const full=await api<Entity>(endpoint(target,dialog.row.id));setDialog({mode:'detail',row:full,resource:target})}catch(reason){setError((reason as Error).message);throw reason}};
  const refreshDialog=async(target=dialog?.resource??resource)=>{if(!dialog?.row)return;const full=await api<Entity>(endpoint(target,dialog.row.id));setDialog({mode:'detail',row:full,resource:target})};
  const updateLine=async(line:Entity,values:Record<string,unknown>)=>{if(!dialog?.row)return;const target=dialog.resource??resource;await api(`${endpoint(target,dialog.row.id)}/items/${line.id}`,{method:'PUT',body:JSON.stringify(values)});await refreshDialog(target)};
  const addLine=async(values:Record<string,unknown>)=>{if(!dialog?.row)return;const target=dialog.resource??resource;await api(`${endpoint(target,dialog.row.id)}/items`,{method:'POST',body:JSON.stringify(values)});await refreshDialog(target)};
  const deleteLine=async(line:Entity)=>{if(!dialog?.row)return;const target=dialog.resource??resource;await api(`${endpoint(target,dialog.row.id)}/items/${line.id}`,{method:'DELETE'});await refreshDialog(target)};
  const addPayment=async(method:string,amount:number)=>{if(!dialog?.row)return;await api(`${endpoint('sales',dialog.row.id)}/payments`,{method:'POST',body:JSON.stringify({method,amount})});await refreshDialog('sales')};
  const cancelPayment=async(payment:Entity)=>{if(!dialog?.row)return;await api(`${endpoint('sales',dialog.row.id)}/payments/${payment.id}/cancel`,{method:'POST',body:JSON.stringify({reason:'Annulé par le gérant'})});await refreshDialog('sales')};
  const cancelAllPayments=async()=>{if(!dialog?.row)return;await api(`${endpoint('sales',dialog.row.id)}/payments/cancel-all`,{method:'POST',body:JSON.stringify({reason:'Annulation globale par le gérant'})});await refreshDialog('sales')};
  const convertQuote=async(row:Entity)=>{try{const sale=await api<Entity>(`/api/quotes/${row.id}/convert`,{method:'POST'});setDialog(null);load();alert(`Devis accepté et converti en facture ${String(sale.reference)}.`)}catch(reason){setError((reason as Error).message)}};
  const createDelivery=async(row:Entity)=>{try{const note=await api<Entity>(`/api/sales/${row.id}/delivery-note`,{method:'POST'});setDialog(null);alert(`Bon de livraison ${String(note.reference)} généré.`)}catch(reason){setError((reason as Error).message)}};
  const pageUrl=useCallback((search:string,offset:number)=>`${endpoint(resource)}?limit=${PAGE_SIZE}&offset=${offset}${search?`&q=${encodeURIComponent(search)}`:''}`,[resource]);
  const load=useCallback(()=>{setLoading(true);setError('');apiPage<Entity>(pageUrl(query,0)).then(page=>{setData(page.rows);setTotal(page.total)}).catch(reason=>setError((reason as Error).message)).finally(()=>setLoading(false))},[pageUrl,query]);
  const loadMore=()=>{setLoadingMore(true);apiPage<Entity>(pageUrl(query,data.length)).then(page=>{setData(current=>[...current,...page.rows]);setTotal(page.total)}).catch(reason=>setError((reason as Error).message)).finally(()=>setLoadingMore(false))};
  // Une frappe ne doit pas déclencher une requête par caractère.
  useEffect(()=>{const timer=setTimeout(load,250);return()=>clearTimeout(timer)},[load]);

  // Pièce désignée par un autre écran — la caisse, après un encaissement. On
  // la charge directement plutôt que d'attendre qu'elle apparaisse dans la
  // liste : elle vient d'être créée, et la liste peut être filtrée ou paginée
  // ailleurs. onOpened remet le compteur à zéro, sans quoi revenir sur l'écran
  // rouvrirait indéfiniment la même facture.
  useEffect(()=>{
    if(!openId)return;
    let active=true;
    api<Entity>(endpoint(resource,openId))
      .then(row=>{if(active)setDialog({mode:'detail',row,resource})})
      .catch(reason=>setError((reason as Error).message))
      .finally(()=>{if(active)onOpened?.()});
    return()=>{active=false};
  },[openId,resource,onOpened]);
  const shown=data;
  const columns=useMemo(()=>{const preferred=['reference','name','sku','email','phone','type','reason','status','active','online','stock','quantity','price','total','paid','balance','role','createdAt'];const keys=new Set(data.flatMap(Object.keys));return preferred.filter(key=>keys.has(key)).slice(0,6)},[data]);
  const openDetail=async(row:Entity)=>{setError('');try{const full=await api<Entity>(endpoint(resource,row.id));setDialog({mode:'detail',row:full})}catch(reason){setError((reason as Error).message)}};
  const stockWarning:Record<string,string>={
    sales:'La marchandise vendue sera remise en stock.',
    returns:'Les articles remis en stock lors de ce retour en seront retirés.',
    arrivals:'Les unités reçues lors de cet arrivage seront retirées du stock.',
    orders:'La marchandise sortie pour cette commande sera remise en stock.',
  };
  // Dupliquer une fiche : la copie s'ouvre aussitôt en modification, puisque
  // c'est ce qui reste à faire — changer la taille, le nom, le prix.
  const duplicate=useCallback(async(row:Entity)=>{
    setError('');
    try{
      const copy=await api<Entity>(`/api/products/${row.id}/duplicate`,{method:'POST'});
      await load();
      setDialog({mode:'edit',row:copy});
    }catch(problem){setError((problem as Error).message)}
  },[load]);
  const remove=async(row:Entity,resourceName=resource)=>{const note=stockWarning[resourceName];if(!confirm(`Supprimer définitivement « ${recordTitle(row)} » ?${note?`\n\n${note}`:''}`))return;try{await api(endpoint(resourceName,row.id),{method:'DELETE'});if(dialog?.row?.id===row.id)setDialog(null);load()}catch(reason){setError((reason as Error).message)}};
  return <>
    <div className="toolbar"><div className="search"><Search/><input placeholder={resource==='sales'?'Rechercher une facture, un client…':resource==='quotes'?'Rechercher un devis, un client…':resource==='delivery-notes'?'Rechercher un bon de livraison…':`Rechercher dans ${title.toLowerCase()}…`} value={query} onChange={event=>setQuery(event.target.value)}/></div>{canWrite&&!['sales','delivery-notes'].includes(resource)&&<button className="primary compact" onClick={()=>resource==='returns'?setReturning(true):setDialog({mode:'create'})}><Plus/>{resource==='returns'?'Nouveau retour':'Nouveau'}</button>}</div>
    <Legend resource={resource}/>
    {error&&<div className="error resource-error">{error}</div>}
    {resource==='products'?<ProductLibrary rows={shown} loading={loading} isAdmin={canWrite} onOpen={openDetail} onEdit={row=>setDialog({mode:'edit',row})} onDuplicate={duplicate} onDelete={remove} onReload={load}/>:<div className="panel table-panel">{loading?<Loading/>:shown.length===0?<Empty title={title}/>:<div className="table-wrap"><table className="records-table"><thead><tr>{columns.map(column=><th key={column}>{labels[column]??column}</th>)}<th className="actions-heading">Actions</th></tr></thead><tbody>{shown.map(row=><tr key={row.id} tabIndex={0} onClick={()=>void openDetail(row)} onKeyDown={event=>{if(event.key==='Enter')void openDetail(row)}}>{columns.map(column=><td key={column}><SemanticValue field={column} value={row[column]} row={row}/></td>)}<td className="row-actions" onClick={event=>event.stopPropagation()}><button className="action-button" title="Voir la fiche" aria-label={`Voir ${recordTitle(row)}`} onClick={()=>void openDetail(row)}><Eye/><span>Voir</span></button>{canWrite&&<><button className="action-button" title="Modifier cet enregistrement" aria-label={`Modifier ${recordTitle(row)}`} onClick={()=>setDialog({mode:'edit',row})}><Pencil/><span>Modifier</span></button><button className="action-button danger" title="Supprimer cet enregistrement" aria-label={`Supprimer ${recordTitle(row)}`} onClick={()=>void remove(row)}><Trash2/><span>Supprimer</span></button></>}</td></tr>)}</tbody></table></div>}</div>}
    {!loading&&shown.length>0&&<div className="list-footer"><span>{shown.length} sur {total} {total>1?'enregistrements':'enregistrement'}</span>{shown.length<total&&<button className="compact" disabled={loadingMore} onClick={loadMore}>{loadingMore?'Chargement…':'Charger la suite'}</button>}</div>}
    {dialog?.mode==='detail'&&dialog.row&&(['sales','quotes','delivery-notes'].includes(dialog.resource??resource)?<DocumentWorkspace document={dialog.row} kind={(dialog.resource??resource)==='quotes'?'quote':(dialog.resource??resource)==='delivery-notes'?'delivery':'invoice'} isAdmin={fullDocument} canSettle={canWrite} onClose={()=>setDialog(null)} onDelete={()=>void remove(dialog.row!,dialog.resource??resource)} onUpdate={updateDocument} onUpdateLine={updateLine} onAddLine={addLine} onDeleteLine={deleteLine} onAddPayment={addPayment} onCancelPayment={cancelPayment} onCancelAllPayments={cancelAllPayments} onConvert={(dialog.resource??resource)==='quotes'?()=>void convertQuote(dialog.row!):undefined} onGenerateDelivery={(dialog.resource??resource)==='sales'?()=>void createDelivery(dialog.row!):undefined} onOpenInvoice={row=>void openLinked('sales',row)} onOpenQuote={row=>void openLinked('quotes',row)} onOpenDelivery={row=>void openLinked('delivery-notes',row)}/>:<DetailDialog title={title} resource={dialog.resource??resource} row={dialog.row} isAdmin={canWrite} onClose={()=>setDialog(null)} onEdit={()=>setDialog({mode:'edit',row:dialog.row})} onDelete={()=>void remove(dialog.row!)}
      onAdjustStock={variant=>setAdjusting(variant)}
/>)} 
    {(dialog?.mode==='create'||dialog?.mode==='edit')&&<RecordForm title={dialog.resource==='variants'?'Déclinaison':title} resource={dialog.resource??resource} row={dialog.row} mode={dialog.mode} onClose={()=>{const parent=dialog.parent;setDialog(parent?{mode:'detail',row:parent}:null)}} onDone={()=>{const parent=dialog.parent;if(parent)void openDetail(parent);else setDialog(null);load()}}/>}
    {adjusting&&<StockAdjust variant={adjusting} onClose={()=>setAdjusting(null)} onDone={()=>{const parent=dialog?.row;setAdjusting(null);if(parent)void openDetail(parent);load()}}/>}
    {returning&&<ReturnForm onClose={()=>setReturning(false)} onSaved={load}/>}
  </>;
}

type ProductVariantView=Entity&{price?:number;stock?:number;alertAt?:number;active?:boolean};
type ProductImageView=Entity&{url?:string;alt?:string;primary?:boolean;position?:number};

function ProductLibrary({rows,loading,isAdmin,onOpen,onEdit,onDuplicate,onDelete,onReload}:{rows:Entity[];loading:boolean;isAdmin:boolean;onOpen:(row:Entity)=>Promise<void>;onEdit:(row:Entity)=>void;onDuplicate:(row:Entity)=>Promise<void>;onDelete:(row:Entity)=>Promise<void>;onReload:()=>void}){
  const[filter,setFilter]=useState<'all'|'available'|'alert'>('all');
  const[sort,setSort]=useState<'recent'|'name'|'stock'>('recent');
  const[lookups,setLookups]=useState<{categories:Record<number,string>;brands:Record<number,string>}>({categories:{},brands:{}});
  const[uploading,setUploading]=useState<number|null>(null);const[uploadError,setUploadError]=useState('');
  useEffect(()=>{let active=true;Promise.all([api<Entity[]>('/api/categories'),api<Entity[]>('/api/brands')]).then(([categories,brands])=>{if(active)setLookups({categories:Object.fromEntries(categories.map(item=>[item.id,String(item.name??`Catégorie #${item.id}`)])),brands:Object.fromEntries(brands.map(item=>[item.id,String(item.name??`Marque #${item.id}`)]))})}).catch(()=>{});return()=>{active=false}},[]);
  const products=useMemo(()=>rows.map(row=>{const variants=(row.variants??[]) as ProductVariantView[];const activeVariants=variants.filter(item=>item.active!==false);const stock=activeVariants.reduce((sum,item)=>sum+Number(item.stock??0),0);const alerts=activeVariants.filter(item=>Number(item.stock??0)<=Number(item.alertAt??0));const prices=activeVariants.map(item=>Number(item.price??0)).filter(Boolean);return{row,variants:activeVariants,stock,alerts,price:prices.length?Math.min(...prices):0}}),[rows]);
  const visible=useMemo(()=>products.filter(product=>filter==='all'||filter==='available'?filter==='all'||product.stock>0:product.alerts.length>0).sort((a,b)=>sort==='name'?String(a.row.name).localeCompare(String(b.row.name),'fr'):sort==='stock'?a.stock-b.stock:Number(b.row.id)-Number(a.row.id)),[products,filter,sort]);
  const variantCount=products.reduce((sum,product)=>sum+product.variants.length,0);const totalStock=products.reduce((sum,product)=>sum+product.stock,0);const alertCount=products.filter(product=>product.alerts.length>0).length;
  const upload=async(row:Entity,file?:File)=>{if(!file)return;setUploading(row.id);setUploadError('');try{const body=new FormData();body.append('image',file);body.append('alt',String(row.name??'Produit SenValise'));await apiForm(`/api/products/${row.id}/images`,body);onReload()}catch(reason){setUploadError((reason as Error).message)}finally{setUploading(null)}};
  if(loading)return <div className="product-library-panel"><Loading/></div>;
  return <section className="product-library-panel">
    <div className="product-library-summary"><div><strong>{products.length}</strong><span>produits</span></div><div><strong>{variantCount}</strong><span>variantes</span></div><div><strong>{totalStock}</strong><span>unités disponibles</span></div><div className={alertCount?'has-alert':''}><strong>{alertCount}</strong><span>produits à surveiller</span></div><div className="product-view-controls"><div className="product-filters"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Tous</button><button className={filter==='available'?'active':''} onClick={()=>setFilter('available')}>En stock</button><button className={filter==='alert'?'active':''} onClick={()=>setFilter('alert')}>Alertes</button></div><label>Trier<select value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="recent">Plus récents</option><option value="name">Nom A–Z</option><option value="stock">Stock le plus faible</option></select></label></div></div>
    {uploadError&&<div className="error product-upload-error">{uploadError}</div>}
    {visible.length===0?<Empty title="Produits"/>:<div className="product-library-grid">{visible.map(({row,variants,stock,alerts,price})=>{const images=(row.images??[]) as ProductImageView[];const image=images.find(item=>item.primary)??images.sort((a,b)=>Number(a.position??0)-Number(b.position??0))[0];const category=lookups.categories[Number(row.categoryId)]??'Sans catégorie';const brand=lookups.brands[Number(row.brandId)]??'SenValise';const out=stock<=0;const warning=!out&&alerts.length>0;return <article className="product-library-card" key={row.id} tabIndex={0} onClick={()=>void onOpen(row)} onKeyDown={event=>{if(event.key==='Enter')void onOpen(row)}}>
      <div className={`product-library-image shade-${row.id%6}`}><div className="product-image-placeholder"><Package/><span>{String(row.name??'SV').slice(0,2).toUpperCase()}</span></div>{image?.url&&<img src={image.url} alt={image.alt||String(row.name??'Produit')}/>}<span className={`product-stock-state ${out?'danger':warning?'warning':'success'}`}>{out?<XCircle/>:warning?<CircleAlert/>:<CircleCheck/>}{out?'Rupture':warning?'Stock faible':'Disponible'}</span>{row.featured===true&&<span className="featured-product">À la une</span>}</div>
      <div className="product-library-info"><div className="product-card-title"><h2>{String(row.name??'Produit')}</h2><span>#{row.id}</span></div><p>{brand} · {category}</p><div className="product-card-metrics"><span><Layers3/>{variants.length} variante{variants.length!==1?'s':''}</span><span><Boxes/>{stock} unité{stock!==1?'s':''}</span></div><div className="product-price"><small>À partir de</small><strong>{price?money(price):'Prix non défini'}</strong></div></div>
      <div className="product-card-actions" onClick={event=>event.stopPropagation()}><button title="Voir la fiche" aria-label={`Voir ${recordTitle(row)}`} onClick={()=>void onOpen(row)}><Eye/><span>Voir</span></button>{isAdmin&&<><button title="Modifier" aria-label={`Modifier ${recordTitle(row)}`} onClick={()=>onEdit(row)}><Pencil/><span>Modifier</span></button><button title="Dupliquer cette fiche" aria-label={`Dupliquer ${recordTitle(row)}`} onClick={()=>void onDuplicate(row)}><Copy/><span>Dupliquer</span></button><label className={uploading===row.id?'uploading':''} title="Choisir une photo"><ImagePlus/><span>{uploading===row.id?'Envoi…':'Photo'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading!==null} onChange={event=>{void upload(row,event.target.files?.[0]);event.target.value=''}}/></label><label className={uploading===row.id?'uploading':''} title="Prendre une photo avec l’appareil"><Camera/><span>Prendre</span><input type="file" accept="image/*" capture="environment" disabled={uploading!==null} onChange={event=>{void upload(row,event.target.files?.[0]);event.target.value=''}}/></label><button className="danger" title="Supprimer" aria-label={`Supprimer ${recordTitle(row)}`} onClick={()=>void onDelete(row)}><Trash2/></button></>}</div>
    </article>})}</div>}
  </section>;
}

type DetailProps={title:string;resource:string;row:Entity;isAdmin:boolean;onClose:()=>void;onEdit:()=>void;onDelete:()=>void;onAdjustStock?:(variant:Entity)=>void};
type Metric={label:string;value:string;tone?:Tone;field?:string};
type Contact={field:string;label:string;href:string;icon:typeof Phone};

const resourceIcons:Record<string,typeof Package>={products:Package,variants:Boxes,'stock/movements':RotateCcw,arrivals:Truck,suppliers:Truck,customers:Users,users:UserRound,returns:RotateCcw,orders:ShoppingCart,vaults:WalletCards,'cash-sessions':WalletCards,'cash-movements':CircleDollarSign,messages:MessageSquare,'message-templates':MessageSquare,'contact-messages':MessageSquare,'home-blocks':Globe2,'delivery-zones':MapPin,categories:Tags,brands:Tags,settings:Settings};
const resourceEyebrow:Record<string,string>={products:'FICHE PRODUIT',variants:'FICHE VARIANTE','stock/movements':'MOUVEMENT DE STOCK',arrivals:'ARRIVAGE FOURNISSEUR',suppliers:'FICHE FOURNISSEUR',customers:'FICHE CLIENT',users:'COMPTE UTILISATEUR',returns:'RETOUR CLIENT',orders:'COMMANDE BOUTIQUE',vaults:'COFFRE CLIENT','cash-sessions':'SESSION DE CAISSE','cash-movements':'MOUVEMENT DE CAISSE',messages:'MESSAGE ENVOYÉ','message-templates':'MODÈLE DE MESSAGE','contact-messages':'MESSAGE REÇU','home-blocks':'BLOC PAGE D’ACCUEIL','delivery-zones':'ZONE DE LIVRAISON',categories:'CATÉGORIE',brands:'MARQUE',settings:'PARAMÈTRE'};

// Ce qu'une fiche produit n'a pas a montrer : l'identifiant de la ligne et les
// dates d'ecriture ne servent qu'au developpeur, et le gerant les lisait comme
// une information de plus a comprendre.
const productNoise=new Set(['id','createdAt','updatedAt','position','slug']);

const detailGroups:{id:string;label:string}[]=[
  {id:'identity',label:'Identité'},{id:'links',label:'Rattachements et classement'},{id:'numbers',label:'Chiffres'},
  {id:'state',label:'États'},{id:'content',label:'Contenu'},{id:'meta',label:'Traçabilité'}
];
const groupKeys:Record<string,string[]>={
  identity:['name','title','reference','sku','barcode','slug','key','subject','recipient','alt','color','size','email','phone'],
  links:['productId','variantId','categoryId','brandId','customerId','supplierId','userId','saleId','quoteId','arrivalId','orderId','vaultId','parentId','cashSessionId','deliveryNoteId','saleReturnId','kind','type','channel','role','reason','direction','category','method','paymentMethod','refundMethod','currency','zone','deliveryZone'],
  numbers:['total','subtotal','discount','tax','taxRate','paid','price','cost','unitPrice','unitCost','landedCost','balance','goal','fee','amount','shipping','customs','otherFees','deliveryFee','openingAmount','expectedAmount','closingAmount','stock','alertAt','quantity','stockBefore','stockAfter','exchangeRate','position','delay'],
  state:['status','active','online','featured','primary','restock','whatsAppConsent','whatsappConsent','secret'],
  content:['description','body','notes','note','address','error','link','imageUrl','url','value'],
  meta:['id','createdAt','updatedAt','openedAt','closedAt','receivedAt','dueAt','sentAt','validUntil']
};
const groupIndex=new Map<string,string>(Object.entries(groupKeys).flatMap(([group,keys])=>keys.map(key=>[key,group] as [string,string])));
const groupFor=(key:string,value:unknown)=>groupIndex.get(key)??(typeof value==='boolean'?'state':typeof value==='number'?'numbers':key.endsWith('At')?'meta':'identity');
const badgeFields=['status','type','direction','role','active','online','featured','restock','secret','whatsappConsent','whatsAppConsent'];
const copyFields=new Set(['sku','barcode','reference','slug','key','email','phone','recipient']);
const proseFields=new Set(['description','body','notes','note','address','error']);
const imageFields=new Set(['imageUrl','url','image','photo','thumbnail']);
const isImageSource=(value:unknown)=>typeof value==='string'&&value.length>1&&/^(https?:\/\/|\/|data:image)/.test(value);
const initialsOf=(text:string)=>text.trim().split(/\s+/).slice(0,2).map(word=>word[0]??'').join('').toUpperCase()||'SV';

function collectImages(row:Entity):{url:string;alt:string}[]{
  const owner=row.product&&typeof row.product==='object'?row.product as Entity:row;
  const list=((owner.images??[]) as ProductImageView[]).filter(item=>isImageSource(item.url));
  const sorted=[...list].sort((a,b)=>Number(Boolean(b.primary))-Number(Boolean(a.primary))||Number(a.position??0)-Number(b.position??0));
  const images=sorted.map(item=>({url:String(item.url),alt:String(item.alt||owner.name||'Photo')}));
  if(images.length)return images;
  for(const key of imageFields)if(isImageSource(row[key]))return[{url:String(row[key]),alt:String(row.alt??row.name??row.title??'Illustration')}];
  return[];
}

function contactLinks(row:Entity):Contact[]{
  const out:Contact[]=[];
  const phone=String(row.phone??'').trim();
  const email=String(row.email??'').trim();
  if(phone){
    const dialable=phone.replace(/[^\d+]/g,'');
    out.push({field:'phone',label:phone,href:`tel:${dialable}`,icon:Phone});
    if(dialable.replace(/\D/g,'').length>=8)out.push({field:'__whatsapp',label:'WhatsApp',href:`https://wa.me/${dialable.replace(/\D/g,'')}`,icon:MessageCircle});
  }
  if(email.includes('@'))out.push({field:'email',label:email,href:`mailto:${email}`,icon:Mail});
  return out;
}

const relationCache=new Map<string,string>();
function useRelationLabels(row:Entity){
  const[,setTick]=useState(0);
  useEffect(()=>{
    const wanted=new Set<string>();
    const scan=(entity:Entity)=>Object.entries(entity).forEach(([key,value])=>{
      const target=relationResources[key];const id=Number(value);
      if(target&&id>0&&!relationCache.has(`${target}#${id}`))wanted.add(`${target}#${id}`);
    });
    scan(row);
    Object.values(row).forEach(value=>{if(Array.isArray(value))(value as Entity[]).forEach(item=>{if(item&&typeof item==='object')scan(item)})});
    if(!wanted.size)return;
    let alive=true;
    void Promise.all([...wanted].slice(0,40).map(async token=>{
      const[target,rawId]=token.split('#');
      try{const item=await api<Entity>(endpoint(target,Number(rawId)));relationCache.set(token,recordTitle(item))}
      catch{relationCache.set(token,`#${rawId}`)}
    })).then(()=>{if(alive)setTick(value=>value+1)});
    return()=>{alive=false};
  },[row]);
  return (key:string,value:unknown)=>{const target=relationResources[key];const id=Number(value);return target&&id>0?relationCache.get(`${target}#${id}`):undefined};
}

function metricsFor(resource:string,row:Entity):Metric[]{
  if(resource==='products'){
    const variants=((row.variants??[]) as ProductVariantView[]).filter(item=>item.active!==false);
    const stock=variants.reduce((sum,item)=>sum+Number(item.stock??0),0);
    const alerts=variants.filter(item=>Number(item.stock??0)<=Number(item.alertAt??0)).length;
    const prices=variants.map(item=>Number(item.price??0)).filter(Boolean);
    return[{label:'Variantes actives',value:String(variants.length)},
      {label:'Stock cumulé',value:`${stock} unité${stock>1?'s':''}`,tone:stock<=0?'danger':alerts?'warning':'success'},
      {label:'Prix à partir de',value:prices.length?money(Math.min(...prices)):'Non défini'},
      {label:'Photos en ligne',value:String(((row.images??[]) as unknown[]).length)}];
  }
  if(resource==='variants'){
    const stock=Number(row.stock??0),alert=Number(row.alertAt??0),price=Number(row.price??0),cost=Number(row.cost??0);
    const margin=price>0&&cost>0?Math.round(((price-cost)/price)*100):null;
    return[{label:'Stock disponible',value:`${stock} unité${stock>1?'s':''}`,tone:stock<=0?'danger':alert>0&&stock<=alert?'warning':'success',field:'stock'},
      {label:'Prix de vente',value:money(price),field:'price'},
      {label:'Coût d’achat',value:money(cost),field:'cost'},
      {label:'Marge',value:margin===null?'Non calculable':`${margin} %`,tone:margin===null?'neutral':margin>=25?'success':margin>0?'warning':'danger'}];
  }
  if(resource==='vaults'){
    const balance=Number(row.balance??0),goal=Number(row.goal??0);const progress=goal>0?Math.round(balance/goal*100):null;
    return[{label:'Solde épargné',value:money(balance),field:'balance'},{label:'Objectif',value:goal?money(goal):'Aucun objectif',field:'goal'},
      {label:'Progression',value:progress===null?'—':`${progress} %`,tone:progress===null?'neutral':progress>=100?'success':progress>=50?'info':'warning'},
      {label:'Dépôts',value:String(((row.deposits??[]) as unknown[]).length)}];
  }
  if(resource==='cash-sessions'){
    const expected=Number(row.expectedAmount??0),closing=Number(row.closingAmount??0);const gap=closing-expected;
    return[{label:'Fond de caisse',value:money(row.openingAmount),field:'openingAmount'},{label:'Montant attendu',value:money(expected),field:'expectedAmount'},
      {label:'Montant compté',value:money(closing),field:'closingAmount'},
      {label:'Écart de caisse',value:`${gap>0?'+':''}${money(gap)}`,tone:gap===0?'success':Math.abs(gap)<1000?'warning':'danger'}];
  }
  if(resource==='stock/movements'){
    const incoming=row.type==='in';const quantity=Math.abs(Number(row.quantity??0));
    return[{label:'Sens du mouvement',value:incoming?'Entrée de stock':'Sortie de stock',tone:incoming?'success':'danger',field:'type'},
      {label:'Quantité',value:`${incoming?'+':'−'}${quantity}`,tone:incoming?'success':'danger',field:'quantity'},
      {label:'Stock avant',value:String(row.stockBefore??'—'),field:'stockBefore'},{label:'Stock après',value:String(row.stockAfter??'—'),field:'stockAfter'}];
  }
  if(resource==='arrivals'){
    const items=(row.items??[]) as Entity[];
    const units=items.reduce((sum,item)=>sum+Number(item.quantity??0),0);
    const goods=items.reduce((sum,item)=>sum+Number(item.landedCost??item.unitCost??0)*Number(item.quantity??0),0);
    const fees=Number(row.shipping??0)+Number(row.customs??0)+Number(row.otherFees??0);
    return[{label:'Lignes',value:String(items.length)},{label:'Unités attendues',value:String(units)},
      {label:'Valeur marchandise',value:money(goods)},{label:'Frais annexes',value:money(fees)}];
  }
  if(resource==='orders'){
    const items=(row.items??[]) as Entity[];
    return[{label:'Total commande',value:money(row.total),field:'total'},{label:'Frais de livraison',value:money(row.deliveryFee),field:'deliveryFee'},
      {label:'Articles',value:String(items.reduce((sum,item)=>sum+Number(item.quantity??0),0))},{label:'Lignes',value:String(items.length)}];
  }
  if(resource==='delivery-zones')return[{label:'Tarif',value:money(row.fee),field:'fee'},{label:'Délai annoncé',value:String(row.delay||'Non précisé'),field:'delay'}];
  const fallback=['total','paid','amount','balance','fee','price','cost','quantity','stock'].filter(key=>row[key]!==undefined&&row[key]!==null&&row[key]!=='');
  return fallback.slice(0,4).map(key=>({label:labels[key]??key,value:displayValue(key,row[key]),field:key}));
}

function heroSubtitle(resource:string,row:Entity,relation:(key:string,value:unknown)=>string|undefined){
  const parts:string[]=[];
  if(resource==='products')parts.push(relation('brandId',row.brandId)??'Sans marque',relation('categoryId',row.categoryId)??'Sans catégorie');
  else if(resource==='variants'){
    const product=row.product&&typeof row.product==='object'?row.product as Entity:undefined;
    parts.push(String(product?.name??relation('productId',row.productId)??'Produit non lié'));
    if(row.color)parts.push(String(row.color));
    if(row.size)parts.push(String(row.size));
  }else['reference','kind','channel','zone','recipient','role'].forEach(key=>{if(row[key])parts.push(displayValue(key,row[key]))});
  return parts.filter(Boolean).slice(0,3).join(' · ');
}

function CopyButton({value}:{value:string}){
  const[done,setDone]=useState(false);
  const copy=()=>{void navigator.clipboard?.writeText(value).then(()=>{setDone(true);window.setTimeout(()=>setDone(false),1600)}).catch(()=>{})};
  return <button type="button" className="detail-copy" onClick={copy} title={done?'Copié':'Copier'} aria-label={`Copier ${value}`}>{done?<Check/>:<Copy/>}</button>;
}

function DetailValue({field,value,row,relation}:{field:string;value:unknown;row:Entity;relation:(key:string,value:unknown)=>string|undefined}){
  if(relationResources[field]&&Number(value)>0)
    return <span className="detail-relation"><b>{relation(field,value)??'Chargement…'}</b><small>#{Number(value)}</small></span>;
  if(imageFields.has(field)&&isImageSource(value))
    return <a className="detail-inline-image" href={String(value)} target="_blank" rel="noreferrer" title={String(value)}><img src={String(value)} alt="" loading="lazy"/><span>Voir l’image</span></a>;
  if(typeof value==='string'&&/^https?:\/\//.test(value))
    return <a className="detail-external" href={value} target="_blank" rel="noreferrer" title={value}>{value.replace(/^https?:\/\//,'')}<ExternalLink/></a>;
  if(proseFields.has(field)&&typeof value==='string'&&value.trim())return <span className="detail-prose">{value}</span>;
  return <SemanticValue field={field} value={value} row={row}/>;
}

function nestedColumns(rows:Entity[],parent:Entity){
  const preferred=['reference','name','productName','description','sku','variantId','productId','userId','customerId','type','direction','category','method','reason','color','size','quantity','unitPrice','unitCost','landedCost','price','cost','stock','stockBefore','stockAfter','amount','total','position','primary','url','alt','status','note','notes'];
  const keys=new Set(rows.flatMap(item=>Object.entries(item).filter(([,value])=>value===null||typeof value!=='object').map(([key])=>key)));
  const usable=[...keys].filter(key=>!readonly.has(key)&&!(key.endsWith('Id')&&rows.every(item=>Number(item[key])===Number(parent.id))));
  return[...preferred.filter(key=>usable.includes(key)),...usable.filter(key=>!preferred.includes(key))].slice(0,8);
}

function DetailGallery({images}:{images:ProductImageView[]}){
  const sorted=[...images].sort((a,b)=>Number(Boolean(b.primary))-Number(Boolean(a.primary))||Number(a.position??0)-Number(b.position??0));
  return <div className="detail-gallery">{sorted.map((image,index)=><figure key={image.id??index}>
    <span className="detail-gallery-frame">{isImageSource(image.url)?<img src={String(image.url)} alt={String(image.alt??'')} loading="lazy"/>:<ImagePlus/>}{image.primary===true&&<b>Photo principale</b>}</span>
    <figcaption><strong>{String(image.alt||`Photo ${index+1}`)}</strong><small>Position {Number(image.position??0)}</small>
      {isImageSource(image.url)&&<a href={String(image.url)} target="_blank" rel="noreferrer">Ouvrir en grand<ExternalLink/></a>}</figcaption>
  </figure>)}</div>;
}

function DetailCollection({name,rows,parent,relation}:{name:string;rows:Entity[];parent:Entity;relation:(key:string,value:unknown)=>string|undefined}){
  const columns=nestedColumns(rows,parent);
  return <section className="detail-block">
    <header><h3>{labels[name]??name}</h3><span>{rows.length}</span><i/></header>
    <div className="detail-table-wrap"><table className="detail-table">
      <thead><tr>{columns.map(column=><th key={column}>{labels[column]??column}</th>)}</tr></thead>
      <tbody>{rows.map((item,index)=><tr key={item.id??index}>{columns.map(column=><td key={column}><DetailValue field={column} value={item[column]} row={item} relation={relation}/></td>)}</tr>)}</tbody>
    </table></div>
  </section>;
}

function DetailLinked({name,record,relation}:{name:string;record:Entity;relation:(key:string,value:unknown)=>string|undefined}){
  const thumb=collectImages(record)[0];
  const facts=Object.entries(record).filter(([key,value])=>!readonly.has(key)&&key!=='name'&&(value===null||typeof value!=='object')&&value!==''&&value!==null).slice(0,4);
  return <div className="detail-linked">
    <span className="detail-linked-thumb">{thumb?<img src={thumb.url} alt={thumb.alt} loading="lazy"/>:<Package/>}</span>
    <div><small>{labels[name]??name}</small><strong>{recordTitle(record)}</strong>
      <p>{facts.map(([key,value])=><span key={key}><em>{labels[key]??key}</em><b><DetailValue field={key} value={value} row={record} relation={relation}/></b></span>)}</p></div>
  </div>;
}

function DetailDialog({title,resource,row,isAdmin,onClose,onEdit,onDelete,onAdjustStock}:DetailProps){
  const relation=useRelationLabels(row);
  const[shot,setShot]=useState(0);
  useEffect(()=>setShot(0),[row]);
  const images=useMemo(()=>collectImages(row),[row]);
  const metrics=useMemo(()=>metricsFor(resource,row),[resource,row]);
  const contacts=useMemo(()=>contactLinks(row),[row]);
  const metricFields=new Set(metrics.map(metric=>metric.field).filter((field):field is string=>Boolean(field)));
  const badges=badgeFields.filter(field=>!metricFields.has(field)&&row[field]!==undefined&&row[field]!==null&&row[field]!=='')
    .map(field=>({field,info:semanticInfo(field,row[field],row)}))
    .filter((entry):entry is{field:string;info:StateInfo}=>Boolean(entry.info)).slice(0,5);
  const hidden=new Set<string>([...metricFields,...badges.map(entry=>entry.field),...contacts.map(contact=>contact.field)]);
  const scalars=Object.entries(row).filter(([key,value])=>!hidden.has(key)&&!Array.isArray(value)&&(value===null||typeof value!=='object'))
    .filter(([key,value])=>resource!=='products'||(value!==null&&value!==''&&value!==false&&value!==0&&!productNoise.has(key)));
  const sections=detailGroups.map(group=>({...group,fields:scalars.filter(([key,value])=>groupFor(key,value)===group.id)})).filter(group=>group.fields.length);
  const gallery=(row.images??[]) as ProductImageView[];
  const isProduct=resource==='products'&&Boolean(onAdjustStock);
  const collections=Object.entries(row).filter(([key,value])=>Array.isArray(value)&&value.length&&key!=='images'&&!(isProduct&&key==='variants')) as [string,Entity[]][];
  const linked=Object.entries(row).filter(([,value])=>value!==null&&typeof value==='object'&&!Array.isArray(value)) as [string,Entity][];
  const Icon=resourceIcons[resource]??Package;
  const index=Math.min(shot,Math.max(images.length-1,0));
  const cover=images[index];
  const subtitle=heroSubtitle(resource,row,relation);
  return <div className="overlay" onMouseDown={onClose}>
    <section className="modal detail-modal" onMouseDown={event=>event.stopPropagation()} aria-modal="true" role="dialog" aria-label={recordTitle(row)}>
      <header className="detail-hero">
        <div className="detail-hero-media">
          <span className="detail-cover">{cover?<img src={cover.url} alt={cover.alt} loading="lazy"/>:<span className="detail-monogram"><Icon/><b>{initialsOf(recordTitle(row))}</b></span>}</span>
          {images.length>1&&<div className="detail-thumbs">{images.slice(0,5).map((image,position)=>
            <button type="button" key={`${image.url}-${position}`} className={position===index?'active':''} onClick={()=>setShot(position)} aria-label={`Photo ${position+1}`}><img src={image.url} alt="" loading="lazy"/></button>)}</div>}
        </div>
        <div className="detail-hero-body">
          <small>{resourceEyebrow[resource]??`FICHE ${title.toUpperCase()}`}</small>
          <h2>{recordTitle(row)}</h2>
          <p>{subtitle||title}<em>#{row.id}</em></p>
          {(badges.length>0||contacts.length>0)&&<div className="detail-hero-chips">
            {badges.map(({field,info})=>{const BadgeIcon=info.icon;return <span className={`semantic-badge ${info.tone}`} key={field}><BadgeIcon/>{info.label}</span>})}
            {contacts.map(contact=>{const ContactIcon=contact.icon;return <a className="detail-contact" key={contact.field} href={contact.href} target={contact.href.startsWith('http')?'_blank':undefined} rel="noreferrer"><ContactIcon/>{contact.label}</a>})}
          </div>}
        </div>
        <button type="button" className="icon detail-close" onClick={onClose} aria-label="Fermer"><X/></button>
      </header>
      <div className="detail-body">
        {metrics.length>0&&<div className="detail-metrics">{metrics.map(metric=>
          <div className={`detail-metric tone-${metric.tone??'neutral'}`} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>}
        {sections.map(group=><section className={`detail-section group-${group.id} ${isProduct?'compact-section':''}`} key={group.id}>
          <header><h3>{group.label}</h3><i/></header>
          <div className="detail-fields">{group.fields.map(([key,value])=><div key={key}>
            <span>{labels[key]??key}{copyFields.has(key)&&value?<CopyButton value={String(value)}/>:null}</span>
            <strong><DetailValue field={key} value={value} row={row} relation={relation}/></strong>
          </div>)}</div>
        </section>)}
        {gallery.length>0&&<section className="detail-block">
          <header><h3>{labels.images}</h3><span>{gallery.length}</span><i/></header>
          <DetailGallery images={gallery}/>
        </section>}
        {linked.length>0&&<section className="detail-block">
          <header><h3>Éléments liés</h3><span>{linked.length}</span><i/></header>
          <div className="detail-linked-list">{linked.map(([key,record])=><DetailLinked key={key} name={key} record={record} relation={relation}/>)}</div>
        </section>}
        {collections.map(([key,rows])=><DetailCollection key={key} name={key} rows={rows} parent={row} relation={relation}/>)}
      </div>
      <footer className="detail-actions">
        <button type="button" onClick={onClose}>Fermer</button>
        {isAdmin&&<><button type="button" className="secondary-action" onClick={onEdit}><Pencil/>Modifier</button>
        <button type="button" className="danger-action" onClick={onDelete}><Trash2/>Supprimer</button></>}
      </footer>
    </section>
  </div>;
}

function RecordForm({title,resource,row,mode,onClose,onDone}:{title:string;resource:string;row?:Entity;mode:'create'|'edit';onClose:()=>void;onDone:()=>void}){
  const formFields=useMemo(()=>{const configured=configuredFields[resource]??[];if(mode==='create')return configured.length?configured:['name','status'];const actual=Object.keys(row??{}).filter(key=>!readonly.has(key)&&typeof row?.[key]!=='object');return [...new Set([...configured,...actual])]},[mode,resource,row]);
  const initial=useMemo(()=>Object.fromEntries(formFields.map(field=>{
    if(mode==='create'&&(creationDefaults[resource]??{})[field]!==undefined)return [field,(creationDefaults[resource] as Record<string,string|boolean>)[field]];
    if(mode==='edit'&&resource==='products'&&field==='price')return [field,String(((row?.variants??[]) as Entity[])[0]?.price??0)];
    return [field,toInputValue(field,row?.[field])];
  })),[formFields,row,mode,resource]);
  const hiddenFields=useMemo(()=>advancedFields[resource]??[],[resource]);
  const creationOnly=useMemo(()=>mode==='create'?[]:(creationOnlyFields[resource]??[]),[mode,resource]);
  const mainFields=useMemo(()=>formFields.filter(field=>!hiddenFields.includes(field)&&!creationOnly.includes(field)),[formFields,hiddenFields,creationOnly]);
  const extraFields=useMemo(()=>formFields.filter(field=>hiddenFields.includes(field)&&!creationOnly.includes(field)),[formFields,hiddenFields,creationOnly]);
  const[form,setForm]=useState<Record<string,string|boolean>>(initial);
  const[relationOptions,setRelationOptions]=useState<Record<string,Choice[]>>({});
  const[error,setError]=useState('');const[saving,setSaving]=useState(false);
  // Photos choisies avant l'enregistrement. Le téléversement s'accroche à un
  // identifiant de produit : elles attendent donc que la fiche existe.
  const acceptsPhotos=resource==='products';
  const[photos,setPhotos]=useState<File[]>([]);
  const[advanced,setAdvanced]=useState(false);
  const[pricedTouched,setPricedTouched]=useState<Set<string>>(()=>new Set());
  // Stock des déclinaisons du produit. Le stock ne vit pas sur la fiche
  // produit mais sur ses déclinaisons : on le corrige ici parce que c'est là
  // qu'on l'attend, et la correction part en mouvement pour rester traçable.
  const[stockRows,setStockRows]=useState<{id:number;sku:string;color:string;size:string;stock:number}[]>([]);
  const[stockEdits,setStockEdits]=useState<Record<number,string>>({});
  const editsStock=resource==='products'&&mode==='edit'&&Boolean(row?.id);
  useEffect(()=>{
    if(!editsStock){setStockRows([]);return}
    const rows=((row?.variants??[]) as Entity[]).map(item=>({
      id:Number(item.id),sku:String(item.sku??''),color:String(item.color??''),
      size:String(item.size??''),stock:Number(item.stock??0),
    })).filter(item=>item.id>0);
    setStockRows(rows);
  },[editsStock,row]);
  const previews=useMemo(()=>photos.map(file=>({name:file.name,url:URL.createObjectURL(file)})),[photos]);
  useEffect(()=>()=>{previews.forEach(item=>URL.revokeObjectURL(item.url))},[previews]);
  // La FileList est un objet vivant : on la copie avant de rendre la main,
  // car le champ est réinitialisé aussitôt (pour pouvoir reprendre le même
  // fichier) et la mise à jour d'état, elle, s'exécute après.
  const addPhotos=(files:FileList|null)=>{if(!files||!files.length)return;const picked=Array.from(files);setPhotos(current=>[...current,...picked])};
  const dropPhoto=(index:number)=>setPhotos(current=>current.filter((_,position)=>position!==index));
  useEffect(()=>{let active=true;const relations=[...new Set(formFields.filter(field=>relationResources[field]))];if(!relations.length)return;Promise.all(relations.map(async field=>{const rows=await api<Entity[]>(endpoint(relationResources[field]));return[field,rows.map(item=>({value:String(item.id),label:recordTitle(item)}))] as const})).then(entries=>{if(active)setRelationOptions(Object.fromEntries(entries))}).catch(()=>{});return()=>{active=false}},[formFields]);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();setSaving(true);setError('');
    try{
      const body=Object.fromEntries(formFields.filter(field=>!(field==='password'&&!form[field])).map(field=>[field,toPayloadValue(field,form[field])]));
      const saved=await api<Entity>(endpoint(resource,row?.id),{method:mode==='edit'?'PUT':'POST',body:JSON.stringify(body)});
      const target=Number(row?.id??saved?.id);
      if(acceptsPhotos&&photos.length&&target){
        // En série : le serveur numérote les photos et marque la première comme
        // principale, ordre qu'un envoi concurrent rendrait imprévisible.
        for(const file of photos){
          const payload=new FormData();
          payload.append('image',file);
          payload.append('alt',String(form.name??title));
          await apiForm(`/api/products/${target}/images`,payload);
        }
      }
      if(mode==='edit'&&resource==='products'){
        const first=((row?.variants??[]) as Entity[])[0];
        const wanted=Number(form.price)||0;
        if(first&&wanted!==Number(first.price??0)){
          await api(`/api/variants/${first.id}`,{method:'PUT',body:JSON.stringify({...first,price:wanted})});
        }
      }
      // Les corrections de stock partent après l'enregistrement de la fiche :
      // une seule d'entre elles qui échoue ne doit pas perdre les autres
      // modifications, déjà saisies.
      for(const line of stockRows){
        const typed=stockEdits[line.id];
        if(typed===undefined||typed==='')continue;
        const delta=Number(typed)-Number(line.stock);
        if(!delta)continue;
        await api('/api/stock/adjust',{method:'POST',body:JSON.stringify({variantId:line.id,quantity:delta,reason:'correction',note:`Corrigé depuis la fiche ${String(form.name??title)}`})});
      }
      onDone();
    }catch(reason){setError((reason as Error).message)}
    finally{setSaving(false)}
  };
  return <div className="overlay" onMouseDown={onClose}><form className="modal edit-modal" role="dialog" aria-modal="true" onSubmit={submit} onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><small>{mode==='edit'?(resource==='sales'?'MODIFICATION DE FACTURE':'MODIFICATION'):'NOUVEL ENREGISTREMENT'}</small><h2>{mode==='edit'?recordTitle(row!):`Ajouter · ${title}`}</h2>{mode==='edit'&&<p>{resource==='sales'?'Vous modifiez la facture affichée.':`#${row?.id}`}</p>}</div><button type="button" className="icon" onClick={onClose} aria-label="Fermer"><X/></button></div>{resource==='sales'&&<div className="form-help"><CircleAlert/><span>Les montants ci-dessous sont ceux imprimés, exportés et envoyés au client.</span></div>}<div className="form-grid">{mainFields.map(field=><Fragment key={field}>
      <Field name={field} value={form[field]} options={relationOptions[field]??choicesFor(field,resource)} onChange={value=>setForm(current=>({...current,[field]:value}))}/>
      {priceFields.has(field)&&<DenominationPad label={`Ajouter au ${(labels[field]??field).toLowerCase()}`}
        fromZero={!pricedTouched.has(field)}
        value={String(form[field]??'')}
        onChange={value=>{setPricedTouched(current=>new Set(current).add(field));setForm(current=>({...current,[field]:value}))}}/>}
    </Fragment>)}</div>
    {editsStock&&stockRows.length>0&&<div className="form-stock">
      <h3>Stock</h3>
      <p>Saisissez la quantité réelle : l’écart part au journal des mouvements avec son motif.</p>
      {stockRows.map(line=>{
        const label=[line.color,line.size].filter(Boolean).join(' · ');
        const typed=stockEdits[line.id];
        const delta=typed===undefined||typed===''?0:Number(typed)-Number(line.stock);
        return <div className="form-stock-line" key={line.id}>
          <div><strong>{line.sku}</strong>{label&&<span>{label}</span>}</div>
          <em>{line.stock} u. en stock</em>
          <input type="number" min="0" placeholder={String(line.stock)} value={typed??''}
            onChange={event=>setStockEdits(current=>({...current,[line.id]:event.target.value}))}
            aria-label={`Nouveau stock pour ${line.sku}`}/>
          <b className={delta>0?'up':delta<0?'down':''}>{delta?`${delta>0?'+':''}${delta}`:'—'}</b>
        </div>;
      })}
    </div>}
    {extraFields.length>0&&<div className="form-advanced">
      <button type="button" onClick={()=>setAdvanced(value=>!value)} aria-expanded={advanced}>
        <ChevronDown className={advanced?'open':''}/>{advanced?'Masquer les options avancées':'Options avancées'}
      </button>
      {advanced&&<div className="form-grid">{extraFields.map(field=><Field key={field} name={field} value={form[field]} options={relationOptions[field]??choicesFor(field,resource)} onChange={value=>setForm(current=>({...current,[field]:value}))}/>)}</div>}
    </div>}{acceptsPhotos&&<div className="photo-picker">
      <div className="photo-picker-head"><span>Photos</span><label className="photo-add"><ImagePlus/><span>Ajouter des photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event=>{addPhotos(event.target.files);event.target.value=''}}/></label><label className="photo-add"><Camera/><span>Prendre une photo</span><input type="file" accept="image/*" capture="environment" onChange={event=>{const file=event.target.files?.[0];if(file)setPhotos(current=>[...current,file]);event.target.value=''}}/></label></div>
      {previews.length===0
        ?<p className="photo-empty">Aucune photo en attente. La première ajoutée deviendra la photo principale.</p>
        :<ul className="photo-list">{previews.map((item,index)=><li key={item.url}><img src={item.url} alt={item.name}/>{index===0&&<em>Principale</em>}<button type="button" onClick={()=>dropPhoto(index)} aria-label={`Retirer ${item.name}`}><X/></button></li>)}</ul>}
      <small className="photo-note">JPEG, PNG ou WebP, 10 Mo maximum par fichier. L’envoi a lieu après l’enregistrement de la fiche.</small>
    </div>}{error&&<div className="error">{error}</div>}<div className="modal-actions"><button type="button" onClick={onClose}>Annuler</button><button className="primary" type="submit" disabled={saving}>{saving?(photos.length?'Envoi des photos…':'Enregistrement…'):mode==='edit'?'Enregistrer les modifications':'Créer'}</button></div></form></div>;
}

function Field({name,value,options,onChange}:{name:string;value:string|boolean;options?:Choice[];onChange:(value:string|boolean)=>void}){
  if(booleanFields.has(name)||typeof value==='boolean')return <label className="checkbox-field"><input type="checkbox" checked={Boolean(value)} onChange={event=>onChange(event.target.checked)}/><span><b>{labels[name]??name}</b></span></label>;
  if(options)return <label>{labels[name]??name}<select value={String(value??'')} onChange={event=>onChange(event.target.value)}><option value="">Sélectionner…</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  const inputType=name==='password'?'password':dateFields.has(name)?'datetime-local':numericFields.has(name)?'number':name==='email'?'email':'text';
  if(longFields.has(name))return <label className="field-wide">{labels[name]??name}<textarea rows={4} value={String(value??'')} onChange={event=>onChange(event.target.value)}/></label>;
  return <label>{labels[name]??name}<input type={inputType} step={name==='exchangeRate'?'0.01':undefined} required={['name','reference','sku'].includes(name)} placeholder={name==='password'?'Laisser vide pour conserver le mot de passe':''} value={String(value??'')} onChange={event=>onChange(event.target.value)}/></label>;
}

function toInputValue(key:string,value:unknown):string|boolean{if(booleanFields.has(key)||typeof value==='boolean')return Boolean(value);if(dateFields.has(key)&&typeof value==='string')return value.slice(0,16);return value===null||value===undefined?'':String(value)}
function toPayloadValue(key:string,value:string|boolean){if(typeof value==='boolean')return value;if(numericFields.has(key))return value===''?null:Number(value);if(dateFields.has(key))return value?new Date(value).toISOString():null;return value}
function recordTitle(row:Entity){return String(row.name??row.reference??row.sku??row.email??`Enregistrement #${row.id}`)}
function Loading(){return <div className="loading"><i/><span>Chargement…</span></div>}
function Empty({title}:{title:string}){return <div className="empty"><Package/><h3>Aucun élément</h3><p>Les premiers éléments de « {title} » apparaîtront ici.</p></div>}

// Correction de stock. Elle passe par un mouvement — et non par une écriture
// directe sur la colonne — pour que l'entrée ou la sortie laisse une trace
// dans le journal, avec son motif. Un stock corrigé sans trace est un stock
// que personne ne peut expliquer trois semaines plus tard.
function StockAdjust({variant,onClose,onDone}:{variant:Entity;onClose:()=>void;onDone:()=>void}){
  const current=Number(variant.stock??0);
  const[quantity,setQuantity]=useState('');
  const[reason,setReason]=useState('inventaire');
  const[note,setNote]=useState('');
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState('');
  const delta=Number(quantity)||0;
  const after=current+delta;
  const submit=async()=>{
    if(!delta){setError('Indiquez une quantité différente de zéro.');return}
    if(after<0){setError(`Le stock passerait à ${after} : une quantité ne peut pas être négative.`);return}
    setSaving(true);setError('');
    try{
      await api('/api/stock/adjust',{method:'POST',body:JSON.stringify({variantId:variant.id,quantity:delta,reason,note})});
      onDone();
    }catch(reason){setError((reason as Error).message)}
    finally{setSaving(false)}
  };
  return <Modal eyebrow="CORRECTION DE STOCK" title={String(variant.sku??'Déclinaison')}
    subtitle={`Stock actuel : ${current} unité${current!==1?'s':''}`}
    onClose={onClose}
    footer={<>
      <button type="button" onClick={onClose}>Annuler</button>
      <button type="button" className="primary" onClick={()=>void submit()} disabled={saving||!delta}>
        {saving?'Enregistrement…':`Passer à ${after} u.`}</button>
    </>}>
    <div className="form-help"><CircleAlert/><span>La correction s’inscrit au journal des mouvements avec son motif : elle reste explicable plus tard.</span></div>
    <div className="form-grid">
      <label>Quantité <small>(négative pour retirer)</small>
        <input type="number" autoFocus value={quantity} onChange={event=>setQuantity(event.target.value)} placeholder="ex. 5 ou -2"/></label>
      <label>Motif<select value={reason} onChange={event=>setReason(event.target.value)}>
        <option value="inventaire">Inventaire</option>
        <option value="casse">Casse ou perte</option>
        <option value="correction">Correction de saisie</option>
        <option value="retour_fournisseur">Retour fournisseur</option>
        <option value="offert">Offert / échantillon</option>
      </select></label>
      <label className="field-wide">Note<input value={note} onChange={event=>setNote(event.target.value)} placeholder="Précision utile au prochain inventaire"/></label>
    </div>
    {error&&<div className="error">{error}</div>}
  </Modal>;
}
