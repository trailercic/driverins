# Vehicle Inspection – uputstvo za postavljanje

Aplikacija za vozače (slanje izveštaja sa fotografijama) i admin panel (`/#admin`).
Podaci idu u Google tabelu, fotografije na Cloudinary, a sve radi na Netlify-ju.

**U kodu nema nijedne lozinke ni ključa.** Sve tajne vrednosti se unose u Netlify
(Site configuration → Environment variables). Nikad ih ne stavljaj u GitHub.

---

## 1. Google tabela

1. Napravi novu Google tabelu.
2. Napravi dva lista (taba):
   - **`Sheet1`** – izveštaji. Ostavi ga praznog; zaglavlje se pravi samo.
   - **`Drivers`** – spisak vozača:

     | A (Full Name) | B (Driver ID) |
     |---|---|
     | John Smith | 1234 |
     | Marko Petrović | 5678 |

     Red 1 je zaglavlje, vozači kreću od reda 2.
3. ID tabele je deo linka između `/d/` i `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`OVO_JE_ID`**`/edit`

**Kolone u `Sheet1`:** Date (samo datum, bez vremena) · Full Name · Driver ID · Truck Number · Trailer Number ·
Truck Photos · Trailer Photos · **Driver Notes** (H) · **Admin Comment** (I).
Beleška vozača i komentar admina su sada odvojeni, pa admin više ne briše vozačevu belešku.

**Obavezne fotografije** (kamion i prikolica) su navedene u `index.html`, u objektu `SHOTS`
(na vrhu dela `CAMERA`). Vozač pritisne „Start truck photos“ / „Start trailer photos“ i snima redom;
kamera mu za svaku ispiše šta treba da slika. Fotografije se ne mogu preskočiti niti birati
pojedinačno, a izveštaj ne može da se pošalje dok sve nisu snimljene.
Za izmenu spiska dovoljno je izmeniti nizove u `SHOTS`.

Na kameri se za svaku fotografiju prikazuje žuta silueta (obris) i kratko uputstvo – nalaze se u
`index.html`, u nizu `GUIDES`. Silueta se bira po nazivu fotografije (npr. svi nazivi sa „Brakes“
dobijaju siluetu doboša; leva strana je u ogledalu desne). Linije služe samo kao vodilica i ne ulaze
u sliku koja se šalje.

## 2. Google service account (novi ključ)

1. https://console.cloud.google.com → napravi novi projekat.
2. APIs & Services → Library → uključi **Google Sheets API**.
3. IAM & Admin → Service Accounts → **Create service account** (uloge nisu potrebne).
4. Otvori ga → **Keys** → Add key → Create new key → **JSON**. Preuzeće se fajl.
5. U Google tabeli klikni **Share** i dodaj email service account-a
   (npr. `nesto@projekat.iam.gserviceaccount.com`) kao **Editor**.
6. Iz JSON fajla trebaju ti `client_email` i `private_key`.
   Posle toga JSON fajl obriši ili sačuvaj van projekta – **ne ide na GitHub**.

## 3. Cloudinary

1. Novi nalog na https://cloudinary.com.
2. Dashboard (ili Settings → API Keys): prepiši **Cloud name**, **API Key**, **API Secret**.

## 4. GitHub

1. Napravi novi **privatni** repozitorijum.
2. Ubaci ove fajlove, sa istom strukturom:
   ```
   index.html
   netlify.toml
   package.json
   .gitignore
   README.md
   netlify/functions/api.js
   ```
   Funkcija mora biti u `netlify/functions/api.js`, inače Netlify neće je naći.

## 5. Netlify

1. **Add new site → Import an existing project → GitHub** → izaberi repozitorijum.
   Build podešavanja ostavi prazna (sve je u `netlify.toml`).
2. **Site configuration → Environment variables** → dodaj:

| Promenljiva | Vrednost |
|---|---|
| `SHEET_ID` | ID tabele iz koraka 1 |
| `GOOGLE_CLIENT_EMAIL` | `client_email` iz JSON fajla |
| `GOOGLE_PRIVATE_KEY` | `private_key` iz JSON fajla (ceo, od `-----BEGIN` do `-----END PRIVATE KEY-----\n`, može sa `\n` kako piše u JSON-u) |
| `CLOUDINARY_CLOUD` | Cloud name |
| `CLOUDINARY_API_KEY` | API Key |
| `CLOUDINARY_API_SECRET` | API Secret |
| `ADMIN_PASSWORD` | nova admin lozinka (dugačka, **ne stara**) |
| `SESSION_SECRET` | nasumičan niz od 40+ znakova (vidi ispod) |

Opciono:

| Promenljiva | Podrazumevano | Čemu služi |
|---|---|---|
| `APP_TIMEZONE` | `America/Chicago` | vremenska zona za datum izveštaja i brojač "Today" |
| `REPORTS_TAB` | `Sheet1` | ime lista sa izveštajima |
| `DRIVERS_TAB` | `Drivers` | ime lista sa vozačima |
| `CLOUDINARY_SIGNATURE_ALGORITHM` | `sha256` | stavi `sha1` ako Cloudinary javlja "Invalid Signature" |

**SESSION_SECRET** možeš napraviti na https://www.random.org/strings/ (npr. 2 niza po 20 znakova, spojeni)
ili bilo kojim generatorom lozinki. Ako ga promeniš, svi admini se odjavljuju.

3. Posle unosa promenljivih: **Deploys → Trigger deploy → Deploy site**
   (promenljive važe tek od sledećeg deploya).

## 6. Provera

- `https://tvoj-sajt.netlify.app` → forma za vozače. Probaj izveštaj sa vozačem iz lista `Drivers`.
- `https://tvoj-sajt.netlify.app/#admin` → admin panel.

### Česte greške

| Poruka | Uzrok |
|---|---|
| `Server nije podešen: nedostaje X` | Promenljiva X nije uneta ili nije urađen novi deploy. |
| `Google prijava nije uspela` | `GOOGLE_PRIVATE_KEY` pogrešno kopiran ili `GOOGLE_CLIENT_EMAIL` ne odgovara ključu. |
| `Google Sheets: ... permission` | Tabela nije podeljena sa email-om service account-a kao Editor. |
| `Google Sheets: Unable to parse range` | Ne postoji list `Sheet1` ili `Drivers` (ili drugačije ime od podešenog). |
| `Cloudinary: Invalid Signature` | Pogrešan API Secret, ili probaj `CLOUDINARY_SIGNATURE_ALGORITHM = sha1`. |
| "Name and Driver ID do not match" | Ime ili prezime nije kao u listu `Drivers`, ili ID nije tačan. Dovoljno je ime **ili** prezime (velika/mala slova i č/ć/š/ž/đ nisu bitni), ali ID mora biti tačan. |

---

## Šta je promenjeno u odnosu na staru verziju

- Svi ključevi i admin lozinka su izbačeni iz koda → environment variables.
- Admin lozinka se proverava na serveru; admin dobija sesiju od 12 h.
  Bez prijave niko ne može da čita izveštaje ni da menja komentare.
- Slanje slika i izveštaja radi samo posle uspešne provere vozača (token važi 30 min).
  Ime i ID vozača u izveštaj upisuje server, ne pretraživač.
- Vozaču je i dalje dovoljno ime **ili** prezime + tačan ID; u izveštaj se upisuje puno ime iz lista `Drivers`.
  Posle neuspele provere server čeka ~1 s, da bi pogađanje ID-a bilo sporije.
- Sav unos se prikazuje bezbedno (zaštita od ubacivanja koda u admin panel),
  a u tabelu se upisuje kao običan tekst (ne može se ubaciti formula).
- Beleška vozača i komentar admina su u odvojenim kolonama.
- Komentari se vezuju za broj reda, pa se dva izveštaja poslata u istoj sekundi više ne mešaju.
- Vreme izveštaja postavlja server, u zoni iz `APP_TIMEZONE`.
- Ako slanje pukne na pola, već poslate slike se ne šalju ponovo.

## Stari sajt

Stari ključevi su bili u kodu i treba ih ugasiti čim novi sajt proradi:
- Google Cloud → stari projekat → Service Accounts → `driverinsp-app` → Keys → **obriši ključ**.
- Stari Cloudinary nalog → **regeneriši API Secret** (ili obriši nalog ako ti ne treba).
