/**
 * @module codex-voxel
 * Three.js voxel character renderer for the Character Codex left page.
 * Requires Three.js at lib/three.module.js — drop the file there to enable.
 *
 * Accessories are objects: { type, color, size, position }
 * Tattoos are objects:     { location, color, pattern, size }
 * Lighting modes:          "standard" | "warm" | "cool" | "dramatic" | "eerie"
 * Backdrop:                array of 0-2 named or free-text scene elements
 */

let THREE = null;

let _renderer      = null;
let _scene         = null;
let _camera        = null;
let _charGroup     = null;
let _backdropGroup = null;
let _animId        = null;
let _autoSpin      = false;
const _drag        = { active: false, lastX: 0 };
let _container     = null;
let _lightAmb      = null;
let _lightDir      = null;
let _lightFill     = null;
let _lightTop      = null;
let _glowDisc      = null;
let _shadowDisc    = null;
let _shadowCatcher = null;
let _toonGrad      = null;
let _glowBg        = null;
let _gridHelper    = null;
let _stageTone     = 'auto';   // 'auto' follows spec lighting; or a named stage
let _resizeObs     = null;
// Limb pivot groups — referenced by idle animation in _loop
let _armL = null, _armR = null, _legL = null, _legR = null;

// ─── Body landmark Y positions ────────────────────────────────────────────

const _Y = {
    HEAD:    2.65,
    HAIR:    3.17,
    CHEST:   1.4,
    HIP:     0.2,
    SHOE:   -0.46,
    COLLAR:  2.05,
    CUFF:    0.8,
};

// ─── Backdrop geometry constants ──────────────────────────────────────────

const _WALL_X = [-3, -2, -1, 0, 1, 2, 3];   // shared wall x-positions

// Cloud cluster shape: [[w, h, d, dx, dy, dz], color] — offsets from cluster centre
/** @type {Array<[number[], string]>} */
const _CLOUD_SHAPE = [
    [[1.4, 0.4, 0.7,  0,    0,    0], '#d8dde8'],
    [[0.9, 0.4, 0.6, -0.6, -0.2,  0], '#b0b8c8'],
    [[0.9, 0.4, 0.6,  0.5, -0.2,  0], '#d8dde8'],
];

// Tree parts: [[w, h, d, yOffset], color] — tx/tz applied per tree position
/** @type {Array<[number[], string]>} */
const _TREE_PARTS = [
    [[0.35, 1.3, 0.35, -0.45], '#5c3a1e'],
    [[1.1,  0.7, 1.1,   0.7 ], '#2d6a2d'],
    [[0.7,  0.6, 0.7,   1.2 ], '#1e4a1e'],
];

// Lake rock positions: [x, y, z]
const _LAKE_ROCKS = [[0.5, -1, 1.8], [2.8, -0.9, 0.5], [3.2, -0.95, 1.6]];

// ─── Hair style geometry data ─────────────────────────────────────────────
// Each entry is an array of [w, h, d, x, y, z] specs, all drawn in hair colour.

// All hair geometry is positioned so NO face coincides with a head face (avoids z-fighting).
// Head outer faces: top y=3.10, back z=-0.45, sides x=±0.45.
// Hair silhouettes are generated procedurally in _addHairMedium (cluster
// system) — no fixed style table.

// ─── Public API ───────────────────────────────────────────────────────────

export async function initVoxel(container, spec) {
    if (!THREE) THREE = await _loadThree();
    if (!THREE) { _showPlaceholder(container); return false; }

    _container = container;
    disposeVoxel();
    _container = container;

    _scene = new THREE.Scene();

    const w = container.offsetWidth  || 200;
    const h = container.offsetHeight || 200;

    // 50° FOV — poster/key-art framing, less wide-angle distortion than 65°
    _camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    _setCamera('front');

    _lightAmb  = new THREE.AmbientLight(0xffffff, 0.15);
    _lightDir  = new THREE.DirectionalLight(0xffffff, 1.2);
    _lightFill = new THREE.DirectionalLight(0x8888ff, 0.3);
    // _lightTop doubles as the RIM light — behind and above the character,
    // the signature edge-glow of Minecraft Dungeons cover art
    _lightTop  = new THREE.DirectionalLight(0xffffff, 0.5);
    _lightDir.position.set(3, 6, 5);
    _lightFill.position.set(-3, 1, -2);
    _lightTop.position.set(-1.5, 5, -6);
    _scene.add(_lightAmb);
    _scene.add(_lightDir);
    _scene.add(_lightFill);
    _scene.add(_lightTop);

    _buildGlow();

    _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    // 2× supersampling on top of device pixel ratio (capped 4×): render at
    // double resolution, browser downscales → crisp MC-Dungeons-style edges.
    // Canvas is small, so the fill-rate cost is negligible.
    _renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * 2, 4));
    // Real shadow mapping — self-shadowing carves the model's definition and
    // grounds it with a true contact shadow (the MC Dungeons render trick)
    _renderer.shadowMap.enabled = true;
    _renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    _lightDir.castShadow = true;
    _lightDir.shadow.mapSize.set(2048, 2048);
    _lightDir.shadow.bias = -0.0005;
    const shCam = _lightDir.shadow.camera;
    shCam.near = 1; shCam.far = 25;
    shCam.left = -7; shCam.right = 7; shCam.top = 9; shCam.bottom = -3;
    shCam.updateProjectionMatrix();
    _renderer.setSize(w, h);
    container.innerHTML = '';
    container.appendChild(_renderer.domElement);

    _charGroup     = _buildCharacter(spec ?? _defaultSpec());
    _backdropGroup = _buildBackdrop(spec ?? _defaultSpec());
    _scene.add(_charGroup);
    _scene.add(_backdropGroup);

    // After builds so stage visibility rules (grid/shadow) apply
    _applyLighting(spec?.lighting ?? 'standard');

    _bindDrag(_renderer.domElement);

    _resizeObs?.disconnect();
    _resizeObs = new ResizeObserver(() => resizeVoxel());
    _resizeObs.observe(container);

    _loop();
    return true;
}

export function disposeVoxel() {
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;
    _resizeObs?.disconnect();
    _resizeObs = null;
    if (_renderer) {
        _renderer.domElement.remove();
        _renderer.dispose();
        _renderer = null;
    }
    if (_charGroup     && _scene) { _scene.remove(_charGroup);     _disposeGroup(_charGroup);     }
    if (_backdropGroup && _scene) { _scene.remove(_backdropGroup); _disposeGroup(_backdropGroup); }
    _charGroup     = null;
    _backdropGroup = null;
    _scene         = null;
    _camera        = null;
    _lightAmb   = null;
    _lightDir   = null;
    _lightFill  = null;
    _lightTop   = null;
    _glowDisc      = null;
    _shadowDisc    = null;
    _shadowCatcher = null;
    _glowBg        = null;
    _gridHelper    = null;
    _armL = null; _armR = null; _legL = null; _legR = null;
    _autoSpin  = false;
}

export function setVoxelSpec(spec) {
    if (!_scene) return;
    if (_charGroup)     { _scene.remove(_charGroup);     _disposeGroup(_charGroup);     }
    if (_backdropGroup) { _scene.remove(_backdropGroup); _disposeGroup(_backdropGroup); }
    _gridHelper    = null;
    _charGroup     = _buildCharacter(spec);
    _backdropGroup = _buildBackdrop(spec);
    _scene.add(_charGroup);
    _scene.add(_backdropGroup);
    // After builds so stage visibility rules apply to the fresh grid
    _applyLighting(spec?.lighting ?? 'standard');
}

export function setView(type) { _setCamera(type); }

export function toggleSpin() {
    _autoSpin = !_autoSpin;
    return _autoSpin;
}

export function resizeVoxel() {
    if (!_renderer || !_camera || !_container) return;
    const w = _container.offsetWidth  || 200;
    const h = _container.offsetHeight || 200;
    _camera.aspect = w / h;
    _camera.updateProjectionMatrix();
    _renderer.setSize(w, h);
}

export function defaultSpec() { return _defaultSpec(); }

// ─── Camera presets ───────────────────────────────────────────────────────

function _setCamera(type) {
    if (!_camera) return;
    // Hero framing: slightly low 3/4 angle looking up at the character,
    // like Minecraft Dungeons cover art — never a flat straight-on mugshot.
    const targets = {
        front:    { pos: [2.4,  0.75, 5.2], look: [0, 1.2, 0] },  // hero 3/4 low angle (default)
        straight: { pos: [0,    1.1,  5.5], look: [0, 1,   0] },  // classic head-on
        quarter:  { pos: [-3.2, 1.4,  4.2], look: [0, 1,   0] },
        back:     { pos: [-1.5, 1,   -5.5], look: [0, 1.1, 0] },
        fit:      { pos: [2.6,  1,    9  ], look: [0, 1,   0] },
    };
    const t = targets[type] ?? targets.front;
    _camera.position.set(...t.pos);
    _camera.lookAt(...t.look);
}

// ─── Render loop ──────────────────────────────────────────────────────────

function _loop() {
    _animId = requestAnimationFrame(_loop);
    const t = Date.now() * 0.001;
    if (_charGroup) {
        if (_autoSpin) {
            _charGroup.rotation.y += 0.008;
        } else {
            // Breathing bob — oscillates ±0.022 around base y offset
            _charGroup.position.y = -0.5 + Math.sin(t * 0.9) * 0.022;
        }
        // Idle arm swing (opposite phase, small angle)
        if (_armL) _armL.rotation.x = Math.sin(t * 0.9 + Math.PI) * 0.09;
        if (_armR) _armR.rotation.x = Math.sin(t * 0.9) * 0.09;
        // Subtle leg counter-swing
        if (_legL) _legL.rotation.x = -Math.sin(t * 0.9 + Math.PI) * 0.04;
        if (_legR) _legR.rotation.x = -Math.sin(t * 0.9) * 0.04;
    }
    if (_renderer && _scene && _camera) _renderer.render(_scene, _camera);
}

// ─── Lighting presets ─────────────────────────────────────────────────────

// ─── Stage presets ────────────────────────────────────────────────────────
// Bright pastel studio stages (reference-art style: character brightly lit on
// a soft gradient, dark contact shadow under the feet) plus two dark stages.
// bright:true → contact shadow + hidden grid; false → additive glow pool.

const _STAGES = {
    //                       bg        amb               dir (key)                   fill                         rim               glow
    // Bright stages: fill light comes from the FRONT (camera side) so the
    // character face never falls into shadow — even, glowing illumination
    bright_warm:  { bright: true,  bg: 0xefe4d0, amb: [0xffffff, 1.0], dir: [0xfff0da, 1.3, [ 3, 6, 5]], fill: [0xffeedd, 0.5, [-2, 2, 5]], rim: [0xffb060, 0.8], glow: 0xfff6e8 },
    bright_cool:  { bright: true,  bg: 0x9fc4e8, amb: [0xf0f6ff, 1.0], dir: [0xffffff, 1.3, [ 3, 6, 5]], fill: [0xe8f2ff, 0.5, [-2, 2, 5]], rim: [0x6fa8ff, 0.9], glow: 0xeaf4ff },
    bright_green: { bright: true,  bg: 0x9ed49a, amb: [0xf0fff0, 1.0], dir: [0xfffbe8, 1.3, [ 3, 6, 5]], fill: [0xf0ffe8, 0.5, [-2, 2, 5]], rim: [0x60cc70, 0.9], glow: 0xeeffe8 },
    bright_pink:  { bright: true,  bg: 0xe4bcc8, amb: [0xfff4f6, 1.0], dir: [0xfff2ea, 1.3, [ 3, 6, 5]], fill: [0xfff0f4, 0.5, [-2, 2, 5]], rim: [0xe07898, 0.9], glow: 0xffeef2 },
    bright_amber: { bright: true,  bg: 0xf0d488, amb: [0xfff8e0, 1.0], dir: [0xffe8b0, 1.35,[ 2, 6, 4]], fill: [0xfff0d0, 0.5, [-2, 2, 5]], rim: [0xff9930, 0.9], glow: 0xfff4d8 },
    dark:         { bright: false, bg: 0x06060c, amb: [0x222233, 0.25], dir: [0xfff4e0, 1.7,  [ 5, 8, 3]], fill: [0x2222aa, 0.25, [-4, 0, -3]], rim: [0x4466ff, 1.8], glow: 0x2a2a5a },
    eerie:        { bright: false, bg: 0x040a04, amb: [0x113311, 0.25], dir: [0x66ff99, 1.0,  [ 1, 6, 2]], fill: [0x330044, 0.45, [-2, 0, -3]], rim: [0x33ff88, 1.5], glow: 0x1a4a2a },
};

// Spec "lighting" value → stage (used when the stage tone setting is 'auto')
const _LIGHTING_TO_STAGE = {
    standard: 'bright_warm',
    warm:     'bright_amber',
    cool:     'bright_cool',
    dramatic: 'dark',
    eerie:    'eerie',
};

export function setStageTone(tone) {
    _stageTone = tone ?? 'auto';
    if (_scene) _applyLighting(_lastLighting);
}

let _lastLighting = 'standard';

function _applyLighting(mode) {
    if (!_lightAmb || !_lightDir || !_lightFill) return;
    _lastLighting = mode;
    const key = _stageTone !== 'auto' && _STAGES[_stageTone]
        ? _stageTone
        : (_LIGHTING_TO_STAGE[mode] ?? 'bright_warm');
    const p = _STAGES[key];
    if (_scene) {
        _scene.background = new THREE.Color(p.bg);
        // Depth haze — pushes the backdrop away from the character like key art
        _scene.fog = new THREE.Fog(p.bg, 11, 26);
    }
    _lightAmb.color.setHex(p.amb[0]);    _lightAmb.intensity  = p.amb[1];
    _lightDir.color.setHex(p.dir[0]);    _lightDir.intensity  = p.dir[1];  _lightDir.position.set(...p.dir[2]);
    _lightFill.color.setHex(p.fill[0]);  _lightFill.intensity = p.fill[1]; _lightFill.position.set(...p.fill[2]);
    if (_lightTop) { _lightTop.color.setHex(p.rim[0]); _lightTop.intensity = p.rim[1]; }
    // Bright stage: soft dark contact shadow, no glow pool, no dark grid.
    // Dark stage: additive glow pool, grid visible for depth.
    if (_glowDisc)   _glowDisc.visible   = !p.bright;
    if (_shadowDisc) _shadowDisc.visible = p.bright;
    if (_gridHelper) _gridHelper.visible = !p.bright;
    if (_glowDisc) _glowDisc.material.color.setHex(p.glow);
    if (_glowBg) {
        _glowBg.material.color.setHex(p.glow);
        // Bright stages: gentle backdrop gradient, not a blown-out hotspot.
        // Dark stages: strong glow silhouetting the character.
        _glowBg.material.opacity = p.bright ? 0.3 : 0.9;
    }
}

// ─── Key-art glow staging ────────────────────────────────────────────────
// A soft light pool under the character + a radial glow behind them — the
// "spotlit hero on a poster" composition from Minecraft Dungeons cover art.

function _radialTexture() {
    const cv  = document.createElement('canvas');
    cv.width  = 256;
    cv.height = 256;
    const ctx = cv.getContext('2d');
    const g   = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0,   'rgba(255,255,255,0.85)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(cv);
}

function _buildGlow() {
    const tex = _radialTexture();
    const mat = () => new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false,
    });

    // Additive glow pool — dark stages only
    _glowDisc = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), mat());
    _glowDisc.rotation.x = -Math.PI / 2;
    _glowDisc.position.y = -0.54;
    _scene.add(_glowDisc);

    // Soft ambient blob — bright stages only. Real shadow mapping does the
    // crisp contact shadow; this just adds the soft AO halo around it.
    _shadowDisc = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 3.6),
        new THREE.MeshBasicMaterial({
            map: tex, transparent: true, depthWrite: false,
            color: 0x000000, opacity: 0.16, fog: false,
        }),
    );
    _shadowDisc.rotation.x = -Math.PI / 2;
    _shadowDisc.position.y = -0.53;
    _scene.add(_shadowDisc);

    // Invisible shadow-catcher — receives the REAL cast shadow from the key
    // light on any stage (ShadowMaterial renders only the shadow)
    _shadowCatcher = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 14),
        new THREE.ShadowMaterial({ opacity: 0.3 }),
    );
    _shadowCatcher.rotation.x = -Math.PI / 2;
    _shadowCatcher.position.y = -0.549;
    _shadowCatcher.receiveShadow = true;
    _scene.add(_shadowCatcher);

    // Radial gradient behind the character — lighter centre on bright stages,
    // coloured glow on dark ones (the studio-backdrop look from the refs)
    _glowBg = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), mat());
    _glowBg.position.set(0, 1.6, -6.5);
    _scene.add(_glowBg);
}

// ─── Three.js loader ─────────────────────────────────────────────────────

async function _loadThree() {
    try {
        // Vendored min build — gitignored, present locally via deploy;
        // fresh git installs fall through to the CDN below
        return await import('../../lib/three.module.min.js');
    } catch {
        try {
            return await import('https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.min.js');
        } catch {
            return null;
        }
    }
}

function _showPlaceholder(container) {
    container.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#333;font-size:10px;text-align:center;padding:8px;box-sizing:border-box;">Place three.module.js in lib/ to enable 3D voxel</div>`;
}

// ─── Scene helpers ────────────────────────────────────────────────────────

function _disposeGroup(group) {
    group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else if (obj.material)           obj.material.dispose();
    });
}

// 4-step toon gradient — defined shade bands per face instead of 2-tone mush
function _toonGradient() {
    if (_toonGrad) return _toonGrad;
    const data = new Uint8Array([90, 150, 210, 255]);
    _toonGrad = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
    _toonGrad.minFilter = THREE.NearestFilter;
    _toonGrad.magFilter = THREE.NearestFilter;
    _toonGrad.needsUpdate = true;
    return _toonGrad;
}

// ─── Pixel-texture system ("fake voxel") ──────────────────────────────────
// Surface detail is PAINTED onto box faces as pixel art (the Minecraft-skin
// technique) instead of built from micro-boxes. One box + a 16px noise
// texture reads as many voxels; faces/patterns/cuffs are pixels, not meshes.

const _texCache = new Map();

function _pixelNoiseCanvas(base, size, seedKey, opts = {}) {
    const { patch = 2, amp = 0.028, coverage = 0.24 } = opts;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // Soft patchwork shading — sparse 2px patches at ~3% tone shift, like the
    // reference renders. NOT per-pixel salt-and-pepper (reads as sand).
    const rnd = _seededRnd(`${base}|${seedKey}`);
    for (let px = 0; px < size; px += patch) {
        for (let py = 0; py < size; py += patch) {
            const r = rnd();
            if (r < 1 - coverage) continue;
            ctx.fillStyle = r > 1 - coverage / 2 ? _lighten(base, amp) : _darken(base, amp);
            ctx.fillRect(px, py, patch, patch);
        }
    }
    return { cv, ctx };
}

function _canvasToTexture(cv) {
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// Flat base + optional horizontal bands [{from,to,color}] in 0..1 of height
// from the top (cuffs, hems, collars are painted bands, not shells).
// SKIN IS ALWAYS FLAT — no grain. Pass noiseOpts only for clothing, and only
// as large soft blocks (see _CLOTH_NOISE).
function _skinTexture(base, bands, seedKey, noiseOpts) {
    const key = `skin|${base}|${JSON.stringify(bands ?? [])}|${seedKey ?? ''}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const size = 16;
    const { cv, ctx } = _pixelNoiseCanvas(base, size, key, noiseOpts ?? { coverage: 0 });
    (bands ?? []).forEach(b => {
        const y0 = Math.round(b.from * size), y1 = Math.round(b.to * size);
        ctx.fillStyle = b.color;
        ctx.fillRect(0, y0, size, y1 - y0);
    });
    const tex = _canvasToTexture(cv);
    _texCache.set(key, tex);
    return tex;
}

// Clothing-only shading: large 6px blocks, ~2% tone, sparse — reads as soft
// fabric shading, never as grain
const _CLOTH_NOISE = { patch: 6, amp: 0.02, coverage: 0.14 };

// Shirt texture: noise + painted collar/hem bands + optional plaid/stripes/
// checker pattern — patterns are pixels now, so they work at EVERY tier and
// can never clip or z-fight
function _paintShirtPattern(ctx, size, c) {
    const pat = (c.shirt_pattern ?? '').toLowerCase();
    if (!pat || pat === 'none') return;
    const pc  = c.pattern_color || _lighten(c.shirt, 0.25);
    const pcD = _darken(pc, 0.12);
    if (pat === 'checker') {
        const cell = size / 4;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if ((i + j) % 2 === 0) continue;
                ctx.fillStyle = pc;
                ctx.fillRect(i * cell, j * cell, cell, cell);
            }
        }
    } else if (pat === 'stripes') {
        ctx.fillStyle = pc;
        [0.2, 0.5, 0.8].forEach(f => ctx.fillRect(0, Math.round(f * size) - 1, size, 3));
    } else if (pat === 'plaid') {
        ctx.fillStyle = pc;
        [0.18, 0.5, 0.82].forEach(f => ctx.fillRect(Math.round(f * size) - 1, 0, 2, size));
        ctx.fillStyle = pcD;
        [0.25, 0.55, 0.85].forEach(f => ctx.fillRect(0, Math.round(f * size) - 1, size, 2));
    }
}

function _shirtTexture(c) {
    const key = `shirt|${c.shirt}|${c.shirt_pattern ?? ''}|${c.pattern_color ?? ''}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const size = 24;
    const { cv, ctx } = _pixelNoiseCanvas(c.shirt, size, key, _CLOTH_NOISE);
    _paintShirtPattern(ctx, size, c);
    // Collar (top rows) + hem (bottom rows) painted over the pattern
    ctx.fillStyle = _lighten(c.shirt, 0.18);
    ctx.fillRect(0, 0, size, 2);
    ctx.fillStyle = _darken(c.shirt, 0.1);
    ctx.fillRect(0, size - 2, size, 2);
    const tex = _canvasToTexture(cv);
    _texCache.set(key, tex);
    return tex;
}

// Face texture — eyes, brows, nose, mouth painted as pixels on a noise base.
// Anthro variants skip nose/mouth (the geometry muzzle carries those).
function _faceTexture(c, template) {
    const key = `face|${c.skin}|${c.eye}|${c.hair}|${c.hair_style ?? ''}|${template}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const size = 32;
    // Skin is flat — no grain on faces, ever
    const { cv, ctx } = _pixelNoiseCanvas(c.skin, size, key, { coverage: 0 });
    const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    // Hairline — top 1/5 of the head cube is painted hair (the voxel hair
    // attaches onto this base), with stepped fringe notches like an MC skin
    const hairCol = _hairColor(c);
    if ((c.hair_style ?? 'short') !== 'bald') {
        px(0, 0, size, 6, hairCol);
        px(2, 6, 5, 2, hairCol);      // fringe notch left
        px(13, 6, 4, 1, hairCol);     // shallow centre notch
        px(24, 6, 6, 2, hairCol);     // fringe notch right
    }
    // Brows
    px(6, 8, 7, 2, hairCol);
    px(19, 8, 7, 2, hairCol);
    // Eyes: sclera → iris → pupil, inner-biased
    px(6, 11, 7, 5, '#f8f6ef');
    px(19, 11, 7, 5, '#f8f6ef');
    px(8, 11, 3, 5, c.eye);
    px(21, 11, 3, 5, c.eye);
    px(9, 12, 2, 3, '#141210');
    px(21, 12, 2, 3, '#141210');
    if (template !== 'anthro_biped') {
        px(14, 16, 4, 5, _darken(c.skin, 0.07));           // nose
        px(14, 20, 1, 1, _darken(c.skin, 0.16));           // nostril hint
        px(17, 20, 1, 1, _darken(c.skin, 0.16));
        px(12, 24, 8, 2, '#4a2a20');                        // mouth
    }
    const tex = _canvasToTexture(cv);
    _texCache.set(key, tex);
    return tex;
}

function _toonMat(opts) {
    return new THREE.MeshToonMaterial({ gradientMap: _toonGradient(), ...opts });
}

// Box with a texture on all faces (torso/limbs — bands wrap consistently)
function _texBox(w, h, d, tex, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), _toonMat({ map: tex }));
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    return mesh;
}

// rot: optional [rx, ry, rz] radians — rotated boxes are how flowing shapes
// (hair tufts, scarf drape, curved tails) escape the rigid grid look
function _box(w, h, d, color, x, y, z, rot) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: _toonGradient() })
    );
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
    return mesh;
}

// Same-color batch: specs are [w, h, d, x, y, z]
function _boxes(group, color, specs) {
    specs.forEach(([w, h, d, x, y, z, rot]) => group.add(_box(w, h, d, color, x, y, z, rot)));
}

// Deterministic PRNG (mulberry32) — same seed = same hair every rerender,
// so a character's look is stable across sessions
function _seededRnd(str) {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
}


// ─── Accessory object helpers ─────────────────────────────────────────────

function _accType(a)      { return typeof a === 'string' ? a : (a?.type ?? ''); }
function _accColor(a, fb) { return typeof a === 'string' ? fb : (a?.color || fb); }
function _accScale(a) {
    if (typeof a === 'string') return 1;
    return ({ small: 0.72, medium: 1, large: 1.35 })[a?.size] ?? 1;
}

// ─── Default spec ─────────────────────────────────────────────────────────

function _defaultSpec() {
    return {
        // Stylised mascot default — clean MC-figurine look (target ref):
        // cyan shirt, purple pants, brown hair, green eyes, grey belt
        template: 'humanoid',
        tier:     'high',
        build:    'medium',
        colors: {
            skin:        '#e8b478',
            hair:        '#6b4423',
            hair_style:  'short',
            facial_hair: '',
            eye:         '#2e9e4f',
            shirt:       '#35b3cc',
            pants:       '#6a4a9a',
            shoes:       '#4a2c14',
            accent:      '#b8b8b8',
        },
        tattoos:     [],
        accessories: [
            { type: 'belt', color: '#b8b8b8', size: 'small' },
        ],
        zones:       {},
        lighting:    'standard',
        backdrop:    [],
    };
}

// Lighter belly fur strip overlaid on torso front — anthro medium/high only
function _addBellyZone(g, c, bx, bz) {
    const bellyColor = c.zones?.belly;
    if (!bellyColor) return;
    g.add(_box(bx * 0.65, 0.85, 0.06, bellyColor, 0, _Y.CHEST - 0.1, bz * 0.5 + 0.04));
}

// Raised voxel platform used when a backdrop has ground
function _addGroundPlate(g, topColor, rimColor) {
    g.add(_box(5.2, 0.3,  4.4, topColor, 0, -1.05, 0.5));
    g.add(_box(5.6, 0.22, 4.8, rimColor, 0, -1.33, 0.5));
}

function _sceneGroundColors(name) {
    if (/castle|dungeon|stone/.test(name))              return { top: '#5a5248', rim: '#3a3030' };
    if (/autumn|fall/.test(name))                       return { top: '#8a6030', rim: '#5a3a1a' };
    if (/forest|field|meadow|outdoor/.test(name))       return { top: '#5a7a3a', rim: '#3a5228' };
    if (/lake|ocean|sea|river|beach|water/.test(name))  return { top: '#c8b870', rim: '#a09050' };
    if (/cave/.test(name))                              return { top: '#303035', rim: '#202025' };
    if (/city|urban|downtown|street|neon/.test(name))   return { top: '#3e3e48', rim: '#28282e' };
    return { top: '#3c3c45', rim: '#28282e' };
}

const _SKY_ONLY = new Set(['clouds', 'sky', 'void', 'dark', 'abyss', 'shadow']);

// ─── Backdrop builder ─────────────────────────────────────────────────────

const _BACKDROP_MED = new Set(['none', 'floor', 'forest', 'castle', 'cave', 'clouds', 'autumn', 'fall']);

function _buildBackdrop(spec) {
    const tier = spec.tier ?? 'minimum';
    const g    = new THREE.Group();

    let rawList;
    if (Array.isArray(spec.backdrop))  rawList = spec.backdrop.slice(0, 2);
    else if (spec.backdrop)            rawList = [String(spec.backdrop)];
    else                               rawList = [];

    // No backdrop specified or minimum tier — plain grid, no plate
    if (tier === 'minimum' || rawList.length === 0) {
        _addDefaultBackdrop(g);
        return g;
    }

    // Determine if any scene element implies a ground surface
    const names = rawList.map(r => String(r).toLowerCase().trim());
    const hasGround = names.some(n => n !== 'none' && n !== 'floor' && !_SKY_ONLY.has(n));
    if (hasGround) {
        // Merge ground colors from first ground-type element
        const groundName = names.find(n => !_SKY_ONLY.has(n) && n !== 'none') ?? '';
        const { top, rim } = _sceneGroundColors(groundName);
        _addGroundPlate(g, top, rim);
    }
    _addSkyHorizon(g);

    names.forEach(name => {
        if (name === 'none' || name === 'floor') return;
        if (tier === 'medium' && !_BACKDROP_MED.has(name)) { _addGenericEnv(g, name, tier); return; }
        if      (name === 'castle')  _addCastle(g, tier);
        else if (name === 'autumn' || name === 'fall') _addAutumn(g, tier);
        else if (name === 'forest')  _addForest(g, tier);
        else if (name === 'lake')    _addLake(g);
        else if (name === 'cave')    _addCave(g, tier);
        else if (name === 'dungeon') _addDungeon(g);
        else if (name === 'clouds')  _addClouds(g);
        else                         _addGenericEnv(g, name, tier);
    });

    return g;
}

// ── Sky horizon strip — always rendered behind scene walls (z=-3) ─────────

function _addSkyHorizon(group) {
    _boxes(group, '#252d38', _WALL_X.map(x => [0.92, 0.88, 0.2, x, -0.18, -3]));
    _boxes(group, '#2e3d52', _WALL_X.map(x => [0.92, 0.88, 0.2, x,  0.7,  -3]));
    _boxes(group, '#364860', _WALL_X.map(x => [0.92, 0.88, 0.2, x,  1.58, -3]));
}

// ── Default (no backdrop) — minimal grid so depth is readable ────────────

function _addDefaultBackdrop(group) {
    const grid = new THREE.GridHelper(8, 8, 0x484848, 0x303030);
    grid.position.y = -1.05;
    group.add(grid);
    // Stage system hides this on bright stages (contact shadow replaces it)
    _gridHelper = grid;
}

// ── Castle ───────────────────────────────────────────────────────────────

function _addCastle(group, tier) {
    const wall = '#5a5048', stone = '#4a4038';
    _boxes(group, wall,  _WALL_X.map(x => [0.92, 1, 0.3, x, -0.55, -2]));
    _boxes(group, stone, _WALL_X.map(x => [0.92, 1, 0.3, x,  0.45, -2]));
    [-3.5, 3.5].forEach(tx => {
        group.add(_box(1.1, 2.2, 1.1, stone, tx, 0, -2));
        if (tier === 'high') {
            _boxes(group, wall, [-0.28, 0.28].flatMap(bx => [
                [0.28, 0.4, 0.28, tx + bx, 1.25, -2     ],
                [0.28, 0.4, 0.28, tx,      1.25, -2 + bx],
            ]));
        }
    });
}

// ── Forest ───────────────────────────────────────────────────────────────

function _addForest(group, tier) {
    const pos = tier === 'high' ? [[-2.2, -1.5], [2.2, -1.5], [-1.5, -2]] : [[-2.2, -1.5], [2.2, -1.5]];
    pos.forEach(([tx, tz]) => {
        _TREE_PARTS.forEach(([[w, h, d, dy], color]) => {
            group.add(_box(w, h, d, color, tx, dy, tz));
        });
    });
}

// ── Autumn — orange/red canopy trees + leaf scatter + midair drifting leaves ──

const _AUTUMN_CANOPY = ['#d86020', '#b83018', '#e8a020'];

function _addAutumn(group, tier) {
    const pos = tier === 'high' ? [[-2.2, -1.5], [2.2, -1.5], [-1.4, -2.1]] : [[-2.2, -1.5], [2.2, -1.5]];
    pos.forEach(([tx, tz], i) => {
        const cap = _AUTUMN_CANOPY[i % _AUTUMN_CANOPY.length];
        group.add(_box(0.35, 1.3, 0.35, '#4a2e14', tx, -0.4, tz));            // trunk
        group.add(_box(1.15, 0.75, 1.15, cap,               tx, 0.62, tz));   // canopy lower
        group.add(_box(0.8,  0.55, 0.8,  _lighten(cap, 0.08), tx, 1.22, tz)); // canopy upper
    });
    // Fallen leaf scatter on the ground plate
    const scatter = [
        ['#d86020', -1.6, 0.6], ['#b83018', -0.7, 1.1], ['#e8a020', 0.5, 0.9],
        ['#d86020',  1.4, 0.5], ['#b83018', 1.9, 1.2],  ['#e8a020', -2.1, 1.3],
    ];
    scatter.forEach(([col, x, z]) => group.add(_box(0.18, 0.04, 0.18, col, x, -0.99, z)));
    // Drifting leaves frozen midair
    const midair = [
        ['#d86020', -1.3, 1.6, 0.8], ['#e8a020', 1.5, 2.4, 0.4],
        ['#b83018', -0.6, 3.1, -0.5], ['#e8a020', 2, 1.1, 1],
    ];
    midair.forEach(([col, x, y, z]) => group.add(_box(0.14, 0.05, 0.14, col, x, y, z)));
}

// ── Lake ─────────────────────────────────────────────────────────────────

function _addLake(group) {
    group.add(_box(4, 0.12, 2.5, '#1a4a7a', 1.5, -1.08, 0));
    _boxes(group, '#4a4848', _LAKE_ROCKS.map(([x, y, z]) => [0.55, 0.45, 0.5, x, y, z]));
    _addForest(group, 'medium');
}

// ── Cave ─────────────────────────────────────────────────────────────────

function _addCave(group, tier) {
    const rock = '#3a3530', darker = '#2a2520';
    [-3.2, 3.2].forEach(wx => {
        for (let y = -0.6; y <= 1.8; y += 0.7) group.add(_box(0.4, 0.65, 3.5, rock, wx, y, 0));
    });
    [1.9, 2.3, 2.5, 2.3, 1.9].forEach((ay, i) => {
        group.add(_box(1.1, 0.45, 0.4, darker, (i - 2) * 1.3, ay, -1.5));
    });
    if (tier === 'high') {
        [[-1.2, 2.1], [0.3, 2.3], [1.8, 2]].forEach(([sx, sy]) => {
            group.add(_box(0.2, 0.5, 0.2, rock, sx, sy, -1.5));
        });
    }
}

// ── Dungeon ───────────────────────────────────────────────────────────────

function _addDungeon(group) {
    const stone = '#3a3530', mortar = '#2a2520';
    _WALL_X.forEach(x => group.add(_box(0.92, 3.2, 0.3, x % 2 === 0 ? stone : mortar, x, 0.5, -2.2)));
    [-2, 2].forEach(px => group.add(_box(0.55, 3, 0.55, stone, px, 0.4, -0.5)));
    [-1.5, 1.5].forEach(tx => group.add(_box(0.18, 0.28, 0.18, '#fd971f', tx, 1.1, -2.05)));
}

// ── Clouds ────────────────────────────────────────────────────────────────

const _CLOUD_CENTRES = [[-2.2, 4.2, -1.2], [0.5, 4.5, -1.8], [2.4, 4.1, -1]];

function _addClouds(group) {
    _CLOUD_CENTRES.forEach(([cx, cy, cz]) => {
        _CLOUD_SHAPE.forEach(([[w, h, d, dx, dy, dz], color]) => {
            group.add(_box(w, h, d, color, cx + dx, cy + dy, cz + dz));
        });
    });
}

// ── Generic environment (free-text fallback) ──────────────────────────────

function _addGenericEnv(group, name, tier) {
    const has = kw => name.includes(kw);
    let wallA = '#3a3530', wallB = '#2a2520', variant = 'default';

    if      (has('city') || has('urban') || has('downtown') || has('street') || has('neon') || has('night'))  { wallA = '#1a1e2a'; wallB = '#0e121a'; variant = 'city'; }
    else if (has('sky') || has('field') || has('plain') || has('outdoor') || has('meadow'))    { wallA = '#5a8a5a'; wallB = '#3a6a3a'; }
    else if (has('water') || has('ocean') || has('sea') || has('river') || has('beach'))        { wallA = '#1a4a7a'; wallB = '#0a2a5a'; }
    else if (has('fire') || has('lava') || has('volcano') || has('hell') || has('inferno'))     { wallA = '#8a2a0a'; wallB = '#6a1a00'; }
    else if (has('ice') || has('snow') || has('frozen') || has('tundra') || has('arctic'))      { wallA = '#8ab0c8'; wallB = '#6a90a8'; }
    else if (has('dark') || has('void') || has('shadow') || has('abyss'))                       { wallA = '#151210'; wallB = '#0a0808'; }
    else if (has('gold') || has('throne') || has('palace') || has('royal'))                     { wallA = '#7a6020'; wallB = '#5a4010'; }
    else if (has('magic') || has('arcane') || has('myst') || has('ruin'))                       { wallA = '#3a2a5a'; wallB = '#2a1a4a'; }

    _boxes(group, wallA, _WALL_X.map(x => [0.92, 1, 0.3, x, -0.15, -2.1]));
    _boxes(group, wallB, _WALL_X.map(x => [0.92, 1, 0.3, x,  0.85, -2.1]));
    _addGenericEnvDetail(group, variant, tier, wallA, wallB);
}

function _addGenericEnvDetail(group, variant, tier, wallA, wallB) {
    if (variant === 'city') {
        // Amber windows on back wall
        _boxes(group, '#c89018', [
            [0.22, 0.2, 0.05, -2,    0.5,  -2.07],
            [0.22, 0.2, 0.05,  0,    0.7,  -2.07],
            [0.22, 0.2, 0.05,  2,    0.4,  -2.07],
            [0.22, 0.2, 0.05, -1,   -0.1,  -2.07],
            [0.22, 0.2, 0.05,  1,    0.8,  -2.07],
        ]);
        if (tier === 'high') group.add(_box(0.28, 0.28, 0.06, '#e4e0c0', 2.6, 2, -2.04));
    } else if (tier === 'high') {
        group.add(_box(0.6, 0.6, 0.6, wallA, 0, -0.7, -1.6));
        group.add(_box(0.4, 0.4, 0.4, wallB, 0, -0.1, -1.6));
    }
}

// ─── Character builder ────────────────────────────────────────────────────

function _buildCharacter(spec) {
    const tier = spec.tier ?? 'minimum';
    if (tier === 'high')   return _buildHigh(spec);
    if (tier === 'medium') return _buildMedium(spec);
    return _buildMinimum(spec);
}

// ─── Clothing layer rule ──────────────────────────────────────────────────
// Every overlay must sit strictly OUTSIDE the surface it covers — never share
// a face plane (coplanar faces z-fight and shimmer). Layer offsets from the
// torso surface: hem +0.02 · pattern +0.035 · belt +0.06. Belt sizes off the
// live body scale so it clears every build.
let _bodyScale = { bx: 1.1, bz: 0.6 };

// Head — 1/5 hair band painted around all faces, hair-colour top face,
// painted pixel face on the front (+z). Voxel hair attaches onto this base.
function _addHead(g, c, template) {
    const bald    = (c.hair_style ?? 'short') === 'bald';
    const hairCol = _hairColor(c);
    const bands   = bald ? null : [{ from: 0, to: 0.2, color: hairCol }];
    const sideTex = _skinTexture(c.skin, bands, 'head');
    const topTex  = bald ? sideTex : _skinTexture(hairCol, null, 'headtop');
    const side    = () => _toonMat({ map: sideTex });
    const front   = _toonMat({ map: _faceTexture(c, template) });
    // BoxGeometry material order: +x, -x, +y (top), -y, +z (front), -z
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        [side(), side(), _toonMat({ map: topTex }), side(), front, side()],
    );
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.position.set(0, _Y.HEAD, 0);
    g.add(mesh);
}

// Shared base body — Minecraft-biped proportions, limbs in pivot groups for idle animation.
// All surfaces are pixel-textured (noise + painted bands); detail lives in the
// textures, not in extra boxes. _armL/_armR/_legL/_legR animate in _loop.
function _addBaseBody(g, c, bx, bz, template) {
    _bodyScale = { bx, bz };
    _addHead(g, c, template);

    // Torso — shirt texture carries noise, collar, hem, and any pattern
    g.add(_texBox(bx, 1.2, bz, _shirtTexture(c), 0, _Y.CHEST, 0));

    // Arms — flat skin; hand is a separate same-colour cube tilted a few
    // degrees for that leveraged, 3D figurine feel (reference detail)
    const armTex = _skinTexture(c.skin, null, 'arm');
    const shoulderY = _Y.CHEST + 0.6;   // 2.0
    // +0.26 keeps the arm inner face 0.01 clear of the torso side — flush
    // (coplanar) faces bled shirt colour onto the arms/hands (the "blue ring")
    const armX = bx * 0.5 + 0.26;
    // Hands: 8% lighter skin, tilted slightly OUTWARD (away from the torso —
    // tilting inward clipped the shirt/belt and caused colour bleed)
    const handTex = _skinTexture(_lighten(c.skin, 0.08), null, 'hand');
    _armL = new THREE.Group();
    _armL.position.set(-armX, shoulderY, 0);
    _armL.add(_texBox(0.5, 0.92, 0.5, armTex, 0, -0.46, 0));
    const handL = _texBox(0.47, 0.31, 0.47, handTex, -0.06, -1.05, 0.03);
    handL.rotation.set(0.05, 0.07, 0.05);
    _armL.add(handL);
    g.add(_armL);

    _armR = new THREE.Group();
    _armR.position.set(armX, shoulderY, 0);
    _armR.add(_texBox(0.5, 0.92, 0.5, armTex, 0, -0.46, 0));
    const handR = _texBox(0.47, 0.31, 0.47, handTex, 0.06, -1.05, 0.03);
    handR.rotation.set(0.05, -0.07, -0.05);
    _armR.add(handR);
    g.add(_armR);

    // Legs — soft cloth shading + painted cuff; flat shoes
    const legTex  = _skinTexture(c.pants, [{ from: 0.9, to: 1, color: _darken(c.pants, 0.1) }], 'leg', _CLOTH_NOISE);
    const shoeTex = _skinTexture(c.shoes, null, 'shoe');
    const hipTopY = _Y.HIP + 0.6;    // 0.8
    // Leg depth 0.8×bz — near torso depth, no pencil legs
    _legL = new THREE.Group();
    _legL.position.set(-0.22, hipTopY, 0);
    _legL.add(_texBox(0.42 * bx, 1.2, 0.8 * bz, legTex,  0, -0.6,  0    ));
    _legL.add(_texBox(0.48 * bx, 0.28, 0.7,     shoeTex, 0, -1.26, 0.05 ));
    g.add(_legL);

    _legR = new THREE.Group();
    _legR.position.set(0.22, hipTopY, 0);
    _legR.add(_texBox(0.42 * bx, 1.2, 0.8 * bz, legTex,  0, -0.6,  0    ));
    _legR.add(_texBox(0.48 * bx, 0.28, 0.7,     shoeTex, 0, -1.26, 0.05 ));
    g.add(_legR);
}

// ─── Anthro body features — added when template === 'anthro_biped' ─────────

function _addAnthroFeatures(g, c) {
    const zones = c.zones ?? {};
    // Two-part muzzle (fox-skin ref): snout block + dark nose tip — reads as a
    // face at any distance, unlike the old single slab
    const muzzleColor = zones.face_mask ?? _lighten(c.skin, -0.07);
    g.add(_box(0.46, 0.3, 0.32, muzzleColor, 0, 2.4, 0.56));
    g.add(_box(0.18, 0.11, 0.1, '#1a1210', 0, 2.47, 0.73));
    // Tapered ears on the TOP corners of the head (not stubs on the sides):
    // wide base + narrower tip, angled slightly outward
    _boxes(g, c.hair, [
        [0.24, 0.34, 0.14, -0.3,  3.28, 0],
        [0.24, 0.34, 0.14,  0.3,  3.28, 0],
        [0.14, 0.2,  0.12, -0.34, 3.52, 0],
        [0.14, 0.2,  0.12,  0.34, 3.52, 0],
    ]);
    // Inner ear pads facing forward
    const earInner = zones.ear_inner ?? _lighten(c.hair, 0.22);
    _boxes(g, earInner, [
        [0.12, 0.22, 0.05, -0.3, 3.26, 0.08],
        [0.12, 0.22, 0.05,  0.3, 3.26, 0.08],
    ]);
}

// ─── Face features — eyes + nose/nostrils for all tiers ──────────────────

function _addFace(g, c, template) {
    // Eyes/brows/nose/mouth are PAINTED on the head's front-face texture
    // (_faceTexture). Only volume features remain as geometry.
    if (template === 'anthro_biped') {
        // Mouth line under the geometry muzzle (painted face sits behind it)
        g.add(_box(0.16, 0.035, 0.03, _lighten(c.skin, -0.28), 0, 2.27, 0.73));
    } else {
        // Ears — skin blended toward pink, 6% darker than the face
        const earCol = _darken(_mixColor(c.skin, '#e09090', 0.3), 0.06);
        _boxes(g, earCol, [
            [0.08, 0.2, 0.2, -0.53, 2.62, 0],
            [0.08, 0.2, 0.2,  0.53, 2.62, 0],
        ]);
        _addFacialHair(g, c);
    }
}

// Facial hair clusters (humanoid only — anthro muzzles carry their own fur)
function _addFacialHair(g, c) {
    const kind = (c.facial_hair ?? '').toLowerCase();
    if (!kind || kind === 'none') return;
    const rnd    = _seededRnd(`${c.hair}|${kind}`);
    // Neat: base colour dominates, tiny tone step, near-axis-aligned
    const shades = [c.hair, c.hair, _darken(c.hair, 0.04)];
    const tuft = (w, h, d, x, y, z) => {
        const rot = [(rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.14, (rnd() - 0.5) * 0.1];
        g.add(_box(w, h, d, shades[(rnd() * 3) | 0], x, y, z, rot));
    };
    if (kind === 'mustache' || kind === 'beard') {
        // Mustache — two angled tufts above the mouth
        tuft(0.17, 0.08, 0.07, -0.1, 2.39, 0.5);
        tuft(0.17, 0.08, 0.07,  0.1, 2.39, 0.5);
    }
    if (kind === 'beard') {
        // Jawline — tufts wrapping chin and cheeks below the mouth
        for (let i = 0; i < 5; i++) {
            tuft(0.16 + rnd() * 0.08, 0.14 + rnd() * 0.1, 0.12, -0.34 + i * 0.17, 2.2 + rnd() * 0.05, 0.42);
        }
        [-0.45, 0.45].forEach(sx => {
            tuft(0.12, 0.2 + rnd() * 0.1, 0.24, sx, 2.32, 0.28);
        });
        // Chin block underneath
        tuft(0.34, 0.14, 0.2, 0, 2.1, 0.34);
    }
    if (kind === 'stubble') {
        // Sparse micro-tufts, shorter and flatter
        for (let i = 0; i < 4; i++) {
            tuft(0.1 + rnd() * 0.05, 0.05, 0.04, -0.25 + i * 0.17, 2.24 + rnd() * 0.06, 0.48);
        }
    }
}

// ─── MINIMUM tier ─────────────────────────────────────────────────────────
// Budget: max 2 accessories, no tattoos

function _buildMinimum(spec) {
    const g = new THREE.Group();
    const c = spec.colors ?? _defaultSpec().colors;
    const { bx, bz } = _buildScale(spec.build);
    _addBaseBody(g, c, bx, bz, spec.template ?? 'humanoid');
    // Hem + hand/paw tips are painted into the textures now — no extra boxes.
    // All tiers get hair + face; anthro features (ears/muzzle) always rendered
    _addHairMedium(g, c);
    if ((spec.template ?? 'humanoid') === 'anthro_biped') {
        _addAnthroFeatures(g, c);
        // Belly zone at min too — it's THE signature anthro read (fox ref)
        _addBellyZone(g, c, bx, bz);
    }
    _addFace(g, c, spec.template ?? 'humanoid');
    const simpleTypes = new Set(['hat', 'belt', 'cape', 'scarf', 'glasses', 'horns', 'antlers', 'tail', 'wings', 'necklace']);
    (spec.accessories ?? []).slice(0, 2)
        .filter(a => simpleTypes.has(_accType(a)))
        .forEach(a => _renderAccessory(g, a, c, 'minimum'));
    g.position.y = -0.5;
    return g;
}

function _renderCustomParts(g, parts = [], limit = 24) {
    const rad = deg => (Number(deg) || 0) * Math.PI / 180;
    parts.slice(0, limit).forEach(p => {
        const rot = (p.rx || p.ry || p.rz) ? [rad(p.rx), rad(p.ry), rad(p.rz)] : undefined;
        g.add(_box(p.w, p.h, p.d, p.color, p.x, p.y, p.z, rot));
    });
}

// Shirt patterns are painted into the torso texture (_shirtTexture) — pixels,
// not overlay boxes, so they work at every tier and can never clip.

// ─── MEDIUM tier ──────────────────────────────────────────────────────────
// Budget: max 4 accessories, max 2 tattoos (arm/chest/back only)

function _buildMedium(spec) {
    const g = new THREE.Group();
    const c = spec.colors ?? _defaultSpec().colors;
    const { bx, bz } = _buildScale(spec.build);
    _addBaseBody(g, c, bx, bz, spec.template ?? 'humanoid');
    // Shirt sleeves on upper arms (medium+) — geometry shells for volume
    const sleeveColor = _lighten(c.shirt, 0.04);
    if (_armL) _armL.add(_box(0.52, 0.65, 0.52, sleeveColor, 0, -0.25, 0));
    if (_armR) _armR.add(_box(0.52, 0.65, 0.52, sleeveColor, 0, -0.25, 0));
    // Collar strip at neck
    g.add(_box(0.85, 0.12, 0.62, _lighten(c.shirt, 0.2), 0, _Y.COLLAR, 0));
    _addHairMedium(g, c);
    if ((spec.template ?? 'humanoid') === 'anthro_biped') {
        _addAnthroFeatures(g, c);
        _addBellyZone(g, c, bx, bz);
    }
    _addFace(g, c, spec.template ?? 'humanoid');
    (spec.accessories ?? []).slice(0, 4).forEach(a => _renderAccessory(g, a, c, 'medium'));
    const tattooLocs = new Set(['chest', 'left_arm', 'right_arm', 'back']);
    const tattoos = (spec.tattoos ?? []).filter(t => tattooLocs.has(t.location)).slice(0, 2);
    _addTattoos(g, tattoos, bx, bz);
    _renderCustomParts(g, spec.custom_parts, 12);
    g.position.y = -0.5;
    return g;
}

// ─── HIGH tier ────────────────────────────────────────────────────────────
// Budget: max 6 accessories, all tattoo locations

function _buildHigh(spec) {
    const g = new THREE.Group();
    const c = spec.colors ?? _defaultSpec().colors;
    const { bx, bz } = _buildScale(spec.build);
    _addBaseBody(g, c, bx, bz, spec.template ?? 'humanoid');
    // Sleeves on upper arms — NO wrist cuffs (the light-shirt cuff ring read
    // as a blue glitch band around the hands)
    const sleeveColor = _lighten(c.shirt, 0.04);
    if (_armL) _armL.add(_box(0.52, 0.65, 0.52, sleeveColor, 0, -0.25, 0));
    if (_armR) _armR.add(_box(0.52, 0.65, 0.52, sleeveColor, 0, -0.25, 0));
    // Collar strip at neck
    g.add(_box(0.85, 0.12, 0.62, _lighten(c.shirt, 0.2), 0, _Y.COLLAR, 0));
    _addHairMedium(g, c);
    if ((spec.template ?? 'humanoid') === 'anthro_biped') {
        _addAnthroFeatures(g, c);
        _addBellyZone(g, c, bx, bz);
    }
    _addFace(g, c, spec.template ?? 'humanoid');
    (spec.accessories ?? []).slice(0, 6).forEach(a => _renderAccessory(g, a, c, 'high'));
    _addTattoos(g, spec.tattoos ?? [], bx, bz);
    _renderCustomParts(g, spec.custom_parts, 24);
    g.position.y = -0.5;
    return g;
}

// ─── Accessory dispatcher ─────────────────────────────────────────────────

function _renderAccessory(group, acc, c, tier) {
    const type  = _accType(acc);
    const color = _accColor(acc, c.accent);
    const sc    = _accScale(acc);
    const pos   = typeof acc === 'string' ? '' : (acc.position ?? '');

    switch (type) {
        case 'hat':          _addHat(group, c, sc);                                        break;
        case 'crown':        _addCrown(group, color, sc);                                  break;
        case 'halo':         _addHalo(group, color, sc);                                   break;
        case 'glasses':      _addGlasses(group, color);                                    break;
        case 'scarf':        _addScarf(group, color, sc);                                  break;
        case 'cape':         _addCape(group, color, sc);                                   break;
        case 'belt':         _addBelt(group, color);                                       break;
        case 'horns':        _addHorns(group, color, sc);                                  break;
        case 'antlers':      _addAntlers(group, color, sc);                                break;
        case 'necklace':     _addNecklace(group, color);                                   break;
        case 'wings':        _addWings(group, color, sc);                                  break;
        case 'tail':         _addTail(group, _accColor(acc, c.hair), sc);                  break;
        case 'shoulder_pad': _addShoulderPad(group, color, sc, pos);                       break;
        case 'armor_chest':  if (tier !== 'minimum') _addArmorChest(group, color, sc);    break;
        case 'gloves':       if (tier === 'high')    _addGloves(group, color, pos);        break;
    }
}

// ─── Hair ─────────────────────────────────────────────────────────────────

// Cluster hair — voxel-art principles: (1) silhouette first, one rounded
// dome mass; (2) shade by REGION like a light source — front/top highlighted,
// nape/under darkened — never randomly; (3) heavy overlap, no gaps; (4) waves
// live only on the trim edge as alternating curl depth. Axis-aligned.
// Deterministic per colour+style, so the same character always renders alike.
// Hair render colour — one uniform tone, 14% darker than the spec colour
// (multi-shade variants read as light-brown/red-brown patches; removed)
function _hairColor(c) { return _darken(c.hair, 0.14); }

function _addHairMedium(group, c) {
    const style = c.hair_style ?? 'short';
    if (style === 'bald') return;
    const rnd  = _seededRnd(`${c.hair}|${style}`);
    const col  = _hairColor(c);
    const tuft = (w, h, d, x, y, z) => group.add(_box(w, h, d, col, x, y, z));
    _addHairDome(tuft, rnd);
    _addHairSilhouette(tuft, rnd, style);
}

// Shared dome: two crown layers + wavy fringe trim + side/nape settle cubes
function _addHairDome(tuft, rnd) {
    // Layer 1 — 5×5 wide
    for (let ix = 0; ix < 5; ix++) {
        for (let iz = 0; iz < 5; iz++) {
            tuft(0.24, 0.16 + rnd() * 0.04, 0.24, -0.4 + ix * 0.2, 3.2, -0.4 + iz * 0.2);
        }
    }
    // Layer 2 — 3×3 shifted slightly back → rounded top
    for (let ix = 0; ix < 3; ix++) {
        for (let iz = 0; iz < 3; iz++) {
            tuft(0.26, 0.14 + rnd() * 0.03, 0.26, -0.24 + ix * 0.24, 3.33, -0.28 + iz * 0.22);
        }
    }
    // Wavy trim — alternating curl depth along the front fringe
    [[-0.32, 0.47], [-0.1, 0.42], [0.12, 0.47], [0.34, 0.43]].forEach(([x, z], i) => {
        tuft(0.2, 0.1 + (i % 2) * 0.05, 0.13, x, 3.1, z);
    });
    // Sides — flush settle cubes over the painted band
    tuft(0.13, 0.22, 0.55, -0.5, 3.04, -0.08);
    tuft(0.13, 0.22, 0.55,  0.5, 3.04, -0.08);
    // Nape — under-row settling the back edge
    for (let i = 0; i < 3; i++) {
        tuft(0.3, 0.18, 0.13, -0.3 + i * 0.3, 2.98, -0.5);
    }
}

// Style-specific silhouette on top of the dome (axis-aligned)
function _addHairSilhouette(tuft, rnd, style) {
    if (style === 'long') {
        for (let i = 0; i < 5; i++) {
            tuft(0.22, 0.5 + rnd() * 0.12, 0.14, -0.36 + i * 0.18, 2.5, -0.52);
        }
        tuft(0.14, 0.55, 0.2, -0.52, 2.55, 0.05);
        tuft(0.14, 0.55, 0.2,  0.52, 2.55, 0.05);
    } else if (style === 'spiky') {
        for (let i = 0; i < 4; i++) {
            tuft(0.16, 0.3 + rnd() * 0.12, 0.16, -0.3 + i * 0.2, 3.48, -0.15 + (i % 2) * 0.3);
        }
    } else if (style === 'bun') {
        tuft(0.34, 0.3, 0.3, 0, 3.42, -0.42);
        tuft(0.24, 0.18, 0.2, 0, 3.6, -0.4);
    }
}

// ─── Accessories ──────────────────────────────────────────────────────────

function _addGlasses(group, color) {
    _boxes(group, color, [
        [0.28, 0.18, 0.06, -0.22, 2.72, 0.48],
        [0.28, 0.18, 0.06,  0.22, 2.72, 0.48],
        [0.14, 0.05, 0.05,  0,    2.72, 0.48],
    ]);
}

function _addHat(group, c, sc) {
    _boxes(group, c.hair, [
        [1.1  * sc, 0.14,       1.1  * sc,  0, 3.28, 0],
        [0.85 * sc, 0.5  * sc,  0.85 * sc,  0, 3.57, 0],
    ]);
}

function _addCrown(group, color, sc) {
    _boxes(group, color, [
        [0.95 * sc, 0.12,       0.95 * sc,  0,     3.24, 0],
        [0.14,      0.28 * sc,  0.14,       -0.32, 3.38, 0],
        [0.14,      0.36 * sc,  0.14,        0,    3.42, 0],
        [0.14,      0.28 * sc,  0.14,        0.32, 3.38, 0],
    ]);
}

function _addHalo(group, color, sc) {
    const r = 0.52 * sc;
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        group.add(_box(0.18, 0.08, 0.18, color, Math.sin(a) * r, 3.55, Math.cos(a) * r));
    }
}

function _addScarf(group, color, sc) {
    const dark = _darken(color, 0.08);
    // Wrap ring — four segments around the neck, each slightly rotated so the
    // scarf reads as wrapped fabric rather than a rigid collar box
    _boxes(group, color, [
        [0.88, 0.26 * sc, 0.32, 0,     2.12, 0.24,  [0.05,  0.1,  0.04]],
        [0.88, 0.28 * sc, 0.3,  0,     2.15, -0.24, [-0.04, -0.08, 0  ]],
        [0.3,  0.26 * sc, 0.6,  -0.38, 2.12, 0,     [0,     0.09, 0.05]],
        [0.3,  0.24 * sc, 0.6,   0.38, 2.14, 0,     [0,    -0.07, -0.04]],
    ]);
    // Hanging tail — three segments draping down the chest, alternating tilt
    // like folded fabric; layered proud of the torso front
    _boxes(group, color, [
        [0.27, 0.44 * sc, 0.14, -0.13, 1.76, 0.37, [0.07, 0,  0.13]],
        [0.23, 0.32 * sc, 0.12, -0.15, 1.16, 0.42, [0.05, 0,  0.16]],
    ]);
    _boxes(group, dark, [
        [0.25, 0.4 * sc, 0.13, -0.2, 1.45, 0.4, [0.09, 0, -0.11]],
    ]);
}

function _addCape(group, color, sc) {
    group.add(_box(0.95 * sc, 1.35 * sc, 0.1, color, 0, 1.3, -0.4));
}

function _addBelt(group, color) {
    // Layered OUTSIDE the torso, and tall/low enough to fully cover the
    // shirt-to-pants seam — no shirt sliver bulging out beneath the belt
    const { bx, bz } = _bodyScale;
    group.add(_box(bx + 0.12, 0.24, bz + 0.12, color, 0, 0.9, 0));
}

function _addHorns(group, color, sc) {
    _boxes(group, color, [
        [0.18, 0.55 * sc, 0.18, -0.28, 3.42, 0],
        [0.18, 0.55 * sc, 0.18,  0.28, 3.42, 0],
    ]);
}

function _addAntlers(group, color, sc = 1) {
    const col = color || '#7a5018';
    const dark = _darken(col, 0.15);
    // Left beam: rises and sweeps outward; palm is a wide flat plate; 4 tines up
    _boxes(group, col, [
        [0.15*sc, 0.5*sc,  0.12*sc, -0.3,       3.28, 0.05],   // lower trunk
        [0.13*sc, 0.38*sc, 0.1*sc,  -0.48*sc,   3.68, 0.04],   // upper trunk sweeping out
        [0.72*sc, 0.16*sc, 0.1*sc,  -0.82*sc,   3.92, 0.04],   // palm plate (wide)
        [0.12*sc, 0.3*sc,  0.08*sc, -0.5*sc,    4,    0.04],   // tine 1 — inner
        [0.12*sc, 0.38*sc, 0.08*sc, -0.74*sc,   4,    0.04],   // tine 2
        [0.12*sc, 0.42*sc, 0.08*sc, -0.98*sc,   4,    0.04],   // tine 3
        [0.1*sc,  0.26*sc, 0.08*sc, -1.16*sc,   3.95, 0.04],   // outer tip
        [0.1*sc,  0.22*sc, 0.08*sc, -0.32*sc,   3.72, 0.05],   // brow tine (forward)
    ]);
    _boxes(group, dark, [
        // Right: mirror (negate x)
        [0.15*sc, 0.5*sc,  0.12*sc,  0.3,       3.28, 0.05],
        [0.13*sc, 0.38*sc, 0.1*sc,   0.48*sc,   3.68, 0.04],
        [0.72*sc, 0.16*sc, 0.1*sc,   0.82*sc,   3.92, 0.04],
        [0.12*sc, 0.3*sc,  0.08*sc,  0.5*sc,    4,    0.04],
        [0.12*sc, 0.38*sc, 0.08*sc,  0.74*sc,   4,    0.04],
        [0.12*sc, 0.42*sc, 0.08*sc,  0.98*sc,   4,    0.04],
        [0.1*sc,  0.26*sc, 0.08*sc,  1.16*sc,   3.95, 0.04],
        [0.1*sc,  0.22*sc, 0.08*sc,  0.32*sc,   3.72, 0.05],
    ]);
}

function _addNecklace(group, color) {
    group.add(_box(0.72, 0.04, 0.04, _lighten(color, 0.15), 0, 2,    0.34));  // chain band
    group.add(_box(0.14, 0.14, 0.06, color,                 0, 1.87, 0.34));  // pendant
}

function _addWings(group, color, sc) {
    _boxes(group, color ?? '#c8a030', [
        [1.2 * sc, 1.1 * sc, 0.12, -1.1 * sc, 1.6, -0.1],
        [1.2 * sc, 1.1 * sc, 0.12,  1.1 * sc, 1.6, -0.1],
        [0.7 * sc, 0.7 * sc, 0.1,  -1.7 * sc, 1.1, -0.1],
        [0.7 * sc, 0.7 * sc, 0.1,   1.7 * sc, 1.1, -0.1],
    ]);
}

function _addTail(group, color, sc = 1) {
    const light = _lighten(color, 0.28);
    if (sc < 0.85) {
        // Small — short deer/reindeer bob: wide fluffy puff
        _boxes(group, light, [
            [0.3,  0.22, 0.16, 0,     0.7,  -0.52],
            [0.22, 0.14, 0.12, 0,     0.88, -0.5 ],
        ]);
        _boxes(group, color, [
            [0.18, 0.18, 0.12, 0,     0.72, -0.55],
        ]);
    } else if (sc < 1.2) {
        // Medium — round fluffy tail (cat/fox mid-length)
        _boxes(group, color, [
            [0.22, 0.55, 0.2,  0,     0.7,  -0.52],
            [0.18, 0.38, 0.16, 0,     0.25, -0.72],
        ]);
        _boxes(group, light, [
            [0.16, 0.45, 0.12, 0,     0.68, -0.56],
        ]);
    } else {
        // Large — long bushy tail (wolf/fox), sweeps down and back
        _boxes(group, color, [
            [0.24, 0.7,  0.22, 0,     0.75, -0.52],
            [0.2,  0.55, 0.18, 0,     0.22, -0.8 ],
            [0.16, 0.38, 0.14, 0,    -0.18, -0.94],
        ]);
        _boxes(group, light, [
            [0.14, 0.55, 0.1,  0,     0.72, -0.56],
            [0.12, 0.38, 0.08, 0,     0.2,  -0.83],
        ]);
    }
}

function _addShoulderPad(group, color, sc, pos) {
    let sides;
    if (pos === 'left_shoulder')       sides = [-1];
    else if (pos === 'right_shoulder') sides = [1];
    else                               sides = [-1, 1];
    sides.forEach(side => {
        group.add(_box(0.32 * sc, 0.22,       0.5  * sc, color,                    side * 0.7, 2,    0));
        group.add(_box(0.28 * sc, 0.12,       0.44 * sc, _lighten(color, 0.1),     side * 0.7, 1.85, 0));
    });
}

function _addArmorChest(group, color, sc) {
    group.add(_box(0.8  * sc, 0.9  * sc, 0.08, color,                  0, 1.5,  0.32));
    group.add(_box(0.35 * sc, 0.35 * sc, 0.06, _lighten(color, 0.15),  0, 1.72, 0.36));
}

function _addGloves(group, color, pos) {
    let sides;
    if (pos === 'left_hand')       sides = [[-0.55, 0.82, 0]];
    else if (pos === 'right_hand') sides = [[ 0.55, 0.82, 0]];
    else                           sides = [[-0.55, 0.82, 0], [0.55, 0.82, 0]];
    sides.forEach(([x, y, z]) => group.add(_box(0.42, 0.18, 0.42, color, x, y, z)));
}

// ─── Tattoos ─────────────────────────────────────────────────────────────

function _addTattoos(group, tattoos, bx, bz) {
    const szMap = { small: 0.22, medium: 0.38, large: 0.58 };
    tattoos.forEach(t => _placeTattoo(group, t.location, t.color ?? '#cc2222', szMap[t.size] ?? 0.38, bx, bz));
}

function _placeTattoo(group, loc, color, sz, bx, bz) {
    const th = 0.05;
    switch (loc) {
        case 'chest':      group.add(_box(sz,         sz,        th, color, 0,     1.55,   bz * 0.5 + 0.04));  break;
        case 'left_arm':   group.add(_box(th,         sz,        sz, color, -(bx * 0.5 + 0.29), 1.5, 0));      break;
        case 'right_arm':  group.add(_box(th,         sz,        sz, color,   bx * 0.5 + 0.29,  1.5, 0));      break;
        case 'back':       group.add(_box(sz,         sz,        th, color, 0,     1.55,  -(bz * 0.5 + 0.04))); break;
        case 'left_leg':   group.add(_box(th,  sz * 0.85, sz * 0.6, color, -0.26, 0.3,   0.28));               break;
        case 'right_leg':  group.add(_box(th,  sz * 0.85, sz * 0.6, color,  0.26, 0.3,   0.28));               break;
        case 'neck':       group.add(_box(sz * 0.55, sz * 0.4,  th, color, 0,     2.12,  0.34));               break;
        case 'face':       group.add(_box(sz * 0.5,  sz * 0.4,  th, color, sz * 0.2, 2.68, 0.48));             break;
        case 'lower_back': group.add(_box(sz,   sz * 0.5,        th, color, 0,     0.9,  -(bz * 0.5 + 0.04))); break;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function _buildScale(build) {
    const s = ({ slim: 0.85, medium: 1, stocky: 1.2, tall: 1, short: 0.9 })[build] ?? 1;
    return { bx: s, bz: 0.62 * (build === 'stocky' ? 1.1 : 1) };
}

function _lighten(hex, amt) {
    const c = new THREE.Color(hex);
    return `#${new THREE.Color(Math.min(c.r + amt, 1), Math.min(c.g + amt, 1), Math.min(c.b + amt, 1)).getHexString()}`;
}

function _darken(hex, amt) {
    const c = new THREE.Color(hex);
    return `#${new THREE.Color(Math.max(c.r - amt, 0), Math.max(c.g - amt, 0), Math.max(c.b - amt, 0)).getHexString()}`;
}

// Blend two colours: t=0 → a, t=1 → b
function _mixColor(a, b, t) {
    return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

// ─── Drag rotation ────────────────────────────────────────────────────────

function _bindDrag(canvas) {
    canvas.addEventListener('mousedown', e => { _drag.active = true; _drag.lastX = e.clientX; });
    canvas.addEventListener('mousemove', e => {
        if (!_drag.active || !_charGroup) return;
        _charGroup.rotation.y += (e.clientX - _drag.lastX) * 0.012;
        _drag.lastX = e.clientX;
    });
    const stop = () => { _drag.active = false; };
    canvas.addEventListener('mouseup',    stop);
    canvas.addEventListener('mouseleave', stop);
    canvas.addEventListener('touchstart', e => { _drag.active = true; _drag.lastX = e.touches[0].clientX; }, { passive: true });
    canvas.addEventListener('touchmove',  e => {
        if (!_drag.active || !_charGroup) return;
        _charGroup.rotation.y += (e.touches[0].clientX - _drag.lastX) * 0.012;
        _drag.lastX = e.touches[0].clientX;
    }, { passive: true });
    canvas.addEventListener('touchend', stop);
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        if (!_camera) return;
        _camera.position.z = Math.max(2, Math.min(22, _camera.position.z + e.deltaY * 0.02));
    }, { passive: false });
}
