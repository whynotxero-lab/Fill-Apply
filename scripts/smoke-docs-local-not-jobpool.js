'use strict';
const { createPage, createSuite } = require('./test-harness');
const suite = createSuite('smoke-docs-local-not-jobpool');
(async function () {
  const page = createPage('<div></div>', ['lib/types.js', 'lib/storage.js', 'lib/backend.js']);
  let fetchCalls = [];
  page.window.fetch = async function (url) {
    fetchCalls.push(String(url));
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<!DOCTYPE html><html></html>',
      json: async () => { throw new Error('no'); }
    };
  };
  page.window.FillApplyStorage = {
    KEYS: page.window.FillApplyTypes.STORAGE_KEYS,
    getRunConfig: async () => ({
      mockMode: false,
      backendBaseUrl: 'https://zahid-jobpool.vercel.app'
    }),
    getDocuments: async () => ({
      resume: { name: 'CV.docx', base64: 'abc' },
      cover: null
    }),
    getBucket: async () => [],
    setBucket: async () => {},
    get: async () => ({}),
    set: async () => {},
    isHttpUrl: () => true,
    isBlockedUrl: () => false
  };
  page.window.FillApplyProfile = {
    getProfile: async () => ({ email: 'a@b.com' })
  };
  const fs = require('fs');
  page.window.eval(fs.readFileSync('lib/backend.js', 'utf8'));
  const B = page.window.FillApplyBackend;
  const docs = await B.getDocuments();
  suite.equal(docs.resume.name, 'CV.docx', 'documents from local storage');
  suite.equal(fetchCalls.length, 0, 'never fetched JobPool /documents');
  const profile = await B.getProfile();
  suite.equal(profile.email, 'a@b.com', 'profile from local');
  suite.equal(fetchCalls.length, 0, 'never fetched JobPool /profile');
  suite.finish();
})().catch((e) => { console.error(e); process.exit(1); });
