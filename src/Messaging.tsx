import {FormEvent,useCallback,useEffect,useRef,useState} from 'react';
import {FileText,LogOut,MessageCircle,Play,QrCode,RefreshCw,Save,Send,Smartphone,Square,TriangleAlert} from 'lucide-react';
import {api,openFile} from './api';

// Paramétrage des deux canaux sortants : WhatsApp via la passerelle WAHA, et
// SMS via l'API d'Orange Sénégal.
//
// L'appairage WhatsApp est la seule opération de cet écran qui demande un
// geste physique : le gérant scanne un code QR avec le téléphone de la
// boutique. Le code expire en une vingtaine de secondes, l'écran le redemande
// donc tant que la session n'est pas connectée — sans quoi le gérant scannerait
// une image morte et croirait à une panne.

type WhatsAppConfig={enabled:boolean;baseUrl:string;apiKey:string;session:string};
type SmsConfig={enabled:boolean;clientId:string;clientSecret:string;sender:string;senderName:string;tokenUrl:string;baseUrl:string};
type Config={
  publicUrl:string;whatsapp:WhatsAppConfig;sms:SmsConfig;
  throttle:{perMinute:number;minDelaySeconds:number};
  reminders:{enabled:boolean;channel:string;minAmount:number;afterDays:number;cooldownDays:number;body:string};
  stockAlert:{enabled:boolean;phone:string;channel:string;hour:number;onlyWhenNeeded:boolean};
  hasApiKey:boolean;hasClientSecret:boolean;placeholders:string[];
};
type Status={
  whatsapp:{enabled:boolean;status:string;session:string;phone?:string;error?:string};
  sms:{enabled:boolean;configured:boolean;sender:string};
  queue:{queued:number;failed24h:number};
};

// Vocabulaire de WAHA traduit une fois : le reste de l'écran raisonne sur ces
// libellés, pas sur les constantes anglaises.
const sessionLabels:Record<string,string>={
  WORKING:'Connecté',SCAN_QR_CODE:'En attente du scan',STARTING:'Démarrage…',
  STOPPED:'Arrêtée',FAILED:'En échec',DISABLED:'Désactivé',UNREACHABLE:'Passerelle injoignable',UNKNOWN:'État inconnu',
};

export default function Messaging(){
  const[config,setConfig]=useState<Config|null>(null);
  const[status,setStatus]=useState<Status|null>(null);
  const[qr,setQr]=useState('');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');
  const[saving,setSaving]=useState(false);
  const[busy,setBusy]=useState('');
  const[test,setTest]=useState({channel:'whatsapp',to:'',body:'Message d’essai SenValise.'});
  // Le montage est suivi pour ne pas poser d'état après démontage : la boucle
  // du QR survivrait sinon à la fermeture de l'écran.
  const alive=useRef(true);

  const loadStatus=useCallback(async()=>{
    try{setStatus(await api<Status>('/api/messaging/status'))}catch(reason){setError((reason as Error).message)}
  },[]);

  useEffect(()=>{
    alive.current=true;
    api<Config>('/api/messaging/config').then(setConfig).catch(reason=>setError((reason as Error).message));
    void loadStatus();
    const timer=setInterval(()=>{void loadStatus()},15000);
    return()=>{alive.current=false;clearInterval(timer)};
  },[loadStatus]);

  // Boucle d'appairage : tant que la session réclame un scan, on rafraîchit le
  // code toutes les vingt secondes.
  useEffect(()=>{
    if(status?.whatsapp.status!=='SCAN_QR_CODE'){setQr('');return}
    let stop=false;
    const pull=async()=>{
      try{const result=await api<{qr:string}>('/api/messaging/qr');if(!stop&&alive.current)setQr(result.qr)}
      catch{if(!stop)setQr('')}
    };
    void pull();
    const timer=setInterval(pull,20000);
    return()=>{stop=true;clearInterval(timer)};
  },[status?.whatsapp.status]);

  const[stockBusy,setStockBusy]=useState(false);
  const[stockNote,setStockNote]=useState('');
  // L'envoi immédiat part même si rien ne manque : c'est le seul moyen de
  // vérifier que le numéro est le bon avant d'attendre la première rupture.
  const sendStockAlert=async()=>{
    setStockBusy(true);setStockNote('');
    try{const result=await api<{note:string}>('/api/stock-alert/send',{method:'POST'});setStockNote(result.note)}
    catch(problem){setStockNote((problem as Error).message)}
    finally{setStockBusy(false)}
  };
  const patch=(change:Partial<Config>)=>setConfig(current=>current?{...current,...change}:current);
  const patchWhatsApp=(change:Partial<WhatsAppConfig>)=>setConfig(current=>current?{...current,whatsapp:{...current.whatsapp,...change}}:current);
  const patchSms=(change:Partial<SmsConfig>)=>setConfig(current=>current?{...current,sms:{...current.sms,...change}}:current);

  const save=async(event:FormEvent)=>{
    event.preventDefault();if(!config)return;
    setSaving(true);setError('');setMessage('');
    try{
      const saved=await api<Config>('/api/messaging/config',{method:'PUT',body:JSON.stringify(config)});
      setConfig(saved);setMessage('Configuration enregistrée.');void loadStatus();
    }catch(reason){setError((reason as Error).message)}
    finally{setSaving(false)}
  };

  const session=async(action:'start'|'stop'|'logout')=>{
    setBusy(action);setError('');setMessage('');
    try{
      setStatus(await api<Status>(`/api/messaging/session/${action}`,{method:'POST'}));
      if(action==='logout')setQr('');
    }catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  const sendTest=async()=>{
    setBusy('test');setError('');setMessage('');
    try{await api('/api/messaging/test',{method:'POST',body:JSON.stringify(test)});setMessage('Message d’essai envoyé.')}
    catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  if(!config)return <div className="loading"><i/><span>Chargement de la messagerie…</span></div>;
  const waStatus=status?.whatsapp.status??'UNKNOWN';
  const connected=waStatus==='WORKING';

  return <form className="messaging-page panel" onSubmit={save}>
    <header>
      <div><h2>Messagerie WhatsApp et SMS</h2><p>Envoi des devis, factures et bons de livraison, relances d’impayés et campagnes.</p></div>
      <button className="primary compact" disabled={saving}><Save/>{saving?'Enregistrement…':'Enregistrer'}</button>
    </header>
    {message&&<div className="success">{message}</div>}
    {error&&<div className="error">{error}</div>}

    <section className="settings-section">
      <div><h3>État des canaux</h3><p>La file d’envoi est traitée en arrière-plan, à débit plafonné.</p></div>
      <div className="messaging-status">
        <div className={`channel-card ${connected?'ok':waStatus==='UNREACHABLE'||waStatus==='FAILED'?'ko':''}`}>
          <MessageCircle/>
          <strong>WhatsApp</strong>
          <span>{sessionLabels[waStatus]??waStatus}</span>
          {status?.whatsapp.phone&&<small>+{status.whatsapp.phone}</small>}
          {status?.whatsapp.error&&<small className="channel-error">{status.whatsapp.error}</small>}
          <div className="channel-actions">
            <button type="button" onClick={()=>void session('start')} disabled={busy==='start'||!config.whatsapp.enabled}><Play/>Démarrer</button>
            <button type="button" onClick={()=>void session('stop')} disabled={busy==='stop'||!config.whatsapp.enabled}><Square/>Arrêter</button>
            <button type="button" className="danger" onClick={()=>void session('logout')} disabled={busy==='logout'||!config.whatsapp.enabled}><LogOut/>Déconnecter</button>
          </div>
        </div>
        <div className={`channel-card ${status?.sms.configured?'ok':''}`}>
          <Smartphone/>
          <strong>SMS Orange</strong>
          <span>{status?.sms.enabled?(status.sms.configured?'Prêt':'Identifiants incomplets'):'Désactivé'}</span>
          {status?.sms.sender&&<small>{status.sms.sender}</small>}
        </div>
        <div className="channel-card queue-card">
          <RefreshCw/>
          <strong>File d’envoi</strong>
          <span>{status?.queue.queued??0} en attente</span>
          {Boolean(status?.queue.failed24h)&&<small className="channel-error">{status?.queue.failed24h} échec(s) sur 24 h</small>}
          <div className="channel-actions"><button type="button" onClick={()=>void loadStatus()}><RefreshCw/>Actualiser</button></div>
        </div>
      </div>
      {waStatus==='SCAN_QR_CODE'&&<div className="qr-pairing">
        <div><h4><QrCode/>Appairer le téléphone</h4><p>Sur le téléphone de la boutique : WhatsApp → Appareils connectés → Connecter un appareil, puis scannez ce code. Il se renouvelle automatiquement.</p></div>
        {qr?<img src={qr} alt="Code QR d’appairage WhatsApp"/>:<div className="qr-waiting"><i/><span>Génération du code…</span></div>}
      </div>}
    </section>

    <section className="settings-section">
      <div><h3>Passerelle WhatsApp</h3><p>WAHA tourne sur ce serveur, en local. La clé d’API n’est jamais réaffichée après enregistrement.</p></div>
      <div className="settings-fields">
        <label className="setting-switch"><input type="checkbox" checked={config.whatsapp.enabled} onChange={event=>patchWhatsApp({enabled:event.target.checked})}/><span><b>Activer WhatsApp</b><small>Désactivé, aucun message WhatsApp ne part.</small></span></label>
        <label>Adresse de la passerelle<input value={config.whatsapp.baseUrl} onChange={event=>patchWhatsApp({baseUrl:event.target.value})} placeholder="http://127.0.0.1:3111"/></label>
        <label>Nom de la session<input value={config.whatsapp.session} onChange={event=>patchWhatsApp({session:event.target.value})} placeholder="default"/></label>
        <label>Clé d’API{config.hasApiKey&&<em className="field-note">déjà enregistrée</em>}<input type="password" autoComplete="new-password" value={config.whatsapp.apiKey} onChange={event=>patchWhatsApp({apiKey:event.target.value})} placeholder={config.hasApiKey?'••••••••  (laisser vide pour conserver)':'Clé X-Api-Key de WAHA'}/></label>
      </div>
    </section>

    <section className="settings-section">
      <div><h3>SMS — Orange Sénégal</h3><p>Créez une application sur developer.orange.com, puis reportez ici le couple client id / secret et le numéro expéditeur validé.</p></div>
      <div className="settings-fields">
        <label className="setting-switch"><input type="checkbox" checked={config.sms.enabled} onChange={event=>patchSms({enabled:event.target.checked})}/><span><b>Activer le SMS</b><small>Un SMS ne peut pas joindre de PDF : il transporte un lien vers le document.</small></span></label>
        <label>Client id<input value={config.sms.clientId} onChange={event=>patchSms({clientId:event.target.value})}/></label>
        <label>Client secret{config.hasClientSecret&&<em className="field-note">déjà enregistré</em>}<input type="password" autoComplete="new-password" value={config.sms.clientSecret} onChange={event=>patchSms({clientSecret:event.target.value})} placeholder={config.hasClientSecret?'••••••••  (laisser vide pour conserver)':''}/></label>
        <label>Numéro expéditeur<input value={config.sms.sender} onChange={event=>patchSms({sender:event.target.value})} placeholder="+221771234567"/></label>
        <label>Nom affiché<input value={config.sms.senderName} onChange={event=>patchSms({senderName:event.target.value})} placeholder="SENVALISE"/></label>
        <label>URL du jeton<input value={config.sms.tokenUrl} onChange={event=>patchSms({tokenUrl:event.target.value})}/></label>
        <label>URL du service SMS<input value={config.sms.baseUrl} onChange={event=>patchSms({baseUrl:event.target.value})}/></label>
      </div>
    </section>

    <section className="settings-section">
      <div><h3>Débit et adresse publique</h3><p>WhatsApp bannit les comptes qui émettent en rafale : ces deux limites protègent le numéro de la boutique.</p></div>
      <div className="settings-fields">
        <label>Messages par minute<input type="number" min="1" max="60" value={config.throttle.perMinute} onChange={event=>patch({throttle:{...config.throttle,perMinute:Number(event.target.value)}})}/></label>
        <label>Délai minimum entre deux envois (s)<input type="number" min="1" max="120" value={config.throttle.minDelaySeconds} onChange={event=>patch({throttle:{...config.throttle,minDelaySeconds:Number(event.target.value)}})}/></label>
        <label className="field-wide">Adresse publique du site<input value={config.publicUrl} onChange={event=>patch({publicUrl:event.target.value})} placeholder="https://senvalise.online"/><small>Sert à fabriquer les liens de documents envoyés par SMS.</small></label>
      </div>
    </section>

    <section className="settings-section">
      <div><h3>Alerte de rupture de stock</h3><p>Un message par jour sur le numéro du responsable, avec l’état du stock en pièce jointe. La rupture se découvre au comptoir, devant la cliente : c’est la boutique qui doit prévenir.</p></div>
      <div className="settings-fields">
        <label className="setting-switch"><input type="checkbox" checked={config.stockAlert?.enabled??false} onChange={event=>patch({stockAlert:{...config.stockAlert,enabled:event.target.checked}})}/><span><b>Alerte activée</b><small>Un passage par jour, à l’heure choisie.</small></span></label>
        <label>Numéro du responsable<input value={config.stockAlert?.phone??''} onChange={event=>patch({stockAlert:{...config.stockAlert,phone:event.target.value}})} placeholder="+221 77 000 00 00"/><small>Différent du numéro de la boutique si vous le souhaitez.</small></label>
        <label>Canal<select value={config.stockAlert?.channel??'whatsapp'} onChange={event=>patch({stockAlert:{...config.stockAlert,channel:event.target.value}})}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select><small>Le document ne peut être joint qu’en WhatsApp.</small></label>
        <label>Heure d’envoi<input type="number" min="0" max="23" value={config.stockAlert?.hour??8} onChange={event=>patch({stockAlert:{...config.stockAlert,hour:Number(event.target.value)}})}/></label>
        <label className="setting-switch"><input type="checkbox" checked={config.stockAlert?.onlyWhenNeeded??true} onChange={event=>patch({stockAlert:{...config.stockAlert,onlyWhenNeeded:event.target.checked}})}/><span><b>Seulement s’il y a quelque chose à signaler</b><small>Un message quotidien « tout va bien » finit par ne plus être lu.</small></span></label>
        <div className="stock-alert-actions field-wide">
          <button type="button" onClick={()=>void openFile('/api/stock-alert/preview')}><FileText/>Voir le document</button>
          <button type="button" className="primary" disabled={stockBusy} onClick={()=>void sendStockAlert()}><Send/>{stockBusy?'Envoi…':'Envoyer maintenant'}</button>
          {stockNote&&<span>{stockNote}</span>}
        </div>
      </div>
    </section>

    <section className="settings-section">
      <div><h3>Relance automatique des impayés</h3><p>Un passage par jour. Le délai de courtoisie empêche de relancer deux fois le même client coup sur coup.</p></div>
      <div className="settings-fields">
        <label className="setting-switch"><input type="checkbox" checked={config.reminders.enabled} onChange={event=>patch({reminders:{...config.reminders,enabled:event.target.checked}})}/><span><b>Relancer automatiquement</b><small>Sinon, les relances restent manuelles depuis l’écran Créances.</small></span></label>
        <label>Canal<select value={config.reminders.channel} onChange={event=>patch({reminders:{...config.reminders,channel:event.target.value}})}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label>
        <label>Solde minimum (F)<input type="number" min="0" step="500" value={config.reminders.minAmount} onChange={event=>patch({reminders:{...config.reminders,minAmount:Number(event.target.value)}})}/></label>
        <label>À partir de (jours)<input type="number" min="0" value={config.reminders.afterDays} onChange={event=>patch({reminders:{...config.reminders,afterDays:Number(event.target.value)}})}/></label>
        <label>Délai de courtoisie (jours)<input type="number" min="1" value={config.reminders.cooldownDays} onChange={event=>patch({reminders:{...config.reminders,cooldownDays:Number(event.target.value)}})}/></label>
        <label className="field-wide">Message de relance<textarea rows={3} value={config.reminders.body} onChange={event=>patch({reminders:{...config.reminders,body:event.target.value}})}/><small>Jetons disponibles : {config.placeholders.map(token=>`{{${token}}}`).join(' · ')}</small></label>
      </div>
    </section>

    <section className="settings-section">
      <div><h3>Envoi d’essai</h3><p>Part immédiatement, hors file : l’erreur éventuelle s’affiche ici.</p></div>
      <div className="settings-fields">
        <label>Canal<select value={test.channel} onChange={event=>setTest({...test,channel:event.target.value})}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label>
        <label>Numéro<input value={test.to} onChange={event=>setTest({...test,to:event.target.value})} placeholder="77 123 45 67"/></label>
        <label className="field-wide">Message<textarea rows={2} value={test.body} onChange={event=>setTest({...test,body:event.target.value})}/></label>
        <button type="button" className="primary compact" onClick={()=>void sendTest()} disabled={busy==='test'||!test.to}><Send/>{busy==='test'?'Envoi…':'Envoyer l’essai'}</button>
      </div>
      {!connected&&config.whatsapp.enabled&&<p className="hint"><TriangleAlert/>La session WhatsApp n’est pas connectée : un essai sur ce canal échouera tant que le téléphone n’est pas appairé.</p>}
    </section>
  </form>;
}
