export async function POST() {
  return Response.json(
    { error: 'Strava-synchronisatie is uitgeschakeld. Gebruik de FIT-upload in Marathon Coach.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
