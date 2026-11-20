export async function POST() {
  return Response.json(
    { error: 'Activiteiten rechtstreeks uit Strava ophalen is uitgeschakeld. Upload een FIT-bestand.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
