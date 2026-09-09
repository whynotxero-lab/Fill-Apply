/**
 * Demo form submit handler (external file — extension CSP forbids inline scripts).
 */
(function () {
  'use strict';
  var form = document.getElementById('appForm');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(e.target);
    var obj = {};
    data.forEach(function (v, k) {
      obj[k] = v instanceof File ? v.name || '(file)' : v;
    });
    var log = document.getElementById('log');
    if (log) {
      log.textContent = 'Demo submit captured (not sent):\n' + JSON.stringify(obj, null, 2);
    }
  });
})();
