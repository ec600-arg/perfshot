import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Platform,
} from 'react-native';
import { Colors, Fonts } from '../theme';

const MODES = [
  {
    key: 'precision',
    title: 'PRECISION',
    titleEs: 'Fase de Precisión',
    detail: '6 series × 5 shots\n4 min per series',
    accent: Colors.green,
    icon: '🎯',
    bullets: ['1 min to load', '7s delay after ATTENTION', '240s fire window'],
  },
  {
    key: 'rapidfire',
    title: 'RAPID-FIRE',
    titleEs: 'Fase de Velocidad',
    detail: '6 series × 5 shots\n3s per shot',
    accent: Colors.red,
    icon: '⚡',
    bullets: ['1 min to load', '7s delay after ATTENTION', '3s fire / 7s ready'],
  },
];

export default function HomeScreen({ onSelectMode }) {
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      <View style={s.header}>
        <Text style={s.appName}>PERFSHOT</Text>
        <Text style={s.appSub}>25M Sport Pistol Timer</Text>
      </View>

      <View style={s.cards}>
        {MODES.map((mode) => (
          <TouchableOpacity
            key={mode.key}
            style={[s.card, { borderColor: mode.accent }]}
            onPress={() => onSelectMode(mode.key)}
            activeOpacity={0.8}
          >
            <View style={[s.cardTop, { backgroundColor: mode.accent + '22' }]}>
              <Text style={s.cardIcon}>{mode.icon}</Text>
              <View>
                <Text style={[s.cardTitle, { color: mode.accent }]}>{mode.title}</Text>
                <Text style={s.cardTitleEs}>{mode.titleEs}</Text>
              </View>
            </View>

            <Text style={s.cardDetail}>{mode.detail}</Text>

            <View style={s.bullets}>
              {mode.bullets.map((b) => (
                <View key={b} style={s.bulletRow}>
                  <Text style={[s.bulletDot, { color: mode.accent }]}>•</Text>
                  <Text style={s.bulletText}>{b}</Text>
                </View>
              ))}
            </View>

            <View style={[s.startBtn, { backgroundColor: mode.accent }]}>
              <Text style={s.startBtnText}>START SESSION</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.footer}>ISSF 25m Sport Pistol — Official Timing</Text>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 24 : 16,
    paddingBottom: 20,
  },
  appName: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 6,
    color: Colors.white,
  },
  appSub: {
    fontSize: Fonts.small + 1,
    color: Colors.muted,
    letterSpacing: 2,
    marginTop: 4,
  },

  cards: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  cardIcon: {
    fontSize: 28,
  },
  cardTitle: {
    fontSize: Fonts.large - 4,
    fontWeight: '800',
    letterSpacing: 3,
  },
  cardTitleEs: {
    fontSize: Fonts.small,
    color: Colors.muted,
    marginTop: 2,
  },
  cardDetail: {
    fontSize: Fonts.base,
    color: Colors.white,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 12,
    lineHeight: 22,
  },
  bullets: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 4,
    flex: 1,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  bulletDot: {
    fontSize: 16,
    lineHeight: 20,
  },
  bulletText: {
    fontSize: Fonts.small + 1,
    color: Colors.muted,
  },
  startBtn: {
    margin: 12,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  startBtnText: {
    fontSize: Fonts.base,
    fontWeight: '800',
    letterSpacing: 2,
    color: Colors.white,
  },

  footer: {
    textAlign: 'center',
    fontSize: Fonts.small,
    color: Colors.dim,
    letterSpacing: 1,
    paddingVertical: 12,
  },
});
