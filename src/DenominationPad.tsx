// Pavé de coupures : on saisit un montant comme on compte des billets.
//
// Deux fois 10 000, une fois 5 000, une fois 1 000 font 26 000, sans passer
// par le clavier. Il sert au comptoir pour le montant encaissé, et à la fiche
// produit pour le prix de vente — c'est le même geste, et il vaut mieux un
// seul composant que deux copies qui divergeront.
//
// Les cinq premières valeurs sont les billets qui circulent réellement au
// Sénégal. Les cinq suivantes sont des raccourcis : sans elles, un prix à sept
// chiffres demanderait cent clics sur 10 000.

export const denominations=[500,1000,2000,5000,10000,25000,50000,100000,500000,1000000];
const format=new Intl.NumberFormat('fr-FR');
// « 1 M » plutôt que « 1 000 000 » : le libellé complet forcerait toute la
// grille à s'élargir pour une seule cellule.
const denominationLabel=(value:number)=>value>=1000000?'1 M':format.format(value);

type Props={
  label:string;
  // fromZero dit si le prochain clic repart de zéro. Un champ pré-rempli — le
  // total à payer, le prix d'un produit qu'on modifie — ne doit pas voir la
  // première coupure s'ajouter par-dessus : on compte ce qu'on a en main, pas
  // ce qui était écrit.
  fromZero:boolean;
  value:string;
  onChange:(value:string)=>void;
};

export default function DenominationPad({label,fromZero,value,onChange}:Props){
  const add=(amount:number)=>onChange(String((fromZero?0:Number(value)||0)+amount));
  return <div className="denominations">
    <div className="denominations-head">
      <span>{label}</span>
      <button type="button" onClick={()=>onChange('')}>Effacer</button>
    </div>
    <div className="denominations-grid">
      {denominations.map(amount=><button type="button" key={amount} onClick={()=>add(amount)}
        aria-label={`Ajouter ${format.format(amount)} francs`}>{denominationLabel(amount)}</button>)}
    </div>
  </div>;
}
