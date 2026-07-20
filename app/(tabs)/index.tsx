import { GroveStrip } from '@/components/GroveStrip';
import { LevelCard } from '@/components/LevelCard';
import { SprigLogo } from '@/components/SprigLogo';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { buildGrovePlants, GrovePlant, pendingDew } from '@/utils/Grove';
import { Deck, getDecks, getGroveEconomy, getUserStats, UserStats } from '@/utils/Storage';
import { buildTodayPlan, startTodaySession, TodayPlan } from '@/utils/TodayPlan';
import { useFocusEffect, useRouter } from 'expo-router';
import { CalendarCheck, ChevronRight, Layers, Leaf, Play } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';

function greetingKey(): 'greetingLateNight' | 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  const h = new Date().getHours();
  if (h < 5) return 'greetingLateNight';
  if (h < 12) return 'greetingMorning';
  if (h < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedForeground = useThemeColor({}, 'mutedForeground');
  const secondaryBg = useThemeColor({}, 'secondary');
  const accentColor = useThemeColor({}, 'primary');
  const primaryForeground = useThemeColor({}, 'primaryForeground');

  const [decks, setDecks] = useState<Deck[]>([]);
  const [plants, setPlants] = useState<GrovePlant[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [todayPlan, setTodayPlan] = useState<TodayPlan | null>(null);
  const [dewReady, setDewReady] = useState(0);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getDecks(), getUserStats(), getGroveEconomy()])
        .then(([savedDecks, savedStats, econ]) => {
          const csvDecks = savedDecks.filter(d => d.type === 'csv');
          const grovePlants = buildGrovePlants(csvDecks, econ.speciesOverrides, econ.planters);
          setDecks(csvDecks);
          setPlants(grovePlants);
          setStats(savedStats);
          setDewReady(pendingDew(grovePlants, econ, savedStats.currentStreak || 0));
        })
        .catch(() => { });
      buildTodayPlan().then(setTodayPlan).catch(() => setTodayPlan(null));
    }, [])
  );

  const handleStartToday = () => {
    if (!todayPlan || todayPlan.totalCards === 0) return;
    const first = startTodaySession(todayPlan);
    if (!first) return;
    router.push({
      pathname: '/swipe',
      params: {
        id: first.deckId,
        uri: first.uri,
        name: first.deckName,
        mode: 'all',
        cards: first.cardIndices.join(','),
        today: '1',
      },
    });
  };

  // A streak only counts if the last study day was today or yesterday
  const displayStreak = (() => {
    if (!stats?.lastStudyDate) return 0;
    const last = stats.lastStudyDate.split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = y.toISOString().split('T')[0];
    return (last === today || last === yesterday) ? stats.currentStreak : 0;
  })();

  const totalDue = plants.reduce((sum, p) => sum + p.dueCards, 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: mutedForeground }]}>{t(greetingKey())}</Text>
          <Text style={[styles.title, { color: textColor }]}>Sprig</Text>
        </View>
        <SprigLogo size={46} />
      </View>

      {stats && <LevelCard stats={stats} displayStreak={displayStreak} />}

      {todayPlan && todayPlan.totalCards > 0 && (
        <TouchableOpacity
          style={[styles.rowCard, { backgroundColor: secondaryBg }]}
          onPress={handleStartToday}
          activeOpacity={0.85}
          accessibilityLabel={`Start today's session with ${todayPlan.totalCards} cards`}
          accessibilityRole="button"
        >
          <View style={[styles.rowIcon, { backgroundColor: accentColor + '15' }]}>
            <CalendarCheck size={22} color={accentColor} strokeWidth={2.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: textColor }]}>
              {t('homeTodayTitle').replace('{n}', String(todayPlan.totalCards))}
            </Text>
            <Text style={[styles.rowSub, { color: mutedForeground }]} numberOfLines={1}>
              {[
                todayPlan.dueCount > 0 ? t('homeDueCount').replace('{n}', String(todayPlan.dueCount)) : null,
                todayPlan.examCount > 0 ? t('homeExamPrepCount').replace('{n}', String(todayPlan.examCount)) : null,
                todayPlan.trickyCount > 0 ? t('homeTrickyCount').replace('{n}', String(todayPlan.trickyCount)) : null,
              ].filter(Boolean).join(' · ') || t('homeReadyWhenYouAre')}
              {todayPlan.entries.length > 1 ? t('homeDecksSuffix').replace('{n}', String(todayPlan.entries.length)) : ''}
            </Text>
          </View>
          <View style={[styles.goButton, { backgroundColor: accentColor }]}>
            <Play size={16} color={primaryForeground} fill={primaryForeground} />
          </View>
        </TouchableOpacity>
      )}

      {plants.length > 0 && (
        <View style={[styles.groveCard, { backgroundColor: secondaryBg }]}>
          <TouchableOpacity
            style={styles.groveHeader}
            onPress={() => router.push('/grove')}
            activeOpacity={0.8}
            accessibilityLabel="Open the Grove"
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: textColor }]}>{t('homeGroveTitle')}</Text>
              <Text style={[styles.rowSub, { color: mutedForeground }]}>
                {plants.length} {plants.length === 1 ? t('homePlant') : t('homePlants')}
                {dewReady > 0 ? t('homeDewToCollect').replace('{n}', String(dewReady)) : ''}
                {totalDue > 0 ? t('homeCardsToWater').replace('{n}', String(totalDue)) : t('homeAllWatered')}
              </Text>
            </View>
            <ChevronRight size={20} color={mutedForeground} />
          </TouchableOpacity>
          <GroveStrip plants={plants} onPressPlant={() => router.push('/grove')} />
        </View>
      )}

      <TouchableOpacity
        style={[styles.rowCard, { backgroundColor: accentColor }]}
        onPress={() => router.push('/focus')}
        activeOpacity={0.9}
        accessibilityLabel="Start a focus session"
        accessibilityRole="button"
      >
        <View style={[styles.rowIcon, { backgroundColor: primaryForeground }]}>
          <Leaf size={22} color={accentColor} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: primaryForeground }]}>{t('homeFocusSession')}</Text>
          <Text style={[styles.rowSub, { color: primaryForeground }]}>{t('homeFocusSub')}</Text>
        </View>
        <ChevronRight size={20} color={primaryForeground} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.rowCard, { backgroundColor: secondaryBg }]}
        onPress={() => router.push('/decks')}
        activeOpacity={0.85}
        accessibilityLabel="Open your decks"
        accessibilityRole="button"
      >
        <View style={[styles.rowIcon, { backgroundColor: accentColor + '15' }]}>
          <Layers size={22} color={accentColor} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: textColor }]}>{t('homeMyDecks')}</Text>
          <Text style={[styles.rowSub, { color: mutedForeground }]}>
            {decks.length === 0
              ? t('homeCreateFirstDeck')
              : t('homeDeckCountSummary')
                .replace('{decks}', `${decks.length} ${decks.length === 1 ? t('homeDeck') : t('homeDecks')}`)
                .replace('{cards}', String(decks.reduce((s, d) => s + (d.totalCards || 0), 0)))}
          </Text>
        </View>
        <ChevronRight size={20} color={mutedForeground} />
      </TouchableOpacity>

      {decks.length === 0 && (
        <View style={styles.emptyContainer}>
          <View style={{ marginBottom: 20 }}>
            <SprigLogo size={96} />
          </View>
          <Text style={[styles.emptyTitle, { color: textColor }]}>{t('homePlantFirstDeckTitle')}</Text>
          <Text style={[styles.emptyText, { color: mutedForeground }]}>
            {t('homePlantFirstDeckText')}
          </Text>
          <Button
            title={t('homeCreateNewDeck')}
            onPress={() => router.push('/decks')}
            style={styles.emptyButton}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  rowSub: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.85,
    marginTop: 2,
  },
  goButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groveCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    paddingVertical: 14,
  },
  groveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    opacity: 0.7,
  },
  emptyButton: {
    width: '100%',
    height: 52,
    borderRadius: 16,
  },
});
