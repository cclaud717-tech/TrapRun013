// server.js (Düzeltilmiş Eşleştirme Mantığı)
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// --- 404 SAYFASI ---
app.use((req, res, next) => {
    if (req.accepts('html')) {
        res.status(404).sendFile(__dirname + '/public/index.html');
    } else {
        res.status(404).json({ error: 'Sayfa bulunamadı' });
    }
});

// --- GLOBAL HATA YÖNETİMİ ---
app.use((err, req, res, next) => {
    console.error('[HATA]', err.message);
    res.status(500).json({ error: 'Sunucu hatası' });
});

process.on('uncaughtException', (err) => {
    console.error('[KRİTİK HATA]', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[PROMISE HATASI]', reason);
});

let waitingPlayer = null; // Bekleyen oyuncunun socket nesnesi
let rooms = {}; 

// --- ANTI-CHEAT: Rate Limiter ---
const rateLimiters = {}; // socket.id -> { event: lastTimestamp }
function rateLimit(socketId, event, minIntervalMs) {
    if (!rateLimiters[socketId]) rateLimiters[socketId] = {};
    const now = Date.now();
    const last = rateLimiters[socketId][event] || 0;
    if (now - last < minIntervalMs) return false; // blocked
    rateLimiters[socketId][event] = now;
    return true; // allowed
}

// --- ANTI-CHEAT: Min race time (seconds) ---
const MIN_RACE_TIME_SEC = 3;
const MAX_RACE_TIME_SEC = 120;

// --- OPTİMİZE EDİLMİŞ DOĞMA NOKTASI BULUCU ---
// Artık tek bir nokta değil, tüm uygun noktaların listesini tek seferde verir
function getAllValidSpawnPoints(map) {
    let validSpots = [];
    for (let r = 0; r < 14; r++) { 
        for (let c = 0; c < 60; c++) { 
            // map[r+1] kontrolü ekledik ki harita dışına çıkıp hata vermesin
            if (map[r][c] === 0 && map[r+1] && map[r+1][c] !== 0) {
                validSpots.push({ r: r, c: c });
            }
        }
    }
    // Eğer uygun yer yoksa varsayılan bir nokta ekle
    if (validSpots.length === 0) validSpots.push({ r: 5, c: 10 });
    return validSpots;
}

io.on('connection', (socket) => {
    console.log(`[BAĞLANTI] Yeni oyuncu geldi: ${socket.id}`);

    socket.on('join_game', (data) => {
        const playerName = (data && data.name) || data || `Oyuncu ${socket.id.substr(0,4)}`;
        const playerColor = (data && data.color) || '#ff4757';
        const playerHat = (data && data.hat) || 0;

        socket.playerName = playerName;
        socket.playerColor = playerColor;
        socket.playerHat = playerHat;

        if (waitingPlayer && waitingPlayer.id === socket.id) return;
        console.log(`[İSTEK] ${socket.playerName} (${socket.playerColor}) oyun arıyor...`);

        if (waitingPlayer) {
            const opponent = waitingPlayer;
            if (!opponent.connected || opponent.disconnected) {
                waitingPlayer = socket;
                socket.emit('waiting', 'Önceki bekleyen düştü. Rakip bekleniyor...');
                return;
            }

            const roomID = opponent.id + '#' + socket.id;
            const themes = ['NORMAL', 'ICE', 'FIRE'];
            const randomTheme = themes[Math.floor(Math.random() * themes.length)];
            rooms[roomID] = { 
                p1: opponent.id, 
                p2: socket.id, 
                names: { 
                    [opponent.id]: opponent.playerName, 
                    [socket.id]: socket.playerName 
                },
                colors: {
                    [opponent.id]: opponent.playerColor,
                    [socket.id]: socket.playerColor
                },
                hats: {
                    [opponent.id]: opponent.playerHat,
                    [socket.id]: socket.playerHat
                },
                // --- YENİ EKLENEN KISIM ---
                lives: {
                    [opponent.id]: 3, // Başlangıç canı
                    [socket.id]: 3
                },
                // -------------------------
                maps: {}, 
                bets: {}, 
                scores: { [opponent.id]: 0, [socket.id]: 0 },
                theme: randomTheme
            };

            opponent.join(roomID);
            socket.join(roomID);

            io.to(roomID).emit('game_start', { 
                roomID: roomID, 
                scores: rooms[roomID].scores,
                names: rooms[roomID].names,
                colors: rooms[roomID].colors,
                hats: rooms[roomID].hats,
                theme: rooms[roomID].theme
            });

            io.to(opponent.id).emit('role', 'player1');
            io.to(socket.id).emit('role', 'player2');
            io.to(roomID).emit('start_music_signal');

            waitingPlayer = null;

        } else {
            waitingPlayer = socket;
            socket.emit('waiting', 'Rakip bekleniyor...');
        }
    });

    socket.on('create_private_room', (data) => {
        const playerName = data.name || `Oyuncu ${socket.id.substr(0,4)}`;
        const playerColor = data.color || '#ff4757';
        const playerHat = data.hat || 0;

        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();

        rooms[roomCode] = {
            p1: socket.id,
            p2: null,
            isPrivate: true,
            names: { [socket.id]: playerName },
            colors: { [socket.id]: playerColor },
            hats: { [socket.id]: playerHat },
            lives: { [socket.id]: 3 },
            maps: {},
            bets: {},
            scores: { [socket.id]: 0 },
            theme: ['NORMAL', 'ICE', 'FIRE'][Math.floor(Math.random() * 3)]
        };

        socket.playerName = playerName;
        socket.playerColor = playerColor;
        socket.playerHat = playerHat;
        socket.join(roomCode);

        socket.emit('private_room_created', roomCode);
        console.log(`[ÖZEL] Oda kuruldu: ${roomCode} - Kuran: ${playerName}`);
    });

    socket.on('join_private_room', (data) => {
        const roomCode = data.roomCode.toUpperCase();
        const playerName = data.name || `Misafir`;
        const playerColor = data.color;
        const playerHat = data.hat || 0;

        const room = rooms[roomCode];

        if (!room) {
            socket.emit('room_error', 'Böyle bir oda bulunamadı!');
            return;
        }
        if (room.p2 !== null) {
            socket.emit('room_error', 'Bu oda zaten dolu!');
            return;
        }

        room.p2 = socket.id;
        room.names[socket.id] = playerName;
        room.colors[socket.id] = playerColor;
        room.hats[socket.id] = playerHat;
        room.scores[socket.id] = 0;
        room.scores[room.p1] = 0;
        if (!room.lives) room.lives = {};
        room.lives[socket.id] = 3;

        socket.playerName = playerName;
        socket.playerColor = playerColor;
        socket.playerHat = playerHat;
        socket.join(roomCode);

        console.log(`[ÖZEL] Odaya katıldı: ${playerName} -> ${roomCode}`);

        io.to(roomCode).emit('game_start', {
            roomID: roomCode,
            scores: room.scores,
            names: room.names,
            colors: room.colors,
            hats: room.hats,
            theme: room.theme
        });

        io.to(room.p1).emit('role', 'player1');
        io.to(socket.id).emit('role', 'player2');
        io.to(roomCode).emit('start_music_signal');
    });


    // ... (Map submit, move, powerup kodları aynı kalacak) ...
    socket.on('map_submitted', (data) => {
        const room = rooms[data.roomID];
        if(!room) return;

        // --- HARİTA DOĞRULAMA (Validation) ---
        const map = data.mapData;
        if (!Array.isArray(map) || map.length !== 15) return;
        for (let r = 0; r < map.length; r++) {
            if (!Array.isArray(map[r]) || map[r].length !== 60) return;
            for (let c = 0; c < map[r].length; c++) {
                const val = map[r][c];
                if (typeof val !== 'number' || val < 0 || val > 12) return;
            }
        }

        room.maps[socket.id] = data.mapData;

        // Haritasını gönderene "Bekle" mesajı
        socket.emit('waiting', 'Diğer oyuncu bekleniyor...');

        if (Object.keys(room.maps).length === 1) {
            socket.to(data.roomID).emit('hurry_up');
        }

        if (Object.keys(room.maps).length === 2) {
            // 1. Bahisleri Saklamak İçin Yer Aç
            room.bets = {};
            room.roundEnded = false; // Yeni tur kilidi sıfırla
            
            // 2. Oyunculara "Bahis Ekranını Aç" emri ver
            io.to(data.roomID).emit('start_betting_phase');

            // 3. 5 Saniye Sonra Yarışı Zorla Başlat
            setTimeout(() => {
                if(!rooms[data.roomID]) return;

                // --- ANTI-CHEAT: Yarış başlangıç zamanını kaydet ---
                room.raceStartTime = Date.now();

                io.to(room.p1).emit('start_race', { map: room.maps[room.p2] });
                io.to(room.p2).emit('start_race', { map: room.maps[room.p1] });

                // Odanın haritaları belli olduktan sonra, doğma noktalarını SADECE 1 KERE hesapla ve odaya kaydet
                room.spawnPointsP1 = getAllValidSpawnPoints(room.maps[room.p2]);
                room.spawnPointsP2 = getAllValidSpawnPoints(room.maps[room.p1]);

                setTimeout(() => {
                    if(!rooms[data.roomID]) return;
                    const spawnP1 = room.spawnPointsP1[Math.floor(Math.random() * room.spawnPointsP1.length)];
                    io.to(room.p1).emit('spawn_powerup', spawnP1);
                    const spawnP2 = room.spawnPointsP2[Math.floor(Math.random() * room.spawnPointsP2.length)];
                    io.to(room.p2).emit('spawn_powerup', spawnP2);
                }, 5000); 
            }, 5000);
        }
    });

    socket.on('player_move', (data) => {
        // ANTI-CHEAT: Rate limit movement packets (max ~60/sec → min 10ms apart)
        if (!rateLimit(socket.id, 'move', 10)) return;
        // ANTI-CHEAT: Basic position sanity check
        if (data.x !== undefined && data.y !== undefined) {
            if (data.x < -100 || data.x > 2500 || data.y < -200 || data.y > 700) return;
        }
        socket.to(data.roomID).emit('opponent_move', data);
    });
    socket.on('powerup_collected', (roomID) => {
        // Rastgele bir güç seç: 1=Hız, 2=Kalkan, 3=Sabotaj
        const powerType = Math.floor(Math.random() * 3) + 1;
        
        // Kutuyu alana ne çıktığını söyle
        socket.emit('powerup_effect', { type: powerType, target: 'me' });

        // Rakibe de bilgi ver
        socket.to(roomID).emit('powerup_effect', { type: powerType, target: 'opponent' });
    });
    socket.on('send_emoji', (data) => {
        // ANTI-CHEAT: Rate limit emoji (min 1.5s between each)
        if (!rateLimit(socket.id, 'emoji', 1500)) return;
        socket.to(data.roomID).emit('opponent_emoji', data.emoji);
    });
    socket.on('mine_exploded', (data) => {
        // ANTI-CHEAT: Rate limit mine explosions (min 500ms between)
        if (!rateLimit(socket.id, 'mine', 500)) return;
        socket.to(data.roomID).emit('mine_exploded', data);
    });

    socket.on('player_won', (roomID) => {
        const room = rooms[roomID];
        if (!room) return;

        // --- ANTI-CHEAT: Zamanlama doğrulaması ---
        if (room.raceStartTime) {
            const elapsedSec = (Date.now() - room.raceStartTime) / 1000;
            // Çok hızlı bitiş → hile olabilir
            if (elapsedSec < MIN_RACE_TIME_SEC) {
                console.log(`[ANTI-CHEAT] ${socket.id} çok hızlı bitirdi (${elapsedSec.toFixed(1)}s) → yok sayılıyor`);
                return;
            }
            // Süre aşımı → yok say
            if (elapsedSec > MAX_RACE_TIME_SEC) {
                console.log(`[ANTI-CHEAT] ${socket.id} süre aşımı (${elapsedSec.toFixed(1)}s) → yok sayılıyor`);
                return;
            }
        }

        // --- ANTI-CHEAT: Rate limit (aynı turda çift istek engelle) ---
        if (!rateLimit(socket.id, 'player_won', 2000)) return;

        // --- YARIŞ DURUMU KİLİDİ (Race Condition Fix) ---
        // İlk gelen kazanır, ikinci gelen yok sayılır
        if (room.roundEnded) return;
        room.roundEnded = true;

        const winnerId = socket.id;
        const loserId = (room.p1 === winnerId) ? room.p2 : room.p1;

        let pointsToAdd = 1;

        if (room.bets && room.bets[winnerId] === 'high') {
            pointsToAdd = 3;
        }

        if (room.bets && room.bets[loserId] === 'high') {
            room.scores[loserId] = Math.max(0, room.scores[loserId] - 1);
        }

        room.scores[winnerId] += pointsToAdd;

        // --- MAÇ BİTİŞİ KONTROLÜ (İlk 5'e ulaşan kazanır) ---
        const MATCH_WIN_SCORE = 5;
        if (room.scores[winnerId] >= MATCH_WIN_SCORE) {
            io.to(roomID).emit('match_over', { 
                winner: winnerId, 
                scores: room.scores,
                names: room.names
            });
            // Odayı temizle
            delete rooms[roomID];
            return;
        }

        io.to(roomID).emit('round_over', { winner: winnerId, scores: room.scores });
        room.maps = {};
        room.bets = {};
    });

    socket.on('place_bet', (betType) => {
        for (let id in rooms) {
            const room = rooms[id];
            if (room.p1 === socket.id || room.p2 === socket.id) {
                if(!room.bets) room.bets = {};
                room.bets[socket.id] = betType;
                console.log(`[BAHİS] ${socket.id} bahsi: ${betType}`);
                break;
            }
        }
    });

    // --- HARİTA SENKRONİZASYONU ---
    socket.on('tile_changed', (data) => {
        // data içeriği: { roomID, r, c, type }
        socket.to(data.roomID).emit('tile_changed', data);
    });

    // --- TUZAK SİNKRONİZASYONU ---
    socket.on('trap_destroyed', (data) => {
        // Bu oyuncunun hangi odada olduğunu ve rakibinin kim olduğunu buluyoruz
        for (let roomId in rooms) {
            const room = rooms[roomId];
            if (room.p1 === socket.id || room.p2 === socket.id) {
                const opponentId = (room.p1 === socket.id) ? room.p2 : room.p1;
                
                // Haberi sadece rakibe gönderiyoruz
                io.to(opponentId).emit('opponent_trap_destroyed', data);
                break;
            }
        }
    });

    // --- GÜVENLİ HASAR SİSTEMİ ---
    socket.on('report_damage', (roomID) => {
        // ANTI-CHEAT: Rate limit damage reports (min 300ms between)
        if (!rateLimit(socket.id, 'damage', 300)) return;
        const room = rooms[roomID];
        if (!room) return;

        // Canı sunucuda azalt
        if (room.lives[socket.id] > 0) {
            room.lives[socket.id]--;
        }

        const currentLives = room.lives[socket.id];

        // Oyuncuya güncel canını bildir
        io.to(roomID).emit('update_health', { 
            id: socket.id, 
            lives: currentLives 
        });

        // Eğer can bittiyse "Öldün" sinyali gönder
        if (currentLives <= 0) {
            // Canları hemen yenile (Ceza süresi bitince ful doğsun diye)
            // Ama client tarafında 5 sn bekleyecek
            room.lives[socket.id] = 3; 
        }
    });

    socket.on('disconnect', () => {
        console.log(`[KOPMA] ${socket.id} ayrıldı.`);
        
        // ANTI-CHEAT: Clean up rate limiter
        delete rateLimiters[socket.id];

        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            console.log('[SIRA] Bekleyen oyuncu silindi.');
        }

        for (let roomId in rooms) {
            const room = rooms[roomId];
            if (room.p1 === socket.id || room.p2 === socket.id) {
            const opponentId = (room.p1 === socket.id) ? room.p2 : room.p1;
            
            io.to(opponentId).emit('opponent_left'); 
            io.to(opponentId).emit('round_over', { 
                winner: opponentId, 
                scores: room.scores
            });
                
                delete rooms[roomId];
                console.log(`[ODA] ${roomId} kapatıldı (Oyuncu koptu).`);
                break; 
            }
        }
    });
});

http.listen(PORT, () => console.log(`Sunucu Başlatıldı: http://localhost:${PORT}`));
