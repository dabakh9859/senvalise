import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,Check,RefreshCw,Search,Star,TriangleAlert} from 'lucide-react';
import {api,money} from './api';

// Catalogue en ligne : décider ce que le site montre, dans quel ordre, et avec
// quelle accroche. Le module Produits gère la fiche (prix, déclinaisons, coût) ;
// ici on ne touche qu'à la mise en vitrine, ce qui évite d'exposer un écran de
// merchandising à des champs comptables.

type Row={id:number;name:string;slug:string;category:string;active:boolean;online:boolean;featured:boolean;
  position:number;tag:string;flag:string;blurb:string;image:string;variants:number;stock:number;price:number;images:number;sold:number};

export default function ShopCatalog(){
  const[rows,setRows]=useState<Row[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[query,setQuery]=useState('');
  const[view,setView]=useState('all');
  const[pending,setPending]=useState<number|null>(null);
  const[editing,setEditing]=useState<Row|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setRows(await api<Row[]>('/api/boutique/catalog'))}
    catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  const patch=async(row:Row,change:Partial<Row>)=>{
    setPending(row.id);setError('');
    try{
      await api(`/api/boutique/catalog/${row.id}`,{method:'PUT',body:JSON.stringify(change)});
      setRows(current=>current.map(item=>item.id===row.id?{...item,...change}:item));
    }catch(reason){setError((reason as Error).message)}
    finally{setPending(null)}
  };

  // L'ordre d'affichage se joue entre produits en ligne : déplacer une fiche
  // hors ligne n'aurait aucun effet visible sur le site.
  const onlineOrder=useMemo(()=>rows.filter(row=>row.online).sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name,'fr')),[rows]);
  const nudge=async(row:Row,direction:number)=>{
    const index=onlineOrder.findIndex(item=>item.id===row.id);
    const target=index+direction;
    if(index<0||target<0||target>=onlineOrder.length)return;
    const next=[...onlineOrder];
    next.splice(target,0,next.splice(index,1)[0]);
    setRows(current=>current.map(item=>{
      const rank=next.findIndex(entry=>entry.id===item.id);
      return rank<0?item:{...item,position:rank};
    }));
    setPending(row.id);
    try{await api('/api/boutique/catalog/reorder',{method:'POST',body:JSON.stringify({order:next.map(item=>item.id)})})}
    catch(reason){setError((reason as Error).message);void load()}
    finally{setPending(null)}
  };

  // Le tableau reprend l'ordre du serveur (en ligne d'abord, puis position) et
  // le recalcule localement : sans ça, un déplacement enregistré ne se voyait
  // qu'au rechargement, et la ligne semblait ne pas bouger.
  const shown=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return [...rows].sort((a,b)=>Number(b.online)-Number(a.online)||a.position-b.position||a.name.localeCompare(b.name,'fr')).filter(row=>{
      if(view==='online'&&!row.online)return false;
      if(view==='offline'&&row.online)return false;
      if(view==='empty'&&!(row.online&&row.stock<=0))return false;
      if(view==='featured'&&!row.featured)return false;
      return !needle||`${row.name} ${row.category} ${row.tag} ${row.flag}`.toLowerCase().includes(needle);
    });
  },[rows,query,view,]);

  const online=rows.filter(row=>row.online).length;
  const empty=rows.filter(row=>row.online&&row.stock<=0).length;
  const noImage=rows.filter(row=>row.online&&row.images===0).length;

  if(loading&&!rows.length)return <div className="report-loading"><i/><span>Chargement du catalogue…</span></div>;
  if(error&&!rows.length)return <div className="report-error"><TriangleAlert/><h2>Catalogue injoignable.</h2><p>{error}</p><button className="primary" onClick={()=>void load()}>Réessayer</button></div>;

  return <div className="shop-page">
    <div className="report-toolbar">
      <div className="report-presets">
        {[['all','Tout'],['online','En ligne'],['offline','Hors ligne'],['empty','Sans stock'],['featured','Mis en avant']].map(([id,label])=>
          <button key={id} className={view===id?'active':''} onClick={()=>setView(id)}>{label}</button>)}
      </div>
      <div className="search shop-search"><Search/><input placeholder="Produit, catégorie, accroche…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
      <div className="report-actions">
        <button onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?'spin':''}/><span>Actualiser</span></button>
      </div>
    </div>
    {error&&<div className="error">{error}</div>}

    <section className="report-facts">
      <div className="fact"><span>En vitrine</span><strong>{online}</strong><small>sur {rows.length} produits</small></div>
      <div className={`fact ${empty?'warn':''}`.trim()}><span>En ligne sans stock</span><strong>{empty}</strong><small>visibles mais non commandables</small></div>
      <div className={`fact ${noImage?'warn':''}`.trim()}><span>En ligne sans photo</span><strong>{noImage}</strong><small>la fiche s’affichera vide</small></div>
    </section>

    <div className="panel shop-card">
      {shown.length===0?<p className="report-empty">Aucun produit dans cette vue.</p>:
      <div className="report-table-wrap"><table className="report-table catalog-table">
        <thead><tr>
          <th/><th>Produit</th><th>Catégorie</th><th className="num">Stock</th><th className="num">Prix</th>
          <th className="num">Vendus 30 j</th><th>Accroche</th><th>En ligne</th><th>Vitrine</th><th>Ordre</th>
        </tr></thead>
        <tbody>{shown.map(row=>{
          const rank=onlineOrder.findIndex(item=>item.id===row.id);
          return <tr key={row.id} className={`${row.online?'':'is-off'} ${pending===row.id?'is-busy':''}`.trim()}>
            <td className="thumb">{row.image?<img src={row.image} alt="" loading="lazy"/>:<span className="thumb-empty">—</span>}</td>
            <td><b>{row.name}</b><small className="muted-line">{row.variants} déclinaison{row.variants>1?'s':''} · {row.images} photo{row.images>1?'s':''}</small></td>
            <td>{row.category}</td>
            <td className={`num ${row.online&&row.stock<=0?'due':''}`}>{row.stock}</td>
            <td className="num">{row.price?money(row.price):'—'}</td>
            <td className="num">{row.sold||'—'}</td>
            <td><button className="ghost compact" onClick={()=>setEditing(row)}>{row.tag||row.flag||row.blurb?<span className="tag-preview">{row.flag||row.tag||row.blurb}</span>:'Ajouter'}</button></td>
            <td><label className="switch"><input type="checkbox" checked={row.online} disabled={pending===row.id} onChange={event=>void patch(row,{online:event.target.checked})}/><span/></label></td>
            <td><button className={`star ${row.featured?'on':''}`} disabled={pending===row.id} title="Mettre en avant sur la page d’accueil" onClick={()=>void patch(row,{featured:!row.featured})}><Star/></button></td>
            <td className="order-cell">
              {row.online?<>
                <button disabled={rank<=0||pending===row.id} onClick={()=>void nudge(row,-1)} aria-label="Monter"><ArrowUp/></button>
                <span>{rank+1}</span>
                <button disabled={rank<0||rank>=onlineOrder.length-1||pending===row.id} onClick={()=>void nudge(row,1)} aria-label="Descendre"><ArrowDown/></button>
              </>:<span className="muted-line">—</span>}
            </td>
          </tr>;
        })}</tbody>
      </table></div>}
    </div>

    {editing&&<TagEditor row={editing} onClose={()=>setEditing(null)} onSave={async change=>{await patch(editing,change);setEditing(null)}}/>}
  </div>;
}

function TagEditor({row,onClose,onSave}:{row:Row;onClose:()=>void;onSave:(change:Partial<Row>)=>Promise<void>}){
  const[tag,setTag]=useState(row.tag);
  const[flag,setFlag]=useState(row.flag);
  const[blurb,setBlurb]=useState(row.blurb);
  return <div className="overlay" onMouseDown={onClose}>
    <form className="modal" onMouseDown={event=>event.stopPropagation()} onSubmit={event=>{event.preventDefault();void onSave({tag,flag,blurb})}}>
      <div className="modal-head"><div><small>MISE EN VITRINE</small><h2>{row.name}</h2></div></div>
      <div className="form-grid">
        <label>Étiquette<input value={tag} placeholder="Cabine, Soute…" onChange={event=>setTag(event.target.value)}/></label>
        <label>Bandeau<input value={flag} placeholder="Nouveau, Best-seller…" onChange={event=>setFlag(event.target.value)}/></label>
        <label className="wide">Accroche<textarea rows={3} value={blurb} placeholder="Une phrase affichée sous le nom du produit." onChange={event=>setBlurb(event.target.value)}/></label>
      </div>
      <p className="shop-hint">Un bandeau renseigné met aussi le produit en avant sur la page d’accueil du site.</p>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>Annuler</button>
        <button className="primary" type="submit"><Check/>Enregistrer</button>
      </div>
    </form>
  </div>;
}
