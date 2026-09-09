/**
 * File / DataTransfer helpers for attaching resume & cover letter to
 * input[type=file]. Blobs typically come from chrome.storage (base64) or
 * a backend getDocuments() response — not from a hardcoded disk path
 * (browsers block that).
 *
 * Attaches API to globalThis.FillApplyFiles.
 */
(function (global) {
  'use strict';

  function base64ToUint8Array(base64) {
    const cleaned = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
    const binary = atob(cleaned);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = String(reader.result || '');
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = function () {
        reject(reader.error || new Error('FileReader failed'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function fileFromBase64(base64, name, mime) {
    const bytes = base64ToUint8Array(base64);
    const type = mime || 'application/octet-stream';
    const blob = new Blob([bytes], { type: type });
    try {
      return new File([blob], name || 'document.bin', { type: type });
    } catch (e) {
      // Older environments: Blob with name property is often enough for DataTransfer
      blob.name = name || 'document.bin';
      return blob;
    }
  }

  function fileFromArrayBuffer(buffer, name, mime) {
    const type = mime || 'application/octet-stream';
    const blob = new Blob([buffer], { type: type });
    try {
      return new File([blob], name || 'document.bin', { type: type });
    } catch (e) {
      blob.name = name || 'document.bin';
      return blob;
    }
  }

  /**
   * Assign one or more File/Blob objects to an <input type="file"> via DataTransfer.
   * Dispatches input/change so frameworks notice.
   */
  function assignFilesToInput(input, files) {
    if (!input || String(input.type || '').toLowerCase() !== 'file') {
      return { ok: false, error: 'Not a file input' };
    }
    const list = Array.isArray(files) ? files : [files];
    const dt = new DataTransfer();
    list.forEach(function (f) {
      if (f) dt.items.add(f);
    });
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, count: dt.files.length };
  }

  function findFileInputs(hints) {
    const hintsList = Array.isArray(hints) ? hints : [];
    const found = [];
    const all = document.querySelectorAll('input[type="file"]');
    all.forEach(function (el) {
      if (el.disabled) return;
      const meta = [
        el.name || '',
        el.id || '',
        el.getAttribute('accept') || '',
        el.getAttribute('aria-label') || '',
        (el.closest('label') && el.closest('label').textContent) || ''
      ]
        .join(' ')
        .toLowerCase();

      let kind = 'unknown';
      if (/resume|cv|curriculum/.test(meta)) kind = 'resume';
      else if (/cover|letter/.test(meta)) kind = 'cover';

      if (hintsList.length) {
        for (let i = 0; i < hintsList.length; i++) {
          const h = hintsList[i];
          if (h && h.selector) {
            try {
              if (el.matches(h.selector) || (h.selector && document.querySelector(h.selector) === el)) {
                kind = h.kind || kind;
              }
            } catch (_e) {
              /* ignore bad selectors */
            }
          }
          if (h && h.match && new RegExp(h.match, 'i').test(meta)) {
            kind = h.kind || kind;
          }
        }
      }

      found.push({ el: el, kind: kind, meta: meta });
    });
    return found;
  }

  /**
   * Attach stored document blobs (resume/cover with base64) to matching file inputs.
   */
  function attachDocuments(documents, hints) {
    documents = documents || {};
    const inputs = findFileInputs(hints);
    const attached = [];
    const errors = [];

    function makeFile(doc, fallbackName) {
      if (!doc || !doc.base64) return null;
      return fileFromBase64(doc.base64, doc.name || fallbackName, doc.mime || 'application/pdf');
    }

    const resumeFile = makeFile(documents.resume, 'resume.pdf');
    const coverFile = makeFile(documents.cover, 'cover-letter.pdf');

    inputs.forEach(function (item) {
      let file = null;
      if (item.kind === 'resume' && resumeFile) file = resumeFile;
      else if (item.kind === 'cover' && coverFile) file = coverFile;
      else if (item.kind === 'unknown' && resumeFile && !attached.some(function (a) { return a.kind === 'resume'; })) {
        file = resumeFile;
        item.kind = 'resume';
      }
      if (!file) return;
      const result = assignFilesToInput(item.el, file);
      if (result.ok) {
        attached.push({ kind: item.kind, name: file.name });
      } else {
        errors.push(result.error || 'attach failed');
      }
    });

    return { ok: errors.length === 0, attached: attached, errors: errors, inputCount: inputs.length };
  }

  global.FillApplyFiles = {
    base64ToUint8Array,
    arrayBufferToBase64,
    blobToBase64,
    fileFromBase64,
    fileFromArrayBuffer,
    assignFilesToInput,
    findFileInputs,
    attachDocuments
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
