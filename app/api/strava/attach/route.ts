export async function POST() {
  return Response.json(
    { error: 'Strava-activiteiten koppelen is uitgeschakeld. Upload een FIT-bestand.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
