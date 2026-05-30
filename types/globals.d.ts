/**
 * Global type declarations for runtime objects injected by SillyTavern
 * and CDN-loaded libraries. None of these are importable — they live on
 * the global scope at runtime. This file makes TypeScript aware of them
 * so VS Code stops flagging them as unknown identifiers.
 *
 * Only the shapes actually used in this extension are described.
 * Unknown / rarely-used properties fall back to `any`.
 */

// ─── SillyTavern ─────────────────────────────────────────────────────────────

/** Primary entry point for all SillyTavern extension APIs. */
declare const SillyTavern: {
    getContext(): SillyTavernContext;
};

interface SillyTavernContext {
    /** Current ST character (the active chat partner). */
    name: string;
    characterId: number | undefined;
    characters: Array<{ name: string; avatar: string; [key: string]: unknown }>;
    chat: Array<{
        mes?: string;
        name?: string;
        role?: string;
        is_user?: boolean;
        extra?: Record<string, unknown>;
    }>;

    /** Chat-completion model settings. */
    chatCompletionSettings: {
        chat_completion_source: string;
        openai_max_tokens: number;
        [key: string]: unknown;
    };

    /** Return auth headers for every fetch call. */
    getRequestHeaders(): Record<string, string>;

    /** Return the currently selected model identifier. */
    getChatCompletionModel(): string;

    /**
     * Send a prompt to the active model without adding it to the visible chat.
     * Available on some ST versions; may be undefined on others.
     */
    generateQuietPrompt?(prompt: string): Promise<string | undefined>;

    /** ST event system — used for listening to chat/character changes. */
    eventSource?: {
        on(event: string, callback: (...args: unknown[]) => void): void;
        off(event: string, callback: (...args: unknown[]) => void): void;
    };
    event_types?: Record<string, string>;

    [key: string]: unknown;
}

// ─── jQuery ───────────────────────────────────────────────────────────────────

/**
 * jQuery global — injected by SillyTavern.
 * Typed as `any` so all jQuery method chains (`.find`, `.val`, `.on`, …)
 * are accepted without needing @types/jquery.
 */
declare const $: any;
declare const jQuery: typeof $;

// ─── CDN libraries ────────────────────────────────────────────────────────────

/** LiteGraph.js node canvas — loaded at runtime from the extension's lib/ folder. */
declare const LiteGraph: any;

/** iro.js v5 color picker — bundled in lib/iro.min.js. */
declare const iro: any;

/** Fuse.js v7 fuzzy search — bundled in lib/fuse.min.js. */
declare const Fuse: any;

/** jsdiff v7 — bundled in lib/diff.min.js. Exposed as `Diff` on the global scope. */
declare const Diff: any;

/** Mermaid.js — diagram renderer, present on some ST versions as a global. */
declare const mermaid: any;

/** localForage — bundled in lib/localforage.min.js. */
declare const localforage: any;

// ─── Window augmentation ─────────────────────────────────────────────────────
//
// SillyTavern and CDN scripts attach objects directly to window at runtime.
// Declaring them here stops "Property X does not exist on Window" errors.

interface Window {
    /** LiteGraph.js — CDN-loaded on demand by _loadScript in chat-files-analyser. */
    LiteGraph: any;
    /** Tailwind CSS Play CDN — injected via <script> in index.html / ST shell. */
    tailwind: any;
    /** localForage — bundled in lib/. Accessed as window.localforage in some paths. */
    localforage: any;
}

// ─── Event augmentation ───────────────────────────────────────────────────────
//
// Event handlers in this codebase use the base Event type, but at runtime the
// browser passes KeyboardEvent, PointerEvent, or MouseEvent. Augmenting Event
// merges in the most-used sub-type properties so TypeScript stops complaining.

interface Event {
    /** KeyboardEvent.key — the logical key name ("Enter", "Escape", …). */
    key:          string;
    /** PointerEvent.pointerId — numeric ID for pointer capture. */
    pointerId:    number;
    /** MouseEvent / PointerEvent horizontal position relative to viewport. */
    clientX:      number;
    /** MouseEvent / PointerEvent vertical position relative to viewport. */
    clientY:      number;
    /** MouseEvent — element the pointer left (for mouseleave/mouseout). */
    relatedTarget: EventTarget | null;
    /** DragEvent — carries the drag data. */
    dataTransfer:  DataTransfer | null;
    /** WheelEvent — vertical scroll delta. */
    deltaY:       number;
    /** WheelEvent — horizontal scroll delta. */
    deltaX:       number;
    /** PointerEvent — offset position within the target element. */
    offsetX:      number;
    offsetY:      number;
}

// ─── EventTarget augmentation ────────────────────────────────────────────────
//
// event.target is typed as EventTarget, but it is always a DOM element in
// our handlers, so .closest() and .classList etc. are safe to call on it.

interface EventTarget {
    closest(selector: string): Element | null;
    classList: DOMTokenList;
    dataset:   DOMStringMap;
    id:        string;
    tagName:   string;
}

// ─── Element augmentation ─────────────────────────────────────────────────────
//
// TypeScript's built-in querySelector() returns Element | null, but our code
// always queries actual HTML elements and accesses HTMLElement / HTMLInputElement
// properties directly. Augmenting Element here avoids hundreds of false-positive
// "Property X does not exist on type Element" errors without touching any JS file.

interface Element {
    // HTMLElement properties
    style:       CSSStyleDeclaration;
    dataset:     DOMStringMap;
    focus(options?: FocusOptions): void;
    blur(): void;

    // Form / input properties
    value:       string;
    disabled:    boolean;
    checked:     boolean;
    placeholder: string;
    spellcheck:  boolean;
    rows:        number;
    hidden:      boolean;
    href:        string;
    type:        string;
    min:         string;
    max:         string;
    step:        string;
    multiple:    boolean;
    accept:      string;
    files:       FileList | null;

    // Text input methods
    select(): void;
    setSelectionRange(start: number, end: number, direction?: string): void;
    setRangeText(replacement: string): void;

    // Event handler shortcuts
    onclick:     ((this: HTMLElement, ev: MouseEvent)    => unknown) | null;
    onchange:    ((this: HTMLElement, ev: Event)         => unknown) | null;
    oninput:     ((this: HTMLElement, ev: Event)         => unknown) | null;
    onkeydown:   ((this: HTMLElement, ev: KeyboardEvent) => unknown) | null;

    // Pointer capture (used for draggable panels)
    setPointerCapture(pointerId: number): void;
    releasePointerCapture(pointerId: number): void;
    hasPointerCapture(pointerId: number): boolean;

    // Scroll
    scrollTop:   number;
    scrollLeft:  number;
    scrollWidth: number;
    scrollHeight: number;
    scrollIntoView(arg?: boolean | ScrollIntoViewOptions): void;

    // Drag-and-drop attribute
    draggable:   boolean;

    // HTML element meta
    title:       string;
    lang:        string;

    // Media / resource
    src:         string;
    alt:         string;

    // jQuery methods that may be called on elements obtained via jQuery selectors.
    // Typed as any so .find(), .val(), .on(), .off(), .trigger() etc. all pass.
    find:    any;
    val:     any;
    on:      any;
    off:     any;
    trigger: any;
    prop:    any;
    attr:    any;
    data:    any;
    css:     any;
    addClass:    any;
    removeClass: any;
    toggleClass: any;
    hasClass:    any;
    closest:     any;
    parents:     any;
    children:    any;
    parent:      any;
    empty:       any;
    html:        any;
    text:        any;
    append:      any;
    prepend:     any;
    remove:      any;
    show:        any;
    hide:        any;
    toggle:      any;
    width:       any;
    height:      any;
    offset:      any;
    position:    any;
    scrollTop:   any;
    scrollLeft:  any;
    is:          any;
    each:        any;
    not:         any;
    eq:          any;
    first:       any;
    last:        any;
    length:      any;
}
