import { GrowingPlant, POT_NAME_KEYS, POT_STYLES, SPECIES_NAME_KEYS } from '@/components/GrowingPlant';
import { GroveStrip } from '@/components/GroveStrip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
    buildGrovePlants, canHarvest, collectDew, detectStageUps, dewRatePerHour,
    GrovePlant, harvestCooldownDays, harvestPlant, MAX_IDLE_HOURS, pendingDew,
    plantSeed, RARE_SPECIES, STAGE_DEW_RATE, STAGE_LABEL_KEYS, streakMultiplier,
} from '@/utils/Grove';
import {
    buyDecoration, buyPlanter, buySunshineBoost, buyStreakFreezeWithDew,
    DECORATION_CATALOG, DEW_BURST_DAILY_CAP, DEW_COST_FREEZE, DEW_COST_SUNSHINE,
    equipDecoration, getDecks, getGroveEconomy, getUserStats, GroveEconomy,
    MAX_STREAK_FREEZES, POT_PRICES,
} from '@/utils/Storage';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { CalendarDays, Check, ChevronRight, Droplet, Droplets, Fence, Flower2, Lamp, Moon, Snowflake, Sprout, Stone, Sun, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DECORATION_ICONS: Record<string, typeof Fence> = {
    stones: Stone,
    lanterns: Lamp,
    fence: Fence,
};

export default function GroveScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const { t } = useLanguage();

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const secondaryBg = useThemeColor({}, 'secondary');
    const accentColor = useThemeColor({}, 'primary');
    const primaryForeground = useThemeColor({}, 'primaryForeground');
    const borderColor = useThemeColor({}, 'border');

    const [plants, setPlants] = useState<GrovePlant[]>([]);
    const [selected, setSelected] = useState<GrovePlant | null>(null);
    const [econ, setEcon] = useState<GroveEconomy | null>(null);
    const [streak, setStreak] = useState(0);
    const [freezes, setFreezes] = useState(0);

    const loadData = useCallback(() => {
        Promise.all([getDecks(), getGroveEconomy(), getUserStats()])
            .then(([decks, economy, stats]) => {
                setPlants(buildGrovePlants(decks, economy.speciesOverrides, economy.planters));
                setEcon(economy);
                setStreak(stats.currentStreak || 0);
                setFreezes(stats.streakFreezes || 0);
                // Celebrate any plants that grew a stage since the last look
                return detectStageUps();
            })
            .then(ups => {
                (ups || []).slice(0, 3).forEach((up, i) => {
                    setTimeout(() => {
                        showToast({ message: t('groveGrewInto').replace('{name}', up.deckName).replace('{stage}', t(STAGE_LABEL_KEYS[up.stage])), type: 'success' });
                    }, i * 700);
                });
            })
            .catch(() => { });
    }, [showToast, t]);

    useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

    const blossoming = plants.filter(p => p.stage === 'blossoming').length;
    const resting = plants.filter(p => p.resting).length;
    const totalDue = plants.reduce((sum, p) => sum + p.dueCards, 0);

    const pending = econ ? pendingDew(plants, econ, streak) : 0;
    const rate = dewRatePerHour(plants, streak);
    const multiplier = streakMultiplier(streak);
    const boostActive = econ ? Date.now() < econ.boostUntil : false;
    const boostMinutesLeft = econ && boostActive ? Math.max(1, Math.ceil((econ.boostUntil - Date.now()) / 60000)) : 0;

    const handleCollect = async () => {
        if (pending <= 0) return;
        const result = await collectDew(plants);
        setEcon(prev => prev ? { ...prev, dew: result.balance, lastCollectedAt: Date.now() } : prev);
        showToast({ message: t('groveCollected').replace('{n}', String(result.collected)), type: 'success' });
    };

    const handleBuyFreeze = async () => {
        const result = await buyStreakFreezeWithDew();
        if (result.ok) {
            setFreezes(result.streakFreezes);
            setEcon(prev => prev ? { ...prev, dew: result.dew } : prev);
            showToast({ message: t('groveFreezeBanked'), type: 'success' });
        } else {
            showToast({
                message: result.reason === 'max' ? t('groveFreezesFull') : t('groveNotEnoughDew'),
                type: 'info',
            });
        }
    };

    const handleBuySunshine = async () => {
        const result = await buySunshineBoost();
        if (result.ok) {
            setEcon(prev => prev ? { ...prev, dew: result.dew, boostUntil: result.boostUntil } : prev);
            showToast({ message: t('groveSunshineActivated'), type: 'success' });
        } else {
            showToast({
                message: result.reason === 'active' ? t('groveSunshineAlreadyShining') : t('groveNotEnoughDew'),
                type: 'info',
            });
        }
    };

    const handleHarvest = async () => {
        if (!selected) return;
        const result = await harvestPlant(selected);
        if (!result.ok) return;
        setEcon(prev => prev ? { ...prev, seeds: result.seeds, harvests: { ...prev.harvests, [selected.deckId]: Date.now() } } : prev);
        showToast({ message: t('groveHarvestedSeed'), type: 'success' });
    };

    const handlePlantSeed = async (species: number) => {
        if (!selected) return;
        const deckId = selected.deckId;
        const result = await plantSeed(deckId, species);
        if (!result.ok) return;
        setEcon(prev => prev ? {
            ...prev,
            seeds: result.seeds,
            speciesOverrides: { ...prev.speciesOverrides, [deckId]: species },
        } : prev);
        setSelected(prev => prev ? { ...prev, species } : prev);
        setPlants(prev => prev.map(p => p.deckId === deckId ? { ...p, species } : p));
        showToast({ message: t('groveTakesRoot').replace('{name}', t(SPECIES_NAME_KEYS[species])), type: 'success' });
    };

    const handleBuyPlanter = async (potId: string) => {
        if (!selected) return;
        const deckId = selected.deckId;
        const result = await buyPlanter(deckId, potId);
        if (!result.ok) {
            showToast({ message: t('groveNotEnoughDew'), type: 'info' });
            return;
        }
        setEcon(prev => prev ? { ...prev, dew: result.dew, planters: result.planters } : prev);
        setSelected(prev => prev ? { ...prev, potStyle: potId as GrovePlant['potStyle'] } : prev);
        setPlants(prev => prev.map(p => p.deckId === deckId ? { ...p, potStyle: potId as GrovePlant['potStyle'] } : p));
        showToast({ message: t('grovePotted').replace('{name}', t(POT_NAME_KEYS[potId as keyof typeof POT_NAME_KEYS])), type: 'success' });
    };

    const handleBuyDecoration = async (decorationId: string) => {
        const result = await buyDecoration(decorationId);
        if (!result.ok) {
            showToast({ message: t('groveNotEnoughDew'), type: 'info' });
            return;
        }
        setEcon(prev => prev ? { ...prev, dew: result.dew, ownedDecorations: result.ownedDecorations, equippedDecoration: decorationId } : prev);
        showToast({ message: t('groveDecorationAdded'), type: 'success' });
    };

    const handleEquipDecoration = async (decorationId: string) => {
        const updated = await equipDecoration(decorationId);
        setEcon(prev => prev ? { ...prev, equippedDecoration: updated.equippedDecoration } : prev);
    };

    // Watering studies exactly the overdue cards via the drill mechanism —
    // swipe's own "due" mode also pulls in every never-studied card, which
    // would turn "water 2 cards" into a 200-card session.
    const startStudy = (plant: GrovePlant) => {
        setSelected(null);
        router.push({
            pathname: '/swipe',
            params: plant.dueCards > 0
                ? {
                    id: plant.deckId,
                    uri: plant.uri,
                    name: plant.deckName,
                    mode: 'all',
                    cards: plant.dueIndices.join(','),
                    water: '1',
                }
                : {
                    id: plant.deckId,
                    uri: plant.uri,
                    name: plant.deckName,
                    mode: 'all',
                },
        });
    };

    const statPill = (icon: React.ReactNode, value: number, label: string) => (
        <View style={[styles.statPill, { backgroundColor: secondaryBg }]}>
            {icon}
            <Text style={[styles.statPillValue, { color: textColor }]}>{value}</Text>
            <Text style={[styles.statPillLabel, { color: mutedForeground }]}>{label}</Text>
        </View>
    );

    const renderPlant = ({ item }: { item: GrovePlant }) => (
        <TouchableOpacity
            style={[styles.plantCard, { backgroundColor: secondaryBg }]}
            activeOpacity={0.85}
            onPress={() => setSelected(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.deckName}, ${t(STAGE_LABEL_KEYS[item.stage])}${item.resting ? ', resting' : ''}${item.dueCards > 0 ? `, ${item.dueCards} cards due` : ''}`}
        >
            <View style={styles.badgeRow}>
                {item.examPlan && item.examPlan.daysLeft >= 0 ? (
                    <View style={[styles.badge, { backgroundColor: accentColor }]}>
                        <CalendarDays size={11} color={backgroundColor} strokeWidth={2.5} />
                        <Text style={[styles.badgeText, { color: backgroundColor }]}>
                            {item.examPlan.daysLeft === 0 ? t('groveToday') : `${item.examPlan.daysLeft}d`}
                        </Text>
                    </View>
                ) : <View />}
                {item.resting ? (
                    <View style={[styles.badge, { backgroundColor: backgroundColor }]}>
                        <Moon size={11} color={mutedForeground} strokeWidth={2.5} />
                        <Text style={[styles.badgeText, { color: mutedForeground }]}>{t('groveResting')}</Text>
                    </View>
                ) : item.dueCards > 0 ? (
                    <View style={[styles.badge, { backgroundColor: backgroundColor }]}>
                        <Droplets size={11} color={mutedForeground} strokeWidth={2.5} />
                        <Text style={[styles.badgeText, { color: mutedForeground }]}>{item.dueCards}</Text>
                    </View>
                ) : null}
            </View>

            <GrowingPlant
                progress={item.growth}
                size={104}
                color={item.resting ? mutedForeground : accentColor}
                soilColor={borderColor}
                wilted={item.resting}
                sway={!item.resting}
                species={item.species}
                potStyle={item.potStyle}
            />

            <Text style={[styles.plantName, { color: textColor }]} numberOfLines={1}>{item.deckName}</Text>
            <View style={styles.chipRow}>
                <View style={[styles.stageChip, { backgroundColor: backgroundColor }]}>
                    <Text style={[styles.stageChipText, { color: mutedForeground }]}>{t(STAGE_LABEL_KEYS[item.stage])}</Text>
                </View>
                {!item.resting && STAGE_DEW_RATE[item.stage] > 0 && (
                    <View style={[styles.stageChip, { backgroundColor: backgroundColor }]}>
                        <Droplet size={9} color={mutedForeground} strokeWidth={2.5} />
                        <Text style={[styles.stageChipText, { color: mutedForeground }]}>
                            {Math.round(STAGE_DEW_RATE[item.stage] * multiplier * 10) / 10}/h
                        </Text>
                    </View>
                )}
            </View>

            <View style={styles.maturityRow}>
                <View style={[styles.maturityTrack, { backgroundColor: backgroundColor }]}>
                    <View style={[styles.maturityFill, {
                        backgroundColor: item.resting ? mutedForeground : accentColor,
                        width: `${Math.max(3, Math.round(item.maturity * 100))}%`,
                    }]} />
                </View>
                <Text style={[styles.maturityText, { color: mutedForeground }]}>{Math.round(item.maturity * 100)}%</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <Stack.Screen options={{
                title: t('homeGroveTitle'),
                headerStyle: { backgroundColor },
                headerTintColor: textColor,
                headerShadowVisible: false,
            }} />

            <FlatList
                data={plants}
                renderItem={renderPlant}
                keyExtractor={item => item.deckId}
                numColumns={2}
                columnWrapperStyle={styles.row}
                contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                    plants.length > 0 ? (
                        <View>
                            {/* Dew balance + collect */}
                            <View style={[styles.dewPanel, { backgroundColor: secondaryBg }]}>
                                <View style={[styles.dewIcon, { backgroundColor: accentColor + '15' }]}>
                                    <Droplet size={22} color={accentColor} strokeWidth={2.5} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.dewBalance, { color: textColor }]}>{econ?.dew ?? 0}</Text>
                                    <Text style={[styles.dewLabel, { color: mutedForeground }]}>
                                        {t('groveDewPerHour').replace('{n}', String(Math.round(rate * 10) / 10))}
                                        {multiplier > 1 ? t('groveStreakMultiplier').replace('{n}', String(multiplier)) : ''}
                                        {boostActive ? t('groveSunMinutesLeft').replace('{n}', String(boostMinutesLeft)) : ''}
                                        {(econ?.seeds ?? 0) > 0 ? t(econ!.seeds === 1 ? 'groveSeedCountOne' : 'groveSeedCountMany').replace('{n}', String(econ!.seeds)) : ''}
                                    </Text>
                                </View>
                                {pending > 0 ? (
                                    <TouchableOpacity
                                        style={[styles.collectButton, { backgroundColor: accentColor }]}
                                        onPress={handleCollect}
                                        activeOpacity={0.85}
                                        accessibilityLabel={`Collect ${pending} dew`}
                                        accessibilityRole="button"
                                    >
                                        <Droplets size={15} color={primaryForeground} strokeWidth={2.5} />
                                        <Text style={[styles.collectText, { color: primaryForeground }]}>+{pending}</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <Text style={[styles.collectedHint, { color: mutedForeground }]}>{t('groveCollectedHint')}</Text>
                                )}
                            </View>

                            <View style={[styles.hero, { backgroundColor: secondaryBg }]}>
                                <GroveStrip plants={plants} onPressPlant={setSelected} large decoration={econ?.equippedDecoration ?? null} />
                            </View>

                            <View style={styles.statRowContainer}>
                                {statPill(<Sprout size={14} color={accentColor} strokeWidth={2.5} />, plants.length, plants.length === 1 ? t('homePlant') : t('homePlants'))}
                                {statPill(<Flower2 size={14} color={accentColor} strokeWidth={2.5} />, blossoming, t('groveBlossoming'))}
                                {resting > 0
                                    ? statPill(<Moon size={14} color={mutedForeground} strokeWidth={2.5} />, resting, t('groveResting'))
                                    : statPill(<Droplets size={14} color={accentColor} strokeWidth={2.5} />, totalDue, t('groveToWater'))}
                            </View>
                        </View>
                    ) : null
                }
                ListFooterComponent={
                    plants.length > 0 ? (
                        <View>
                            <Text style={[styles.sectionTitle, { color: textColor }]}>{t('groveShop')}</Text>

                            <TouchableOpacity
                                style={[styles.shopCard, { backgroundColor: secondaryBg, opacity: freezes >= MAX_STREAK_FREEZES ? 0.55 : 1 }]}
                                onPress={handleBuyFreeze}
                                activeOpacity={0.85}
                                disabled={freezes >= MAX_STREAK_FREEZES}
                                accessibilityLabel={`Buy streak freeze for ${DEW_COST_FREEZE} dew`}
                                accessibilityRole="button"
                            >
                                <View style={[styles.dewIcon, { backgroundColor: accentColor + '15' }]}>
                                    <Snowflake size={20} color={accentColor} strokeWidth={2.5} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.shopTitle, { color: textColor }]}>{t('groveStreakFreeze')}</Text>
                                    <Text style={[styles.shopSub, { color: mutedForeground }]}>
                                        {t('groveFreezeSub').replace('{n}', String(freezes)).replace('{max}', String(MAX_STREAK_FREEZES))}
                                    </Text>
                                </View>
                                <View style={[styles.priceChip, { backgroundColor: backgroundColor }]}>
                                    <Droplet size={12} color={(econ?.dew ?? 0) >= DEW_COST_FREEZE ? accentColor : mutedForeground} strokeWidth={2.5} />
                                    <Text style={[styles.priceText, { color: (econ?.dew ?? 0) >= DEW_COST_FREEZE ? textColor : mutedForeground }]}>
                                        {DEW_COST_FREEZE.toLocaleString()}
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.shopCard, { backgroundColor: secondaryBg, opacity: boostActive ? 0.55 : 1 }]}
                                onPress={handleBuySunshine}
                                activeOpacity={0.85}
                                disabled={boostActive}
                                accessibilityLabel={`Buy sunshine boost for ${DEW_COST_SUNSHINE} dew`}
                                accessibilityRole="button"
                            >
                                <View style={[styles.dewIcon, { backgroundColor: accentColor + '15' }]}>
                                    <Sun size={20} color={accentColor} strokeWidth={2.5} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.shopTitle, { color: textColor }]}>{t('groveSunshine')}</Text>
                                    <Text style={[styles.shopSub, { color: mutedForeground }]}>
                                        {boostActive ? t('groveShining').replace('{n}', String(boostMinutesLeft)) : t('groveSunshineSub')}
                                    </Text>
                                </View>
                                <View style={[styles.priceChip, { backgroundColor: backgroundColor }]}>
                                    <Droplet size={12} color={(econ?.dew ?? 0) >= DEW_COST_SUNSHINE ? accentColor : mutedForeground} strokeWidth={2.5} />
                                    <Text style={[styles.priceText, { color: (econ?.dew ?? 0) >= DEW_COST_SUNSHINE ? textColor : mutedForeground }]}>
                                        {DEW_COST_SUNSHINE}
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <Text style={[styles.subsectionTitle, { color: mutedForeground }]}>{t('groveDecorationsHeader')}</Text>
                            {DECORATION_CATALOG.map(dec => {
                                const owned = econ?.ownedDecorations.includes(dec.id) ?? false;
                                const equipped = econ?.equippedDecoration === dec.id;
                                const Icon = DECORATION_ICONS[dec.id] || Fence;
                                const decName = t(dec.nameKey);
                                return (
                                    <TouchableOpacity
                                        key={dec.id}
                                        style={[styles.shopCard, { backgroundColor: secondaryBg, opacity: !owned && (econ?.dew ?? 0) < dec.price ? 0.55 : 1 }]}
                                        onPress={() => owned ? handleEquipDecoration(dec.id) : handleBuyDecoration(dec.id)}
                                        activeOpacity={0.85}
                                        accessibilityLabel={owned ? `${equipped ? 'Remove' : 'Show'} ${decName}` : `Buy ${decName} for ${dec.price} dew`}
                                        accessibilityRole="button"
                                    >
                                        <View style={[styles.dewIcon, { backgroundColor: accentColor + '15' }]}>
                                            <Icon size={20} color={accentColor} strokeWidth={2.5} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.shopTitle, { color: textColor }]}>{decName}</Text>
                                            <Text style={[styles.shopSub, { color: mutedForeground }]}>
                                                {owned ? (equipped ? t('groveShownOnShelf') : t('groveOwnedTapToShow')) : t('groveGroveWideBackdrop')}
                                            </Text>
                                        </View>
                                        {owned ? (
                                            equipped ? <Check size={18} color={accentColor} strokeWidth={2.5} /> : null
                                        ) : (
                                            <View style={[styles.priceChip, { backgroundColor: backgroundColor }]}>
                                                <Droplet size={12} color={(econ?.dew ?? 0) >= dec.price ? accentColor : mutedForeground} strokeWidth={2.5} />
                                                <Text style={[styles.priceText, { color: (econ?.dew ?? 0) >= dec.price ? textColor : mutedForeground }]}>
                                                    {dec.price.toLocaleString()}
                                                </Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}

                            <Text style={[styles.footnote, { color: mutedForeground }]}>
                                {t('groveFootnote').replace('{idle}', String(MAX_IDLE_HOURS)).replace('{burst}', String(DEW_BURST_DAILY_CAP))}
                            </Text>
                        </View>
                    ) : null
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={[styles.emptyIcon, { backgroundColor: secondaryBg }]}>
                            <Sprout size={44} color={accentColor} strokeWidth={2} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: textColor }]}>{t('groveEmptyTitle')}</Text>
                        <Text style={[styles.emptyText, { color: mutedForeground }]}>
                            {t('groveEmptyText')}
                        </Text>
                    </View>
                }
            />

            <BottomSheet
                visible={selected !== null}
                onClose={() => setSelected(null)}
                sheetStyle={[styles.sheet, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
            >
                {selected && (
                    <>
                        <View style={styles.sheetHeader}>
                            <Text style={[styles.sheetTitle, { color: textColor }]} numberOfLines={1}>{selected.deckName}</Text>
                            <TouchableOpacity onPress={() => setSelected(null)} accessibilityLabel="Close" accessibilityRole="button">
                                <X size={20} color={textColor} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.sheetPlant}>
                            <GrowingPlant
                                progress={selected.growth}
                                size={130}
                                color={selected.resting ? mutedForeground : accentColor}
                                soilColor={borderColor}
                                wilted={selected.resting}
                                sway={!selected.resting}
                                species={selected.species}
                                potStyle={selected.potStyle}
                            />
                            <Text style={[styles.sheetStage, { color: textColor }]}>{t(STAGE_LABEL_KEYS[selected.stage])}</Text>
                            {selected.resting ? (
                                <Text style={[styles.sheetHint, { color: mutedForeground }]}>
                                    {t('groveRestingHint')}
                                </Text>
                            ) : selected.stage === 'blossoming' ? (
                                <Text style={[styles.sheetHint, { color: mutedForeground }]}>
                                    {t('groveFullyMatureHint')}
                                </Text>
                            ) : null}
                        </View>

                        <View style={[styles.detailRow, { borderColor }]}>
                            <Text style={[styles.detailLabel, { color: mutedForeground }]}>{t('groveMaturity')}</Text>
                            <Text style={[styles.detailValue, { color: textColor }]}>
                                {t('groveMaturityValue').replace('{pct}', String(Math.round(selected.maturity * 100))).replace('{mature}', String(selected.matureCards)).replace('{total}', String(selected.totalCards))}
                            </Text>
                        </View>
                        <View style={[styles.detailRow, { borderColor }]}>
                            <Text style={[styles.detailLabel, { color: mutedForeground }]}>{t('groveReviewed')}</Text>
                            <Text style={[styles.detailValue, { color: textColor }]}>{t('groveCardsOfTotal').replace('{n}', String(selected.reviewed)).replace('{total}', String(selected.totalCards))}</Text>
                        </View>
                        <View style={[styles.detailRow, { borderColor }]}>
                            <Text style={[styles.detailLabel, { color: mutedForeground }]}>{t('groveDueNow')}</Text>
                            <Text style={[styles.detailValue, { color: textColor }]}>{t('groveCardsCount').replace('{n}', String(selected.dueCards))}</Text>
                        </View>
                        {selected.examPlan && selected.examPlan.daysLeft >= 0 && (
                            <View style={[styles.detailRow, { borderColor }]}>
                                <Text style={[styles.detailLabel, { color: mutedForeground }]}>{t('groveExam')}</Text>
                                <Text style={[styles.detailValue, { color: textColor }]}>
                                    {selected.examPlan.daysLeft === 0 ? t('groveToday') : t('groveInDays').replace('{n}', String(selected.examPlan.daysLeft))}
                                </Text>
                            </View>
                        )}

                        <View style={styles.seedSection}>
                            <Text style={[styles.seedLabel, { color: mutedForeground }]}>{t('grovePlanter')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.potChipRow}>
                                {POT_STYLES.map(pot => {
                                    const active = selected.potStyle === pot;
                                    const price = POT_PRICES[pot] || 0;
                                    const affordable = active || price === 0 || (econ?.dew ?? 0) >= price;
                                    const potName = t(POT_NAME_KEYS[pot]);
                                    return (
                                        <TouchableOpacity
                                            key={pot}
                                            style={[styles.potChip, { backgroundColor: secondaryBg, opacity: affordable ? 1 : 0.5, borderColor: active ? accentColor : 'transparent' }]}
                                            onPress={() => !active && handleBuyPlanter(pot)}
                                            disabled={active}
                                            activeOpacity={0.85}
                                            accessibilityLabel={active ? `${potName}, current planter` : `Switch to ${potName}${price > 0 ? ` for ${price} dew` : ''}`}
                                            accessibilityRole="button"
                                        >
                                            <GrowingPlant progress={0.5} size={44} color={accentColor} soilColor={borderColor} potStyle={pot} />
                                            <Text style={[styles.potChipText, { color: textColor }]} numberOfLines={1}>{potName}</Text>
                                            {active ? (
                                                <Check size={12} color={accentColor} strokeWidth={3} />
                                            ) : price > 0 ? (
                                                <View style={styles.potPriceRow}>
                                                    <Droplet size={10} color={mutedForeground} strokeWidth={2.5} />
                                                    <Text style={[styles.potPriceText, { color: mutedForeground }]}>{price}</Text>
                                                </View>
                                            ) : (
                                                <Text style={[styles.potPriceText, { color: mutedForeground }]}>{t('groveFree')}</Text>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        {selected.stage === 'blossoming' && econ && (
                            canHarvest(selected, econ) ? (
                                <TouchableOpacity
                                    style={[styles.harvestRow, { backgroundColor: secondaryBg }]}
                                    onPress={handleHarvest}
                                    activeOpacity={0.85}
                                    accessibilityLabel="Harvest a seed"
                                    accessibilityRole="button"
                                >
                                    <Flower2 size={18} color={accentColor} strokeWidth={2.5} />
                                    <Text style={[styles.harvestText, { color: textColor }]}>{t('groveHarvestSeed')}</Text>
                                </TouchableOpacity>
                            ) : (
                                <Text style={[styles.harvestHint, { color: mutedForeground }]}>
                                    {t('groveHarvestedNextIn').replace('{n}', String(harvestCooldownDays(selected, econ)))}
                                </Text>
                            )
                        )}

                        {(econ?.seeds ?? 0) > 0 && (
                            <View style={styles.seedSection}>
                                <Text style={[styles.seedLabel, { color: mutedForeground }]}>
                                    {t('grovePlantASeed').replace('{n}', String(econ!.seeds))}
                                </Text>
                                <View style={styles.seedChipRow}>
                                    {RARE_SPECIES.filter(s => s !== selected.species).map(s => (
                                        <TouchableOpacity
                                            key={s}
                                            style={[styles.seedChip, { backgroundColor: secondaryBg }]}
                                            onPress={() => handlePlantSeed(s)}
                                            activeOpacity={0.85}
                                            accessibilityLabel={`Plant a ${t(SPECIES_NAME_KEYS[s])}`}
                                            accessibilityRole="button"
                                        >
                                            <GrowingPlant progress={1} size={34} color={accentColor} soilColor={borderColor} species={s} />
                                            <Text style={[styles.seedChipText, { color: textColor }]}>{t(SPECIES_NAME_KEYS[s])}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        <Button
                            title={selected.dueCards > 0 ? t('groveWaterIt').replace('{n}', String(selected.dueCards)) : t('groveStudy')}
                            onPress={() => startStudy(selected)}
                            style={styles.sheetButton}
                        />
                        <Button
                            title={t('groveOpenDeck')}
                            variant="secondary"
                            onPress={() => {
                                const id = selected.deckId;
                                setSelected(null);
                                router.push({ pathname: '/deck-details', params: { id } });
                            }}
                            icon={<ChevronRight size={18} color={textColor} />}
                        />
                    </>
                )}
            </BottomSheet>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    dewPanel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 20,
        padding: 14,
        marginBottom: 12,
    },
    dewIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dewBalance: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    dewLabel: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 1,
    },
    collectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    collectText: {
        fontSize: 14,
        fontWeight: '900',
    },
    collectedHint: {
        fontSize: 12,
        fontWeight: '700',
        marginRight: 4,
    },
    hero: {
        borderRadius: 20,
        paddingVertical: 16,
        marginBottom: 12,
    },
    statRowContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    statPill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 6,
    },
    statPillValue: {
        fontSize: 14,
        fontWeight: '900',
    },
    statPillLabel: {
        fontSize: 11,
        fontWeight: '700',
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '900',
        letterSpacing: -0.3,
        marginTop: 8,
        marginBottom: 10,
        marginHorizontal: 4,
    },
    subsectionTitle: {
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginTop: 14,
        marginBottom: 8,
        marginHorizontal: 4,
    },
    shopCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 20,
        padding: 14,
        marginBottom: 10,
    },
    shopTitle: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    shopSub: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    },
    priceChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    priceText: {
        fontSize: 13,
        fontWeight: '800',
    },
    footnote: {
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 18,
        marginTop: 6,
        marginHorizontal: 4,
    },
    row: {
        gap: 12,
    },
    plantCard: {
        flex: 1,
        borderRadius: 20,
        paddingVertical: 14,
        paddingHorizontal: 12,
        marginBottom: 12,
        alignItems: 'center',
    },
    badgeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignSelf: 'stretch',
        minHeight: 20,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    plantName: {
        fontSize: 15,
        fontWeight: '700',
        marginTop: 6,
        textAlign: 'center',
    },
    chipRow: {
        flexDirection: 'row',
        gap: 5,
        marginTop: 5,
    },
    stageChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    stageChipText: {
        fontSize: 11,
        fontWeight: '700',
    },
    maturityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        gap: 8,
        marginTop: 10,
        paddingHorizontal: 2,
    },
    maturityTrack: {
        flex: 1,
        height: 5,
        borderRadius: 3,
        overflow: 'hidden',
    },
    maturityFill: {
        height: '100%',
        borderRadius: 3,
    },
    maturityText: {
        fontSize: 10,
        fontWeight: '800',
        minWidth: 28,
        textAlign: 'right',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 96,
        paddingHorizontal: 32,
    },
    emptyIcon: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 19,
        fontWeight: '800',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
    },
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 20,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    sheetTitle: {
        fontSize: 19,
        fontWeight: '800',
        flex: 1,
        marginRight: 12,
    },
    sheetPlant: {
        alignItems: 'center',
        marginBottom: 12,
    },
    sheetStage: {
        fontSize: 15,
        fontWeight: '700',
        marginTop: 4,
    },
    sheetHint: {
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
        marginTop: 6,
        paddingHorizontal: 8,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    detailLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '700',
    },
    sheetButton: {
        marginTop: 18,
        marginBottom: 10,
    },
    harvestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 16,
        paddingVertical: 12,
        marginTop: 14,
    },
    harvestText: {
        fontSize: 14,
        fontWeight: '800',
    },
    harvestHint: {
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 14,
    },
    seedSection: {
        marginTop: 14,
    },
    seedLabel: {
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 8,
    },
    seedChipRow: {
        flexDirection: 'row',
        gap: 8,
    },
    seedChip: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    seedChipText: {
        fontSize: 13,
        fontWeight: '700',
    },
    potChipRow: {
        flexDirection: 'row',
        gap: 8,
        paddingRight: 4,
    },
    potChip: {
        alignItems: 'center',
        width: 76,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderWidth: 1.5,
    },
    potChipText: {
        fontSize: 11,
        fontWeight: '700',
        marginTop: 2,
        maxWidth: '100%',
    },
    potPriceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginTop: 2,
    },
    potPriceText: {
        fontSize: 10,
        fontWeight: '700',
        marginTop: 2,
    },
});
