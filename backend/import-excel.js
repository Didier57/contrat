// Import hors ligne d'un fichier Excel dans la base (équivalent CLI du bouton
// « Importer Excel » de l'app). Usage :
//   node backend/import-excel.js "C:\chemin\Contrats.xlsx"
// ou (défaut) c:\temp\Contrats.xlsx
const path = require('path');
const { parseWorkbook } = require('./excel-import');
const { FIELD_NAMES } = require('./contract-fields');
const db = require('./db');

const SRC = process.argv[2] || 'c:/temp/Contrats.xlsx';

const { rows, ignored, errors } = parseWorkbook(SRC, { source: 'path' });

if (!rows.length) {
  console.error('Aucune ligne valide dans le fichier.');
  console.error(errors.join('\n'));
  process.exit(1);
}

const tx = db.transaction((list) => {
  db.prepare('DELETE FROM contracts').run();
  const insert = db.prepare(
    `INSERT INTO contracts (${FIELD_NAMES.join(', ')}) VALUES (${FIELD_NAMES.map(() => '?').join(', ')})`
  );
  for (const r of list) {
    insert.run(...FIELD_NAMES.map((f) => r[f] ?? null));
  }
});
tx(rows);

const total = db.prepare('SELECT COUNT(*) AS c FROM contracts').get().c;
console.log(`OK : ${rows.length} contrat(s) importé(s) (${ignored} ligne(s) ignorée(s)). Total en base : ${total}`);
for (const c of rows.slice(0, 3)) console.log(JSON.stringify(c));