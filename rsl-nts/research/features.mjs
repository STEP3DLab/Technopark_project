import fs from 'node:fs';
import {describe} from '../recognizer.mjs';
const rows=JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(JSON.stringify(rows.map(({frames,aspect,...r})=>({...r,...describe({frames,aspect})}))));
