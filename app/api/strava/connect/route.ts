export async function GET() {
  return Response.json(
    { error: 'Strava-koppelen is uitgeschakeld. Upload je training als FIT-bestand.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
