import { HEIGHT, WIDTH } from './polaroid'

// Pure helpers for the host side: which programs to run and with what. The
// hooks module runs them, since only it holds `$`.

export type Platform = 'windows' | 'mac' | 'linux'

export const slashes = (path: string): string => path.replaceAll('\\', '/')

export const BROWSERS: Record<Platform, readonly string[]> = {
  windows: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ],
  mac: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
  ],
}

export const pageHtml = (svg: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body>${svg}</body></html>`

export const fileUrl = (path: string): string =>
  `file:///${slashes(path).replace(/^\//, '')}`.replaceAll(' ', '%20')

/** A headless Chromium screenshot of the page at 2x, transparent where the SVG is. */
export const screenshotArgv = (browser: string, page: string, png: string, profile: string): string[] => [
  browser,
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-component-update',
  '--disable-background-networking',
  '--disable-sync',
  `--user-data-dir=${profile}`,
  '--default-background-color=00000000',
  '--force-device-scale-factor=2',
  `--window-size=${WIDTH},${HEIGHT}`,
  `--screenshot=${png}`,
  fileUrl(page),
]

/** Puts the PNG itself (not its path) on the system clipboard. */
export const copyImageArgv = (os: Platform, png: string): string[] => {
  if (os === 'windows') {
    const path = png.replaceAll('/', '\\').replaceAll("'", "''")

    return [
      'powershell.exe',
      '-NoProfile',
      '-STA',
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${path}'))`,
    ]
  }
  if (os === 'mac') return ['osascript', '-e', `set the clipboard to (read (POSIX file "${png}") as «class PNGf»)`]

  return ['xclip', '-selection', 'clipboard', '-t', 'image/png', '-i', png]
}

export const revealArgv = (os: Platform, folder: string): string[] => {
  if (os === 'windows') return ['explorer.exe', folder.replaceAll('/', '\\')]

  return [os === 'mac' ? 'open' : 'xdg-open', folder]
}
