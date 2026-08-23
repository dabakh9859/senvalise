import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {Ban,ChevronDown,Download,FileCheck2,ImagePlus,Link2,Mail,MessageCircle,PackagePlus,Pencil,Plus,Printer,RotateCcw,Search,Trash2,Truck,UserRound,X} from 'lucide-react';
import {printDocument} from './print';
import {api,apiForm,Entity,money,openFile} from './api';

type Kind='invoice'|'quote'|'delivery';
type Payment=Entity&{method?:string;amount?:number;status?:string;reference?:string};
type Line=Entity&{quantity?:number;unitPrice?:number;discount?:number;total?:number;description?:string;variant?:Entity&{sku?:string;product?:Entity}};
type Doc=Entity&{reference?:string;status?:string;customerId?:number;subtotal?:number;discount?:number;taxRate?:number;tax?:number;total?:number;paid?:number;notes?:string;validUntil?:string;items?:Line[];payments?:Payment[];customer?:Entity;user?:Entity;quote?:Entity;deliveryNote?:Entity;convertedSale?:Entity;sale?:Entity;saleId?:number;convertedSaleId?:number;invoiceCompanyName?:string;invoiceTagline?:string;invoicePhone?:string;invoiceAddress?:string;invoiceThankYouTitle?:string;invoiceFooterNote?:string;clientSignatureUrl?:string;companySignatureUrl?:string};
type Variant=Entity&{sku?:string;color?:string;size?:string;price?:number;stock?:number;active?:boolean;product?:Entity};
type InvoiceDefaults={companyName:string;tagline:string;phone:string;address:string;thankYouTitle:string;footerNote:string;companySignatureUrl:string};
type Props={document:Entity;kind:Kind;isAdmin:boolean;onClose:()=>void;onDelete:()=>void;onUpdate:(values:Record<string,unknown>)=>Promise<void>;onUpdateLine:(line:Entity,values:Record<string,unknown>)=>Promise<void>;onAddLine:(values:Record<string,unknown>)=>Promise<void>;onDeleteLine:(line:Entity)=>Promise<void>;onAddPayment:(method:string,amount:number)=>Promise<void>;onCancelPayment:(payment:Entity)=>Promise<void>;onCancelAllPayments:()=>Promise<void>;onConvert?:()=>void;onGenerateDelivery?:()=>void;onOpenInvoice?:(row:Entity)=>void;onOpenQuote?:(row:Entity)=>void;onOpenDelivery?:(row:Entity)=>void};

const baseInvoiceDefaults:InvoiceDefaults={companyName:'SenValise',tagline:'Solutions de voyage',phone:'+221 77 888 53 74',address:'Dakar, Sénégal',thankYouTitle:'Merci pour votre confiance',footerNote:'Conservez ce document pour vos besoins de garantie ou de comptabilité.',companySignatureUrl:''};

const longDate=(value:unknown)=>value?new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(new Date(String(value))):'—';
const methodLabel=(value:unknown)=>({cash:'Espèces',wave:'Wave',orange_money:'Orange Money',card:'Carte bancaire',bank_transfer:'Virement',credit:'Crédit',mixte:'Paiement mixte',legacy:'Paiement antérieur'}[String(value)]??String(value??'—'));
const lineName=(line:{variant?:Entity&{sku?:string;product?:Entity};description?:string})=>String(line.variant?.product?.name??line.description??line.variant?.sku??'Article SenValise');

export default function InvoiceWorkspace(props:Props){
  const doc=props.document as Doc;
  const items=doc.items??[];const payments=doc.payments??[];const customer=(doc.customer??{}) as Entity;const user=(doc.user??{}) as Entity;
  const [editing,setEditing]=useState<string|null>(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const [customers,setCustomers]=useState<Entity[]>([]);const [variants,setVariants]=useState<Variant[]>([]);const [defaults,setDefaults]=useState<InvoiceDefaults>(baseInvoiceDefaults);const [form,setForm]=useState<Record<string,string>>({});
  // Envoi depuis le serveur : le document part avec son PDF en piece jointe.
  // L'ancien bouton ouvrait wa.me avec un simple texte — le client recevait un
  // message parlant d'une facture qu'il ne recevait pas.
  const [sendOpen,setSendOpen]=useState(false);const [sendChannel,setSendChannel]=useState('whatsapp');
  const [sendTo,setSendTo]=useState('');const [sendBody,setSendBody]=useState('');
  const [sendState,setSendState]=useState<{busy:boolean;note:string;error:string}>({busy:false,note:'',error:''});
  const remaining=Math.max(0,Number(doc.total??0)-Number(doc.paid??0));
  const invoiceStatus=remaining===0&&Number(doc.total)>0?'Payée':Number(doc.paid)>0?'Partiellement réglée':'À régler';
  const status=props.kind==='invoice'?invoiceStatus:props.kind==='quote'?({draft:'Brouillon',sent:'Envoyé',accepted:'Accepté',cancelled:'Annulé'}[String(doc.status)]??'Brouillon'):({ready:'Prêt à livrer',delivered:'Livré',cancelled:'Annulé'}[String(doc.status)]??'Prêt à livrer');
  const title=props.kind==='invoice'?'FACTURE':props.kind==='quote'?'DEVIS':'BON DE LIVRAISON';
  const pieceLabel=props.kind==='invoice'?'la facture':props.kind==='quote'?'le devis':'le bon de livraison';
  // Les mentions par document restent propres a la facture : devis et bons
  // de livraison affichent celles des reglages generaux.
  const brandingEditable=props.kind==='invoice';
  // Memes verrous que l'API, pour ne pas proposer un bouton qui sera refuse.
  const locked=String(doc.status)==='cancelled'||(props.kind==='quote'&&Boolean(doc.convertedSaleId))||(props.kind==='delivery'&&String(doc.status)==='delivered');
  const linkedInvoice=(doc.convertedSale??doc.sale) as Entity|undefined;
  // Memoise pour que l'effet de remise a zero du formulaire puisse declarer
  // ses dependances honnetement : invoiceInfo ne change que si le document ou
  // les reglages changent, ce qui etait deja la condition de declenchement.
  const invoiceInfo=useMemo(()=>({companyName:doc.invoiceCompanyName||defaults.companyName,tagline:doc.invoiceTagline||defaults.tagline,phone:doc.invoicePhone||defaults.phone,address:doc.invoiceAddress||defaults.address,thankYouTitle:doc.invoiceThankYouTitle||defaults.thankYouTitle,footerNote:doc.invoiceFooterNote||String(doc.notes??defaults.footerNote),companySignatureUrl:String(doc.companySignatureUrl??'')}),[doc,defaults]);
  const editLine=editing?.startsWith('item:')?items.find(row=>String(row.id)===editing.slice(5)):undefined;
  useEffect(()=>{Promise.all([api<Entity[]>('/api/customers?limit=500'),api<Variant[]>('/api/variants?limit=500'),api<{invoiceDefaults:InvoiceDefaults}>('/api/checkout-settings')]).then(([customerRows,variantRows,settings])=>{setCustomers(customerRows);setVariants(variantRows.filter(row=>row.active!==false));setDefaults({...baseInvoiceDefaults,...settings.invoiceDefaults})}).catch(()=>{})},[]);
  useEffect(()=>setForm({reference:String(doc.reference??''),customerId:String(doc.customerId??''),status:String(doc.status??''),subtotal:String(doc.subtotal??0),discount:String(doc.discount??0),taxRate:String(doc.taxRate??0),tax:String(doc.tax??0),total:String(doc.total??0),notes:String(doc.notes??''),validUntil:doc.validUntil?.slice(0,16)??'',paymentMethod:'cash',paymentAmount:String(remaining),invoiceCompanyName:invoiceInfo.companyName,invoiceTagline:invoiceInfo.tagline,invoicePhone:invoiceInfo.phone,invoiceAddress:invoiceInfo.address,invoiceThankYouTitle:invoiceInfo.thankYouTitle,invoiceFooterNote:invoiceInfo.footerNote,addVariantId:'',addQuantity:'1',addUnitPrice:'0',addDiscount:'0'}),[doc,defaults,invoiceInfo,remaining]);
  // Les champs de la ligne ne se rechargent qu'au changement de ligne. Une
  // dependance sur editLine seul les reecrirait a chaque rafraichissement de
  // la facture, en ecrasant une saisie en cours ; le garde par identifiant
  // conserve le comportement voulu tout en declarant la vraie dependance.
  const loadedLine=useRef('');
  useEffect(()=>{if(!editLine){loadedLine.current='';return}const key=String(editLine.id);if(loadedLine.current===key)return;loadedLine.current=key;setForm(current=>({...current,lineQuantity:String(editLine.quantity??1),lineUnitPrice:String(editLine.unitPrice??0),lineDiscount:String(editLine.discount??0)}))},[editLine]);
  const openEdit=(section:string)=>{if(!props.isAdmin)return;if(!brandingEditable&&(section==='branding'||section==='content'))return;setError('');setEditing(section)};
  const refreshError=(reason:unknown)=>setError((reason as Error).message);
  const submit=async(event:FormEvent)=>{event.preventDefault();setSaving(true);setError('');try{
    if(editLine){await props.onUpdateLine(editLine,{quantity:Number(form.lineQuantity),unitPrice:Number(form.lineUnitPrice),discount:Number(form.lineDiscount)});setEditing(null);return}
    if(editing==='add-item'){await props.onAddLine({variantId:Number(form.addVariantId),quantity:Number(form.addQuantity),unitPrice:Number(form.addUnitPrice),discount:Number(form.addDiscount)});setEditing(null);return}
    if(editing==='payment'){await props.onAddPayment(form.paymentMethod,Number(form.paymentAmount));setEditing(null);return}
    if(editing==='general')await props.onUpdate({reference:form.reference,...(props.kind==='invoice'?{}:{status:form.status})});
    if(editing==='client')await props.onUpdate({customerId:form.customerId?Number(form.customerId):null});
    if(editing==='amounts')await props.onUpdate({subtotal:Number(form.subtotal),discount:Number(form.discount),taxRate:Number(form.taxRate),tax:Number(form.tax),total:Number(form.total)});
    if(editing==='details')await props.onUpdate({notes:form.notes,validUntil:form.validUntil?new Date(form.validUntil).toISOString():null});
    if(editing==='branding')await props.onUpdate({invoiceCompanyName:form.invoiceCompanyName,invoiceTagline:form.invoiceTagline,invoicePhone:form.invoicePhone,invoiceAddress:form.invoiceAddress});
    if(editing==='content')await props.onUpdate({invoiceThankYouTitle:form.invoiceThankYouTitle,invoiceFooterNote:form.invoiceFooterNote});
    setEditing(null);
  }catch(reason){refreshError(reason)}finally{setSaving(false)}};
  const cancelPayment=async(payment:Payment)=>{if(!confirm(`Annuler le règlement ${payment.reference??'#'+payment.id} de ${money(payment.amount)} ?`))return;setSaving(true);try{await props.onCancelPayment(payment)}catch(reason){refreshError(reason)}finally{setSaving(false)}};
  const cancelAll=async()=>{if(!confirm('Annuler tous les règlements actifs de cette facture ?'))return;setSaving(true);try{await props.onCancelAllPayments()}catch(reason){refreshError(reason)}finally{setSaving(false)}};
  const deleteLine=async(line:Line)=>{if(!confirm(`Retirer « ${lineName(line)} » de ${pieceLabel} ?`))return;setSaving(true);setError('');try{await props.onDeleteLine(line);setEditing(null)}catch(reason){refreshError(reason)}finally{setSaving(false)}};
  // L'image vit dans les mentions de facture, partagée par toutes les pièces ;
  // la case, elle, n'engage que celle-ci.
  const storedSignature=defaults.companySignatureUrl;
  const signed=Boolean(doc.companySignatureUrl);
  const toggleSignature=async(value:boolean)=>{setSaving(true);setError('');
    try{await props.onUpdate({companySignatureUrl:value?storedSignature:''})}
    catch(reason){refreshError(reason)}finally{setSaving(false)}};
  const replaceSignature=async(file:File)=>{setSaving(true);setError('');
    try{
      const body=new FormData();body.append('image',file);
      const asset=await apiForm<{url:string}>('/api/invoice-assets',body);
      const settings=await api<{invoiceDefaults:InvoiceDefaults}>('/api/checkout-settings');
      await api('/api/checkout-settings',{method:'PUT',body:JSON.stringify({...settings,invoiceDefaults:{...settings.invoiceDefaults,companySignatureUrl:asset.url}})});
      setDefaults(current=>({...current,companySignatureUrl:asset.url}));
      // Une pièce déjà signée suit la nouvelle image : garder l'ancienne
      // reviendrait à signer d'une main qui n'est plus la bonne.
      if(signed)await props.onUpdate({companySignatureUrl:asset.url});
    }catch(reason){refreshError(reason)}finally{setSaving(false)}};
  const paperTitle=`${({invoice:'Facture',quote:'Devis',delivery:'Bon-livraison'} as const)[props.kind]}-${String(doc.reference)}`;
  const paperFooter=`${title} ${String(doc.reference)} · ${invoiceInfo.companyName} · ${invoiceInfo.address} · ${invoiceInfo.phone}`;
  const print=()=>{void printDocument('business-document-print',paperTitle,paperFooter)};
  const download=print;
  const email=()=>{const message=`Bonjour ${String(customer.name??'')}, voici votre ${title.toLowerCase()} ${doc.reference}.`;window.location.href=`mailto:${String(customer.email??'')}?subject=${encodeURIComponent(`${title} ${doc.reference}`)}&body=${encodeURIComponent(message)}`};
  const openSend=()=>{setSendTo(String(customer.phone??''));setSendBody('');setSendState({busy:false,note:'',error:''});setSendOpen(true)};
  // Le PDF vient du serveur et non de l'impression du navigateur : c'est le
  // meme fichier que celui recu par le client, donc ce qu'il faut relire en
  // cas de contestation.
  const openPdf=()=>{void openFile(`/api/documents/${props.kind}/${doc.id}/pdf`).catch(refreshError)};
  const sendDocument=async()=>{
    setSendState({busy:true,note:'',error:''});
    try{
      await api(`/api/documents/${props.kind}/${doc.id}/send`,{method:'POST',
        body:JSON.stringify({channel:sendChannel,to:sendTo,message:sendBody})});
      setSendState({busy:false,note:`${title.charAt(0)+title.slice(1).toLowerCase()} mis${props.kind==='delivery'?'':'e'} en file d'envoi.`,error:''});
    }catch(reason){setSendState({busy:false,note:'',error:(reason as Error).message})}
  };
  return <div className="overlay invoice-overlay" onMouseDown={props.onClose}>
    <section className={`invoice-dialog business-dialog ${editing?'with-editor':''}`} role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}>
      <div className="business-main">
        <header className="invoice-actions"><div><span className={`invoice-status ${props.kind==='invoice'&&remaining===0||doc.status==='accepted'||doc.status==='delivered'?'paid':props.kind==='invoice'&&Number(doc.paid)===0?'pending':'partial'}`}>{status}</span><small>{title} · {doc.reference}</small></div><div><button onClick={print}><Printer/>Imprimer</button><button onClick={download} title="Enregistrer en PDF — choisissez « Enregistrer au format PDF » comme destination"><Download/>PDF</button><button onClick={openPdf} title="Ouvrir le PDF généré par le serveur, identique à celui envoyé au client"><Download/>PDF serveur</button><button onClick={openSend}><MessageCircle/>Envoyer</button><button onClick={email}><Mail/>E-mail</button><button className="close-invoice" onClick={props.onClose} aria-label="Fermer"><X/></button></div></header>
        <div className="invoice-scroll"><article className="invoice-paper" id="business-document-print">
          <div className="invoice-brand-bar"><div className="invoice-logo-mark"><i/><i/></div><button className={`invoice-brand-details document-editable${brandingEditable?'':' is-static'}`} disabled={!brandingEditable} onClick={()=>openEdit('branding')}><strong>{invoiceInfo.companyName}</strong><small>{invoiceInfo.tagline}</small></button><button className={`invoice-brand-contact document-editable${brandingEditable?'':' is-static'}`} disabled={!brandingEditable} onClick={()=>openEdit('branding')}>{invoiceInfo.phone}<br/>{invoiceInfo.address}</button></div>
          <div className="invoice-title-row"><button className="document-editable" onClick={()=>openEdit('general')}><small>{title}</small><h2>{title}</h2></button><button className="document-editable align-right" onClick={()=>openEdit('general')}><strong>{doc.reference}</strong><span>Émis le {longDate(doc.createdAt)}</span></button></div>
          <div className="invoice-parties"><button className={`document-editable${brandingEditable?'':' is-static'}`} disabled={!brandingEditable} onClick={()=>openEdit('branding')}><small>ÉMETTEUR</small><strong>{invoiceInfo.companyName}</strong><span>{invoiceInfo.address}</span><span>{invoiceInfo.phone}</span></button><button className="document-editable" onClick={()=>openEdit('client')}><small>{props.kind==='delivery'?'DESTINATAIRE':'CLIENT'}</small><strong>{String(customer.name??'Client comptoir')}</strong><span>{String(customer.phone??customer.email??'')}</span><span>{String(customer.address??'')}</span></button><button className="document-editable" onClick={()=>openEdit(props.kind==='invoice'?'payment':'details')}><small>{props.kind==='invoice'?'RÈGLEMENT':props.kind==='quote'?'VALIDITÉ':'LIVRAISON'}</small><strong>{status}</strong>{props.kind==='invoice'&&<span>{remaining?`Reste : ${money(remaining)}`:'Solde réglé'}</span>}{props.kind==='quote'&&<span>{doc.validUntil?`Jusqu’au ${longDate(doc.validUntil)}`:'Sans échéance'}</span>}{props.kind==='delivery'&&<span>Facture : {String(linkedInvoice?.reference??doc.saleId??'—')}</span>}</button></div>
          <DocumentLinks doc={doc} kind={props.kind} linkedInvoice={linkedInvoice} onOpenInvoice={props.onOpenInvoice} onOpenQuote={props.onOpenQuote} onOpenDelivery={props.onOpenDelivery}/>
          <table className="invoice-table"><thead><tr><th>Description</th><th>Qté</th>{props.kind!=='delivery'&&<><th>Prix unitaire</th><th>Remise</th><th>Montant</th></>}</tr></thead><tbody>{items.map(item=><tr key={item.id} className={props.isAdmin?'document-line-clickable':''} onClick={()=>openEdit(`item:${item.id}`)}><td><strong>{lineName(item)}</strong><span>{String(item.variant?.sku??'')}</span></td><td>{item.quantity}</td>{props.kind!=='delivery'&&<><td>{money(item.unitPrice)}</td><td>{Number(item.discount)>0?`− ${money(item.discount)}`:'—'}</td><td><strong>{money(item.total)}</strong></td></>}</tr>)}</tbody></table>
          {props.isAdmin&&!locked&&<button className="invoice-add-product" onClick={()=>openEdit('add-item')}><PackagePlus/>Ajouter un produit à {pieceLabel}</button>}
          {props.kind!=='delivery'&&<div className="invoice-bottom"><button className="invoice-note document-editable" onClick={()=>openEdit(props.kind==='invoice'?'content':'details')}><strong>{invoiceInfo.thankYouTitle}</strong><p>{invoiceInfo.footerNote}</p></button><button className="document-totals document-editable" onClick={()=>openEdit('amounts')}><span>Sous-total <b>{money(doc.subtotal)}</b></span>{Number(doc.discount)>0&&<span>Remise <b>− {money(doc.discount)}</b></span>}{Number(doc.tax)>0&&<span>TVA <b>{money(doc.tax)}</b></span>}<strong>Total TTC <b>{money(doc.total)}</b></strong>{props.kind==='invoice'&&<><span>Montant payé <b>{money(doc.paid)}</b></span><span>Reste à payer <b>{money(remaining)}</b></span></>}</button></div>}
          <footer className="invoice-signatures"><div className="signature-slot"><span>Signature client</span><i/></div><button className="document-editable" onClick={()=>openEdit('signatures')}><span>Pour {invoiceInfo.companyName}</span>{invoiceInfo.companySignatureUrl?<img src={invoiceInfo.companySignatureUrl} alt="Signature entreprise"/>:<i/>}</button><small>Document généré le {longDate(new Date())} · Vendeur : {String(user.name??'SenValise')}</small></footer>
        </article></div>
        {props.isAdmin&&<footer className="invoice-manager-actions"><span>Cliquez sur le client, le règlement, les montants ou une ligne pour les modifier.</span><div>{props.onConvert&&<button className="primary" onClick={props.onConvert} disabled={Boolean(doc.convertedSaleId)}><FileCheck2/>{doc.convertedSaleId?'Déjà converti':'Créer la facture'}</button>}{props.onGenerateDelivery&&<button className="primary" onClick={props.onGenerateDelivery} disabled={Boolean(doc.deliveryNote)}><Truck/>{doc.deliveryNote?'Bon déjà généré':'Générer le bon'}</button>}<button onClick={()=>openEdit('general')}><Pencil/>Modifier</button><button className="invoice-delete" onClick={props.onDelete}>Supprimer</button></div></footer>}
      </div>
      {sendOpen&&<div className="send-document" role="dialog" aria-label="Envoyer le document">
        <header><strong>Envoyer {pieceLabel} {String(doc.reference)}</strong><button className="icon" onClick={()=>setSendOpen(false)} aria-label="Fermer"><X/></button></header>
        <div className="send-fields">
          <label>Canal<select value={sendChannel} onChange={event=>setSendChannel(event.target.value)}><option value="whatsapp">WhatsApp (PDF joint)</option><option value="sms">SMS (lien)</option></select></label>
          <label>Numéro<input value={sendTo} onChange={event=>setSendTo(event.target.value)} placeholder="77 123 45 67"/></label>
          <label className="field-wide">Message <small>(vide = texte par défaut)</small><textarea rows={3} value={sendBody} onChange={event=>setSendBody(event.target.value)} placeholder="Bonjour {{nom}}, voici votre document {{reference}}…"/></label>
        </div>
        {sendState.note&&<div className="success">{sendState.note}</div>}
        {sendState.error&&<div className="error">{sendState.error}</div>}
        <footer><span>{sendChannel==='sms'?'Le SMS transporte un lien signé : il n’accepte pas de pièce jointe.':'Le PDF est reconstruit à l’envoi, donc à jour des derniers règlements.'}</span>
          <button className="primary" onClick={()=>void sendDocument()} disabled={sendState.busy||!sendTo.trim()}>{sendState.busy?'Envoi…':'Envoyer'}</button></footer>
      </div>}
      {editing&&<EditDrawer title={editorTitle(editing,editLine)} editing={editing} kind={props.kind} form={form} setForm={setForm} customers={customers} variants={variants} usedVariantIds={items.map(item=>Number(item.variantId))} payments={payments} remaining={remaining} editLine={editLine} canDeleteLine={items.length>1&&!locked} onDeleteLine={deleteLine} storedSignature={storedSignature} signed={signed} isAdmin={props.isAdmin} saving={saving} error={error} onClose={()=>setEditing(null)} onSubmit={submit} onCancelPayment={cancelPayment} onCancelAll={cancelAll} onToggleSignature={toggleSignature} onReplaceSignature={replaceSignature}/>} 
    </section>
  </div>;
}

function DocumentLinks({doc,kind,linkedInvoice,onOpenInvoice,onOpenQuote,onOpenDelivery}:{doc:Doc;kind:Kind;linkedInvoice?:Entity;onOpenInvoice?:Props['onOpenInvoice'];onOpenQuote?:Props['onOpenQuote'];onOpenDelivery?:Props['onOpenDelivery']}){
  return <div className="document-links">{kind==='quote'&&linkedInvoice&&<button onClick={()=>onOpenInvoice?.(linkedInvoice)}><Link2/>Voir la facture liée · {String(linkedInvoice.reference)}</button>}{kind==='invoice'&&doc.quote&&<button onClick={()=>onOpenQuote?.(doc.quote!)}><Link2/>Voir le devis d’origine · {String(doc.quote.reference)}</button>}{kind==='invoice'&&doc.deliveryNote&&<button onClick={()=>onOpenDelivery?.(doc.deliveryNote!)}><Truck/>Voir le bon de livraison · {String(doc.deliveryNote.reference)}</button>}{kind==='delivery'&&linkedInvoice&&<button onClick={()=>onOpenInvoice?.(linkedInvoice)}><Link2/>Voir la facture liée · {String(linkedInvoice.reference)}</button>}</div>;
}

function editorTitle(editing:string,line?:Line){if(line)return'Ligne de produit';return{general:'Informations de la pièce',client:'Client',payment:'Règlements',amounts:'Montants et TVA',details:'Informations complémentaires',branding:'Coordonnées de la facture',content:'Message de la facture',signatures:'Signatures', 'add-item':'Ajouter un produit'}[editing]??'Modification'}

function EditDrawer({title,editing,kind,form,setForm,customers,variants,usedVariantIds,payments,remaining,editLine,canDeleteLine,onDeleteLine,storedSignature,signed,isAdmin,saving,error,onClose,onSubmit,onCancelPayment,onCancelAll,onToggleSignature,onReplaceSignature}:{title:string;editing:string;kind:Kind;form:Record<string,string>;setForm:(form:Record<string,string>)=>void;customers:Entity[];variants:Variant[];usedVariantIds:number[];payments:Payment[];remaining:number;editLine?:Line;canDeleteLine:boolean;onDeleteLine:(line:Line)=>void;storedSignature:string;signed:boolean;isAdmin:boolean;saving:boolean;error:string;onClose:()=>void;onSubmit:(event:FormEvent)=>void;onCancelPayment:(payment:Payment)=>void;onCancelAll:()=>void;onToggleSignature:(value:boolean)=>Promise<void>;onReplaceSignature:(file:File)=>Promise<void>}){
  const field=(name:string,value:string)=>setForm({...form,[name]:value});
  return <aside className="invoice-edit-drawer"><header><div><small>MODIFICATION</small><h2>{title}</h2><p>La pièce reste visible pendant la modification.</p></div><button className="icon" onClick={onClose}><X/></button></header>{error&&<div className="error">{error}</div>}<form onSubmit={onSubmit}>
    {editing==='general'&&<><label>Référence<input value={form.reference} onChange={event=>field('reference',event.target.value)}/></label>{kind!=='invoice'&&<label>Statut<select value={form.status} onChange={event=>field('status',event.target.value)}><option value="draft">Brouillon</option><option value="sent">Envoyé</option><option value="accepted">Accepté</option><option value="ready">Prêt à livrer</option><option value="delivered">Livré</option><option value="cancelled">Annulé</option></select></label>}</>}
    {editing==='client'&&<CustomerSearchSelect customers={customers} value={form.customerId} onChange={value=>field('customerId',value)}/>} 
    {editing==='branding'&&<><label>Nom de l’entreprise<input value={form.invoiceCompanyName} onChange={event=>field('invoiceCompanyName',event.target.value)}/></label><label>Slogan<input value={form.invoiceTagline} onChange={event=>field('invoiceTagline',event.target.value)}/></label><label>Téléphone<input value={form.invoicePhone} onChange={event=>field('invoicePhone',event.target.value)}/></label><label>Adresse<input value={form.invoiceAddress} onChange={event=>field('invoiceAddress',event.target.value)}/></label></>}
    {editing==='content'&&<><label>Titre du message<input value={form.invoiceThankYouTitle} onChange={event=>field('invoiceThankYouTitle',event.target.value)}/></label><label>Texte de la facture<textarea value={form.invoiceFooterNote} onChange={event=>field('invoiceFooterNote',event.target.value)}/></label></>}
    {editing==='amounts'&&<><NumberField label="Sous-total" value={form.subtotal} onChange={value=>field('subtotal',value)}/><NumberField label="Remise" value={form.discount} onChange={value=>field('discount',value)}/><NumberField label="Taux de TVA (%)" value={form.taxRate} onChange={value=>field('taxRate',value)} max={100}/><NumberField label="Montant TVA" value={form.tax} onChange={value=>field('tax',value)}/><NumberField label="Total TTC" value={form.total} onChange={value=>field('total',value)}/></>}
    {editing==='details'&&<><label>Note<textarea value={form.notes} onChange={event=>field('notes',event.target.value)}/></label>{kind==='quote'&&<label>Valable jusqu’au<input type="datetime-local" value={form.validUntil} onChange={event=>field('validUntil',event.target.value)}/></label>}</>}
    {editLine&&<><div className="line-editor-product"><strong>{lineName(editLine)}</strong><span>{String(editLine.variant?.sku??'')}</span></div><NumberField label="Quantité" value={form.lineQuantity} onChange={value=>field('lineQuantity',value)} min={1}/>{kind!=='delivery'&&<><NumberField label="Prix unitaire" value={form.lineUnitPrice} onChange={value=>field('lineUnitPrice',value)}/><NumberField label="Remise sur la ligne" value={form.lineDiscount} onChange={value=>field('lineDiscount',value)}/></>}</>}
    {editing==='add-item'&&<AddProductPanel kind={kind} variants={variants.filter(row=>!usedVariantIds.includes(row.id)&&(kind==='quote'||Number(row.stock)>0))} form={form} field={field}/>} 
    {editing==='signatures'&&<SignaturePanel stored={storedSignature} applied={signed} saving={saving} isAdmin={isAdmin} onToggle={onToggleSignature} onReplace={onReplaceSignature}/>} 
    {editing==='payment'&&<PaymentPanel payments={payments} remaining={remaining} form={form} field={field} saving={saving} onCancel={onCancelPayment} onCancelAll={onCancelAll}/>} 
    <div className="drawer-actions"><button type="button" onClick={onClose}>Fermer</button>{editLine&&canDeleteLine&&<button type="button" className="danger" disabled={saving} onClick={()=>onDeleteLine(editLine)}><Trash2/>Retirer la ligne</button>}{editing!=='signatures'&&(editing!=='payment'||remaining>0)&&<button className="primary" disabled={saving||editing==='add-item'&&!form.addVariantId}>{saving?'Enregistrement…':editing==='payment'?'Ajouter le règlement':editing==='add-item'?`Ajouter à ${kind==='invoice'?'la facture':kind==='quote'?'le devis':'le bon de livraison'}`:'Enregistrer'}</button>}</div>
  </form></aside>;
}

function CustomerSearchSelect({customers,value,onChange}:{customers:Entity[];value:string;onChange:(value:string)=>void}){
  const selected=customers.find(customer=>String(customer.id)===value);
  const selectedLabel=selected?String(selected.name??selected.phone??selected.email??`Client #${selected.id}`):value?'':'Client comptoir';
  const [query,setQuery]=useState(selectedLabel);const [open,setOpen]=useState(false);
  useEffect(()=>setQuery(selectedLabel),[value,selectedLabel]);
  const normalized=(input:unknown)=>String(input??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const filtered=useMemo(()=>{
    const needle=normalized(query===selectedLabel?'':query).trim();
    return customers.filter(customer=>{
      if(!needle)return true;
      const searchable=Object.entries(customer)
        .filter(([key,item])=>!['id','createdAt','updatedAt','deletedAt'].includes(key)&&['string','number','boolean'].includes(typeof item))
        .map(([,item])=>item).join(' ');
      return normalized(searchable).includes(needle);
    }).slice(0,30);
  },[customers,query,selectedLabel]);
  const choose=(customer?:Entity)=>{onChange(customer?String(customer.id):'');setQuery(customer?String(customer.name??customer.phone??customer.email??`Client #${customer.id}`):'Client comptoir');setOpen(false)};
  return <div className="customer-select invoice-customer-search"><span>Client</span><div className={`customer-combobox ${open?'open':''}`} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false)}}>
    <Search/><input role="combobox" aria-label="Rechercher un client" aria-expanded={open} aria-controls="invoice-customer-options" placeholder="Nom, téléphone, e-mail, adresse…" value={query} onFocus={()=>{if(query===selectedLabel)setQuery('');setOpen(true)}} onChange={event=>{setQuery(event.target.value);setOpen(true)}}/>
    <button type="button" aria-label="Afficher les clients" onClick={()=>setOpen(current=>!current)}><ChevronDown/></button>
    {open&&<div className="customer-options" id="invoice-customer-options" role="listbox" onMouseDown={event=>event.preventDefault()}>
      <button type="button" className={!value?'selected':''} onClick={()=>choose()}><span className="customer-option-avatar"><UserRound/></span><span><strong>Client comptoir</strong><small>Facture sans fiche client</small></span></button>
      {filtered.map(customer=><button type="button" role="option" aria-selected={String(customer.id)===value} className={String(customer.id)===value?'selected':''} key={customer.id} onClick={()=>choose(customer)}><span className="customer-option-avatar">{String(customer.name??'?').slice(0,1).toUpperCase()}</span><span><strong>{String(customer.name??customer.phone??customer.email??`Client #${customer.id}`)}</strong><small>{[customer.phone,customer.email,customer.address,customer.zone].filter(Boolean).join(' · ')||'Aucune coordonnée renseignée'}</small></span></button>)}
      {filtered.length===0&&<p>Aucun client trouvé pour « {query} ».</p>}
    </div>}
  </div></div>;
}

function AddProductPanel({kind,variants,form,field}:{kind:Kind;variants:Variant[];form:Record<string,string>;field:(name:string,value:string)=>void}){
  const [query,setQuery]=useState('');
  const selected=variants.find(row=>String(row.id)===form.addVariantId);
  // Le prix propose ne se reapplique qu'au changement d'article choisi :
  // dependre de field, recree a chaque rendu du parent, ecraserait un prix
  // saisi a la main.
  const pricedVariant=useRef('');
  useEffect(()=>{if(!selected){pricedVariant.current='';return}const key=String(selected.id);if(pricedVariant.current===key)return;pricedVariant.current=key;field('addUnitPrice',String(selected.price??0))},[selected,field]);
  const normalized=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const filtered=variants.filter(row=>normalized(`${row.product?.name??''} ${row.sku??''} ${row.barcode??''} ${row.color??''} ${row.size??''}`).includes(normalized(query))).slice(0,20);
  const choose=(variant:Variant)=>{field('addVariantId',String(variant.id));setQuery('')};
  return <div className="invoice-product-picker"><label>Rechercher un produit<div className="product-picker-search"><Search/><input placeholder="Nom, SKU, code-barres, couleur…" value={query} onChange={event=>setQuery(event.target.value)}/></div></label>{selected&&<div className="selected-invoice-product"><strong>{lineName({variant:selected})}</strong><span>{selected.sku} · Stock disponible : {selected.stock}</span><button type="button" onClick={()=>field('addVariantId','')}>Changer</button></div>}{!selected&&<div className="invoice-product-options">{filtered.map(variant=><button type="button" key={variant.id} onClick={()=>choose(variant)}><span><strong>{lineName({variant})}</strong><small>{variant.sku} · {[variant.color,variant.size].filter(Boolean).join(' · ')}</small></span><span><b>{money(variant.price)}</b><small>{variant.stock} disponible{Number(variant.stock)>1?'s':''}</small></span></button>)}{filtered.length===0&&<p>Aucun produit disponible.</p>}</div>}{selected&&<><NumberField label="Quantité" value={form.addQuantity} onChange={value=>field('addQuantity',value)} min={1} max={kind==='quote'?undefined:Number(selected.stock)}/>{kind!=='delivery'&&<><NumberField label="Prix unitaire" value={form.addUnitPrice} onChange={value=>field('addUnitPrice',value)}/><NumberField label="Remise sur la ligne" value={form.addDiscount} onChange={value=>field('addDiscount',value)}/></>}</>}</div>;
}

// Signature de l'entreprise.
//
// Le panneau demandait deux images — client et entreprise — a televerser sur
// chaque piece. C'etait deux fois trop : la signature du client se pose au
// stylo sur le papier, et celle de l'entreprise ne change pas d'une facture a
// l'autre.
//
// L'image est donc enregistree une fois, avec les mentions de facture, et
// reste en base jusqu'a ce qu'on la remplace. Chaque piece porte simplement un
// interrupteur : signee ou non.
function SignaturePanel({stored,applied,saving,isAdmin,onToggle,onReplace}:{
  stored:string;applied:boolean;saving:boolean;isAdmin:boolean;
  onToggle:(value:boolean)=>void;onReplace:(file:File)=>Promise<void>;
}){
  return <div className="signature-editor">
    <section className="signature-uploader">
      <div><strong>Signature de l’entreprise</strong><small>Enregistrée une fois, réutilisée sur toutes les pièces</small></div>
      {stored
        ?<img src={stored} alt="Signature enregistrée"/>
        :<p className="signature-empty">Aucune signature enregistrée. Importez une image pour pouvoir signer vos documents.</p>}
      {isAdmin&&<label className={`signature-replace${saving?' is-busy':''}`}>
        <ImagePlus/>{stored?'Remplacer l’image':'Importer une signature'}
        <input type="file" accept="image/png,image/jpeg" disabled={saving}
          onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void onReplace(file)}}/>
      </label>}
    </section>
    <label className={`signature-toggle${stored?'':' is-disabled'}`}>
      <input type="checkbox" checked={applied} disabled={!stored||saving} onChange={event=>onToggle(event.target.checked)}/>
      <span><b>Apposer la signature sur ce document</b>
        <small>{stored?'Elle apparaîtra à l’impression, sur le PDF et sur l’envoi au client.':'Importez d’abord une image.'}</small></span>
    </label>
  </div>;
}

function NumberField({label,value,onChange,min=0,max}:{label:string;value:string;onChange:(value:string)=>void;min?:number;max?:number}){return <label>{label}<input type="number" min={min} max={max} value={value??''} onChange={event=>onChange(event.target.value)}/></label>}

function PaymentPanel({payments,remaining,form,field,saving,onCancel,onCancelAll}:{payments:Payment[];remaining:number;form:Record<string,string>;field:(name:string,value:string)=>void;saving:boolean;onCancel:(payment:Payment)=>void;onCancelAll:()=>void}){
  const active=payments.filter(row=>row.status!=='cancelled');return <><div className="payment-balance"><span>Reste à payer</span><strong>{money(remaining)}</strong></div>{remaining>0&&<div className="payment-add"><h3><Plus/>Ajouter un règlement</h3><label>Mode de paiement<select value={form.paymentMethod} onChange={event=>field('paymentMethod',event.target.value)}><option value="cash">Espèces</option><option value="wave">Wave</option><option value="orange_money">Orange Money</option><option value="card">Carte bancaire</option><option value="bank_transfer">Virement</option></select></label><NumberField label="Montant" value={form.paymentAmount} onChange={value=>field('paymentAmount',value)} min={1} max={remaining}/></div>}<div className="payment-history-head"><h3>Historique des règlements</h3>{active.length>1&&<button type="button" disabled={saving} onClick={onCancelAll}><Ban/>Tout annuler</button>}</div><div className="payment-history">{payments.length===0?<p>Aucun règlement enregistré.</p>:payments.map(row=><article key={row.id} className={row.status==='cancelled'?'cancelled':''}><div><strong>{money(row.amount)}</strong><span>{methodLabel(row.method)} · {row.reference}</span><small>{longDate(row.createdAt)}{row.status==='cancelled'?' · Annulé':''}</small></div>{row.status!=='cancelled'&&<button type="button" onClick={()=>onCancel(row)}><RotateCcw/>Annuler</button>}</article>)}</div></>;
}

