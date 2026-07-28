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

| Onderdeel   | Keuze                                              |
| ----------- | -------------------------------------------------- |
| Framework   | Next.js 14 (App Router) + TypeScript               |
| Database    | Prisma + **PostgreSQL** (Vercel Postgres / Neon)   |
| Auth        | JWT-sessie in httpOnly-cookie (`jose`, bcrypt)     |
| OCR         | `tesseract.js` **client-side** (browser, Turks)    |
| Excel       | `exceljs`                                           |
| Opslag foto | **Vercel Blob** (directe client-upload)            |

De OCR draait in de **browser van de klant**; de serverless-functie ontvangt
alleen metadata (Blob-URL + herkende tekst) en parseert die. Zo zijn er geen
server-time-outs en past de app op Vercel.

---

## Snel starten (lokaal)

Je hebt een Postgres-URL en een Vercel Blob-token nodig (beide gratis).
De makkelijkste weg is het project in Vercel koppelen en dan `vercel env pull`.

```bash
# 1. Dependencies installeren
npm install

# 2. Environment instellen
cp .env.example .env
#   -> DATABASE_URL + DIRECT_URL (Postgres), BLOB_READ_WRITE_TOKEN, SESSION_SECRET
#   of:  vercel link && vercel env pull .env

# 3. Databaseschema aanmaken
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
- In de browser: OCR draait → foto gaat naar Blob → metadata naar de server →
  velden worden automatisch ingevuld.
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
  schema.prisma        # datamodel (User, Receipt, VatLine)
  seed.js              # demo-accounts
src/
  lib/
    prisma.ts          # Prisma client
    session.ts         # JWT-sessies (cookie)
    auth.ts            # route-guards
    ocr-client.ts      # Tesseract OCR in de browser (client-side)
    parse.ts           # Turkse bon-parser (TOPLAM / KDV / datum / docType)
  middleware.ts        # beschermt /dashboard
  app/
    login/ register/   # auth-pagina's
    dashboard/         # hoofd-UI (klant + boekhouder) + bon-detail
    api/
      auth/            # register / login / logout
      receipts/        # lijst, aanmaken, detail, bewerken, verwijderen, foto
        blob-upload/   # token-endpoint voor directe Blob-upload
      clients/         # klantenlijst (boekhouder)
      export/          # Excel-export (+ blad KDV Dağılımı)
```

---

## Deploy naar Vercel

1. **Push** deze repo naar GitHub en **importeer** hem in Vercel.
2. In het Vercel-project → **Storage**:
   - Maak een **Postgres**-database aan (Prisma Postgres). Dit zet o.a.
     `POSTGRES_URL` — die gebruikt `prisma/schema.prisma`.
   - Maak een **Blob**-store aan en **koppel** hem aan dit project
     (*Connect Project*). Pas dan wordt `BLOB_READ_WRITE_TOKEN` geïnjecteerd —
     `BLOB_STORE_ID` / `BLOB_WEBHOOK_PUBLIC_KEY` alleen zijn niet genoeg.
3. Zet de overige **Environment Variables** (Production + Preview):
   - `SESSION_SECRET` = een sterke random string (`openssl rand -base64 32`) —
     **verplicht**, anders faalt inloggen.
   - `NEXT_PUBLIC_OCR_LANGS` = `tur+eng` (optioneel).
   - De database- en Blob-variabelen worden door de integraties gezet; niets
     handmatig aan te passen.
4. **Deploy.** Het `vercel-build`-script draait `prisma db push` en maakt de
   tabellen aan bij de eerste build.
5. **Demo-accounts** (eenmalig): `vercel env pull .env.local && npm run db:seed`,
   of maak een boekhouder aan door in de database `role = 'ACCOUNTANT'` te zetten.

> **Let op:** deze app gebruikt **Prisma Postgres** via `POSTGRES_URL`. Gebruik
> je gewone (plain) Postgres, wijs `url` in `prisma/schema.prisma` dan naar je
> eigen connectie-variabele.

> **Toegang tot foto's:** Vercel Blob-URL's zijn publiek maar onraadbaar. De
> route `/api/receipts/:id/image` controleert eerst de login en stuurt dan door.
> Voor strengere afscherming van financiële documenten kun je later overstappen
> op private opslag of een proxy met korte-levensduur-URL's.

---

## OCR-opmerkingen

- `tesseract.js` downloadt bij de **eerste** run in de browser de taalmodellen
  (`tur`, `eng`). Daarna zit het in de browsercache.
- De parser in `src/lib/parse.ts` doet een beste-gok op de belangrijkste velden
  (incl. KDV-uitsplitsing en documenttype). OCR is nooit 100% — daarom kan de
  boekhouder elk veld en elke KDV-regel corrigeren.

## Volgende stappen

- Klanten aan een specifieke boekhouder/kantoor koppelen (multi-tenant).
- Robuustere Z-raporu-parsing (matrah en KDV op aparte regels).
- Private foto-opslag met tijdelijke URL's.
- Automatische maand/kwartaal-export voor de btw-aangifte.
