/**
 * File / DataTransfer helpers for attaching resume & cover letter.
 * Handles visible + hidden file inputs and Attach/Upload buttons
 * (Greenhouse / Ashby style).
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
   */
  function assignFilesToInput(input, files) {
    if (!input || String(input.type || '').toLowerCase() !== 'file') {
      return { ok: false, error: 'Not a file input' };
    }
    try {
      const list = Array.isArray(files) ? files : [files];
      const dt = new DataTransfer();
      list.forEach(function (f) {
        if (f) dt.items.add(f);
      });
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // Some frameworks listen for these
      try {
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      } catch (_e) {
        /* ignore */
      }
      return {
        ok: true,
        count: dt.files.length,
        hasFiles: !!(input.files && input.files.length)
      };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  function nearbyText(el) {
    const parts = [];
    if (!el) return '';
    parts.push(el.name || '', el.id || '', el.getAttribute('accept') || '');
    parts.push(el.getAttribute('aria-label') || '', el.getAttribute('data-testid') || '');
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach(function (id) {
        const n = document.getElementById(id);
        if (n) parts.push(n.textContent || '');
      });
    }
    const label = el.closest('label');
    if (label) parts.push(label.textContent || '');
    if (el.id) {
      const byFor = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (byFor) parts.push(byFor.textContent || '');
    }
    // Walk up a few ancestors for section headings / "Resume" text
    let node = el.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      const heading = node.querySelector(
        'label, legend, h1, h2, h3, h4, .label, [class*="label"], [class*="Label"]'
      );
      if (heading) parts.push(heading.textContent || '');
      const direct = Array.from(node.childNodes)
        .filter(function (c) {
          return c.nodeType === 3;
        })
        .map(function (c) {
          return c.textContent || '';
        })
        .join(' ');
      if (direct.trim()) parts.push(direct);
      node = node.parentElement;
    }
    return parts.join(' ').toLowerCase();
  }

  function classifyKind(meta, hintsList) {
    let kind = 'unknown';
    if (/cover\s*letter|coverletter|cover_letter/.test(meta)) kind = 'cover';
    else if (/resume|cv|curriculum|curriculum\s*vitae/.test(meta)) kind = 'resume';

    if (hintsList && hintsList.length) {
      for (let i = 0; i < hintsList.length; i++) {
        const h = hintsList[i];
        if (h && h.match && new RegExp(h.match, 'i').test(meta)) {
          kind = h.kind || kind;
        }
      }
    }
    return kind;
  }

  /**
   * Find all file inputs including hidden ones.
   */
  function findFileInputs(hints) {
    const hintsList = Array.isArray(hints) ? hints : [];
    const found = [];
    const seen = new Set();
    const all = document.querySelectorAll('input[type="file"]');
    all.forEach(function (el) {
      if (el.disabled) return;
      if (seen.has(el)) return;
      seen.add(el);
      const meta = nearbyText(el);
      let kind = classifyKind(meta, hintsList);

      if (hintsList.length) {
        for (let i = 0; i < hintsList.length; i++) {
          const h = hintsList[i];
          if (h && h.selector) {
            try {
              if (el.matches(h.selector)) kind = h.kind || kind;
              const matched = document.querySelector(h.selector);
              if (matched === el) kind = h.kind || kind;
            } catch (_e) {
              /* ignore */
            }
          }
        }
      }

      found.push({
        el: el,
        kind: kind,
        meta: meta,
        hidden:
          el.offsetParent === null ||
          el.style.display === 'none' ||
          el.style.visibility === 'hidden' ||
          el.getAttribute('hidden') != null ||
          (el.className && /hidden|sr-only|visually-hidden/i.test(String(el.className)))
      });
    });
    return found;
  }

  /**
   * Find Attach / Upload buttons near Resume / Cover labels.
   */
  function findAttachButtons() {
    const buttons = [];
    const candidates = document.querySelectorAll(
      'button, a, [role="button"], label, div[class*="attach"], span[class*="attach"]'
    );
    candidates.forEach(function (el) {
      const text = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || ''))
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (!text) return;
      const isAttach =
        /\battach\b|\bupload\b|\bchoose file\b|\bbrowse\b|\bselect file\b/.test(text) ||
        (/resume|cv|cover/.test(text) && /attach|upload|file/.test(text));
      if (!isAttach) return;
      // Skip final submit buttons
      if (/\bsubmit\b|\bapply\b|\bnext\b|\bcontinue\b/.test(text) && !/attach|upload|file/.test(text)) {
        return;
      }
      const meta = nearbyText(el) + ' ' + text;
      const kind = classifyKind(meta, []);
      buttons.push({ el: el, kind: kind, text: text, meta: meta });
    });
    return buttons;
  }

  /**
   * After clicking an Attach button, look for a newly revealed or associated file input.
   */
  function findInputNear(el) {
    if (!el) return null;
    // Child / sibling file input
    let input = el.querySelector && el.querySelector('input[type="file"]');
    if (input) return input;
    if (el.control && el.control.type === 'file') return el.control;
    const parent = el.closest('label, div, section, li, fieldset, form') || el.parentElement;
    if (parent) {
      input = parent.querySelector('input[type="file"]');
      if (input) return input;
    }
    // Greenhouse often puts a hidden input as previous/next sibling container
    let sib = el.parentElement;
    for (let i = 0; i < 4 && sib; i++) {
      input = sib.querySelector('input[type="file"]');
      if (input) return input;
      sib = sib.parentElement;
    }
    return null;
  }

  function makeFile(doc, fallbackName) {
    if (!doc || !doc.base64) return null;
    return fileFromBase64(doc.base64, doc.name || fallbackName, doc.mime || 'application/pdf');
  }

  /**
   * Attach stored document blobs to matching file inputs.
   * Prefers DataTransfer on underlying input[type=file]; clicks Attach buttons
   * only to reveal inputs when needed.
   */
  function attachDocuments(documents, hints) {
    documents = documents || {};
    const hintsList = Array.isArray(hints) ? hints : [];
    const resumeFile = makeFile(documents.resume, 'resume.pdf');
    const coverFile = makeFile(documents.cover, 'cover-letter.pdf');

    const attached = [];
    const errors = [];
    let resumeAttached = false;
    let coverAttached = false;

    function tryAssign(input, file, kind) {
      if (!input || !file) return false;
      // Avoid double-assigning same input
      if (attached.some(function (a) { return a.el === input; })) return false;
      const result = assignFilesToInput(input, file);
      if (result.ok && result.hasFiles !== false) {
        attached.push({ kind: kind, name: file.name, el: input });
        if (kind === 'resume') resumeAttached = true;
        if (kind === 'cover') coverAttached = true;
        return true;
      }
      errors.push((result && result.error) || 'attach failed for ' + kind);
      return false;
    }

    // 1) Direct file inputs (including hidden)
    const inputs = findFileInputs(hintsList);
    inputs.forEach(function (item) {
      let file = null;
      let kind = item.kind;
      if (kind === 'resume' && resumeFile) file = resumeFile;
      else if (kind === 'cover' && coverFile) file = coverFile;
      else if (kind === 'unknown' && resumeFile && !resumeAttached) {
        file = resumeFile;
        kind = 'resume';
      }
      if (file) tryAssign(item.el, file, kind);
    });

    // 2) Attach/Upload buttons — click to reveal, then assign
    if ((resumeFile && !resumeAttached) || (coverFile && !coverAttached)) {
      const buttons = findAttachButtons();
      buttons.forEach(function (btn) {
        let kind = btn.kind;
        let file = null;
        if (kind === 'cover' && coverFile && !coverAttached) file = coverFile;
        else if (kind === 'resume' && resumeFile && !resumeAttached) file = resumeFile;
        else if (kind === 'unknown') {
          if (resumeFile && !resumeAttached) {
            file = resumeFile;
            kind = 'resume';
          } else if (coverFile && !coverAttached) {
            file = coverFile;
            kind = 'cover';
          }
        }
        if (!file) return;

        let input = findInputNear(btn.el);
        if (!input) {
          try {
            btn.el.click();
          } catch (_e) {
            /* ignore */
          }
          input = findInputNear(btn.el);
          // Also re-scan all file inputs
          if (!input) {
            const after = findFileInputs(hintsList);
            for (let i = 0; i < after.length; i++) {
              if (
                (kind === 'resume' && after[i].kind === 'resume') ||
                (kind === 'cover' && after[i].kind === 'cover') ||
                after[i].kind === 'unknown'
              ) {
                if (!attached.some(function (a) { return a.el === after[i].el; })) {
                  input = after[i].el;
                  break;
                }
              }
            }
          }
        }
        if (input) tryAssign(input, file, kind);
      });
    }

    // 3) Last resort: any remaining unattached file inputs get resume then cover
    if (resumeFile && !resumeAttached) {
      const leftover = findFileInputs(hintsList);
      for (let i = 0; i < leftover.length; i++) {
        if (tryAssign(leftover[i].el, resumeFile, 'resume')) break;
      }
    }
    if (coverFile && !coverAttached) {
      const leftover = findFileInputs(hintsList);
      for (let i = 0; i < leftover.length; i++) {
        if (
          leftover[i].kind === 'cover' ||
          leftover[i].kind === 'unknown'
        ) {
          if (tryAssign(leftover[i].el, coverFile, 'cover')) break;
        }
      }
    }

    const publicAttached = attached.map(function (a) {
      return { kind: a.kind, name: a.name };
    });

    return {
      ok: errors.length === 0,
      attached: publicAttached,
      errors: errors,
      inputCount: inputs.length,
      resumeAttached: resumeAttached,
      coverAttached: coverAttached
    };
  }

  global.FillApplyFiles = {
    base64ToUint8Array,
    arrayBufferToBase64,
    blobToBase64,
    fileFromBase64,
    fileFromArrayBuffer,
    assignFilesToInput,
    findFileInputs,
    findAttachButtons,
    attachDocuments
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
