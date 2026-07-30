# Install the packaged Windows NSIS build for smoke testing.
#
#   usage: install-windows.ps1 -DistDir <dir>
#   stdout (last line): absolute path to ExifCleaner.exe
#   stderr: progress logs
#
# Targets the NSIS installer rather than the portable .exe deliberately. The portable
# target is an NSIS self-extracting wrapper that unpacks to %TEMP% and spawns the app
# as a CHILD process; Playwright's _electron.launch reads the launched process's stdout
# for the CDP WebSocket endpoint, which the wrapper does not reliably forward. NSIS is
# also the artifact most users actually download, so coverage is worth more there.

[CmdletBinding()]
param(
	[Parameter(Mandatory = $true)]
	[string]$DistDir
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DistDir)) {
	Write-Error "no such dist dir: $DistDir"
	exit 1
}

# The portable build also matches *.exe, so match the NSIS installer specifically.
$setup = Get-ChildItem -Path $DistDir -Filter "*Setup*.exe" | Select-Object -First 1
if ($null -eq $setup) {
	Write-Error "no NSIS installer (*Setup*.exe) found in $DistDir"
	Get-ChildItem -Path $DistDir | Out-String | Write-Host
	exit 1
}

[Console]::Error.WriteLine("==> installing $($setup.Name) silently")

# /S is a native NSIS switch, not an electron-builder extension.
$accessViolationExitCode = -1073741819 # 0xC0000005
$maxInstallAttempts = 2

for ($attempt = 1; $attempt -le $maxInstallAttempts; $attempt++) {
	$installProcess = Start-Process -FilePath $setup.FullName -ArgumentList "/S" -Wait -PassThru
	if ($installProcess.ExitCode -eq 0) {
		break
	}

	# Hosted Windows runners can transiently terminate the freshly built NSIS
	# bootstrapper with an access violation while security scanning settles.
	# Retry only that exact failure once; every other installer error remains fatal.
	if ($installProcess.ExitCode -ne $accessViolationExitCode -or $attempt -eq $maxInstallAttempts) {
		Write-Error "NSIS installer exited with code $($installProcess.ExitCode) on attempt $attempt"
		exit 1
	}

	[Console]::Error.WriteLine(
		"==> NSIS installer hit access violation on attempt $attempt; retrying once after 5 seconds"
	)
	Start-Sleep -Seconds 5
}

# build.nsis sets runAfterFinish:false so nothing should be running, but stop any
# stray instance anyway. The cost of this redundancy is two seconds; the cost of the
# single-instance deadlock is a hung job that burns the full timeout and produces no
# diagnostics.
Stop-Process -Name "ExifCleaner" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# oneClick + perMachine:false installs per-user under LOCALAPPDATA\Programs.
$expected = Join-Path $env:LOCALAPPDATA "Programs\ExifCleaner\ExifCleaner.exe"

$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-Path $expected) -and (Get-Date) -lt $deadline) {
	Start-Sleep -Milliseconds 500
}

if (-not (Test-Path $expected)) {
	[Console]::Error.WriteLine("==> not at the expected path, searching")
	$found = Get-ChildItem -Path $env:LOCALAPPDATA, $env:PROGRAMFILES `
		-Filter "ExifCleaner.exe" -Recurse -ErrorAction SilentlyContinue |
		Select-Object -First 1
	if ($null -eq $found) {
		Write-Error "ExifCleaner.exe not found after silent install (expected $expected)"
		exit 1
	}
	$expected = $found.FullName
}

[Console]::Error.WriteLine("==> installed OK")
Write-Output $expected
