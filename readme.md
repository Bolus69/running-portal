# Marathon Coach by Maarten

Een Nederlandstalige marathoncoach-app voor atleten en coaches. De app maakt een plan van 12, 16 of 20 weken, toont tempo-indicaties, bewaart trainingen en optionele herstelgegevens en kan activiteiten uit Strava ophalen.

## Functies

- Atleet- en coachomgeving met toegang op basis van account en toewijzing.
- Drie vaste trainingen per week en een optionele vierde training.
- Planweken met herstelweken, wedstrijdweek en trainingsblokken.
- Trainingen handmatig registreren of ophalen uit Strava.
- Laps of trainingsblokken tonen als Strava die informatie aanlevert.
- Vrijblijvende invoer voor slaapduur, rusthartslag, herstelgevoel en notities.
- Herstelgegevens zijn per invoer deelbaar met de coach.
- Coachoverzicht met trainingsstatus, gedeelde herstelcontext en voorstellen.
- Demo-omgeving die gegevens alleen in de huidige browser bewaart.
- Databasebeveiliging met Supabase Row Level Security.

## Lokaal starten

Vereist Node.js 20.9 of hoger.

```bash
npm install
npm run dev
```

Zonder Supabase-instellingen opent de demo. Kopieer voor een echte omgeving `.env.example` naar `.env.local` en vul de waarden in. Gebruik voor deze app een eigen Supabase-project; koppel de app niet aan een database van een ander project.

## Supabase instellen

1. Maak een apart Supabase-project voor Marathon Coach aan.
2. Open in Supabase **SQL Editor** het bestand `supabase/migrations/20261107155016_marathon_coach_mvp.sql` en voer de volledige migratie één keer uit.
3. Vul de project-URL, publishable key en server secret key in `.env.local` in. De secret key blijft alleen op de server.
4. Stel in Supabase Auth de toegestane site-URL en redirect-URL in, waaronder `https://<jouw-domein>/auth/callback`.
5. Maak je eigen account aan en meld één keer aan. De app maakt dan je atleetprofiel aan.
6. Geef jezelf coachrechten via SQL Editor. Vervang beide UUID’s door je Auth-gebruikers-ID:

```sql
update public.profiles set role = 'coach' where id = '<jouw-user-uuid>';
insert into public.coach_roles (user_id, granted_by)
values ('<jouw-user-uuid>', '<jouw-user-uuid>')
on conflict (user_id) do nothing;
```

Daarna kun je vanuit **Atleet uitnodigen** accounts uitnodigen. De atleet opent de uitnodiging en kiest zelf een wachtwoord.

De API gebruikt de server secret key alleen voor uitnodigingen, plannen en Strava-tokens. Tabellen zijn afgeschermd met Row Level Security. De Strava-tokens worden versleuteld opgeslagen.

## Strava instellen

1. Maak een Strava API-app aan en zet de callback-domeinnaam op het domein van deze app.
2. Vul `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` en `STRAVA_TOKEN_ENCRYPTION_KEY` in. Genereer een encryptiesleutel van 32 bytes, bijvoorbeeld met `openssl rand -base64 32`.
3. Zet de OAuth-redirect naar `https://<jouw-domein>/api/strava/callback`.
4. De atleet koppelt Strava vanuit **Mijn profiel**. De app vraagt leesrechten voor activiteiten.
5. Voor automatische synchronisatie registreer je één Strava-webhook voor de app. Stel `STRAVA_WEBHOOK_SECRET` in en gebruik als callback-URL `https://<jouw-domein>/api/strava/webhook?token=<STRAVA_WEBHOOK_SECRET>`. Gebruik dezelfde waarde als `verify_token` bij het registreren.

Strava levert niet voor elke training laps of blokken. In dat geval toont de app alleen de samenvatting. De atleet kan een training ook handmatig invoeren.

## Scripts

```bash
npm run dev        # lokale ontwikkelserver
npm run typecheck  # TypeScript-controle
npm run lint       # ESLint-controle
npm test           # eenmalige tests
npm run build      # productiebuild controleren
```

## Vercel

Koppel de repository aan Vercel en zet de omgevingsvariabelen eerst in **Preview**. Test de preview en de Supabase-redirects voordat je een productieomgeving instelt. Deze branch is bedoeld voor ontwikkeling; er is geen productie-release vanuit deze opdracht.
