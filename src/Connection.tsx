import {useEffect,useState} from 'react';
import {WifiOff} from 'lucide-react';

// Le bandeau de connexion perdue.
//
// Rien ne signalait la coupure : le vendeur cliquait, rien ne se passait, il
// recliquait. Le navigateur sait pourtant qu'il est hors ligne — autant le
// dire, et dire aussi ce qu'il ne faut pas faire.
//
// Le message insiste sur un point : le panier est conservé. C'est la première
// inquiétude quand l'écran se fige au milieu d'une vente, et c'est vrai depuis
// que le panier est écrit localement.
export default function Connection(){
  const[offline,setOffline]=useState(()=>typeof navigator!=='undefined'&&!navigator.onLine);
  useEffect(()=>{
    const goOffline=()=>setOffline(true);
    const goOnline=()=>setOffline(false);
    window.addEventListener('offline',goOffline);
    window.addEventListener('online',goOnline);
    return()=>{window.removeEventListener('offline',goOffline);window.removeEventListener('online',goOnline)};
  },[]);
  if(!offline)return null;
  return <div className="connection-lost" role="status">
    <WifiOff/>
    <span><b>Connexion perdue.</b> Votre panier est conservé — attendez le retour du réseau avant d’encaisser.</span>
  </div>;
}
