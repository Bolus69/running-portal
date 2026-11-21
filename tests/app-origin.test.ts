import { afterEach, expect, it, vi } from 'vitest'
import { appOrigin } from '@/lib/app-origin'
afterEach(() => vi.unstubAllEnvs())
it('uses the canonical HTTPS deployment without Strava configuration', () => {
  vi.stubEnv('APP_ORIGIN', 'https://coach.test/')
  expect(appOrigin('https://temporary.test/path')).toBe('https://coach.test')
})
it('falls back safely when the optional origin is absent or invalid', () => {
  for (const value of ['', 'broken', 'http://localhost:3000']) {
    vi.stubEnv('APP_ORIGIN', value)
    expect(appOrigin('https://coach.test/path')).toBe('https://coach.test')
  }
})
