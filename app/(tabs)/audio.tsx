import { useToast } from '@/components/ui/Toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { AudioFile, deleteAudioFile, Folder, getAudioFiles, getFolders, saveAudioFile, saveFolder, setAudioPosition, updateAudioFile } from '@/utils/Storage';
import Slider from '@react-native-community/slider';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import {
    CheckCircle2,
    Circle,
    FastForward,
    FileMusic,
    Folder as FolderIcon,
    FolderInput,
    Music,
    Pause,
    Play,
    Plus,
    Rewind,
    SlidersHorizontal,
    Trash2,
    X
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { SoundMixer } from '@/components/SoundMixer';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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

    // Folders (shared with the Library tab), long-press sheet, multi-select
    const [folders, setFolders] = useState<Folder[]>([]);
    const [activeFolderId, setActiveFolderId] = useState<string | 'all'>('all');
    const [editAudio, setEditAudio] = useState<AudioFile | null>(null);
    const [editAudioName, setEditAudioName] = useState('');
    const [editAudioFolderId, setEditAudioFolderId] = useState<string | null>(null);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [moveSheetVisible, setMoveSheetVisible] = useState(false);
    const [newFolderSheetVisible, setNewFolderSheetVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const [playbackRate, setPlaybackRateState] = useState(1);
    const pendingResumeRef = useRef<number | null>(null);
    const lastSaveRef = useRef(0);
    const seekingRef = useRef(false);

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

    // Refresh audio and folder lists whenever the tab regains focus, so
    // folders created on the Library tab show up here without a restart.
    useFocusEffect(
        useCallback(() => {
            loadAudios();
        }, [])
    );

    // Follow the active player's status; release it when replaced or on unmount.
    useEffect(() => {
        if (!player) return;
        const audioId = currentAudio?.id;
        const sub = player.addListener('playbackStatusUpdate', (status) => {
            // Resume where the track was left once the duration is known
            const resume = pendingResumeRef.current;
            if (resume !== null && status.duration > 0) {
                pendingResumeRef.current = null;
                if (resume < status.duration - 5) {
                    player.seekTo(resume).catch(() => { });
                    setPosition(resume);
                }
            }
            if (!seekingRef.current) setPosition(status.currentTime || 0);
            setDuration(status.duration || 0);
            setIsPlaying(status.playing);

            // Persist the position every few seconds so reopening resumes here;
            // a finished track restarts from the top next time.
            if (audioId) {
                if (status.didJustFinish) {
                    setAudioPosition(audioId, 0);
                } else if (status.playing && Date.now() - lastSaveRef.current > 5000) {
                    lastSaveRef.current = Date.now();
                    setAudioPosition(audioId, status.currentTime || 0);
                }
            }
        });
        return () => {
            sub.remove();
            try { player.remove(); } catch { /* already released */ }
        };
        // currentAudio is set in the same update as player, so [player] suffices
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player]);

    const loadAudios = async () => {
        const [files, savedFolders] = await Promise.all([getAudioFiles(), getFolders('audio')]);
        setAudios(files);
        setFolders(savedFolders);
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
            await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => { });
            const newPlayer = createAudioPlayer({ uri: item.uri }, { updateInterval: 500 });
            // Pick up where this track was left; the status listener seeks
            // once the duration is known.
            pendingResumeRef.current = item.position && item.position > 5 ? item.position : null;
            if (playbackRate !== 1) newPlayer.setPlaybackRate(playbackRate, 'high');
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
            if (currentAudio) setAudioPosition(currentAudio.id, position);
        } else {
            // Restart from the top if the track already finished
            if (duration > 0 && position >= duration - 0.25) {
                await player.seekTo(0).catch(() => { });
            }
            player.play();
            setIsPlaying(true);
        }
    };

    const seekTo = (seconds: number) => {
        if (!player) return;
        const to = Math.max(0, duration > 0 ? Math.min(duration, seconds) : seconds);
        player.seekTo(to).catch(() => { });
        setPosition(to);
        if (currentAudio) setAudioPosition(currentAudio.id, to);
    };

    const skipBy = (delta: number) => seekTo(position + delta);

    const PLAYBACK_RATES = [1, 1.25, 1.5, 2];
    const cyclePlaybackRate = () => {
        const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length];
        setPlaybackRateState(next);
        if (player) player.setPlaybackRate(next, 'high');
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

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            await saveFolder(newFolderName.trim(), null, 'audio');
            setNewFolderName('');
            setNewFolderSheetVisible(false);
            loadAudios();
        } catch (e) {
            console.error('Error creating folder:', e);
            showToast({ message: 'Failed to create folder', type: 'error' });
        }
    };

    const openAudioMenu = (item: AudioFile) => {
        setEditAudio(item);
        setEditAudioName(item.name);
        setEditAudioFolderId(item.folderId || null);
    };

    const handleSaveAudioEdit = async () => {
        if (!editAudio || !editAudioName.trim()) return;
        try {
            await updateAudioFile(editAudio.id, editAudioName.trim(), editAudioFolderId);
            setEditAudio(null);
            loadAudios();
            showToast({ message: 'Audio updated', type: 'success' });
        } catch (e) {
            console.error('Error updating audio:', e);
            showToast({ message: 'Failed to update audio', type: 'error' });
        }
    };

    const startSelectMode = (firstId?: string) => {
        setEditAudio(null);
        setSelectMode(true);
        setSelectedIds(new Set(firstId ? [firstId] : []));
    };

    const exitSelectMode = () => {
        setSelectMode(false);
        setSelectedIds(new Set());
    };

    const toggleSelected = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleMoveSelected = async (folderId: string | null) => {
        setMoveSheetVisible(false);
        const count = selectedIds.size;
        try {
            for (const id of selectedIds) {
                await updateAudioFile(id, undefined, folderId);
            }
            exitSelectMode();
            loadAudios();
            showToast({ message: `Moved ${count} file${count === 1 ? '' : 's'}`, type: 'success' });
        } catch (e) {
            console.error('Error moving audio:', e);
            showToast({ message: 'Failed to move files', type: 'error' });
        }
    };

    const handleDeleteSelected = async () => {
        const count = selectedIds.size;
        const ok = await confirm({
            title: `Delete ${count} file${count === 1 ? '' : 's'}?`,
            message: t('areYouSure'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            destructive: true,
        });
        if (!ok) return;
        for (const id of selectedIds) {
            if (currentAudio?.id === id && player) {
                setPlayer(null);
                setCurrentAudio(null);
                setIsPlaying(false);
            }
            await deleteAudioFile(id);
        }
        exitSelectMode();
        loadAudios();
        showToast({ message: `Deleted ${count} file${count === 1 ? '' : 's'}`, type: 'info' });
    };

    const formatTime = (totalSeconds: number) => {
        if (!totalSeconds || !isFinite(totalSeconds)) return '0:00';
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const renderAudioItem = ({ item }: { item: AudioFile }) => {
        const isCurrent = currentAudio?.id === item.id;
        const isSelected = selectedIds.has(item.id);

        return (
            <TouchableOpacity
                style={[
                    styles.audioCard,
                    { backgroundColor: cardColor },
                    selectMode && isSelected && { borderWidth: 2, borderColor: accentColor },
                ]}
                onPress={() => {
                    if (selectMode) toggleSelected(item.id);
                    else playAudio(item);
                }}
                onLongPress={() => { if (!selectMode) openAudioMenu(item); }}
                delayLongPress={350}
                activeOpacity={0.8}
            >
                <View style={styles.cardHeaderAction}>
                    <View style={[styles.audioIconWrapper, { backgroundColor: accentColor + '10' }]}>
                        <Music size={28} color={accentColor} strokeWidth={2.5} />
                    </View>
                    {selectMode ? (
                        isSelected
                            ? <CheckCircle2 size={20} color={accentColor} strokeWidth={2.5} />
                            : <Circle size={20} color={mutedForeground} strokeWidth={2} />
                    ) : (
                        <TouchableOpacity
                            style={styles.deleteButtonContainer}
                            onPress={() => handleDelete(item.id)}
                            activeOpacity={0.5}
                            accessibilityLabel={`Delete ${item.name}`}
                            accessibilityRole="button"
                        >
                            <Trash2 size={16} color={mutedForeground} />
                        </TouchableOpacity>
                    )}
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
                        onPress={() => setNewFolderSheetVisible(true)}
                        activeOpacity={0.9}
                        accessibilityLabel="New folder"
                        accessibilityRole="button"
                    >
                        <FolderIcon size={24} color={accentColor} strokeWidth={3} />
                    </TouchableOpacity>
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

            {folders.length > 0 && (
                <View style={styles.folderFilterRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderFilterContent}>
                        <TouchableOpacity
                            style={[styles.folderFilterChip, { backgroundColor: activeFolderId === 'all' ? accentColor : secondaryBg }]}
                            onPress={() => setActiveFolderId('all')}
                        >
                            <Text style={[styles.folderFilterText, { color: activeFolderId === 'all' ? accentForeground : mutedForeground }]}>All</Text>
                        </TouchableOpacity>
                        {folders.map(folder => (
                            <TouchableOpacity
                                key={folder.id}
                                style={[styles.folderFilterChip, { backgroundColor: activeFolderId === folder.id ? accentColor : secondaryBg }]}
                                onPress={() => setActiveFolderId(activeFolderId === folder.id ? 'all' : folder.id)}
                            >
                                <FolderIcon size={13} color={activeFolderId === folder.id ? accentForeground : mutedForeground} strokeWidth={2.5} />
                                <Text style={[styles.folderFilterText, { color: activeFolderId === folder.id ? accentForeground : mutedForeground }]}>
                                    {folder.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            <FlatList
                data={activeFolderId === 'all' ? audios : audios.filter(a => (a.folderId || null) === activeFolderId)}
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
                            <Slider
                                style={styles.seekSlider}
                                minimumValue={0}
                                maximumValue={duration > 0 ? duration : 1}
                                value={Math.min(position, duration > 0 ? duration : 1)}
                                minimumTrackTintColor={accentColor}
                                maximumTrackTintColor={secondaryBg}
                                thumbTintColor={accentColor}
                                onSlidingStart={() => { seekingRef.current = true; }}
                                onValueChange={(v) => { if (seekingRef.current) setPosition(v); }}
                                onSlidingComplete={(v) => {
                                    seekingRef.current = false;
                                    seekTo(v);
                                }}
                                accessibilityLabel="Seek position"
                            />

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

                                <View style={styles.playerControls}>
                                    <TouchableOpacity
                                        onPress={cyclePlaybackRate}
                                        style={[styles.rateChip, { backgroundColor: playbackRate !== 1 ? accentColor : secondaryBg }]}
                                        activeOpacity={0.8}
                                        accessibilityLabel={`Playback speed ${playbackRate}x`}
                                        accessibilityRole="button"
                                    >
                                        <Text style={[styles.rateChipText, { color: playbackRate !== 1 ? accentForeground : textColor }]}>
                                            {playbackRate}×
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => skipBy(-15)}
                                        hitSlop={6}
                                        accessibilityLabel="Back 15 seconds"
                                        accessibilityRole="button"
                                    >
                                        <Rewind size={24} color={textColor} strokeWidth={2.25} />
                                    </TouchableOpacity>
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
                                    <TouchableOpacity
                                        onPress={() => skipBy(15)}
                                        hitSlop={6}
                                        accessibilityLabel="Forward 15 seconds"
                                        accessibilityRole="button"
                                    >
                                        <FastForward size={24} color={textColor} strokeWidth={2.25} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </BlurView>
                </View>
            )}

            {/* Audio context sheet (long-press) */}
            <BottomSheet
                visible={editAudio !== null}
                onClose={() => setEditAudio(null)}
                sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
            >
                <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: textColor }]}>Edit Audio</Text>
                    <TouchableOpacity onPress={() => setEditAudio(null)} accessibilityLabel="Close" accessibilityRole="button">
                        <X size={20} color={textColor} />
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                    <Input
                        label="Audio Name"
                        value={editAudioName}
                        onChangeText={setEditAudioName}
                        placeholder="e.g. Biology Lecture 3"
                    />

                    <Text style={[styles.sectionLabel, { color: textColor }]}>Move to Folder</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderPickerContainer}>
                        <TouchableOpacity
                            style={[styles.folderChip, { backgroundColor: editAudioFolderId === null ? accentColor : secondaryBg }]}
                            onPress={() => setEditAudioFolderId(null)}
                        >
                            <Text style={[styles.folderChipText, { color: editAudioFolderId === null ? accentForeground : textColor }]}>None</Text>
                        </TouchableOpacity>
                        {folders.map((folder) => (
                            <TouchableOpacity
                                key={folder.id}
                                style={[styles.folderChip, { backgroundColor: editAudioFolderId === folder.id ? accentColor : secondaryBg }]}
                                onPress={() => setEditAudioFolderId(folder.id)}
                            >
                                <FolderIcon size={14} color={editAudioFolderId === folder.id ? accentForeground : textColor} />
                                <Text style={[styles.folderChipText, { color: editAudioFolderId === folder.id ? accentForeground : textColor }]}>
                                    {folder.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <Button
                        title="Save Changes"
                        onPress={handleSaveAudioEdit}
                        style={styles.saveButton}
                    />

                    <TouchableOpacity
                        style={[styles.sheetAction, { backgroundColor: secondaryBg }]}
                        onPress={() => startSelectMode(editAudio?.id)}
                        activeOpacity={0.8}
                    >
                        <CheckCircle2 size={18} color={accentColor} strokeWidth={2.5} />
                        <Text style={[styles.sheetActionText, { color: textColor }]}>Select Multiple</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.sheetAction, { backgroundColor: '#ef444415' }]}
                        onPress={() => {
                            const audio = editAudio;
                            setEditAudio(null);
                            if (audio) handleDelete(audio.id);
                        }}
                        activeOpacity={0.8}
                    >
                        <Trash2 size={18} color="#ef4444" strokeWidth={2.5} />
                        <Text style={[styles.sheetActionText, { color: '#ef4444' }]}>Delete Audio</Text>
                    </TouchableOpacity>
                </ScrollView>
            </BottomSheet>

            {/* Move-selected sheet */}
            <BottomSheet
                visible={moveSheetVisible}
                onClose={() => setMoveSheetVisible(false)}
                sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
            >
                <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: textColor }]}>
                        Move {selectedIds.size} file{selectedIds.size === 1 ? '' : 's'}
                    </Text>
                    <TouchableOpacity onPress={() => setMoveSheetVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                        <X size={20} color={textColor} />
                    </TouchableOpacity>
                </View>
                <TouchableOpacity
                    style={[styles.sheetAction, { backgroundColor: secondaryBg }]}
                    onPress={() => handleMoveSelected(null)}
                    activeOpacity={0.8}
                >
                    <Music size={18} color={accentColor} strokeWidth={2.5} />
                    <Text style={[styles.sheetActionText, { color: textColor }]}>No folder</Text>
                </TouchableOpacity>
                {folders.map(folder => (
                    <TouchableOpacity
                        key={folder.id}
                        style={[styles.sheetAction, { backgroundColor: secondaryBg }]}
                        onPress={() => handleMoveSelected(folder.id)}
                        activeOpacity={0.8}
                    >
                        <FolderIcon size={18} color={accentColor} strokeWidth={2.5} />
                        <Text style={[styles.sheetActionText, { color: textColor }]}>{folder.name}</Text>
                    </TouchableOpacity>
                ))}
            </BottomSheet>

            {/* New audio folder sheet */}
            <BottomSheet
                visible={newFolderSheetVisible}
                onClose={() => setNewFolderSheetVisible(false)}
                sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
            >
                <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: textColor }]}>New Folder</Text>
                    <TouchableOpacity onPress={() => setNewFolderSheetVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                        <X size={20} color={textColor} />
                    </TouchableOpacity>
                </View>
                <Input
                    label="Folder Name"
                    value={newFolderName}
                    onChangeText={setNewFolderName}
                    placeholder="e.g. Lectures"
                />
                <Button
                    title="Create Folder"
                    onPress={handleCreateFolder}
                    style={{ marginTop: 24 }}
                />
            </BottomSheet>

            {/* Multi-select action bar */}
            {selectMode && (
                <View style={[styles.selectBar, { backgroundColor: accentColor, bottom: insets.bottom + 16 }]}>
                    <Text style={[styles.selectBarCount, { color: accentForeground }]}>
                        {selectedIds.size} selected
                    </Text>
                    <View style={styles.selectBarActions}>
                        <TouchableOpacity
                            style={styles.selectBarBtn}
                            onPress={() => setMoveSheetVisible(true)}
                            disabled={selectedIds.size === 0}
                            accessibilityLabel="Move selected files"
                            accessibilityRole="button"
                        >
                            <FolderInput size={20} color={accentForeground} strokeWidth={2.5} />
                            <Text style={[styles.selectBarBtnText, { color: accentForeground }]}>Move</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectBarBtn}
                            onPress={handleDeleteSelected}
                            disabled={selectedIds.size === 0}
                            accessibilityLabel="Delete selected files"
                            accessibilityRole="button"
                        >
                            <Trash2 size={20} color={accentForeground} strokeWidth={2.5} />
                            <Text style={[styles.selectBarBtnText, { color: accentForeground }]}>Delete</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectBarBtn}
                            onPress={exitSelectMode}
                            accessibilityLabel="Cancel selection"
                            accessibilityRole="button"
                        >
                            <X size={20} color={accentForeground} strokeWidth={2.5} />
                        </TouchableOpacity>
                    </View>
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
    folderFilterRow: {
        marginBottom: 12,
    },
    folderFilterContent: {
        paddingHorizontal: 24,
        gap: 8,
    },
    folderFilterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
    },
    folderFilterText: {
        fontSize: 13,
        fontWeight: '700',
    },
    modalContent: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 10,
    },
    folderPickerContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    folderChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        marginRight: 8,
        gap: 6,
    },
    folderChipText: {
        fontSize: 14,
        fontWeight: '600',
    },
    saveButton: {
        marginTop: 16,
        height: 56,
        borderRadius: 18,
    },
    sheetAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 52,
        borderRadius: 16,
        paddingHorizontal: 18,
        marginTop: 10,
    },
    sheetActionText: {
        fontSize: 15,
        fontWeight: '700',
    },
    selectBar: {
        position: 'absolute',
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 20,
        paddingHorizontal: 20,
        paddingVertical: 14,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
    },
    selectBarCount: {
        fontSize: 15,
        fontWeight: '800',
    },
    selectBarActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 22,
    },
    selectBarBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    selectBarBtnText: {
        fontSize: 14,
        fontWeight: '700',
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
    seekSlider: {
        width: '100%',
        height: 32,
        marginBottom: 4,
    },
    playerControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    rateChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        minWidth: 44,
        alignItems: 'center',
    },
    rateChipText: {
        fontSize: 13,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
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
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    }
});
