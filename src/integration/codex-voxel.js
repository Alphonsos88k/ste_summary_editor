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

const _HAIR_STYLE = {
    long:  [[0.85, 0.8, 0.18, 0, 2.7, -0.55], [0.18, 0.6, 0.18, -0.44, 2.5, -0.1], [0.18, 0.6, 0.18, 0.44, 2.5, -0.1]],
    bun:   [[0.5, 0.4, 0.5, 0, 3.46, -0.2]],
    spiky: [[0.2, 0.5, 0.18, -0.22, 3.48, 0], [0.2, 0.5, 0.18, 0, 3.52, 0], [0.2, 0.5, 0.18, 0.22, 3.48, 0]],
    short: [[0.88, 0.18, 0.3, 0, 2.98, -0.3]],
};

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

    _camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    _setCamera('front');

    _lightAmb  = new THREE.AmbientLight(0xffffff, 0.55);
    _lightDir  = new THREE.DirectionalLight(0xffffff, 0.75);
    _lightFill = new THREE.DirectionalLight(0x8888ff, 0.25);
    _lightDir.position.set(3, 5, 4);
    _lightFill.position.set(-3, 0, -2);
    _scene.add(_lightAmb);
    _scene.add(_lightDir);
    _scene.add(_lightFill);

    _applyLighting(spec?.lighting ?? 'standard');

    _renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(w, h);
    container.innerHTML = '';
    container.appendChild(_renderer.domElement);

    _charGroup     = _buildCharacter(spec ?? _defaultSpec());
    _backdropGroup = _buildBackdrop(spec ?? _defaultSpec());
    _scene.add(_charGroup);
    _scene.add(_backdropGroup);

    _bindDrag(_renderer.domElement);
    _loop();
    return true;
}

export function disposeVoxel() {
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;
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
    _lightAmb      = null;
    _lightDir      = null;
    _lightFill     = null;
    _autoSpin      = false;
}

export function setVoxelSpec(spec) {
    if (!_scene) return;
    if (_charGroup)     { _scene.remove(_charGroup);     _disposeGroup(_charGroup);     }
    if (_backdropGroup) { _scene.remove(_backdropGroup); _disposeGroup(_backdropGroup); }
    _applyLighting(spec?.lighting ?? 'standard');
    _charGroup     = _buildCharacter(spec);
    _backdropGroup = _buildBackdrop(spec);
    _scene.add(_charGroup);
    _scene.add(_backdropGroup);
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
    const targets = { front: [0, 0, 6.5], quarter: [4.5, 0.5, 4.5], back: [0, 0, -6.5] };
    _camera.position.set(...(targets[type] ?? targets.front));
    _camera.lookAt(0, 0.5, 0);
}

// ─── Render loop ──────────────────────────────────────────────────────────

function _loop() {
    _animId = requestAnimationFrame(_loop);
    if (_autoSpin && _charGroup) _charGroup.rotation.y += 0.008;
    if (_renderer && _scene && _camera) _renderer.render(_scene, _camera);
}

// ─── Lighting presets ─────────────────────────────────────────────────────

function _applyLighting(mode) {
    if (!_lightAmb || !_lightDir || !_lightFill) return;
    const presets = {
        //               bg        amb               dir                        fill
        standard: { bg: 0x181b22, amb: [0xffffff, 0.55], dir: [0xffffff, 0.75, [ 3,  5,  4]], fill: [0x8888ff, 0.25, [-3,  0, -2]] },
        warm:     { bg: 0x1a1008, amb: [0xffe0c0, 0.6],  dir: [0xffcc88, 0.8,  [ 2,  5,  3]], fill: [0xcc8844, 0.2,  [-2,  0, -2]] },
        cool:     { bg: 0x0c1020, amb: [0xc0d0ff, 0.5],  dir: [0x88aaff, 0.75, [ 3,  5,  4]], fill: [0xaaccff, 0.3,  [-3,  0, -2]] },
        dramatic: { bg: 0x050508, amb: [0x111111, 0.3],  dir: [0xffffff, 1.2,  [ 5,  8,  3]], fill: [0x000088, 0.15, [-4,  0, -3]] },
        eerie:    { bg: 0x020a02, amb: [0x002200, 0.4],  dir: [0x00ff66, 0.5,  [ 1,  6,  2]], fill: [0x220033, 0.5,  [-2,  0, -3]] },
    };
    const p = presets[mode] ?? presets.standard;
    if (_scene) _scene.background = new THREE.Color(p.bg);
    _lightAmb.color.setHex(p.amb[0]);    _lightAmb.intensity  = p.amb[1];
    _lightDir.color.setHex(p.dir[0]);    _lightDir.intensity  = p.dir[1];  _lightDir.position.set(...p.dir[2]);
    _lightFill.color.setHex(p.fill[0]);  _lightFill.intensity = p.fill[1]; _lightFill.position.set(...p.fill[2]);
}

// ─── Three.js loader ─────────────────────────────────────────────────────

async function _loadThree() {
    try {
        return await import('../../lib/three.module.js');
    } catch {
        try {
            return await import('https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js');
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

function _box(w, h, d, color, x, y, z) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(color) })
    );
    mesh.position.set(x, y, z);
    return mesh;
}

// Same-color batch: specs are [w, h, d, x, y, z]
function _boxes(group, color, specs) {
    specs.forEach(([w, h, d, x, y, z]) => group.add(_box(w, h, d, color, x, y, z)));
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
        template: 'humanoid',
        tier:     'high',
        build:    'medium',
        colors: {
            skin:       '#c8a06a',
            hair:       '#2c1a08',
            hair_style: 'short',
            eye:        '#3a6a3a',
            shirt:      '#2a3a5a',
            pants:      '#2a2218',
            shoes:      '#181008',
            accent:     '#8a6030',
        },
        tattoos:     [],
        accessories: [],
        lighting:    'standard',
        backdrop:    [],
    };
}

// ─── Backdrop builder ─────────────────────────────────────────────────────

const _BACKDROP_MED = new Set(['none', 'floor', 'forest', 'castle', 'cave', 'clouds']);

function _buildBackdrop(spec) {
    const tier = spec.tier ?? 'minimum';
    const g    = new THREE.Group();

    let rawList;
    if (Array.isArray(spec.backdrop))  rawList = spec.backdrop.slice(0, 2);
    else if (spec.backdrop)            rawList = [String(spec.backdrop)];
    else                               rawList = [];

    // Minimum: no backdrop geometry — just wireframe grid
    if (tier === 'minimum' || rawList.length === 0) {
        _addGridBackdrop(g);
        return g;
    }

    _addFloor(g);

    rawList.forEach(raw => {
        const name = String(raw).toLowerCase().trim();
        if (name === 'none' || name === 'floor') return;
        if (tier === 'medium' && !_BACKDROP_MED.has(name)) { _addGenericEnv(g, name, tier); return; }
        if      (name === 'castle')  _addCastle(g, tier);
        else if (name === 'forest')  _addForest(g, tier);
        else if (name === 'lake')    _addLake(g);
        else if (name === 'cave')    _addCave(g, tier);
        else if (name === 'dungeon') _addDungeon(g);
        else if (name === 'clouds')  _addClouds(g);
        else                         _addGenericEnv(g, name, tier);
    });

    return g;
}

// ── Default backdrop — grid + wireframe back plane ────────────────────────

function _addGridBackdrop(group) {
    const grid = new THREE.GridHelper(8, 8, 0x484848, 0x303030);
    grid.position.y = -1.05;
    group.add(grid);

    const bgGeo = new THREE.PlaneGeometry(8, 5);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x2a2a38, wireframe: true, transparent: true, opacity: 0.28 });
    const bgPlane = new THREE.Mesh(bgGeo, bgMat);
    bgPlane.position.set(0, 1, -3);
    group.add(bgPlane);
}

// ── Solid floor ───────────────────────────────────────────────────────────

function _addFloor(group) {
    for (let x = -3; x <= 3; x++) {
        for (let z = -2; z <= 3; z++) {
            group.add(_box(0.96, 0.18, 0.96, (x + z) % 2 === 0 ? '#2e2e2e' : '#252525', x, -1.1, z));
        }
    }
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

// Shared base body — called by all 3 tiers.
function _addBaseBody(g, c, bx, bz) {
    _boxes(g, c.skin, [
        [0.9,  0.9,  0.9,  0,                   _Y.HEAD,  0   ],
        [0.4,  1.1,  0.4, -(bx * 0.5 + 0.25),  _Y.CHEST,  0   ],
        [0.4,  1.1,  0.4,   bx * 0.5 + 0.25,   _Y.CHEST,  0   ],
    ]);
    g.add(_box(bx, 1.2, bz, c.shirt, 0, _Y.CHEST, 0));
    _boxes(g, c.pants, [
        [0.42 * bx, 1.2,  0.5 * bz, -0.22, _Y.HIP,  0   ],
        [0.42 * bx, 1.2,  0.5 * bz,  0.22, _Y.HIP,  0   ],
    ]);
    _boxes(g, c.shoes, [
        [0.48 * bx, 0.28, 0.65,      -0.22, _Y.SHOE, 0.05],
        [0.48 * bx, 0.28, 0.65,       0.22, _Y.SHOE, 0.05],
    ]);
}

// ─── Anthro body features — added when template === 'anthro_biped' ─────────

function _addAnthroFeatures(g, c) {
    // Muzzle — protrudes from lower front of head block
    g.add(_box(0.44, 0.28, 0.3, _lighten(c.skin, -0.07), 0, 2.38, 0.58));
    // Animal ears on top-sides of head (drawn in hair/fur colour)
    _boxes(g, c.hair, [
        [0.16, 0.3, 0.14, -0.52, 3.06, 0],
        [0.16, 0.3, 0.14,  0.52, 3.06, 0],
    ]);
}

// ─── MINIMUM tier ─────────────────────────────────────────────────────────
// Budget: max 2 accessories, no tattoos

function _buildMinimum(spec) {
    const g = new THREE.Group();
    const c = spec.colors ?? _defaultSpec().colors;
    const { bx, bz } = _buildScale(spec.build);
    _addBaseBody(g, c, bx, bz);
    const simpleTypes = new Set(['hat', 'belt', 'cape', 'scarf', 'horns', 'antlers', 'tail']);
    (spec.accessories ?? []).slice(0, 2)
        .filter(a => simpleTypes.has(_accType(a)))
        .forEach(a => _renderAccessory(g, a, c, 'minimum'));
    g.position.y = -0.5;
    return g;
}

function _renderCustomParts(g, parts = [], limit = 24) {
    parts.slice(0, limit).forEach(p => g.add(_box(p.w, p.h, p.d, p.color, p.x, p.y, p.z)));
}

// ─── MEDIUM tier ──────────────────────────────────────────────────────────
// Budget: max 4 accessories, max 2 tattoos (arm/chest/back only)

function _buildMedium(spec) {
    const g = new THREE.Group();
    const c = spec.colors ?? _defaultSpec().colors;
    const { bx, bz } = _buildScale(spec.build);
    _addBaseBody(g, c, bx, bz);
    _addHairMedium(g, c);
    if ((spec.template ?? 'humanoid') === 'anthro_biped') _addAnthroFeatures(g, c);
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
    _addBaseBody(g, c, bx, bz);
    _addHairMedium(g, c);
    if ((spec.template ?? 'humanoid') === 'anthro_biped') _addAnthroFeatures(g, c);
    // Eye blocks + collar + arm cuffs
    _boxes(g, c.eye, [[0.16, 0.14, 0.06, -0.22, 2.68, 0.46], [0.16, 0.14, 0.06, 0.22, 2.68, 0.46]]);
    g.add(_box(0.85, 0.12, 0.62, _lighten(c.shirt, 0.2),  0,     _Y.COLLAR, 0));
    _boxes(g, _lighten(c.shirt, 0.15), [
        [0.42, 0.14, 0.42, -0.53, _Y.CUFF, 0],
        [0.42, 0.14, 0.42,  0.53, _Y.CUFF, 0],
    ]);
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
        case 'tail':         _addTail(group, _accColor(acc, c.hair));                      break;
        case 'shoulder_pad': _addShoulderPad(group, color, sc, pos);                       break;
        case 'armor_chest':  if (tier !== 'minimum') _addArmorChest(group, color, sc);    break;
        case 'gloves':       if (tier === 'high')    _addGloves(group, color, pos);        break;
    }
}

// ─── Hair ─────────────────────────────────────────────────────────────────

function _addHairMedium(group, c) {
    _boxes(group, c.hair, [[0.92, 0.22, 0.92, 0, _Y.HAIR, 0]]);
    _boxes(group, c.hair, _HAIR_STYLE[c.hair_style] ?? _HAIR_STYLE.short);
    _boxes(group, c.hair, [[0.18, 0.5, 0.18, -0.46, _Y.HEAD, 0], [0.18, 0.5, 0.18, 0.46, _Y.HEAD, 0]]);
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
    _boxes(group, color, [
        [0.92, 0.28 * sc, 0.65,   0,    2.1,  0  ],
        [0.22, 0.55 * sc, 0.22,  -0.18, 1.7,  0.3],
    ]);
}

function _addCape(group, color, sc) {
    group.add(_box(0.95 * sc, 1.35 * sc, 0.1, color, 0, 1.3, -0.4));
}

function _addBelt(group, color) {
    group.add(_box(0.95, 0.14, 0.62, color, 0, 0.95, 0));
}

function _addHorns(group, color, sc) {
    _boxes(group, color, [
        [0.18, 0.55 * sc, 0.18, -0.28, 3.42, 0],
        [0.18, 0.55 * sc, 0.18,  0.28, 3.42, 0],
    ]);
}

function _addAntlers(group, color, sc = 1) {
    // Palmate antlers — wide branching spread from crown of head
    _boxes(group, color || '#7a5018', [
        // Left: trunk → palm bar → 3 tines
        [0.1 * sc, 0.62 * sc, 0.1 * sc, -0.28,  3.3,  0],
        [0.5 * sc, 0.1  * sc, 0.1 * sc, -0.52,  3.75, 0],
        [0.1 * sc, 0.24 * sc, 0.1 * sc, -0.28,  3.82, 0],
        [0.1 * sc, 0.2  * sc, 0.1 * sc, -0.72,  3.82, 0],
        [0.1 * sc, 0.14 * sc, 0.1 * sc, -0.12,  3.82, 0],
        // Right: mirrored
        [0.1 * sc, 0.62 * sc, 0.1 * sc,  0.28,  3.3,  0],
        [0.5 * sc, 0.1  * sc, 0.1 * sc,  0.52,  3.75, 0],
        [0.1 * sc, 0.24 * sc, 0.1 * sc,  0.28,  3.82, 0],
        [0.1 * sc, 0.2  * sc, 0.1 * sc,  0.72,  3.82, 0],
        [0.1 * sc, 0.14 * sc, 0.1 * sc,  0.12,  3.82, 0],
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

function _addTail(group, color) {
    _boxes(group, color, [
        [0.22, 0.8,  0.22, 0, 0.6,   -0.52],
        [0.18, 0.55, 0.18, 0, 0.05,  -0.8 ],
    ]);
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
}
