/**
 * @module char-select
 * @description Character card association for the Ingest tab.
 *
 * Renders a slim dashed-border strip below the drop zone allowing the user
 * to optionally associate the ingested files with a SillyTavern character.
 * Blacklisted characters (by avatar or tag) are shown as disabled options.
 * The association is session-only (cleared on page refresh).
 */

import { state } from '../core/state.js';
import { EXT_NAME } from '../core/constants.js';

// ─── Private helpers ─────────────────────────────────────────

function _getBlacklistSettings() {
    const ctx = SillyTavern.getContext();
    return ctx.extensionSettings?.[EXT_NAME] ?? { blacklistedCharacters: [], blacklistedTags: [] };
}

function _isCharBlacklisted(char, charIdx) {
    const settings = _getBlacklistSettings();
    if ((settings.blacklistedCharacters ?? []).includes(char.avatar)) return true;
    const ctx = SillyTavern.getContext();
    const tagIds = (ctx.tagMap?.[charIdx] ?? []).map(t => t.id);
    return tagIds.some(id => (settings.blacklistedTags ?? []).includes(id));
}

function _buildOptions(chars, currentAvatar) {
    return chars.map((char, i) => {
        const blocked  = _isCharBlacklisted(char, i);
        const selected = currentAvatar === char.avatar ? ' selected' : '';
        const disabled = blocked ? ' disabled' : '';
        const label    = char.name + (blocked ? ' — blocked' : '');
        return `<option value="${char.avatar}"${selected}${disabled}>${label}</option>`;
    }).join('');
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Populate the character select dropdown.
 * Defaults to the currently active ST character when no association is set.
 */
export function initCharSelect() {
    const sel = document.getElementById('se-char-select');
    if (!sel) return;

    const ctx   = SillyTavern.getContext();
    const chars = ctx.characters ?? [];

    // Default to current ST character on first open
    if (!state.associatedCharacter && ctx.characterId != null && chars[ctx.characterId]) {
        const cur = chars[ctx.characterId];
        state.associatedCharacter = { name: cur.name, avatar: cur.avatar };
    }

    const currentAvatar = state.associatedCharacter?.avatar ?? '';
    sel.innerHTML = `<option value="">— No character —</option>${_buildOptions(chars, currentAvatar)}`;
    sel.value = currentAvatar;

    sel.removeEventListener('change', _handleChange);
    sel.addEventListener('change', _handleChange);

    _updateStrip(sel);

    // Notify listeners so things like the Chat Files button sync on open/swap
    document.dispatchEvent(new CustomEvent('se:character-changed', { detail: state.associatedCharacter }));
}

/**
 * Re-populate the select (e.g. after CHAT_CHANGED).
 * Preserves the current association if the character still exists.
 */
export function refreshCharSelect() {
    initCharSelect();
}

// ─── Event handler ───────────────────────────────────────────

function _handleChange(e) {
    const avatar = e.target.value;
    if (avatar) {
        const ctx  = SillyTavern.getContext();
        const char = (ctx.characters ?? []).find(c => c.avatar === avatar);
        state.associatedCharacter = char ? { name: char.name, avatar: char.avatar } : null;
    } else {
        state.associatedCharacter = null;
    }
    _updateStrip(e.target);
    document.dispatchEvent(new CustomEvent('se:character-changed', { detail: state.associatedCharacter }));
}

function _updateStrip(sel) {
    const strip   = document.getElementById('se-char-select-strip');
    const portrait = document.getElementById('se-char-portrait');
    if (!strip) return;
    if (state.associatedCharacter) {
        strip.classList.add('se-char-strip-assigned');
        if (portrait) {
            portrait.src = `/characters/${state.associatedCharacter.avatar}`;
            portrait.classList.add('visible');
        }
    } else {
        strip.classList.remove('se-char-strip-assigned');
        if (portrait) {
            portrait.src = '';
            portrait.classList.remove('visible');
        }
    }
}
