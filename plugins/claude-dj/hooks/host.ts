// The host side: the watcher that reads and drives the OS media session.
// The hooks module writes it to a work folder and runs it, since only it holds `$`.

export const slashes = (path: string): string => path.replaceAll('\\', '/')

/** How long the watcher lives without a heartbeat from the session. */
export const HEARTBEAT_MS = 30_000
export const STALE_SECONDS = 120

/**
 * Windows: one long-running Windows PowerShell 5.1 loop over the system media
 * transport controls (SMTC), the same session the volume flyout shows. It
 * prints a JSON line whenever the track or play state changes, and runs each
 * `<dir>/commands/*.cmd` file (one command line) it finds, oldest first.
 * Volume is the default output device's (Core Audio): Windows does not let
 * one process set another app's mixer level through its media session.
 * Kept ASCII: PowerShell 5.1 reads a script without a BOM as ANSI.
 */
export const WINDOWS_WATCHER = String.raw`param([Parameter(Mandatory = $true)][string]$Dir)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace ClaudeDj {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    void EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    void GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    void Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    void RegisterControlChangeNotify(IntPtr notify);
    void UnregisterControlChangeNotify(IntPtr notify);
    void GetChannelCount(out uint count);
    void SetMasterVolumeLevel(float levelDb, ref Guid context);
    void SetMasterVolumeLevelScalar(float level, ref Guid context);
    void GetMasterVolumeLevel(out float levelDb);
    void GetMasterVolumeLevelScalar(out float level);
    void SetChannelVolumeLevel(uint channel, float levelDb, ref Guid context);
    void SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
    void GetChannelVolumeLevel(uint channel, out float levelDb);
    void GetChannelVolumeLevelScalar(uint channel, out float level);
    void SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    void GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  // The default output device's volume: what the volume keys and the taskbar flyout change.
  public static class Volume {
    static Guid none = Guid.Empty;

    static IAudioEndpointVolume Endpoint() {
      var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
      IMMDevice device;
      enumerator.GetDefaultAudioEndpoint(0, 1, out device);
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object o;
      device.Activate(ref iid, 23, IntPtr.Zero, out o);
      return (IAudioEndpointVolume)o;
    }

    public static int Level() {
      float level;
      Endpoint().GetMasterVolumeLevelScalar(out level);
      return (int)Math.Round(level * 100);
    }

    public static bool IsMuted() {
      bool muted;
      Endpoint().GetMute(out muted);
      return muted;
    }

    // Sets the level (0..100), or changes it by that much; a change of level
    // unmutes, as the volume flyout does.
    public static void Set(int level, bool relative) {
      int target = relative ? Level() + level : level;
      var endpoint = Endpoint();
      endpoint.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, target)) / 100f, ref none);
      endpoint.SetMute(false, ref none);
    }

    public static void Mute(bool mute) {
      Endpoint().SetMute(mute, ref none);
    }
  }
}
'@
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $task.Wait(5000)) { throw 'media session call timed out' }
  $task.Result
}
$Manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$Props = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ($Manager::RequestAsync()) $Manager

$commands = Join-Path $Dir 'commands'
$heartbeat = Join-Path $Dir 'heartbeat'
New-Item -ItemType Directory -Force -Path $commands | Out-Null
$script:chosen = ''

function Emit($value) {
  [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function HasArtist($session) {
  try { return "$((Await ($session.TryGetMediaPropertiesAsync()) $Props).Artist)" -ne '' } catch { return $false }
}

# The session to show and drive: one that plays (music, with an artist, over
# an app that only says it plays), else the one shown last, else the one
# Windows calls current.
function Pick {
  $all = @($mgr.GetSessions())
  if ($all.Count -eq 0) { return $null }
  $playing = @($all | Where-Object { "$($_.GetPlaybackInfo().PlaybackStatus)" -eq 'Playing' })
  if ($playing.Count -gt 0) {
    $same = @($playing | Where-Object { $_.SourceAppUserModelId -eq $script:chosen })
    if ($same.Count -gt 0 -and ($playing.Count -eq 1 -or (HasArtist $same[0]))) { return $same[0] }
    $music = @($playing | Where-Object { HasArtist $_ })
    if ($music.Count -gt 0) { return $music[0] }
    return $playing[0]
  }
  $last = @($all | Where-Object { $_.SourceAppUserModelId -eq $script:chosen })
  if ($last.Count -gt 0) { return $last[0] }
  $current = $mgr.GetCurrentSession()
  if ($null -ne $current) { return $current }
  return $all[0]
}

function Run($session, [string]$command) {
  $words = $command.Split(' ')
  $action = $words[0]
  switch ($action) {
    'volume' {
      $amount = $words[1]
      [ClaudeDj.Volume]::Set([int]$amount, ($amount.StartsWith('+') -or $amount.StartsWith('-')))
      return
    }
    'mute' { [ClaudeDj.Volume]::Mute($true); return }
    'unmute' { [ClaudeDj.Volume]::Mute($false); return }
    'togglemute' { [ClaudeDj.Volume]::Mute(-not [ClaudeDj.Volume]::IsMuted()); return }
  }
  if ($null -eq $session) { return }
  switch ($action) {
    'play' { $op = $session.TryPlayAsync() }
    'pause' { $op = $session.TryPauseAsync() }
    'toggle' { $op = $session.TryTogglePlayPauseAsync() }
    'next' { $op = $session.TrySkipNextAsync() }
    'previous' { $op = $session.TrySkipPreviousAsync() }
    default { return }
  }
  [void](Await $op ([bool]))
}

$last = $null
$lastError = ''
while ($true) {
  try {
    if ((Test-Path $heartbeat) -and ((Get-Date) - (Get-Item $heartbeat).LastWriteTime).TotalSeconds -gt ${STALE_SECONDS}) {
      Remove-Item -Recurse -Force $Dir -ErrorAction SilentlyContinue
      exit 0
    }
    $session = Pick
    foreach ($file in @(Get-ChildItem -Path $commands -Filter '*.cmd' | Sort-Object Name)) {
      $command = (Get-Content -Raw -Path $file.FullName).Trim()
      Remove-Item -Force $file.FullName
      Run $session $command
      Start-Sleep -Milliseconds 150
      $session = Pick
    }
    $volume = -1
    $muted = $false
    try {
      $volume = [ClaudeDj.Volume]::Level()
      $muted = [ClaudeDj.Volume]::IsMuted()
    } catch {}
    if ($null -eq $session) {
      $state = [ordered]@{ none = $true; volume = $volume; muted = $muted }
      $key = "none|$volume|$muted"
    } else {
      $script:chosen = $session.SourceAppUserModelId
      $p = Await ($session.TryGetMediaPropertiesAsync()) $Props
      $status = "$($session.GetPlaybackInfo().PlaybackStatus)"
      $t = $session.GetTimelineProperties()
      $state = [ordered]@{
        app = $session.SourceAppUserModelId
        title = "$($p.Title)"
        artist = "$($p.Artist)"
        album = "$($p.AlbumTitle)"
        status = $status
        position = [math]::Round($t.Position.TotalSeconds, 1)
        duration = [math]::Round($t.EndTime.TotalSeconds, 1)
        volume = $volume
        muted = $muted
      }
      $key = "$($state.app)|$($state.title)|$($state.artist)|$($state.album)|$status|$($state.duration)|$volume|$muted"
    }
    if ($key -ne $last) {
      Emit $state
      $last = $key
    }
    $lastError = ''
  } catch {
    $message = "$($_.Exception.Message)"
    if ($message -ne $lastError) { Emit ([ordered]@{ error = $message }) }
    $lastError = $message
  }
  Start-Sleep -Milliseconds 250
}
`

export const windowsWatcherArgv = (script: string, dir: string): string[] => [
  'powershell.exe',
  '-NoProfile',
  '-NonInteractive',
  '-WindowStyle',
  'Hidden',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  script,
  '-Dir',
  dir,
]
