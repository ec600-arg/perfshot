import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

// ─── WAV generator ──────────────────────────────────────────────────────────
// Generates a single-frequency sine wave as a WAV ArrayBuffer.

function generateWAV(frequencyHz, durationSec) {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2; // 16-bit PCM
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);

  const wstr = (off, s) => {
    for (let i = 0; i < 4; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };

  // RIFF/WAVE header
  wstr(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  wstr(8, 'WAVE');
  // fmt chunk
  wstr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);              // PCM
  dv.setUint16(22, 1, true);              // Mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true);              // block align
  dv.setUint16(34, 16, true);             // bits/sample
  // data chunk
  wstr(36, 'data');
  dv.setUint32(40, dataSize, true);

  // Sine wave with smooth attack+release envelope
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const attack  = Math.min(1, t * 20);           // 50ms attack
    const release = Math.min(1, (durationSec - t) * 10); // 100ms release
    const env = attack * release;
    const val = Math.sin(2 * Math.PI * frequencyHz * t) * 32767 * 0.85 * env;
    dv.setInt16(44 + i * 2, Math.round(val), true);
  }

  return buf;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let str = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    str += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + CHUNK, bytes.length)),
    );
  }
  return btoa(str);
}

// ─── Sound registry ─────────────────────────────────────────────────────────

const soundObjects = {};

const SOUND_CONFIGS = [
  { name: 'start',     freq: 880, dur: 0.35 }, // high beep — green / FIRE
  { name: 'stop',      freq: 392, dur: 1.20 }, // low buzz  — series end
  { name: 'shortStop', freq: 660, dur: 0.22 }, // mid blip  — rapid-fire red between shots
];

export async function initAudio() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,   // play even when iOS ringer is off
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
    });
  } catch (_) {}

  for (const { name, freq, dur } of SOUND_CONFIGS) {
    try {
      const b64 = arrayBufferToBase64(generateWAV(freq, dur));
      const path = `${FileSystem.cacheDirectory}pfshot_${name}.wav`;
      await FileSystem.writeAsStringAsync(path, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { sound } = await Audio.Sound.createAsync({ uri: path });
      soundObjects[name] = sound;
    } catch (e) {
      console.warn(`[audio] init ${name} failed:`, e);
    }
  }
}

export async function playSound(name) {
  const s = soundObjects[name];
  if (!s) return;
  try {
    await s.setPositionAsync(0);
    await s.playAsync();
  } catch (e) {
    console.warn('[audio] playSound error:', e);
  }
}

export function speakCommand(text) {
  try {
    Speech.stop();
    Speech.speak(text, { language: 'en-US', rate: 0.88, pitch: 1.0 });
  } catch (e) {
    console.warn('[audio] speech error:', e);
  }
}

export function stopSpeech() {
  try { Speech.stop(); } catch (_) {}
}
