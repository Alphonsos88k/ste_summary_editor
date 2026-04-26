<#
.SYNOPSIS
    Deploy or clean the Summary Editor extension to your SillyTavern installation.

.DESCRIPTION
    Copies extension files into SillyTavern's third-party extensions folder,
    or removes them. Your SillyTavern path is stored in scripts/deploy.config
    (gitignored) so it is never committed. Use --set-path to write it there.

.PARAMETER Action
    --copy      (default) Copy extension files to the target directory.
    --clean     Delete the existing extension folder, then copy fresh.
    --delete    Only remove the extension folder (no copy).
    --set-path  Save your SillyTavern extensions path to deploy.config.

.EXAMPLE
    .\deploy.ps1                                                    # Copy (default)
    .\deploy.ps1 --clean                                            # Delete old + copy fresh
    .\deploy.ps1 --delete                                           # Remove only
    .\deploy.ps1 --set-path "<path>\public\scripts\extensions\third-party"
#>

param(
    [switch]$clean,
    [switch]$delete,
    [string]$setPath
)

# Extension folder name (matches the extension ID)
$EXT_FOLDER    = "summary-editor"
$SourceDir     = Split-Path $PSScriptRoot -Parent
$ConfigFile    = Join-Path $PSScriptRoot "deploy.config"

# -- Handle --set-path ------------------------

if ($setPath) {
    $resolvedPath = $setPath.TrimEnd('\').TrimEnd('/')

    if (-not (Test-Path $resolvedPath)) {
        Write-Host "WARNING: Directory does not exist yet: $resolvedPath" -ForegroundColor Yellow
        $confirm = Read-Host "Save this path anyway? (y/N)"
        if ($confirm -ne 'y' -and $confirm -ne 'Y') {
            Write-Host "Aborted." -ForegroundColor Gray
            exit 0
        }
    }

    # Write to deploy.config (gitignored) — never touches the script itself
    $configContent = "ST_EXTENSIONS_DIR=$resolvedPath"
    Set-Content -Path $ConfigFile -Value $configContent -Encoding utf8

    Write-Host ""
    Write-Host "Path saved to scripts/deploy.config:" -ForegroundColor Cyan
    Write-Host "  $resolvedPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now run: .\deploy.ps1" -ForegroundColor Gray
    exit 0
}

# -- Load path from deploy.config -------------

$ST_EXTENSIONS_DIR = ""
if (Test-Path $ConfigFile) {
    Get-Content $ConfigFile | Where-Object { $_ -match '^ST_EXTENSIONS_DIR\s*=\s*(.+)$' } | ForEach-Object {
        $ST_EXTENSIONS_DIR = $Matches[1].Trim()
    }
}

$TargetDir = Join-Path $ST_EXTENSIONS_DIR $EXT_FOLDER

# Verify the ST path is configured
if ([string]::IsNullOrWhiteSpace($ST_EXTENSIONS_DIR)) {
    Write-Host "ERROR: SillyTavern path not configured." -ForegroundColor Red
    Write-Host ""
    Write-Host "Set it with:" -ForegroundColor Yellow
    Write-Host '  .\deploy.ps1 --set-path "<your-st-path>\public\scripts\extensions\third-party"' -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or copy scripts/deploy.config.example to scripts/deploy.config and fill in the path." -ForegroundColor Gray
    exit 1
}

# Verify the ST extensions directory exists
if (-not (Test-Path $ST_EXTENSIONS_DIR)) {
    Write-Host "ERROR: ST extensions directory not found: $ST_EXTENSIONS_DIR" -ForegroundColor Red
    Write-Host "Check that your SillyTavern path is correct, or update it with:" -ForegroundColor Yellow
    Write-Host "  .\deploy.ps1 --set-path `"<your-st-path>\public\scripts\extensions\third-party`"" -ForegroundColor Gray
    exit 1
}

# Files and folders to copy (excludes deploy scripts, CLAUDE.md, .git, etc.)
$IncludeItems = @(
    "manifest.json",
    "index.js",
    "style.css",
    "settings.html",
    "README.md",
    "src",
    "lib",
    "templates",
    "configs"
)

function Remove-Extension {
    if (Test-Path $TargetDir) {
        Remove-Item -Recurse -Force $TargetDir
        Write-Host "DELETED: $TargetDir" -ForegroundColor Yellow
    } else {
        Write-Host "Nothing to delete (folder does not exist): $TargetDir" -ForegroundColor Gray
    }
}

function Copy-Extension {
    # Create the target directory
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

    foreach ($item in $IncludeItems) {
        $sourcePath = Join-Path $SourceDir $item
        $destPath = Join-Path $TargetDir $item

        if (Test-Path $sourcePath) {
            if ((Get-Item $sourcePath).PSIsContainer) {
                # Copy directory recursively
                Copy-Item -Recurse -Force $sourcePath $destPath
                Write-Host "  COPIED: $item/ -> $destPath" -ForegroundColor Green
            } else {
                Copy-Item -Force $sourcePath $destPath
                Write-Host "  COPIED: $item -> $destPath" -ForegroundColor Green
            }
        } else {
            Write-Host "  SKIPPED (not found): $item" -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Host "Deployed to: $TargetDir" -ForegroundColor Cyan
}

# -- Execute based on flags --------------------

Write-Host ""
Write-Host "Summary Editor - Deploy Script" -ForegroundColor Cyan
Write-Host "Source:  $SourceDir"
Write-Host "Target:  $TargetDir"
Write-Host ""

if ($delete) {
    Remove-Extension
} elseif ($clean) {
    Remove-Extension
    Write-Host ""
    Copy-Extension
} else {
    Copy-Extension
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
