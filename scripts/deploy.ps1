<#
.SYNOPSIS
    Deploy or clean the Summary Editor extension to your SillyTavern installation.

.DESCRIPTION
    Copies extension files into SillyTavern's third-party extensions folder,
    or removes them. The SillyTavern path is read from the "remote_st_path" key
    in summary-editor.code-workspace (gitignored). Use --set-path to update it.

.PARAMETER Action
    --copy      (default) Copy extension files to the target directory.
    --clean     Delete the existing extension folder, then copy fresh.
    --delete    Only remove the extension folder (no copy).
    --set-path  Update remote_st_path in the workspace file.

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

# -- CONFIGURATION -----------------------------
# Option 1: Hard-code your path here (leave as-is to use workspace file or flag instead)
$ST_EXTENSIONS_DIR = "/PUT_YOUR_SILLYTAVERN_PATH_HERE/public/scripts/extensions/third-party"

# Extension folder name (matches the extension ID)
$EXT_FOLDER = "summary-editor"
# ----------------------------------------------

$SourceDir = Split-Path $PSScriptRoot -Parent
$WorkspaceFile = Join-Path $SourceDir "summary-editor.code-workspace"

# -- Handle -setPath (writes to workspace file) ------

if ($setPath) {
    $resolvedPath = $setPath.TrimEnd('\').TrimEnd('/')

    if (-not (Test-Path $resolvedPath)) {
        Write-Host "WARNING: Directory does not exist yet: $resolvedPath" -ForegroundColor Yellow
    }

    if (-not (Test-Path $WorkspaceFile)) {
        Write-Host "ERROR: Workspace file not found: $WorkspaceFile" -ForegroundColor Red
        exit 1
    }

    $raw = Get-Content $WorkspaceFile -Raw
    $escaped = $resolvedPath -replace '\\', '\\\\'
    $raw = $raw -replace '("remote_st_path"\s*:\s*)"[^"]*"', "`$1`"$escaped`""
    Set-Content -Path $WorkspaceFile -Value $raw -NoNewline -Encoding utf8

    Write-Host ""
    Write-Host "Path saved to summary-editor.code-workspace:" -ForegroundColor Cyan
    Write-Host "  $resolvedPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now run: .\deploy.ps1 -clean" -ForegroundColor Gray
    exit 0
}

# -- Resolve ST path: hardcoded → workspace fallback --

if ($ST_EXTENSIONS_DIR -match "PUT_YOUR_SILLYTAVERN_PATH_HERE") {
    # No hardcoded path — extract from workspace file via regex (handles JSONC comments)
    if (Test-Path $WorkspaceFile) {
        $raw = Get-Content $WorkspaceFile -Raw
        $match = [regex]::Match($raw, '"remote_st_path"\s*:\s*"([^"]*)"')
        if ($match.Success) {
            $ST_EXTENSIONS_DIR = $match.Groups[1].Value -replace '\\\\', '\'
        }
    }
}

if (-not $ST_EXTENSIONS_DIR -or $ST_EXTENSIONS_DIR -match "PUT_YOUR_SILLYTAVERN_PATH_HERE" -or $ST_EXTENSIONS_DIR -eq '') {
    Write-Host "ERROR: SillyTavern path not configured." -ForegroundColor Red
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  1. Edit `$ST_EXTENSIONS_DIR in scripts/deploy.ps1" -ForegroundColor Gray
    Write-Host '  2. Run: .\deploy.ps1 -setPath "E:\SillyTavern\public\scripts\extensions\third-party"' -ForegroundColor Gray
    Write-Host "  3. Set remote_st_path in summary-editor.code-workspace" -ForegroundColor Gray
    exit 1
}

$TargetDir = Join-Path $ST_EXTENSIONS_DIR $EXT_FOLDER

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
