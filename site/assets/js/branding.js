/* Sen Valise - identite visuelle de la vitrine.

   Le logo de l'en-tete etait un SVG dessine dans chacune des huit pages :
   changer de marque demandait de les modifier une a une, et l'onglet du
   navigateur n'affichait rien. Ce script lit le logo enregistre dans la
   gestion et le pose partout ou la marque apparait.

   Il ne fait rien quand aucun logo n'est televerse : le SVG d'origine reste
   en place, ce qui evite un en-tete vide en cas de panne de l'API.

   A charger en differe, apres icons.js. */
(function () {
  "use strict";

  var CACHE_KEY = "sv.brand";

  function apply(brand) {
    if (!brand) return;

    var marks = document.querySelectorAll(".brand__mark");
    for (var i = 0; i < marks.length; i++) {
      var mark = marks[i];
      if (!brand.logoUrl) continue;
      // On remplace le dessin par l'image plutot que de superposer les deux :
      // deux marques cote a cote dans l'en-tete se remarquent tout de suite.
      var image = document.createElement("img");
      image.className = "brand__mark brand__mark--image";
      image.src = brand.logoUrl;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      mark.parentNode.replaceChild(image, mark);
    }

    if (brand.siteName) {
      // Le nom est un noeud de texte a cote du dessin : on le remplace sans
      // toucher au reste du lien, qui porte l'accessibilite.
      var brands = document.querySelectorAll(".brand");
      for (var b = 0; b < brands.length; b++) {
        var node = brands[b];
        for (var c = 0; c < node.childNodes.length; c++) {
          var child = node.childNodes[c];
          if (child.nodeType === 3 && child.nodeValue.trim()) {
            child.nodeValue = " " + brand.siteName;
            break;
          }
        }
        if (node.hasAttribute("aria-label")) {
          node.setAttribute("aria-label", brand.siteName + ", accueil");
        }
      }
    }
  }

  // Le logo est pose depuis le cache local avant meme la reponse du serveur :
  // sans cela, chaque page afficherait brievement l'ancienne marque.
  try {
    var cached = localStorage.getItem(CACHE_KEY);
    if (cached) apply(JSON.parse(cached));
  } catch (e) { /* navigation privee : on attendra la reponse du serveur */ }

  fetch("/api/public/branding")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (brand) {
      if (!brand) return;
      apply(brand);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(brand)); } catch (e) { /* sans cache, le rendu reste correct */ }
    })
    .catch(function () { /* API injoignable : la marque d'origine reste affichee */ });
})();
