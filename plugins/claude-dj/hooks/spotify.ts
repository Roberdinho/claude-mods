// Pure helpers for the Spotify Web API: sign-in (PKCE), what the person
// typed, what Spotify answered. The hooks module makes the calls.

export const API = 'https://api.spotify.com/v1'
export const ACCOUNTS = 'https://accounts.spotify.com'
/** The loopback port the sign-in listens on; the redirect URI the app must register. */
export const PORT = 43117
export const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`
export const SCOPES = [
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-modify',
]

export const KINDS = ['track', 'album', 'artist', 'playlist'] as const
export type Kind = (typeof KINDS)[number]

export type Tokens = {
  accessToken: string
  refreshToken: string
  /** Milliseconds since the epoch. */
  expiresAt: number
}

export type Account = Tokens & {
  name: string
  /** `premium`, `free`, ... as Spotify reports it; playback control needs premium. */
  product: string
}

/** The account as `$.store` holds it, or undefined for anything else. */
export function asAccount(value: unknown): Account | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const o = value as Record<string, unknown>
  const isAccount =
    typeof o.accessToken === 'string' &&
    typeof o.refreshToken === 'string' &&
    typeof o.expiresAt === 'number' &&
    typeof o.name === 'string' &&
    typeof o.product === 'string'

  return isAccount ? (o as Account) : undefined
}

export type Item = { kind: Kind; uri: string; name: string; by: string; extra: string }

export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function randomText(byteCount: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteCount)))
}

/** A PKCE verifier and its S256 challenge. */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomText(48)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))

  return { verifier, challenge: base64url(new Uint8Array(digest)) }
}

export function authorizeUrl(clientId: string, challenge: string, state: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES.join(' '),
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })

  return `${ACCOUNTS}/authorize?${query.toString()}`
}

export function codeExchangeBody(clientId: string, code: string, verifier: string): string {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
  }).toString()
}

export function refreshBody(clientId: string, refreshToken: string): string {
  return new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }).toString()
}

const asObject = (text: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** The token endpoint's answer; a refresh may leave the refresh token out, so the old one stays. */
export function parseTokens(text: string, now: number, previousRefresh = ''): Tokens | { error: string } {
  const o = asObject(text)
  if (typeof o.access_token !== 'string') {
    const said = typeof o.error_description === 'string' ? o.error_description : typeof o.error === 'string' ? o.error : 'no token'
    return { error: said }
  }
  const seconds = typeof o.expires_in === 'number' ? o.expires_in : 3600

  return {
    accessToken: o.access_token,
    refreshToken: typeof o.refresh_token === 'string' ? o.refresh_token : previousRefresh,
    expiresAt: now + seconds * 1000,
  }
}

/** What Spotify's error body says, in words for the person. */
export function errorText(status: number, text: string): string {
  const o = asObject(text)
  const error = typeof o.error === 'object' && o.error !== null ? (o.error as Record<string, unknown>) : {}
  const reason = typeof error.reason === 'string' ? error.reason : ''
  const message = typeof error.message === 'string' ? error.message : ''
  if (reason === 'PREMIUM_REQUIRED') return 'Spotify only lets Premium accounts control playback.'
  if (reason === 'NO_ACTIVE_DEVICE') return 'Spotify is not open on any device.'
  if (status === 401) return 'Spotify signed you out; run /spotify login again.'
  if (status === 403) return `Spotify refused: ${message || 'not allowed'}.`
  if (status === 429) return 'Spotify says too many requests; try again in a minute.'

  return `Spotify answered ${status}${message === '' ? '' : `: ${message}`}.`
}

export const isNoActiveDevice = (status: number, text: string): boolean =>
  status === 404 && text.includes('NO_ACTIVE_DEVICE')

/**
 * A Spotify URI or open.spotify.com link the person pasted, as a URI;
 * undefined for anything else (which is then a search).
 */
export function spotifyUri(text: string): string | undefined {
  const trimmed = text.trim()
  const uri = /^spotify:(track|album|artist|playlist|episode|show):([A-Za-z0-9]{22})$/.exec(trimmed)
  if (uri) return trimmed
  const link = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|artist|playlist|episode|show)\/([A-Za-z0-9]{22})/.exec(trimmed)

  return link ? `spotify:${link[1]}:${link[2]}` : undefined
}

export const kindOfUri = (uri: string): string => uri.split(':')[1] ?? ''

const names = (list: unknown): string =>
  Array.isArray(list)
    ? list
        .map(one => (typeof one === 'object' && one !== null ? (one as Record<string, unknown>).name : undefined))
        .filter((name): name is string => typeof name === 'string')
        .join(', ')
    : ''

/** The items of a search answer, of one kind, in Spotify's order. */
export function searchItems(text: string, kind: Kind): Item[] {
  const o = asObject(text)
  const group = o[`${kind}s`]
  const raw = typeof group === 'object' && group !== null ? (group as Record<string, unknown>).items : undefined
  if (!Array.isArray(raw)) return []
  const items: Item[] = []
  for (const entry of raw) {
    // Spotify leaves holes (null) in playlist results.
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    if (typeof e.uri !== 'string' || typeof e.name !== 'string') continue
    const album = typeof e.album === 'object' && e.album !== null ? (e.album as Record<string, unknown>) : {}
    const owner = typeof e.owner === 'object' && e.owner !== null ? (e.owner as Record<string, unknown>) : {}
    const by =
      kind === 'playlist'
        ? typeof owner.display_name === 'string'
          ? owner.display_name
          : ''
        : names(e.artists)
    const extra = kind === 'track' && typeof album.name === 'string' ? album.name : ''
    items.push({ kind, uri: e.uri, name: e.name, by, extra })
  }

  return items
}

export function itemLine(item: Item): string {
  const by = item.by === '' ? '' : ` — ${item.by}`
  const extra = item.extra === '' ? '' : ` (${item.extra})`

  return `${item.name}${by}${extra}`
}

export type Device = { id: string; name: string; type: string; isActive: boolean; volume: number | null }

export function parseDevices(text: string): Device[] {
  const raw = asObject(text).devices
  if (!Array.isArray(raw)) return []
  const devices: Device[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.name !== 'string') continue
    devices.push({
      id: e.id,
      name: e.name,
      type: typeof e.type === 'string' ? e.type : '',
      isActive: e.is_active === true,
      volume: typeof e.volume_percent === 'number' ? e.volume_percent : null,
    })
  }

  return devices
}

/** The device to wake when none plays: this computer first, then any. */
export function pickDevice(devices: Device[]): Device | undefined {
  return devices.find(one => one.isActive) ?? devices.find(one => one.type === 'Computer') ?? devices[0]
}

/** The URI and name of what Spotify plays now, from currently-playing. */
export function currentItem(text: string): { uri: string; name: string } | undefined {
  const item = asObject(text).item
  if (typeof item !== 'object' || item === null) return undefined
  const e = item as Record<string, unknown>

  return typeof e.uri === 'string' && typeof e.name === 'string' ? { uri: e.uri, name: e.name } : undefined
}

export function parseAccount(text: string): { name: string; product: string } {
  const o = asObject(text)
  const name = typeof o.display_name === 'string' && o.display_name !== '' ? o.display_name : typeof o.id === 'string' ? o.id : 'you'

  return { name, product: typeof o.product === 'string' ? o.product : '' }
}

export type SpotifyCommand =
  | { verb: 'status' | 'login' | 'logout' | 'like' | 'devices' }
  | { verb: 'play'; kind: Kind; query: string }
  | { verb: 'queue'; query: string }
  | { verb: 'device'; name: string }

/** `/spotify …`: a verb and what follows; bare words play the best matching track. */
export function spotifyCommandOf(args: string): SpotifyCommand {
  const text = args.trim()
  const [first = '', ...rest] = text.split(/\s+/)
  const word = first.toLowerCase()
  const tail = rest.join(' ')
  if (text === '' || word === 'status') return { verb: 'status' }
  if (word === 'login' || word === 'logout' || word === 'like' || word === 'devices') return { verb: word }
  if (word === 'queue' || word === 'add') return { verb: 'queue', query: tail }
  if (word === 'device') return { verb: 'device', name: tail }
  if (word === 'play') return { verb: 'play', kind: 'track', query: tail }
  const kind = KINDS.find(one => one === word)
  if (kind !== undefined && tail !== '') return { verb: 'play', kind, query: tail }

  return { verb: 'play', kind: 'track', query: text }
}

/** The loopback page that catches Spotify's redirect: prints `{code}` or `{error}` once, then exits. */
export const CALLBACK_LISTENER = String.raw`param([Parameter(Mandatory = $true)][int]$Port, [Parameter(Mandatory = $true)][string]$State)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$crlf = "$([char]13)$([char]10)"
function Emit($value) {
  [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
$listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } catch { Emit ([ordered]@{ error = "port $Port is busy" }); exit 1 }
$deadline = (Get-Date).AddMinutes(5)
try {
  while ((Get-Date) -lt $deadline) {
    if (-not $listener.Pending()) { Start-Sleep -Milliseconds 200; continue }
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $first = $reader.ReadLine()
    $target = if ($null -eq $first) { '' } else { ($first -split ' ')[1] }
    $query = @{}
    if ($target -match '\?(.*)$') {
      foreach ($pair in ($Matches[1] -split '&')) {
        $kv = $pair -split '=', 2
        if ($kv.Count -eq 2) { $query[[Uri]::UnescapeDataString($kv[0])] = [Uri]::UnescapeDataString($kv[1].Replace('+', ' ')) }
      }
    }
    $isCallback = "$target".StartsWith('/callback')
    $isOk = $isCallback -and $query['state'] -eq $State -and $query['code']
    $said = if ($isOk) { 'Claude DJ is connected to Spotify. You can close this tab.' } else { 'Spotify sign-in did not finish: ' + [System.Net.WebUtility]::HtmlEncode("$($query['error'])") }
    $html = "<!doctype html><meta charset=utf-8><title>Claude DJ</title><body style='font-family:system-ui,sans-serif;padding:3em'><h2>$said</h2></body>"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
    $head = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK$($crlf)Content-Type: text/html; charset=utf-8$($crlf)Content-Length: $($bytes.Length)$($crlf)Connection: close$($crlf)$($crlf)")
    $stream.Write($head, 0, $head.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
    $client.Close()
    if (-not $isCallback) { continue }
    if ($isOk) { Emit ([ordered]@{ code = $query['code'] }) }
    elseif ($query['state'] -ne $State) { Emit ([ordered]@{ error = 'the sign-in answer did not match; run /spotify login again' }) }
    else { Emit ([ordered]@{ error = "$($query['error'])" }) }
    exit 0
  }
  Emit ([ordered]@{ error = 'nobody signed in within 5 minutes' })
} finally {
  $listener.Stop()
}
`

export const listenerArgv = (script: string, state: string): string[] => [
  'powershell.exe',
  '-NoProfile',
  '-NonInteractive',
  '-WindowStyle',
  'Hidden',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  script,
  '-Port',
  String(PORT),
  '-State',
  state,
]

/** Opens a URL (https or spotify:) with the default handler; argv, no shell, so `&` stays in it. */
export const openArgv = (url: string): string[] => ['rundll32.exe', 'url.dll,FileProtocolHandler', url]

/** What the listener printed: the code, or why there is none. */
export function parseCallback(line: string): { code: string } | { error: string } | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return undefined
  const o = asObject(trimmed)
  if (typeof o.code === 'string' && o.code !== '') return { code: o.code }
  if (typeof o.error === 'string') return { error: o.error === '' ? 'sign-in cancelled' : o.error }

  return undefined
}
