/*
 * Apex embed widget. A business pastes:
 *   <script src="https://<your-domain>/widget.js" data-tenant-id="THEIR-TENANT-ID"></script>
 * on their own website. Injects a floating "Get a Quote" button; submitting
 * the form POSTs to /api/embed/lead on THIS domain (Apex's), not theirs --
 * cross-origin by design, since the whole point is running on someone
 * else's site. Vanilla JS, no dependencies, no build step: this has to work
 * unmodified on any host site regardless of their stack.
 */
(function () {
  var scriptTag = document.currentScript;
  var tenantId = scriptTag && scriptTag.getAttribute('data-tenant-id');
  if (!tenantId) {
    console.error('[Apex widget] Missing data-tenant-id on the script tag -- widget not loaded.');
    return;
  }

  // The origin this script itself was loaded from is always Apex's domain,
  // regardless of what site it's embedded on -- so the API call target
  // doesn't need to be hardcoded or configured separately.
  var apiOrigin = new URL(scriptTag.src).origin;

  var css =
    '.apex-widget-btn{position:fixed;bottom:20px;right:20px;z-index:999999;' +
    'background:#0f172a;color:#fff;border:none;border-radius:9999px;' +
    'padding:14px 22px;font:600 14px system-ui,sans-serif;cursor:pointer;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.25);}' +
    '.apex-widget-panel{position:fixed;bottom:80px;right:20px;z-index:999999;' +
    'width:300px;max-width:calc(100vw - 40px);background:#fff;border-radius:12px;' +
    'box-shadow:0 8px 30px rgba(0,0,0,.25);padding:20px;font:14px system-ui,sans-serif;' +
    'display:none;}' +
    '.apex-widget-panel.open{display:block;}' +
    '.apex-widget-panel h3{margin:0 0 12px;font-size:16px;color:#0f172a;}' +
    '.apex-widget-panel input,.apex-widget-panel textarea{width:100%;box-sizing:border-box;' +
    'margin-bottom:8px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;}' +
    '.apex-widget-panel button.submit{width:100%;background:#0f172a;color:#fff;border:none;' +
    'border-radius:6px;padding:10px;font:600 14px system-ui,sans-serif;cursor:pointer;}' +
    '.apex-widget-close{position:absolute;top:10px;right:14px;background:none;border:none;' +
    'font-size:18px;cursor:pointer;color:#64748b;}' +
    '.apex-widget-status{margin-top:8px;font-size:13px;}';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var btn = document.createElement('button');
  btn.className = 'apex-widget-btn';
  btn.textContent = 'Get a Quote';

  var panel = document.createElement('div');
  panel.className = 'apex-widget-panel';
  panel.style.position = 'fixed';
  panel.innerHTML =
    '<button class="apex-widget-close" aria-label="Close">×</button>' +
    '<h3>Get a Quote</h3>' +
    '<form>' +
    '<input type="text" name="name" placeholder="Your name" required>' +
    '<input type="tel" name="phone" placeholder="Phone number" required>' +
    '<textarea name="message" placeholder="What do you need done?" rows="3"></textarea>' +
    '<label style="display:block;font-size:12px;color:#64748b;margin-bottom:4px">' +
    'Add photos for an instant AI price estimate (optional)</label>' +
    '<input type="file" name="photos" accept="image/*" multiple style="margin-bottom:8px">' +
    // Honeypot: real visitors never see this (off-screen, not display:none
    // -- some bots skip fields hidden that way). tabindex/autocomplete keep
    // it out of the way for keyboard nav and password managers.
    '<input type="text" name="website" tabindex="-1" autocomplete="off"' +
    ' style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">' +
    '<button type="submit" class="submit">Send</button>' +
    '<div class="apex-widget-status"></div>' +
    '</form>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  btn.addEventListener('click', function () {
    panel.classList.toggle('open');
  });
  panel.querySelector('.apex-widget-close').addEventListener('click', function () {
    panel.classList.remove('open');
  });

  panel.querySelector('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var status = panel.querySelector('.apex-widget-status');
    var submitBtn = form.querySelector('.submit');
    var photoFiles = form.photos && form.photos.files ? form.photos.files : [];

    submitBtn.disabled = true;

    if (photoFiles.length > 0) {
      // Photos attached: get an instant AI price estimate instead of a
      // plain callback-later lead. Real per-request cost on our end, so
      // this hits a separate, tighter-rate-limited endpoint.
      status.textContent = 'Analyzing your photos...';
      status.style.color = '#64748b';

      var fd = new FormData();
      fd.append('tenantId', tenantId);
      fd.append('name', form.name.value);
      fd.append('phone', form.phone.value);
      fd.append('message', form.message.value);
      fd.append('website', form.website.value);
      for (var i = 0; i < photoFiles.length; i++) {
        fd.append('photos', photoFiles[i]);
      }

      fetch(apiOrigin + '/api/embed/quote', { method: 'POST', body: fd })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok) {
            var dollars = (result.data.suggestedPriceCents / 100).toFixed(0);
            status.textContent =
              'Estimated price: $' + dollars + ". We'll follow up to confirm and schedule.";
            status.style.color = '#16a34a';
            form.reset();
          } else {
            status.textContent = result.data.error || 'Something went wrong -- please try again.';
            status.style.color = '#dc2626';
          }
        })
        .catch(function () {
          status.textContent = 'Something went wrong -- please try again.';
          status.style.color = '#dc2626';
        })
        .finally(function () {
          submitBtn.disabled = false;
        });
      return;
    }

    status.textContent = 'Sending...';
    status.style.color = '#64748b';

    fetch(apiOrigin + '/api/embed/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenantId,
        name: form.name.value,
        phone: form.phone.value,
        message: form.message.value,
        website: form.website.value,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          status.textContent = "Thanks! We'll be in touch shortly.";
          status.style.color = '#16a34a';
          form.reset();
        } else {
          status.textContent = result.data.error || 'Something went wrong -- please try again.';
          status.style.color = '#dc2626';
        }
      })
      .catch(function () {
        status.textContent = 'Something went wrong -- please try again.';
        status.style.color = '#dc2626';
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
})();
