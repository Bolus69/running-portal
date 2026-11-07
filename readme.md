# Marathon Coach by Maarten

Een Nederlandstalige marathoncoach-app voor ervaren recreatieve lopers en hun coach.

## Snel bekijken

De voorbeeldapp staat op `/demo`. Open de previewlink die bij de laatste branch-deployment hoort en zet `/demo` achter het adres. Je hoeft daarvoor geen account te maken. De voorbeeldgegevens worden alleen in de browser bewaard.

De gewone app gebruikt accounts en de bestaande Supabase-database. De preview is gekoppeld aan de bestaande projecten:

- Vercel: `running-portal`
- Supabase: `marathon-coach` (`lzogmtqkpxqrjfhtxxuv`)
- GitHub-branch: `feat/marathon-coach-mvp`

Maak hiervoor geen nieuw project aan. Wijzigingen op deze branch leveren een preview op; `main` blijft productie.

## Wat werkt

- Atleet- en coachomgeving met accountrollen en toegewezen coach-atleetrelaties.
- Persoonlijke schema's van 12, 16 of 20 weken, met drie vaste trainingen en een optionele vierde.
- Coach kan een atleet uitnodigen en vanuit het atleetprofiel een schema instellen of bijwerken.
- Trainingen handmatig registreren en korte feedback geven.
- Optionele herstelgegevens, met keuze om ze wel of niet met de coach te delen.
- Strava OAuth-import, activiteitmatching en laps/blokken als Strava ze aanlevert.
- Coachvoorstellen veranderen een schema pas na beoordeling door de coach.
- Row Level Security op de Supabase-tabellen; Strava-tokens blijven versleuteld aan de serverkant.

## Eerste coachaccount klaarzetten

Er is nog geen coachaccount. Maak éénmalig je eigen coachaccount aan in het bestaande Supabase-project:

1. Open Supabase en kies project `marathon-coach`.
2. Ga naar **Authentication → Users → Add user**. Vul je eigen e-mailadres in en maak een wachtwoord aan. Als je een uitnodiging verstuurt, rond dan eerst de e-mailstap af.
3. Open de preview op `/login` en log één keer in. De app maakt dan automatisch je profiel aan.
4. Ga in Supabase naar **SQL Editor**, vervang in onderstaande query `jouw@email.nl` door je eigen e-mailadres en klik op **Run**.
5. Ververs de app. Je ziet nu het coachdashboard en kunt via **Atleet uitnodigen** atleten toevoegen.

```sql
do $$
declare
  coach_user_id uuid;
begin
  select id into coach_user_id
  from auth.users
  where lower(email) = lower('jouw@email.nl')
  limit 1;

  if coach_user_id is null then
    raise exception 'Geen account gevonden voor dit e-mailadres. Log eerst één keer in.';
  end if;

  update public.profiles
  set role = 'coach'
  where id = coach_user_id;

  insert into public.coach_roles (user_id, granted_by)
  values (coach_user_id, coach_user_id)
  on conflict (user_id) do nothing;
end $$;
```

Atleten krijgen na de uitnodiging een eigen account en zien alleen hun eigen gegevens.

## Database

De bestaande `marathon-coach`-database bevat de app-tabellen en beveiligingsregels. De migratie `20261107193444_security_and_import_indexes.sql` is toegepast op dit project. Voer oude migraties niet opnieuw uit. Nieuwe databasewijzigingen komen als nieuwe migratiebestanden in `supabase/migrations`.

## Strava

De Strava-code is aanwezig, maar OAuth-gegevens moeten nog in Vercel worden ingesteld. Hiervoor is een Strava API-app nodig. Voeg de volgende waarden toe aan **Vercel → running-portal → Settings → Environment Variables**, alleen voor Preview en branch `feat/marathon-coach-mvp`:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_TOKEN_ENCRYPTION_KEY` (genereer een sleutel van 32 bytes, bijvoorbeeld met `openssl rand -base64 32`)
- `STRAVA_WEBHOOK_SECRET` (alleen nodig voor automatische webhook-synchronisatie)

Gebruik als OAuth-callback `https://<preview-domein>/api/strava/callback`. De atleet koppelt Strava daarna in **Mijn profiel**. Zonder webhook werkt handmatig synchroniseren vanuit de app nog steeds. Strava-blokken worden alleen getoond als Strava ze echt terugstuurt.

## Lokaal starten

Vereist Node.js 20.9 of hoger.

```bash
npm install
npm run dev
```

Zonder Supabase-omgevingsvariabelen toont `/` de voorbeeldapp. Kopieer `.env.example` naar `.env.local` voor de echte omgeving. Zet echte sleutels nooit in GitHub.

## Controleren

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

GitHub Actions voert deze controles automatisch uit voor de featurebranch. De Vercel-preview wordt na elke branchwijziging opnieuw gebouwd.
