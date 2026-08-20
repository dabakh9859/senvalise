import {useCallback,useEffect,useMemo,useState} from 'react';
import {Check,RefreshCw,Save,TriangleAlert} from 'lucide-react';
import {api,money} from './api';

// Livraison : frais par défaut, seuil de franco et grille des zones. Ces trois
// réglages vivaient dans trois écrans différents (réglages bruts et CRUD des
// zones) alors qu'ils se décident ensemble — une zone chère et un franco bas ne
// se règlent pas séparément.

type Zone={id:number;slug:string;name:string;area:string;fee:number;delay:string;active:boolean};
type Payload={zones:Zone[];fee:number;freeFrom:number};

export default function ShopDelivery(){
  const[data,setData]=useState<Payload|null>(null);
  const[zones,setZones]=useState<Zone[]>([]);
  const[fee,setFee]=useState(0);
  const[freeFrom,setFreeFrom]=useState(0);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState('');
  const[saved,setSaved]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const result=await api<Payload>('/api/boutique/delivery');
      setData(result);setZones(result.zones);setFee(result.fee);setFreeFrom(result.freeFrom);
    }catch(reason){setError((reason as Error).message)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  const dirty=useMemo(()=>{
    if(!data)return false;
    if(data.fee!==fee||data.freeFrom!==freeFrom)return true;
    return zones.some((zone,index)=>{
      const before=data.zones[index];
      return !before||before.fee!==zone.fee||before.delay!==zone.delay||before.active!==zone.active;
    });
  },[data,zones,fee,freeFrom]);

  const patch=(id:number,change:Partial<Zone>)=>setZones(current=>current.map(zone=>zone.id===id?{...zone,...change}:zone));

  const save=async()=>{
    setSaving(true);setError('');setSaved(false);
    try{
      const result=await api<Payload>('/api/boutique/delivery',{method:'PUT',body:JSON.stringify({
        fee,freeFrom,zones:zones.map(zone=>({id:zone.id,fee:zone.fee,delay:zone.delay,active:zone.active})),
      })});
      setData(result);setZones(result.zones);setFee(result.fee);setFreeFrom(result.freeFrom);
      setSaved(true);window.setTimeout(()=>setSaved(false),2500);
    }catch(reason){setError((reason as Error).message)}
    finally{setSaving(false)}
  };

  if(loading&&!data)return <div className="report-loading"><i/><span>Chargement de la livraison…</span></div>;
  if(!data)return <div className="report-error"><TriangleAlert/><h2>Réglages injoignables.</h2><p>{error}</p><button className="primary" onClick={()=>void load()}>Réessayer</button></div>;

  const areas=[...new Set(zones.map(zone=>zone.area||'Autres'))];
  const activeCount=zones.filter(zone=>zone.active).length;

  return <div className="shop-page">
    <div className="report-toolbar">
      <strong className="shop-title">Livraison</strong>
      <div className="report-actions">
        <button onClick={()=>void load()} disabled={loading||saving}><RefreshCw className={loading?'spin':''}/><span>Recharger</span></button>
        <button className="primary compact" onClick={()=>void save()} disabled={!dirty||saving}>
          {saved?<Check/>:<Save/>}<span>{saved?'Enregistré':saving?'Enregistrement…':'Enregistrer'}</span>
        </button>
      </div>
    </div>
    {error&&<div className="error">{error}</div>}

    <section className="panel shop-card">
      <h2>Règle générale</h2>
      <p className="shop-hint">Ce tarif s’applique quand une zone n’a pas de tarif propre. Au-delà du seuil, la livraison est offerte au client.</p>
      <div className="shop-fields">
        <label>Frais de livraison par défaut
          <input type="number" min={0} step={500} value={fee} onChange={event=>setFee(Math.max(0,Number(event.target.value)))}/>
          <small>{money(fee)}</small>
        </label>
        <label>Livraison offerte à partir de
          <input type="number" min={0} step={5000} value={freeFrom} onChange={event=>setFreeFrom(Math.max(0,Number(event.target.value)))}/>
          <small>{freeFrom?money(freeFrom):'jamais offerte'}</small>
        </label>
      </div>
    </section>

    <section className="panel shop-card">
      <h2>Zones desservies<em>{activeCount} active{activeCount>1?'s':''} sur {zones.length}</em></h2>
      <p className="shop-hint">Une zone désactivée disparaît du choix à la commande sur le site.</p>
      {areas.map(area=>
        <div key={area} className="zone-block">
          <h3>{area}</h3>
          <div className="report-table-wrap"><table className="report-table">
            <thead><tr><th>Zone</th><th className="num">Tarif</th><th>Délai annoncé</th><th>Proposée sur le site</th></tr></thead>
            <tbody>{zones.filter(zone=>(zone.area||'Autres')===area).map(zone=>
              <tr key={zone.id} className={zone.active?'':'is-off'}>
                <td><b>{zone.name}</b></td>
                <td className="num"><input className="cell-input num" type="number" min={0} step={500} value={zone.fee} onChange={event=>patch(zone.id,{fee:Math.max(0,Number(event.target.value))})}/></td>
                <td><input className="cell-input" value={zone.delay} placeholder="48 h" onChange={event=>patch(zone.id,{delay:event.target.value})}/></td>
                <td><label className="switch"><input type="checkbox" checked={zone.active} onChange={event=>patch(zone.id,{active:event.target.checked})}/><span/></label></td>
              </tr>)}</tbody>
          </table></div>
        </div>)}
    </section>
  </div>;
}
