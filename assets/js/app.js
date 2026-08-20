/* Sen Valise - shared runtime: theme, nav, cart, drawer, reveals, toasts. */
(function () {
  "use strict";

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var PRODUCTS = window.SV_PRODUCTS || [];
  var COLORWAYS = window.SV_COLORWAYS || {};

  /* ---------- helpers ---------- */

  function money(n) {
    return new Intl.NumberFormat("fr-FR").format(n) + " F";
  }

  function icon(name, cls) {
    return '<svg class="ico ' + (cls || "") + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function findProduct(ref) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].ref === ref) return PRODUCTS[i];
    return null;
  }

  /* Fusion, pas remplacement : account.js est chargé avant ce fichier et a déjà
     posé SV.Auth. boot() part dès l'exécution de ce script, donc tout module qui
     doit exister au moment de SV_PAGE doit être chargé avant lui. */
  window.SV = window.SV || {};
  window.SV.money = money;
  window.SV.icon = icon;
  window.SV.findProduct = findProduct;
  window.SV.$ = $;
  window.SV.$$ = $$;

  /* ---------- theme ---------- */

  var THEME_KEY = "sv.theme";

  function readTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }

  function currentTheme() {
    var stored = readTheme();
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  applyTheme(readTheme());

  function initTheme() {
    $$("[data-theme-toggle]").forEach(function (btn) {
      function paint() {
        var dark = currentTheme() === "dark";
        btn.innerHTML = icon(dark ? "sun" : "moon");
        btn.setAttribute("aria-label", dark ? "Passer en thème clair" : "Passer en thème sombre");
      }
      paint();
      btn.addEventListener("click", function () {
        var next = currentTheme() === "dark" ? "light" : "dark";
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        applyTheme(next);
        $$("[data-theme-toggle]").forEach(function (b) {
          var d = currentTheme() === "dark";
          b.innerHTML = icon(d ? "sun" : "moon");
          b.setAttribute("aria-label", d ? "Passer en thème clair" : "Passer en thème sombre");
        });
      });
    });
  }

  /* ---------- cart store ---------- */

  var CART_KEY = "sv.cart";
  var listeners = [];

  function readCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
    listeners.forEach(function (fn) { fn(items); });
  }

  var Cart = {
    items: function () { return readCart(); },
    count: function () {
      return readCart().reduce(function (n, l) { return n + l.qty; }, 0);
    },
    subtotal: function () {
      return readCart().reduce(function (n, l) {
        var p = findProduct(l.ref);
        return p ? n + p.price * l.qty : n;
      }, 0);
    },
    add: function (ref, color, qty) {
      var items = readCart();
      var key = ref + "|" + color;
      var hit = null;
      for (var i = 0; i < items.length; i++) if (items[i].ref + "|" + items[i].color === key) hit = items[i];
      if (hit) hit.qty = Math.min(hit.qty + (qty || 1), 12);
      else items.push({ ref: ref, color: color, qty: qty || 1 });
      writeCart(items);
    },
    setQty: function (ref, color, qty) {
      var items = readCart().map(function (l) {
        if (l.ref === ref && l.color === color) l.qty = Math.max(0, Math.min(qty, 12));
        return l;
      }).filter(function (l) { return l.qty > 0; });
      writeCart(items);
    },
    remove: function (ref, color) {
      writeCart(readCart().filter(function (l) { return !(l.ref === ref && l.color === color); }));
    },
    clear: function () { writeCart([]); },
    onChange: function (fn) { listeners.push(fn); }
  };

  window.SV.Cart = Cart;

  /* ---------- toasts ---------- */

  function toast(message) {
    var stack = $(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    var el = document.createElement("div");
    el.className = "toast glass";
    el.innerHTML = icon("seal-check") + "<span>" + message + "</span>";
    stack.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  window.SV.toast = toast;

  /* ---------- nav ---------- */

  function initNav() {
    var nav = $(".nav");
    var sentinel = $(".nav-sentinel");
    if (nav && sentinel && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        nav.classList.toggle("is-stuck", !entries[0].isIntersecting);
      }, { threshold: 0 }).observe(sentinel);
    } else if (nav) {
      nav.classList.add("is-stuck");
    }

    var burger = $("[data-burger]");
    var menu = $(".mobile-menu");
    if (burger && menu) {
      burger.addEventListener("click", function () {
        var open = menu.classList.toggle("is-open");
        burger.setAttribute("aria-expanded", String(open));
        burger.innerHTML = icon(open ? "x" : "list");
      });
      menu.addEventListener("click", function (e) {
        if (e.target.tagName === "A") {
          menu.classList.remove("is-open");
          burger.setAttribute("aria-expanded", "false");
          burger.innerHTML = icon("list");
        }
      });
    }
  }

  /* ---------- cart drawer ---------- */

  var lastFocus = null;

  function drawerMarkup() {
    return '' +
      '<div class="scrim" data-close-drawer></div>' +
      '<aside class="drawer glass" role="dialog" aria-modal="true" aria-label="Panier" tabindex="-1">' +
        '<div class="drawer__head">' +
          '<h2>Panier</h2>' +
          '<button class="icon-btn" data-close-drawer aria-label="Fermer le panier">' + icon("x") + '</button>' +
        '</div>' +
        '<div class="drawer__body" data-drawer-body></div>' +
        '<div class="drawer__foot" data-drawer-foot></div>' +
      '</aside>';
  }

  function lineMarkup(l) {
    var p = findProduct(l.ref);
    if (!p) return "";
    var c = COLORWAYS[l.color] || { name: "" };
    return '' +
      '<div class="line">' +
        '<img class="line__img" src="' + p.img + '" alt="' + p.name + '" loading="lazy">' +
        '<div class="line__info">' +
          '<b>' + p.name + '</b>' +
          '<span>' + c.name + '</span>' +
          '<span class="num">' + money(p.price) + '</span>' +
        '</div>' +
        '<div class="line__end">' +
          '<span class="line__price num">' + money(p.price * l.qty) + '</span>' +
          '<div class="stepper">' +
            '<button data-qty="-1" data-ref="' + l.ref + '" data-color="' + l.color + '" aria-label="Retirer un ' + p.name + '">' + icon("minus") + '</button>' +
            '<output class="num">' + l.qty + '</output>' +
            '<button data-qty="1" data-ref="' + l.ref + '" data-color="' + l.color + '" aria-label="Ajouter un ' + p.name + '">' + icon("plus") + '</button>' +
          '</div>' +
          '<button class="body-sm" data-remove data-ref="' + l.ref + '" data-color="' + l.color + '" style="display:flex;align-items:center;gap:.3rem">' +
            icon("trash") + 'Retirer</button>' +
        '</div>' +
      '</div>';
  }

  function emptyMarkup(cta) {
    return '' +
      '<div class="empty">' +
        '<div class="empty__icon">' + icon("shopping-bag-open") + '</div>' +
        '<h3>Votre panier est vide</h3>' +
        '<p>Choisissez un format dans la boutique, il apparaîtra ici.</p>' +
        (cta ? '<a class="btn btn--primary btn--sm" href="boutique.html">Voir la boutique</a>' : "") +
      '</div>';
  }

  window.SV.lineMarkup = lineMarkup;
  window.SV.emptyMarkup = emptyMarkup;

  /* ---------- product card ---------- */

  /* opts.flag overrides the catalogue flag, opts.flagKind adds a modifier class
     so a rank pill can be solid while the default flag stays frosted. */
  function cardMarkup(p, delay, opts) {
    opts = opts || {};
    var flag = opts.flag !== undefined ? opts.flag : p.flag;
    var flagCls = "card__flag" + (opts.flagKind ? " card__flag--" + opts.flagKind : " glass");
    var swatches = p.colors.map(function (c) {
      var cw = COLORWAYS[c];
      return '<span class="swatch" style="background:' + cw.hex + '" title="' + cw.name + '"></span>';
    }).join("");
    return '' +
      '<article class="card reveal" style="--d:' + (delay || 0) + 'ms">' +
        '<a class="card__media" href="produit.html?ref=' + p.ref + '" aria-label="' + p.name + ', ' + p.tag + '">' +
          '<img src="' + p.img + '" alt="' + p.name + ' en ' + (COLORWAYS[p.colors[0]] || {}).name + '" width="600" height="600" loading="lazy">' +
          (flag ? '<span class="' + flagCls + '">' + flag + '</span>' : "") +
        '</a>' +
        '<div class="card__body">' +
          '<div class="card__title">' +
            '<h3><a href="produit.html?ref=' + p.ref + '">' + p.name + '</a></h3>' +
            '<span class="card__price num">' + money(p.price) + '</span>' +
          '</div>' +
          '<p class="card__meta">' + p.tag + ', ' + p.volume + " L, " + String(p.weight).replace(".", ",") + ' kg</p>' +
          '<div class="swatches">' + swatches + '</div>' +
        '</div>' +
        '<div class="card__actions">' +
          '<button class="btn btn--ghost btn--sm btn--block" data-add="' + p.ref + '" data-color="' + p.colors[0] + '">' +
            icon("plus") + '<span class="btn-label">Ajouter au panier</span></button>' +
        '</div>' +
      '</article>';
  }

  function skeletonMarkup(n) {
    var one = '<div class="skeleton"><div class="skeleton__block skeleton__media"></div>' +
      '<div class="skeleton__body"><div class="skeleton__block skeleton__line"></div>' +
      '<div class="skeleton__block skeleton__line is-short"></div></div></div>';
    return new Array(n + 1).join(one);
  }

  window.SV.cardMarkup = cardMarkup;
  window.SV.skeletonMarkup = skeletonMarkup;

  function renderDrawer() {
    var body = $("[data-drawer-body]");
    var foot = $("[data-drawer-foot]");
    if (!body || !foot) return;
    var items = Cart.items();
    if (!items.length) {
      body.innerHTML = emptyMarkup(true);
      foot.innerHTML = "";
      return;
    }
    body.innerHTML = items.map(lineMarkup).join("");
    var sub = Cart.subtotal();
    foot.innerHTML = '' +
      '<div class="totals">' +
        '<div><span>Sous-total</span><span class="num">' + money(sub) + '</span></div>' +
        '<div><span>Livraison Dakar</span><span>Offerte</span></div>' +
      '</div>' +
      '<a class="btn btn--primary btn--block" href="panier.html">Voir le panier</a>';
  }

  function openDrawer() {
    var scrim = $(".scrim"), drawer = $(".drawer");
    if (!scrim || !drawer) return;
    lastFocus = document.activeElement;
    renderDrawer();
    scrim.classList.add("is-open");
    drawer.classList.add("is-open");
    document.body.style.overflow = "hidden";
    drawer.focus();
  }

  function closeDrawer() {
    var scrim = $(".scrim"), drawer = $(".drawer");
    if (!scrim || !drawer) return;
    scrim.classList.remove("is-open");
    drawer.classList.remove("is-open");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  window.SV.openDrawer = openDrawer;

  function initDrawer() {
    if (!$(".drawer")) {
      var host = document.createElement("div");
      host.innerHTML = drawerMarkup();
      while (host.firstChild) document.body.appendChild(host.firstChild);
    }

    document.addEventListener("click", function (e) {
      var t = e.target;

      if (t.closest("[data-open-cart]")) { e.preventDefault(); openDrawer(); return; }
      if (t.closest("[data-close-drawer]")) { closeDrawer(); return; }

      var q = t.closest("[data-qty]");
      if (q) {
        var line = Cart.items().filter(function (l) {
          return l.ref === q.dataset.ref && l.color === q.dataset.color;
        })[0];
        if (line) Cart.setQty(q.dataset.ref, q.dataset.color, line.qty + parseInt(q.dataset.qty, 10));
        return;
      }

      var rm = t.closest("[data-remove]");
      if (rm) { Cart.remove(rm.dataset.ref, rm.dataset.color); return; }

      var add = t.closest("[data-add]");
      if (add) {
        e.preventDefault();
        var p = findProduct(add.dataset.add);
        if (!p) return;
        Cart.add(p.ref, add.dataset.color || p.colors[0], 1);
        toast(p.name + " ajoutée au panier");
        openDrawer();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawer();
    });

    Cart.onChange(function () {
      renderDrawer();
      paintCount();
    });
  }

  function paintCount() {
    var n = Cart.count();
    $$("[data-cart-count]").forEach(function (el) {
      el.textContent = n;
      el.classList.toggle("is-on", n > 0);
    });
  }

  /* ---------- scroll reveals ---------- */

  function initReveals() {
    var els = $$(".reveal");
    if (!els.length) return;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- boot ---------- */

  function boot() {
    // Le theme et la navigation ne dependent de rien : on les pose tout de
    // suite pour eviter un ecran nu pendant l'aller-retour reseau.
    initTheme();
    initNav();
    initDrawer();

    // Le catalogue et la session viennent de l'API. SV_PAGE lit SV_PRODUCTS
    // et SV.Auth.current() des sa premiere ligne : il ne doit tourner
    // qu'une fois les deux charges.
    document.documentElement.classList.add("is-loading");
    Promise.all([SV.Catalog.load(), SV.Session.hydrate()]).then(function () {
      document.documentElement.classList.remove("is-loading");
      if (!SV.Catalog.loaded && SV.Catalog.error) SV.toast(SV.Catalog.error);
      initReveals();
      paintCount();
      if (typeof window.SV_PAGE === "function") window.SV_PAGE();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
