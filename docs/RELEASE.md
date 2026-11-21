# Marathon Coach releaseproces

## Vaste werkwijze

Ontwikkel op `feat/marathon-coach-mvp` of een nieuwe featurebranch. Elke push bouwt een Vercel Preview. Voer tests, lint en build uit. Controleer de relevante gebruikersflow met testaccounts. Beschrijf de wijziging en bewijs in een pull request naar `main`. Geef de stabiele atletenversie pas vrij na controle van de Preview en productie-instellingen. Houd het laatste werkende productie-deployment als terugvalpunt.

De huidige Preview gebruikt dezelfde Supabase-database als de toekomstige vaste versie. Een code-Preview is dus geen afgescheiden testdatabase. Gebruik testaccounts. Doe nooit destructieve proeven met echte atleten. Databasewijzigingen moeten compatibel zijn met de vorige codeversie.

## Release 21 november 2026

- Vaste trainingen apart geteld van afgeronde optionele trainingen, in atleet- en coachschermen.
- Trainingsstappen bewaren seconden en zones. Het bestaande, exact herkenbare blok Korte versnellingen toont ook in oudere schema's 15 seconden. Geen bestaande schema's overschreven.
- FIT-import slaat activiteit, blokken, koppeling en feedback in één database-transactie op. Een herhaalde import voor dezelfde training gebruikt dezelfde activiteit. Koppelen aan een andere training geeft een fout. De functie gebruikt de rechten van de ingelogde atleet.
- PWA met Nederlandse naam, eigen app-iconen, standalone-weergave, installatiehulp en melding zonder internet.
- Offline-opslag bevat alleen de algemene offlinepagina. Accounts, schema's, API-antwoorden en bestanden worden niet offline opgeslagen. Opslaan vereist internet. Een update herlaadt geen open formulier.

## Bewijs

- 19 geautomatiseerde tests geslaagd, inclusief teller en privacygedrag serviceworker.
- TypeScript en productiebuild geslaagd.
- ESLint zonder fouten, met 6 bestaande waarschuwingen voor ongebruikte onderdelen in het dashboard.
- Databaseproef met volledige rollback geslaagd voor herhaalde import, unieke blokken, feedback, tweede-trainingblokkade, fout-terugdraaiing en eigenaarscontrole.
- Live Preview toont voor Maarten van der Worp1 3/3 vaste trainingen en +1 optioneel. Schema-overzicht toont dezelfde verdeling.
- Eerdere browser- en databaserondes controleerden toegang tussen Maarten van der Worp1 en Marathon Coach Test, feedback, welzijn en PDF-pagina-einden.

## Nog fysiek te controleren

Installatie en opnieuw openen op een echte iPhone/Android en Windows/Mac. Test op het eigen apparaat inloggen, FIT-bestand kiezen en PDF opslaan. Een cloudbrowser levert hiervoor geen volledig apparaatbewijs.

## Database-uitrol en terugval

Pas `preserve_step_details` toe vóór nieuwe schema-opslag. De twee nullable kolommen ondersteunen oude code. Pas `atomic_fit_import` toe vóór de nieuwe FIT-route. Een terugval naar de voorgaande code laat bestaande gegevens intact. Behoud de nieuwe kolommen om verlies van opgeslagen details te voorkomen. De importfunctie kan blijven staan als oude code wordt teruggezet.

## Productiecontrole

Controleer vóór vrijgave de production-variabelen NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en SUPABASE_SECRET_KEY zonder sleutels te kopiëren naar bestanden of logs. Stel de vaste app-URL en Supabase redirect allowlist in. Controleer de inlogpagina op de vaste URL zonder Vercel-account. Test herstel- en uitnodigingslinks op die URL. Voorkom dat een ontbrekende production-configuratie de voorbeeldapp aan atleten toont.

Supabase rapporteert dat controle op gelekte wachtwoorden uitstaat. Dit staat los van het weigeren van hetzelfde wachtwoord bij herstel. Tabellen voor audit en de uitgeschakelde Strava-koppeling hebben bewust geen gebruikerspolicies en zijn daardoor afgesloten voor atleten.

## Voorbereiding vaste versie

Vast adres is https://running-portal-beryl.vercel.app. De drie bestaande Supabase-variabelen zijn beschikbaar gemaakt voor production zonder sleutels opnieuw uit te lezen. APP_ORIGIN is per omgeving ingesteld. Uitnodiging en wachtwoordherstel gebruiken deze instelling en zijn losgemaakt van de oude Strava-configuratie. Bij ontbrekende databaseconfiguratie opent de app geen demo meer op de hoofdroute. De expliciete /demo blijft beschikbaar.

De release gaat pas live na verificatie van de toegestane Supabase-inloglinks en de productiebuild. De echte apparaattests blijven nodig voor volledige acceptatie.
