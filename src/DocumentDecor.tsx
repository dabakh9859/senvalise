// Décor du papier à en-tête : avion, valises, passeport, panneau, et les
// trajectoires en pointillés.
//
// Le même décor est dessiné au trait dans le PDF (drawDoodles). Les deux
// doivent rester identiques : c'est le principe tenu depuis la reprise du
// papier à en-tête — le gérant lit l'écran, le client reçoit le PDF, et les
// deux sont le même document.
//
// Les positions sont exprimées en pourcentage de la feuille, comme les
// millimètres du PDF le sont de l'A4, pour que le décor suive la mise en page
// quelle que soit la largeur d'affichage. Il est purement décoratif, donc
// masqué aux lecteurs d'écran et non imprimé à l'encre pleine.
export default function DocumentDecor(){
  const stroke={fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
  return <div className="doc-decor" aria-hidden="true">
    <svg className="decor-plane" viewBox="0 0 120 50"><path {...stroke} d="M4 28c18-6 30-10 47-11l18-13 6 2-11 13 27 7 16-6 7 2-15 10-8 11-6-1 4-9-31-4-18 12-5-2 9-15-26-3z"/></svg>
    <svg className="decor-pass" viewBox="0 0 70 90">
      <rect {...stroke} x="10" y="5" width="48" height="70" rx="4"/>
      <path {...stroke} d="M17 18h34M35 31a12 12 0 1 0 0 24 12 12 0 1 0 0-24zm-12 12h24M35 31c-5 6-5 18 0 24m0-24c5 6 5 18 0 24"/>
    </svg>
    <svg className="decor-sign" viewBox="0 0 60 90">
      <path {...stroke} d="M28 85V10M28 16H7l8-9h13M28 29h23l-8-9H28M28 46H10l8-8h10"/>
      <circle {...stroke} cx="28" cy="6" r="3"/>
    </svg>
    <svg className="decor-case1" viewBox="0 0 70 80">
      <rect {...stroke} x="10" y="20" width="48" height="48" rx="6"/>
      <path {...stroke} d="M23 20v-7c0-5 4-8 9-8h4c5 0 9 3 9 8v7M20 31v25M48 31v25"/>
    </svg>
    <svg className="decor-case2" viewBox="0 0 70 80">
      <rect {...stroke} x="10" y="20" width="48" height="48" rx="6"/>
      <path {...stroke} d="M23 20v-7c0-5 4-8 9-8h4c5 0 9 3 9 8v7M20 31v25M48 31v25"/>
    </svg>
    <i className="decor-path1"/>
    <i className="decor-path2"/>
  </div>;
}
