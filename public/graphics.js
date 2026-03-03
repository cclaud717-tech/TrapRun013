// --- GRAFİK/EFEKT DURUMLARI ---
let clouds = [];

// --- MOBİL PERFORMANS ---
const isMobileDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 1024;
// Mobilde shadowBlur çok ağır, kapatıyoruz
const SHADOW_BLUR = isMobileDevice ? 0 : 1; // 0 = kapalı, 1 = açık (çarpan olarak kullan)

// --- OPTİMİZE EDİLMİŞ PARÇACIK HAVUZU (OBJECT POOL) ---
const MAX_PARTICLES = isMobileDevice ? 100 : 300; 
const particlePool = [];

// Oyun yüklenirken havuzu bir kez dolduruyoruz
function initParticlePool() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
        particlePool.push({
            active: false,
            isOpponent: false, // Hangi ekranda çizileceğini ayırmak için
            x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#fff', size: 2
        });
    }
}
initParticlePool(); // Hemen çalıştır

// Yeni parçacık oluşturmak (new obj yerine havuzdan çekiyoruz)
function spawnParticle(x, y, vx, vy, life, color, size, isOpponent = false) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
        let p = particlePool[i];
        if (!p.active) {
            p.active = true;
            p.isOpponent = isOpponent;
            p.x = x;
            p.y = y;
            p.vx = vx;
            p.vy = vy;
            p.life = life;
            p.maxLife = life;
            p.color = color;
            p.size = size;
            break; // Parçacığı bulduk, döngüden çık
        }
    }
}

// --- DUMAN VE PATLAMA HAVUZLARI (OBJECT POOL) ---
const MAX_SMOKE = isMobileDevice ? 60 : 150;
const smokePool = [];
const MAX_EXPLOSIONS = isMobileDevice ? 20 : 50;
const explosionPool = [];

function initExtraPools() {
    for (let i = 0; i < MAX_SMOKE; i++) {
        smokePool.push({ active: false, isOpponent: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#7f8c8d', size: 10 });
    }
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
        explosionPool.push({ active: false, isOpponent: false, x: 0, y: 0, radius: 0, maxRadius: 0, life: 0, maxLife: 0, color: '#e74c3c' });
    }
}
initExtraPools(); // Hemen çalıştır

// Havuzdan Duman Çek
function spawnSmoke(x, y, vx, vy, life, color, size, isOpponent = false) {
    for (let i = 0; i < MAX_SMOKE; i++) {
        let p = smokePool[i];
        if (!p.active) {
            p.active = true; p.isOpponent = isOpponent; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.maxLife = life; p.color = color; p.size = size;
            break;
        }
    }
}

// Havuzdan Patlama Çek
function spawnExplosion(x, y, maxRadius, life, color, isOpponent = false) {
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
        let p = explosionPool[i];
        if (!p.active) {
            p.active = true; p.isOpponent = isOpponent; p.x = x; p.y = y; p.radius = 0; p.maxRadius = maxRadius; p.life = life; p.maxLife = life; p.color = color;
            break;
        }
    }
}

// Kolay Kullanım İçin Ana Patlama Efekti (Oyuncu ölünce veya mayın patlayınca çağrılacak)
function createExplosionEffect(x, y, isOpponentScreen = false) {
    // 2 Adet genişleyen şok dalgası
    spawnExplosion(x, y, 40, 1.0, '#e74c3c', isOpponentScreen);
    spawnExplosion(x, y, 25, 0.8, '#f1c40f', isOpponentScreen);
    
    // Etrafa saçılan dumanlar (mobilde yarısı kadar)
    const smokeCount = isMobileDevice ? 5 : 10;
    for(let i = 0; i < smokeCount; i++) {
        spawnSmoke(
            x + (Math.random() - 0.5) * 20, 
            y + (Math.random() - 0.5) * 20, 
            (Math.random() - 0.5) * 4, 
            (Math.random() - 0.5) * 4, 
            1.0, 
            (Math.random() > 0.5) ? '#7f8c8d' : '#95a5a6', // Gri tonları
            Math.random() * 10 + 5, 
            isOpponentScreen
        );
    }
}

// --- OPTİMİZASYON DEĞİŞKENLERİ ---
let bgCacheCanvas = document.createElement('canvas');
let bgCacheCtx = bgCacheCanvas.getContext('2d');
let isBgCached = false;
let lastThemeForCache = '';

// --- KUTLAMA EFEKTLERİ ---
let fireworks = [];
let showWinMessage = false;
let showLoseMessage = false;

function cacheBackground(width, height) {
    // Eğer zaten çizildiyse ve ekran boyutları değişmediyse tekrar çizme
    if (isBgCached && bgCacheCanvas.width === width && bgCacheCanvas.height === height) return;
    
    bgCacheCanvas.width = width;
    bgCacheCanvas.height = height;
    
    // 1. Arka Plan Rengi
    bgCacheCtx.fillStyle = "#1e272e"; 
    bgCacheCtx.fillRect(0, 0, width, height);

    // 2. İnce Izgara Çizgileri
    bgCacheCtx.lineWidth = 1;
    bgCacheCtx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    bgCacheCtx.beginPath();
    for (let c = 0; c <= COLS; c++) {
        bgCacheCtx.moveTo(c * TILE_SIZE, 0);
        bgCacheCtx.lineTo(c * TILE_SIZE, height);
    }
    for (let r = 0; r <= ROWS; r++) {
        bgCacheCtx.moveTo(0, r * TILE_SIZE);
        bgCacheCtx.lineTo(width, r * TILE_SIZE);
    }
    bgCacheCtx.stroke();

    // 3. Kalın Referans Çizgileri (Her 5 karede bir)
    bgCacheCtx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    bgCacheCtx.beginPath();
    for (let c = 0; c <= COLS; c += 5) {
        bgCacheCtx.moveTo(c * TILE_SIZE, 0);
        bgCacheCtx.lineTo(c * TILE_SIZE, height);
    }
    bgCacheCtx.stroke();

    isBgCached = true;
}

function drawBuildGrid() {
    // 1. Arka Plan ve Izgarayı Önbellekten Çiz (BÜYÜK OPTİMİZASYON)
    cacheBackground(buildCanvas.width, buildCanvas.height);
    buildCtx.drawImage(bgCacheCanvas, 0, 0);

    // 2. Mevcut Haritayı Çiz
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let isAnimating = placementEffects.some(e => e.r === r && e.c === c);
            
            if (myMap[r][c] !== 0 && !isAnimating) {
                drawTile(buildCtx, myMap[r][c], c * TILE_SIZE, r * TILE_SIZE, r, c, myMap);
            }
        }
    }

    // 4. "Pop" Animasyonlarını Oynat ve Çiz
    let hasActiveAnimations = false;
    if (placementEffects.length > 0) {
        for (let i = placementEffects.length - 1; i >= 0; i--) {
            let eff = placementEffects[i];
            
            // Büyütme (Scale Up)
            eff.scale += (1.2 - eff.scale) * 0.4;
            
            let drawScale = eff.scale;
            if (drawScale > 1.0) drawScale = 1.0;

            let cx = eff.c * TILE_SIZE + TILE_SIZE / 2;
            let cy = eff.r * TILE_SIZE + TILE_SIZE / 2;

            buildCtx.save();
            buildCtx.translate(cx, cy);
            buildCtx.scale(drawScale, drawScale);
            buildCtx.translate(-cx, -cy);
            
            drawTile(buildCtx, eff.toolId, eff.c * TILE_SIZE, eff.r * TILE_SIZE, eff.r, eff.c, myMap);
            
            buildCtx.restore();

            if (eff.scale > 0.99) {
                placementEffects.splice(i, 1);
            } else {
                hasActiveAnimations = true;
            }
        }
        // Tek bir rAF çağrısı (leak önlenir)
        if (hasActiveAnimations) {
            requestAnimationFrame(drawBuildGrid);
        }
    }

    // 5. Hayalet Blok (Ghost Tile) Çizimi
    if (editorCursor.active && currentTool !== -1 && currentTool !== 0) {
        let ghostR = editorCursor.r;
        let ghostC = editorCursor.c;

        if (myMap[ghostR][ghostC] === 0) {
            buildCtx.save();
            buildCtx.globalAlpha = 0.5;
            
            drawTile(buildCtx, currentTool, ghostC * TILE_SIZE, ghostR * TILE_SIZE, ghostR, ghostC, myMap);
            
            buildCtx.strokeStyle = "white";
            buildCtx.lineWidth = 2;
            buildCtx.strokeRect(ghostC * TILE_SIZE, ghostR * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            
            buildCtx.restore();
        }
    }
    
    // Silgi seçiliyse kırmızı çerçeve göster
    if (editorCursor.active && currentTool === 0) {
        let ghostR = editorCursor.r;
        let ghostC = editorCursor.c;
        
        buildCtx.strokeStyle = "#ff4757";
        buildCtx.lineWidth = 3;
        buildCtx.strokeRect(ghostC * TILE_SIZE, ghostR * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        
        // Çarpı işareti
        buildCtx.beginPath();
        buildCtx.moveTo(ghostC * TILE_SIZE, ghostR * TILE_SIZE);
        buildCtx.lineTo(ghostC * TILE_SIZE + TILE_SIZE, ghostR * TILE_SIZE + TILE_SIZE);
        buildCtx.moveTo(ghostC * TILE_SIZE + TILE_SIZE, ghostR * TILE_SIZE);
        buildCtx.lineTo(ghostC * TILE_SIZE, ghostR * TILE_SIZE + TILE_SIZE);
        buildCtx.stroke();
    }

    drawMapBorders(buildCtx);
}

function drawRace() {
    raceCtx.clearRect(0, 0, raceCanvas.width, raceCanvas.height);

    drawProBackground(raceCtx, raceCanvas.width, raceCanvas.height); 

    raceCtx.save();

    // Mobilde tüm harita ekrana sığsın diye ölçekle
    if (gameScale !== 1) raceCtx.scale(gameScale, gameScale);

    if (screenShake > 0) {
        let dx = (Math.random() - 0.5) * screenShake;
        let dy = (Math.random() - 0.5) * screenShake;
        raceCtx.translate(dx, dy);
        screenShake *= 0.9;
        if (screenShake < 0.5) screenShake = 0;
    }
    
    raceCtx.translate(-camera.x, 0);

    drawMap(raceCtx, raceMap, camera.x, raceCanvas.width / gameScale);
    updateAndDrawSmoke(raceCtx, false);
    updateAndDrawExplosions(raceCtx, false);
    
    saws.forEach(saw => {
        raceCtx.save();
        raceCtx.translate(saw.x + TILE_SIZE/2, saw.y + TILE_SIZE/2);
        raceCtx.rotate(saw.angle);
        
        const R = 17;
        const teeth = 8;
        
        // Dış dişli çember
        raceCtx.fillStyle = '#95a5a6';
        raceCtx.beginPath();
        for (let i = 0; i < teeth; i++) {
            const a1 = (i / teeth) * Math.PI * 2;
            const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
            raceCtx.lineTo(Math.cos(a1) * (R + 5), Math.sin(a1) * (R + 5));
            raceCtx.lineTo(Math.cos(a2) * (R - 2), Math.sin(a2) * (R - 2));
        }
        raceCtx.closePath();
        raceCtx.fill();
        
        // İç disk
        raceCtx.fillStyle = '#7f8c8d';
        raceCtx.beginPath();
        raceCtx.arc(0, 0, R - 4, 0, Math.PI * 2);
        raceCtx.fill();
        
        // Merkez delik
        raceCtx.fillStyle = '#c0392b';
        raceCtx.beginPath();
        raceCtx.arc(0, 0, 4, 0, Math.PI * 2);
        raceCtx.fill();
        
        // Parlama çizgisi
        raceCtx.strokeStyle = 'rgba(255,255,255,0.3)';
        raceCtx.lineWidth = 1;
        raceCtx.beginPath();
        raceCtx.arc(0, 0, R - 6, -0.5, 0.5);
        raceCtx.stroke();

        raceCtx.restore();
    });
    drawPlayer(raceCtx, player, true); 
    updateAndDrawParticles(raceCtx, false);
    if (powerUp.active) drawPowerup(raceCtx);

    updateAndDrawFireworks(raceCtx);
    drawMapBorders(raceCtx);
    raceCtx.restore();

    // --- PROGRESS BAR ÇİZİMİ (YENİ) ---
    // Kamera transformu iptal edildikten (restore) sonra çiziyoruz ki hep tepede sabit kalsın.
    drawProgressBar(raceCtx, raceCanvas.width);

    if (showWinMessage) {
        raceCtx.save();
        raceCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
        raceCtx.fillRect(0, 0, raceCanvas.width, raceCanvas.height);
        
        raceCtx.fillStyle = "#f1c40f";
        raceCtx.font = "900 70px 'Orbitron'";
        raceCtx.textAlign = "center";
        raceCtx.shadowColor = "#e67e22";
        raceCtx.shadowBlur = 20;
        raceCtx.fillText("🏆 KAZANDIN! 🏆", raceCanvas.width/2, raceCanvas.height/2);
        raceCtx.restore();
    }
    
    if (showLoseMessage) {
        raceCtx.save();
        raceCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
        raceCtx.fillRect(0, 0, raceCanvas.width, raceCanvas.height);
        
        raceCtx.fillStyle = "#e74c3c";
        raceCtx.font = "900 70px 'Orbitron'";
        raceCtx.textAlign = "center";
        raceCtx.shadowColor = "black";
        raceCtx.shadowBlur = 10;
        raceCtx.fillText("❌ KAYBETTİN...", raceCanvas.width/2, raceCanvas.height/2);
        raceCtx.restore();
    }
}

function drawOpponent() {
    opponentCtx.clearRect(0, 0, opponentCanvas.width, opponentCanvas.height);
    
    drawProBackground(opponentCtx, opponentCanvas.width, opponentCanvas.height, true);

    // --- ZAMAN BAZLI İNTERPOLASYON ---
    const now = performance.now();
    const elapsed = now - (opponent.lastUpdateTime || now);
    const t = Math.min(elapsed / 50, 1);
    const lerpFactor = 0.08 + t * 0.12;

    opponent.x += (opponent.targetX - opponent.x) * lerpFactor;
    opponent.y += (opponent.targetY - opponent.y) * lerpFactor;

    opponentCtx.save();

    // Rakip canvas ölçeği: harita yüksekliği PiP canvas'ına sığsın
    const oppScale = opponentCanvas.height / (ROWS * TILE_SIZE);
    if (oppScale !== 1) opponentCtx.scale(oppScale, oppScale);

    let maxCamX = (COLS * TILE_SIZE) - opponentCanvas.width / oppScale;
    if (opponentCamera.x < 0) opponentCamera.x = 0;
    if (opponentCamera.x > maxCamX) opponentCamera.x = maxCamX;

    opponentCtx.translate(-opponentCamera.x, 0);

    drawMap(opponentCtx, myMap, opponentCamera.x, opponentCanvas.width / oppScale);
    updateAndDrawSmoke(opponentCtx, true);
    updateAndDrawExplosions(opponentCtx, true);
    updateAndDrawParticles(opponentCtx, true);
    drawPlayer(opponentCtx, opponent, false);

    opponentCtx.restore();
}

function fillRoundedRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
        ctx.fill();
        return;
    }

    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

function drawPlayer(ctx, p, isMe) {
    ctx.save();

    // --- IŞINLANMA EFEKTİ (DÖNÜŞÜM) ---
    if (p.isTeleporting) {
        let cx = p.x + p.width / 2;
        let cy = p.y + p.height / 2;

        ctx.translate(cx, cy);
        ctx.rotate(p.teleportAngle);
        ctx.scale(p.teleportScale, p.teleportScale);
        ctx.globalAlpha = p.teleportAlpha;
        ctx.translate(-cx, -cy);
    }

    let drawX = p.x;
    let drawY = p.y;
    let drawW = p.width;
    let drawH = p.height;

    if (isMe) {
        let stretch = 1.0 + Math.abs(p.vy) * 0.05; 
        
        drawW = p.width / stretch;
        drawH = p.height * stretch;

        drawX = p.x + (p.width - drawW) / 2;
        drawY = p.y + (p.height - drawH);
    }

    if (p.frozen) {
        ctx.fillStyle = '#00a8ff';
    } else {
        if (isMe) {
            ctx.fillStyle = myColor;
        } else {
            const oppId = Object.keys(playerColors).find(id => id !== socket.id);
            ctx.fillStyle = playerColors[oppId] || '#f1c40f';
        }
    }

    ctx.shadowBlur = 5 * SHADOW_BLUR;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    
    let r = 5; 
    fillRoundedRect(ctx, drawX, drawY, drawW, drawH, r);
    ctx.shadowBlur = 0; 

    let eyeYOffset = drawH * 0.3;
    
    ctx.fillStyle = 'white';
    ctx.beginPath(); 
    ctx.arc(drawX + drawW*0.25, drawY + eyeYOffset, 4, 0, Math.PI * 2); 
    ctx.arc(drawX + drawW*0.75, drawY + eyeYOffset, 4, 0, Math.PI * 2); 
    ctx.fill();
    
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(drawX + drawW*0.25, drawY + eyeYOffset, 1.5, 0, Math.PI * 2); 
    ctx.arc(drawX + drawW*0.75, drawY + eyeYOffset, 1.5, 0, Math.PI * 2); 
    ctx.fill();

    let hatToDraw = 0;
    if (isMe) {
        hatToDraw = myHat;
    } else {
        const oppId = Object.keys(playerHats).find(id => id !== socket.id);
        if (oppId) {
            hatToDraw = playerHats[oppId];
        }
    }
    drawHat(ctx, drawX, drawY, drawW, hatToDraw);

    if (p.activeEmoji && p.emojiTimer > 0) {
        ctx.font = "30px 'Segoe UI Emoji'";
        ctx.textAlign = "center";

        if (p.emojiTimer < 20) ctx.globalAlpha = p.emojiTimer / 20;

        ctx.fillText(p.activeEmoji, drawX + drawW / 2, drawY - 10 + p.emojiY);

        p.emojiY -= 0.5;
        p.emojiTimer--;

        ctx.globalAlpha = 1.0;
    }

    // --- KALKAN EFEKTİ (YENİ) ---
    if (p.hasShield) {
        ctx.save();
        ctx.strokeStyle = "#3498db"; // Mavi neon
        ctx.lineWidth = 3;
        ctx.shadowColor = "#3498db";
        ctx.shadowBlur = 15 * SHADOW_BLUR;
        
        ctx.beginPath();
        // Karakterin etrafına daire çiz
        ctx.arc(drawX + drawW/2, drawY + drawH/2, 25, 0, Math.PI * 2); 
        ctx.stroke();
        
        // Dönen küçük bir parıltı
        let time = Date.now() / 200;
        let orbitX = (drawX + drawW/2) + Math.cos(time) * 25;
        let orbitY = (drawY + drawH/2) + Math.sin(time) * 25;
        
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(orbitX, orbitY, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    // --- HIZ EFEKTİ (YENİ) ---
    let isSpeeding = false;
    if (isMe && p.speedMultiplier > 1.1) isSpeeding = true;
    if (!isMe && p.isFast) isSpeeding = true;

    if (isSpeeding && Math.random() > 0.5) {
        // YENİ SİSTEM: Havuzdan çağırıyoruz
        spawnParticle(
            drawX + drawW / 2, 
            drawY + drawH / 2, 
            -p.vx || (Math.random() - 0.5) * 5, 
            (Math.random() - 0.5) * 2, 
            0.5, 
            'rgba(255, 255, 255, 0.5)', 
            3,
            !isMe // Eğer rakibiysek isOpponent = true olur
        );
    }

    // --- HIZ SÜRESİ BAR'I (YENİ) ---
    if (isMe && typeof speedBoostEndTime === 'number' && typeof speedBoostDuration === 'number') {
        const now = Date.now();
        if (speedBoostEndTime > now && speedBoostDuration > 0) {
            const ratio = Math.max(0, (speedBoostEndTime - now) / speedBoostDuration);
            const barWidth = 44;
            const barHeight = 8;
            const barX = drawX + drawW / 2 - barWidth / 2;
            const barY = drawY - barHeight - 14;

            ctx.save();
            ctx.fillStyle = 'rgba(15, 21, 37, 0.75)';
            fillRoundedRect(ctx, barX, barY, barWidth, barHeight, 4);

            const innerWidth = Math.max(2, Math.floor((barWidth - 2) * ratio));
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(barX + 1, barY + 1, innerWidth, barHeight - 2);

            ctx.strokeStyle = 'rgba(241, 196, 15, 0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
            ctx.restore();
        }
    }

    // --- ZIPLAMA HAKKI GÖSTERGESİ (YENİ) ---
    // Sadece kendimizsek veya rakibi çiziyorsak gösterelim
    // Kalan hak: (Toplam Hak - Kullanılan Hak)
    let remainingJumps = p.maxJumps - p.jumpCount;

    // Eğer havadaysa (grounded değilse) ve hakkı varsa göster
    if (!p.grounded && remainingJumps > 0) {
        const indicatorGap = 10; // Noktalar arası boşluk
        const startX = drawX + drawW + 5; // Karakterin sağ tarafında
        const startY = drawY + 10;

        for (let i = 0; i < remainingJumps; i++) {
            ctx.save();
            ctx.translate(startX + (i * indicatorGap), startY);
            
            // Küçük bir kanat/tüy ikonu çizelim
            ctx.fillStyle = "#f1c40f"; // Altın rengi
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1;
            
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(5, -5, 10, 0); // Üst kavis
            ctx.quadraticCurveTo(5, 5, 0, 0);   // Alt kavis
            ctx.fill();
            ctx.stroke();
            
            ctx.restore();
        }
    }

    ctx.restore();
}

function drawMap(ctx, mapData, camX, viewWidth) {
    // --- VIEWPORT CULLING: Sadece görünen sütunları çiz ---
    let startCol = 0, endCol = COLS;
    if (camX !== undefined && viewWidth !== undefined) {
        startCol = Math.max(0, Math.floor(camX / TILE_SIZE) - 1);
        endCol = Math.min(COLS, Math.ceil((camX + viewWidth) / TILE_SIZE) + 1);
    }
    for (let r = 0; r < ROWS; r++) {
        for (let c = startCol; c < endCol; c++) {
            drawTile(ctx, mapData[r][c], c * TILE_SIZE, r * TILE_SIZE, r, c, mapData);
        }
    }
}

function drawTile(ctx, type, x, y, r, c, mapData) {
    if (type === 0) return; 

    ctx.save();

    if (type === 9) {
        if (screens.race.classList.contains('active')) {
            type = 1;
        } else {
            ctx.globalAlpha = 0.5;
            type = 1;
        }
    }

    if (type === 1) { 
        const t = THEME_COLORS[currentTheme];

        let isUnderground = false;
        if (mapData && r > 0 && mapData[r-1] && mapData[r-1][c] === 1) {
            isUnderground = true;
        }

        if (isUnderground) {
            ctx.fillStyle = t.ground;
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            
            ctx.fillStyle = t.stone;
            ctx.fillRect(x + 8, y + 8, 6, 6);
            ctx.fillRect(x + 28, y + 20, 5, 5);
            
        } else {
            ctx.fillStyle = t.ground; 
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            
            ctx.fillStyle = t.grass; 
            ctx.fillRect(x, y, TILE_SIZE, 12); 
            
            ctx.fillRect(x + 4, y + 12, 4, 4);
            ctx.fillRect(x + 12, y + 12, 6, 5);
            ctx.fillRect(x + 24, y + 12, 4, 3);
            ctx.fillRect(x + 32, y + 12, 5, 6);
        }

        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

    } else if (type === 2) { 
        // --- HOLOGRAFİK BAŞLANGIÇ KAPISI ---
        
        // 1. Yan Direkler
        ctx.fillStyle = "#2c3e50"; // Koyu gri metal
        ctx.fillRect(x + 2, y + 5, 6, TILE_SIZE - 5); // Sol direk
        ctx.fillRect(x + TILE_SIZE - 8, y + 5, 6, TILE_SIZE - 5); // Sağ direk
        
        // 2. Hologram Alanı (Yarı saydam yeşil)
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#2ecc71";
        ctx.fillRect(x + 8, y + 5, TILE_SIZE - 16, TILE_SIZE - 5);
        ctx.restore();

        // 3. Kayan Lazer Efekti (Animasyon)
        let time = Date.now() / 10;
        let scanY = y + TILE_SIZE - 5 - (time % (TILE_SIZE - 10));
        
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#00ff00";
        ctx.shadowBlur = 10 * SHADOW_BLUR;
        
        ctx.beginPath();
        ctx.moveTo(x + 8, scanY);
        ctx.lineTo(x + TILE_SIZE - 8, scanY);
        ctx.stroke();
        
        // 4. "GO" Yazısı
        ctx.shadowBlur = 0;
        ctx.fillStyle = "white";
        ctx.font = "900 16px 'Orbitron'";
        ctx.textAlign = "center";
        ctx.fillText("GO", x + TILE_SIZE/2, y + TILE_SIZE/2 + 6);

    } else if (type === 3) { 
        // --- DAMALI BİTİŞ KEMERİ ---
        
        // 1. Yan Direkler (Sarı)
        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(x, y, 5, TILE_SIZE); // Sol
        ctx.fillRect(x + TILE_SIZE - 5, y, 5, TILE_SIZE); // Sağ
        
        // 2. Üst Kemer (Damalı Desen)
        let checkSize = 5;
        for(let i=0; i<8; i++) { // Üstte 8 karelik damalı şerit
            let cx = x + (i * checkSize);
            ctx.fillStyle = (i % 2 === 0) ? "black" : "white";
            ctx.fillRect(cx, y, checkSize, 10);
            
            ctx.fillStyle = (i % 2 !== 0) ? "black" : "white";
            ctx.fillRect(cx, y + 5, checkSize, 5);
        }

        // 3. Sallanan Bayrak (Basit Sinüs Dalgası)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 10);
        
        let wave = Math.sin(Date.now() / 200) * 5; 
        
        ctx.fillStyle = "rgba(231, 76, 60, 0.6)";
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 10);
        ctx.lineTo(x + TILE_SIZE - 5, y + 10);
        ctx.lineTo(x + TILE_SIZE - 5, y + TILE_SIZE);
        ctx.quadraticCurveTo(x + TILE_SIZE/2, y + TILE_SIZE - wave, x + 5, y + TILE_SIZE);
        ctx.fill();
        ctx.restore();

    } else if (type === 4) { 
        // --- KARA DELİK PORTALI (RESET) ---
        
        let centerX = x + TILE_SIZE/2;
        let centerY = y + TILE_SIZE/2;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        
        // Kendi ekseni etrafında dönme
        let angle = Date.now() / 300;
        ctx.rotate(angle);
        
        // 1. Dış Halka (Mor Neon)
        ctx.shadowBlur = 15 * SHADOW_BLUR;
        ctx.shadowColor = "#8e44ad";
        ctx.strokeStyle = "#9b59b6";
        ctx.lineWidth = 3;
        
        // Spiral Kollar
        for(let i=0; i<4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(5, 5);
            ctx.quadraticCurveTo(15, 0, 18, 18);
            ctx.stroke();
        }
        
        // 2. Merkez (Karanlık)
        ctx.shadowBlur = 20 * SHADOW_BLUR;
        ctx.shadowColor = "black";
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // 3. İçindeki Kırmızı Göz (Tehlike hissi)
        ctx.shadowBlur = 5 * SHADOW_BLUR;
        ctx.shadowColor = "red";
        ctx.fillStyle = "red";
        ctx.beginPath();
        let scale = 1 + Math.sin(Date.now() / 200) * 0.2;
        ctx.arc(0, 0, 3 * scale, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();

    } else if (type === 5) { 
        // Dondurma - buzlu parıltı efekti
        const pulse = 0.5 + 0.15 * Math.sin(Date.now() / 400);
        ctx.fillStyle = '#81ecec'; ctx.globalAlpha = pulse; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.globalAlpha = 1.0; 
        // Kar kristali deseni
        ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
        const cx = x + TILE_SIZE / 2;
        const cy = y + TILE_SIZE / 2;
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
            ctx.lineTo(cx - Math.cos(a) * 14, cy - Math.sin(a) * 14);
            ctx.stroke();
        }
        ctx.strokeStyle = '#00cec9'; ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

    } else if (type === 10) {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.ellipse(x + TILE_SIZE/2, y + TILE_SIZE, 12, 6, 0, Math.PI, 0);
        ctx.fill();

        if (Math.floor(Date.now() / 200) % 2 === 0) {
            ctx.fillStyle = 'red';
            ctx.shadowBlur = 10 * SHADOW_BLUR;
            ctx.shadowColor = 'red';
        } else {
            ctx.fillStyle = '#500';
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

    } else if (type === 6) { 
        // Diken - Çoklu sivri uç
        if (isMobileDevice) {
            ctx.fillStyle = '#7f8a8e';
        } else {
            let grad = ctx.createLinearGradient(x, y, x + TILE_SIZE, y + TILE_SIZE);
            grad.addColorStop(0, '#95a5a6'); grad.addColorStop(1, '#2c3e50');
            ctx.fillStyle = grad;
        }
        // 3 sivri uç
        ctx.beginPath();
        ctx.moveTo(x + 2, y + TILE_SIZE);
        ctx.lineTo(x + 8, y + 8);
        ctx.lineTo(x + 14, y + TILE_SIZE);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 12, y + TILE_SIZE);
        ctx.lineTo(x + TILE_SIZE/2, y + 3);
        ctx.lineTo(x + TILE_SIZE - 12, y + TILE_SIZE);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + TILE_SIZE - 14, y + TILE_SIZE);
        ctx.lineTo(x + TILE_SIZE - 8, y + 8);
        ctx.lineTo(x + TILE_SIZE - 2, y + TILE_SIZE);
        ctx.fill();
        // Kırmızı uç noktaları
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(x + 8, y + 10, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + TILE_SIZE/2, y + 5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + TILE_SIZE - 8, y + 10, 2, 0, Math.PI * 2); ctx.fill();
    } else if (type === 7) { 
        // Testere - geliştirilmiş dişli çark
        const cx = x + TILE_SIZE/2;
        const cy = y + TILE_SIZE/2;
        const R = 12;
        const teeth = 8;
        const angle = (Date.now() / 200) % (Math.PI * 2);
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        
        // Dişli çember
        ctx.fillStyle = '#95a5a6';
        ctx.beginPath();
        for (let i = 0; i < teeth; i++) {
            const a1 = (i / teeth) * Math.PI * 2;
            const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
            ctx.lineTo(Math.cos(a1) * (R + 4), Math.sin(a1) * (R + 4));
            ctx.lineTo(Math.cos(a2) * (R - 2), Math.sin(a2) * (R - 2));
        }
        ctx.closePath();
        ctx.fill();
        
        // İç disk
        ctx.fillStyle = '#7f8c8d';
        ctx.beginPath(); ctx.arc(0, 0, R - 3, 0, Math.PI * 2); ctx.fill();
        
        // Merkez
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        
        ctx.restore();
    } else if (type === 8) { 
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(x + 5, y + 25, 5, 15);
        ctx.fillRect(x + 30, y + 25, 5, 15);
        
        ctx.fillStyle = '#e67e22';
        ctx.beginPath();
        ctx.ellipse(x + 20, y + 25, 18, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#bdc3c7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 25);
        ctx.lineTo(x + 38, y + 25);
        ctx.stroke();
    } else if (type === 11) {
        // --- KONVEYÖR BANT ---
        ctx.fillStyle = '#34495e';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        
        // Bant çizgileri (animasyonlu)
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 2;
        const offset = (Date.now() / 100) % 20;
        for (let i = -1; i < 4; i++) {
            const lx = x + i * 15 + offset;
            if (lx >= x && lx <= x + TILE_SIZE) {
                ctx.beginPath();
                ctx.moveTo(lx, y + 10);
                ctx.lineTo(lx + 8, y + 10);
                ctx.moveTo(lx, y + 20);
                ctx.lineTo(lx + 8, y + 20);
                ctx.moveTo(lx, y + 30);
                ctx.lineTo(lx + 8, y + 30);
                ctx.stroke();
            }
        }
        // Ok işareti
        ctx.fillStyle = '#f39c12';
        ctx.beginPath();
        ctx.moveTo(x + TILE_SIZE - 10, y + TILE_SIZE/2 - 5);
        ctx.lineTo(x + TILE_SIZE - 3, y + TILE_SIZE/2);
        ctx.lineTo(x + TILE_SIZE - 10, y + TILE_SIZE/2 + 5);
        ctx.fill();

    } else if (type === 12) {
        // --- KAYBOLAN BLOK ---
        const blink = Math.sin(Date.now() / 300) * 0.3 + 0.7;
        ctx.globalAlpha = blink;
        ctx.fillStyle = '#8e44ad';
        ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        
        // Çatlak deseni
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 5);
        ctx.lineTo(x + 20, y + 20);
        ctx.lineTo(x + 35, y + 10);
        ctx.moveTo(x + 15, y + 30);
        ctx.lineTo(x + 30, y + 35);
        ctx.stroke();
        
        ctx.globalAlpha = 1.0;
        
        // Soru işareti
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = "bold 16px 'Orbitron'";
        ctx.textAlign = "center";
        ctx.fillText("?", x + TILE_SIZE/2, y + TILE_SIZE/2 + 5);
    }

    ctx.restore();
}

function drawPowerup(ctx) {
    ctx.save();
    let x = powerUp.x; let y = powerUp.y;
    ctx.shadowBlur = 20 * SHADOW_BLUR; ctx.shadowColor = '#00ffff'; ctx.fillStyle = '#00cec9'; ctx.fillRect(x, y, powerUp.width, powerUp.height);
    ctx.shadowBlur = 0; ctx.fillStyle = 'white'; ctx.font = "900 24px 'Orbitron'"; ctx.fillText("?", x + 6, y + 28);
    ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.strokeRect(x, y, powerUp.width, powerUp.height);
    ctx.restore();
}

// Tüm Dumanları Çizen Tek Fonksiyon
function updateAndDrawSmoke(ctx, isOpponentScreen = false) {
    for (let i = 0; i < MAX_SMOKE; i++) {
        let p = smokePool[i];
        if (p.active && p.isOpponent === isOpponentScreen) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;

            p.x += p.vx;
            p.y += p.vy;
            p.size += 0.2; // Duman havada yavaşça büyür
            p.life -= 0.02;

            if (p.life <= 0) p.active = false; // Silme, havuza at
        }
    }
}

// Tüm Patlamaları (Halkaları) Çizen Tek Fonksiyon
function updateAndDrawExplosions(ctx, isOpponentScreen = false) {
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
        let p = explosionPool[i];
        if (p.active && p.isOpponent === isOpponentScreen) {
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.lineWidth = 4 * (p.life / p.maxLife);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1.0;

            p.radius += (p.maxRadius - p.radius) * 0.2; // Hızlıca genişler
            p.life -= 0.05;

            if (p.life <= 0) p.active = false;
        }
    }
}

// --- YENİ TOZ EFEKTİ (Havuz Sistemine Uyumlu) ---
function createDust(x, y, isOpponentScreen = false) {
    const dustCount = isMobileDevice ? 3 : 5;
    for (let i = 0; i < dustCount; i++) {
        // Yeni sistemle havuzdan (pool) toz parçacığı çağırıyoruz
        spawnParticle(
            x + (Math.random() - 0.5) * 20, // Tozun x konumu (hafif dağınık)
            y + 10 + (Math.random() - 0.5) * 5, // Tozun y konumu (ayak hizası)
            (Math.random() - 0.5) * 2, // X ekseninde rastgele yayılma
            Math.random() * -2 - 1,    // Y ekseninde (yukarı doğru) hafif kalkış
            0.5,                       // Ömür (0.5 saniye)
            'rgba(200, 200, 200, 0.5)', // Toz Rengi (Yarı saydam gri)
            Math.random() * 3 + 2,     // Toz boyutu
            isOpponentScreen           // Hangi ekranda çizileceği
        );
    }
}

// Hem kendi ekranımız hem de rakip ekranı için çalışan tek fonksiyon
function updateAndDrawParticles(ctx, isOpponentScreen = false) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
        let p = particlePool[i];
        
        // Sadece aktif olanları ve doğru ekrana ait olanları çiz
        if (p.active && p.isOpponent === isOpponentScreen) {
            // Çizim
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;

            // Güncelleme (Hareket)
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02; // Ömrü azalt

            // Ömrü bittiyse silme, sadece pasife al (havuza geri gönder)
            if (p.life <= 0) {
                p.active = false;
            }
        }
    }
}

function initBackground() {
    clouds = [];
    // Mobilde daha az bulut (4 vs 8)
    const cloudCount = isMobileDevice ? 4 : 8;
    for(let i=0; i<cloudCount; i++) {
        clouds.push({
            x: Math.random() * 2000,
            y: Math.random() * 300,
            size: 30 + Math.random() * 50,
            speed: 0.2 + Math.random() * 0.3
        });
    }
}

function drawProBackground(ctx, width, height, skipCloudUpdate) {
    if (lastThemeForCache !== currentTheme || bgCacheCanvas.width !== width || bgCacheCanvas.height !== height) {
        isBgCached = false;
        bgCacheCanvas.width = width;
        bgCacheCanvas.height = height;
        lastThemeForCache = currentTheme;
    }

    if (!isBgCached) {
        let skyGrad = bgCacheCtx.createLinearGradient(0, 0, 0, height);
        
        if (currentTheme === 'ICE') {
            skyGrad.addColorStop(0, "#2980b9");
            skyGrad.addColorStop(1, "#6dd5fa");
        } else if (currentTheme === 'FIRE') {
            skyGrad.addColorStop(0, "#2c3e50");
            skyGrad.addColorStop(1, "#e74c3c");
        } else {
            skyGrad.addColorStop(0, "#4facfe");
            skyGrad.addColorStop(1, "#00f2fe");
        }
        
        bgCacheCtx.fillStyle = skyGrad;
        bgCacheCtx.fillRect(0, 0, width, height);

        bgCacheCtx.save();
        bgCacheCtx.shadowBlur = 50;
        bgCacheCtx.shadowColor = "white";
        bgCacheCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
        bgCacheCtx.beginPath();
        bgCacheCtx.arc(width - 100, 80, 40, 0, Math.PI * 2);
        bgCacheCtx.fill();
        bgCacheCtx.restore();

        drawMountains(bgCacheCtx, width, height, 150, "#ecf0f1", 0.3);

        let mountainColor = "#bdc3c7";
        if(currentTheme === 'ICE') mountainColor = "#a2d9ff";
        if(currentTheme === 'FIRE') mountainColor = "#5a3a3a";
        
        drawMountains(bgCacheCtx, width, height, 50, mountainColor, 0.8);
        
        isBgCached = true;
    }

    ctx.drawImage(bgCacheCanvas, 0, 0);

    // Bulutları sadece ana ekranda güncelle (rakip ekranında tekrar güncelleme = 2x hız bugı)
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath(); // Tek bir path'e tüm bulutları topla
    clouds.forEach(cloud => {
        if (!skipCloudUpdate) {
            cloud.x += cloud.speed;
            if (cloud.x > width + 100) cloud.x = -100;
        }

        ctx.moveTo(cloud.x + cloud.size, cloud.y);
        ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
        ctx.moveTo(cloud.x + cloud.size * 0.5 + cloud.size * 0.8, cloud.y - cloud.size * 0.3);
        ctx.arc(cloud.x + cloud.size * 0.5, cloud.y - cloud.size * 0.3, cloud.size * 0.8, 0, Math.PI * 2);
        ctx.moveTo(cloud.x + cloud.size + cloud.size * 0.6, cloud.y);
        ctx.arc(cloud.x + cloud.size, cloud.y, cloud.size * 0.6, 0, Math.PI * 2);
    });
    ctx.fill(); // Tek seferde tüm bulutları boya
}

function drawMountains(ctx, width, height, offset, color, alpha) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    for (let x = 0; x <= width; x += 20) {
        let noise = Math.sin(x * 0.01) * 50 + Math.sin(x * 0.03) * 20;
        let y = height - offset - Math.abs(noise) - 100;
        
        ctx.lineTo(x, y);
    }
    
    ctx.lineTo(width, height);
    ctx.fill();
    ctx.restore();
}

function drawMapBorders(ctx) {
    const mapWidth = COLS * TILE_SIZE;
    const mapHeight = ROWS * TILE_SIZE;

    ctx.save();

    ctx.lineWidth = 6;
    ctx.strokeStyle = "#f1c40f";
    ctx.setLineDash([20, 10]);
    
    ctx.shadowColor = "black";
    ctx.shadowBlur = 10 * SHADOW_BLUR;

    ctx.strokeRect(0, 0, mapWidth, mapHeight);

    ctx.fillStyle = "#e74c3c";
    ctx.shadowBlur = 0;
    
    const cornerSize = 15;
    ctx.fillRect(-cornerSize/2, -cornerSize/2, cornerSize, cornerSize);
    ctx.fillRect(mapWidth - cornerSize/2, -cornerSize/2, cornerSize, cornerSize);
    ctx.fillRect(-cornerSize/2, mapHeight - cornerSize/2, cornerSize, cornerSize);
    ctx.fillRect(mapWidth - cornerSize/2, mapHeight - cornerSize/2, cornerSize, cornerSize);

    ctx.restore();
}

function launchFireworks() {
    for(let i=0; i<6; i++) {
        setTimeout(() => {
            let x = camera.x + Math.random() * raceCanvas.width;
            let y = Math.random() * (raceCanvas.height / 2);
            createFireworkExplosion(x, y);
        }, i * 300);
    }
}

function createFireworkExplosion(x, y) {
    const colors = ['#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6', '#3498db', '#ffffff'];
    const count = isMobileDevice ? 20 : 50;
    for (let i = 0; i < count; i++) {
        fireworks.push({
            x: x, 
            y: y,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 15,
            life: 1.5,
            color: colors[Math.floor(Math.random() * colors.length)],
            gravity: 0.2
        });
    }
}

function updateAndDrawFireworks(ctx) {
    let writeIdx = 0;
    for (let i = 0; i < fireworks.length; i++) {
        let p = fireworks[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.life -= 0.02;

        if (p.life > 0) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
            fireworks[writeIdx++] = p; // canlıları başa topla
        }
    }
    fireworks.length = writeIdx; // ölüleri toplu sil (splice yok)
}

function updateAndDrawLobbyRunner() {
    if (!lobbyRunner.active) {
        lobbyRunner.waitTimer--;
        if (lobbyRunner.waitTimer <= 0) {
            const colors = ['#ff4757', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6'];
            lobbyRunner.color = colors[Math.floor(Math.random() * colors.length)];
            
            lobbyRunner.active = true;
            lobbyRunner.x = lobbyCamX - 100;
            lobbyRunner.y = 0; 
            lobbyRunner.vy = 0;
            lobbyRunner.waitTimer = Math.random() * 150 + 50;
        }
        return; 
    }

    lobbyRunner.vy += 0.8; 
    
    lobbyRunner.x += lobbyRunner.speed;
    lobbyRunner.y += lobbyRunner.vy;

    let col = Math.floor((lobbyRunner.x + lobbyRunner.width / 2) / TILE_SIZE);
    let groundY = window.innerHeight + 500;
    let isGrounded = false;

    if (col >= 0 && col < dummyMap[0].length) {
        for (let r = 0; r < ROWS; r++) {
            if (dummyMap[r][col] !== 0) {
                groundY = r * TILE_SIZE;
                break;
            }
        }
    }

    if (lobbyRunner.y + lobbyRunner.height >= groundY) {
        lobbyRunner.y = groundY - lobbyRunner.height;
        lobbyRunner.vy = 0;
        isGrounded = true;
    }

    if (isGrounded) {
        let lookAheadCol = col + 2;
        let obstacleDetected = false;

        if (lookAheadCol < dummyMap[0].length) {
            for (let r = 0; r < ROWS; r++) {
                if (dummyMap[r][lookAheadCol] !== 0) {
                    let obstacleY = r * TILE_SIZE;
                    if (obstacleY < groundY) {
                        obstacleDetected = true;
                    }
                    break;
                }
            }
        }

        if (obstacleDetected || Math.random() < 0.02) {
            lobbyRunner.vy = -16;
        }
    }

    lobbyCtx.fillStyle = lobbyRunner.color;
    lobbyCtx.shadowColor = 'black';
    lobbyCtx.shadowBlur = isGrounded ? 10 : 20; 
    
    lobbyCtx.fillRect(lobbyRunner.x, lobbyRunner.y, lobbyRunner.width, lobbyRunner.height);
    lobbyCtx.shadowBlur = 0;

    lobbyCtx.fillStyle = "white";
    lobbyCtx.fillRect(lobbyRunner.x + 18, lobbyRunner.y + 6, 6, 6); 
    
    if (lobbyRunner.x > lobbyCamX + window.innerWidth + 200 || lobbyRunner.y > window.innerHeight + 100) {
        lobbyRunner.active = false;
    }
}

function drawPreview() {
    if (!previewCtx || !previewCanvas) return;
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    const size = 120;
    const x = (previewCanvas.width - size) / 2;
    const baseY = (previewCanvas.height - size) / 2 + 20;
    const y = baseY + previewState.breathVal;

    previewCtx.save();
    previewCtx.fillStyle = myColor;
    previewCtx.shadowColor = "rgba(0,0,0,0.5)";
    previewCtx.shadowBlur = 20;
    previewCtx.shadowOffsetY = 10;

    fillRoundedRect(previewCtx, x, y, size, size, 15);
    previewCtx.shadowBlur = 0;

    const eyeLeftX = x + size * 0.3;
    const eyeRightX = x + size * 0.7;
    const eyeY = y + size * 0.35;
    const eyeSize = 18;

    if (previewState.isBlinking) {
        previewCtx.lineWidth = 4;
        previewCtx.strokeStyle = "rgba(0,0,0,0.6)";
        previewCtx.beginPath();
        previewCtx.moveTo(eyeLeftX - 10, eyeY);
        previewCtx.lineTo(eyeLeftX + 10, eyeY);
        previewCtx.stroke();

        previewCtx.beginPath();
        previewCtx.moveTo(eyeRightX - 10, eyeY);
        previewCtx.lineTo(eyeRightX + 10, eyeY);
        previewCtx.stroke();
    } else {
        previewCtx.fillStyle = "white";
        previewCtx.beginPath();
        previewCtx.arc(eyeLeftX, eyeY, eyeSize, 0, Math.PI * 2);
        previewCtx.arc(eyeRightX, eyeY, eyeSize, 0, Math.PI * 2);
        previewCtx.fill();

        let dx = previewState.mouseX - (previewCanvas.width / 2);
        let dy = previewState.mouseY - (previewCanvas.height / 2);
        let dist = Math.sqrt(dx*dx + dy*dy);
        let maxDist = 6;
        let moveX = dist > 0 ? (dx / dist) * Math.min(dist, maxDist) : 0;
        let moveY = dist > 0 ? (dy / dist) * Math.min(dist, maxDist) : 0;

        previewCtx.fillStyle = "black";
        previewCtx.beginPath();
        previewCtx.arc(eyeLeftX + moveX, eyeY + moveY, 7, 0, Math.PI * 2);
        previewCtx.arc(eyeRightX + moveX, eyeY + moveY, 7, 0, Math.PI * 2);
        previewCtx.fill();

        previewCtx.fillStyle = "white";
        previewCtx.beginPath();
        previewCtx.arc(eyeLeftX + moveX + 2, eyeY + moveY - 2, 2.5, 0, Math.PI * 2);
        previewCtx.arc(eyeRightX + moveX + 2, eyeY + moveY - 2, 2.5, 0, Math.PI * 2);
        previewCtx.fill();
    }

    previewCtx.restore();

    drawHat(previewCtx, x, y, size, previewHatId);

    const reqLevel = unlockRequirements.hats[previewHatId] || 0;
    if (playerStats.level < reqLevel && previewHatId !== 0) {
        previewCtx.save();
        previewCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
        previewCtx.fillRect(0, previewCanvas.height - 60, previewCanvas.width, 60);

        previewCtx.fillStyle = "#e74c3c";
        previewCtx.font = "bold 24px Arial";
        previewCtx.textAlign = "center";
        previewCtx.fillText(`🔒 SEVIYE ${reqLevel} GEREKLI`, previewCanvas.width / 2, previewCanvas.height - 22);
        previewCtx.restore();
    }
}

function drawHat(ctx, x, y, size, hatId) {
    if (!hatId || hatId === 0) return;

    ctx.save();
    
    // x, y: Karakterin sol ust kosesi
    // size: Karakterin genisligi
    if (hatId === 1) {
        // DETAYLI ALTIN KRAL TACI (Referans Gorsel)

        // Renk ve golgelendirme
        let goldGradient = ctx.createLinearGradient(x, y, x + size, y);
        goldGradient.addColorStop(0, "#e6b800");
        goldGradient.addColorStop(0.3, "#c69300");
        goldGradient.addColorStop(0.5, "#e6b800");
        goldGradient.addColorStop(0.7, "#c69300");
        goldGradient.addColorStop(1, "#e6b800");

        const darkGoldColor = "#8a6d3b";
        ctx.lineWidth = size * 0.025;
        ctx.lineJoin = "round";

        // Geometri hesabi
        let baseHeight = size * 0.18;
        let spikeHeight = size * 0.35;

        let hatBaseY = y - size * 0.05;
        let baseTopY = hatBaseY - baseHeight;
        let spikeTopY = baseTopY - spikeHeight;

        // 1. Tacin ana govdesi (Taban + uclar)
        ctx.fillStyle = goldGradient;
        ctx.strokeStyle = darkGoldColor;

        ctx.beginPath();
        // Sol alt kose
        ctx.moveTo(x, hatBaseY);

        // Alt taban kavisli cizgisi
        ctx.quadraticCurveTo(x + size / 2, hatBaseY + (size * 0.04), x + size, hatBaseY);

        // Sag kenar yukari
        ctx.lineTo(x + size, baseTopY);

        // Sivri uclar ve aradaki egriler
        // Sag uc
        ctx.quadraticCurveTo(x + size * 0.95, spikeTopY + (spikeHeight * 0.3), x + size * 0.92, spikeTopY);
        // Aradaki cukur 1
        ctx.quadraticCurveTo(x + size * 0.8, baseTopY, x + size * 0.68, spikeTopY);
        // Aradaki cukur 2
        ctx.quadraticCurveTo(x + size * 0.55, baseTopY, x + size * 0.42, spikeTopY);
        // Aradaki cukur 3 (Sol uc oncesi)
        ctx.quadraticCurveTo(x + size * 0.3, baseTopY, x + size * 0.15, spikeTopY);
        // Sol uc kenari
        ctx.quadraticCurveTo(x + size * 0.1, spikeTopY + (spikeHeight * 0.3), x, baseTopY);

        // Sol kenar asagi
        ctx.lineTo(x, hatBaseY);

        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 2. Alt taban detay cizgisi
        ctx.beginPath();
        ctx.moveTo(x, baseTopY + baseHeight * 0.35);
        ctx.quadraticCurveTo(
            x + size / 2,
            baseTopY + baseHeight * 0.35 + (size * 0.03),
            x + size,
            baseTopY + baseHeight * 0.35
        );
        ctx.lineWidth = size * 0.015;
        ctx.stroke();

        // 3. Altin topuzlar (Uclardaki yuvarlaklar)
        const topuzPositions = [
            { x: x + size * 0.15, y: spikeTopY },
            { x: x + size * 0.42, y: spikeTopY },
            { x: x + size * 0.68, y: spikeTopY },
            { x: x + size * 0.92, y: spikeTopY }
        ];

        let topuzGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.06);
        topuzGradient.addColorStop(0, "#fff0b3");
        topuzGradient.addColorStop(0.6, "#e6b800");
        topuzGradient.addColorStop(1, "#c69300");

        topuzPositions.forEach((pos) => {
            ctx.save();
            ctx.translate(pos.x, pos.y);

            ctx.fillStyle = topuzGradient;

            ctx.beginPath();
            ctx.arc(0, 0, size * 0.055, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        });

    } else if (hatId === 2) {
        // KULAKLIK (Ayni kaliyor - begenmistik)
        ctx.fillStyle = "#2c3e50";
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size * 0.6, Math.PI, 0);
        ctx.lineWidth = size * 0.15;
        ctx.strokeStyle = "#2c3e50";
        ctx.stroke();

        ctx.fillStyle = "#00d2d3"; // Neon Mavi
        ctx.fillRect(x - (size * 0.1), y + (size * 0.3), size * 0.2, size * 0.4);
        ctx.fillRect(x + size - (size * 0.1), y + (size * 0.3), size * 0.2, size * 0.4);

    } else if (hatId === 3) {
        // SAPKA (Ayni kaliyor - begenmistik)
        ctx.fillStyle = "#e74c3c";
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size * 0.1, size * 0.52, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#c0392b";
        ctx.fillRect(x + size * 0.1, y - size * 0.1, size * 1.0, size * 0.15);

    } else if (hatId === 4) {
        // VIKING MIGFERI (Kaska entegre boynuzlar)

        const helmetColor = "#7f8c8d";
        const helmetShade = "#5d6d6f";
        const hornColor = "#ecf0f1";
        const hornBaseColor = "#95a5a6";

        const helmetTopY = y - size * 0.25;
        const helmetBaseY = y + size * 0.23;

        // Kask govdesi
        ctx.fillStyle = helmetColor;
        ctx.strokeStyle = helmetShade;
        ctx.lineWidth = size * 0.03;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.08, helmetBaseY);
        ctx.quadraticCurveTo(x + size * 0.5, helmetTopY, x + size * 0.92, helmetBaseY);
        ctx.lineTo(x + size * 0.92, y + size * 0.24);
        ctx.quadraticCurveTo(x + size * 0.5, y + size * 0.32, x + size * 0.08, y + size * 0.24);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Kask ortasi metal bant
        ctx.strokeStyle = helmetShade;
        ctx.lineWidth = size * 0.02;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.5, helmetTopY + size * 0.02);
        ctx.lineTo(x + size * 0.5, y + size * 0.28);
        ctx.stroke();

        // Burun koruyucu
        ctx.fillStyle = helmetShade;
        fillRoundedRect(ctx, x + size * 0.47, y + size * 0.1, size * 0.06, size * 0.22, size * 0.02);

        // SOL BOYNUZ
        ctx.fillStyle = hornColor;
        ctx.strokeStyle = hornBaseColor;
        ctx.lineWidth = size * 0.02;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.18, helmetTopY + size * 0.1);
        ctx.quadraticCurveTo(x - size * 0.2, helmetTopY - size * 0.02, x + size * 0.02, helmetTopY - size * 0.18);
        ctx.quadraticCurveTo(x + size * 0.12, helmetTopY - size * 0.1, x + size * 0.3, helmetTopY + size * 0.04);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // SAG BOYNUZ
        ctx.beginPath();
        ctx.moveTo(x + size * 0.82, helmetTopY + size * 0.1);
        ctx.quadraticCurveTo(x + size * 1.2, helmetTopY - size * 0.02, x + size * 0.98, helmetTopY - size * 0.18);
        ctx.quadraticCurveTo(x + size * 0.88, helmetTopY - size * 0.1, x + size * 0.7, helmetTopY + size * 0.04);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Boynuz tabanlari
        ctx.strokeStyle = hornBaseColor;
        ctx.lineWidth = size * 0.03;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.2, helmetTopY + size * 0.11);
        ctx.lineTo(x + size * 0.32, helmetTopY + size * 0.07);
        ctx.moveTo(x + size * 0.8, helmetTopY + size * 0.11);
        ctx.lineTo(x + size * 0.68, helmetTopY + size * 0.07);
        ctx.stroke();
    }

    ctx.restore();
}

function drawProgressBar(ctx, screenWidth) {
    // Ayarlar
    const barWidth = screenWidth * 0.6; // Ekranın %60'ı genişliğinde
    const barHeight = 10;
    const x = (screenWidth - barWidth) / 2;
    const y = 50; // Tepeden 50px aşağıda

    const mapWidth = COLS * TILE_SIZE;

    ctx.save();

    // 1. Çubuğun Arkaplanı (Yarı saydam siyah)
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 5);
    ctx.fill();

    // 2. Çubuğun Çerçevesi
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Bitiş Çizgisi (Bayrak)
    ctx.fillStyle = "#e74c3c"; // Kırmızı bayrak çizgisi
    ctx.fillRect(x + barWidth - 5, y - 5, 2, barHeight + 10);

    // 4. Oyuncu Kafaları (İkonlar)
    let oppProgress = opponent.x / mapWidth;
    if (oppProgress < 0) oppProgress = 0;
    if (oppProgress > 1) oppProgress = 1;

    const oppX = x + (barWidth * oppProgress);
    
    ctx.fillStyle = "#e74c3c"; // Rakip rengi
    ctx.beginPath();
    ctx.arc(oppX, y + barHeight / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.stroke();

    let myProgress = player.x / mapWidth;
    if (myProgress < 0) myProgress = 0;
    if (myProgress > 1) myProgress = 1;

    const myX = x + (barWidth * myProgress);

    ctx.fillStyle = "#2ecc71"; // Sen
    ctx.beginPath();
    ctx.arc(myX, y + barHeight / 2, 8, 0, Math.PI * 2); // Seninki biraz daha büyük
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}
