/**
 * Application report builder + minimal PDF writer (no external deps).
 * Used after successful Submit-mode applies for audit trail.
 */
(function (global) {
  'use strict';

  const REPORTS_KEY = 'fillApply.reports';
  const MAX_REPORTS = 40;
  const MAX_FIELD_VALUE = 500;

  function safeStr(v, max) {
    max = max || MAX_FIELD_VALUE;
    let s = v == null ? '' : String(v);
    s = s.replace(/\s+/g, ' ').trim();
    if (s.length > max) s = s.slice(0, max - 1) + '…';
    return s;
  }

  function sanitizeFilenamePart(s) {
    return safeStr(s, 40)
      .replace(/[^\w\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'job';
  }

  function dateStamp(ts) {
    const d = new Date(ts || Date.now());
    const pad = function (n) {
      return n < 10 ? '0' + n : String(n);
    };
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      '-' +
      pad(d.getHours()) +
      pad(d.getMinutes())
    );
  }

  /**
   * Build field label→value map from fill result + optional profile.
   */
  function fieldsFromFillResult(fillResult, profile) {
    const map = {};
    const fr = fillResult || {};

    function put(label, value) {
      const lab = safeStr(label, 120);
      if (!lab) return;
      const val = safeStr(value, MAX_FIELD_VALUE);
      if (!val) return;
      if (!map[lab]) map[lab] = val;
    }

    const details = Array.isArray(fr.details) ? fr.details : [];
    details.forEach(function (d) {
      if (!d || d.ok === false) return;
      const label = d.label || d.key || d.name;
      put(label, d.value != null ? d.value : d.key);
    });

    const customs = Array.isArray(fr.customDropdownsFilled) ? fr.customDropdownsFilled : [];
    customs.forEach(function (c) {
      if (!c) return;
      put(c.label || c.key || 'dropdown', c.value);
    });

    const appFields = Array.isArray(fr.applicationFields) ? fr.applicationFields : [];
    appFields.forEach(function (f) {
      if (!f) return;
      put(f.label || f.key, f.value);
    });

    if (fr.applicationReport && fr.applicationReport.fields) {
      const af = fr.applicationReport.fields;
      if (Array.isArray(af)) {
        af.forEach(function (f) {
          if (!f) return;
          put(f.label || f.key, f.value);
        });
      } else if (typeof af === 'object') {
        Object.keys(af).forEach(function (k) {
          put(k, af[k]);
        });
      }
    }

    // Profile fallback when adapters (e.g. Indeed) omit per-field details
    if (profile && Object.keys(map).length < 3) {
      const pairs = [
        ['First name', profile.firstName],
        ['Last name', profile.lastName],
        ['Full name', profile.fullName],
        ['Email', profile.email],
        ['Phone', profile.phone],
        ['Phone country', profile.phoneCountry],
        ['Location', profile.location],
        ['Street', profile.street],
        ['City', profile.city],
        ['State / province', profile.state],
        ['Country', profile.country],
        ['ZIP / Postal', profile.zip || profile.postcode],
        ['Authorized to work', profile.authorizedToWork],
        ['Requires sponsorship', profile.requiresSponsorship],
        ['LinkedIn', profile.linkedin]
      ];
      pairs.forEach(function (p) {
        put(p[0], p[1]);
      });
      if (Array.isArray(profile.customQA)) {
        profile.customQA.forEach(function (qa) {
          if (qa && qa.question) put(qa.question, qa.answer);
        });
      } else if (profile.customAnswers && typeof profile.customAnswers === 'object') {
        Object.keys(profile.customAnswers).forEach(function (k) {
          put(k, profile.customAnswers[k]);
        });
      }
    }

    return map;
  }

  function buildApplicationReport(job, fillResult, runMode, profile) {
    const fr = fillResult || {};
    const ts = Date.now();
    const fields = fieldsFromFillResult(fr, profile);
    const steps =
      (fr.applicationReport && fr.applicationReport.steps) ||
      (Array.isArray(fr.steps) ? fr.steps : fr.step ? [fr.step] : []);

    return {
      id: 'report-' + (job && job.id ? job.id : 'unknown') + '-' + ts,
      jobId: (job && job.id) || null,
      title: (job && job.title) || '',
      company: (job && job.company) || '',
      url: (job && job.url) || (fr.url) || '',
      timestamp: ts,
      adapterId: fr.adapterId || (job && job.ats) || 'unknown',
      runMode: runMode || fr.runMode || 'submit',
      status: 'Submitted',
      fields: fields,
      steps: steps,
      resumeAttached: !!(fr.resumeAttached),
      coverAttached: !!(fr.coverAttached),
      filled: fr.filled || 0,
      unmatched: fr.unmatched || 0,
      total: fr.total || 0,
      inspection: fr.inspection || null
    };
  }

  function reportSummary(report) {
    if (!report) return null;
    return {
      id: report.id,
      jobId: report.jobId,
      title: report.title,
      company: report.company,
      url: report.url,
      timestamp: report.timestamp,
      adapterId: report.adapterId,
      runMode: report.runMode,
      status: report.status,
      resumeAttached: !!report.resumeAttached,
      coverAttached: !!report.coverAttached,
      fieldCount: report.fields ? Object.keys(report.fields).length : 0,
      downloadId: report.downloadId || null,
      filename: report.filename || null
    };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildHtmlReport(report) {
    const r = report || {};
    const rows = Object.keys(r.fields || {})
      .map(function (k) {
        return (
          '<tr><td>' +
          escapeHtml(k) +
          '</td><td>' +
          escapeHtml(r.fields[k]) +
          '</td></tr>'
        );
      })
      .join('');
    const when = new Date(r.timestamp || Date.now()).toISOString();
    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Fill &amp; Apply Report</title>' +
      '<style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}' +
      'h1{font-size:18px}table{border-collapse:collapse;width:100%;margin-top:12px}' +
      'td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px}' +
      'th{background:#f3f4f6}.meta{font-size:13px;line-height:1.5}</style></head><body>' +
      '<h1>Fill &amp; Apply — Application Report</h1>' +
      '<div class="meta">' +
      '<div><strong>Status:</strong> ' +
      escapeHtml(r.status || 'Submitted') +
      '</div>' +
      '<div><strong>Title:</strong> ' +
      escapeHtml(r.title) +
      '</div>' +
      '<div><strong>Company:</strong> ' +
      escapeHtml(r.company) +
      '</div>' +
      '<div><strong>URL:</strong> ' +
      escapeHtml(r.url) +
      '</div>' +
      '<div><strong>Timestamp:</strong> ' +
      escapeHtml(when) +
      '</div>' +
      '<div><strong>Adapter:</strong> ' +
      escapeHtml(r.adapterId) +
      '</div>' +
      '<div><strong>Run mode:</strong> ' +
      escapeHtml(r.runMode) +
      '</div>' +
      '<div><strong>Resume attached:</strong> ' +
      (r.resumeAttached ? 'Yes' : 'No') +
      '</div>' +
      '<div><strong>Cover attached:</strong> ' +
      (r.coverAttached ? 'Yes' : 'No') +
      '</div>' +
      '</div>' +
      '<h2>Application details</h2>' +
      '<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="2">(no field details captured)</td></tr>') +
      '</tbody></table></body></html>'
    );
  }

  /** Escape PDF string literal (WinAnsi-ish, parentheses). */
  function pdfEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x09\x20-\x7E]/g, '?');
  }

  /**
   * Minimal multi-page text PDF (Helvetica). Returns Uint8Array.
   */
  function buildPdfBytes(report) {
    const r = report || {};
    const lines = [];
    lines.push('Fill & Apply — Application Report');
    lines.push('Status: ' + (r.status || 'Submitted'));
    lines.push('Title: ' + safeStr(r.title, 100));
    lines.push('Company: ' + safeStr(r.company, 100));
    lines.push('URL: ' + safeStr(r.url, 200));
    lines.push('Timestamp: ' + new Date(r.timestamp || Date.now()).toISOString());
    lines.push('Adapter: ' + safeStr(r.adapterId, 60));
    lines.push('Run mode: ' + safeStr(r.runMode, 20));
    lines.push('Resume attached: ' + (r.resumeAttached ? 'Yes' : 'No'));
    lines.push('Cover attached: ' + (r.coverAttached ? 'Yes' : 'No'));
    lines.push('');
    lines.push('Application details (field → value)');
    lines.push('-----------------------------------');
    const fields = r.fields || {};
    const keys = Object.keys(fields);
    if (!keys.length) {
      lines.push('(no field details captured)');
    } else {
      keys.forEach(function (k) {
        lines.push(safeStr(k, 80) + ': ' + safeStr(fields[k], 200));
      });
    }

    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 50;
    const fontSize = 10;
    const lineHeight = 14;
    const usable = pageHeight - margin * 2;
    const linesPerPage = Math.max(1, Math.floor(usable / lineHeight));

    const pages = [];
    for (let i = 0; i < lines.length; i += linesPerPage) {
      pages.push(lines.slice(i, i + linesPerPage));
    }
    if (!pages.length) pages.push(['(empty report)']);

    const objects = [];
    function addObj(body) {
      objects.push(body);
      return objects.length;
    }

    const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const contentIds = [];
    pages.forEach(function (pageLines) {
      let y = pageHeight - margin;
      const ops = ['BT', '/F1 ' + fontSize + ' Tf'];
      pageLines.forEach(function (line, idx) {
        if (idx === 0) {
          ops.push(margin + ' ' + y + ' Td');
        } else {
          ops.push('0 -' + lineHeight + ' Td');
        }
        ops.push('(' + pdfEscape(line) + ') Tj');
      });
      ops.push('ET');
      const stream = ops.join('\n');
      const id = addObj(
        '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'
      );
      contentIds.push(id);
    });

    const pageIds = [];
    contentIds.forEach(function (cid) {
      const pid = addObj(
        '<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ' +
          pageWidth +
          ' ' +
          pageHeight +
          '] /Contents ' +
          cid +
          ' 0 R /Resources << /Font << /F1 ' +
          fontId +
          ' 0 R >> >> >>'
      );
      pageIds.push(pid);
    });

    const kids = pageIds.map(function (id) {
      return id + ' 0 R';
    }).join(' ');
    const pagesId = addObj(
      '<< /Type /Pages /Kids [' + kids + '] /Count ' + pageIds.length + ' >>'
    );
    // Patch page parent refs
    for (let p = 0; p < pageIds.length; p++) {
      objects[pageIds[p] - 1] = objects[pageIds[p] - 1].replace('PAGES_REF', pagesId + ' 0 R');
    }
    const catalogId = addObj('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(pdf.length);
      pdf += i + 1 + ' 0 obj\n' + objects[i] + '\nendobj\n';
    }
    const xrefPos = pdf.length;
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i++) {
      const off = String(offsets[i]).padStart(10, '0');
      pdf += off + ' 00000 n \n';
    }
    pdf +=
      'trailer\n<< /Size ' +
      (objects.length + 1) +
      ' /Root ' +
      catalogId +
      ' 0 R >>\nstartxref\n' +
      xrefPos +
      '\n%%EOF';

    const out = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) out[i] = pdf.charCodeAt(i) & 0xff;
    return out;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + chunk, bytes.length))
      );
    }
    return btoa(binary);
  }

  function suggestedFilename(report) {
    const company = sanitizeFilenamePart(report && report.company ? report.company : 'company');
    const stamp = dateStamp(report && report.timestamp);
    return 'FillApply-Report-' + company + '-' + stamp + '.pdf';
  }

  async function downloadPdf(report, pdfBytes) {
    const filename = suggestedFilename(report);
    const base64 = bytesToBase64(pdfBytes);
    const dataUrl = 'data:application/pdf;base64,' + base64;
    if (!chrome.downloads || !chrome.downloads.download) {
      return { filename: filename, downloadId: null, dataUrl: dataUrl, skipped: true };
    }
    return new Promise(function (resolve) {
      chrome.downloads.download(
        {
          url: dataUrl,
          filename: filename,
          saveAs: false,
          conflictAction: 'uniquify'
        },
        function (downloadId) {
          if (chrome.runtime.lastError) {
            resolve({
              filename: filename,
              downloadId: null,
              error: chrome.runtime.lastError.message,
              dataUrl: dataUrl
            });
            return;
          }
          resolve({ filename: filename, downloadId: downloadId });
        }
      );
    });
  }

  async function storeReportMeta(report) {
    const Storage = global.FillApplyStorage;
    const key =
      (global.FillApplyTypes &&
        global.FillApplyTypes.STORAGE_KEYS &&
        global.FillApplyTypes.STORAGE_KEYS.reports) ||
      REPORTS_KEY;
    const result = Storage ? await Storage.get([key]) : await new Promise(function (resolve) {
      chrome.storage.local.get([key], resolve);
    });
    let list = Array.isArray(result[key]) ? result[key] : [];
    const summary = reportSummary(report);
    list.push(summary);
    while (list.length > MAX_REPORTS) list.shift();
    if (Storage) {
      await Storage.set({ [key]: list });
    } else {
      await new Promise(function (resolve, reject) {
        chrome.storage.local.set({ [key]: list }, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
    }
    return list;
  }

  async function getReports() {
    const key =
      (global.FillApplyTypes &&
        global.FillApplyTypes.STORAGE_KEYS &&
        global.FillApplyTypes.STORAGE_KEYS.reports) ||
      REPORTS_KEY;
    const Storage = global.FillApplyStorage;
    const result = Storage ? await Storage.get([key]) : await new Promise(function (resolve) {
      chrome.storage.local.get([key], resolve);
    });
    return Array.isArray(result[key]) ? result[key] : [];
  }

  async function getLastReport() {
    const list = await getReports();
    return list.length ? list[list.length - 1] : null;
  }

  /**
   * Full pipeline: build report, PDF, download, store meta.
   * Returns { report, summary, download }.
   */
  async function generateAndSave(job, fillResult, runMode, profile) {
    const report = buildApplicationReport(job, fillResult, runMode, profile);
    const pdfBytes = buildPdfBytes(report);
    const download = await downloadPdf(report, pdfBytes);
    report.filename = download.filename;
    report.downloadId = download.downloadId || null;
    // Keep base64 only if small enough for optional backend (< ~200KB b64)
    const b64 = bytesToBase64(pdfBytes);
    if (b64.length < 180000) {
      report.pdfBase64 = b64;
    }
    const list = await storeReportMeta(report);
    return {
      report: report,
      summary: reportSummary(report),
      download: download,
      reports: list
    };
  }

  global.FillApplyReport = {
    REPORTS_KEY,
    buildApplicationReport,
    fieldsFromFillResult,
    buildHtmlReport,
    buildPdfBytes,
    downloadPdf,
    storeReportMeta,
    getReports,
    getLastReport,
    generateAndSave,
    reportSummary,
    suggestedFilename
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
