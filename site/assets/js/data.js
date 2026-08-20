/* Sen Valise - catalogue.

   Le catalogue vivait ici en dur. Il vient desormais de l'API de gestion :
   ajouter un produit ou changer un prix se fait dans le back-office, la
   boutique suit. Les trois globaux historiques sont conserves tels quels
   (SV_PRODUCTS, SV_COLORWAYS, SV_CATEGORIES) : les pages n'ont pas bouge,
   elles sont simplement rendues apres le chargement, orchestre par app.js.

   Prix en francs CFA. */
(function () {
  "use strict";

  var SV = window.SV = window.SV || {};

  window.SV_PRODUCTS = [];
  window.SV_COLORWAYS = {};
  window.SV_CATEGORIES = [{ id: "tout", label: "Tout" }];
  window.SV_SHIPPING = { fee: 4000, freeFrom: 100000 };

  SV.Catalog = {
    loaded: false,
    error: "",

    load: function () {
      return SV.Api.get("/catalog").then(function (r) {
        if (!r.ok) {
          SV.Catalog.error = r.message;
          return false;
        }
        var d = r.data || {};

        // On REMPLIT ces structures, on ne les remplace pas : app.js capture
        // window.SV_PRODUCTS et window.SV_COLORWAYS dans des variables des son
        // chargement. Une reaffectation laisserait ces variables pointer sur
        // les tableaux vides, et findProduct ne trouverait plus rien.
        window.SV_PRODUCTS.length = 0;
        (d.products || []).forEach(function (p) { window.SV_PRODUCTS.push(p); });

        Object.keys(window.SV_COLORWAYS).forEach(function (k) { delete window.SV_COLORWAYS[k]; });
        Object.keys(d.colorways || {}).forEach(function (k) { window.SV_COLORWAYS[k] = d.colorways[k]; });

        if (d.categories && d.categories.length) {
          window.SV_CATEGORIES.length = 0;
          d.categories.forEach(function (c) { window.SV_CATEGORIES.push(c); });
        }
        if (d.shipping) {
          window.SV_SHIPPING.fee = d.shipping.fee;
          window.SV_SHIPPING.freeFrom = d.shipping.freeFrom;
        }
        SV.Catalog.loaded = true;
        return true;
      });
    },

    byRef: function (ref) {
      for (var i = 0; i < window.SV_PRODUCTS.length; i++) {
        if (window.SV_PRODUCTS[i].ref === ref) return window.SV_PRODUCTS[i];
      }
      return null;
    },

    /* Frais de port : forfait, offerts au-dela d'un seuil. Les deux valeurs
       sont des reglages de la gestion, plus des constantes du site. */
    shipping: function (subtotal) {
      var s = window.SV_SHIPPING;
      if (s.freeFrom > 0 && subtotal >= s.freeFrom) return 0;
      return s.fee;
    },
    freeFrom: function () { return window.SV_SHIPPING.freeFrom; }
  };
})();
