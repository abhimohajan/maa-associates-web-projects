const fs = require('fs');
const pdf = require('pdf-parse');
const p = process.argv[2] || 'c:/Users/user/AppData/Roaming/Cursor/User/workspaceStorage/ca99b96306970e036faf69e0e9bad68b/pdfs/273e8210-5b92-4f40-be9d-f727188b5f57/Tariff-2025-2026(29-07-2025).pdf';
(async () => {
  const buf = fs.readFileSync(p);
  const d = await pdf(buf);
  const t = d.text;
  console.log('pages', d.numpages, 'len', t.length);
  console.log('---HEAD---\n', t.slice(0, 6000));
  console.log('\n---MID sample---\n', t.slice(15000, 17000));
})().catch(e => console.error(e));
