# Strava testen in de Marathon Coach-preview

Deze koppeling is bedoeld voor de previewbranch `feat/marathon-coach-mvp`. Productie wordt niet gewijzigd.

## Eenmalige voorbereiding

1. Open [Strava API-instellingen](https://www.strava.com/settings/api) en maak een persoonlijke API-app aan. Voor ontwikkelapps staat Strava standaard in de teststand voor alleen de eigenaar van die API-app.
2. Vul bij **Authorization Callback Domain** deze hostnaam in, zonder `https://` of pad:
   `running-portal-git-feat-marathon-coach-mvp-bolus69s-projects.vercel.app`
3. Kopieer de **Client ID** en **Client Secret**. Deel de Client Secret niet in chat, e-mail of GitHub.
4. Open in Vercel het project **running-portal** → **Settings** → **Environment Variables**. Voeg de volgende twee variabelen toe voor **Preview** en alleen branch `feat/marathon-coach-mvp`:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   De versleutelings- en webhook-verificatiesleutels zijn al veilig aangemaakt voor alleen deze previewbranch.
5. Start in Vercel een nieuwe previewdeployment van die branch.

## De koppeling testen

1. Open de preview en log in op je echte Marathon Coach-account. De `/demo`-pagina is alleen een voorbeeld en vraagt geen echte Strava-toestemming.
2. Ga naar **Mijn profiel** → **Strava koppelen**.
3. Log bij Strava in en keur de gevraagde leesrechten goed.
4. Na terugkeer leest de app de laatste 30 dagen in. Bij **Mijn profiel** kun je daarna **Nu synchroniseren** gebruiken.
5. Een nieuwe hardloopactiviteit wordt gekoppeld wanneer Strava de activiteit doorstuurt; dubbele imports worden voorkomen. Laps worden alleen getoond wanneer Strava ze echt teruggeeft.

## Opmerking over automatische updates in Preview

Strava stuurt webhookverzoeken vanaf zijn eigen servers. Een Vercel-preview kan daarvoor extra beschermd zijn. Als de eerste import wel lukt maar de pagina meldt dat automatische synchronisatie nog wacht, werkt de handmatige knop **Nu synchroniseren** nog steeds. De webhookcallback kan dan niet door de huidige previewbeveiliging heen. De bescherming is bewust niet aangepast en productie is ongemoeid gelaten.
