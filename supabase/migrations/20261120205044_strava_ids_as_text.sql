alter table public.strava_connections
  alter column strava_athlete_id type text
  using strava_athlete_id::text;

alter table public.strava_webhook_events
  alter column strava_athlete_id type text
  using strava_athlete_id::text;
