const fs = require('fs');
const pdf = require('pdf-parse');
const p = process.argv[2] || 'c:/Users/user/AppData/Roaming/Cursor/User/workspaceStorage/ca99b96306970e036faf69e0e9bad68b/pdfs/273e8210-5b92-4f40-be9d-f727188b5f57/Tariff-2025-2026(29-07-2025).pdf';
(async () => {
  const d = await pdf(fs.readFileSync(p));
  const lines = d.text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const data = lines.filter(l => /^\d{8}/.test(l) && !/HscodeTARRIFF/.test(l));
  const tails = data.slice(0, 30).map(l => {
    const m = l.match(/^(\d{8})(.+)$/);
    return m[2].replace(/\s+$/, '');
  });
  for (const t of tails) {
    const idx = t.search(/\d[\d.]*\.\d+\.\d+\s*$/);
    const desc = idx >= 0 ? t.slice(0, idx) : t;
    const tail = idx >= 0 ? t.slice(idx).replace(/\s+$/, '') : '';
    console.log('TAIL_LEN', tail.length, '|', tail.slice(0, 40), '|', tail.slice(-20));
  }
})();
