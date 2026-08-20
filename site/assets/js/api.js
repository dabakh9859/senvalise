/* Sen Valise - couche reseau.
   Le site n'est plus autonome : le catalogue, les comptes, le coffre et les
   commandes viennent de l'API de gestion. La boutique et l'API sont servies
   par le meme nginx, donc les appels sont relatifs et il n'y a pas de CORS.

   A charger avant data.js et account.js. */
(function () {
  "use strict";

  var SV = window.SV = window.SV || {};
  var TOKEN_KEY = "sv.token";

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function setToken(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* navigation privee : la session ne survivra pas au rechargement */ }
  }

  /* Toutes les reponses passent par ici pour que les pages n'aient jamais a
     manipuler des codes HTTP : on rend { ok, data, message } comme le faisait
     l'ancienne version locale. */
  function request(method, path, body) {
    var init = { method: method, headers: {} };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    var t = token();
    if (t) init.headers.Authorization = "Bearer " + t;

    return fetch("/api/shop" + path, init).then(function (r) {
      if (r.status === 204) return { ok: true, data: null };
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.ok) return { ok: true, data: data };
        if (r.status === 401 && t) {
          // Jeton expire ou revoque : on repart proprement en visiteur.
          setToken("");
          if (SV.Auth && SV.Auth.onSignedOut) SV.Auth.onSignedOut();
        }
        return { ok: false, status: r.status, message: data.error || "Le service est momentanément indisponible." };
      });
    }).catch(function () {
      return { ok: false, status: 0, message: "Connexion au serveur impossible. Réessayez dans un instant." };
    });
  }

  SV.Api = {
    token: token,
    setToken: setToken,
    get: function (p) { return request("GET", p); },
    post: function (p, b) { return request("POST", p, b); },
    put: function (p, b) { return request("PUT", p, b); },
    del: function (p) { return request("DELETE", p); }
  };
})();
