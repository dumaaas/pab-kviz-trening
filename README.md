# Pab Kviz – Trening

Statična PWA (bez build koraka): Najduža riječ i Abakus. Radi offline nakon prvog otvaranja.

## Objava na Vercel
1. Na vercel.com: Add New → Project → prevuci ovaj folder (ili ga stavi u GitHub repo i importuj).
   Framework Preset: **Other**, Build Command: prazno, Output Directory: `.` (root).
2. Ili iz terminala u ovom folderu: `npx vercel --prod`.

## Igraj sa društvom (Upstash Redis)
- Na Vercelu: projekat → Storage → Upstash Redis baza → **Connect Project** na ovaj projekat, pa **Redeploy**.
  Vercel sam ubacuje varijable (`STORAGE_KV_REST_API_URL`, `STORAGE_KV_REST_API_TOKEN`); u kodu nema tokena.
- Lokalno: `npx vercel env pull .env.local` pa `npx vercel dev` (`.env.local` je u `.gitignore`).
- Domaćin: Igraj sa društvom → ime → Napravi novi kviz → podijeli kod/link → kad su svi tu, Pokreni kviz.
- Prvo Najduža riječ, pa Abakus (po 5 min, isti zadaci za sve). Sledeći dio kreće kad svi završe ili istekne vrijeme (Abakus 10 s nakon toga).
- Ko završi ranije vidi tabelu i ko se još čeka; na kraju konačna tabela (riječi + abakus), domaćin pokreće novu rundu.
- Soba traje 12 sati, najviše 30 igrača.

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
- `api/room.js` – Vercel funkcija za sobe (kod, igrači, start, rezultati)
