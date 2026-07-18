import { useToast } from '@/components/ui/Toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { AudioFile, deleteAudioFile, getAudioFiles, saveAudioFile } from '@/utils/Storage';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
    FileMusic,
    Music,
    Pause,
    Play,
    Plus,
    SlidersHorizontal,
    Trash2
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { SoundMixer } from '@/components/SoundMixer';

export default function AudioPlayerScreen() {
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const { t } = useLanguage();

    const [audios, setAudios] = useState<AudioFile[]>([]);
    const [player, setPlayer] = useState<AudioPlayer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentAudio, setCurrentAudio] = useState<AudioFile | null>(null);
    const [position, setPosition] = useState(0); // seconds
    const [duration, setDuration] = useState(0); // seconds
    const [mixerVisible, setMixerVisible] = useState(false);

    const backgroundColor = useThemeColor({}, 'background');
    const cardColor = useThemeColor({}, 'card');
    const textColor = useThemeColor({}, 'text');
    const mutedForeground = useThemeColor({}, 'mutedForeground');
    const accentColor = useThemeColor({}, 'primary');
    const accentForeground = useThemeColor({}, 'primaryForeground');
    const secondaryBg = useThemeColor({}, 'secondary');

    useEffect(() => {
        loadAudios();
    }, []);

    // Follow the active player's status; release it when replaced or on unmount.
    useEffect(() => {
        if (!player) return;
        const sub = player.addListener('playbackStatusUpdate', (status) => {
            setPosition(status.currentTime || 0);
            setDuration(status.duration || 0);
            setIsPlaying(status.playing);
        });
        return () => {
            sub.remove();
            try { player.remove(); } catch { /* already released */ }
        };
    }, [player]);

    const loadAudios = async () => {
        const files = await getAudioFiles();
        setAudios(files);
    };

    const handlePickAudio = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'audio/*',
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                await saveAudioFile(asset.uri, asset.name);
                loadAudios();
                showToast({ message: t('audioFileAdded'), type: 'success' });
            }
        } catch (e) {
            console.error('Error picking audio:', e);
            showToast({ message: t('failedPickAudio'), type: 'error' });
        }
    };

    const playAudio = async (item: AudioFile) => {
        try {
            await setAudioModeAsync({ playsInSilentMode: true }).catch(() => { });
            const newPlayer = createAudioPlayer({ uri: item.uri }, { updateInterval: 500 });
            newPlayer.play();

            // The [player] effect releases the previous instance on replace
            setPlayer(newPlayer);
            setCurrentAudio(item);
            setPosition(0);
            setDuration(0);
            setIsPlaying(true);
        } catch (e) {
            console.error('Error playing audio:', e);
            showToast({ message: t('failedPlayAudio'), type: 'error' });
        }
    };

    const togglePlayback = async () => {
        if (!player) return;
        if (isPlaying) {
            player.pause();
            setIsPlaying(false);
        } else {
            // Restart from the top if the track already finished
            if (duration > 0 && position >= duration - 0.25) {
                await player.seekTo(0).catch(() => { });
            }
            player.play();
            setIsPlaying(true);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: t('deleteAudio'),
            message: t('areYouSure'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            destructive: true,
        });
        if (!ok) return;
        if (currentAudio?.id === id && player) {
            // The [player] effect releases the instance once it's cleared
            setPlayer(null);
            setCurrentAudio(null);
            setIsPlaying(false);
        }
        await deleteAudioFile(id);
        loadAudios();
        showToast({ message: t('deleted'), type: 'info' });
    };

    const formatTime = (totalSeconds: number) => {
        if (!totalSeconds || !isFinite(totalSeconds)) return '0:00';
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const renderAudioItem = ({ item }: { item: AudioFile }) => {
        const isCurrent = currentAudio?.id === item.id;

        return (
            <TouchableOpacity
                style={[styles.audioCard, { backgroundColor: cardColor }]}
                onPress={() => playAudio(item)}
                activeOpacity={0.8}
            >
                <View style={styles.cardHeaderAction}>
                    <View style={[styles.audioIconWrapper, { backgroundColor: accentColor + '10' }]}>
                        <Music size={28} color={accentColor} strokeWidth={2.5} />
                    </View>
                    <TouchableOpacity
                        style={styles.deleteButtonContainer}
                        onPress={() => handleDelete(item.id)}
                        activeOpacity={0.5}
                        accessibilityLabel={`Delete ${item.name}`}
                        accessibilityRole="button"
                    >
                        <Trash2 size={16} color={mutedForeground} />
                    </TouchableOpacity>
                </View>

                <View style={styles.cardTop}>
                    {isCurrent && isPlaying && (
                        <View style={[styles.playingBadge, { backgroundColor: accentColor }]}>
                            <View style={styles.playingIndicator}>
                                <View style={[styles.playingBar, { backgroundColor: accentForeground, height: 8 }]} />
                                <View style={[styles.playingBar, { backgroundColor: accentForeground, height: 14 }]} />
                                <View style={[styles.playingBar, { backgroundColor: accentForeground, height: 10 }]} />
                            </View>
                            <Text style={[styles.playingText, { color: accentForeground }]}>{t('playing')}</Text>
                        </View>
                    )}
                </View>

                <View style={styles.cardBottom}>
                    <Text style={[styles.audioName, { color: textColor }]} numberOfLines={2}>{item.name}</Text>
                    <Text style={[styles.audioDate, { color: mutedForeground }]}>{t('audioTrack')}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.title, { color: textColor }]}>{t('audioLibrary')}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                        style={[styles.addButton, { backgroundColor: secondaryBg }]}
                        onPress={() => setMixerVisible(true)}
                        activeOpacity={0.9}
                        accessibilityLabel="Open ambient sound mixer"
                        accessibilityRole="button"
                    >
                        <SlidersHorizontal size={24} color={accentColor} strokeWidth={3} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.addButton, { backgroundColor: accentColor }]}
                        onPress={handlePickAudio}
                        activeOpacity={0.9}
                        accessibilityLabel="Add audio file"
                        accessibilityRole="button"
                    >
                        <Plus size={24} color={accentForeground} strokeWidth={3} />
                    </TouchableOpacity>
                </View>
            </View>

            <SoundMixer visible={mixerVisible} onClose={() => setMixerVisible(false)} />

            <FlatList
                data={audios}
                renderItem={renderAudioItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={[styles.listContent, { paddingBottom: currentAudio ? 200 : insets.bottom + 24 }]}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={7}
                removeClippedSubviews={true}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={[styles.emptyIcon, { backgroundColor: secondaryBg }]}>
                            <FileMusic size={48} color={accentColor} strokeWidth={2.5} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: textColor }]}>{t('noAudioMessage')}</Text>
                        <Text style={[styles.emptyText, { color: mutedForeground }]}>Upload audio notes or lessons to listen while you learn</Text>
                        <TouchableOpacity style={[styles.emptyButton, { backgroundColor: accentColor }]} onPress={handlePickAudio}>
                            <Text style={{ color: accentForeground, fontWeight: '800', fontSize: 15 }}>{t('addAudio')}</Text>
                        </TouchableOpacity>
                    </View>
                }
            />

            {currentAudio && (
                <View style={[styles.floatingPlayer, { bottom: insets.bottom + 10 }]}>
                    <BlurView intensity={80} tint={backgroundColor === '#ffffff' ? 'light' : 'dark'} style={styles.playerBlur}>
                        <View style={[styles.playerInner, { backgroundColor: cardColor + '90' }]}>
                            <View style={styles.progressContainer}>
                                <View style={[styles.progressBar, { backgroundColor: secondaryBg }]}>
                                    <View
                                        style={[
                                            styles.progressFill,
                                            {
                                                backgroundColor: accentColor,
                                                width: `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%`
                                            }
                                        ]}
                                    >
                                        <LinearGradient
                                            colors={[accentColor, accentColor + '80']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={{ flex: 1 }}
                                        />
                                    </View>
                                </View>
                            </View>

                            <View style={styles.playerMain}>
                                <View style={styles.playerInfoColumn}>
                                    <Text style={[styles.nowPlaying, { color: textColor }]} numberOfLines={1}>
                                        {currentAudio.name}
                                    </Text>
                                    <View style={styles.timeLabel}>
                                        <Text style={[styles.timeText, { color: accentColor }]}>
                                            {formatTime(position)}
                                        </Text>
                                        <Text style={[styles.timeDivider, { color: mutedForeground }]}> / </Text>
                                        <Text style={[styles.timeText, { color: mutedForeground }]}>
                                            {formatTime(duration)}
                                        </Text>
                                    </View>
                                </View>

                                <TouchableOpacity
                                    onPress={togglePlayback}
                                    style={[styles.floatingPlayBtn, { backgroundColor: accentColor }]}
                                    activeOpacity={0.8}
                                    accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                                    accessibilityRole="button"
                                >
                                    {isPlaying ? (
                                        <Pause size={24} color={accentForeground} fill={accentForeground} />
                                    ) : (
                                        <Play size={24} color={accentForeground} fill={accentForeground} style={{ marginLeft: 2 }} />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </BlurView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 20,
        zIndex: 10,
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: -1,
    },
    addButton: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 6,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        flexGrow: 1,
    },
    audioCard: {
        flex: 1,
        margin: 10,
        borderRadius: 28,
        padding: 24,
        minHeight: 190,
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 4,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.03)',
    },
    cardHeaderAction: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    audioIconWrapper: {
        width: 52,
        height: 52,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButtonContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTop: {
        marginBottom: 12,
        minHeight: 26,
    },
    playingBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
    },
    playingIndicator: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
    },
    playingBar: {
        width: 3,
        borderRadius: 2,
    },
    playingText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    cardBottom: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    audioName: {
        fontSize: 17,
        fontWeight: '800',
        lineHeight: 22,
        marginBottom: 8,
        letterSpacing: -0.3,
    },
    audioDate: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 100,
        paddingHorizontal: 40,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        opacity: 0.8,
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
        marginBottom: 32,
        opacity: 0.6,
    },
    emptyButton: {
        width: '100%',
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    floatingPlayer: {
        position: 'absolute',
        left: 16,
        right: 16,
        borderRadius: 32,
        overflow: 'hidden',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
    },
    playerBlur: {
        padding: 4,
    },
    playerInner: {
        padding: 16,
        paddingTop: 12,
        borderRadius: 30,
    },
    progressContainer: {
        marginBottom: 14,
    },
    progressBar: {
        height: 6,
        borderRadius: 3,
        width: '100%',
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    playerMain: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    playerInfoColumn: {
        flex: 1,
        marginRight: 16,
    },
    nowPlaying: {
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    timeLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    timeText: {
        fontSize: 12,
        fontWeight: '800',
    },
    timeDivider: {
        fontSize: 12,
        fontWeight: '600',
    },
    floatingPlayBtn: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    }
});
