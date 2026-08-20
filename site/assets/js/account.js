/* Sen Valise - comptes, coffre, adresses, commandes, zones.

   Tout vivait dans le localStorage du visiteur. Tout vient maintenant de
   l'API : le mot de passe est verifie et hache par le serveur, le solde du
   coffre est une vraie ligne de compte, et une commande payee par le coffre
   apparait dans le back-office et decremente le stock.

   La surface publique n'a pas change (SV.Auth, SV.Account, SV.Geo) pour que
   les pages restent lisibles. Une seule regle nouvelle :

     - les LECTURES restent synchrones, servies par un cache rempli au
       demarrage (SV.Session.hydrate, appele par app.js avant SV_PAGE) ;
     - les ECRITURES rendent une promesse. Il n'etait pas question de rendre
       un versement optimiste : annoncer un paiement reussi avant la reponse
       du serveur, sur de l'argent, n'est pas acceptable.

   A charger apres api.js et avant app.js. */
(function () {
  "use strict";

  var SV = window.SV = window.SV || {};

  var cache = {
    user: null,
    vault: { balance: 0, goal: 0, goalRef: "", tx: [], min: 1000, max: 2000000, methods: {} },
    addresses: [],
    orders: [],
    zones: []
  };

  function blankVault() {
    return { balance: 0, goal: 0, goalRef: "", tx: [], min: 1000, max: 2000000, methods: {} };
  }

  /* ---------- chargement ---------- */

  function loadZones() {
    return SV.Api.get("/zones").then(function (r) {
      cache.zones = r.ok && Array.isArray(r.data) ? r.data : [];
    });
  }

  function loadMine() {
    if (!SV.Api.token()) {
      cache.user = null;
      cache.vault = blankVault();
      cache.addresses = [];
      cache.orders = [];
      return Promise.resolve();
    }
    return Promise.all([
      SV.Api.get("/me"),
      SV.Api.get("/vault"),
      SV.Api.get("/addresses"),
      SV.Api.get("/orders")
    ]).then(function (res) {
      cache.user = res[0].ok ? res[0].data : null;
      cache.vault = res[1].ok ? res[1].data : blankVault();
      cache.addresses = res[2].ok && Array.isArray(res[2].data) ? res[2].data : [];
      cache.orders = res[3].ok && Array.isArray(res[3].data) ? res[3].data : [];
      if (!cache.user) SV.Api.setToken("");
    });
  }

  SV.Session = {
    hydrate: function () { return Promise.all([loadZones(), loadMine()]); },
    refresh: loadMine
  };

  /* ---------- comptes ---------- */

  function adopt(r) {
    if (!r.ok) return { ok: false, message: r.message };
    SV.Api.setToken(r.data.token);
    cache.user = r.data.user;
    return loadMine().then(function () { return { ok: true, user: cache.user }; });
  }

  SV.Auth = {
    current: function () { return cache.user; },

    signup: function (name, email, phone, pass) {
      return SV.Api.post("/auth/register", {
        name: name, email: email, phone: phone, password: pass
      }).then(adopt);
    },

    login: function (email, pass) {
      return SV.Api.post("/auth/login", { email: email, password: pass }).then(adopt);
    },

    logout: function () {
      SV.Api.setToken("");
      cache.user = null;
      cache.vault = blankVault();
      cache.addresses = [];
      cache.orders = [];
    },

    onSignedOut: function () {
      cache.user = null;
      cache.vault = blankVault();
      cache.addresses = [];
      cache.orders = [];
    },

    updateProfile: function (name, email, phone) {
      // L'adresse e-mail identifie le compte : elle n'est plus modifiable
      // depuis la boutique, sous peine de doublons cote gestion.
      return SV.Api.put("/me", { name: name, phone: phone }).then(function (r) {
        if (!r.ok) return { ok: false, message: r.message };
        cache.user = r.data;
        return { ok: true };
      });
    },

    changePass: function (current, next) {
      return SV.Api.put("/me/password", { current: current, next: next }).then(function (r) {
        return r.ok ? { ok: true } : { ok: false, field: "current", message: r.message };
      });
    },

    destroy: function () {
      return SV.Api.del("/me").then(function (r) {
        if (!r.ok) return { ok: false, message: r.message };
        SV.Auth.logout();
        return { ok: true };
      });
    },

    guard: function () {
      if (cache.user) return true;
      location.replace("compte.html");
      return false;
    }
  };

  /* ---------- coffre, adresses, commandes ---------- */

  SV.Account = {
    vault: function () { return cache.vault; },

    get methods() { return cache.vault.methods || {}; },

    deposit: function (amount, method) {
      amount = Math.floor(Number(amount));
      if (!isFinite(amount)) return Promise.resolve({ ok: false, message: "Montant invalide." });
      if (!method) return Promise.resolve({ ok: false, message: "Choisissez un moyen de versement." });
      return SV.Api.post("/vault/deposit", { amount: amount, method: method }).then(function (r) {
        if (!r.ok) return { ok: false, message: r.message };
        return SV.Session.refresh().then(function () {
          return { ok: true, balance: cache.vault.balance };
        });
      });
    },

    setGoal: function (amount, ref) {
      return SV.Api.put("/vault/goal", {
        amount: Math.floor(Number(amount) || 0), ref: ref || ""
      }).then(function (r) {
        if (!r.ok) return { ok: false, message: r.message };
        cache.vault.goal = r.data.goal;
        cache.vault.goalRef = r.data.goalRef;
        return { ok: true };
      });
    },

    addresses: function () { return cache.addresses; },

    defaultAddress: function () {
      for (var i = 0; i < cache.addresses.length; i++) {
        if (cache.addresses[i].isDefault) return cache.addresses[i];
      }
      return cache.addresses[0] || null;
    },

    saveAddress: function (addr) {
      return SV.Api.post("/addresses", {
        id: Number(addr.id) || 0, label: addr.label, zone: addr.zone, detail: addr.detail
      }).then(function (r) {
        if (!r.ok) return { ok: false, message: r.message };
        return SV.Session.refresh().then(function () { return { ok: true }; });
      });
    },

    removeAddress: function (id) {
      return SV.Api.del("/addresses/" + id).then(function (r) {
        if (!r.ok) return { ok: false, message: r.message };
        return SV.Session.refresh().then(function () { return { ok: true }; });
      });
    },

    setDefaultAddress: function (id) {
      return SV.Api.post("/addresses/" + id + "/default").then(function (r) {
        if (!r.ok) return { ok: false, message: r.message };
        return SV.Session.refresh().then(function () { return { ok: true }; });
      });
    },

    orders: function () { return cache.orders; },

    /* Le total et les frais de port sont recalcules par le serveur a partir
       du catalogue : les montants envoyes par le navigateur ne font pas foi.
       La signature garde ses quatre arguments pour ne pas toucher panier.html. */
    payFromVault: function (lines, subtotal, shipping, address) {
      if (!lines || !lines.length) {
        return Promise.resolve({ ok: false, message: "Votre panier est vide." });
      }
      if (!address) {
        return Promise.resolve({ ok: false, message: "Ajoutez une adresse de livraison dans vos paramètres." });
      }
      var payload = {
        addressId: Number(address.id) || 0,
        zone: address.zone || "",
        lines: lines.map(function (l) {
          return { ref: l.ref, qty: Number(l.qty) || 1, color: l.color || "" };
        })
      };
      return SV.Api.post("/orders/vault", payload).then(function (r) {
        if (!r.ok) return { ok: false, message: r.message };
        return SV.Session.refresh().then(function () {
          return { ok: true, order: r.data };
        });
      });
    },

    steps: ["Commande reçue", "En préparation", "En livraison", "Livrée"],

    /* Suivi indicatif : sans transporteur branche, l'etape se deduit de
       l'anciennete, sauf si la gestion a deja marque la commande livree. */
    status: function (order) {
      if (order && order.status === "delivered") {
        return { step: 3, label: "Livrée", hint: "Merci de votre confiance." };
      }
      if (order && order.status === "cancelled") {
        return { step: 0, label: "Annulée", hint: "Contactez-nous si c'est une erreur." };
      }
      var h = (Date.now() - (order ? order.at : 0)) / 3600000;
      if (h < 2) return { step: 0, label: "Commande reçue", hint: "Nous préparons votre colis." };
      if (h < 24) return { step: 1, label: "En préparation", hint: "Emballage à l'atelier du Point E." };
      if (h < 72) return { step: 2, label: "En livraison", hint: "Le livreur vous appellera avant de passer." };
      return { step: 3, label: "Livrée", hint: "Merci de votre confiance." };
    }
  };

  /* ---------- zones de livraison ---------- */

  function km(aLat, aLon, bLat, bLon) {
    var R = 6371, r = Math.PI / 180;
    var dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  SV.Geo = {
    get zones() { return cache.zones; },

    byId: function (id) {
      for (var i = 0; i < cache.zones.length; i++) {
        if (cache.zones[i].id === id) return cache.zones[i];
      }
      return null;
    },

    /* Le calcul reste local : la position du visiteur ne quitte pas son
       navigateur, aucun service de cartographie n'est appele. */
    nearest: function (lat, lon) {
      var best = null, bestKm = Infinity;
      cache.zones.forEach(function (z) {
        var d = km(lat, lon, z.lat, z.lon);
        if (d < bestKm) { bestKm = d; best = z; }
      });
      if (!best) return null;
      return { zone: best, km: bestKm, covered: bestKm <= 40 };
    },

    available: function () {
      return typeof navigator !== "undefined" && !!navigator.geolocation && window.isSecureContext;
    },

    locate: function (onFound, onError) {
      if (!SV.Geo.available()) {
        if (onError) onError("La géolocalisation exige une connexion sécurisée (https ou localhost).");
        return;
      }
      navigator.geolocation.getCurrentPosition(function (pos) {
        onFound(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      }, function () {
        if (onError) onError("Position indisponible. Choisissez votre zone à la main.");
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    }
  };
})();
