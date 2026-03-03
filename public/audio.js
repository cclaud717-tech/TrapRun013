// public/audio.js - ULTRA GELİŞMİŞ SES MOTORU (V3)

// AudioContext'i ilk kullanıcı etkileşiminde oluştur (tarayıcı uyarısını önler)
let audioCtx = null;

// Gürültü (Noise) Tamponu - Patlamalar için gerekli
let noiseBuffer = null;

function ensureAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function createNoiseBuffer() {
    if (noiseBuffer || !audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 2; // 2 saniye
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        // Beyaz gürültü oluşturuyoruz
        data[i] = Math.random() * 2 - 1;
    }
    noiseBuffer = buffer;
}

function unlockAudio() {
    ensureAudioContext();
    createNoiseBuffer();
}

window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('touchstart', unlockAudio, { once: true });

function playSound(type) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    createNoiseBuffer();
    const t = ctx.currentTime;

    // --- 1. ZIPLAMA (Mario Tarzı Tok Ses) ---
    if (type === 'jump') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'square'; // Kare dalga (Daha retro oyun hissi verir)
        
        // Pitch (Frekans) Zarfı: Hızlıca yükselir
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.linearRampToValueAtTime(300, t + 0.1);
        
        // Ses Şiddeti Zarfı: Çok kısa sürer
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

        osc.start(t);
        osc.stop(t + 0.1);
    } 

    // --- 2. TUZAK / HASAR (Gerçekçi Patlama - Kick + Noise) ---
    else if (type === 'trap') {
        // KATMAN A: "KICK" (Derin Darbe)
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        
        osc.type = 'sine'; // Sinüs dalgası derin bas verir
        // Frekans hızla düşer (Güm etkisi)
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
        
        oscGain.gain.setValueAtTime(0.5, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.5);

        // KATMAN B: "PATLAMA" (Gürültü + Filtre)
        if (noiseBuffer) {
            const noise = ctx.createBufferSource();
            const noiseGain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            noise.buffer = noiseBuffer;
            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(ctx.destination);

            // Alçak Geçiren Filtre (Low Pass)
            // Filtre kapanarak patlama sesi yaratır (Fşşş -> fvvv)
            filter.type = 'lowpass';
            filter.Q.value = 1;
            filter.frequency.setValueAtTime(3000, t);
            filter.frequency.exponentialRampToValueAtTime(100, t + 0.4);

            noiseGain.gain.setValueAtTime(0.4, t);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            
            noise.start(t);
            noise.stop(t + 0.4);
        }
    }
    
    // --- 3. POWER-UP (Kristal / Jeton Sesi) ---
    else if (type === 'powerup') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine'; // Saf, temiz ses
        
        // İki notalı arpej (Bling!)
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.setValueAtTime(1800, t + 0.1); // 0.1sn sonra nota değişir
        
        // Çınlama efekti (Uzun kuyruk)
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6); // 0.6sn sürer

        osc.start(t);
        osc.stop(t + 0.6);
    }
    
    // --- 4. KAZANMA (Major Akor - Zafer Fanfarı) ---
    else if (type === 'win') {
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C Major (Do-Mi-Sol-Do)
        
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = 'triangle'; // Oyun konsolu hissi
            osc.frequency.value = freq;
            
            const start = t + (i * 0.1); // Sırayla çal
            
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.1, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, start + 0.6);
            
            osc.start(start);
            osc.stop(start + 0.6);
        });
    }

    // --- 5. IŞINLANMA / WARP (Modülasyonlu Ses) ---
    else if (type === 'teleport') {
        // Ana Ses
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        // LFO (Low Frequency Oscillator) - Sesi titreten dalga
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        // Bağlantı: LFO -> LFO Gain -> Ana Ses Frekansı (FM Sentezi)
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.linearRampToValueAtTime(800, t + 1.0); // Yükselen ses

        lfo.type = 'sine';
        lfo.frequency.value = 15; // Saniyede 15 kez titret
        lfoGain.gain.value = 50; // Titreşim şiddeti

        gain.gain.setValueAtTime(0.1, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.8);
        gain.gain.linearRampToValueAtTime(0, t + 1.0);

        osc.start(t);
        lfo.start(t);
        osc.stop(t + 1.0);
        lfo.stop(t + 1.0);
    }
}

// --- 6. ÖLÜM / KAYIP SESİ (Minör Akor - Düşüş) ---
function playLoseSound() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [392, 349.23, 311.13, 261.63]; // G-F-Eb-C (düşen minör)
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        const start = t + (i * 0.15);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.4);
        osc.start(start);
        osc.stop(start + 0.4);
    });
}

// --- 7. İNİŞ SESİ (Yere düşünce hafif "tuk") ---
function playLandSound() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.start(t);
    osc.stop(t + 0.08);
}

// =========================================================
//  ARKA PLAN MÜZİĞİ SİSTEMİ (Tema Bazlı Prosedürel Loop)
// =========================================================

let musicNodes = null;   // Aktif müzik bağlantıları
let musicGain = null;    // Master volume
let isMusicPlaying = false;
let musicVolume = 0.15;  // Varsayılan müzik ses seviyesi (0-1)
let sfxVolume = 0.5;     // Varsayılan efekt ses seviyesi (0-1)

// Tema bazlı nota dizileri (MIDI benzeri, frekans cinsinden)
const MUSIC_THEMES = {
    NORMAL: {
        bpm: 130,
        bass: [130.81, 146.83, 164.81, 146.83, 130.81, 164.81, 146.83, 130.81], // C3 serisi
        melody: [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 783.99], // C5 serisi
        chord: [[261.63, 329.63, 392], [293.66, 369.99, 440], [329.63, 415.30, 523.25]], // Akorlar
        wave: 'square'
    },
    ICE: {
        bpm: 100,
        bass: [110, 130.81, 146.83, 130.81, 110, 146.83, 130.81, 110],
        melody: [440, 523.25, 659.25, 587.33, 523.25, 440, 523.25, 659.25],
        chord: [[220, 277.18, 329.63], [261.63, 329.63, 392], [220, 277.18, 329.63]],
        wave: 'triangle'
    },
    FIRE: {
        bpm: 150,
        bass: [98, 110, 130.81, 98, 116.54, 130.81, 98, 110],
        melody: [392, 440, 523.25, 392, 466.16, 523.25, 392, 440],
        chord: [[196, 233.08, 293.66], [220, 261.63, 329.63], [196, 246.94, 293.66]],
        wave: 'sawtooth'
    }
};

function startMusic(theme) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    stopMusic(); // Önceki müziği durdur

    const themeData = MUSIC_THEMES[theme] || MUSIC_THEMES.NORMAL;
    const beatLen = 60 / themeData.bpm;
    const loopLen = themeData.bass.length * beatLen;

    // Master gain
    musicGain = ctx.createGain();
    musicGain.gain.value = musicVolume;
    musicGain.connect(ctx.destination);

    // --- BAS SES ---
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = 'sine';
    bassOsc.connect(bassGain);
    bassGain.connect(musicGain);
    bassGain.gain.value = 0.3;

    const now = ctx.currentTime;
    // Bas notalarını zamanlayarak döngüye sok
    for (let loop = 0; loop < 50; loop++) { // ~50 loop ≈ uzun süre
        const loopStart = now + loop * loopLen;
        themeData.bass.forEach((freq, i) => {
            bassOsc.frequency.setValueAtTime(freq, loopStart + i * beatLen);
        });
    }
    bassOsc.start(now);

    // --- MELODİ ---
    const melOsc = ctx.createOscillator();
    const melGain = ctx.createGain();
    melOsc.type = themeData.wave;
    melOsc.connect(melGain);
    melGain.connect(musicGain);
    melGain.gain.value = 0.08;

    for (let loop = 0; loop < 50; loop++) {
        const loopStart = now + loop * loopLen;
        themeData.melody.forEach((freq, i) => {
            const t = loopStart + i * beatLen;
            melOsc.frequency.setValueAtTime(freq, t);
            // Her notada hafif volume zarfı (staccato hissi)
            melGain.gain.setValueAtTime(0.08, t);
            melGain.gain.setValueAtTime(0.02, t + beatLen * 0.7);
        });
    }
    melOsc.start(now);

    // --- AKOR PAD ---
    const padOscs = [];
    themeData.chord[0].forEach(() => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.connect(g);
        g.connect(musicGain);
        g.gain.value = 0.04;
        padOscs.push({ osc, gain: g });
    });

    for (let loop = 0; loop < 50; loop++) {
        const loopStart = now + loop * loopLen;
        themeData.chord.forEach((chord, ci) => {
            const chordTime = loopStart + ci * (loopLen / themeData.chord.length);
            chord.forEach((freq, fi) => {
                if (padOscs[fi]) {
                    padOscs[fi].osc.frequency.setValueAtTime(freq, chordTime);
                }
            });
        });
    }
    padOscs.forEach(p => p.osc.start(now));

    // --- HI-HAT RİTMİ ---
    // Gürültü tabanlı hi-hat
    createNoiseBuffer();
    const hihatGain = ctx.createGain();
    const hihatFilter = ctx.createBiquadFilter();
    hihatFilter.type = 'highpass';
    hihatFilter.frequency.value = 8000;
    hihatGain.gain.value = 0;
    hihatFilter.connect(hihatGain);
    hihatGain.connect(musicGain);

    if (noiseBuffer) {
        const hihat = ctx.createBufferSource();
        hihat.buffer = noiseBuffer;
        hihat.loop = true;
        hihat.connect(hihatFilter);
        hihat.start(now);

        // Her vuruşta gain aç-kapat
        for (let loop = 0; loop < 50; loop++) {
            const loopStart = now + loop * loopLen;
            for (let i = 0; i < themeData.bass.length * 2; i++) { // 8th notes
                const t = loopStart + i * (beatLen / 2);
                hihatGain.gain.setValueAtTime(0.06, t);
                hihatGain.gain.setValueAtTime(0.0, t + 0.03);
            }
        }

        musicNodes = { bassOsc, melOsc, padOscs, hihat, musicGain };
    } else {
        musicNodes = { bassOsc, melOsc, padOscs, hihat: null, musicGain };
    }

    isMusicPlaying = true;
}

function stopMusic() {
    if (!musicNodes) return;
    try {
        if (musicNodes.bassOsc) musicNodes.bassOsc.stop();
        if (musicNodes.melOsc) musicNodes.melOsc.stop();
        if (musicNodes.padOscs) musicNodes.padOscs.forEach(p => p.osc.stop());
        if (musicNodes.hihat) musicNodes.hihat.stop();
    } catch(e) { /* zaten durmuş olabilir */ }
    musicNodes = null;
    musicGain = null;
    isMusicPlaying = false;
}

function setMusicVolume(vol) {
    musicVolume = Math.max(0, Math.min(1, vol));
    if (musicGain && musicGain.gain) {
        musicGain.gain.value = musicVolume;
    }
}

function setSfxVolume(vol) {
    sfxVolume = Math.max(0, Math.min(1, vol));
}

// playSound'u volume ile entegre et - orijinal fonksiyonu wrap'le
const _originalPlaySound = playSound;
playSound = function(type) {
    // sfxVolume 0 ise hiç çalma
    if (sfxVolume <= 0) return;
    _originalPlaySound(type);
};

function vibrateMobile(duration) {
    if (navigator.vibrate) navigator.vibrate(duration);
}