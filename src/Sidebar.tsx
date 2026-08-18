import {useState} from 'react';
import {
  BarChart3, Boxes, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign,
  FileText, Globe2, LayoutDashboard, LogOut, MessageSquare, Package, PanelLeftClose,
  PanelLeftOpen, RotateCcw, Settings, ShoppingBag, ShoppingCart, Tags, Truck, Users,
  WalletCards, Wrench, X,
} from 'lucide-react';

export type User={id:number;name:string;email:string;role:string};
export type NavItem={id:string;label:string;resource?:string;icon:typeof Package;manager?:boolean};
type NavGroup={id:string;label:string;icon:typeof Package;items:NavItem[]};

export const dashboardItem:NavItem={id:'dashboard',label:'Tableau de bord',icon:LayoutDashboard};
export const groups:NavGroup[]=[
  {id:'stock',label:'Stock',icon:Boxes,items:[
    {id:'products',label:'Produits',resource:'products',icon:Package},
    {id:'variants',label:'État du stock',resource:'variants',icon:Boxes},
    {id:'movements',label:'Mouvements',resource:'stock/movements',icon:RotateCcw},
    {id:'arrivals',label:'Arrivages',resource:'arrivals',icon:Truck,manager:true},
    {id:'suppliers',label:'Fournisseurs',resource:'suppliers',icon:Truck,manager:true},
  ]},
  {id:'sales-group',label:'Ventes',icon:ShoppingCart,items:[
    {id:'pos',label:'Nouvelle vente',icon:ShoppingBag},
    {id:'sales',label:'Historique',resource:'sales',icon:FileText},
    {id:'returns',label:'Retours',resource:'returns',icon:RotateCcw},
    {id:'customers',label:'Clients',resource:'customers',icon:Users},
    {id:'documents',label:'Documents',resource:'documents',icon:FileText},
  ]},
  {id:'finance',label:'Finances',icon:CircleDollarSign,items:[
    {id:'cash-sessions',label:'Sessions de caisse',resource:'cash-sessions',icon:WalletCards},
    {id:'vaults',label:'Coffres clients',resource:'vaults',icon:WalletCards,manager:true},
    {id:'reports',label:'Rapports',icon:BarChart3,manager:true},
  ]},
  {id:'shop',label:'Boutique',icon:Globe2,items:[
    {id:'orders',label:'Commandes',resource:'orders',icon:ShoppingCart,manager:true},
    {id:'home-blocks',label:'Page d’accueil',resource:'home-blocks',icon:Globe2,manager:true},
    {id:'contacts',label:'Messages reçus',resource:'contact-messages',icon:MessageSquare,manager:true},
  ]},
  {id:'tools',label:'Outils',icon:Wrench,items:[
    {id:'messages',label:'Messages',resource:'messages',icon:MessageSquare,manager:true},
    {id:'templates',label:'Modèles',resource:'message-templates',icon:MessageSquare,manager:true},
  ]},
  {id:'settings-group',label:'Paramètres',icon:Settings,items:[
    {id:'categories',label:'Catégories',resource:'categories',icon:Tags,manager:true},
    {id:'users',label:'Utilisateurs',resource:'users',icon:Users,manager:true},
    {id:'settings',label:'Livraison',resource:'delivery-zones',icon:Settings,manager:true},
  ]},
];

export const allNav=[dashboardItem,...groups.flatMap(group=>group.items)];

type Props={user:User;page:string;collapsed:boolean;mobile:boolean;onCollapse:()=>void;onCloseMobile:()=>void;onPage:(id:string)=>void;onLogout:()=>void};
export default function Sidebar({user,page,collapsed,mobile,onCollapse,onCloseMobile,onPage,onLogout}:Props){
  const activeGroup=groups.find(group=>group.items.some(item=>item.id===page))?.id;
  const[opened,setOpened]=useState<string[]>(activeGroup?[activeGroup]:[]);
  const toggle=(id:string)=>setOpened(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
  const visible=(item:NavItem)=>!item.manager||user.role==='manager';
  const navigate=(id:string)=>{onPage(id);onCloseMobile()};
  return <aside className={`sidebar ${collapsed?'collapsed':''} ${mobile?'mobile-open':''}`}>
    <div className="sidebar-top">
      <button className="brand-mini" onClick={()=>navigate('dashboard')} title="SenValise"><span>SV</span><strong>SenValise</strong></button>
      <button className="sidebar-collapse" onClick={onCollapse} title={collapsed?'Agrandir':'Réduire'}>{collapsed?<PanelLeftOpen/>:<PanelLeftClose/>}</button>
      <button className="mobile-close" onClick={onCloseMobile}><X/></button>
    </div>
    <nav className="sidebar-nav" aria-label="Navigation principale">
      <button className={`nav-direct ${page==='dashboard'?'active':''}`} onClick={()=>navigate('dashboard')} title="Tableau de bord"><LayoutDashboard/><span>Tableau de bord</span></button>
      {groups.map(group=>{
        const items=group.items.filter(visible);if(!items.length)return null;
        const expanded=opened.includes(group.id)&&!collapsed;
        const groupActive=items.some(item=>item.id===page);
        return <div className={`nav-group ${groupActive?'has-active':''}`} key={group.id}>
          <button className="nav-group-trigger" onClick={()=>collapsed?navigate(items[0].id):toggle(group.id)} title={group.label}>
            <group.icon/><span>{group.label}</span>{!collapsed&&(expanded?<ChevronDown className="chevron"/>:<ChevronRight className="chevron"/>)}
          </button>
          {expanded&&<div className="nav-children">{items.map(item=><button key={item.id} className={page===item.id?'active':''} onClick={()=>navigate(item.id)}><item.icon/><span>{item.label}</span></button>)}</div>}
        </div>;
      })}
    </nav>
    <div className="sidebar-profile">
      <span className="avatar">{user.name.slice(0,1).toUpperCase()}</span>
      <div><strong>{user.name}</strong><small>{user.role==='manager'?'Administrateur':'Vendeur'}</small></div>
      <button onClick={onLogout} title="Se déconnecter"><LogOut/></button>
    </div>
    {collapsed&&<button className="edge-expand" onClick={onCollapse} title="Agrandir la navigation"><ChevronRight/></button>}
  </aside>;
}
