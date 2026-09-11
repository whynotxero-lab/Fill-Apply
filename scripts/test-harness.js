/**
 * Minimal jsdom harness for the content-script libraries.
 *
 * The extension has no build step, so tests load the same IIFE sources the
 * browser loads and run them against a jsdom window.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function requireJsdom() {
  try {
    return require('jsdom');
  } catch (_e) {
    console.error('jsdom is not installed. Run: npm install');
    process.exit(2);
  }
}

/**
 * jsdom has no layout engine, so every getBoundingClientRect returns zeros and
 * the extension's visibility checks would reject every element. Report a real
 * box for anything not explicitly hidden.
 */
function patchLayout(window) {
  const { Element } = window;
  Element.prototype.getBoundingClientRect = function () {
    const style = window.getComputedStyle(this);
    const hidden =
      style.display === 'none' || style.visibility === 'hidden' || this.hasAttribute('hidden');
    const box = hidden
      ? { width: 0, height: 0 }
      : { width: 200, height: 24 };
    return {
      width: box.width,
      height: box.height,
      top: 0,
      left: 0,
      right: box.width,
      bottom: box.height,
      x: 0,
      y: 0,
      toJSON: function () {
        return box;
      }
    };
  };
  Element.prototype.scrollIntoView = function () {};
}

/**
 * Build a jsdom page with the requested extension libraries loaded.
 *
 * @param {string} html body markup
 * @param {string[]} files extension-relative script paths
 */
function createPage(html, files) {
  const { JSDOM } = requireJsdom();
  const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://jobs.example.com/careers/engineer'
  });
  const window = dom.window;
  patchLayout(window);

  (files || []).forEach(function (file) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    window.eval(source);
  });

  return { dom: dom, window: window, document: window.document };
}

/** Tiny assertion recorder so a failing file reports every problem at once. */
function createSuite(name) {
  const failures = [];
  let checks = 0;

  function ok(condition, message) {
    checks += 1;
    if (condition) {
      console.log('  ok  ' + message);
    } else {
      console.error('  FAIL ' + message);
      failures.push(message);
    }
  }

  function equal(actual, expected, message) {
    ok(actual === expected, message + ' (got ' + JSON.stringify(actual) + ')');
  }

  function finish() {
    if (failures.length) {
      console.error('FAILED ' + name + ': ' + failures.length + '/' + checks);
      process.exit(1);
    }
    console.log('PASS ' + name + ' (' + checks + ' checks)');
  }

  return { ok: ok, equal: equal, finish: finish };
}

module.exports = { createPage: createPage, createSuite: createSuite, ROOT: ROOT };
