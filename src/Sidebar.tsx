import {
  BarChart3, BellRing, Moon, Sun, Boxes, CircleDollarSign, FileText, Globe2, LayoutDashboard, LogOut,
  Megaphone, MessageSquare, Package, Palette, Receipt, RotateCcw, Settings, ShoppingBag, ShoppingCart, Tags,
  Truck, Users, WalletCards, Wrench,
} from 'lucide-react';

import {useState} from 'react';
import {applyTheme,storedTheme,type Theme} from './theme';

export type User={id:number;name:string;email:string;role:string};
export type NavItem={id:string;label:string;resource?:string;icon:typeof Package;manager?:boolean};
export type NavGroup={id:string;label:string;icon:typeof Package;items:NavItem[]};

export const dashboardItem:NavItem={id:'dashboard',label:'Tableau de bord',icon:LayoutDashboard,manager:true};
export const groups:NavGroup[]=[
  {id:'stock',label:'Stock',icon:Boxes,items:[
    {id:'products',label:'Produits',resource:'products',icon:Package},
    {id:'movements',label:'Mouvements',resource:'stock/movements',icon:RotateCcw},
    {id:'arrivals',label:'Arrivages',resource:'arrivals',icon:Truck,manager:true},
    {id:'suppliers',label:'Fournisseurs',resource:'suppliers',icon:Truck,manager:true},
  ]},
  {id:'sales-group',label:'Ventes',icon:ShoppingCart,items:[
    {id:'pos',label:'Nouvelle vente',icon:ShoppingBag},
    {id:'sales',label:'Factures',resource:'sales',icon:FileText},
    {id:'quotes',label:'Devis',resource:'quotes',icon:FileText},
    {id:'delivery-notes',label:'Bons de livraison',resource:'delivery-notes',icon:Truck},
    {id:'returns',label:'Retours',resource:'returns',icon:RotateCcw},
    {id:'customers',label:'Clients',resource:'customers',icon:Users},
  ]},
  {id:'finance',label:'Finances',icon:CircleDollarSign,items:[
    {id:'cash-sessions',label:'Sessions de caisse',resource:'cash-sessions',icon:WalletCards},
    {id:'debts',label:'Créances et relances',icon:BellRing},
    {id:'expenses',label:'Dépenses quotidiennes',icon:Receipt},
    {id:'reports',label:'Rapports',icon:BarChart3,manager:true},
  ]},
  {id:'shop',label:'Boutique',icon:Globe2,items:[
    {id:'shop-overview',label:'Vue d’ensemble',icon:Globe2,manager:true},
    {id:'shop-orders',label:'Commandes',icon:ShoppingCart,manager:true},
    {id:'shop-catalog',label:'Catalogue en ligne',icon:Package,manager:true},
    {id:'home-blocks',label:'Page d’accueil',resource:'home-blocks',icon:Globe2,manager:true},
    {id:'shop-customers',label:'Clients du site',icon:Users,manager:true},
    {id:'vaults',label:'Coffres clients',icon:WalletCards,manager:true},
    {id:'shop-delivery',label:'Livraison',icon:Truck,manager:true},
    {id:'contacts',label:'Messages reçus',resource:'contact-messages',icon:MessageSquare,manager:true},
  ]},
  {id:'tools',label:'Outils',icon:Wrench,items:[
    {id:'campaigns',label:'Campagnes pub',icon:Megaphone},
    {id:'messages',label:'Messages envoyés',resource:'messages',icon:MessageSquare},
    {id:'templates',label:'Modèles',resource:'message-templates',icon:MessageSquare},
  ]},
  {id:'settings-group',label:'Paramètres',icon:Settings,items:[
    {id:'checkout-settings',label:'Caisse et TVA',icon:WalletCards},
    {id:'messaging',label:'WhatsApp et SMS',icon:MessageSquare},
    {id:'branding',label:'Logo et identité',icon:Palette},
    {id:'categories',label:'Catégories',resource:'categories',icon:Tags},
    {id:'users',label:'Utilisateurs',resource:'users',icon:Users,manager:true},
  ]},
];

export const allNav=[dashboardItem,...groups.flatMap(group=>group.items)];

type Props={user:User;onPage:(id:string)=>void;onLogout:()=>void;brand?:Brand};

// Marque servie par /api/public/branding : la barre affichait « SV » en dur,
// donc un logo televerse n'y apparaissait jamais.
export type Brand={siteName:string;tagline:string;logoUrl:string};
export default function Sidebar({user,onPage,onLogout,brand}:Props){
  const role=user.role==='manager'?'Administrateur':'Vendeur';
  return <aside className="sidebar compact-rail" aria-label="Accès rapide">
    <button className="rail-brand" onClick={()=>onPage(user.role==='manager'?'dashboard':'pos')} title={brand?.siteName??'SenValise'} aria-label="Revenir à l’accueil">{brand?.logoUrl?<img src={brand.logoUrl} alt=""/>:<span>{(brand?.siteName??'SenValise').slice(0,2).toUpperCase()}</span>}</button>
    <div className="rail-profile">
      <span className="avatar" title={`${user.name} — ${role}`}>{user.name.slice(0,1).toUpperCase()}</span>
      <ThemeToggle/>
      <button onClick={onLogout} title="Se déconnecter" aria-label="Se déconnecter"><LogOut/></button>
    </div>
  </aside>;
}

function ThemeToggle(){
  const[theme,setTheme]=useState<Theme>(storedTheme);
  const next=theme==='dark'?'light':'dark';
  const label=next==='dark'?'Passer en thème sombre':'Revenir au thème clair';
  return <button onClick={()=>{applyTheme(next);setTheme(next)}} title={label} aria-label={label}>{theme==='dark'?<Sun/>:<Moon/>}</button>;
}
