export async function GET() {
  return Response.json(
    { error: 'Strava-import is uitgeschakeld. Gebruik de FIT-upload in Marathon Coach.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
