import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function worker() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {}
  const fetch = vi.fn()
  const match = vi.fn().mockResolvedValue('public offline page')
  const context = { self: { location: { origin: 'https://coach.test' }, addEventListener: (name: string, listener: typeof listeners[string]) => { listeners[name] = listener } }, caches: { match }, URL, Response, fetch }
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), context)
  return { listeners, fetch, match }
}

describe('private app navigation', () => {
  it('never intercepts mutations, API calls or authentication callbacks', () => {
    const { listeners, fetch } = worker()
    for (const request of [
      { method: 'POST', mode: 'navigate', url: 'https://coach.test/api/activities/import' },
      { method: 'GET', mode: 'navigate', url: 'https://coach.test/auth/accept?token=test' },
      { method: 'GET', mode: 'navigate', url: 'https://coach.test/api/wellness' },
      { method: 'GET', mode: 'cors', url: 'https://coach.test/' },
    ]) {
      const respondWith = vi.fn()
      listeners.fetch({ request, respondWith })
      expect(respondWith).not.toHaveBeenCalled()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('loads live data online and uses only the public fallback when disconnected', async () => {
    const { listeners, fetch, match } = worker()
    const request = { method: 'GET', mode: 'navigate', url: 'https://coach.test/' }
    let response: Promise<unknown> | undefined
    fetch.mockResolvedValueOnce('live account response')
    listeners.fetch({ request, respondWith: (value: Promise<unknown>) => { response = value } })
    expect(await response).toBe('live account response')
    expect(match).not.toHaveBeenCalled()
    fetch.mockRejectedValueOnce(new Error('Offline'))
    listeners.fetch({ request, respondWith: (value: Promise<unknown>) => { response = value } })
    expect(await response).toBe('public offline page')
    expect(match).toHaveBeenCalledWith('/offline.html')
  })
})
