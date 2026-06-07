// ISSF 25m Sport Pistol — sequence builder
// Produces a flat array of timed steps that TrainingScreen walks through.

const T = {
  PREP:       180,  // 3 min preparation
  LOAD:        60,  // 1 min to load
  ATTENTION:    7,  // 7s delay before fire (±0.1s ISSF spec)
  PRECISION:  240,  // 4 min fire window, 5 shots
  RF_GREEN:     3,  // rapid-fire target visible (3.0s)
  RF_RED:       7,  // rapid-fire target hidden (7.0s ±0.1s)
  STOP_HOLD:    4,  // how long STOP phase shows before UNLOAD
  UNLOAD:      10,  // time to show clear firearm
  REST:        60,  // mandatory 1-min rest between series
};

// Total series: index 0 = sighting, 1-6 = competition
const TOTAL_SERIES = 7;

function loadCommand(seriesIndex) {
  if (seriesIndex === 0) return 'For the sighting series. Load.';
  if (seriesIndex === 1) return 'For the first competition series. Load.';
  return 'For the next competition series. Load.';
}

function seriesLabel(seriesIndex) {
  if (seriesIndex === 0) return 'SIGHTING SERIES';
  return `SERIES ${seriesIndex} / 6`;
}

// ─── Precision ─────────────────────────────────────────────────────────────

export function buildPrecisionSequence() {
  const steps = [];

  steps.push({
    id: 'PREP', phase: 'PREP', color: 'neutral',
    label: 'PREPARATION', sublabel: '3 minutes — get ready',
    duration: T.PREP, command: 'Preparation time. Three minutes.', sound: null,
  });

  for (let s = 0; s < TOTAL_SERIES; s++) {
    const sl = seriesLabel(s);

    steps.push({
      id: `LOAD_${s}`, phase: 'LOAD', color: 'neutral',
      seriesLabel: sl, seriesIndex: s,
      label: 'LOAD', sublabel: sl,
      duration: T.LOAD, command: loadCommand(s), sound: null,
    });

    steps.push({
      id: `ATT_${s}`, phase: 'ATTENTION', color: 'red',
      seriesLabel: sl, seriesIndex: s,
      label: 'ATTENTION', sublabel: 'Targets turning — get ready',
      duration: T.ATTENTION, command: 'Attention.', sound: null,
    });

    steps.push({
      id: `FIRE_${s}`, phase: 'FIRE', color: 'green',
      seriesLabel: sl, seriesIndex: s,
      label: 'FIRE', sublabel: '5 shots — 4 minutes',
      duration: T.PRECISION, command: null, sound: 'start',
    });

    steps.push({
      id: `STOP_${s}`, phase: 'STOP', color: 'red',
      seriesLabel: sl, seriesIndex: s,
      label: 'STOP', sublabel: 'Time up',
      duration: T.STOP_HOLD, command: 'Stop.', sound: 'stop',
    });

    steps.push({
      id: `UNLOAD_${s}`, phase: 'UNLOAD', color: 'red',
      seriesLabel: sl, seriesIndex: s,
      label: 'UNLOAD', sublabel: 'Show clear firearm',
      duration: T.UNLOAD, command: 'Unload.', sound: null,
    });

    if (s < TOTAL_SERIES - 1) {
      steps.push({
        id: `REST_${s}`, phase: 'REST', color: 'neutral',
        seriesLabel: sl, seriesIndex: s,
        label: 'REST', sublabel: `Next: ${seriesLabel(s + 1)}`,
        duration: T.REST, command: null, sound: null,
      });
    }
  }

  steps.push({
    id: 'DONE', phase: 'DONE', color: 'neutral',
    label: 'TRAINING COMPLETE', sublabel: '6 competition series done',
    duration: 0, command: 'Training complete. Well done.', sound: null,
  });

  return steps;
}

// ─── Rapid-fire ─────────────────────────────────────────────────────────────

export function buildRapidFireSequence() {
  const steps = [];

  steps.push({
    id: 'PREP', phase: 'PREP', color: 'neutral',
    label: 'PREPARATION', sublabel: '3 minutes — get ready',
    duration: T.PREP, command: 'Preparation time. Three minutes.', sound: null,
  });

  for (let s = 0; s < TOTAL_SERIES; s++) {
    const sl = seriesLabel(s);

    steps.push({
      id: `LOAD_${s}`, phase: 'LOAD', color: 'neutral',
      seriesLabel: sl, seriesIndex: s,
      label: 'LOAD', sublabel: sl,
      duration: T.LOAD, command: loadCommand(s), sound: null,
    });

    steps.push({
      id: `ATT_${s}`, phase: 'ATTENTION', color: 'red',
      seriesLabel: sl, seriesIndex: s,
      label: 'ATTENTION', sublabel: 'Arm down — ready position (≤ 45°)',
      duration: T.ATTENTION, command: 'Attention. Ready position.', sound: null,
    });

    // 5 shot cycles: GREEN 3s → RED 7s (skip final RED, go straight to STOP)
    for (let shot = 1; shot <= 5; shot++) {
      steps.push({
        id: `FIRE_${s}_${shot}`, phase: 'FIRE', color: 'green',
        seriesLabel: sl, seriesIndex: s, shotNum: shot,
        label: `SHOT ${shot}`, sublabel: 'FIRE NOW',
        duration: T.RF_GREEN, command: null, sound: 'start',
      });

      if (shot < 5) {
        steps.push({
          id: `READY_${s}_${shot}`, phase: 'READY', color: 'red',
          seriesLabel: sl, seriesIndex: s, shotNum: shot,
          label: 'READY', sublabel: 'Lower arm — ≤ 45°',
          duration: T.RF_RED, command: null, sound: 'shortStop',
        });
      }
    }

    steps.push({
      id: `STOP_${s}`, phase: 'STOP', color: 'red',
      seriesLabel: sl, seriesIndex: s,
      label: 'STOP', sublabel: 'Series complete',
      duration: T.STOP_HOLD, command: 'Stop.', sound: 'stop',
    });

    steps.push({
      id: `UNLOAD_${s}`, phase: 'UNLOAD', color: 'red',
      seriesLabel: sl, seriesIndex: s,
      label: 'UNLOAD', sublabel: 'Show clear firearm',
      duration: T.UNLOAD, command: 'Unload.', sound: null,
    });

    if (s < TOTAL_SERIES - 1) {
      steps.push({
        id: `REST_${s}`, phase: 'REST', color: 'neutral',
        seriesLabel: sl, seriesIndex: s,
        label: 'REST', sublabel: `Next: ${seriesLabel(s + 1)}`,
        duration: T.REST, command: null, sound: null,
      });
    }
  }

  steps.push({
    id: 'DONE', phase: 'DONE', color: 'neutral',
    label: 'TRAINING COMPLETE', sublabel: '6 competition series done',
    duration: 0, command: 'Training complete. Well done.', sound: null,
  });

  return steps;
}
