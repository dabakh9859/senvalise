import {FormEvent,KeyboardEvent,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownToLine,PackagePlus,ReceiptText,CheckCircle2,ChevronDown,Eye,FileText,ImageOff,Minus,Package,Percent,Plus,Printer,Search,ShoppingCart,Trash2,UserRound,X} from 'lucide-react';
import {api,Entity,money,openFile,printFile} from './api';
import Modal from './Modal';
import DenominationPad from './DenominationPad';
import type {CheckoutConfig} from './CheckoutSettings';

type ProductImage={url:string;alt?:string;primary?:boolean;position?:number};type Product={name:string;description?:string;images?:ProductImage[]};
type Variant=Entity&{sku:string;barcode?:string;color:string;size:string;stock:number;alertAt?:number;price:number;productId:number;active?:boolean;product?:Product};
// Clé du panier conservé localement. Elle porte un numéro de version : si la
// forme des lignes change, l'ancien panier est ignoré plutôt que mal relu.
const cartStorageKey='sv_pos_cart_v1';
type Customer=Entity&{name:string;phone?:string};type CartLine={variant:Variant;quantity:number;unitPrice:number;discount:number};
const imageFor=(variant:Variant)=>{const images=variant.product?.images??[];return(images.find(image=>image.primary)??[...images].sort((a,b)=>Number(a.position??0)-Number(b.position??0))[0])?.url};

type Sold={id:number;reference:string;total:number;paid:number};
type PosProps={onOpenInvoice?:(id:number)=>void};

export default function POS({onOpenInvoice}:PosProps){
  const[items,setItems]=useState<Variant[]>([]);const[known,setKnown]=useState<Variant[]>([]);const[customers,setCustomers]=useState<Customer[]>([]);const[config,setConfig]=useState<CheckoutConfig|null>(null);const[cart,setCart]=useState<CartLine[]>([]);const[query,setQuery]=useState('');const[scanNote,setScanNote]=useState<{text:string;ok:boolean}|null>(null);const[payments,setPayments]=useState<{method:string;amount:string}[]>([]);const[touched,setTouched]=useState(false);const[customerId,setCustomerId]=useState('');const[customerSearch,setCustomerSearch]=useState('');const[customerOpen,setCustomerOpen]=useState(false);const[customerModal,setCustomerModal]=useState(false);const[preview,setPreview]=useState<Variant|null>(null);const[applyTax,setApplyTax]=useState(false);const[globalDiscount,setGlobalDiscount]=useState(0);const[message,setMessage]=useState('');
  // Vente qui vient d'etre encaissee. Le message de reussite ne suffisait pas :
  // la facture existait, mais rien n'y menait, et il fallait quitter la caisse
  // pour l'imprimer au client qui attend au comptoir.
  const[sold,setSold]=useState<Sold|null>(null);
  const[printing,setPrinting]=useState('');
  useEffect(()=>{Promise.all([api<Variant[]>('/api/variants'),api<Customer[]>('/api/customers'),api<CheckoutConfig>('/api/checkout-settings')]).then(([variants,customerRows,settings])=>{setItems(variants.filter(row=>row.active!==false&&row.stock>0));setKnown(variants.filter(row=>row.active!==false));setCustomers(customerRows);setConfig(settings);setApplyTax(settings.taxEnabledByDefault);setPayments([{method:settings.paymentMethods.find(item=>item.active)?.id??'',amount:''}])}).catch(error=>setMessage((error as Error).message))},[]);
  const add=(variant:Variant)=>setCart(current=>{const found=current.find(line=>line.variant.id===variant.id);return found?current.map(line=>line.variant.id===variant.id?{...line,quantity:Math.min(variant.stock,line.quantity+1)}:line):[...current,{variant,quantity:1,unitPrice:variant.price,discount:0}]});
  // Le panier survit à la fermeture de l'onglet.
  //
  // Rien n'était conservé : un navigateur qui plante, un onglet fermé par
  // erreur, un téléphone qui se verrouille, et toute la vente était à
  // ressaisir devant la cliente. Le panier est donc écrit localement à chaque
  // changement, et repris au retour.
  //
  // Il n'est gardé qu'une journée : reprendre un panier de la veille ferait
  // vendre au prix d'hier une marchandise peut-être déjà partie. Les
  // déclinaisons sont d'ailleurs revérifiées contre le catalogue au
  // rechargement — un article supprimé entre-temps ne doit pas revenir.
  const cartRestored=useRef(false);
  useEffect(()=>{
    if(cartRestored.current||!known.length)return;
    cartRestored.current=true;
    try{
      const raw=localStorage.getItem(cartStorageKey);
      if(!raw)return;
      const saved=JSON.parse(raw) as{at:number;lines:{variantId:number;quantity:number;unitPrice:number;discount:number}[]};
      if(!saved?.lines?.length||Date.now()-saved.at>86400000){localStorage.removeItem(cartStorageKey);return}
      const lines=saved.lines.map(line=>{
        const variant=known.find(item=>item.id===line.variantId);
        if(!variant)return null;
        return {variant,quantity:Math.min(line.quantity,Number(variant.stock)||0),unitPrice:line.unitPrice,discount:line.discount};
      }).filter((line):line is CartLine=>Boolean(line&&line.quantity>0));
      if(lines.length){setCart(lines);setRestoredNote(lines.length)}
    }catch{localStorage.removeItem(cartStorageKey)}
  },[known]);
  useEffect(()=>{
    if(!cartRestored.current)return;
    try{
      if(!cart.length){localStorage.removeItem(cartStorageKey);return}
      localStorage.setItem(cartStorageKey,JSON.stringify({at:Date.now(),
        lines:cart.map(line=>({variantId:line.variant.id,quantity:line.quantity,unitPrice:line.unitPrice,discount:line.discount}))}));
    }catch{/* navigation privée, quota plein : la vente continue sans filet */}
  },[cart]);

  // Raccourcis du comptoir.
  //
  // Une vente se fait au clavier, une main sur la douchette : chaque
  // déplacement vers la souris coûte deux secondes devant une file d'attente.
  // Les touches choisies sont celles qui ne servent à rien d'autre dans un
  // navigateur, et elles ne se déclenchent jamais pendant une saisie — sauf
  // Échap, qui doit toujours pouvoir sortir d'un champ.
  useEffect(()=>{
    const onKey=(event:globalThis.KeyboardEvent)=>{
      const target=event.target as HTMLElement|null;
      const typing=Boolean(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.tagName==='SELECT'));
      if(event.key==='Escape'){
        if(typing){(target as HTMLInputElement).blur();return}
        setPreview(null);setCustomerOpen(false);
        return;
      }
      if(event.ctrlKey||event.altKey||event.metaKey)return;
      if(event.key==='F2'){event.preventDefault();searchBox.current?.focus();searchBox.current?.select();return}
      if(typing)return;
      if(event.key==='F4'){event.preventDefault();checkoutButton.current?.click();return}
      if(event.key==='F8'){event.preventDefault();setCart([]);setGlobalDiscount(0);return}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[]);

  const scan=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(event.key!=='Enter')return;
    event.preventDefault();
    const code=query.trim();
    if(!code)return;
    const key=code.toLowerCase();
    // Code-barres d'abord, puis SKU, puis l'unique résultat affiché.
    const hit=known.find(item=>String(item.barcode??'').toLowerCase()===key)
      ??known.find(item=>String(item.sku??'').toLowerCase()===key)
      ??(shown.length===1?shown[0]:undefined);
    if(!hit){setScanNote({text:`Aucun produit pour « ${code} »`,ok:false});return}
    if(Number(hit.stock)<=0){setScanNote({text:`${hit.product?.name??hit.sku} est en rupture de stock`,ok:false});return}
    const line=cart.find(row=>row.variant.id===hit.id);
    if(line&&line.quantity>=Number(hit.stock)){setScanNote({text:`Stock épuisé : ${hit.stock} déjà au panier`,ok:false});return}
    add(hit);
    setScanNote({text:`${hit.product?.name??hit.sku} ajouté au panier`,ok:true});
    setQuery('');
  };
  const update=(id:number,patch:Partial<CartLine>)=>setCart(current=>current.map(line=>line.variant.id===id?{...line,...patch}:line));
  const subtotal=cart.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);const lineDiscount=cart.reduce((sum,line)=>sum+Math.min(line.discount,line.unitPrice*line.quantity),0);const maxGlobal=Math.max(0,subtotal-lineDiscount);const appliedGlobal=Math.min(globalDiscount,maxGlobal);const netBeforeTax=Math.max(0,maxGlobal-appliedGlobal);const tax=applyTax&&config?Math.round(netBeforeTax*config.taxRate/100):0;const total=netBeforeTax+tax;
  // Règlement : une ligne par moyen de paiement.
  const activeMethods=useMemo(()=>config?.paymentMethods.filter(item=>item.active)??[],[config]);
  const methodLabel=(id:string)=>activeMethods.find(item=>item.id===id)?.label??id;
  const applied=payments.reduce((sum,line)=>sum+(Number(line.amount)||0),0);
  const remaining=Math.max(0,total-applied);
  // Le surplus n'a de sens qu'en espèces : c'est la monnaie rendue. Sur un
  // virement ou un paiement mobile, un trop-perçu est une erreur de saisie.
  const cashPaid=payments.filter(line=>line.method==='cash').reduce((sum,line)=>sum+(Number(line.amount)||0),0);
  const change=Math.max(0,applied-total);
  const overpaidWithoutCash=change>0&&change>cashPaid;
  // Tant que le vendeur n'a pas touché aux montants, la ligne unique suit le
  // total : le cas courant — un seul moyen, tout réglé — ne demande aucune
  // saisie.
  useEffect(()=>{if(!touched&&payments.length===1)setPayments(current=>current.length===1?[{...current[0],amount:total?String(total):''}]:current)},[total,touched,payments.length]);
  const[activeLine,setActiveLine]=useState(0);
  const searchBox=useRef<HTMLInputElement>(null);
  const[restoredNote,setRestoredNote]=useState(0);
  const[quick,setQuick]=useState(false);
  const checkoutButton=useRef<HTMLButtonElement>(null);
  const setLine=(index:number,patch:Partial<{method:string;amount:string}>)=>{setTouched(true);setPayments(current=>current.map((line,position)=>position===index?{...line,...patch}:line))};
  const addLine=()=>{setTouched(true);setPayments(current=>{
    const used=new Set(current.map(line=>line.method));
    const next=activeMethods.find(item=>!used.has(item.id))?.id??activeMethods[0]?.id??'';
    const rest=Math.max(0,total-current.reduce((sum,line)=>sum+(Number(line.amount)||0),0));
    return [...current,{method:next,amount:rest?String(rest):''}];
  })};
  const removeLine=(index:number)=>{setTouched(true);setPayments(current=>current.filter((_,position)=>position!==index))};

  const shown=useMemo(()=>items.filter(item=>`${item.product?.name??''} ${item.sku} ${item.barcode??''} ${item.color} ${item.size}`.toLowerCase().includes(query.toLowerCase())).slice(0,40),[items,query]);
  const filteredCustomers=useMemo(()=>{const selected=customers.find(customer=>String(customer.id)===customerId);const selectedLabel=selected?`${selected.name}${selected.phone?` · ${selected.phone}`:''}`:'';const value=(customerSearch===selectedLabel?'':customerSearch).toLowerCase().trim();return customers.filter(customer=>!value||`${customer.name} ${customer.phone??''}`.toLowerCase().includes(value)).slice(0,8)},[customers,customerId,customerSearch]);
  const selectCustomer=(customer?:Customer)=>{setCustomerId(customer?String(customer.id):'');setCustomerSearch(customer?`${customer.name}${customer.phone?` · ${customer.phone}`:''}`:'');setCustomerOpen(false)};
  const checkout=async()=>{
    if(!payments.length||!payments[0].method)return;
    if(overpaidWithoutCash){setMessage('Les règlements dépassent le total. Corrigez les montants — seules les espèces peuvent donner lieu à de la monnaie.');return}
    setMessage('');
    // La monnaie rendue ne s'inscrit pas sur la facture : on retire le surplus
    // des lignes en espèces avant l'envoi, sinon le serveur refuse un
    // règlement supérieur au total — et il a raison, la facture mentirait.
    const lines=payments.map(line=>({method:line.method,amount:Number(line.amount)||0})).filter(line=>line.amount>0);
    let excess=applied-total;
    for(let index=lines.length-1;index>=0&&excess>0;index--){
      if(lines[index].method!=='cash')continue;
      const cut=Math.min(excess,lines[index].amount);
      lines[index]={...lines[index],amount:lines[index].amount-cut};excess-=cut;
    }
    try{
    const sale=await api<Sold>('/api/sales/checkout',{method:'POST',body:JSON.stringify({customerId:customerId?Number(customerId):null,paymentMethod:payments[0].method,payments:lines.filter(line=>line.amount>0),discount:appliedGlobal,applyTax,taxRate:config?.taxRate??0,items:cart.map(line=>({variantId:line.variant.id,quantity:line.quantity,unitPrice:line.unitPrice,discount:line.discount}))})});
    // Le panier est vide des l'enregistrement : la fenetre qui suit porte sur
    // une vente conclue, et le comptoir peut enchainer sans la fermer.
    setCart([]);setRestoredNote(0);setGlobalDiscount(0);setTouched(false);setPayments(current=>[{method:current[0]?.method??'',amount:''}]);setSold(sale);
    // Le stock affiche doit suivre, sinon le vendeur revend une piece qui
    // vient de partir.
    api<Variant[]>('/api/variants').then(rows=>{setItems(rows.filter(row=>row.active!==false&&row.stock>0));setKnown(rows.filter(row=>row.active!==false))}).catch(()=>{});
  }catch(error){setMessage((error as Error).message)}};

  // Le reçu 80 mm : ce que la cliente emporte. La facture A4 reste à côté,
  // pour celles qui la demandent.
  const printReceipt=async()=>{
    if(!sold)return;
    setPrinting('receipt');setMessage('');
    try{await printFile(`/api/documents/invoice/${sold.id}/receipt`)}
    catch(reason){setMessage((reason as Error).message)}
    finally{setPrinting('')}
  };
  const printInvoice=async()=>{
    if(!sold)return;
    setPrinting('print');setMessage('');
    try{await printFile(`/api/documents/invoice/${sold.id}/pdf`)}
    catch(reason){setMessage((reason as Error).message)}
    finally{setPrinting('')}
  };
  const viewInvoice=async()=>{
    if(!sold)return;
    setPrinting('open');
    try{await openFile(`/api/documents/invoice/${sold.id}/pdf`)}
    catch(reason){setMessage((reason as Error).message)}
    finally{setPrinting('')}
  };
  return <><div className="pos pos-enhanced"><div className="pos-catalog"><div className="pos-tools"><div className="search"><Search/><input ref={searchBox} autoFocus placeholder="Modèle, SKU ou code-barres…  (F2)" value={query} onKeyDown={scan} onChange={event=>{setQuery(event.target.value);if(scanNote)setScanNote(null)}}/></div><span>{shown.length} modèle{shown.length!==1?'s':''} disponible{shown.length!==1?'s':''}</span><button type="button" className="pos-quick" onClick={()=>setQuick(true)}><PackagePlus/>Article hors catalogue</button><span className="pos-shortcuts" title="Raccourcis clavier"><kbd>F2</kbd> rechercher<kbd>F4</kbd> encaisser<kbd>F8</kbd> vider</span></div>{scanNote&&<div className={`pos-scan-note ${scanNote.ok?'success':'error'}`}>{scanNote.text}</div>}{restoredNote>0&&<div className="pos-scan-note success">Panier repris : {restoredNote} article{restoredNote>1?'s':''} retrouvé{restoredNote>1?'s':''} de votre dernière saisie. <button type="button" onClick={()=>{setCart([]);setRestoredNote(0)}}>Vider</button></div>}<div className="pos-product-grid">{shown.map(variant=>{const low=Boolean(variant.alertAt&&variant.stock<=variant.alertAt);const image=imageFor(variant);return <article key={variant.id} className="pos-product-card"><button className="pos-product-add" onClick={()=>add(variant)} aria-label={`Ajouter ${variant.product?.name??variant.sku} au panier`}><div className="pos-product-image">{image?<img src={image} alt={variant.product?.name??variant.sku}/>:<span><ImageOff/><small>Photo à ajouter</small></span>}<em className={low?'low':'ok'}>{low?'Stock faible':'Disponible'} · {variant.stock}</em></div><div className="pos-product-info"><strong>{variant.product?.name??variant.sku}</strong><small>{variant.color||'Sans couleur'} · {variant.size||'Taille unique'}</small><span><b>{money(variant.price)}</b><i>{variant.sku}</i></span></div></button><button className="product-preview-button" onClick={()=>setPreview(variant)} aria-label={`Aperçu de ${variant.product?.name??variant.sku}`}><Eye/>Aperçu</button></article>})}</div></div>
    <aside className="cart enhanced-cart"><header><div><small>VENTE EN COURS</small><h2>Panier <span>{cart.reduce((sum,line)=>sum+line.quantity,0)}</span></h2></div></header><div className="customer-select"><span><UserRound/>Client</span><div className={`customer-combobox ${customerOpen?'open':''}`} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setCustomerOpen(false)}}><Search/><input role="combobox" aria-label="Rechercher ou sélectionner un client" aria-expanded={customerOpen} aria-controls="customer-options" placeholder="Client comptoir ou rechercher…" value={customerSearch} onFocus={()=>setCustomerOpen(true)} onChange={event=>{setCustomerSearch(event.target.value);setCustomerId('');setCustomerOpen(true)}}/><button type="button" aria-label="Afficher les clients" onClick={()=>setCustomerOpen(value=>!value)}><ChevronDown/></button>{customerOpen&&<div className="customer-options" id="customer-options" role="listbox" onMouseDown={event=>event.preventDefault()}><button type="button" className={!customerId?'selected':''} onClick={()=>selectCustomer()}><span className="customer-option-avatar"><UserRound/></span><span><strong>Client comptoir</strong><small>Vente sans fiche client</small></span></button>{filteredCustomers.map(customer=><button type="button" role="option" aria-selected={String(customer.id)===customerId} className={String(customer.id)===customerId?'selected':''} key={customer.id} onClick={()=>selectCustomer(customer)}><span className="customer-option-avatar">{customer.name.slice(0,1).toUpperCase()}</span><span><strong>{customer.name}</strong><small>{customer.phone||'Téléphone non renseigné'}</small></span></button>)}{filteredCustomers.length===0&&<p>Aucun client trouvé.</p>}<button type="button" className="create-customer-inline" onClick={()=>{setCustomerOpen(false);setCustomerModal(true)}}><Plus/>Créer un nouveau client</button></div>}</div></div>
    <div className="cart-lines">{cart.length===0?<div className="empty-mini"><ShoppingCart/><p>Choisissez un modèle pour commencer</p></div>:cart.map(line=>{const maxDiscount=line.unitPrice*line.quantity;return <div className="cart-line-enhanced" key={line.variant.id}><div className="cart-line-photo">{imageFor(line.variant)?<img src={imageFor(line.variant)} alt=""/>:<ImageOff/>}</div><div className="cart-line-main"><div><strong>{line.variant.product?.name??line.variant.sku}</strong><button title="Retirer" onClick={()=>setCart(current=>current.filter(item=>item.variant.id!==line.variant.id))}><Trash2/></button></div><small>{line.variant.color} · {line.variant.size}</small><div className="line-controls"><div className="qty"><button onClick={()=>line.quantity===1?setCart(current=>current.filter(item=>item.variant.id!==line.variant.id)):update(line.variant.id,{quantity:line.quantity-1,discount:Math.min(line.discount,line.unitPrice*(line.quantity-1))})}><Minus/></button><span>{line.quantity}</span><button disabled={line.quantity>=line.variant.stock} onClick={()=>add(line.variant)}><Plus/></button></div><label>Prix unitaire<input type="number" min="0" value={line.unitPrice} onChange={event=>update(line.variant.id,{unitPrice:Math.max(0,Number(event.target.value)),discount:0})}/></label><label>Remise ligne<input type="number" min="0" max={maxDiscount} value={line.discount} onChange={event=>update(line.variant.id,{discount:Math.min(maxDiscount,Math.max(0,Number(event.target.value)))})}/></label></div><div className="line-total"><span>{line.discount>0?`${money(line.discount)} de remise`:line.variant.sku}</span><strong>{money(maxDiscount-line.discount)}</strong></div></div></div>})}</div>
    <div className="cart-bottom enhanced-cart-bottom"><div className="discount-tax-row"><label><Percent/>Remise totale<input type="number" min="0" max={maxGlobal} value={globalDiscount} onChange={event=>setGlobalDiscount(Math.min(maxGlobal,Math.max(0,Number(event.target.value))))}/></label><label className="tax-toggle"><input type="checkbox" checked={applyTax} onChange={event=>setApplyTax(event.target.checked)}/><span>TVA {config?.taxRate??0}%</span></label></div><div className="checkout-summary"><div><span>Sous-total</span><b>{money(subtotal)}</b></div>{lineDiscount+appliedGlobal>0&&<div className="discount"><span>Remises</span><b>− {money(lineDiscount+appliedGlobal)}</b></div>}{applyTax&&<div><span>TVA ({config?.taxRate??0}%)</span><b>+ {money(tax)}</b></div>}<div className="grand-total"><span>Total à payer</span><strong>{money(total)}</strong></div></div><div className="payment-split">
      <div className="payment-split-head"><span>Règlement</span>{payments.length<activeMethods.length&&<button type="button" onClick={addLine}><Plus/>Ajouter un moyen</button>}</div>
      {payments.map((line,index)=><div className={`payment-line${payments.length>1&&index===Math.min(activeLine,payments.length-1)?' is-active':''}`} key={index} onClick={()=>setActiveLine(index)}>
        <select value={line.method} onChange={event=>setLine(index,{method:event.target.value})} aria-label={`Moyen de paiement ${index+1}`}>
          {activeMethods.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}
        </select>
        <input type="number" min="0" value={line.amount} placeholder="0" aria-label={`Montant ${methodLabel(line.method)}`}
          onFocus={()=>setActiveLine(index)}
          onChange={event=>setLine(index,{amount:event.target.value})}/>
        {payments.length>1&&<button type="button" className="drop-line" onClick={()=>removeLine(index)} aria-label="Retirer ce moyen"><X/></button>}
      </div>)}
      {/* Pavé de coupures : on empile les billets comme on les compte. Deux
          fois 10 000, une fois 5 000, une fois 1 000 font 26 000, sans passer
          par le clavier pendant que la cliente attend. */}
      <DenominationPad
        label={`Ajouter au montant${payments.length>1?` · ${methodLabel(payments[Math.min(activeLine,payments.length-1)]?.method)}`:''}`}
        fromZero={!touched}
        value={payments[Math.min(activeLine,payments.length-1)]?.amount??''}
        onChange={amount=>setLine(Math.min(activeLine,payments.length-1),{amount})}/>
      {payments.length>1&&<div className="payment-recap"><span>Réglé</span><b>{money(applied)}</b></div>}
      {remaining>0&&<div className="payment-recap warn"><span>Reste à payer</span><b>{money(remaining)}</b></div>}
      {change>0&&!overpaidWithoutCash&&<div className="payment-recap change"><span>Monnaie à rendre</span><b>{money(change)}</b></div>}
      {overpaidWithoutCash&&<div className="payment-recap error-line"><span>Trop-perçu</span><b>{money(change)}</b></div>}
    </div>{message&&<div className={message.includes('succès')?'success':'error'}>{message}</div>}<button ref={checkoutButton} className="primary checkout" disabled={!cart.length||!payments[0]?.method||overpaidWithoutCash} onClick={()=>void checkout()}><ArrowDownToLine/>Encaisser {money(total)}</button></div></aside></div>{customerModal&&<CustomerCreateModal onClose={()=>setCustomerModal(false)} onCreated={customer=>{setCustomers(current=>[customer,...current]);selectCustomer(customer);setCustomerModal(false)}}/>}{quick&&<QuickProduct onClose={()=>setQuick(false)} onCreated={variant=>{setKnown(current=>[variant,...current]);setItems(current=>[variant,...current]);add(variant);setQuick(false)}}/>}{preview&&<ProductPreview variant={preview} onClose={()=>setPreview(null)} onAdd={()=>{add(preview);setPreview(null)}}/>}
    {sold&&<Modal eyebrow="VENTE ENREGISTRÉE" title={sold.reference}
      subtitle={`${money(sold.total)} · ${Number(sold.paid)>=Number(sold.total)?'soldée':`reste ${money(Number(sold.total)-Number(sold.paid))}`}`}
      onClose={()=>setSold(null)}
      footer={<>
        <button type="button" onClick={()=>setSold(null)}>Nouvelle vente</button>
        {onOpenInvoice&&<button type="button" onClick={()=>{const id=sold.id;setSold(null);onOpenInvoice(id)}}><FileText/>Ouvrir la facture</button>}
        <button type="button" onClick={()=>void printInvoice()} disabled={printing!==''}><Printer/>{printing==='print'?'Préparation…':'Facture A4'}</button>
        <button type="button" className="primary" onClick={()=>void printReceipt()} disabled={printing!==''} autoFocus><ReceiptText/>{printing==='receipt'?'Préparation…':'Imprimer le reçu'}</button>
      </>}>
      <div className="sale-done"><CheckCircle2/><div>
        <strong>La vente est enregistrée.</strong>
        <p>« Imprimer » ouvre directement la boîte d’impression du navigateur avec la facture.
           « Ouvrir la facture » affiche la pièce complète, où elle peut être modifiée,
           envoyée par WhatsApp ou convertie en bon de livraison.</p>
        <button type="button" className="link-button" onClick={()=>void viewInvoice()} disabled={printing!==''}>
          {printing==='open'?'Ouverture…':'Voir le PDF dans un onglet'}</button>
      </div></div>
    </Modal>}</>;
}

function ProductPreview({variant,onClose,onAdd}:{variant:Variant;onClose:()=>void;onAdd:()=>void}){
  const images=[...(variant.product?.images??[])].sort((a,b)=>Number(b.primary??false)-Number(a.primary??false)||Number(a.position??0)-Number(b.position??0));const[active,setActive]=useState(0);const low=Boolean(variant.alertAt&&variant.stock<=variant.alertAt);
  return <div className="overlay product-preview-overlay" onMouseDown={onClose}><section className="product-preview-modal" onMouseDown={event=>event.stopPropagation()}><button className="preview-close" onClick={onClose} aria-label="Fermer l’aperçu"><X/></button><div className="preview-gallery"><div className="preview-main-image">{images[active]?<img src={images[active].url} alt={images[active].alt??variant.product?.name??variant.sku}/>:<span><Package/><small>Aucune photo disponible</small></span>}<em className={low?'low':'ok'}>{low?'Stock faible':'Disponible'} · {variant.stock}</em></div>{images.length>1&&<div className="preview-thumbnails">{images.map((image,index)=><button className={index===active?'active':''} key={`${image.url}-${index}`} onClick={()=>setActive(index)}><img src={image.url} alt={image.alt??`Photo ${index+1}`}/></button>)}</div>}</div><div className="preview-product-details"><small>APERÇU DU PRODUIT</small><h2>{variant.product?.name??variant.sku}</h2><p>{variant.product?.description||'Consultez les informations de ce modèle avant de l’ajouter au panier.'}</p><div className="preview-price">{money(variant.price)}</div><dl><div><dt>Référence SKU</dt><dd>{variant.sku}</dd></div><div><dt>Couleur</dt><dd>{variant.color||'Non renseignée'}</dd></div><div><dt>Taille / modèle</dt><dd>{variant.size||'Taille unique'}</dd></div><div><dt>Stock disponible</dt><dd>{variant.stock} unité{variant.stock!==1?'s':''}</dd></div>{variant.barcode&&<div><dt>Code-barres</dt><dd>{variant.barcode}</dd></div>}</dl><button className="primary preview-add" onClick={onAdd}><ShoppingCart/>Ajouter au panier · {money(variant.price)}</button></div></section></div>;
}

function CustomerCreateModal({onClose,onCreated}:{onClose:()=>void;onCreated:(customer:Customer)=>void}){
  const[form,setForm]=useState({name:'',phone:'',email:'',address:''});const[error,setError]=useState('');const[saving,setSaving]=useState(false);
  const submit=async(event:FormEvent)=>{event.preventDefault();setSaving(true);setError('');try{onCreated(await api<Customer>('/api/customers',{method:'POST',body:JSON.stringify(form)}))}catch(reason){setError((reason as Error).message)}finally{setSaving(false)}};
  return <div className="overlay" onMouseDown={onClose}><form className="modal customer-create-modal" onSubmit={submit} onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><small>NOUVEAU CLIENT</small><h2>Créer une fiche client</h2><p>Le nouveau client sera automatiquement sélectionné dans le panier.</p></div><button type="button" className="icon" aria-label="Fermer" onClick={onClose}><X/></button></div><div className="form-grid"><label>Nom complet<input autoFocus required value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Ex. Aminata Fall"/></label><label>Téléphone<input required value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})} placeholder="+221 77 000 00 00"/></label><label>E-mail<input type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} placeholder="client@exemple.sn"/></label><label>Adresse<input value={form.address} onChange={event=>setForm({...form,address:event.target.value})} placeholder="Ville, quartier…"/></label></div>{error&&<div className="error">{error}</div>}<div className="modal-actions"><button type="button" onClick={onClose}>Annuler</button><button className="primary" disabled={saving}>{saving?'Création…':'Créer et sélectionner'}</button></div></form></div>;
}

// Vendre un article qui n'est pas encore au catalogue.
//
// Un sac reçu la veille, pas encore saisi : il fallait quitter la caisse,
// remplir une fiche complète, revenir — devant la cliente qui attend. Trois
// champs suffisent ici, et la fiche est créée pour de vrai : le stock, les
// retours et les rapports continuent de fonctionner, et la boutique se
// retrouve avec l'article au catalogue, à compléter plus tard.
function QuickProduct({onClose,onCreated}:{onClose:()=>void;onCreated:(variant:Variant)=>void}){
  const[name,setName]=useState('');
  const[price,setPrice]=useState('');
  const[quantity,setQuantity]=useState('1');
  const[error,setError]=useState('');
  const[saving,setSaving]=useState(false);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(!name.trim()){setError('Donnez un nom à l’article.');return}
    setSaving(true);setError('');
    try{
      const variant=await api<Variant>('/api/products/quick',{method:'POST',body:JSON.stringify({
        name:name.trim(),price:Number(price)||0,quantity:Math.max(1,Number(quantity)||1),
      })});
      onCreated(variant);
    }catch(problem){setError((problem as Error).message);setSaving(false)}
  };
  return <Modal eyebrow="CAISSE" title="Article hors catalogue"
    subtitle="La fiche est créée et l’article part au panier. Vous la compléterez plus tard."
    onClose={onClose}
    footer={<><button type="button" onClick={onClose}>Annuler</button>
      <button className="primary" form="quick-product" disabled={saving}>{saving?'Création…':'Créer et ajouter au panier'}</button></>}>
    <form id="quick-product" onSubmit={submit} className="cash-form">
      {error&&<div className="error">{error}</div>}
      <label>Nom de l’article
        <input autoFocus value={name} onChange={event=>setName(event.target.value)} placeholder="Sac de voyage 60 L"/>
      </label>
      <label className="cash-big-field">Prix de vente
        <input type="number" min="0" value={price} onChange={event=>setPrice(event.target.value)} placeholder="0"/>
      </label>
      <DenominationPad label="Ajouter au prix" fromZero={!price} value={price} onChange={setPrice}/>
      <label>Quantité en stock
        <input type="number" min="1" value={quantity} onChange={event=>setQuantity(event.target.value)}/>
        <small>Ce que vous avez réellement en rayon, pas seulement ce que vous vendez maintenant.</small>
      </label>
    </form>
  </Modal>;
}
