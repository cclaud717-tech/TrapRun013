// public/game.js (V4 - Sesler ve Diken Tuzağı)
const socket = io();

// --- DEĞİŞKENLER VE AYARLAR ---
const screens = {
    lobby: document.getElementById('lobby-screen'),
    build: document.getElementById('build-screen'),
    race: document.getElementById('race-screen'),
    customize: document.getElementById('customize-screen')
};

// --- EFEKT DEĞİŞKENLERİ (YENİ) ---
let screenShake = 0; // Titreme şiddeti
let triggeredMines = new Set();
let isGameEnding = false; // Oyun bitiş işlemi başladı mı?
let editorCursor = { r: -1, c: -1, active: false };
let placementEffects = []; // "Pop" animasyonları için liste

let myRole = null;
let roomID = null;
let currentTool = -1; // Başlangıçta "Kaydırma" modu seçili olsun
// 1:Zemin, 2:Start, 3:End, 4:Reset, 5:Freeze, 6:DIKEN (YENİ)
// GÜNCELLENMİŞ TUZAK LİMİTLERİ
// 4: Başa Atma (1'den 5'e çıkardık - Artık her yer mayın tarlası olabilir)
// 5: Dondurma (3'ten 5'e çıkardık)
// 7: Testere (3 tane hak verelim, çünkü çok tehlikeli)
const trapLimits = {
    4: 2,
    5: 5,
    6: 3,
    7: 3,
    8: 3,
    9: 5,
    10: 3,
    11: 4,  // Konveyör Bant
    12: 3   // Kaybolan Blok
};
let trapsPlaced = { 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };

// --- BUILD MODE UNDO/REDO ---
let undoStack = [];   // [{r, c, oldTile, newTile}]
let redoStack = [];
const MAX_UNDO = 100;
let lastSentTime = 0; // Son gönderim zamanı
let lastSentX = 0;
let lastSentY = 0;
let hasFinished = false; // Oyun bitti mi kontrolü

// --- AĞ OPTİMİZASYON DEĞİŞKENLERİ ---
const NETWORK_TICK_RATE = 50; // Veri gönderim aralığı (50ms = Saniyede 20 kez)
let lastNetworkSendTime = 0;

// --- RAUND İSTATİSTİK TAKİBİ ---
let roundStats = {
    startTime: 0,
    trapsHit: 0,
    damagesTaken: 0,
    jumpsUsed: 0,
    powerupsCollected: 0,
    distanceTraveled: 0,
    lastX: 0
};

// --- MOBİL PERFORMANS ---
// isMobileDevice → graphics.js'de tanımlı (global)
let gameLoopFrameCount = 0;

// --- PING ÖLÇER ---
let currentPing = 0;
setInterval(() => {
    const start = Date.now();
    socket.emit('client_ping', start);
}, 3000);
socket.on('client_pong', (timestamp) => {
    currentPing = Date.now() - timestamp;
    const pingEl = document.getElementById('ping-display');
    if (pingEl) {
        pingEl.innerText = currentPing + 'ms';
        pingEl.className = 'ping-display ' + (currentPing < 80 ? 'ping-good' : currentPing < 150 ? 'ping-ok' : 'ping-bad');
    }
});

const TILE_SIZE = 40;
const COLS = 60; // <--- DEĞİŞTİ (Eskisi 20 idi, şimdi upuzun bir yol var)
const ROWS = 15; 

// --- MOBİL CANVAS BOYUTLANDIRMA ---
// Harita yüksekliği: ROWS * TILE_SIZE = 600px
// Mobilde ekran yüksekliği ~360px olduğundan, tüm haritayı göstermek için
// ölçek faktörü hesaplanır (ör: 360/600 = 0.6 → her şey %60 küçülür)
let gameScale = 1;  // PC'de 1 (ölçeksiz)

function resizeRaceCanvases() {
    const isMobile = window.innerWidth <= 1024;
    if (!isMobile) {
        gameScale = 1;
        return; // PC'de 800×600 sabit kalsın
    }

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Ana yarış canvas'ı — ekran çözünürlüğüne eşitle
    if (raceCanvas.width !== w || raceCanvas.height !== h) {
        raceCanvas.width = w;
        raceCanvas.height = h;
    }

    // Ölçek: harita yüksekliği ekrana sığacak şekilde
    const mapHeight = ROWS * TILE_SIZE; // 600
    gameScale = h / mapHeight; // ör: 360/600 = 0.6

    // Rakip PiP canvas'ı — ekranın %25'i genişliğinde, 4:3 oran
    const oppW = Math.round(w * 0.25);
    const oppH = Math.round(oppW * 0.75); // 4:3
    if (opponentCanvas.width !== oppW || opponentCanvas.height !== oppH) {
        opponentCanvas.width = oppW;
        opponentCanvas.height = oppH;
    }
}

let myMap = Array(ROWS).fill().map(() => Array(COLS).fill(0)); 
let raceMap = []; 
let camera = { x: 0, y: 0 }; // YENİ: Kamera pozisyonu
let opponentCamera = { x: 0, y: 0 }; // YENİ: Rakip kamerası
let saws = [];
let playerNames = {};
let myColor = '#ff4757';
let playerColors = {};
let playerHats = {};
let currentTheme = 'NORMAL';
let raceStarted = false;
let canMove = true;
let myHat = 0;
let previewHatId = 0; // Sadece gardirop ekrani icin gecici degisken
let restartTimer = null;
let isOpponentLeft = false;

const THEME_COLORS = {
    NORMAL: {
        ground: '#795548',
        grass: '#43a047',
        sky: ['#87CEEB', '#E0F6FF', '#90EE90'],
        stone: '#3e2723'
    },
    ICE: {
        ground: '#636e72',
        grass: '#74b9ff',
        sky: ['#2d3436', '#81ecec', '#dfe6e9'],
        stone: '#dfe6e9'
    },
    FIRE: {
        ground: '#2d3436',
        grass: '#e17055',
        sky: ['#2d3436', '#fab1a0', '#e17055'],
        stone: '#d63031'
    }
};

let player = { 
    x: 0, y: 0, width: 30, height: 30, 
    vx: 0, vy: 0, 
    speed: 5, normalSpeed: 5, slowSpeed: 2, 
    jump: -12, grounded: false, 
    
    // --- YENİ ---
    jumpCount: 0,    // Kaç kere zıpladım?
    maxJumps: 2,     // Maksimum zıplama hakkı
    frozen: false,
    coyoteTimer: 0,  // Havada asılı kalma süresi
    jumpBuffer: 0,   // Erken basılan zıplamayı hatırlama süresi
    
    // --- YENİ EKLENENLER ---
    lives: 3,       // Başlangıç canı
    isDead: false,  // Ölü mü? (Hareket edemez)
    activeEmoji: null,
    emojiTimer: 0,
    emojiY: 0
};
// GÜNCELLENMİŞ RAKİP TANIMI
let opponent = { 
    x: 0, y: 0, 
    targetX: 0, targetY: 0, // Hedef koordinatlar eklendi
    width: 30, height: 30,
    activeEmoji: null,
    emojiTimer: 0,
    emojiY: 0,
    // --- YENİLER ---
    hasShield: false,
    isFast: false,
    // --- AĞ İNTERPOLASYON ---
    vx: 0, vy: 0,             // Gerçek hız (sunucudan gelen)
    lastUpdateTime: 0,         // Son ağ güncellemesinin zamanı
    prevTargetX: 0, prevTargetY: 0  // Bir önceki hedef (yumuşatma için)
};
let powerUp = { active: false, x: 0, y: 0, width: 30, height: 30 };
let gravity = 0.6;
let buildTimerInterval = null;
const SPEED_BOOST_DURATION = 3000;
const BLUR_DURATION_TRAP = 10000;
const BLUR_DURATION_SABOTAGE = 5000;
let speedBoostEndTime = 0;
let speedBoostDuration = 0;
let speedBoostTimeout = null;
let blurEndTime = 0;
let blurDuration = 0;
let blurTimeout = null;

if (!buildCanvas) {
    buildCanvas = document.getElementById('build-canvas');
}
buildCanvas.width = COLS * TILE_SIZE; // 60 * 40 = 2400px genişlik olacak
const buildCtx = buildCanvas.getContext('2d');
const raceCanvas = document.getElementById('race-canvas');
const raceCtx = raceCanvas.getContext('2d');
const opponentCanvas = document.getElementById('opponent-canvas');
const opponentCtx = opponentCanvas.getContext('2d');

// --- EVENT LISTENERS ---
document.getElementById('find-match-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('username-input');
    const myName = nameInput.value.trim();
    if (!myName) { showWarning("Lütfen ismini yaz!"); return; }

    // Rejoin butonu varsa gizle
    hideRejoinButton();

    const matchModal = document.getElementById('matching-modal');
    matchModal.style.display = 'flex';
    
    document.getElementById('matching-status-text').innerText = "Sunucuya bağlanılıyor...";
    socket.emit('join_game', { name: myName, color: myColor, hat: myHat });
});

const modal = document.getElementById('custom-room-modal');
document.getElementById('custom-game-btn').addEventListener('click', () => {
    clearRoomError();
    modal.style.display = 'flex';
});
document.getElementById('close-modal-btn').addEventListener('click', () => {
    modal.style.display = 'none';
    resetModalUI();
});

document.getElementById('create-room-btn').addEventListener('click', () => {
    const myName = document.getElementById('username-input').value.trim();
    if (!myName) { showRoomError("Önce lobide ismini yaz!"); return; }

    clearRoomError();
    socket.emit('create_private_room', { name: myName, color: myColor, hat: myHat });
});

socket.on('private_room_created', (code) => {
    document.getElementById('create-room-btn').style.display = 'none';
    const codeDisplay = document.getElementById('created-room-code');
    codeDisplay.style.display = 'block';
    codeDisplay.querySelector('.code-display').innerText = code;
    
    document.getElementById('join-room-btn').disabled = true;
    document.getElementById('room-code-input').disabled = true;
});

const copyRoomCodeBtn = document.getElementById('copy-room-code-btn');
if (copyRoomCodeBtn) {
    copyRoomCodeBtn.addEventListener('click', async () => {
        const codeElem = document.querySelector('#created-room-code .code-display');
        if (!codeElem) return;

        const code = codeElem.innerText.trim();
        if (!code) return;

        let copied = false;
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(code);
                copied = true;
            } catch (err) {
                copied = false;
            }
        }

        if (!copied) {
            const tempInput = document.createElement('input');
            tempInput.value = code;
            tempInput.setAttribute('readonly', '');
            tempInput.style.position = 'absolute';
            tempInput.style.left = '-9999px';
            document.body.appendChild(tempInput);
            tempInput.select();
            tempInput.setSelectionRange(0, tempInput.value.length);
            try {
                copied = document.execCommand('copy');
            } catch (err) {
                copied = false;
            }
            document.body.removeChild(tempInput);
        }

        if (copied) {
            const originalLabel = copyRoomCodeBtn.dataset.label || copyRoomCodeBtn.innerText;
            copyRoomCodeBtn.dataset.label = originalLabel;
            copyRoomCodeBtn.innerText = '✅';
            setTimeout(() => {
                copyRoomCodeBtn.innerText = copyRoomCodeBtn.dataset.label || '📋';
            }, 1200);
        } else {
            showRoomError("Kopyalama başarısız oldu.");
        }
    });
}

document.getElementById('join-room-btn').addEventListener('click', () => {
    const myName = document.getElementById('username-input').value.trim();
    const code = document.getElementById('room-code-input').value.trim();

    clearRoomError();
    if (!myName) { showRoomError("Önce lobide ismini yaz!"); return; }
    if (code.length < 5) { showRoomError("Lütfen geçerli bir kod gir!"); return; }

    socket.emit('join_private_room', { name: myName, color: myColor, roomCode: code, hat: myHat });
});

socket.on('room_error', (msg) => {
    resetModalUI();
    showRoomError("❌ " + msg);
});

function disableLobbyButtons(msg) {
    document.getElementById('find-match-btn').disabled = true;
    document.getElementById('custom-game-btn').disabled = true;
    document.getElementById('status-msg').innerText = msg;
}

function resetModalUI() {
    document.getElementById('create-room-btn').style.display = 'block';
    document.getElementById('created-room-code').style.display = 'none';
    document.getElementById('join-room-btn').disabled = false;
    document.getElementById('room-code-input').disabled = false;
    document.getElementById('room-code-input').value = '';
    clearRoomError();
}

document.querySelectorAll('.tool').forEach(tool => {
    tool.addEventListener('click', (e) => {
        document.querySelectorAll('.tool').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentTool = parseInt(e.target.dataset.type);
    });
});

// --- SOCKET OLAYLARI ---
socket.on('waiting', (msg) => {
    document.getElementById('matching-status-text').innerText = msg;
});
socket.on('role', (role) => myRole = role);

// --- GÜVENLİ CAN GÜNCELLEMESİ ---
socket.on('update_health', (data) => {
    // Sadece benim canım güncellendiyse
    if (data.id === socket.id) {
        player.lives = data.lives; // Sunucudan gelen gerçek veriyi al
        updateLivesUI();

        // Eğer canım bittiyse ölme animasyonunu başlat
        if (player.lives <= 0 && !player.isDead) {
            handleDeath();
        }
    }
});

// Rakip bitirince tetiklenir
socket.on('hurry_up', () => {
    showWarning("Rakip Hazır! 30 Saniyen Kaldı!");
    playSound('trap'); // Uyarı sesi
    vibrateMobile([200, 100, 200]); // Titreşim uyarısı
    startBuildTimer(30); // 30 saniyelik geri sayımı başlat
});

socket.on('game_start', (data) => {
    const modal = document.getElementById('custom-room-modal');
    if (modal) { modal.style.display = 'none'; resetModalUI(); }
    document.getElementById('matching-modal').style.display = 'none';

    roomID = data.roomID;
    playerNames = data.names;
    playerColors = data.colors;
    playerHats = data.hats || {};
    currentTheme = data.theme || 'NORMAL';

    updateScoreBoard(data.scores);
    document.getElementById('scoreboard').style.display = 'flex';

    startNewRound();
});

socket.on('opponent_disconnecting', (seconds) => {
    showWarning(`⚠️ Rakibin bağlantısı koptu! ${seconds}sn bekleniyor...`);
});

// --- Kendi bağlantım koptu - otomatik yeniden bağlan ---
let lastDisconnectedRoom = null;

socket.on('disconnect', () => {
    // Eğer aktif bir odadaysak, rejoin için sakla
    if (roomID) {
        lastDisconnectedRoom = roomID;
    }
    showWarning('❌ Bağlantı kesildi! Yeniden bağlanılıyor...');
});
socket.on('connect', () => {
    // Otomatik rejoin dene (bağlantı koptu → yeni socket ID aldı)
    if (lastDisconnectedRoom) {
        const savedRoom = lastDisconnectedRoom;
        lastDisconnectedRoom = null;
        const myName = document.getElementById('username-input').value.trim() || 'Oyuncu';
        socket.emit('rejoin_room', {
            roomID: savedRoom,
            name: myName,
            color: myColor,
            hat: myHat
        });
        showWarning('🔄 Bağlantı yeniden sağlandı, odaya dönülüyor...');
    }
});

socket.on('opponent_left', () => {
    isOpponentLeft = true;

    if (restartTimer) clearTimeout(restartTimer);

    showWarning("⚠️ RAKİP KAÇTI! LOBİYE DÖNÜLÜYOR...");
    playSound('teleport');

    setTimeout(() => {
        returnToLobby();
    }, 3000);
});

socket.on('start_race', async (data) => {
    isGameEnding = false;
    raceMap = data.map;
    initSaws(); // <--- YENİ: Haritadaki testere yollarını hesapla
    initBackground();
    resizeRaceCanvases(); // Mobilde canvas boyutunu ekrana eşitle
    respawn();
    // İstatistikleri sıfırla
    roundStats = { startTime: Date.now(), trapsHit: 0, damagesTaken: 0, jumpsUsed: 0, powerupsCollected: 0, distanceTraveled: 0, lastX: 0 };
    await switchScreen('race');
    startRaceCountdown();
    startRaceTimer();
    startGameLoop();
});

// GÜNCELLENMİŞ SOCKET DİNLEYİCİSİ
socket.on('opponent_move', (data) => { 
    // Bir önceki hedefi sakla (interpolasyon sürekliliği için)
    opponent.prevTargetX = opponent.targetX;
    opponent.prevTargetY = opponent.targetY;
    
    opponent.targetX = data.x; 
    opponent.targetY = data.y; 
    
    // Gerçek hız verisini kaydet (kamera look-ahead için)
    opponent.vx = data.vx || 0;
    opponent.vy = data.vy || 0;
    opponent.lastUpdateTime = performance.now();
    
    // --- YENİ EKLENENLER ---
    // Rakibin görsel durumunu güncelle
    opponent.hasShield = data.hasShield;
    opponent.isFast = data.isFast || false; // Eski versiyonlarda hata vermesin diye
});

socket.on('spawn_powerup', (coords) => {
    powerUp.x = coords.c * TILE_SIZE + 5;
    powerUp.y = coords.r * TILE_SIZE + 5;
    powerUp.active = true;
});

socket.on('apply_blur', () => {
    playSound('trap'); // Kötü bir şey oldu sesi
    applyBlurEffect(BLUR_DURATION_TRAP);
});

socket.on('tile_changed', (data) => {
    // Gelen koordinattaki kareyi değiştir
    let didUpdate = false;

    if (raceMap[data.r] && raceMap[data.r][data.c] !== undefined) {
        raceMap[data.r][data.c] = data.type;
        didUpdate = true;
    }

    if (myMap[data.r] && myMap[data.r][data.c] !== undefined) {
        myMap[data.r][data.c] = data.type;
        didUpdate = true;
    }

    // Eğer bu bir "Reset" tuzağının patlamasıysa
    if (didUpdate && data.type === 1) {
        const centerX = data.c * TILE_SIZE + TILE_SIZE / 2;
        const centerY = data.r * TILE_SIZE + TILE_SIZE / 2;
        
        createExplosionEffect(centerX, centerY, false);
    }
});

socket.on('powerup_effect', (data) => {
    playSound('powerup');
    
    // Eğer kutuyu BEN aldıysam (target: 'me')
    if (data.target === 'me') {
        if (data.type === 1) { // HIZ
            showWarning("⚡ HIZLANDIN!");
            applySpeedBoost(SPEED_BOOST_DURATION);
        } 
        else if (data.type === 2) { // KALKAN
            showWarning("🛡️ KALKAN AKTİF!");
            player.hasShield = true;
        } 
        else if (data.type === 3) { // SABOTAJ (Kötü etkiyi rakibe yolladın)
            showWarning("😵 RAKİBİ KÖR ETTİN!");
            // Etki rakibe gidecek, burada sadece görsel tatmin
        }
    } 
    
    // Eğer kutuyu RAKİP aldıysa (target: 'opponent')
    else {
        if (data.type === 3) { // SABOTAJ (Rakip bana yolladı!)
            playSound('trap');
            showWarning("😵 EKRANIN BULANIKLAŞTI!");
            applyBlurEffect(BLUR_DURATION_SABOTAGE);
        }
        // Diğer durumlarda (Rakip hızlandıysa veya kalkan aldıysa) 
        // bunu görsel olarak göstermek için graphics.js'de güncelleme yapacağız.
    }
});

socket.on('mine_exploded', (data) => {
    if (!data || data.roomID !== roomID) return;
    const r = data.r;
    const c = data.c;
    const hadGround = myMap[r + 1] && myMap[r + 1][c] === 1;
    removeMineAt(myMap, r, c, false, true);

    const baseX = c * TILE_SIZE + TILE_SIZE / 2;
    const baseY = r * TILE_SIZE + TILE_SIZE / 2;
    createExplosionEffect(baseX, baseY, true);

    if (hadGround) {
        const groundY = (r + 1) * TILE_SIZE + TILE_SIZE / 2;
        createExplosionEffect(baseX, groundY, true);
    }
});

// --- RAKİP TUZAĞI YOK ETTİĞİNDE VEYA DEĞİŞTİRDİĞİNDE ---
socket.on('opponent_trap_destroyed', (data) => {
    if (myMap[data.r]) {
        // Direk 0 yapmak yerine, gönderilen yeni değere (toprak veya boşluk) çeviriyoruz
        myMap[data.r][data.c] = (data.newValue !== undefined) ? data.newValue : 0; 
        
        // Rakibin ekranında tuzak silinirken küçük bir patlama efekti çıkar
        createExplosionEffect(data.c * TILE_SIZE + (TILE_SIZE/2), data.r * TILE_SIZE + (TILE_SIZE/2), true); 
    }
});

socket.on('game_over', (data) => {
    // 1. KİLİT KONTROLÜ
    if (isGameEnding) return; 
    
    // 2. Kilidi Aktif Et
    isGameEnding = true;
    if (typeof stopMusic === 'function') stopMusic();
    stopRaceTimer();

    // Konsol raporu (kontrol için)
    console.log("🏁 Oyun Bitti! Kazanan:", data.winner);

    // 3. Mesajları Göster
    if (data.winner === 'player') {
        showWinMessage = true; 
        playSound('win');
    } else {
        showLoseMessage = true; 
    }

    // 4. TEK SEFERLİK GEÇİŞ ZAMANLAYICISI
    setTimeout(() => {
        showWinMessage = false;
        showLoseMessage = false;
        
        switchScreen('lobby');
        
        hasFinished = false; 
        raceStarted = false;
    }, 3000);
});

// --- RAUND SONU İSTATİSTİK FONKSİYONLARI ---
function showRoundStats(iWon) {
    let overlay = document.getElementById('round-stats-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'round-stats-overlay';
        document.body.appendChild(overlay);
    }

    const elapsed = roundStats.startTime ? ((Date.now() - roundStats.startTime) / 1000).toFixed(1) : '?';
    const dist = Math.round(roundStats.distanceTraveled / TILE_SIZE); // Karo cinsinden
    const xpGained = iWon ? 50 : 15;

    overlay.innerHTML = `
        <div class="round-stats-card">
            <h2 class="${iWon ? 'win-title' : 'lose-title'}">
                ${iWon ? '🏆 KAZANDIN!' : '❌ KAYBETTİN'}
            </h2>
            <div class="stat-row"><span class="stat-label">⏱ Süre</span><span class="stat-value">${elapsed}s</span></div>
            <div class="stat-row"><span class="stat-label">💥 Yenilen Tuzak</span><span class="stat-value">${roundStats.trapsHit}</span></div>
            <div class="stat-row"><span class="stat-label">❤️ Hasar</span><span class="stat-value">${roundStats.damagesTaken}</span></div>
            <div class="stat-row"><span class="stat-label">🦘 Zıplama</span><span class="stat-value">${roundStats.jumpsUsed}</span></div>
            <div class="stat-row"><span class="stat-label">📦 Power-up</span><span class="stat-value">${roundStats.powerupsCollected}</span></div>
            <div class="stat-row"><span class="stat-label">📏 Mesafe</span><span class="stat-value">${dist} karo</span></div>
            <div class="xp-breakdown">+${xpGained} XP</div>
        </div>
    `;
    overlay.style.display = 'flex';
}

function hideRoundStats() {
    const overlay = document.getElementById('round-stats-overlay');
    if (overlay) overlay.style.display = 'none';
}

// --- MAÇ BİTİŞİ (İLK 5'E ULAŞAN KAZANIR) ---
socket.on('match_over', (data) => {
    if (isGameEnding) return;
    isGameEnding = true;
    if (typeof stopMusic === 'function') stopMusic();
    updateScoreBoard(data.scores);

    const iWon = data.winner === socket.id;
    const winnerName = data.names[data.winner] || 'Bilinmeyen';
    
    if (iWon) {
        playSound('win');
        launchFireworks();
        addXp(100);
        playerStats.coins += 50;
        saveStats();
    } else {
        if (typeof playLoseSound === 'function') playLoseSound();
        addXp(30);
    }

    // Final ekranını göster
    showMatchOverScreen(iWon, winnerName, data.scores, data.names);
});

function showMatchOverScreen(iWon, winnerName, scores, names) {
    // Mevcut overlay'i kullan veya oluştur
    let overlay = document.getElementById('match-over-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'match-over-overlay';
        document.body.appendChild(overlay);
    }

    const myScore = scores[socket.id] || 0;
    const oppId = Object.keys(scores).find(id => id !== socket.id);
    const oppScore = scores[oppId] || 0;
    const myName = names[socket.id] || 'BEN';
    const oppName = names[oppId] || 'RAKİP';

    overlay.innerHTML = `
        <div class="match-over-card">
            <div class="match-over-title ${iWon ? 'win' : 'lose'}">
                ${iWon ? '🏆 MAÇI KAZANDIN! 🏆' : '😔 MAÇ BİTTİ'}
            </div>
            <div class="match-over-scores">
                <div class="match-score-item ${myScore > oppScore ? 'winner' : ''}">
                    <span class="ms-name">${myName}</span>
                    <span class="ms-score">${myScore}</span>
                </div>
                <div class="match-score-vs">VS</div>
                <div class="match-score-item ${oppScore > myScore ? 'winner' : ''}">
                    <span class="ms-name">${oppName}</span>
                    <span class="ms-score">${oppScore}</span>
                </div>
            </div>
            <div class="match-over-reward">
                ${iWon ? '🎉 +100 XP | +50 Coin' : '📊 +30 XP'}
            </div>
            <button id="match-over-btn" class="main-btn pulse-anim">LOBİYE DÖN</button>
        </div>
    `;

    overlay.style.display = 'flex';

    document.getElementById('match-over-btn').addEventListener('click', () => {
        overlay.style.display = 'none';
        returnToLobby();
    });
}

// GÜNCELLENMİŞ OYUN SONU (Alert Yok, Eğlence Var!)
socket.on('round_over', (data) => {
    if (isGameEnding) return;
    isGameEnding = true;
    if (typeof stopMusic === 'function') stopMusic();
    updateScoreBoard(data.scores);

    if (isOpponentLeft) return;

    const iWon = data.winner === socket.id;
    if(iWon) {
        playSound('win');
        launchFireworks();
        showWinMessage = true;

        addXp(50);
        playerStats.coins = (playerStats.coins || 0) + 20;
        saveStats();
    } else {
        showLoseMessage = true;
        if (typeof playLoseSound === 'function') playLoseSound();

        addXp(15);
        playerStats.coins = (playerStats.coins || 0) + 5;
        saveStats();
    }

    stopRaceTimer();
    checkRoundAchievements(iWon);
    showRoundStats(iWon);

    if (restartTimer) clearTimeout(restartTimer);

    restartTimer = setTimeout(() => {
        showWinMessage = false;
        showLoseMessage = false;
        hideRoundStats();
        startNewRound();
    }, 4000);
});

// --- OYUN MANTIĞI ---

function update() {
    // --- IŞINLANMA ANİMASYONU ---
    if (player.isTeleporting) {
        // 1. Kendi etrafında hızlanarak dön
        player.teleportAngle += 0.5;
        
        // 2. Yukarı doğru süzül
        player.y -= 1; 
        
        // 3. Küçülerek yok ol
        if (player.teleportScale > 0) player.teleportScale -= 0.015;
        
        // 4. Saydamlaş
        if (player.teleportAlpha > 0) player.teleportAlpha -= 0.015;
        
        return;
    }

    let targetSpeed = 0;

    if (raceStarted && !player.isDead && !player.frozen && canMove) {
        // Hız çarpanını da hesaba kat (Normalde 1.0, hızlanınca 1.5 olacak)
        let currentSpeed = (player.onSpike ? player.slowSpeed : player.normalSpeed) * player.speedMultiplier;

        if (keys['ArrowLeft'] || keys['a']) targetSpeed = -currentSpeed;
        else if (keys['ArrowRight'] || keys['d']) targetSpeed = currentSpeed;
        else targetSpeed = 0;
    }

    if (currentTheme === 'ICE') {
        player.vx += (targetSpeed - player.vx) * 0.05;
        if(Math.abs(player.vx) < 0.1) player.vx = targetSpeed;
    } else {
        player.vx = targetSpeed;
    }

    // --- COYOTE TIME MANTIĞI ---
    if (player.grounded) {
        player.coyoteTimer = 10;
    } else if (player.coyoteTimer > 0) {
        player.coyoteTimer--;
    }

    // --- JUMP BUFFER MANTIĞI ---
    if (player.jumpBuffer > 0) player.jumpBuffer--;

    // --- ZIPLAMA İŞLEMİ ---
    if (player.jumpBuffer > 0 && (player.grounded || player.coyoteTimer > 0)) {
        player.vy = player.jump;
        player.jumpBuffer = 0;
        player.coyoteTimer = 0;
        player.grounded = false;
        playSound('jump');
        createDust(player.x + player.width/2, player.y + player.height);
        player.jumpCount = 1;
    } else if (player.jumpBuffer > 0 && player.jumpCount < player.maxJumps && !player.grounded) {
        player.vy = player.jump * 0.8;
        player.jumpBuffer = 0;
        player.jumpCount++;
        playSound('jump');
        createDust(player.x + player.width/2, player.y + player.height);
    }

    player.vy += gravity;
    player.x += player.vx;
    
    // --- KOŞMA EFEKTİ (GÜNCELLENDİ) ---
    // Math.random() > 0.4 diyerek sıklığı artırdık (Her adımda toz çıkacak gibi)
    if (player.grounded && Math.abs(player.vx) > 0 && Math.random() > 0.4) {
        createDust(player.x + player.width / 2, player.y + player.height);
    }

    player.y += player.vy;
    player.grounded = false;
    player.onSpike = false; // Her frame sıfırla, collisionda tekrar true olacak

    checkCollisions();
    
    if (powerUp.active && checkRectCollision(player, powerUp)) {
        powerUp.active = false;
        playSound('powerup'); // Powerup sesi
        roundStats.powerupsCollected++;
        socket.emit('powerup_collected', roomID);
    }
    // Mesafe takibi
    if (roundStats.lastX) {
        roundStats.distanceTraveled += Math.abs(player.x - roundStats.lastX);
    }
    roundStats.lastX = player.x;
    // --- OPTİMİZE EDİLMİŞ VERİ GÖNDERİMİ ---
    const currentTime = Date.now();

    // Sadece belirlediğimiz süre (50ms) geçtiyse veri gönder
    if (currentTime - lastNetworkSendTime >= NETWORK_TICK_RATE) {
        socket.emit('player_move', {
            // Math.round ile ondalıklı sayıları (örn: 15.482931) tam sayıya çeviriyoruz.
            // Bu, sunucuya giden veri paketinin boyutunu %60 oranında küçültür!
            roomID,
            x: Math.round(player.x), 
            y: Math.round(player.y),
            
            // Hız değerlerinde 2 ondalık hane yeterlidir (örn: 3.45)
            vx: Number(player.vx.toFixed(2)), 
            vy: Number(player.vy.toFixed(2)),
            
            isDead: player.isDead,
            hasShield: player.hasShield,
            isSpeeding: player.speedMultiplier > 1.1 // Hız efektini karşıya iletmek için
        });
        
        lastNetworkSendTime = currentTime;
    }

    // --- TESTERE GÜNCELLEME ---
    saws.forEach(saw => {
        // Hareket
        saw.x += saw.speed * saw.dir;
        saw.angle += 0.2; // Sürekli döndür

        // Sınırlara çarpınca yön değiştir
        if (saw.x >= saw.maxX || saw.x <= saw.minX) {
            saw.dir *= -1;
        }

        // Çarpışma Kontrolü (Daire Çarpışması)
        // Oyuncunun merkezi
        let pCX = player.x + player.width / 2;
        let pCY = player.y + player.height / 2;
        // Testerenin merkezi
        let sCX = saw.x + TILE_SIZE / 2;
        let sCY = saw.y + TILE_SIZE / 2;
        
        // Mesafe hesapla (Pisagor)
        let dist = Math.sqrt((pCX - sCX)**2 + (pCY - sCY)**2);
        
        // Testere yarıçapı (20) + Oyuncu yarıçapı (yaklaşık 15)
        if (dist < 30) { 
            takeDamage(); // Çarptı!
        }
    });

    // --- DİNAMİK KAMERA (LOOK AHEAD) ---
    
    // Ölçekli viewport genişliği (mobilde gameScale < 1, görünen alan genişler)
    const viewW = raceCanvas.width / gameScale;
    
    // 1. Hedef Kamera Pozisyonu: Oyuncuyu merkeze al
    let targetCamX = player.x - viewW / 2;

    // 2. Öngörü (Look Ahead): Hıza göre kamerayı kaydır
    // Oyuncu sağa gidiyorsa (vx > 0), kamera daha sağa gitsin ki önümüzü görelim.
    // 20 çarpanı ile hızı abartıyoruz (Örn: Hız 5 ise, kamera 100px öne kayar)
    targetCamX += player.vx * 20; 

    // 3. Yumuşak Geçiş (Lerp): Mevcut konumdan hedefe yavaşça git
    // 0.1 değeri kameranın "ağırlığını" belirler. Düşükse (0.05) çok ağır döner, yüksekse (0.5) hızlı döner.
    camera.x += (targetCamX - camera.x) * 0.1;

    // 4. Sınırlandırma (Clamp): Kamera harita dışına çıkmasın
    let maxCameraX = (COLS * TILE_SIZE) - viewW;
    
    if (camera.x < 0) camera.x = 0;
    if (camera.x > maxCameraX) camera.x = maxCameraX;

    // --- RAKİP KAMERASI İÇİN DE AYNISI (P.I.P Modu İçin) ---
    // Rakip kamerası da rakibi yumuşak takip etsin
    const oppScale = opponentCanvas.height / (ROWS * TILE_SIZE);
    const oppViewW = opponentCanvas.width / oppScale;
    let oppTargetCamX = opponent.x - oppViewW / 2;
    
    // Gerçek hız verisini kullan (ağdan gelen, tahmin değil)
    oppTargetCamX += opponent.vx * 12;

    opponentCamera.x += (oppTargetCamX - opponentCamera.x) * 0.06;
    
    let maxOppCamX = (COLS * TILE_SIZE) - oppViewW;
    if (opponentCamera.x < 0) opponentCamera.x = 0;
    if (opponentCamera.x > maxOppCamX) opponentCamera.x = maxOppCamX;
}

function checkCollisions() {
    // Sol sınır (Burası değişmiyor)
    if (player.x < 0) player.x = 0;

    // --- SAĞ SINIR HATASI DÜZELTİLDİ ---
    // ESKİSİ: if (player.x + player.width > raceCanvas.width) player.x = raceCanvas.width - player.width;
    
    // YENİSİ: Artık canvas genişliğine değil, HARİTA GENİŞLİĞİNE bakıyoruz.
    const mapWidth = COLS * TILE_SIZE; // 60 * 40 = 2400px
    if (player.x + player.width > mapWidth) {
        player.x = mapWidth - player.width;
    }

    // --- DÜŞME KONTROLÜ ---
    // (Burada da küçük bir ayar yapabiliriz, map yüksekliğine göre kontrol etmek daha güvenli)
    const mapHeight = ROWS * TILE_SIZE; 
    
    if (player.y > mapHeight) { 
        if (currentTheme === 'FIRE') {
            player.vy = -25;
            takeDamage(false);
            createExplosionEffect(player.x, mapHeight, false);
        } else {
            takeDamage();
            if (!player.isDead) respawn();
        }
    }

    let startCol = Math.floor(player.x / TILE_SIZE);
    let endCol = Math.floor((player.x + player.width) / TILE_SIZE);
    let startRow = Math.floor(player.y / TILE_SIZE);
    let endRow = Math.floor((player.y + player.height) / TILE_SIZE);

    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                let tile = raceMap[r][c];
                
                if (tile === 9) continue;

                if (tile === 1 || tile === 8) { 
                    resolveTileCollision(r, c, tile);
                } else if (tile === 11) {
                    // KONVEYÖR BANT - katı zemin + itme kuvveti
                    resolveTileCollision(r, c, 1); // Üzerinde durabilsin
                    if (player.grounded) {
                        player.vx += 3; // Sağa doğru it
                    }
                } else if (tile === 12) {
                    // KAYBOLAN BLOK - basınca 1.5 saniye sonra kaybolur
                    resolveTileCollision(r, c, 1);
                    if (player.grounded) {
                        const key = `vanish_${r}_${c}`;
                        if (!player[key]) {
                            player[key] = true;
                            setTimeout(() => {
                                if (raceMap[r] && raceMap[r][c] === 12) {
                                    raceMap[r][c] = 0;
                                    createExplosionEffect(c * TILE_SIZE + TILE_SIZE/2, r * TILE_SIZE + TILE_SIZE/2, false);
                                    socket.emit('tile_changed', { roomID, r, c, type: 0 });
                                    // 5 saniye sonra geri gel
                                    setTimeout(() => {
                                        if (raceMap[r]) {
                                            raceMap[r][c] = 12;
                                            socket.emit('tile_changed', { roomID, r, c, type: 12 });
                                        }
                                        player[key] = false;
                                    }, 5000);
                                }
                            }, 1500);
                        }
                    }
                } else if (tile === 3) { 
                    // BİTİŞ BLOĞU
                    
                    // Eğer daha önce bitirmediysek içeri gir
                    if (!hasFinished) { 
                        hasFinished = true; // Hemen bayrağı kaldır (Bir daha girmesin)
                        socket.emit('player_won', roomID);
                    }
                    
                    // Not: playSound buraya koymana gerek yok, 
                    // socket.on('round_over') kısmında zaten çalıyor.
                } else if (tile === 4) { // RESET TUZAĞI
                    if (player.isTeleporting) continue;
                    if (useShield()) {
                        removeResetTrap(r, c);
                        continue;
                    }
                    startTeleportSequence(r, c);

                } else if (tile === 5) { // FREEZE (DONDURMA)
                    if (useShield()) {
                        raceMap[r][c] = 1;
                        socket.emit('trap_destroyed', { r: r, c: c, newValue: raceMap[r][c] });
                        continue;
                    }
                    raceMap[r][c] = 1; // Not: Dondurma tuzağı tek kullanımlık kalabilir veya onu da kalıcı yapabilirsin.
                    socket.emit('trap_destroyed', { r: r, c: c, newValue: raceMap[r][c] });
                    // Eğer kalıcı olsun istersen üstteki satırı da silmelisin.
                    
                    playSound('trap');
                    screenShake = 10; 
                    createExplosionEffect(player.x, player.y, false);
                    triggerFreeze();
                    
                } else if (tile === 6) { // DİKEN - YOK OLMUYOR, KALICI
                     // Diken tuzağı artık yok edilemiyor!
                     if (!player.hasShield) {
                         player.onSpike = true;
                     }
                } else if (tile === 10) { // MAYIN
                    const mineKey = `${r},${c}`;
                    if (triggeredMines.has(mineKey)) {
                        removeMineAt(raceMap, r, c, false, false);
                        continue;
                    }
                    if (useShield()) {
                        triggeredMines.add(mineKey);
                        removeMineAt(raceMap, r, c, true, true);
                        socket.emit('mine_exploded', { roomID, r, c });
                        continue;
                    }
                    triggeredMines.add(mineKey);
                    removeMineAt(raceMap, r, c, false, true);
                    socket.emit('mine_exploded', { roomID, r, c });
                    canMove = false;

                    playSound('trap');
                    screenShake = 30;
                    vibrateMobile([500]);

                    createExplosionEffect(player.x + player.width / 2, player.y + player.height / 2, false);

                    showWarning("💥 BUM! MAYINA BASTIN!");
                    
                    setTimeout(() => {
                        takeDamage();
                        canMove = true;
                    }, 700);
                }
            }
        }
    }
}

// ... Diğer fonksiyonlar (resolveTileCollision, respawn vs.) aynı ...
function resolveTileCollision(r, c, tile) {
    let tileX = c * TILE_SIZE;
    let tileY = r * TILE_SIZE;
    if (tile === 8) { 
        // --- TRAMBOLİN MANTIĞI ---
        // Sadece üstten değerse zıplatsın
        if (player.vy > 0 && player.y + player.height <= tileY + (player.vy * 2)) {
            player.vy = -20; // Süper zıplama gücü! (Normal zıplama -12 idi)
            player.grounded = false;
            player.jumpCount = 0; // Havada tekrar zıplayabilsin diye hakkını sıfırla
            
            playSound('jump'); // Ses çal
            vibrateMobile(50); // YENİ: Telefondan 'tık' diye hissettir
            
            // Görsel efekt (Toz)
            createDust(player.x + player.width/2, player.y + player.height);
            return; // Çarpışmayı yok say ki içinden geçip yukarı fırlasın
        }
    }
    if (player.y - player.vy + player.height <= tileY) {
        player.grounded = true;
        player.jumpCount = 0; // Yere basınca hakları sıfırla (YENİ)
        player.vy = 0;
        player.y = tileY - player.height;
    } else if (player.y - player.vy >= tileY + TILE_SIZE) {
        player.vy = 0;
        player.y = tileY + TILE_SIZE;
    } else {
        if (player.vx > 0) player.x = tileX - player.width; 
        else if (player.vx < 0) player.x = tileX + TILE_SIZE; 
    }
}

function respawn() {
    for(let r=0; r<ROWS; r++){
        for(let c=0; c<COLS; c++){
            if(raceMap[r][c] === 2) {
                player.x = c * TILE_SIZE + 5;
                player.y = r * TILE_SIZE + 5;
                player.vx = 0; player.vy = 0;
                player.coyoteTimer = 0;
                player.jumpBuffer = 0;
                return;
            }
        }
    }
    player.x = 0; player.y = 0;
    player.coyoteTimer = 0;
    player.jumpBuffer = 0;
}

// Donma süresini (milisaniye cinsinden) parametre olarak alıyoruz
function triggerFreezeEffect(freezeDurationMs) {
    const overlay = document.getElementById('freeze-overlay');
    if (overlay) {
        overlay.classList.add('active'); // Ekranı anında buzlandır

        // Karakterin donma süresi bittiğinde 'active' sınıfını kaldır
        // CSS'teki transition sayesinde anında değil, kademeli olarak (eriyerek) kaybolacak
        setTimeout(() => {
            overlay.classList.remove('active');
        }, freezeDurationMs); 
    }
}

function triggerFreeze() {
    if(!player.frozen) {
        player.frozen = true;
        triggerFreezeEffect(3000); // Karakter 3 saniye donuyor, efekt de 3 saniye sürsün
        setTimeout(() => player.frozen = false, 3000);
    }
}

function checkRectCollision(r1, r2) {
    return (r1.x < r2.x + r2.width && r1.x + r1.width > r2.x && r1.y < r2.y + r2.height && r1.y + r1.height > r2.y);
}

function applySpeedBoost(durationMs) {
    player.speedMultiplier = 1.6; // %60 Hız artışı
    speedBoostDuration = durationMs;
    speedBoostEndTime = Date.now() + durationMs;

    if (speedBoostTimeout) clearTimeout(speedBoostTimeout);
    speedBoostTimeout = setTimeout(() => {
        player.speedMultiplier = 1.0;
        speedBoostEndTime = 0;
        speedBoostDuration = 0;
    }, durationMs);
}

function applyBlurEffect(durationMs) {
    const container = document.getElementById('game-view-container');
    if (!container) return;

    container.classList.add('blurred-screen');
    blurDuration = durationMs;
    blurEndTime = Date.now() + durationMs;

    if (blurTimeout) clearTimeout(blurTimeout);
    blurTimeout = setTimeout(() => {
        container.classList.remove('blurred-screen');
        blurEndTime = 0;
        blurDuration = 0;
        const blurTimer = document.getElementById('blur-timer');
        if (blurTimer) blurTimer.style.display = 'none';
    }, durationMs);

    updateEffectTimers();
}

function updateEffectTimers() {
    const blurTimer = document.getElementById('blur-timer');
    const blurFill = document.querySelector('#blur-timer .blur-timer-fill');
    if (!blurTimer || !blurFill) return;

    const now = Date.now();
    if (blurEndTime > now && blurDuration > 0) {
        const ratio = Math.max(0, (blurEndTime - now) / blurDuration);
        blurTimer.style.display = 'block';
        blurFill.style.width = `${Math.round(ratio * 100)}%`;
    } else {
        blurTimer.style.display = 'none';
    }
}

function useShield(message = "🛡️ KALKAN SENİ KORUDU!") {
    if (!player.hasShield) return false;
    player.hasShield = false;
    playSound('powerup');
    showWarning(message);
    createExplosionEffect(player.x, player.y, false);
    return true;
}

// --- YARDIMCILAR VE UI ---

async function startNewRound() {
    trapsPlaced = { 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
    undoStack = [];
    redoStack = [];
    triggeredMines = new Set();
    myMap = Array(ROWS).fill().map(() => Array(COLS).fill(0));
    powerUp.active = false;
    hasFinished = false; // Yeni turda bayrağı indir
    player.isDead = false;
    player.lives = 3;
    
    // --- YENİ EKLENENLER ---
    player.hasShield = false; // Kalkanı var mı?
    player.speedMultiplier = 1.0; // Hız çarpanı
    player.isTeleporting = false; // Işınlanıyor mu?
    player.teleportAngle = 0;     // Dönme açısı
    player.teleportScale = 1.0;   // Küçülme oranı
    player.teleportAlpha = 1.0;   // Görünürlük (Saydamlaşma)
    player.coyoteTimer = 0;
    player.jumpBuffer = 0;
    if (speedBoostTimeout) clearTimeout(speedBoostTimeout);
    speedBoostTimeout = null;
    speedBoostEndTime = 0;
    speedBoostDuration = 0;
    if (blurTimeout) clearTimeout(blurTimeout);
    blurTimeout = null;
    blurEndTime = 0;
    blurDuration = 0;
    const blurContainer = document.getElementById('game-view-container');
    if (blurContainer) blurContainer.classList.remove('blurred-screen');
    updateEffectTimers();
    // ----------------------
    updateLivesUI();
    updateUI();
    document.getElementById('submit-map-btn').innerText = "BİTİRDİM";
    document.getElementById('submit-map-btn').disabled = false;
    await switchScreen('build');
    drawBuildGrid();
    document.getElementById('build-timer').innerText = "∞";
}

function updateScoreBoard(scores) {
    const myScore = scores[socket.id] || 0;
    const oppId = Object.keys(scores).find(id => id !== socket.id);
    const oppScore = scores[oppId] || 0;

    const myName = playerNames[socket.id] || "BEN";
    const oppName = playerNames[oppId] || "RAKİP";

    document.querySelector('#scoreboard h2:nth-child(1)').innerHTML = 
        `${myName}: <span id="score-me">${myScore}</span>`;

    document.querySelector('#scoreboard h2:nth-child(2)').innerHTML = 
        `${oppName}: <span id="score-opp">${oppScore}</span>`;
}

function removeExistingTile(type) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (myMap[r][c] === type) {
                myMap[r][c] = 0;
            }
        }
    }
}

function placeTile(r, c) {
    let toolId = parseInt(currentTool); 
    if (toolId === -1) return;

    if (toolId !== 0 && myMap[r][c] === toolId) {
        return;
    }

    const oldTileValue = myMap[r][c];

    if (toolId === 2) {
        if (c > 5) {
            showWarning("⚠️ Başlangıç sadece EN BAŞA (İlk 5 kare) koyulabilir!");
            return;
        }
        removeExistingTile(2);
    }

    if (toolId === 3) {
        if (c < COLS - 5) {
            showWarning("⚠️ Bitiş sadece EN SONA (Son 5 kare) koyulabilir!");
            return;
        }
        removeExistingTile(3);
    }

    if (toolId === 4 && c < 20) {
        showWarning("⚠️ Bu tuzak başlangıca çok yakın olamaz!");
        return;
    }
    
    if ([4, 5, 6, 7, 8, 9, 10, 11, 12].includes(toolId)) { 
        if (myMap[r][c] === toolId) return;
        if (trapsPlaced[toolId] >= trapLimits[toolId]) {
            showWarning("⚠️ Bu tuzaktan daha fazla koyamazsın!");
            return;
        }
        
        trapsPlaced[toolId]++;
        updateUI();

    } else if (toolId === 0) { // SİLGİ KISMI
        let oldTile = myMap[r][c];
        if (oldTile === 0) return;
        
        if ([4, 5, 6, 7, 8, 9, 10, 11, 12].includes(oldTile)) {
            trapsPlaced[oldTile]--;
            updateUI();
        }
    }

    myMap[r][c] = toolId;

    // --- UNDO/REDO: Aksiyonu kaydet ---
    undoStack.push({ r, c, oldTile: oldTileValue, newTile: toolId });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = []; // Yeni aksiyon redo geçmişini siler
    
    // --- YENİ: POP ANİMASYONU BAŞLAT ---
    if (toolId !== 0) {
        placementEffects.push({
            r: r,
            c: c,
            scale: 0.1, // Küçücük başla
            toolId: toolId
        });
        playSound('jump');
    }

    drawBuildGrid();
}

function updateUI() {
    const limit9 = trapLimits[9] || 5; 
    const placed9 = trapsPlaced[9] || 0;

    document.getElementById('reset-count').innerText = (trapLimits[4] || 2) - (trapsPlaced[4] || 0);
    document.getElementById('freeze-count').innerText = (trapLimits[5] || 5) - (trapsPlaced[5] || 0);
    document.getElementById('spike-count').innerText = (trapLimits[6] || 3) - (trapsPlaced[6] || 0);
    document.getElementById('saw-count').innerText = (trapLimits[7] || 3) - (trapsPlaced[7] || 0);
    document.getElementById('trampoline-count').innerText = (trapLimits[8] || 3) - (trapsPlaced[8] || 0);
    const mineElem = document.getElementById('mine-count');
    if (mineElem) {
        mineElem.innerText = (trapLimits[10] || 3) - (trapsPlaced[10] || 0);
    }
    
    const ghostElem = document.getElementById('ghost-count');
    if (ghostElem) {
        ghostElem.innerText = limit9 - placed9;
    }
    const conveyorElem = document.getElementById('conveyor-count');
    if (conveyorElem) {
        conveyorElem.innerText = (trapLimits[11] || 4) - (trapsPlaced[11] || 0);
    }
    const vanishElem = document.getElementById('vanish-count');
    if (vanishElem) {
        vanishElem.innerText = (trapLimits[12] || 3) - (trapsPlaced[12] || 0);
    }
}

// --- BUILD MODE: UNDO ---
function undoBuild() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    // Tuzak sayısını güncelle
    if ([4,5,6,7,8,9,10,11,12].includes(action.newTile)) {
        trapsPlaced[action.newTile]--;
    }
    if ([4,5,6,7,8,9,10,11,12].includes(action.oldTile)) {
        trapsPlaced[action.oldTile]++;
    }
    myMap[action.r][action.c] = action.oldTile;
    redoStack.push(action);
    updateUI();
    drawBuildGrid();
}

// --- BUILD MODE: REDO ---
function redoBuild() {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();
    // Tuzak sayısını güncelle
    if ([4,5,6,7,8,9,10,11,12].includes(action.oldTile)) {
        trapsPlaced[action.oldTile]--;
    }
    if ([4,5,6,7,8,9,10,11,12].includes(action.newTile)) {
        trapsPlaced[action.newTile]++;
    }
    myMap[action.r][action.c] = action.newTile;
    undoStack.push(action);
    updateUI();
    drawBuildGrid();
}

function removeMineAt(mapData, r, c, playEffects, removeGround) {
    if (mapData[r] && mapData[r][c] === 10) {
        mapData[r][c] = 0;
        socket.emit('trap_destroyed', { r: r, c: c, newValue: 0 });
        if (playEffects) {
            createExplosionEffect(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, false);
        }
    }
    if (removeGround && mapData[r + 1] && mapData[r + 1][c] === 1) {
        mapData[r + 1][c] = 0;
        if (playEffects) {
            createExplosionEffect(c * TILE_SIZE + TILE_SIZE / 2, (r + 1) * TILE_SIZE + TILE_SIZE / 2, false);
        }
    }
}

// --- OYUN DÖNGÜSÜ ---
let gameLoopId = null;
let isGameLoopRunning = false;

function startGameLoop() {
    if (isGameLoopRunning) return;
    isGameLoopRunning = true;
    gameLoopId = requestAnimationFrame(gameLoop);
}

function stopGameLoop() {
    if (!isGameLoopRunning) return;
    cancelAnimationFrame(gameLoopId);
    gameLoopId = null;
    isGameLoopRunning = false;
}

function gameLoop() {
    if(!screens.race.classList.contains('active')) {
        // Yarış ekranı kapalıysa döngüyü durdur (CPU tasarrufu)
        stopGameLoop();
        return;
    }
    update();
    drawRace();
    // Mobilde rakip PiP'i her 2 frame'de bir çiz (performans)
    if (!isMobileDevice || (gameLoopFrameCount & 1) === 0) {
        drawOpponent();
    }
    gameLoopFrameCount++;
    updateEffectTimers();
    gameLoopId = requestAnimationFrame(gameLoop);
}


function takeDamage(shouldRespawn = true) {
    if (player.isDead) return;

    if (useShield()) return;

    // --- GÜVENLİK GÜNCELLEMESİ ---
    // Artık 'player.lives--' yapmıyoruz!
    // Sadece görsel efektleri yapıyoruz ve sunucuya bildiriyoruz.
    
    playSound('trap'); 
    screenShake = 20; 
    vibrateMobile([100, 50, 100]); 
    createExplosionEffect(player.x, player.y, false);
    roundStats.damagesTaken++;
    roundStats.trapsHit++;

    // Sunucuya "Ben vuruldum, canımı düşür" diyoruz
    socket.emit('report_damage', roomID);

    // Anlık tepki için respawn (Eğer ölmediysek)
    // Not: Gerçek can kontrolü sunucudan 'update_health' gelince yapılacak
    // Ama oyunun akıcı olması için respawn'ı önden yapabiliriz.
    if (shouldRespawn) {
        respawn();
    }
}

function handleDeath() {
    player.isDead = true; 
    document.getElementById('death-overlay').style.display = 'flex'; 
    
    let penaltyTime = 5;
    document.getElementById('respawn-timer').innerText = penaltyTime + " saniye ceza...";
    
    let penaltyInterval = setInterval(() => {
        penaltyTime--;
        document.getElementById('respawn-timer').innerText = penaltyTime + " saniye ceza...";
        if (penaltyTime <= 0) clearInterval(penaltyInterval);
    }, 1000);

    setTimeout(() => {
        // Canı burada 3 yapmıyoruz! Sunucu zaten bir sonraki doğuş için ayarladı.
        // Sadece client kilidini açıyoruz.
        player.isDead = false; 
        document.getElementById('death-overlay').style.display = 'none'; 
        respawn(); 
        
        // UI'da canların dolduğunu görmek için sunucudan son durumu isteyebiliriz
        // veya basitçe görsel olarak fulleyebiliriz (Sunucu ile senkronize olduğu sürece)
        player.lives = 3; 
        updateLivesUI();
    }, 5000);
}

function updateLivesUI() {
    let hearts = "";
    for(let i=0; i<player.lives; i++) hearts += "❤️";
    document.getElementById('lives-display').innerText = hearts;
}

async function switchScreen(name) {
    const overlay = document.getElementById('transition-overlay');
    
    // 1. PERDEYİ KAPAT (Fade Out)
    if (overlay) overlay.classList.add('active');
    
    // Animasyonun bitmesi için 500ms bekle
    await new Promise(resolve => setTimeout(resolve, 500));

    // --- EKRAN DEĞİŞTİRME İŞLEMLERİ ---
    Object.values(screens).forEach(s => s.classList.remove('active'));
    
    if (screens[name]) screens[name].classList.add('active');
    
    resetInputState();

    if (name !== 'build') {
        stopBuildTimer();
    }

    // --- EKRANA ÖZEL AYARLAR ---
    const livesDisplay = document.getElementById('lives-display');
    if (livesDisplay) {
        livesDisplay.style.display = (name === 'race') ? 'block' : 'none';
    }

    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) {
        if (name === 'race') {
            if(window.innerWidth <= 1024) mobileControls.style.display = 'flex';
        } else {
            mobileControls.style.display = 'none';
        }
    }
    
    // --- PING GÖSTERGESİ ---
    const pingEl = document.getElementById('ping-display');
    if (pingEl) {
        pingEl.style.display = (name === 'race') ? 'block' : 'none';
    }

    // --- EMOJİ PANELİ ---
    const emojiPanel = document.getElementById('emoji-panel');
    if (emojiPanel) {
        emojiPanel.style.display = (name === 'race') ? 'flex' : 'none';
    }

    // --- LOBİ ARKA PLAN ANİMASYONU ---
    if (name === 'lobby') {
        if (!lobbyAnimFrame) {
            dummyMap = createDummyMap();
            startThemeCycle();
            lobbyLoop();
            if(lobbyCanvas) lobbyCanvas.style.display = 'block';
        }
    } else {
        if (lobbyThemeTimer) clearInterval(lobbyThemeTimer);
        if (lobbyAnimFrame) cancelAnimationFrame(lobbyAnimFrame);
        lobbyAnimFrame = null;
        lobbyThemeTimer = null;
        if(lobbyCanvas) lobbyCanvas.style.display = 'none';
    }

    // Kısa bir bekleme
    await new Promise(resolve => setTimeout(resolve, 100));

    // 2. PERDEYİ AÇ (Fade In)
    if (overlay) overlay.classList.remove('active');
}

function startBuildTimer(seconds = 30) {
    if (!screens.build.classList.contains('active')) return;
    if(buildTimerInterval) clearInterval(buildTimerInterval);
    
    let timeLeft = seconds;
    const timerElem = document.getElementById('build-timer');
    timerElem.innerText = timeLeft;
    timerElem.style.color = "red"; // Dikkat çeksin diye kırmızı yapalım
    
    buildTimerInterval = setInterval(() => {
        timeLeft--;
        timerElem.innerText = timeLeft;
        
        // Son saniyelerde sesli uyarı (tik-tak)
        if(timeLeft < 5) playSound('jump'); 

        if (timeLeft <= 0) {
            clearInterval(buildTimerInterval);
            timerElem.style.color = "white"; // Rengi düzelt
            // Eğer butona hala basılmadıysa otomatik bas
            if(!document.getElementById('submit-map-btn').disabled) {
                console.log("Süre doldu, otomatik gönderiliyor...");
                document.getElementById('submit-map-btn').click();
            }
        }
    }, 1000);
}

function stopBuildTimer() {
    if (buildTimerInterval) clearInterval(buildTimerInterval);
    buildTimerInterval = null;
}

// --- TESTERE SİSTEMİ (YENİ) ---

function initSaws() {
    saws = []; // Listeyi temizle
    // raceMap üzerinden tarama yap
    // Not: Haritada değişiklik yapmıyoruz, sadece okuyup nesne yaratıyoruz.
    
    // Zaten taranmış kareleri işaretlemek için (Aynı yolu tekrar hesaplamasın)
    let processed = Array(ROWS).fill().map(() => Array(COLS).fill(false));

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (raceMap[r][c] === 7 && !processed[r][c]) {
                // Testere yolu bulduk! Şimdi bu yolun ne kadar uzun olduğunu bulalım.
                let startC = c;
                let endC = c;
                
                // Sağa doğru devam eden 7'leri bul
                while (endC < COLS && raceMap[r][endC] === 7) {
                    processed[r][endC] = true; // Bu kareyi işlendi say
                    endC++;
                }
                
                // Testere Nesnesi Oluştur
                saws.push({
                    x: startC * TILE_SIZE, // Başlangıç X
                    y: r * TILE_SIZE,      // Yükseklik
                    minX: startC * TILE_SIZE,
                    maxX: (endC - 1) * TILE_SIZE, // Bitiş X
                    dir: 1, // 1: Sağa, -1: Sola
                    speed: 3, // Testere hızı
                    angle: 0  // Dönme açısı (Görsel için)
                });
            }
        }
    }
}

// --- ORTAK ZIPLAMA FONKSİYONU ---
function performJump() {
    if (!raceStarted || player.frozen || player.isDead || !canMove) return;

    // 1. Zıplama Hafızası (Buffer)
    player.jumpBuffer = 10;
    roundStats.jumpsUsed++;
}

// --- MOBİL UI YÖNETİMİ (YENİ) ---

const toggleBtn = document.getElementById('toggle-toolbar-btn');
const toolbar = document.querySelector('.toolbar');
const fsBtn = document.getElementById('fullscreen-btn');

// 1. Alet Çantasını Aç/Kapat
if(toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        toolbar.classList.toggle('open');
        // Buton metnini değiştir
        if(toolbar.classList.contains('open')) {
            toggleBtn.innerText = "❌ Kapat";
            toggleBtn.style.background = "#c0392b";
        } else {
            toggleBtn.innerText = "🛠️ Aletler";
            toggleBtn.style.background = "rgba(0, 0, 0, 0.6)";
        }
    });
}

// --- TAM EKRAN KONTROLÜ (GÜNCELLENDİ) ---

// Butona basınca tam ekran yap ve butonu gizle
if(fsBtn) {
    fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Hata: ${err.message}`);
            });
            fsBtn.style.display = 'none'; // Butonu gizle
        }
    });
}

// Tam ekrandan çıkılırsa (Geri tuşu veya ESC ile) butonu GERİ GETİR
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        // Eğer tam ekran değilse butonu tekrar göster
        fsBtn.style.display = 'block'; 
    }
});

const vibBtn = document.getElementById('vib-test-btn');
if(vibBtn) {
    vibBtn.addEventListener('click', () => {
        if (!navigator.vibrate) {
            showWarning("Bu cihaz titreşimi desteklemiyor (veya iPhone kullanıyorsun).");
            return;
        }
        navigator.vibrate([200, 100, 200]); 
        document.getElementById('status-msg').innerText = "Titreşim yollandı!";
    });
}

const betScreen = document.getElementById('betting-screen');
const betTimer = document.getElementById('bet-timer');

socket.on('start_betting_phase', () => {
    if (!betScreen || !betTimer) return;
    betScreen.style.display = 'flex';
    
    document.getElementById('bet-high').disabled = false;
    document.getElementById('bet-low').disabled = false;
    document.getElementById('bet-high').style.opacity = "1";
    document.getElementById('bet-low').style.opacity = "1";

    let timeLeft = 5;
    betTimer.innerText = timeLeft;
    
    let timer = setInterval(() => {
        timeLeft--;
        betTimer.innerText = timeLeft;
        if(timeLeft <= 0) {
            clearInterval(timer);
            betScreen.style.display = 'none';
        }
    }, 1000);
});

document.getElementById('bet-high').addEventListener('click', () => {
    selectBet('high');
});

document.getElementById('bet-low').addEventListener('click', () => {
    selectBet('low');
});

function selectBet(type) {
    socket.emit('place_bet', type);
    
    document.getElementById('bet-high').style.opacity = "0.3";
    document.getElementById('bet-low').style.opacity = "0.3";
    
    if(type === 'high') document.getElementById('bet-high').style.opacity = "1";
    else document.getElementById('bet-low').style.opacity = "1";

    document.getElementById('bet-high').disabled = true;
    document.getElementById('bet-low').disabled = true;

    playSound('powerup');
}

document.querySelectorAll('.emoji-btn').forEach(btn => {
    const trigger = (e) => {
        e.preventDefault();
        const emoji = btn.dataset.emoji;
        
        showEmoji(player, emoji);
        socket.emit('send_emoji', { roomID: roomID, emoji: emoji });
    };

    btn.addEventListener('click', trigger);
    btn.addEventListener('touchstart', trigger);
});

socket.on('opponent_emoji', (emoji) => {
    showEmoji(opponent, emoji);
    playSound('jump');
});

function showEmoji(target, emoji) {
    target.activeEmoji = emoji;
    target.emojiTimer = 100;
    target.emojiY = 0;
}

// switchScreen artık tüm mantığı içeriyor, override'a gerek yok

let warningTimeout;
let roomErrorTimeout;

function showWarning(message) {
    const toast = document.getElementById('toast-warning');
    if (!toast) return;

    toast.innerText = message;
    toast.style.display = 'block';
    
    if (warningTimeout) clearTimeout(warningTimeout);

    warningTimeout = setTimeout(() => {
        toast.style.display = 'none';
    }, 2000);
}

function clearRoomError() {
    const errorBox = document.getElementById('room-error-msg');
    if (!errorBox) return;
    errorBox.innerText = '';
    errorBox.style.display = 'none';
    if (roomErrorTimeout) {
        clearTimeout(roomErrorTimeout);
        roomErrorTimeout = null;
    }
}

function showRoomError(message) {
    const errorBox = document.getElementById('room-error-msg');
    if (!errorBox) {
        showWarning(message);
        return;
    }
    errorBox.innerText = message;
    errorBox.style.display = 'block';
    if (roomErrorTimeout) clearTimeout(roomErrorTimeout);
    roomErrorTimeout = setTimeout(() => {
        errorBox.style.display = 'none';
    }, 2500);
}

document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        myColor = btn.dataset.color;
    });
});

document.getElementById('cancel-match-btn').addEventListener('click', () => {
    socket.emit('cancel_matchmaking');
    document.getElementById('matching-modal').style.display = 'none';
    document.getElementById('find-match-btn').disabled = false;
    document.getElementById('custom-game-btn').disabled = false;
    document.getElementById('status-msg').innerText = '';
    showWarning('❌ Eşleşme iptal edildi.');
});

// --- REJOIN (GERİ DÖN) SİSTEMİ ---
let rejoinTimerInterval = null;

function hideRejoinButton() {
    if (rejoinTimerInterval) { clearInterval(rejoinTimerInterval); rejoinTimerInterval = null; }
    const btn = document.getElementById('rejoin-btn');
    if (btn) btn.style.display = 'none';
}

function showRejoinButton(lastRoomID) {
    const btn = document.getElementById('rejoin-btn');
    if (!btn) return;
    
    btn.style.display = 'flex';
    let timeLeft = 10;
    btn.innerHTML = `🔄 GERİ DÖN <span id="rejoin-countdown">(${timeLeft}s)</span>`;
    
    if (rejoinTimerInterval) clearInterval(rejoinTimerInterval);
    
    rejoinTimerInterval = setInterval(() => {
        timeLeft--;
        const countdownEl = document.getElementById('rejoin-countdown');
        if (countdownEl) countdownEl.innerText = `(${timeLeft}s)`;
        
        if (timeLeft <= 0) {
            clearInterval(rejoinTimerInterval);
            rejoinTimerInterval = null;
            btn.style.display = 'none';
        }
    }, 1000);
    
    // Click handler (tek seferlik)
    btn.onclick = () => {
        if (rejoinTimerInterval) clearInterval(rejoinTimerInterval);
        rejoinTimerInterval = null;
        btn.style.display = 'none';
        
        const myName = document.getElementById('username-input').value.trim() || 'Oyuncu';
        socket.emit('rejoin_room', {
            roomID: lastRoomID,
            name: myName,
            color: myColor,
            hat: myHat
        });
        showWarning('🔄 Odaya geri bağlanılıyor...');
    };
}

socket.on('rejoin_success', (data) => {
    roomID = data.roomID;
    playerNames = data.names;
    playerColors = data.colors;
    playerHats = data.hats || {};
    currentTheme = data.theme || 'NORMAL';
    myRole = data.role;
    
    updateScoreBoard(data.scores);
    document.getElementById('scoreboard').style.display = 'flex';
    
    showWarning('✅ Odaya geri döndün! Yeni raund başlıyor...');
    playSound('powerup');
    startNewRound();
});

socket.on('rejoin_failed', (msg) => {
    showWarning('❌ ' + msg);
    playSound('trap');
});

socket.on('opponent_reconnected', (name) => {
    showWarning(`✅ ${name} geri döndü!`);
    playSound('powerup');
});


const howtoModal = document.getElementById('howto-modal');
const howtoBtn = document.getElementById('how-to-play-btn');
const closeHowtoBtn = document.getElementById('close-howto-btn');
const okHowtoBtn = document.getElementById('ok-howto-btn');

if (howtoBtn && howtoModal) {
    howtoBtn.addEventListener('click', () => {
        howtoModal.style.display = 'flex';
    });

    if (closeHowtoBtn) {
        closeHowtoBtn.addEventListener('click', () => {
            howtoModal.style.display = 'none';
        });
    }

    if (okHowtoBtn) {
        okHowtoBtn.addEventListener('click', () => {
            howtoModal.style.display = 'none';
        });
    }

    howtoModal.addEventListener('click', (e) => {
        if (e.target === howtoModal) {
            howtoModal.style.display = 'none';
        }
    });
}

document.querySelectorAll('.tut-item').forEach(item => {
    const type = item.dataset.type;
    const simWindow = item.querySelector('.simulation-window');
    const player = simWindow.querySelector('.sim-player');
    const watchBtn = item.querySelector('.watch-btn');

    const playSimulation = () => {
        simWindow.style.display = 'block';
        player.className = 'sim-player';
        void player.offsetWidth;
        player.classList.add(`anim-${type}`);
    };

    const stopSimulation = () => {
        simWindow.style.display = 'none';
        player.className = 'sim-player';
    };

    item.addEventListener('mouseenter', () => {
        if (window.matchMedia("(hover: hover)").matches) {
            playSimulation();
        }
    });

    item.addEventListener('mouseleave', () => {
        if (window.matchMedia("(hover: hover)").matches) {
            stopSimulation();
        }
    });

    if (watchBtn) {
        watchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playSimulation();
            
            setTimeout(() => {
                stopSimulation();
            }, 2500);
        });
    }
});

function startRaceCountdown() {
    const el = document.getElementById('countdown-text');
    if (!el) return;
    let count = 3;
    raceStarted = false;
    el.style.display = 'block';
    el.style.color = '#f1c40f';

    const timer = setInterval(() => {
        el.innerText = count;
        el.classList.remove('count-anim');
        void el.offsetWidth;
        el.classList.add('count-anim');

        count--;

        if (count < 0) {
            clearInterval(timer);
            el.innerText = "KOŞ!";
            el.style.color = "#e74c3c";

            raceStarted = true;
            if (typeof startMusic === 'function') startMusic(currentTheme);

            setTimeout(() => {
                el.style.display = 'none';
            }, 1000);
        }
    }, 1000);
}

const lobbyCanvas = document.getElementById('lobby-bg-canvas');
const lobbyCtx = lobbyCanvas.getContext('2d');

let lobbyCamX = 0; 
let dummyMap = []; 
let lobbyThemeTimer = null;
let lobbyAnimFrame = null;

function resizeLobbyCanvasIfNeeded() {
    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    if (lobbyCanvas.width !== nextWidth || lobbyCanvas.height !== nextHeight) {
        lobbyCanvas.width = nextWidth;
        lobbyCanvas.height = nextHeight;
    }
}

function createDummyMap() {
    const mapWidth = Math.ceil(window.innerWidth / TILE_SIZE) * 3;
    
    let map = Array(ROWS).fill(0).map(() => Array(mapWidth).fill(0)); 
    
    let currentHeight = ROWS - 3; 
    let slope = 0;
    let slopeLength = 0;

    for (let c = 0; c < mapWidth; c++) {
        if (slopeLength <= 0) {
            const rand = Math.random();
            
            if (rand < 0.4) {
                slope = 0;
                slopeLength = Math.floor(Math.random() * 5) + 3;
            } else if (rand < 0.7) {
                slope = -1;
                slopeLength = Math.floor(Math.random() * 4) + 2; 
            } else {
                slope = 1;
                slopeLength = Math.floor(Math.random() * 4) + 2;
            }
        }

        currentHeight += slope;

        if (currentHeight < ROWS - 10) { currentHeight++; slope = 1; }
        if (currentHeight > ROWS - 2) { currentHeight--; slope = -1; }

        slopeLength--;

        for (let r = Math.floor(currentHeight); r < ROWS; r++) {
            if (r === Math.floor(currentHeight)) {
                map[r][c] = 1; 
                
                if (Math.random() < 0.05 && c > 10) {
                    if (slope === 0) {
                        const decorations = [6, 7];
                        map[r-1][c] = decorations[Math.floor(Math.random() * decorations.length)];
                    }
                }
            } else {
                map[r][c] = 1;
            }
        }
    }
    return map;
}

let lobbyRunner = {
    x: -100,
    y: 0,
    vy: 0,
    width: 30,
    height: 30,
    speed: 5,
    color: '#ff4757',
    active: false,
    waitTimer: 60
};

function startThemeCycle() {
    const themes = ['NORMAL', 'ICE', 'FIRE'];
    let themeIndex = 0;
    
    if (lobbyThemeTimer) clearInterval(lobbyThemeTimer);

    lobbyThemeTimer = setInterval(() => {
        themeIndex = (themeIndex + 1) % themes.length;
        currentTheme = themes[themeIndex];
        dummyMap = createDummyMap();
        lobbyCamX = 0;
    }, 8000);
}

function lobbyLoop() {
    resizeLobbyCanvasIfNeeded();
    if (!dummyMap.length) dummyMap = createDummyMap();

    lobbyCtx.clearRect(0, 0, lobbyCanvas.width, lobbyCanvas.height);
    lobbyCtx.save();

    lobbyCamX += 0.8; 

    const isMobileLayout = window.innerWidth <= 1024;
    let zoom = isMobileLayout ? 0.7 : 1.0;

    lobbyCtx.scale(zoom, zoom);

    const mapPixelWidth = dummyMap[0].length * TILE_SIZE;
    if (lobbyCamX > mapPixelWidth - (window.innerWidth / zoom)) {
        lobbyCamX = 0;
        dummyMap = createDummyMap();
    }

    drawProBackground(lobbyCtx, lobbyCanvas.width / zoom, lobbyCanvas.height / zoom);

    const mapTotalHeight = ROWS * TILE_SIZE;
    let renderY = 0;

    if (!isMobileLayout) {
        renderY = (window.innerHeight - mapTotalHeight) / 2 + 140;
    } else {
        renderY = (window.innerHeight / zoom - mapTotalHeight) / 2;
    }

    lobbyCtx.translate(-lobbyCamX, renderY);
    drawMap(lobbyCtx, dummyMap);
    updateAndDrawLobbyRunner();

    lobbyCtx.restore();

    lobbyAnimFrame = requestAnimationFrame(lobbyLoop);
}

window.addEventListener('resize', () => {
    resizeLobbyCanvasIfNeeded();
    resizeRaceCanvases(); // Mobilde canvas boyutunu güncelle
    if (screens.lobby.classList.contains('active')) {
        dummyMap = createDummyMap();
        lobbyCamX = 0;
    }
});

window.addEventListener('load', () => {
    if (document.getElementById('lobby-screen').classList.contains('active')) {
        dummyMap = createDummyMap();
        startThemeCycle();
        lobbyLoop();
    }
});

// switchScreen artık tüm lobi mantığını da içeriyor, override'a gerek yok

function toggleFullScreen(btnElement) {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Hata: ${err.message}`);
        });
        if(btnElement) btnElement.style.display = 'none';
    } else {
        document.exitFullscreen();
        if(btnElement) btnElement.style.display = 'block';
    }
}

const lobbyFsBtn = document.getElementById('lobby-fs-btn');
if (lobbyFsBtn) {
    lobbyFsBtn.addEventListener('click', () => toggleFullScreen(lobbyFsBtn));
}

const raceFsBtn = document.getElementById('race-fs-btn');
if (raceFsBtn) {
    raceFsBtn.addEventListener('click', () => toggleFullScreen(raceFsBtn));
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        if(window.innerWidth <= 1024) {
            if(lobbyFsBtn) lobbyFsBtn.style.display = 'block';
            if(raceFsBtn) raceFsBtn.style.display = 'block';
        }
    }
});

function returnToLobby() {
    // Rejoin bilgisini sakla (lobiye dönmeden önce)
    const lastRoom = roomID;
    
    isOpponentLeft = false;
    isGameEnding = false;
    if (typeof stopMusic === 'function') stopMusic();
    stopRaceTimer();
    switchScreen('lobby');
    
    showWinMessage = false;
    showLoseMessage = false;
    
    document.getElementById('scoreboard').style.display = 'none';
    document.getElementById('lives-display').style.display = 'none';
    
    roomID = null;
    raceStarted = false;
    player.isDead = false;
    
    document.getElementById('find-match-btn').disabled = false;
    document.getElementById('find-match-btn').innerText = "⚔️ RASTGELE RAKİP";
    
    document.getElementById('custom-game-btn').disabled = false;
    document.getElementById('status-msg').innerText = "";

    const modal = document.getElementById('custom-room-modal');
    if(modal) modal.style.display = 'none';
    
    // --- REJOIN BUTONU GÖSTER ---
    if (lastRoom) {
        showRejoinButton(lastRoom);
    }
}

function checkPathValidity(mapData) {
    let startNode = null;
    let endNode = null;

    // 1. Başlangıç ve Bitiş Bul
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (mapData[r][c] === 2) startNode = { r: r, c: c };
            if (mapData[r][c] === 3) endNode = { r: r, c: c };
        }
    }

    if (!startNode || !endNode) return false;

    // 2. Fizik Tabanlı Tarama Ayarları
    const MAX_AIR = 6; 

    let maxFuelAt = Array(ROWS).fill().map(() => Array(COLS).fill(-1));
    
    let queue = [];

    // Başlangıç durumu: { r, c, fuel }
    queue.push({ r: startNode.r, c: startNode.c, fuel: MAX_AIR });
    maxFuelAt[startNode.r][startNode.c] = MAX_AIR;

    while (queue.length > 0) {
        let current = queue.shift();
        let { r, c, fuel } = current;

        // Bitişe ulaştık mı?
        if (Math.abs(r - endNode.r) <= 1 && Math.abs(c - endNode.c) <= 1) {
            return true;
        }

        // --- HAREKETLER ---
        const moves = [
            { dr: 0, dc: 1, type: 'walk' },  // Sağ
            { dr: 0, dc: -1, type: 'walk' }, // Sol
            { dr: -1, dc: 0, type: 'jump' }, // Yukarı (Zıplama)
            { dr: 1, dc: 0, type: 'fall' }   // Aşağı (Düşme)
        ];

        // ŞU AN YERDE MİYİZ?
        let isGrounded = false;
        if (r + 1 < ROWS) {
            let below = mapData[r + 1][c];
            if (below === 1 || below === 2 || below === 3 || below === 8 || below === 11 || below === 12) {
                isGrounded = true;
            }
        }

        // Eğer yerdeysek yakıtı FULLE
        let currentFuel = isGrounded ? MAX_AIR : fuel;

        for (let move of moves) {
            let nr = r + move.dr;
            let nc = c + move.dc;

            // 1. Harita sınırları içinde mi?
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                
                // 2. Duvar kontrolü
                if (mapData[nr][nc] !== 1) {
                    
                    let nextFuel = currentFuel;

                    if (move.type === 'fall') {
                        nextFuel = currentFuel; 
                    } else {
                        nextFuel = currentFuel - 1;
                    }

                    // 3. Yakıtın Yetti mi?
                    if (nextFuel >= 0) {
                        // 4. Daha iyi bir durum mu?
                        if (nextFuel > maxFuelAt[nr][nc]) {
                            maxFuelAt[nr][nc] = nextFuel;
                            queue.push({ r: nr, c: nc, fuel: nextFuel });
                        }
                    }
                }
            }
        }
    }

    return false;
}

document.getElementById('submit-map-btn').addEventListener('click', () => {
    // 1. Önce Başlangıç ve Bitiş var mı kontrolü
    let hasStart = myMap.some(row => row.includes(2));
    let hasEnd = myMap.some(row => row.includes(3));
    
    if (!hasStart || !hasEnd) {
        showWarning("Başlangıç ve Bitiş noktası koymalısın!");
        playSound('trap'); 
        return;
    }

    // 2. YOL KONTROLÜ (BFS - Fizik Tabanlı)
    if (typeof checkPathValidity === 'function') {
        if (!checkPathValidity(myMap)) {
            showWarning("⛔ YOL KAPALI! Zıplayarak geçilebilecek bir yol olmalı.");
            playSound('trap'); 
            screenShake = 10; 
            return; 
        }
    }

    // 3. Sunucuya Gönder
    document.getElementById('submit-map-btn').innerText = "Rakip Bekleniyor...";
    document.getElementById('submit-map-btn').disabled = true;

    if (!buildTimerInterval) {
        startBuildTimer(30);
    }
    
    socket.emit('map_submitted', { roomID: roomID, mapData: myMap });
});

function removeResetTrap(r, c) {
    if (raceMap[r] && raceMap[r][c] === 4) {
        raceMap[r][c] = 1;
        socket.emit('trap_destroyed', { r: r, c: c, newValue: 1 });
        const centerX = c * TILE_SIZE + TILE_SIZE / 2;
        const centerY = r * TILE_SIZE + TILE_SIZE / 2;
        createExplosionEffect(centerX, centerY, false);
        socket.emit('tile_changed', { 
            roomID: roomID, 
            r: r, 
            c: c, 
            type: 1
        });
    }
}

function startTeleportSequence(r, c) {
    // 1. Durumları ayarla
    player.isTeleporting = true;
    canMove = false; // Kontrolü kilitle
    player.vx = 0;
    player.vy = 0;
    
    // 2. Oyuncuyu tuzağın tam ortasına çek
    const trapCenterX = c * TILE_SIZE + 5;
    const trapCenterY = r * TILE_SIZE + 5;
    
    player.x = trapCenterX;
    player.y = trapCenterY;

    // 3. Animasyon Değerlerini Sıfırla
    player.teleportAngle = 0;
    player.teleportScale = 1.0;
    player.teleportAlpha = 1.0;

    playSound('trap');
    
    // 4. Zamanlayıcı: 1 Saniye sonra hasar ver, respawn yap VE TUZAĞI SİL
    setTimeout(() => {
        // Animasyon bitti, değerleri sıfırla
        player.isTeleporting = false;
        player.teleportScale = 1.0;
        player.teleportAlpha = 1.0;
        player.teleportAngle = 0;
        
        removeResetTrap(r, c);
        
        // Hasar ver ve canı azalt (Respawn ile)
        takeDamage(true); 
        
        // Kontrolü geri ver
        if (player.lives > 0) {
            canMove = true;
        }
    }, 1000);
}

// --- HATA AYIKLAMA (DEBUG) MODÜLÜ ---
window.runDiagnostics = function() {
    console.clear();
    console.group("🕵️‍♂️ DETAYLI OYUN RAPORU");

    // 1. EKRAN DURUMU
    const isRaceActive = screens.race.classList.contains('active');
    console.log(`%c[1] Ekran Durumu: ${isRaceActive ? '✅ YARIŞ EKRANI AKTİF' : '❌ YARIŞ EKRANI GİZLİ'}`, "font-weight:bold; color: #d35400");
    
    // 2. CANVAS BOYUTLARI
    console.log(`%c[2] Canvas Boyutları:`, "color: #2980b9");
    console.log(`   - Window: ${window.innerWidth} x ${window.innerHeight}`);
    console.log(`   - RaceCanvas Element: ${raceCanvas.width} x ${raceCanvas.height}`);
    console.log(`   - RaceCanvas Style: ${raceCanvas.style.width} x ${raceCanvas.style.height}`);
    
    if (raceCanvas.width === 0 || raceCanvas.height === 0) {
        console.error("   🚨 KRİTİK HATA: Canvas boyutu 0! Çizim yapılamaz.");
    }

    // 3. HARİTA VERİSİ
    console.log(`%c[3] Harita Durumu:`, "color: #27ae60");
    if (!raceMap || raceMap.length === 0) {
        console.error("   🚨 KRİTİK HATA: 'raceMap' verisi BOŞ veya UNDEFINED!");
    } else {
        console.log(`   - Harita Yüklü: ✅ Evet`);
        console.log(`   - Satır Sayısı: ${raceMap.length}`);
        console.log(`   - İlk Satır: [${raceMap[0]}]`);
    }

    // 4. OYUNCU KOORDİNATLARI
    console.log(`%c[4] Oyuncu Verisi:`, "color: #8e44ad");
    console.log("   - Player:", player);
    console.log(`   - X: ${player.x}, Y: ${player.y}`);
    
    if (isNaN(player.x) || isNaN(player.y)) {
        console.error("   🚨 KRİTİK HATA: Oyuncu koordinatları NaN (Tanımsız Sayı) olmuş!");
    }

    // 5. KAMERA (OFFSET)
    console.log(`%c[5] Kamera/Görünüm:`, "color: #c0392b");
    if (typeof cameraOffset !== 'undefined') {
        console.log(`   - Camera Offset: ${cameraOffset}`);
        if (isNaN(cameraOffset)) console.error("   🚨 KRİTİK HATA: Kamera açısı bozulmuş (NaN).");
    } else {
        console.log("   - Camera Offset değişkenine erişilemedi.");
    }

    // 6. OYUN DÖNGÜSÜ
    console.log(`%c[6] Sistem:`, "color: #7f8c8d");
    console.log(`   - Yarış Başladı mı?: ${raceStarted}`);
    console.log(`   - Bitiş (HasFinished): ${hasFinished}`);
    
    console.groupEnd();
};

// "P" tuşuna basınca rapor ver
window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
        window.runDiagnostics();
    }
});



const trapInfoDB = {
    spike: {
        title: "DİKEN TUZAĞI",
        desc: "Oyuncuya temas ettiğinde canını yakar ve hızını %50 düşürür.",
        trapClass: "trap-spike",
        sceneClass: "spike-scene"
    },
    trampoline: {
        title: "TRAMBOLİN",
        desc: "Üstüne basan oyuncuyu havaya fırlatır. Duvarları aşmak için kullanılabilir.",
        trapClass: "trap-trampoline",
        sceneClass: "trampoline-scene"
    },
    freeze: {
        title: "DONDURUCU",
        desc: "Oyuncuyu olduğu yere kilitler. 3 saniye boyunca hareket edemez.",
        trapClass: "trap-freeze",
        sceneClass: "freeze-scene"
    },
    reset: {
        title: "BAŞA ATMA (RESET)",
        desc: "En tehlikeli tuzak! Oyuncuyu alır ve başlangıç noktasına geri ışınlar.",
        trapClass: "trap-reset",
        sceneClass: "reset-scene"
    }
};

window.showTutorial = function(type) {
    document.querySelectorAll('.tut-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.tut-btn[onclick="showTutorial('${type}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const data = trapInfoDB[type];
    if (!data) return;

    const scene = document.getElementById('sim-scene');
    const trap = document.getElementById('sim-trap');
    const infoTitle = document.querySelector('#sim-info h3');
    const infoDesc = document.querySelector('#sim-info p');

    if (!scene || !trap || !infoTitle || !infoDesc) return;

    scene.className = 'scene';
    void scene.offsetWidth;
    scene.classList.add(data.sceneClass);

    trap.className = `s-block ${data.trapClass}`;
    infoTitle.innerText = data.title;
    infoDesc.innerText = data.desc;
};

// --- KARAKTER OZELLESTIRME MANTIGI ---
const previewCanvas = document.getElementById('char-preview-canvas');
const previewCtx = previewCanvas ? previewCanvas.getContext('2d') : null;
let previewAnimFrame;

let previewState = {
    blinkTimer: 0,
    isBlinking: false,
    breathVal: 0,
    mouseX: 0,
    mouseY: 0
};

const openCustomizeBtn = document.getElementById('open-customize-btn');
const saveCharBtn = document.getElementById('save-char-btn');
const customizeScreen = document.getElementById('customize-screen');

if (openCustomizeBtn && customizeScreen) {
    openCustomizeBtn.addEventListener('click', () => {
        customizeScreen.style.display = 'flex';
        customizeScreen.classList.add('active');
        
        previewHatId = myHat;
        updateHatSelectionUI();
        startPreviewLoop();
    });
}

if (saveCharBtn && customizeScreen) {
    saveCharBtn.addEventListener('click', () => {
        customizeScreen.style.display = 'none';
        customizeScreen.classList.remove('active');
        
        if (previewAnimFrame) cancelAnimationFrame(previewAnimFrame);
    });
}

document.querySelectorAll('#new-color-selection .color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#new-color-selection .color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        myColor = btn.dataset.color;
        playSound('jump');
    });
});

document.querySelectorAll('.hat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const hatId = parseInt(btn.dataset.hat, 10);
        const reqLevel = unlockRequirements.hats[hatId] || 0;

        previewHatId = hatId;

        document.querySelectorAll('.hat-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        if (playerStats.level < reqLevel) {
            playSound('trap');
        } else {
            myHat = hatId;
            playSound('jump');
        }
    });
});

function updateHatSelectionUI() {
    document.querySelectorAll('.hat-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (parseInt(btn.dataset.hat, 10) === previewHatId) {
            btn.classList.add('selected');
        }
    });
}

if (previewCanvas) {
    previewCanvas.addEventListener('mousemove', (e) => {
        const rect = previewCanvas.getBoundingClientRect();
        previewState.mouseX = e.clientX - rect.left;
        previewState.mouseY = e.clientY - rect.top;
    });
}

function startPreviewLoop() {
    if (!previewCtx) return;
    if (previewAnimFrame) cancelAnimationFrame(previewAnimFrame);

    function loop() {
        updatePreview();
        drawPreview();
        previewAnimFrame = requestAnimationFrame(loop);
    }
    loop();
}

function updatePreview() {
    previewState.breathVal = Math.sin(Date.now() / 300) * 3;

    if (previewState.isBlinking) {
        previewState.blinkTimer--;
        if (previewState.blinkTimer <= 0) previewState.isBlinking = false;
    } else if (Math.random() < 0.005) {
        previewState.isBlinking = true;
        previewState.blinkTimer = 10;
    }
}

// --- ILERLEME VE SEVIYE SISTEMI (PROGRESSION) ---

// 1. Oyuncu Istatistikleri (Varsayilan)
let playerStats = {
    level: 1,
    xp: 0,
    xpToNext: 100,
    coins: 0
};

// 2. Kilit Kurallari (Hangi sapka kacinci seviyede acilir?)
const unlockRequirements = {
    hats: {
        1: 10,
        2: 5,
        3: 2,
        4: 20
    }
};

// 3. Istatistikleri Yukle (Local Storage)
function loadStats() {
    const saved = localStorage.getItem('trapRunStats_v1');
    if (saved) {
        playerStats = JSON.parse(saved);
    }
    updateLevelUI();
}

// 4. Istatistikleri Kaydet
function saveStats() {
    localStorage.setItem('trapRunStats_v1', JSON.stringify(playerStats));
    updateLevelUI();
}

// 5. XP Ekleme Fonksiyonu
function addXp(amount) {
    playerStats.xp += amount;

    if (playerStats.xp >= playerStats.xpToNext) {
        playerStats.level++;
        playerStats.xp -= playerStats.xpToNext;
        playerStats.xpToNext = Math.floor(playerStats.xpToNext * 1.5);

        playSound('win');
        showWarning(`🎉 TEBRIKLER! SEVIYE ${playerStats.level} OLDUN!`);

        const lvlDisplay = document.getElementById('lvl-display');
        if (lvlDisplay) {
            lvlDisplay.classList.add('level-up-anim');
            setTimeout(() => lvlDisplay.classList.remove('level-up-anim'), 1000);
        }
    }

    saveStats();
}

// 6. Arayuzu ve kilitleri guncelle
function updateLevelUI() {
    const lvlText = document.getElementById('lvl-display');
    const xpText = document.getElementById('xp-display');
    if (lvlText) lvlText.innerText = playerStats.level;
    if (xpText) xpText.innerText = `${playerStats.xp}/${playerStats.xpToNext}`;

    document.querySelectorAll('.hat-btn').forEach(btn => {
        const hatId = parseInt(btn.dataset.hat, 10);
        if (hatId === 0) return;

        const reqLevel = unlockRequirements.hats[hatId];
        if (playerStats.level < reqLevel) {
            btn.classList.add('locked-item');
        } else {
            btn.classList.remove('locked-item');
        }
    });
}

window.addEventListener('load', () => {
    loadStats();
    // Eğer eski kayıtta coins yoksa ekle
    if (typeof playerStats.coins === 'undefined') playerStats.coins = 0;
    // Eski kayıtlarda eksik olabilecek alanları ekle
    if (!playerStats.ownedTrails) playerStats.ownedTrails = ['none'];
    if (!playerStats.ownedDeathFx) playerStats.ownedDeathFx = ['none'];
    if (!playerStats.ownedColors) playerStats.ownedColors = [];
    if (!playerStats.activeTrail) playerStats.activeTrail = 'none';
    if (!playerStats.activeDeathFx) playerStats.activeDeathFx = 'none';
    if (!playerStats.achievements) playerStats.achievements = {};
    if (!playerStats.totalWins) playerStats.totalWins = 0;
    if (!playerStats.totalGames) playerStats.totalGames = 0;
    if (!playerStats.perfectRuns) playerStats.perfectRuns = 0;
});

// ===========================================================
//  AYARLAR MENÜSÜ
// ===========================================================
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');

if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
    });
    
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.style.display = 'none';
    });
}

// Müzik volume slider
const musicVolSlider = document.getElementById('music-vol');
const musicVolVal = document.getElementById('music-vol-val');
if (musicVolSlider) {
    musicVolSlider.addEventListener('input', () => {
        const val = parseInt(musicVolSlider.value);
        musicVolVal.innerText = val;
        if (typeof setMusicVolume === 'function') setMusicVolume(val / 100);
    });
}

// Efekt volume slider
const sfxVolSlider = document.getElementById('sfx-vol');
const sfxVolVal = document.getElementById('sfx-vol-val');
if (sfxVolSlider) {
    sfxVolSlider.addEventListener('input', () => {
        const val = parseInt(sfxVolSlider.value);
        sfxVolVal.innerText = val;
        if (typeof setSfxVolume === 'function') setSfxVolume(val / 100);
    });
}

// ===========================================================
//  YARIŞ ZAMANLAYICISI (90 SANİYE)
// ===========================================================
let raceTimerInterval = null;
let raceTimeLeft = 90;
const raceTimerEl = document.getElementById('race-timer');

function startRaceTimer() {
    raceTimeLeft = 90;
    if (raceTimerEl) {
        raceTimerEl.style.display = 'block';
        raceTimerEl.innerText = '⏱ ' + raceTimeLeft;
        raceTimerEl.classList.remove('warning');
    }

    if (raceTimerInterval) clearInterval(raceTimerInterval);
    raceTimerInterval = setInterval(() => {
        raceTimeLeft--;
        if (raceTimerEl) {
            raceTimerEl.innerText = '⏱ ' + raceTimeLeft;
            if (raceTimeLeft <= 15) raceTimerEl.classList.add('warning');
            if (raceTimeLeft <= 10) playSound('jump'); // Tik-tak
        }
        if (raceTimeLeft <= 0) {
            clearInterval(raceTimerInterval);
            raceTimerInterval = null;
            // Süre doldu - sunucuya bildir, en ilerideki kazanır
            showWarning("⏱ SÜRE DOLDU! En ilerideki kazanır...");
            playSound('trap');
            vibrateMobile([300, 100, 300]);
            socket.emit('race_timeout', roomID);
        }
    }, 1000);
}

function stopRaceTimer() {
    if (raceTimerInterval) clearInterval(raceTimerInterval);
    raceTimerInterval = null;
    if (raceTimerEl) raceTimerEl.style.display = 'none';
}

// ===========================================================
//  COIN MAĞAZASI
// ===========================================================
const SHOP_ITEMS = {
    trails: [
        { id: 'none', name: 'Yok', icon: '❌', price: 0 },
        { id: 'fire', name: 'Ateş', icon: '🔥', price: 100 },
        { id: 'star', name: 'Yıldız', icon: '⭐', price: 150 },
        { id: 'rainbow', name: 'Gökkuşağı', icon: '🌈', price: 250 },
        { id: 'electric', name: 'Elektrik', icon: '⚡', price: 200 },
        { id: 'snow', name: 'Kar', icon: '❄️', price: 120 }
    ],
    deathFx: [
        { id: 'none', name: 'Normal', icon: '💥', price: 0 },
        { id: 'ghost', name: 'Hayalet', icon: '👻', price: 100 },
        { id: 'skull', name: 'Kuru Kafa', icon: '💀', price: 150 },
        { id: 'confetti', name: 'Konfeti', icon: '🎊', price: 200 }
    ],
    colors: [
        { id: '#ff69b4', name: 'Pembe', icon: '🩷', price: 80 },
        { id: '#00ff88', name: 'Neon Yeşil', icon: '💚', price: 80 },
        { id: '#ff8800', name: 'Turuncu', icon: '🧡', price: 80 },
        { id: '#00ffff', name: 'Cyan', icon: '💎', price: 100 },
        { id: '#ff00ff', name: 'Magenta', icon: '🔮', price: 120 }
    ]
};

const shopBtn = document.getElementById('shop-btn');
const shopModal = document.getElementById('shop-modal');
const closeShopBtn = document.getElementById('close-shop-btn');

if (shopBtn && shopModal) {
    shopBtn.addEventListener('click', () => {
        renderShop();
        shopModal.style.display = 'flex';
    });

    closeShopBtn.addEventListener('click', () => {
        shopModal.style.display = 'none';
    });

    shopModal.addEventListener('click', (e) => {
        if (e.target === shopModal) shopModal.style.display = 'none';
    });
}

function renderShop() {
    document.getElementById('shop-coin-display').innerText = playerStats.coins || 0;

    // Trails
    const trailsGrid = document.getElementById('shop-trails-grid');
    trailsGrid.innerHTML = '';
    SHOP_ITEMS.trails.forEach(item => {
        const owned = playerStats.ownedTrails && playerStats.ownedTrails.includes(item.id);
        const active = playerStats.activeTrail === item.id;
        const el = document.createElement('div');
        el.className = 'shop-item' + (owned ? ' owned' : '');
        el.innerHTML = `
            <span class="item-icon">${item.icon}</span>
            <span class="item-name">${item.name}</span>
            <span class="item-price">${owned ? (active ? '✅ Aktif' : 'Seç') : '💰' + item.price}</span>
        `;
        el.addEventListener('click', () => buyOrSelectItem('trails', item));
        trailsGrid.appendChild(el);
    });

    // Death FX
    const deathGrid = document.getElementById('shop-deathfx-grid');
    deathGrid.innerHTML = '';
    SHOP_ITEMS.deathFx.forEach(item => {
        const owned = playerStats.ownedDeathFx && playerStats.ownedDeathFx.includes(item.id);
        const active = playerStats.activeDeathFx === item.id;
        const el = document.createElement('div');
        el.className = 'shop-item' + (owned ? ' owned' : '');
        el.innerHTML = `
            <span class="item-icon">${item.icon}</span>
            <span class="item-name">${item.name}</span>
            <span class="item-price">${owned ? (active ? '✅ Aktif' : 'Seç') : '💰' + item.price}</span>
        `;
        el.addEventListener('click', () => buyOrSelectItem('deathFx', item));
        deathGrid.appendChild(el);
    });

    // Colors
    const colorsGrid = document.getElementById('shop-colors-grid');
    colorsGrid.innerHTML = '';
    SHOP_ITEMS.colors.forEach(item => {
        const owned = playerStats.ownedColors && playerStats.ownedColors.includes(item.id);
        const el = document.createElement('div');
        el.className = 'shop-item' + (owned ? ' owned' : '');
        el.innerHTML = `
            <span class="item-icon">${item.icon}</span>
            <span class="item-name">${item.name}</span>
            <span class="item-price">${owned ? 'Sahip' : '💰' + item.price}</span>
        `;
        el.addEventListener('click', () => {
            if (owned) {
                myColor = item.id;
                showWarning('🎨 Renk seçildi!');
            } else if (playerStats.coins >= item.price) {
                playerStats.coins -= item.price;
                if (!playerStats.ownedColors) playerStats.ownedColors = [];
                playerStats.ownedColors.push(item.id);
                myColor = item.id;
                saveStats();
                playSound('powerup');
                showWarning('🎨 Renk satın alındı!');
                renderShop();
            } else {
                showWarning('💰 Yeterli coin yok!');
                playSound('trap');
            }
        });
        colorsGrid.appendChild(el);
    });
}

function buyOrSelectItem(category, item) {
    const ownedKey = category === 'trails' ? 'ownedTrails' : 'ownedDeathFx';
    const activeKey = category === 'trails' ? 'activeTrail' : 'activeDeathFx';

    if (!playerStats[ownedKey]) playerStats[ownedKey] = ['none'];

    if (playerStats[ownedKey].includes(item.id)) {
        // Zaten sahip, seç
        playerStats[activeKey] = item.id;
        saveStats();
        playSound('jump');
        showWarning('✅ Seçildi!');
        renderShop();
    } else if (playerStats.coins >= item.price) {
        // Satın al
        playerStats.coins -= item.price;
        playerStats[ownedKey].push(item.id);
        playerStats[activeKey] = item.id;
        saveStats();
        playSound('powerup');
        showWarning('🎉 Satın alındı!');
        renderShop();
    } else {
        showWarning('💰 Yeterli coin yok!');
        playSound('trap');
    }
}

// ===========================================================
//  BAŞARIM SİSTEMİ
// ===========================================================
const ACHIEVEMENTS = {
    first_blood: { name: '🩸 İlk Kan', desc: 'İlk maçını kazan', check: () => playerStats.totalWins >= 1 },
    veteran: { name: '⚔️ Veteran', desc: '10 maç kazan', check: () => playerStats.totalWins >= 10 },
    survivor: { name: '🛡️ Survivor', desc: 'Hasarsız bitir', check: () => false /* roundStats check */ },
    architect: { name: '🏗️ Mimar', desc: '50 oyun oyna', check: () => playerStats.totalGames >= 50 },
    rich: { name: '💰 Zengin', desc: '500 coin biriktir', check: () => playerStats.coins >= 500 },
    speedster: { name: '⚡ Hızlı', desc: 'Yarışı 15 saniyeden kısa bitir', check: () => false },
    collector: { name: '📦 Koleksiyoncu', desc: '5 mağaza öğesi satın al', check: () => {
        const total = (playerStats.ownedTrails?.length || 1) + (playerStats.ownedDeathFx?.length || 1) + (playerStats.ownedColors?.length || 0) - 2;
        return total >= 5;
    }},
    leveled: { name: '📈 Seviye 10', desc: 'Seviye 10\'a ulaş', check: () => playerStats.level >= 10 }
};

function checkAchievements(extraChecks) {
    if (!playerStats.achievements) playerStats.achievements = {};
    
    for (const [id, ach] of Object.entries(ACHIEVEMENTS)) {
        if (playerStats.achievements[id]) continue; // Zaten kazandı
        
        let unlocked = false;
        if (id === 'survivor' && extraChecks && extraChecks.noDamage) {
            unlocked = true;
        } else if (id === 'speedster' && extraChecks && extraChecks.fastFinish) {
            unlocked = true;
        } else {
            unlocked = ach.check();
        }

        if (unlocked) {
            playerStats.achievements[id] = Date.now();
            saveStats();
            showAchievementToast(ach.name);
        }
    }
}

function showAchievementToast(name) {
    const toast = document.getElementById('achievement-toast');
    if (!toast) return;
    toast.innerText = '🏅 BAŞARIM: ' + name;
    toast.classList.add('show');
    playSound('win');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Raund sonunda başarım kontrolü
function checkRoundAchievements(iWon) {
    playerStats.totalGames = (playerStats.totalGames || 0) + 1;
    if (iWon) playerStats.totalWins = (playerStats.totalWins || 0) + 1;
    saveStats();

    const extraChecks = {};
    if (roundStats.damagesTaken === 0 && iWon) {
        extraChecks.noDamage = true;
        playerStats.perfectRuns = (playerStats.perfectRuns || 0) + 1;
        saveStats();
    }
    if (iWon && roundStats.startTime) {
        const elapsed = (Date.now() - roundStats.startTime) / 1000;
        if (elapsed < 15) extraChecks.fastFinish = true;
    }
    checkAchievements(extraChecks);
}

// --- REKLAM VE CANLANMA SİSTEMİ ---
const reviveModal = document.getElementById('revive-modal');
const mockAdScreen = document.getElementById('mock-ad-screen');
const adTimerText = document.getElementById('ad-timer');

// 1. Oyuncu Öldüğünde Bu Fonksiyonu Çağıracağız
function showReviveMenu() {
    reviveModal.style.display = 'flex';
}

// 2. Reklam İzle Butonuna Basıldığında
document.getElementById('btn-watch-ad').addEventListener('click', () => {
    reviveModal.style.display = 'none'; // Menüyü kapat
    mockAdScreen.style.display = 'flex'; // Sahte reklamı aç
    
    let timeLeft = 3; // 3 saniyelik reklam
    adTimerText.innerText = timeLeft;

    const interval = setInterval(() => {
        timeLeft--;
        adTimerText.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(interval);
            mockAdScreen.style.display = 'none'; // Reklam bitti
            
            // --- ÖDÜLÜ VER ---
            console.log("REKLAM İZLENDİ: Oyuncu canlandırıldı!");
            // socket.emit('player_revived_by_ad'); // İleride sunucuya da haber verebiliriz
            
            // Test için oyuncuya biraz da altın verelim
            playerStats.coins += 50; 
            saveStats(); // Altını kaydet
        }
    }, 1000); // Her 1 saniyede bir çalışır
});

// 3. Bekleyeceğim (Atla) Butonuna Basıldığında
document.getElementById('btn-skip-ad').addEventListener('click', () => {
    reviveModal.style.display = 'none';
    // Normal 5 saniyelik ceza süresi arka planda işlemeye devam eder
});
