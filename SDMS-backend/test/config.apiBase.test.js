import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CONFIG_JS_PATH = '/home/runner/work/Web-Based-Student-Discipline-Management-System/Web-Based-Student-Discipline-Management-System/Student Discipline Management System/js/config.js';
const configScript = readFileSync(CONFIG_JS_PATH, 'utf8');

function runConfig({
  location,
  metaBase = '',
  storedBase = '',
  sdmsApiBase = undefined,
} = {}) {
  const store = new Map();
  if (storedBase) store.set('sdms:api-base', storedBase);

  const window = {
    location,
    SDMS_API_BASE: sdmsApiBase,
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      }
    },
    document: {
      querySelector(selector) {
        if (selector !== 'meta[name="sdms-api-base"]') return null;
        return { content: metaBase };
      }
    }
  };

  vm.runInNewContext(configScript, { window, document: window.document, localStorage: window.localStorage, console, Object, Set, String, Boolean });
  return window;
}

test('config falls back to deployed backend when localhost API is configured on remote host', () => {
  const window = runConfig({
    location: {
      hostname: 'example.com',
      protocol: 'https:',
      origin: 'https://example.com',
      port: '',
    },
    metaBase: 'http://localhost:3000'
  });

  assert.equal(window.SDMS_CONFIG.API_BASE, 'https://web-based-student-discipline-management.onrender.com');
  assert.equal(window.API_BASE, 'https://web-based-student-discipline-management.onrender.com/api');
});

test('config keeps local backend when running from localhost live-server', () => {
  const window = runConfig({
    location: {
      hostname: 'localhost',
      protocol: 'http:',
      origin: 'http://localhost:5500',
      port: '5500',
    },
    metaBase: 'https://mpnag.vercel.app'
  });

  assert.equal(window.SDMS_CONFIG.API_BASE, 'http://localhost:3000');
  assert.equal(window.API_BASE, 'http://localhost:3000/api');
});

test('config maps frontend-only production base to deployed backend API', () => {
  const window = runConfig({
    location: {
      hostname: 'mpnag.vercel.app',
      protocol: 'https:',
      origin: 'https://mpnag.vercel.app',
      port: '',
    },
    metaBase: 'https://mpnag.vercel.app'
  });

  assert.equal(window.SDMS_CONFIG.API_BASE, 'https://web-based-student-discipline-management.onrender.com');
  assert.equal(window.API_BASE, 'https://web-based-student-discipline-management.onrender.com/api');
});
