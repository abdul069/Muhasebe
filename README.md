# 🧾 Fiş Platformu — Dijital Fiş / Kasa Fişi Yönetimi

Een platform voor een Turks boekhoudkantoor: **klanten uploaden foto's van hun
kassabonnen (fiş)**, het systeem leest ze automatisch uit met **OCR (Turks)** en
de **boekhouder** kan alles inzien en als **Excel-bestand** downloaden.

Elke bon wordt dus op drie manieren beschikbaar:

1. **Foto** — de originele geüploade afbeelding
2. **OCR-tekst** — de door Tesseract herkende ruwe tekst + automatisch geparste
   velden (winkel, datum, totaal/TOPLAM, KDV)
3. **Excel** — export van alle (gefilterde) bonnen als `.xlsx`

### KDV-uitsplitsing per tarief (Z-raporu)

Elke bon — en zeker een **Z-raporu** (dagafsluiting) — wordt uitgesplitst per
**KDV-oran** (%1, %10, %20, en historisch %8/%18). Per tarief worden de
**matrah** (belastbare grondslag) en het **KDV-bedrag** herkend en opgeslagen.

- De boekhouder ziet en corrigeert de uitsplitsing in het bon-detailscherm.
- Het documenttype (Fiş vs Z Raporu) wordt automatisch gedetecteerd en is
  handmatig aanpasbaar.
- De Excel-export bevat een tweede blad **"KDV Dağılımı"** met één regel per
  (bon × KDV-tarief) plus een samenvatting per oran — direct pivot-baar voor de
  btw-aangifte.

---

## Tech stack

| Onderdeel   | Keuze                                          |
| ----------- | ---------------------------------------------- |
| Framework   | Next.js 14 (App Router) + TypeScript           |
| Database    | Prisma + SQLite (MVP; makkelijk naar Postgres) |
| Auth        | JWT-sessie in httpOnly-cookie (`jose`, bcrypt) |
| OCR         | `tesseract.js` (lokaal, Turks taalpakket)      |
| Excel       | `exceljs`                                       |
| Opslag foto | lokale schijf (`./uploads`)                    |

---

## Snel starten

```bash
# 1. Dependencies installeren
npm install

# 2. Environment instellen
cp .env.example .env
#   -> zet een sterke SESSION_SECRET (bv: openssl rand -base64 32)

# 3. Database aanmaken
npm run db:push

# 4. (optioneel) demo-accounts aanmaken
npm run db:seed

# 5. Ontwikkelserver starten
npm run dev
```

Open daarna <http://localhost:3000>.

### Demo-accounts (na `npm run db:seed`)

| Rol        | E-mail              | Wachtwoord   |
| ---------- | ------------------- | ------------ |
| Boekhouder | muhasebe@ornek.com  | muhasebe123  |
| Klant      | musteri@ornek.com   | musteri123   |

> Klanten kunnen zichzelf registreren via `/register`. Boekhouder-accounts
> worden aangemaakt via het seed-script (of door de `role` van een user op
> `ACCOUNTANT` te zetten in de database).

---

## Hoe het werkt

### Klant (müşteri)

- Logt in, gaat naar het dashboard.
- Maakt/kiest een foto van een fiş (op mobiel opent direct de camera dankzij
  `capture="environment"`). Meerdere foto's tegelijk kan.
- De foto wordt geüpload → OCR draait → velden worden automatisch ingevuld.
- Ziet zijn eigen bonnen met status (İşlendi / Bekliyor / Okunamadı).

### Boekhouder (muhasebeci)

- Ziet **alle** bonnen van **alle** klanten.
- Kan filteren per klant.
- Opent een bon-detail: foto + ruwe OCR-tekst + bewerkbare velden om
  OCR-fouten te corrigeren.
- Downloadt alles (of per klant) als Excel.

---

## Projectstructuur

```
prisma/
  schema.prisma        # datamodel (User, Receipt)
  seed.js              # demo-accounts
src/
  lib/
    prisma.ts          # Prisma client
    session.ts         # JWT-sessies (cookie)
    auth.ts            # route-guards
    ocr.ts             # Tesseract OCR
    parse.ts           # Turkse bon-parser (TOPLAM / KDV / datum / bedrag)
    storage.ts         # foto-opslag op schijf
  middleware.ts        # beschermt /dashboard
  app/
    login/ register/   # auth-pagina's
    dashboard/         # hoofd-UI (klant + boekhouder) + bon-detail
    api/
      auth/            # register / login / logout
      receipts/        # upload, lijst, detail, bewerken, verwijderen, foto
      clients/         # klantenlijst (boekhouder)
      export/          # Excel-export
uploads/               # geüploade foto's (niet in git)
```

---

## OCR-opmerkingen

- `tesseract.js` downloadt bij de **eerste** run de taalmodellen (`tur`, `eng`).
  De server heeft daarvoor internettoegang nodig. Wil je volledig offline
  draaien, host de `.traineddata`-bestanden lokaal en wijs `tesseract.js`
  daarnaar.
- De parser in `src/lib/parse.ts` doet een beste-gok op de belangrijkste
  velden. OCR is nooit 100% — daarom kan de boekhouder elk veld corrigeren.

## Productie / volgende stappen

- Zet de database over naar **PostgreSQL** (provider in `schema.prisma`).
- Sla foto's op in objectopslag (S3 / Supabase Storage) i.p.v. lokale schijf.
- Voer OCR asynchroon uit (queue/worker) voor grote volumes.
- Voeg een admin-scherm toe om klanten aan een boekhouder te koppelen.
