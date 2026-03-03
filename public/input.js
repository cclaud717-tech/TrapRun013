// --- INPUT DEĞİŞKENLERİ ---
let keys = {};
let isDrawing = false;
let buildCanvas = document.getElementById('build-canvas');

function isTypingTarget() {
    const el = document.activeElement;
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
}

function normalizeKey(key) {
    if (key.length === 1) return key.toLowerCase();
    return key;
}

function resetInputState() {
    keys = {};
    isDrawing = false;
}

// --- KLAVYE DİNLEYİCİLERİ ---
window.addEventListener('keydown', (e) => {
    if (isTypingTarget()) return;
    const key = normalizeKey(e.key);
    keys[key] = true;

    // --- BUILD MODE: Ctrl+Z (Undo) / Ctrl+Y (Redo) ---
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (typeof undoBuild === 'function') undoBuild();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (typeof redoBuild === 'function') redoBuild();
        return;
    }

    if (!e.repeat && (key === 'ArrowUp' || key === 'w' || key === ' ')) {
        if (typeof performJump === 'function') performJump();
    }
});

window.addEventListener('keyup', (e) => {
    if (isTypingTarget()) return;
    const key = normalizeKey(e.key);
    keys[key] = false;
});

window.addEventListener('blur', resetInputState);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetInputState();
});

// --- İNŞAAT GİRDİLERİ ---
if (buildCanvas) {
    buildCanvas.addEventListener('mousedown', () => isDrawing = true);
    buildCanvas.addEventListener('mouseup', () => isDrawing = false);
    buildCanvas.addEventListener('mousemove', (e) => { if (isDrawing) handleBuildInput(e); });
    buildCanvas.addEventListener('click', (e) => handleBuildInput(e));

    // Mouse gezinirken cursor'u güncelle
    buildCanvas.addEventListener('mousemove', (e) => {
        const rect = buildCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const c = Math.floor(x / TILE_SIZE);
        const r = Math.floor(y / TILE_SIZE);

        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
            editorCursor.r = r;
            editorCursor.c = c;
            editorCursor.active = true;
            if (screens.build.classList.contains('active')) {
                requestAnimationFrame(drawBuildGrid);
            }
        } else {
            editorCursor.active = false;
        }
    });

    // Mouse canvas'tan çıkarsa hayaleti gizle
    buildCanvas.addEventListener('mouseleave', () => {
        editorCursor.active = false;
    });

    buildCanvas.addEventListener('touchstart', (e) => {
        if (currentTool === -1) return; 

        e.preventDefault();
        isDrawing = true;
        handleBuildInput(e); 
    }, { passive: false });

    buildCanvas.addEventListener('touchmove', (e) => {
        if (currentTool === -1) return;

        e.preventDefault(); 
        if (isDrawing) {
            handleBuildInput(e); 
        }
    }, { passive: false });

    buildCanvas.addEventListener('touchend', (e) => {
        if (currentTool === -1) return;
        e.preventDefault();
        isDrawing = false;
    }, { passive: false });
}

function handleBuildInput(e) {
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    if (!buildCanvas) return;
    const rect = buildCanvas.getBoundingClientRect();
    const c = Math.floor((clientX - rect.left) / TILE_SIZE);
    const r = Math.floor((clientY - rect.top) / TILE_SIZE);

    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
        placeTile(r, c);
    }
}

// --- GELİŞMİŞ JOYSTICK MANTIĞI ---

const joystickZone = document.getElementById('joystick-zone');
const joystickBase = document.getElementById('joystick-base');
const joystickStick = document.getElementById('joystick-stick');

// Joystick değişkenleri
let joystickCenter = { x: 0, y: 0 };
let joystickActive = false;
const maxRadius = 35;

if (joystickZone) {
    joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        joystickActive = true;
        joystickStick.style.transition = 'none';

        const rect = joystickBase.getBoundingClientRect();
        joystickCenter.x = rect.left + rect.width / 2;
        joystickCenter.y = rect.top + rect.height / 2;

        handleJoystickMove(e.touches[0]);
    }, { passive: false });

    joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (joystickActive) {
            handleJoystickMove(e.touches[0]);
        }
    }, { passive: false });

    const endJoystick = (e) => {
        e.preventDefault();
        joystickActive = false;
        joystickStick.style.transition = 'transform 0.2s ease-out';
        joystickStick.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';

        keys['ArrowLeft'] = false;
        keys['ArrowRight'] = false;
    };

    joystickZone.addEventListener('touchend', endJoystick);
    joystickZone.addEventListener('touchcancel', endJoystick);
}

function handleJoystickMove(touch) {
    const dx = touch.clientX - joystickCenter.x;
    const dy = touch.clientY - joystickCenter.y;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    const clampedDist = Math.min(distance, maxRadius);
    const stickX = clampedDist * Math.cos(angle);
    const stickY = clampedDist * Math.sin(angle);

    joystickStick.style.transform = `translate(-50%, -50%) translate(${stickX}px, ${stickY}px)`;

    if (distance > 10) {
        if (dx < -10) {
            keys['ArrowLeft'] = true;
            keys['ArrowRight'] = false;
        } else if (dx > 10) {
            keys['ArrowRight'] = true;
            keys['ArrowLeft'] = false;
        } else {
            keys['ArrowLeft'] = false;
            keys['ArrowRight'] = false;
        }
    }
}

// --- ZIPLAMA BUTONU (Aynı Kalıyor - Sadece Touch Listener) ---
const btnJumpMobile = document.getElementById('btn-jump');
if (btnJumpMobile) {
    btnJumpMobile.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (typeof performJump === 'function') performJump();
    }, { passive: false });
}
