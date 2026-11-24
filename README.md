# Pab Kviz – Trening

Statična PWA (bez build koraka): Najduža riječ i Abakus. Radi offline nakon prvog otvaranja.

## Objava na Vercel
1. Na vercel.com: Add New → Project → prevuci ovaj folder (ili ga stavi u GitHub repo i importuj).
   Framework Preset: **Other**, Build Command: prazno, Output Directory: `.` (root).
2. Ili iz terminala u ovom folderu: `npx vercel --prod`.

## Instalacija
- Desktop (Chrome/Edge): ikonica za instalaciju u adresnoj liniji ili dugme „Instaliraj aplikaciju” na početnoj.
- Android (Chrome): meni → Instaliraj aplikaciju.
- iPhone (Safari): Podijeli → Dodaj na početni ekran.

## Fajlovi
- `index.html` – izgled i stilovi
- `app.js` – logika igara i ekrani
- `abakus-core.js` – rješavač i generator Abakus zadataka
- `data.js` – rječnik (osnovni oblici, množina imenica, prošireni rječnik)
- `sw.js`, `manifest.webmanifest`, `icons/` – PWA
- `vercel.json` – zaglavlja za service worker i manifest
