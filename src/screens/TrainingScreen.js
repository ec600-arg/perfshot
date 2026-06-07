import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Alert, BackHandler, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { buildPrecisionSequence, buildRapidFireSequence } from '../utils/sequences';
import { initAudio, playSound, speakCommand, stopSpeech } from '../utils/audio';
import { Colors, Fonts } from '../theme';

// ─── Timer format ────────────────────────────────────────────────────────────

function formatMs(ms) {
  if (ms <= 0) return '0';
  if (ms < 10000) return (ms / 1000).toFixed(1);   // tenths for short windows
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}:${sec.toString().padStart(2, '0')}`;
  return `${totalSec}`;
}

// ─── Background colors ───────────────────────────────────────────────────────

const BG = {
  neutral: Colors.neutral,
  green:   Colors.green,
  red:     Colors.red,
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function TrainingScreen({ mode, onBack }) {
  const sequence = useMemo(
    () => (mode === 'precision' ? buildPrecisionSequence() : buildRapidFireSequence()),
    [mode],
  );

  // Rendered state (drives UI re-renders)
  const [step, setStep]             = useState(null);
  const [displayMs, setDisplayMs]   = useState(0);
  const [sessionState, setSession]  = useState('idle'); // idle | running | paused | done

  // Timer refs (no re-render needed for these)
  const timerRef     = useRef(null);
  const stepIdxRef   = useRef(0);
  const remainMsRef  = useRef(0);
  const audioReady   = useRef(false);

  // ── Audio init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    initAudio().then(() => { audioReady.current = true; });
  }, []);

  // ── Keep screen awake while running ─────────────────────────────────────────
  useEffect(() => {
    if (sessionState === 'running') {
      activateKeepAwakeAsync();
    } else {
      deactivateKeepAwake();
    }
  }, [sessionState]);

  // ── Android back button ──────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleStop();
      return true;
    });
    return () => sub.remove();
  }, [sessionState]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeech();
      deactivateKeepAwake();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Core step runner
  // ─────────────────────────────────────────────────────────────────────────────

  const startCountdown = useCallback((durationMs, onComplete) => {
    if (timerRef.current) clearInterval(timerRef.current);
    remainMsRef.current = durationMs;
    setDisplayMs(durationMs);

    const endTime = Date.now() + durationMs;

    timerRef.current = setInterval(() => {
      const rem = endTime - Date.now();
      if (rem <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        remainMsRef.current = 0;
        setDisplayMs(0);
        onComplete();
      } else {
        remainMsRef.current = rem;
        setDisplayMs(rem);
      }
    }, 100);
  }, []);

  const runStep = useCallback((idx) => {
    const s = sequence[idx];
    if (!s) return;

    stepIdxRef.current = idx;
    setStep(s);

    // Fire audio/haptics at step start
    if (s.command) speakCommand(s.command);
    if (s.sound) {
      playSound(s.sound);
      if (s.sound === 'start') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (s.sound === 'stop') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (s.phase === 'DONE') {
      setSession('done');
      deactivateKeepAwake();
      return;
    }

    if (s.duration === 0) {
      setTimeout(() => runStep(idx + 1), 60);
      return;
    }

    startCountdown(s.duration * 1000, () => runStep(idx + 1));
  }, [sequence, startCountdown]);

  // ─── Controls ────────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    setSession('running');
    runStep(0);
  }, [runStep]);

  const handlePause = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopSpeech();
    setSession('paused');
  }, []);

  const handleResume = useCallback(() => {
    setSession('running');
    const rem = remainMsRef.current;
    const endTime = Date.now() + rem;
    const currentIdx = stepIdxRef.current;

    timerRef.current = setInterval(() => {
      const r = endTime - Date.now();
      if (r <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        remainMsRef.current = 0;
        setDisplayMs(0);
        runStep(currentIdx + 1);
      } else {
        remainMsRef.current = r;
        setDisplayMs(r);
      }
    }, 100);
  }, [runStep]);

  const handleSkip = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopSpeech();
    runStep(stepIdxRef.current + 1);
  }, [runStep]);

  const handleStop = useCallback(() => {
    if (sessionState === 'idle' || sessionState === 'done') {
      onBack();
      return;
    }
    Alert.alert(
      'Stop Training?',
      'This will end the current session.',
      [
        { text: 'Continue', style: 'cancel' },
        {
          text: 'Stop', style: 'destructive',
          onPress: () => {
            if (timerRef.current) clearInterval(timerRef.current);
            stopSpeech();
            deactivateKeepAwake();
            onBack();
          },
        },
      ],
    );
  }, [sessionState, onBack]);

  // ─── Derived UI values ────────────────────────────────────────────────────────

  const bgColor   = step ? BG[step.color] : Colors.neutral;
  const isRunning = sessionState === 'running';
  const isPaused  = sessionState === 'paused';
  const isDone    = sessionState === 'done';
  const isIdle    = sessionState === 'idle';

  const showTimer = step && step.duration > 0 && !isDone;
  const timerStr  = showTimer ? formatMs(displayMs) : '';

  // Progress label (e.g. "SERIES 3 / 6")
  const seriesBar = step?.seriesLabel ?? (mode === 'precision' ? 'PRECISION MODE' : 'RAPID-FIRE MODE');

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: bgColor }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={bgColor}
        translucent={false}
      />
      <SafeAreaView style={s.safe}>

        {/* Top bar */}
        <View style={s.topBar}>
          <Text style={s.seriesBar}>{seriesBar}</Text>
          <TouchableOpacity onPress={handleStop} hitSlop={14} style={s.closeBtn}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Center — main content */}
        <View style={s.center}>
          {isIdle && (
            <>
              <Text style={s.idleMode}>
                {mode === 'precision' ? 'PRECISION' : 'RAPID-FIRE'}
              </Text>
              <Text style={s.idleSub}>
                {mode === 'precision'
                  ? '6 competition series\n5 shots × 4 minutes'
                  : '6 competition series\n5 shots × 3 seconds each'}
              </Text>
            </>
          )}

          {!isIdle && !isDone && step && (
            <>
              <Text style={s.phaseLabel}>{step.label}</Text>
              {showTimer && (
                <Text
                  style={[
                    s.timerText,
                    displayMs < 4000 && step.color === 'green' && s.timerUrgent,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {timerStr}
                </Text>
              )}
              <Text style={s.sublabel}>{step.sublabel}</Text>
            </>
          )}

          {isDone && (
            <>
              <Text style={s.doneCheck}>✓</Text>
              <Text style={s.doneTitle}>TRAINING{'\n'}COMPLETE</Text>
              <Text style={s.doneSub}>6 competition series</Text>
            </>
          )}
        </View>

        {/* Bottom controls */}
        <View style={s.controls}>
          {isIdle && (
            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleStart} activeOpacity={0.85}>
              <Text style={s.btnPrimaryText}>▶  START SESSION</Text>
            </TouchableOpacity>
          )}

          {(isRunning || isPaused) && (
            <View style={s.controlRow}>
              <TouchableOpacity
                style={[s.btn, s.btnSecondary, s.btnHalf]}
                onPress={isPaused ? handleResume : handlePause}
                activeOpacity={0.8}
              >
                <Text style={s.btnSecText}>{isPaused ? '▶  RESUME' : '⏸  PAUSE'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.btn, s.btnGhost, s.btnHalf]}
                onPress={handleSkip}
                activeOpacity={0.8}
              >
                <Text style={s.btnGhostText}>SKIP ▶▶</Text>
              </TouchableOpacity>
            </View>
          )}

          {isDone && (
            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={onBack} activeOpacity={0.85}>
              <Text style={s.btnPrimaryText}>← HOME</Text>
            </TouchableOpacity>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 20 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 8,
  },
  seriesBar: {
    fontSize: Fonts.base,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.75)',
    flex: 1,
  },
  closeBtn: { padding: 6 },
  closeBtnText: { fontSize: 18, color: 'rgba(255,255,255,0.6)', fontWeight: '700' },

  // Center
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },

  // Idle
  idleMode: {
    fontSize: Fonts.huge,
    fontWeight: '900',
    letterSpacing: 4,
    color: Colors.white,
    textAlign: 'center',
  },
  idleSub: {
    fontSize: Fonts.base + 1,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 8,
  },

  // Running
  phaseLabel: {
    fontSize: Fonts.large + 4,
    fontWeight: '900',
    letterSpacing: 6,
    color: Colors.white,
    textAlign: 'center',
  },
  timerText: {
    fontSize: Fonts.giant + 20,
    fontWeight: '900',
    color: Colors.white,
    fontVariant: ['tabular-nums'],
    lineHeight: Fonts.giant + 30,
    textAlign: 'center',
    minWidth: 240,
  },
  timerUrgent: {
    color: '#FFE066', // yellow when < 4s left in fire window
  },
  sublabel: {
    fontSize: Fonts.base + 1,
    color: 'rgba(255,255,255,0.70)',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 1,
  },

  // Done
  doneCheck: { fontSize: 72, textAlign: 'center' },
  doneTitle: {
    fontSize: Fonts.huge - 4,
    fontWeight: '900',
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: 4,
    lineHeight: 68,
  },
  doneSub: {
    fontSize: Fonts.base,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    letterSpacing: 1,
  },

  // Controls
  controls: { paddingBottom: 24, gap: 12 },
  controlRow: { flexDirection: 'row', gap: 12 },

  btn: { borderRadius: 14, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  btnHalf: { flex: 1 },

  btnPrimary: { backgroundColor: Colors.accent },
  btnPrimaryText: { fontSize: Fonts.base + 1, fontWeight: '800', color: Colors.bg, letterSpacing: 2 },

  btnSecondary: { backgroundColor: 'rgba(255,255,255,0.18)' },
  btnSecText: { fontSize: Fonts.base, fontWeight: '700', color: Colors.white, letterSpacing: 1 },

  btnGhost: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  btnGhostText: { fontSize: Fonts.base, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: 1 },
});
