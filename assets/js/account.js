/* Sen Valise - comptes, coffre, adresses de livraison, commandes.

   DEMO LOCALE. Ce site est statique : il n'y a ni serveur ni base de données.
   Tout ce que ce fichier manipule vit dans le localStorage du navigateur.
   Concrètement :
     - n'importe qui ayant accès au navigateur peut lire ou modifier ces données,
     - le mot de passe est haché (SHA-256 + sel) pour ne pas dormir en clair,
       mais cela ne constitue PAS une authentification : rien ne vérifie quoi
       que ce soit côté serveur,
     - aucun paiement n'est traité, les alimentations du coffre sont simulées.
   Pour une vraie boutique, tout ce fichier doit être remplacé par des appels
   à une API authentifiée. */
(function () {
  "use strict";

  var USERS_KEY   = "sv.users";
  var SESSION_KEY = "sv.session";
  var DATA_PREFIX = "sv.user.";

  var MAX_DEPOSIT = 2000000;   // garde-fou de saisie, en F CFA
  var MIN_DEPOSIT = 1000;

  /* ---------- stockage ---------- */

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  /* ---------- zones de livraison ---------- */

  /* Centroïdes approximatifs. Le rattachement se fait hors ligne, par distance :
     pas d'appel à un service de géocodage, donc pas de coordonnées client
     envoyées à un tiers. */
  var ZONES = [
    { id: "plateau",   name: "Dakar Plateau",       area: "Dakar",     lat: 14.6690, lon: -17.4390, delay: "48 h" },
    { id: "medina",    name: "Médina",              area: "Dakar",     lat: 14.6800, lon: -17.4520, delay: "48 h" },
    { id: "point-e",   name: "Point E et Fann",     area: "Dakar",     lat: 14.6930, lon: -17.4620, delay: "48 h" },
    { id: "mermoz",    name: "Mermoz et Sacré-Cœur", area: "Dakar",    lat: 14.7050, lon: -17.4720, delay: "48 h" },
    { id: "ouakam",    name: "Ouakam",              area: "Dakar",     lat: 14.7180, lon: -17.4900, delay: "48 h" },
    { id: "almadies",  name: "Almadies et Ngor",    area: "Dakar",     lat: 14.7440, lon: -17.5140, delay: "48 h" },
    { id: "yoff",      name: "Yoff",                area: "Dakar",     lat: 14.7530, lon: -17.4740, delay: "48 h" },
    { id: "grand-yoff", name: "Grand Yoff",         area: "Dakar",     lat: 14.7300, lon: -17.4600, delay: "48 h" },
    { id: "parcelles", name: "Parcelles Assainies", area: "Dakar",     lat: 14.7660, lon: -17.4310, delay: "48 h" },
    { id: "guediawaye", name: "Guédiawaye",         area: "Banlieue",  lat: 14.7760, lon: -17.4060, delay: "48 h" },
    { id: "pikine",    name: "Pikine",              area: "Banlieue",  lat: 14.7550, lon: -17.3960, delay: "48 h" },
    { id: "keur-massar", name: "Keur Massar",       area: "Banlieue",  lat: 14.7800, lon: -17.3200, delay: "72 h" },
    { id: "rufisque",  name: "Rufisque",            area: "Banlieue",  lat: 14.7160, lon: -17.2740, delay: "72 h" },
    { id: "diamniadio", name: "Diamniadio",         area: "Banlieue",  lat: 14.7280, lon: -17.1840, delay: "72 h" },
    { id: "thies",     name: "Thiès",               area: "Région",    lat: 14.7900, lon: -16.9260, delay: "4 jours" },
    { id: "mbour",     name: "Mbour et Saly",       area: "Région",    lat: 14.4200, lon: -16.9640, delay: "4 jours" },
    { id: "kaolack",   name: "Kaolack",             area: "Région",    lat: 14.1520, lon: -16.0730, delay: "4 jours" },
    { id: "touba",     name: "Touba",               area: "Région",    lat: 14.8500, lon: -15.8790, delay: "4 jours" },
    { id: "saint-louis", name: "Saint-Louis",       area: "Région",    lat: 16.0180, lon: -16.4890, delay: "4 jours" },
    { id: "ziguinchor", name: "Ziguinchor",         area: "Région",    lat: 12.5680, lon: -16.2730, delay: "5 jours" }
  ];

  function zoneById(id) {
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].id === id) return ZONES[i];
    return null;
  }

  function km(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* Renvoie la zone la plus proche et la distance. À plus de 40 km d'un
     centroïde on considère le point hors couverture : la zone est proposée à
     titre indicatif, jamais imposée. */
  function nearestZone(lat, lon) {
    var best = null, bestD = Infinity;
    ZONES.forEach(function (z) {
      var d = km(lat, lon, z.lat, z.lon);
      if (d < bestD) { bestD = d; best = z; }
    });
    return { zone: best, distance: bestD, covered: bestD <= 40 };
  }

  var Geo = {
    zones: ZONES,
    byId: zoneById,
    nearest: nearestZone,
    available: function () {
      return !!(navigator.geolocation && window.isSecureContext !== false);
    },
    locate: function (onOk, onErr) {
      if (!navigator.geolocation) {
        onErr("Votre navigateur ne propose pas la géolocalisation.");
        return;
      }
      navigator.geolocation.getCurrentPosition(function (pos) {
        onOk(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      }, function (err) {
        var msg;
        if (err.code === 1) msg = "Permission refusée. Choisissez votre zone dans la liste.";
        else if (err.code === 2) msg = "Position indisponible. Le site doit être ouvert en https ou sur localhost.";
        else if (err.code === 3) msg = "La localisation a pris trop de temps. Réessayez.";
        else msg = "Localisation impossible pour le moment.";
        onErr(msg);
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
    }
  };

  /* ---------- hachage ---------- */

  function toHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }

  function cryptoOk() {
    return !!(window.crypto && window.crypto.subtle && window.TextEncoder);
  }

  function makeSalt() {
    if (window.crypto && window.crypto.getRandomValues) {
      return toHex(window.crypto.getRandomValues(new Uint8Array(16)));
    }
    return String(Date.now()) + Math.floor(Math.random() * 1e9);
  }

  function hashPass(pass, salt) {
    var data = new TextEncoder().encode(salt + "|" + pass);
    return window.crypto.subtle.digest("SHA-256", data).then(toHex);
  }

  /* ---------- utilitaires ---------- */

  function normEmail(s) { return String(s || "").trim().toLowerCase(); }

  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }

  function newId(prefix) {
    var n = 0;
    if (window.crypto && window.crypto.getRandomValues) {
      n = window.crypto.getRandomValues(new Uint32Array(1))[0];
    } else {
      n = Math.floor(Math.random() * 4294967295);
    }
    return prefix + n.toString(36).toUpperCase();
  }

  /* ---------- authentification ---------- */

  function users() {
    var list = read(USERS_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function findByEmail(email) {
    var e = normEmail(email);
    var list = users();
    for (var i = 0; i < list.length; i++) if (list[i].email === e) return list[i];
    return null;
  }

  var Auth = {
    ready: cryptoOk,

    current: function () {
      var s = read(SESSION_KEY, null);
      if (!s || !s.id) return null;
      var list = users();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === s.id) {
          return { id: list[i].id, name: list[i].name, email: list[i].email, phone: list[i].phone, at: list[i].at };
        }
      }
      drop(SESSION_KEY);
      return null;
    },

    /* Renvoie une promesse résolue avec {ok:true} ou {ok:false, field, message}. */
    signup: function (name, email, phone, pass) {
      if (!cryptoOk()) {
        return Promise.resolve({ ok: false, field: "pass",
          message: "Ce navigateur ne peut pas hacher le mot de passe ici. Ouvrez le site via http://localhost." });
      }
      name = String(name || "").trim();
      email = normEmail(email);
      phone = String(phone || "").trim();

      if (name.length < 2) return Promise.resolve({ ok: false, field: "name", message: "Indiquez votre nom." });
      if (!validEmail(email)) return Promise.resolve({ ok: false, field: "email", message: "Adresse e-mail invalide." });
      if (phone && !/^[+0-9 ]{6,20}$/.test(phone)) {
        return Promise.resolve({ ok: false, field: "phone", message: "Numéro invalide. Exemple : +221 77 148 20 36." });
      }
      if (String(pass || "").length < 8) {
        return Promise.resolve({ ok: false, field: "pass", message: "Huit caractères minimum." });
      }
      if (findByEmail(email)) {
        return Promise.resolve({ ok: false, field: "email", message: "Un compte existe déjà avec cette adresse." });
      }

      var salt = makeSalt();
      return hashPass(pass, salt).then(function (h) {
        var user = {
          id: newId("U"),
          name: name,
          email: email,
          phone: phone,
          salt: salt,
          hash: h,
          at: Date.now()
        };
        var list = users();
        list.push(user);
        if (!write(USERS_KEY, list)) {
          return { ok: false, field: "pass", message: "Stockage local indisponible (navigation privée ?)." };
        }
        write(DATA_PREFIX + user.id, blankData());
        write(SESSION_KEY, { id: user.id, at: Date.now() });
        return { ok: true };
      });
    },

    login: function (email, pass) {
      if (!cryptoOk()) {
        return Promise.resolve({ ok: false, field: "pass",
          message: "Ce navigateur ne peut pas vérifier le mot de passe ici. Ouvrez le site via http://localhost." });
      }
      var user = findByEmail(email);
      if (!user) {
        return Promise.resolve({ ok: false, field: "email", message: "Aucun compte avec cette adresse." });
      }
      return hashPass(String(pass || ""), user.salt).then(function (h) {
        if (h !== user.hash) return { ok: false, field: "pass", message: "Mot de passe incorrect." };
        write(SESSION_KEY, { id: user.id, at: Date.now() });
        return { ok: true };
      });
    },

    logout: function () { drop(SESSION_KEY); },

    updateProfile: function (name, email, phone) {
      var me = Auth.current();
      if (!me) return { ok: false, message: "Session expirée." };
      name = String(name || "").trim();
      email = normEmail(email);
      phone = String(phone || "").trim();

      if (name.length < 2) return { ok: false, field: "name", message: "Indiquez votre nom." };
      if (!validEmail(email)) return { ok: false, field: "email", message: "Adresse e-mail invalide." };
      if (phone && !/^[+0-9 ]{6,20}$/.test(phone)) {
        return { ok: false, field: "phone", message: "Numéro invalide. Exemple : +221 77 148 20 36." };
      }
      var clash = findByEmail(email);
      if (clash && clash.id !== me.id) {
        return { ok: false, field: "email", message: "Cette adresse est déjà utilisée." };
      }
      var list = users().map(function (u) {
        if (u.id === me.id) { u.name = name; u.email = email; u.phone = phone; }
        return u;
      });
      write(USERS_KEY, list);
      return { ok: true };
    },

    changePass: function (currentPass, nextPass) {
      var me = Auth.current();
      if (!me) return Promise.resolve({ ok: false, message: "Session expirée." });
      if (String(nextPass || "").length < 8) {
        return Promise.resolve({ ok: false, field: "next", message: "Huit caractères minimum." });
      }
      var rec = findByEmail(me.email);
      return hashPass(String(currentPass || ""), rec.salt).then(function (h) {
        if (h !== rec.hash) return { ok: false, field: "current", message: "Mot de passe actuel incorrect." };
        var salt = makeSalt();
        return hashPass(nextPass, salt).then(function (nh) {
          var list = users().map(function (u) {
            if (u.id === me.id) { u.salt = salt; u.hash = nh; }
            return u;
          });
          write(USERS_KEY, list);
          return { ok: true };
        });
      });
    },

    destroy: function () {
      var me = Auth.current();
      if (!me) return;
      drop(DATA_PREFIX + me.id);
      write(USERS_KEY, users().filter(function (u) { return u.id !== me.id; }));
      drop(SESSION_KEY);
    },

    /* Renvoie vers la connexion si personne n'est identifié. */
    guard: function () {
      if (Auth.current()) return true;
      location.replace("compte.html?suite=" + encodeURIComponent(location.pathname.split("/").pop() || "mon-coffre.html"));
      return false;
    }
  };

  /* ---------- données du compte ---------- */

  function blankData() {
    return { vault: { balance: 0, goal: 0, goalRef: "", tx: [] }, addresses: [], orders: [] };
  }

  function dataKey() {
    var me = Auth.current();
    return me ? DATA_PREFIX + me.id : null;
  }

  function getData() {
    var k = dataKey();
    if (!k) return blankData();
    var d = read(k, null);
    if (!d || typeof d !== "object") d = blankData();
    if (!d.vault) d.vault = blankData().vault;
    if (!Array.isArray(d.vault.tx)) d.vault.tx = [];
    if (!Array.isArray(d.addresses)) d.addresses = [];
    if (!Array.isArray(d.orders)) d.orders = [];
    return d;
  }

  function setData(d) {
    var k = dataKey();
    if (k) write(k, d);
    return d;
  }

  var METHODS = {
    wave: "Wave",
    om: "Orange Money",
    carte: "Carte bancaire"
  };

  var Account = {
    methods: METHODS,
    minDeposit: MIN_DEPOSIT,
    maxDeposit: MAX_DEPOSIT,

    data: getData,

    vault: function () { return getData().vault; },

    /* Alimentation simulée : aucun paiement n'est déclenché. */
    deposit: function (amount, method) {
      amount = Math.floor(Number(amount));
      if (!isFinite(amount) || amount < MIN_DEPOSIT) {
        return { ok: false, message: "Montant minimum : " + MIN_DEPOSIT.toLocaleString("fr-FR") + " F." };
      }
      if (amount > MAX_DEPOSIT) {
        return { ok: false, message: "Montant maximum par versement : " + MAX_DEPOSIT.toLocaleString("fr-FR") + " F." };
      }
      if (!METHODS[method]) return { ok: false, message: "Choisissez un moyen de paiement." };

      var d = getData();
      d.vault.balance += amount;
      d.vault.tx.unshift({
        id: newId("V"),
        type: "depot",
        amount: amount,
        method: method,
        at: Date.now()
      });
      setData(d);
      return { ok: true, balance: d.vault.balance };
    },

    setGoal: function (amount, ref) {
      amount = Math.floor(Number(amount) || 0);
      if (amount < 0) amount = 0;
      if (amount > MAX_DEPOSIT * 5) return { ok: false, message: "Objectif trop élevé." };
      var d = getData();
      d.vault.goal = amount;
      d.vault.goalRef = ref || "";
      setData(d);
      return { ok: true };
    },

    /* ---------- adresses ---------- */

    addresses: function () { return getData().addresses; },

    defaultAddress: function () {
      var list = getData().addresses;
      for (var i = 0; i < list.length; i++) if (list[i].isDefault) return list[i];
      return list[0] || null;
    },

    saveAddress: function (addr) {
      var d = getData();
      if (!addr.label || !addr.zone || !addr.detail) {
        return { ok: false, message: "Libellé, zone et adresse sont obligatoires." };
      }
      if (addr.id) {
        d.addresses = d.addresses.map(function (a) { return a.id === addr.id ? addr : a; });
      } else {
        addr.id = newId("A");
        if (!d.addresses.length) addr.isDefault = true;
        d.addresses.push(addr);
      }
      if (addr.isDefault) {
        d.addresses.forEach(function (a) { a.isDefault = a.id === addr.id; });
      }
      setData(d);
      return { ok: true, id: addr.id };
    },

    removeAddress: function (id) {
      var d = getData();
      var wasDefault = d.addresses.some(function (a) { return a.id === id && a.isDefault; });
      d.addresses = d.addresses.filter(function (a) { return a.id !== id; });
      if (wasDefault && d.addresses.length) d.addresses[0].isDefault = true;
      setData(d);
    },

    setDefaultAddress: function (id) {
      var d = getData();
      d.addresses.forEach(function (a) { a.isDefault = a.id === id; });
      setData(d);
    },

    /* ---------- commandes ---------- */

    orders: function () { return getData().orders; },

    /* Débite le coffre et crée la commande. Renvoie {ok, order} ou {ok:false, message}. */
    payFromVault: function (lines, subtotal, shipping, address) {
      var d = getData();
      var total = subtotal + shipping;
      if (!lines.length) return { ok: false, message: "Votre panier est vide." };
      if (d.vault.balance < total) {
        return { ok: false, message: "Solde insuffisant.", missing: total - d.vault.balance };
      }
      var order = {
        id: newId("SV"),
        at: Date.now(),
        lines: lines,
        subtotal: subtotal,
        shipping: shipping,
        total: total,
        address: address || null
      };
      d.vault.balance -= total;
      d.vault.tx.unshift({
        id: newId("V"),
        type: "commande",
        amount: -total,
        orderId: order.id,
        at: Date.now()
      });
      d.orders.unshift(order);
      setData(d);
      return { ok: true, order: order };
    },

    /* Le suivi est déduit de l'ancienneté de la commande. C'est une simulation
       assumée : sans transporteur branché, il n'y a rien de réel à interroger. */
    status: function (order) {
      var h = (Date.now() - order.at) / 3600000;
      if (h < 2)  return { step: 0, label: "Commande reçue",  hint: "Nous préparons votre colis." };
      if (h < 24) return { step: 1, label: "En préparation",  hint: "Emballage à l'atelier du Point E." };
      if (h < 72) return { step: 2, label: "En livraison",    hint: "Le livreur vous appellera avant de passer." };
      return { step: 3, label: "Livrée", hint: "Merci, et bon voyage." };
    },
    steps: ["Commande reçue", "En préparation", "En livraison", "Livrée"]
  };

  /* ---------- lien de compte dans la barre ---------- */

  function paintNav() {
    var me = Auth.current();
    var links = document.querySelectorAll("[data-account-link]");
    Array.prototype.forEach.call(links, function (a) {
      if (me) {
        a.textContent = me.name.split(" ")[0];
        a.href = "mon-coffre.html";
        a.setAttribute("title", "Mon coffre et mes commandes");
      } else {
        a.textContent = "Compte";
        a.href = "compte.html";
        a.removeAttribute("title");
      }
    });
  }

  window.SV = window.SV || {};
  window.SV.Auth = Auth;
  window.SV.Account = Account;
  window.SV.Geo = Geo;
  window.SV.paintAccountNav = paintNav;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paintNav);
  else paintNav();
})();
