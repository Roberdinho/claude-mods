import { describe, expect, mock, test } from 'claude-code/testing'

import {
  CALLBACK_LISTENER,
  REDIRECT_URI,
  asAccount,
  authorizeUrl,
  base64url,
  currentItem,
  errorText,
  isNoActiveDevice,
  itemLine,
  parseCallback,
  parseDevices,
  parseTokens,
  pickDevice,
  pkce,
  searchItems,
  spotifyCommandOf,
  spotifyUri,
} from '../hooks/spotify'

const TRACK_ID = '4cOdK2wGLETKBW3PvgPWqT'
const PLAYLIST_ID = '37i9dQZF1DWWQRwui0ExPn'

const SEARCH = JSON.stringify({
  tracks: {
    items: [
      {
        uri: `spotify:track:${TRACK_ID}`,
        name: 'One More Time',
        artists: [{ name: 'Daft Punk' }],
        album: { name: 'Discovery' },
      },
    ],
  },
  playlists: {
    items: [null, { uri: `spotify:playlist:${PLAYLIST_ID}`, name: 'lofi beats', owner: { display_name: 'Spotify' } }],
  },
})

describe('sign-in', () => {
  test('PKCE: a verifier and its S256 challenge, base64url without padding', async () => {
    const { verifier, challenge } = await pkce()
    expect(verifier.length).toBe(64)
    expect(/^[A-Za-z0-9_-]+$/.test(verifier)).toBe(true)
    expect(challenge.length).toBe(43)
    expect(base64url(new Uint8Array([251, 255, 0]))).toBe('-_8A')
  })

  test('the authorize URL asks for the scopes on the loopback redirect', () => {
    const url = new URL(authorizeUrl('client123', 'chal', 'st8'))
    expect(url.origin).toBe('https://accounts.spotify.com')
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toContain('user-modify-playback-state')
    expect(url.searchParams.get('scope')).toContain('user-library-modify')
    expect(REDIRECT_URI.startsWith('http://127.0.0.1:')).toBe(true)
  })

  test('token answers, keeping the old refresh token when none comes back', () => {
    expect(parseTokens('{"access_token":"a","refresh_token":"r","expires_in":3600}', 1000)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 3_601_000,
    })
    expect(parseTokens('{"access_token":"b","expires_in":10}', 0, 'old')).toEqual({
      accessToken: 'b',
      refreshToken: 'old',
      expiresAt: 10_000,
    })
    expect(parseTokens('{"error":"invalid_grant","error_description":"Refresh token revoked"}', 0)).toEqual({
      error: 'Refresh token revoked',
    })
  })

  test('what the listener prints', () => {
    expect(parseCallback('{"code":"abc"}')).toEqual({ code: 'abc' })
    expect(parseCallback('{"error":"access_denied"}')).toEqual({ error: 'access_denied' })
    expect(parseCallback('{"error":""}')).toEqual({ error: 'sign-in cancelled' })
    expect(parseCallback('noise')).toBeUndefined()
    expect(/^[\x00-\x7f]*$/.test(CALLBACK_LISTENER)).toBe(true)
  })

  test('a stored account, or nothing', () => {
    const account = { accessToken: 'a', refreshToken: 'r', expiresAt: 1, name: 'Rob', product: 'premium' }
    expect(asAccount(account)).toEqual(account)
    expect(asAccount({ accessToken: 'a' })).toBeUndefined()
    expect(asAccount(undefined)).toBeUndefined()
  })
})

describe('reading Spotify', () => {
  test('URIs and links, or a search', () => {
    expect(spotifyUri(`spotify:track:${TRACK_ID}`)).toBe(`spotify:track:${TRACK_ID}`)
    expect(spotifyUri(`https://open.spotify.com/playlist/${PLAYLIST_ID}?si=abc`)).toBe(`spotify:playlist:${PLAYLIST_ID}`)
    expect(spotifyUri(`https://open.spotify.com/intl-nl/track/${TRACK_ID}`)).toBe(`spotify:track:${TRACK_ID}`)
    expect(spotifyUri('daft punk')).toBeUndefined()
  })

  test('search results, skipping holes', () => {
    const tracks = searchItems(SEARCH, 'track')
    expect(tracks.map(itemLine)).toEqual(['One More Time — Daft Punk (Discovery)'])
    const playlists = searchItems(SEARCH, 'playlist')
    expect(playlists.map(itemLine)).toEqual(['lofi beats — Spotify'])
    expect(searchItems(SEARCH, 'album')).toEqual([])
  })

  test('devices: the active one, else this computer, else any', () => {
    const devices = parseDevices(
      JSON.stringify({
        devices: [
          { id: 'p', name: 'Phone', type: 'Smartphone', is_active: false, volume_percent: 50 },
          { id: 'c', name: 'DESKTOP', type: 'Computer', is_active: false, volume_percent: null },
        ],
      }),
    )
    expect(pickDevice(devices)?.id).toBe('c')
    expect(pickDevice([{ ...devices[0]!, isActive: true }, devices[1]!])?.id).toBe('p')
    expect(pickDevice([])).toBeUndefined()
  })

  test('errors in words', () => {
    expect(errorText(403, '{"error":{"status":403,"message":"x","reason":"PREMIUM_REQUIRED"}}')).toContain('Premium')
    expect(errorText(429, '')).toContain('too many requests')
    expect(errorText(500, '{"error":{"message":"Server error"}}')).toBe('Spotify answered 500: Server error.')
    expect(isNoActiveDevice(404, '{"error":{"reason":"NO_ACTIVE_DEVICE"}}')).toBe(true)
    expect(isNoActiveDevice(404, '{}')).toBe(false)
  })

  test('what plays now', () => {
    expect(currentItem(`{"item":{"uri":"spotify:track:${TRACK_ID}","name":"One More Time"}}`)).toEqual({
      uri: `spotify:track:${TRACK_ID}`,
      name: 'One More Time',
    })
    expect(currentItem('{}')).toBeUndefined()
  })

  test('/spotify words', () => {
    expect(spotifyCommandOf('')).toEqual({ verb: 'status' })
    expect(spotifyCommandOf('login')).toEqual({ verb: 'login' })
    expect(spotifyCommandOf('daft punk one more time')).toEqual({ verb: 'play', kind: 'track', query: 'daft punk one more time' })
    expect(spotifyCommandOf('playlist lofi beats')).toEqual({ verb: 'play', kind: 'playlist', query: 'lofi beats' })
    expect(spotifyCommandOf('queue around the world')).toEqual({ verb: 'queue', query: 'around the world' })
    expect(spotifyCommandOf('device phone')).toEqual({ verb: 'device', name: 'phone' })
    // A song called "Album" is still a song.
    expect(spotifyCommandOf('album')).toEqual({ verb: 'play', kind: 'track', query: 'album' })
  })
})

describe('the session', () => {
  test('without a Client ID, /spotify explains the setup', async ($, on) => {
    mock.env(on, { OS: 'Linux' })
    mock.store(on)
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('tool.register', (_$, e) => ({ value: { tool: `mcp__claude-dj__${e.name}` } }))
    await $.session.start({ cwd: '/work' } as never)

    const status = await $.command.run({ command: 'spotify', args: '' } as never)
    expect(String(status.text)).toContain('Spotify is not set up yet')
    expect(String(status.text)).toContain(REDIRECT_URI)
    const played = await $.command.run({ command: 'play', args: 'anything' } as never)
    expect(String(played.text)).toContain('Spotify is not set up yet')
  })

  test('with a Client ID: refreshes the token, plays through a sleeping device, queues and likes', { options: { spotifyClientId: 'client123' } }, async ($, on) => {
    mock.env(on, { OS: 'Linux' })
    mock.clock(on, { now: 1_000_000 })
    mock.store(on, {
      spotify: { accessToken: 'old', refreshToken: 'refresh-1', expiresAt: 0, name: 'Rob', product: 'premium' },
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('tool.register', (_$, e) => ({ value: { tool: `mcp__claude-dj__${e.name}` } }))

    const calls: string[] = []
    let isActive = false
    on('http.fetch', (_$, e) => {
      const method = e.init?.method ?? 'GET'
      const url = new URL(e.url)
      calls.push(`${method} ${url.pathname}${url.search}`)
      const reply = (status: number, value: unknown = '') => ({
        value: { status, ok: status < 300, headers: {}, text: typeof value === 'string' ? value : JSON.stringify(value) },
      })
      if (url.pathname === '/api/token') return reply(200, { access_token: 'fresh', expires_in: 3600 })
      if (e.init?.headers?.authorization !== 'Bearer fresh') return reply(401, { error: { message: 'bad token' } })
      if (url.pathname === '/v1/search') return reply(200, SEARCH)
      if (url.pathname === '/v1/me/player/play') {
        if (!isActive && url.searchParams.get('device_id') === null) return reply(404, { error: { reason: 'NO_ACTIVE_DEVICE' } })
        isActive = true
        return reply(204)
      }
      if (url.pathname === '/v1/me/player/devices') {
        return reply(200, { devices: [{ id: 'pc', name: 'DESKTOP', type: 'Computer', is_active: isActive }] })
      }
      if (url.pathname === '/v1/me/player/queue') return reply(204)
      if (url.pathname === '/v1/me/player/currently-playing') {
        return reply(200, { item: { uri: `spotify:track:${TRACK_ID}`, name: 'One More Time' } })
      }
      if (url.pathname === '/v1/me/library') return reply(200)

      return reply(404, { error: { message: 'unexpected' } })
    })

    await $.session.start({ cwd: '/work' } as never)

    const played = await $.command.run({ command: 'play', args: 'daft punk one more time' } as never)
    expect(String(played.text)).toBe('Playing One More Time — Daft Punk (Discovery) on Spotify.')
    expect(calls).toContain('PUT /v1/me/player/play?device_id=pc')

    const playlist = await $.tool.call({ tool: 'mcp__claude-dj__spotify_play', query: 'lofi', type: 'playlist' } as never)
    expect(String(playlist.result)).toBe('Playing lofi beats — Spotify on Spotify.')

    const found = await $.tool.call({ tool: 'mcp__claude-dj__spotify_search', query: 'daft punk' } as never)
    expect(String(found.result)).toBe(`1. One More Time — Daft Punk (Discovery) spotify:track:${TRACK_ID}`)

    const queued = await $.command.run({ command: 'spotify', args: `queue spotify:track:${TRACK_ID}` } as never)
    expect(String(queued.text)).toBe(`Queued spotify:track:${TRACK_ID}.`)
    expect(calls).toContain(`POST /v1/me/player/queue?uri=spotify%3Atrack%3A${TRACK_ID}`)

    const liked = await $.tool.call({ tool: 'mcp__claude-dj__spotify_like' } as never)
    expect(String(liked.result)).toBe('Liked "One More Time": it is in your Liked Songs.')
    expect(calls).toContain(`PUT /v1/me/library?uris=spotify%3Atrack%3A${TRACK_ID}`)

    // The token was refreshed once and then reused.
    expect(calls.filter(call => call.startsWith('POST /api/token')).length).toBe(1)

    const devices = await $.command.run({ command: 'spotify', args: 'devices' } as never)
    expect(String(devices.text)).toContain('▶ DESKTOP (Computer)')
  })
})
