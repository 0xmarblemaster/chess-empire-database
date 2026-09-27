/* Chess Empire — shared behaviour (no dependencies). */
window.CHESS_EMPIRE_CONFIG = window.CHESS_EMPIRE_CONFIG || {
  whatsapp: '77771234567' // TODO: real WhatsApp number, digits only
};

/**
 * Lead handler. Replace this function to send leads to your CRM / Telegram bot / email service.
 * Must return a Promise. `lead` = { name, phone, branch, branchId, time, timeId, lang, page }.
 * Default: opens WhatsApp with a prefilled message.
 */
window.submitLead = window.submitLead || function (lead) {
  var form = document.querySelector('.trial-form');
  var L = JSON.parse(form.getAttribute('data-wa'));
  var text = [L.greeting, L.name + ': ' + lead.name, L.phone + ': ' + lead.phone, L.branch + ': ' + lead.branch, L.time + ': ' + lead.time].join('\n');
  window.open('https://wa.me/' + window.CHESS_EMPIRE_CONFIG.whatsapp + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
  return Promise.resolve();
};

(function () {
  var d = document;

  // Mobile navigation
  var burger = d.querySelector('.burger');
  var nav = d.getElementById('main-nav');
  function setNav(open) {
    if (!burger || !nav) return;
    burger.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    d.body.classList.toggle('nav-open', open);
  }
  if (burger && nav) {
    burger.addEventListener('click', function () { setNav(burger.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
    window.matchMedia('(min-width: 1121px)').addEventListener('change', function (m) { if (m.matches) setNav(false); });
  }

  // FAQ: keep one answer open at a time
  var items = d.querySelectorAll('.faq details');
  items.forEach(function (el) {
    el.addEventListener('toggle', function () {
      if (!el.open) return;
      items.forEach(function (o) { if (o !== el) o.open = false; });
    });
  });

  // Phone mask: +7 (777) 123-45-67
  var phone = d.querySelector('.trial-form input[type="tel"]');
  function fmt(v) {
    var x = v.replace(/\D/g, '');
    if (!x) return '';
    if (x[0] === '8') x = '7' + x.slice(1);
    if (x[0] !== '7') x = '7' + x;
    var p = x.slice(1, 11), s = '+7';
    if (p.length) s += ' (' + p.slice(0, 3);
    if (p.length >= 3) s += ') ' + p.slice(3, 6);
    if (p.length >= 6) s += '-' + p.slice(6, 8);
    if (p.length >= 8) s += '-' + p.slice(8, 10);
    return s;
  }
  if (phone) {
    phone.addEventListener('input', function () { phone.value = fmt(phone.value); phone.setCustomValidity(''); });
  }

  // Trial form
  var form = d.querySelector('.trial-form');
  if (form) {
    var status = form.querySelector('.form-status');
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var digits = (phone.value || '').replace(/\D/g, '');
      phone.setCustomValidity(digits.length === 11 ? '' : form.getAttribute('data-msg-phone'));
      if (!form.reportValidity()) { status.textContent = form.getAttribute('data-msg-error'); return; }
      var sel = function (n) { var s = form.elements[n]; return s.options[s.selectedIndex].text; };
      var lead = {
        name: form.elements.name.value.trim(), phone: phone.value,
        branch: sel('branch'), branchId: form.elements.branch.value,
        time: sel('time'), timeId: form.elements.time.value,
        lang: d.documentElement.lang, page: location.href
      };
      btn.disabled = true;
      Promise.resolve(window.submitLead(lead)).then(function () {
        status.textContent = form.getAttribute('data-msg-ok');
        form.reset();
      }).catch(function () {
        status.textContent = form.getAttribute('data-msg-error');
      }).then(function () { btn.disabled = false; });
    });
  }
})();
