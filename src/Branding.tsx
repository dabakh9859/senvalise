import {FormEvent,useEffect,useState} from 'react';
import {Globe2,ImagePlus,Info,Save,Trash2} from 'lucide-react';
import {api,apiForm} from './api';

// Identité visuelle : un seul endroit pour le logo, utilisé partout.
//
// Le logo était dessiné en dur dans le code — un « SV » ici, un SVG de valise
// là — et l'onglet du navigateur n'en montrait aucun. Ce qui est enregistré
// ici alimente la boutique, l'espace de gestion, l'onglet du navigateur, les
// documents PDF et les aperçus de partage Google, WhatsApp et Facebook.
//
// Les pages pointent vers une adresse stable (/api/public/branding/logo) et
// non vers le fichier téléversé : changer de logo ne demande donc de retoucher
// aucune page, et l'ancienne image cesse d'être servie immédiatement.

type Branding={siteName:string;tagline:string;logoUrl:string;faviconUrl:string;themeColor:string;description:string};

// L'adresse d'affichage porte un jeton de version : sans lui le navigateur
// continuerait de montrer l'ancien logo, qu'il garde en cache cinq minutes.
const assetUrl=(kind:'logo'|'favicon',version:number)=>`/api/public/branding/${kind}?v=${version}`;

export default function Branding(){
  const[config,setConfig]=useState<Branding|null>(null);
  const[version,setVersion]=useState(Date.now());
  const[saving,setSaving]=useState(false);
  const[busy,setBusy]=useState('');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  useEffect(()=>{api<Branding>('/api/branding').then(setConfig).catch(reason=>setError((reason as Error).message))},[]);
  const patch=(change:Partial<Branding>)=>setConfig(current=>current?{...current,...change}:current);

  const upload=async(kind:'logo'|'favicon',file?:File)=>{
    if(!file)return;
    setBusy(kind);setError('');setMessage('');
    try{
      const body=new FormData();body.append('image',file);
      setConfig(await apiForm<Branding>(`/api/branding/${kind}`,body));
      setVersion(Date.now());
      setMessage(kind==='logo'?'Logo enregistré. Il est déjà en place sur la boutique, la gestion et les documents.':'Favicon enregistré.');
    }catch(reason){setError((reason as Error).message)}
    finally{setBusy('')}
  };

  const save=async(event:FormEvent)=>{
    event.preventDefault();if(!config)return;
    setSaving(true);setError('');setMessage('');
    try{setConfig(await api<Branding>('/api/branding',{method:'PUT',body:JSON.stringify(config)}));setVersion(Date.now());setMessage('Identité enregistrée.')}
    catch(reason){setError((reason as Error).message)}
    finally{setSaving(false)}
  };

  if(!config)return <div className="loading"><i/><span>Chargement de l’identité…</span></div>;

  return <form className="branding-page panel" onSubmit={save}>
    <header>
      <div><h2>Logo et identité de la marque</h2><p>Une seule image pour la boutique, la gestion, l’onglet du navigateur, les factures et les aperçus de partage.</p></div>
      <button className="primary compact" disabled={saving}><Save/>{saving?'Enregistrement…':'Enregistrer'}</button>
    </header>
    {message&&<div className="success">{message}</div>}
    {error&&<div className="error">{error}</div>}

    <section className="settings-section">
      <div><h3>Logo</h3><p>PNG, JPG, WebP ou SVG, 4 Mo maximum. Un fond transparent s’intègre mieux au bandeau bleu des factures.</p></div>
      <div className="branding-upload">
        <div className="logo-frame"><img src={assetUrl('logo',version)} alt="Logo actuel"/></div>
        <div className="branding-upload-actions">
          <label className="upload-button"><ImagePlus/>{busy==='logo'?'Envoi…':'Choisir un fichier'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event=>{void upload('logo',event.target.files?.[0]);event.target.value=''}}/></label>
          {config.logoUrl&&<button type="button" className="compact" onClick={()=>patch({logoUrl:''})}><Trash2/>Retirer</button>}
          <p className="hint"><Info/>Le SVG reste net partout, mais les factures PDF et les aperçus de partage exigent un PNG ou un JPG. Avec un logo SVG, la facture garde son bandeau de couleur.</p>
        </div>
      </div>
    </section>

    <section className="settings-section">
      <div><h3>Icône d’onglet</h3><p>Facultative : sans elle, le logo sert d’icône. Une image carrée d’au moins 64 px reste lisible à petite taille.</p></div>
      <div className="branding-upload">
        <div className="logo-frame small"><img src={assetUrl('favicon',version)} alt="Icône actuelle"/></div>
        <div className="branding-upload-actions">
          <label className="upload-button"><ImagePlus/>{busy==='favicon'?'Envoi…':'Choisir un fichier'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event=>{void upload('favicon',event.target.files?.[0]);event.target.value=''}}/></label>
          {config.faviconUrl&&config.faviconUrl!==config.logoUrl&&<button type="button" className="compact" onClick={()=>patch({faviconUrl:''})}><Trash2/>Utiliser le logo</button>}
        </div>
      </div>
    </section>

    <section className="settings-section">
      <div><h3>Nom et référencement</h3><p>Ces textes alimentent le titre de la marque, la description Google et les aperçus WhatsApp et Facebook.</p></div>
      <div className="settings-fields">
        <label>Nom de la marque<input value={config.siteName} onChange={event=>patch({siteName:event.target.value})}/></label>
        <label>Slogan<input value={config.tagline} onChange={event=>patch({tagline:event.target.value})}/></label>
        <label>Couleur de la marque<input type="color" value={config.themeColor||'#1529d6'} onChange={event=>patch({themeColor:event.target.value})}/></label>
        <label>Code couleur<input value={config.themeColor} onChange={event=>patch({themeColor:event.target.value})} placeholder="#1529d6"/></label>
        <label className="field-wide">Description pour les moteurs de recherche<textarea rows={3} value={config.description} onChange={event=>patch({description:event.target.value})}/>
          <small>Environ 150 caractères : au-delà, Google tronque. Actuellement {config.description.length}.</small></label>
      </div>
    </section>

    <section className="settings-section">
      <div><h3><Globe2/>Où ce logo apparaît</h3><p>Rien d’autre à configurer ailleurs : ces emplacements lisent tous ce même enregistrement.</p></div>
      <ul className="branding-usage">
        <li><b>Boutique en ligne</b><span>en-tête de toutes les pages et bas de page</span></li>
        <li><b>Espace de gestion</b><span>barre latérale et écran de connexion</span></li>
        <li><b>Onglet du navigateur</b><span>boutique et gestion</span></li>
        <li><b>Factures, devis, bons</b><span>bandeau d’en-tête des PDF</span></li>
        <li><b>Google et réseaux sociaux</b><span>image et description de partage</span></li>
      </ul>
    </section>
  </form>;
}
