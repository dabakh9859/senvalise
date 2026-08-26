import {useEffect,useRef,useState} from 'react';
import {ChevronDown,Menu,ShoppingBag,X} from 'lucide-react';
import {allNav,dashboardItem,groups,journalItem,NavGroup,NavItem,User,vendorHomeItem} from './Sidebar';

type Props={user:User;page:string;onPage:(id:string)=>void};

export default function TopNavigation({user,page,onPage}:Props){
  const[open,setOpen]=useState<string|null>(null);
  const[mobileOpen,setMobileOpen]=useState(false);
  const root=useRef<HTMLElement>(null);
  // Une entrée marquée manager n'apparaît que pour le gérant, une entrée
  // marquée vendor que pour le vendeur : chacun a son accueil.
  const visible=(item:NavItem)=>(!item.manager||user.role==='manager')&&(!item.vendor||user.role!=='manager');
  // Un groupe dont toutes les entrées sont réservées au gérant ne s'affiche
  // pas du tout : un menu vide donne l'impression d'un écran cassé.
  const filled=(group:NavGroup)=>group.items.some(visible);
  const primary=groups.filter(group=>['stock','sales-group','finance','shop'].includes(group.id)&&filled(group));
  const secondary=groups.filter(group=>['tools','settings-group'].includes(group.id)&&filled(group));
  const current=allNav.find(item=>item.id===page)??dashboardItem;

  useEffect(()=>{
    const close=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(null)};
    const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(null);setMobileOpen(false)}};
    document.addEventListener('mousedown',close);document.addEventListener('keydown',keyboard);
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',keyboard)};
  },[]);

  const navigate=(id:string)=>{onPage(id);setOpen(null);setMobileOpen(false)};
  const groupActive=(group:NavGroup)=>group.items.some(item=>item.id===page);
  const groupMenu=(group:NavGroup)=>group.items.filter(visible).map(item=><button key={item.id} className={page===item.id?'active':''} onClick={()=>navigate(item.id)}><span className="top-menu-icon"><item.icon/></span><span><strong>{item.label}</strong><small>{item.id==='pos'?'Créer et encaisser une vente':`Ouvrir ${item.label.toLowerCase()}`}</small></span></button>);

  return <header className="top-navigation" ref={root}>
    <div className="top-nav-context"><current.icon/><span>{current.label}</span></div>
    <nav className="top-nav-links" aria-label="Navigation principale">
      {visible(dashboardItem)&&<button className={`top-nav-direct ${page==='dashboard'?'active':''}`} onClick={()=>navigate('dashboard')}>Tableau de bord</button>}{visible(vendorHomeItem)&&<button className={`top-nav-direct ${page==='vendor-home'?'active':''}`} onClick={()=>navigate('vendor-home')}>{vendorHomeItem.label}</button>}
      {visible(journalItem)&&<button className={`top-nav-direct ${page==='journal'?'active':''}`} onClick={()=>navigate('journal')}>Ce qui s’est passé</button>}
      {primary.map(group=><div className="top-nav-dropdown" key={group.id}>
        <button className={`top-nav-trigger ${groupActive(group)?'active':''}`} onClick={()=>setOpen(open===group.id?null:group.id)} aria-expanded={open===group.id} aria-haspopup="menu">{group.label}<ChevronDown/></button>
        {open===group.id&&<div className="top-nav-menu" role="menu"><div className="top-menu-heading"><group.icon/><span>{group.label}</span></div>{groupMenu(group)}</div>}
      </div>)}
      {secondary.length>0&&<div className="top-nav-dropdown">
        <button className={`top-nav-trigger ${secondary.some(group=>groupActive(group))?'active':''}`} onClick={()=>setOpen(open==='more'?null:'more')} aria-expanded={open==='more'} aria-haspopup="menu">Plus<ChevronDown/></button>
        {open==='more'&&<div className="top-nav-menu top-nav-more" role="menu">{secondary.map(group=><section key={group.id}><div className="top-menu-heading"><group.icon/><span>{group.label}</span></div>{groupMenu(group)}</section>)}</div>}
      </div>}
    </nav>
    <div className="top-nav-actions">
      <button className="top-sale-button" onClick={()=>navigate('pos')}><ShoppingBag/>Nouvelle vente</button>
      <button className="mobile-top-toggle" onClick={()=>setMobileOpen(value=>!value)} aria-expanded={mobileOpen} aria-label="Ouvrir la navigation">{mobileOpen?<X/>:<Menu/>}</button>
    </div>
    {mobileOpen&&<div className="mobile-top-menu">
      {visible(dashboardItem)&&<button className={page==='dashboard'?'active':''} onClick={()=>navigate('dashboard')}><dashboardItem.icon/>Tableau de bord</button>}{visible(vendorHomeItem)&&<button className={page==='vendor-home'?'active':''} onClick={()=>navigate('vendor-home')}><vendorHomeItem.icon/>{vendorHomeItem.label}</button>}
      {visible(journalItem)&&<button className={page==='journal'?'active':''} onClick={()=>navigate('journal')}><journalItem.icon/>Ce qui s’est passé</button>}
      {groups.map(group=>{const items=group.items.filter(visible);return items.length?<section key={group.id}><h3><group.icon/>{group.label}</h3>{items.map(item=><button key={item.id} className={page===item.id?'active':''} onClick={()=>navigate(item.id)}><item.icon/>{item.label}</button>)}</section>:null})}
    </div>}
  </header>;
}
