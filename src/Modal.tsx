import {ReactNode,useEffect} from 'react';
import {X} from 'lucide-react';

// Modale partagée.
//
// Les listes de l'application ouvrent déjà leurs créations et leurs fiches
// dans une fenêtre posée sur la page (voir RecordForm). Les écrans Coffres et
// Campagnes dérogeaient à cette règle avec des formulaires intercalés dans la
// page, ce qui poussait la liste vers le bas au moment précis où l'on veut la
// garder sous les yeux.
//
// Le gabarit reprend les classes existantes — .overlay, .modal, .modal-head,
// .modal-actions — pour que rien ne détonne, et ajoute deux comportements que
// RecordForm n'avait pas : la fermeture par Échap et le blocage du défilement
// de la page derrière. Sans ce blocage, faire défiler une modale longue fait
// glisser la page du dessous dès qu'on atteint le bas.

type Props={
  eyebrow?:string;
  title:string;
  subtitle?:string;
  wide?:boolean;
  onClose:()=>void;
  children:ReactNode;
  footer?:ReactNode;
};

export default function Modal({eyebrow,title,subtitle,wide,onClose,children,footer}:Props){
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};
    document.addEventListener('keydown',onKey);
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=previous};
  },[onClose]);

  return <div className="overlay" onMouseDown={onClose}>
    {/* onMouseDown et non onClick : un glissement commencé dans la fenêtre et
        relâché sur le fond ne doit pas la fermer. */}
    <div className={`modal edit-modal${wide?' wide-modal':''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={event=>event.stopPropagation()}>
      <div className="modal-head">
        <div>
          {eyebrow&&<small>{eyebrow}</small>}
          <h2>{title}</h2>
          {subtitle&&<p>{subtitle}</p>}
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label="Fermer"><X/></button>
      </div>
      {children}
      {footer&&<div className="modal-actions">{footer}</div>}
    </div>
  </div>;
}
