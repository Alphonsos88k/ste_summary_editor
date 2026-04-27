#!/usr/bin/env bash
# ============================================================
# Summary Editor — Deploy Script (Bash)
#
# Copies extension files into SillyTavern's third-party
# extensions folder, or removes them. The SillyTavern path
# is read from "remote_st_path" in summary-editor.code-workspace
# (gitignored). Use --set-path to update it.
#
# Usage:
#   bash deploy.sh                          # Copy (default)
#   bash deploy.sh --clean                  # Delete old + copy fresh
#   bash deploy.sh --delete                 # Remove only
#   bash deploy.sh --set-path "/path/to/st/extensions/third-party"
# ============================================================

set -euo pipefail

# ── CONFIGURATION ─────────────────────────────
# Option 1: Hard-code your path here (leave as-is to use workspace file or flag instead)
ST_EXTENSIONS_DIR="/PUT_YOUR_SILLYTAVERN_PATH_HERE/public/scripts/extensions/third-party"

# Extension folder name (matches the extension ID)
EXT_FOLDER="summary-editor"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE_FILE="${SOURCE_DIR}/summary-editor.code-workspace"

# Files and folders to copy (excludes deploy scripts, CLAUDE.md, .git, etc.)
INCLUDE_ITEMS=(
    "manifest.json"
    "index.js"
    "style.css"
    "settings.html"
    "README.md"
    "src"
    "lib"
    "templates"
    "configs"
)

# ── Color helpers ─────────────────────────────
red()    { echo -e "\033[31m$1\033[0m"; }
green()  { echo -e "\033[32m$1\033[0m"; }
yellow() { echo -e "\033[33m$1\033[0m"; }
cyan()   { echo -e "\033[36m$1\033[0m"; }
gray()   { echo -e "\033[90m$1\033[0m"; }

# ── Handle --set-path (writes to workspace file) ─────

handle_set_path() {
    local new_path="$1"
    new_path="${new_path%/}"

    if [[ ! -d "$new_path" ]]; then
        yellow "WARNING: Directory does not exist yet: $new_path"
    fi

    if [[ ! -f "$WORKSPACE_FILE" ]]; then
        red "ERROR: Workspace file not found: $WORKSPACE_FILE"
        exit 1
    fi

    local escaped_path
    escaped_path=$(printf '%s' "$new_path" | sed 's/\\/\\\\/g; s/[&/]/\\&/g')
    sed -i "s|\"remote_st_path\"[[:space:]]*:[[:space:]]*\"[^\"]*\"|\"remote_st_path\": \"${escaped_path}\"|" "$WORKSPACE_FILE"

    echo ""
    cyan "Path saved to summary-editor.code-workspace:"
    green "  $new_path"
    echo ""
    gray "You can now run: bash deploy.sh --clean"
    exit 0
}

# ── Resolve ST path: hardcoded → workspace fallback ──

resolve_path() {
    if [[ "$ST_EXTENSIONS_DIR" == *"PUT_YOUR_SILLYTAVERN_PATH_HERE"* ]]; then
        # No hardcoded path — try workspace file
        if [[ -f "$WORKSPACE_FILE" ]]; then
            local val
            val=$(grep '"remote_st_path"' "$WORKSPACE_FILE" | sed 's/.*"remote_st_path"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/')
            val=$(printf '%s' "$val" | sed 's/\\\\/\\/g')
            val="${val%$'\r'}"
            ST_EXTENSIONS_DIR="$val"
        fi
    fi

    if [[ -z "$ST_EXTENSIONS_DIR" || "$ST_EXTENSIONS_DIR" == *"PUT_YOUR_SILLYTAVERN_PATH_HERE"* ]]; then
        red "ERROR: SillyTavern path not configured."
        echo ""
        yellow "Options:"
        gray "  1. Edit ST_EXTENSIONS_DIR in scripts/deploy.sh"
        gray '  2. Run: bash deploy.sh --set-path "/path/to/SillyTavern/public/scripts/extensions/third-party"'
        gray "  3. Set remote_st_path in summary-editor.code-workspace"
        exit 1
    fi
}

# ── Verify directory exists ───────────────────

verify_config() {
    if [[ ! -d "$ST_EXTENSIONS_DIR" ]]; then
        red "ERROR: ST extensions directory not found: $ST_EXTENSIONS_DIR"
        yellow "Check that your SillyTavern path is correct, or update it with:"
        gray '  bash deploy.sh --set-path "<your-st-path>/public/scripts/extensions/third-party"'
        exit 1
    fi
}

# ── Functions ─────────────────────────────────

remove_extension() {
    local target="${ST_EXTENSIONS_DIR}/${EXT_FOLDER}"
    if [[ -d "$target" ]]; then
        rm -rf "$target"
        yellow "DELETED: $target"
    else
        gray "Nothing to delete (folder does not exist): $target"
    fi
}

copy_extension() {
    local target="${ST_EXTENSIONS_DIR}/${EXT_FOLDER}"
    mkdir -p "$target"

    for item in "${INCLUDE_ITEMS[@]}"; do
        local src="${SOURCE_DIR}/${item}"
        local dest="${target}/${item}"

        if [[ -e "$src" ]]; then
            if [[ -d "$src" ]]; then
                cp -r "$src" "$dest"
                green "  COPIED: ${item}/ -> ${dest}"
            else
                cp "$src" "$dest"
                green "  COPIED: ${item} -> ${dest}"
            fi
        else
            gray "  SKIPPED (not found): ${item}"
        fi
    done

    echo ""
    cyan "Deployed to: $target"
}

# ── Main ──────────────────────────────────────

ACTION="${1:-}"

# Handle --set-path before anything else (doesn't need config verification)
if [[ "$ACTION" == "--set-path" ]]; then
    if [[ -z "${2:-}" ]]; then
        red "ERROR: --set-path requires a path argument."
        echo "Usage: bash deploy.sh --set-path \"/path/to/extensions/third-party\""
        exit 1
    fi
    handle_set_path "$2"
fi

resolve_path
verify_config

TARGET_DIR="${ST_EXTENSIONS_DIR}/${EXT_FOLDER}"

echo ""
cyan "Summary Editor — Deploy Script"
echo "Source:  $SOURCE_DIR"
echo "Target:  $TARGET_DIR"
echo ""

case "$ACTION" in
    --delete)
        remove_extension
        ;;
    --clean)
        remove_extension
        echo ""
        copy_extension
        ;;
    --copy|"")
        copy_extension
        ;;
    *)
        red "Unknown flag: $ACTION"
        echo "Usage: bash deploy.sh [--copy|--clean|--delete|--set-path <path>]"
        exit 1
        ;;
esac

echo ""
green "Done."
