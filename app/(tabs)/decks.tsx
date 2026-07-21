import { useLanguage } from '@/contexts/LanguageContext';
import { useTabPressReset } from '@/hooks/use-tab-press-reset';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useFocusEffect, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Icons from 'lucide-react-native';
import { CalendarDays, ChevronRight, ClipboardPaste, FileUp, Folder as FolderIcon, Package, Plus, Search, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FolderCard } from '../../components/FolderCard';
import { IconPicker } from '../../components/IconPicker';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { SprigLogo } from '../../components/SprigLogo';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import * as FileSystem from 'expo-file-system/legacy';
import { importApkg } from '../../utils/AnkiImport';
import { parseFlashcardsText } from '../../utils/CsvParser';
import { importSprigDeck, isSprigFileName } from '../../utils/SprigDeck';
import { createEmptyDeck, Deck, deleteDeck, deleteFolder, Folder, getDecks, getExamPlan, getFolders, importCsvToDeck, saveFolder, updateDeck } from '../../utils/Storage';

export default function DecksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { t } = useLanguage();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Tapping the tab in the navbar pops folder navigation back to the root
  useTabPressReset(() => {
    setCurrentFolderId(null);
    setSearchQuery('');
  });
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const [importModalVisible, setImportModalVisible] = useState(false);
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [editDeckModalVisible, setEditDeckModalVisible] = useState(false);

  const [boxName, setBoxName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Book');
  const [newFolderName, setNewFolderName] = useState('');
  const [importing, setImporting] = useState(false);
  const [ankiProgress, setAnkiProgress] = useState<{ current: number; total: number } | null>(null);

  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [editDeckName, setEditDeckName] = useState('');
  const [editDeckIcon, setEditDeckIcon] = useState('Book');
  const [editDeckFolderId, setEditDeckFolderId] = useState<string | null>(null);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedForeground = useThemeColor({}, 'mutedForeground');
  const secondaryBg = useThemeColor({}, 'secondary');
  const accentColor = useThemeColor({}, 'primary');
  const primaryForeground = useThemeColor({}, 'primaryForeground');

  const loadData = useCallback(async () => {
    const [savedDecks, savedFolders] = await Promise.all([getDecks(), getFolders('deck')]);
    setDecks(savedDecks.filter(d => d.type === 'csv'));
    setFolders(savedFolders);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleCreateDeck = async () => {
    if (!boxName.trim()) return;

    try {
      await createEmptyDeck(boxName, selectedIcon, currentFolderId);
      setImportModalVisible(false);
      setBoxName('');
      setSelectedIcon('Book');
      loadData();
      showToast({ message: t('deckCreated').replace('{name}', boxName), type: 'success' });
    } catch (e) {
      console.error('Error creating deck:', e);
      showToast({ message: t('error'), type: 'error' });
    }
  };

  const handleImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // octet-stream/zip so shared .sprig decks are selectable too
        type: ['text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream', 'application/zip'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const fallbackName = asset.name?.replace(/\.[^/.]+$/, '') || 'Imported Deck';
      const name = boxName.trim() || fallbackName;

      setImporting(true);

      if (isSprigFileName(asset.name)) {
        const res = await importSprigDeck(asset.uri, currentFolderId, boxName.trim() || undefined);
        setImportModalVisible(false);
        setBoxName('');
        setSelectedIcon('Book');
        loadData();
        showToast({ message: `"${res.deck.name}" imported · ${res.cardCount} cards`, type: 'success' });
        return;
      }

      const newDeck = await createEmptyDeck(name, selectedIcon, currentFolderId);
      await importCsvToDeck(newDeck.id, asset.uri);

      setImportModalVisible(false);
      setBoxName('');
      setSelectedIcon('Book');
      loadData();
      showToast({ message: t('deckCreated').replace('{name}', name), type: 'success' });
    } catch (e: any) {
      console.error('Error importing file:', e);
      showToast({
        message: e?.message === 'not-sprig' ? t('decksNotSprigFile') : t('error'),
        type: 'error',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleImportAnki = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // .apkg has no registered MIME type — accept anything, validate below
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      if (!/\.(apkg|colpkg)$/i.test(asset.name || '')) {
        showToast({ message: t('decksPickAnkiFile'), type: 'warning' });
        return;
      }

      const fallbackName = asset.name.replace(/\.(apkg|colpkg)$/i, '') || 'Anki Deck';
      const name = boxName.trim() || fallbackName;

      setImporting(true);
      setAnkiProgress(null);
      const res = await importApkg(asset.uri, name, selectedIcon, currentFolderId, (current, total) => setAnkiProgress({ current, total }));

      setImportModalVisible(false);
      setBoxName('');
      setSelectedIcon('Book');
      loadData();
      showToast({
        message: `"${name}" imported · ${res.cardCount} cards${res.imageCount > 0 ? ` · ${res.imageCount} images` : ''}`,
        type: 'success',
      });
    } catch (e: any) {
      console.error('Error importing apkg:', e);
      const message =
        e?.message === 'new-format'
          ? t('decksAnkiNewFormat')
          : e?.message === 'empty'
            ? t('decksAnkiEmpty')
            : t('decksAnkiFailed');
      showToast({ message, type: 'error' });
    } finally {
      setImporting(false);
      setAnkiProgress(null);
    }
  };

  const handleImportPasted = async () => {
    const text = pasteText.trim();
    if (!text) return;
    const parsed = parseFlashcardsText(text);
    if (parsed.length === 0) {
      showToast({ message: t('decksNoPastedPairs'), type: 'warning' });
      return;
    }
    setImporting(true);
    try {
      const name = boxName.trim() || 'Pasted Deck';
      const tmp = `${FileSystem.cacheDirectory}pasted_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(tmp, text);
      const newDeck = await createEmptyDeck(name, selectedIcon, currentFolderId);
      await importCsvToDeck(newDeck.id, tmp);
      await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { });

      setImportModalVisible(false);
      setBoxName('');
      setSelectedIcon('Book');
      setPasteText('');
      setShowPaste(false);
      loadData();
      showToast({ message: `"${name}" created · ${parsed.length} cards`, type: 'success' });
    } catch (e) {
      console.error('Error importing pasted cards:', e);
      showToast({ message: t('error'), type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await saveFolder(newFolderName, currentFolderId, 'deck');
      setNewFolderName('');
      setNewFolderModalVisible(false);
      loadData();
      showToast({ message: t('folderCreated').replace('{name}', newFolderName), type: 'success' });
    } catch (e) {
      console.error('Error creating folder:', e);
      showToast({ message: t('error'), type: 'error' });
    }
  };

  // Deletion is a two-step safety net: confirm, then hold off the real DB
  // write for a few seconds so an "Undo" tap on the toast can still save it.
  // Deck content (cards + years of SRS history) is the most expensive thing
  // in the app to lose, so this gets a second line of defense beyond the
  // confirm dialog.
  const pendingDeleteRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const UNDO_WINDOW_MS = 5000;

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('deleteDeck'),
      message: t('deleteDeckMessage').replace('{name}', name),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      destructive: true,
    });
    if (!ok) return;

    const removed = decks.find(d => d.id === id);
    setDecks(prev => prev.filter(d => d.id !== id));

    showToast({
      message: t('deckDeleted').replace('{name}', name),
      type: 'info',
      duration: UNDO_WINDOW_MS,
      action: {
        label: t('undo'),
        onPress: () => {
          const timer = pendingDeleteRef.current[id];
          if (timer) {
            clearTimeout(timer);
            delete pendingDeleteRef.current[id];
          }
          if (removed) setDecks(prev => [removed, ...prev]);
        },
      },
    });

    pendingDeleteRef.current[id] = setTimeout(async () => {
      delete pendingDeleteRef.current[id];
      try {
        await deleteDeck(id);
      } catch (e) {
        console.error('Error deleting deck:', e);
      }
    }, UNDO_WINDOW_MS);
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('deleteFolder'),
      message: t('deleteFolderMessage').replace('{name}', name),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    await deleteFolder(id);
    loadData();
    showToast({ message: t('folderDeleted').replace('{name}', name), type: 'info' });
  };

  const handleEditDeck = (deck: Deck) => {
    setEditingDeck(deck);
    setEditDeckName(deck.name);
    setEditDeckIcon(deck.icon);
    setEditDeckFolderId(deck.folderId || null);
    setEditDeckModalVisible(true);
  };

  const handleSaveEditDeck = async () => {
    if (!editingDeck || !editDeckName.trim()) return;
    
    try {
      await updateDeck(editingDeck.id, editDeckName, editDeckIcon, editDeckFolderId);
      setEditDeckModalVisible(false);
      setEditingDeck(null);
      loadData();
      showToast({ message: t('decksDeckUpdated'), type: 'success' });
    } catch (e: any) {
      console.error('Error updating deck:', e);
      showToast({ message: e?.message || t('error'), type: 'error' });
    }
  };

  const renderDeckItem = (item: Deck) => {
    const IconComponent = (Icons as any)[item.icon] || Icons.Book;
    const learnedCount = item.learnedIndices?.length || 0;
    const totalCount = item.totalCards || 0;
    const progress = totalCount > 0 ? (learnedCount / totalCount) * 100 : 0;

    // SRS Due Count: Current Due + New cards
    const dueCount = Object.values(item.srsData || {}).filter(data =>
      new Date(data.nextReview) <= new Date()
    ).length + (totalCount - Object.keys(item.srsData || {}).length);

    return (
      <TouchableOpacity
        style={[styles.deckCard, { backgroundColor: secondaryBg }]}
        activeOpacity={0.8}
        onPress={() => router.push({ pathname: '/deck-details', params: { id: item.id } })}
        onLongPress={() => handleEditDeck(item)}
      >
        <View style={styles.cardHeaderAction}>
          <View style={[styles.deckIconContainer, { backgroundColor: accentColor + '10' }]}>
            <IconComponent size={28} color={accentColor} strokeWidth={2.5} />
          </View>
          <TouchableOpacity
            style={styles.deleteButtonContainer}
            onPress={() => handleDelete(item.id, item.name)}
            activeOpacity={0.5}
            accessibilityLabel={`Delete ${item.name}`}
            accessibilityRole="button"
          >
            <Trash2 size={16} color={mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={styles.cardTop}>
          <View style={[styles.countBadge, { backgroundColor: backgroundColor }]}>
            <Text style={[styles.countText, { color: textColor }]}>{totalCount}</Text>
            <Text style={[styles.countLabel, { color: mutedForeground }]}>{t('cards')}</Text>
          </View>
          {dueCount > 0 && (
            <View style={[styles.dueBadge, { backgroundColor: '#ef4444' }]}>
              <Text style={styles.dueText}>{dueCount} {t('due')}</Text>
            </View>
          )}
          {(() => {
            const plan = getExamPlan(item);
            if (!plan || plan.daysLeft < 0) return null;
            return (
              <View style={[styles.dueBadge, { backgroundColor: plan.daysLeft <= 3 ? '#ef4444' : '#f59e0b', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                {plan.daysLeft > 0 && <CalendarDays size={11} color="#fff" strokeWidth={2.5} />}
                <Text style={styles.dueText}>
                  {plan.daysLeft === 0 ? t('decksExamToday') : `${plan.daysLeft}d`}
                </Text>
              </View>
            );
          })()}
        </View>

        <View style={styles.cardBottom}>
          <Text style={[styles.deckName, { color: textColor }]} numberOfLines={2}>{item.name}</Text>

          <View style={styles.progressSection}>
            <View style={styles.progressInfo}>
              <Text style={[styles.progressLabel, { color: mutedForeground }]}>{t('mastery')}</Text>
              <Text style={[styles.progressPercent, { 
                color: progress === 0 ? '#ef4444' : 
                       progress < 30 ? '#f97316' : 
                       progress < 60 ? '#eab308' : 
                       progress < 100 ? accentColor : 
                       '#22c55e' 
              }]}>
                {Math.round(progress)}%
              </Text>
            </View>
            <View style={[styles.progressBarBg, { backgroundColor: accentColor + '10' }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progress}%`,
                    backgroundColor: progress === 0 ? '#ef4444' : 
                                    progress < 30 ? '#f97316' : 
                                    progress < 60 ? '#eab308' : 
                                    progress < 100 ? accentColor : 
                                    '#22c55e'
                  }
                ]}
              />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFolderItem = (item: Folder) => (
    <FolderCard
      name={item.name}
      onOpen={() => setCurrentFolderId(item.id)}
      onDelete={() => handleDeleteFolder(item.id, item.name)}
    />
  );

  // With an active search, look across all folders; otherwise browse the current folder
  const query = searchQuery.trim().toLowerCase();
  const searching = query.length > 0;
  const currentFolders = searching
    ? folders.filter(f => f.name.toLowerCase().includes(query))
    : folders.filter(f => (f.parentId || null) === currentFolderId);
  const currentDecks = searching
    ? decks.filter(d => d.name.toLowerCase().includes(query))
    : decks.filter(d => (d.folderId || null) === currentFolderId);
  const combinedData = [...currentFolders.map(f => ({ ...f, isFolder: true })), ...currentDecks.map(d => ({ ...d, isFolder: false }))];

  const folderPath = [];
  let tempId = currentFolderId;
  while (tempId) {
    const f = folders.find(folder => folder.id === tempId);
    if (f) {
      folderPath.unshift(f);
      tempId = f.parentId;
    } else break;
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity onPress={() => setCurrentFolderId(null)} disabled={!currentFolderId}>
            <Text style={[styles.title, { color: textColor }]}>{t('myDecks')}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: secondaryBg }]}
            onPress={() => setNewFolderModalVisible(true)}
            activeOpacity={0.9}
            accessibilityLabel="New folder"
            accessibilityRole="button"
          >
            <FolderIcon size={24} color={accentColor} strokeWidth={3} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: accentColor }]}
            onPress={() => setImportModalVisible(true)}
            activeOpacity={0.9}
            accessibilityLabel="Create new deck"
            accessibilityRole="button"
          >
            <Plus size={24} color={primaryForeground} strokeWidth={3} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.searchBar, { backgroundColor: secondaryBg }]}>
        <Search size={18} color={mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: textColor }]}
          placeholder={t('decksSearchPlaceholder')}
          placeholderTextColor={mutedForeground}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search" accessibilityRole="button">
            <X size={18} color={mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {!searching && folderPath.length > 0 && (
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => setCurrentFolderId(null)}>
            <Text style={[styles.breadcrumbText, { color: mutedForeground }]}>{t('root')}</Text>
          </TouchableOpacity>
          {folderPath.map((f, i) => (
            <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ChevronRight size={14} color={mutedForeground} />
              <TouchableOpacity
                onPress={() => setCurrentFolderId(f.id)}
                disabled={i === folderPath.length - 1}
              >
                <Text style={[
                  styles.breadcrumbText,
                  { color: i === folderPath.length - 1 ? textColor : mutedForeground, fontWeight: i === folderPath.length - 1 ? '800' : '600' }
                ]}>{f.name}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={combinedData}
        renderItem={({ item }) => item.isFolder ? renderFolderItem(item as any) : renderDeckItem(item as any)}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={true}
        ListEmptyComponent={
          searching ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: secondaryBg }]}>
                <Search size={48} color={accentColor} strokeWidth={2.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: textColor }]}>{t('decksNoResultsTitle')}</Text>
              <Text style={[styles.emptyText, { color: mutedForeground }]}>
                {t('decksNoResultsText').replace('{query}', searchQuery.trim())}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={{ marginBottom: 24 }}>
                <SprigLogo size={108} />
              </View>
              <Text style={[styles.emptyTitle, { color: textColor }]}>{currentFolderId ? t('decksFolderEmptyTitle') : t('homePlantFirstDeckTitle')}</Text>
              <Text style={[styles.emptyText, { color: mutedForeground }]}>
                {currentFolderId ? t('decksFolderEmptyText') : t('decksImportCsvText')}
              </Text>
              <Button
                title={t('homeCreateNewDeck')}
                onPress={() => setImportModalVisible(true)}
                style={styles.emptyButton}
              />
            </View>
          )
        }
      />

      {/* New Folder Modal */}
      <BottomSheet
        visible={newFolderModalVisible}
        onClose={() => setNewFolderModalVisible(false)}
        sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
      >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>{t('newFolder')}</Text>
                <TouchableOpacity onPress={() => setNewFolderModalVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                  <X size={20} color={textColor} />
                </TouchableOpacity>
              </View>
              <Input
                label={t('folderName')}
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder={t('folderPlaceholder')}
              />
              <Button
                title={t('createFolder')}
                onPress={handleCreateFolder}
                style={{ marginTop: 24 }}
              />
      </BottomSheet>

      {/* Import Deck Modal */}
      <BottomSheet
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
        sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
      >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  {t('decksNewDeckTitle')}
                </Text>
                <TouchableOpacity onPress={() => {
                  setImportModalVisible(false);
                }} accessibilityLabel="Close" accessibilityRole="button">
                  <X size={20} color={textColor} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
                <View style={styles.formSection}>
                  <Input
                    label={t('decksDeckName')}
                    value={boxName}
                    onChangeText={setBoxName}
                    placeholder={t('decksDeckNamePlaceholder')}
                  />

                  <Text style={[styles.sectionLabel, { color: textColor }]}>{t('pickAnIcon')}</Text>
                  <IconPicker selectedIcon={selectedIcon} onSelect={setSelectedIcon} />

                  <TouchableOpacity
                    style={[styles.importZone, { borderColor: accentColor, backgroundColor: secondaryBg }]}
                    onPress={handleImportFile}
                    activeOpacity={0.8}
                    disabled={importing}
                  >
                    {importing ? (
                      <ActivityIndicator color={accentColor} />
                    ) : (
                      <FileUp size={22} color={accentColor} strokeWidth={2.5} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickText, { color: textColor, fontSize: 15 }]}>
                        {importing ? t('decksImporting') : t('decksImportFile')}
                      </Text>
                      <Text style={[styles.pickSub, { color: mutedForeground }]}>
                        {t('decksImportFileSub')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.importZone, { borderColor: accentColor, backgroundColor: secondaryBg }]}
                    onPress={handleImportAnki}
                    activeOpacity={0.8}
                    disabled={importing}
                    accessibilityLabel="Import Anki deck"
                    accessibilityRole="button"
                  >
                    {importing ? (
                      <ActivityIndicator color={accentColor} />
                    ) : (
                      <Package size={22} color={accentColor} strokeWidth={2.5} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickText, { color: textColor, fontSize: 15 }]}>
                        {importing
                          ? (ankiProgress ? t('decksImportAnkiProgress').replace('{current}', String(ankiProgress.current)).replace('{total}', String(ankiProgress.total)) : t('decksImporting'))
                          : t('decksImportAnki')}
                      </Text>
                      {importing && ankiProgress ? (
                        <View style={[styles.progressBarBg, { backgroundColor: accentColor + '15', marginTop: 6 }]}>
                          <View style={[styles.progressBarFill, { width: `${Math.min(100, (ankiProgress.current / ankiProgress.total) * 100)}%`, backgroundColor: accentColor }]} />
                        </View>
                      ) : (
                        <Text style={[styles.pickSub, { color: mutedForeground }]}>
                          {t('decksImportAnkiSub')}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.importZone, { borderColor: accentColor, backgroundColor: secondaryBg }]}
                    onPress={() => setShowPaste(p => !p)}
                    activeOpacity={0.8}
                    accessibilityLabel="Paste cards as text"
                    accessibilityRole="button"
                  >
                    <ClipboardPaste size={22} color={accentColor} strokeWidth={2.5} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickText, { color: textColor, fontSize: 15 }]}>{t('decksPasteCards')}</Text>
                      <Text style={[styles.pickSub, { color: mutedForeground }]}>
                        {t('decksPasteCardsSub')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {showPaste && (
                    <>
                      <TextInput
                        style={[styles.pasteInput, { color: textColor, backgroundColor: secondaryBg, borderColor: accentColor + '40' }]}
                        value={pasteText}
                        onChangeText={setPasteText}
                        placeholder={t('decksPastePlaceholder')}
                        placeholderTextColor={mutedForeground}
                        multiline
                        autoCorrect={false}
                        accessibilityLabel="Pasted cards text"
                      />
                      <Button
                        title={importing ? t('decksImportingEllipsis') : t('decksImportPastedCards')}
                        onPress={handleImportPasted}
                        disabled={importing || pasteText.trim().length === 0}
                        style={{ height: 52 }}
                      />
                    </>
                  )}

                  <Button
                    title={t('decksStartBuilding')}
                    onPress={handleCreateDeck}
                    style={styles.saveButton}
                  />
                </View>
              </ScrollView>
      </BottomSheet>

      {/* Edit Deck Modal */}
      <BottomSheet
        visible={editDeckModalVisible}
        onClose={() => setEditDeckModalVisible(false)}
        sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
      >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  {t('decksEditDeckTitle')}
                </Text>
                <TouchableOpacity onPress={() => setEditDeckModalVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                  <X size={20} color={textColor} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
                <View style={styles.formSection}>
                  <Input
                    label={t('decksDeckName')}
                    value={editDeckName}
                    onChangeText={setEditDeckName}
                    placeholder={t('decksDeckNamePlaceholder')}
                  />

                  <Text style={[styles.sectionLabel, { color: textColor }]}>{t('pickAnIcon')}</Text>
                  <IconPicker selectedIcon={editDeckIcon} onSelect={setEditDeckIcon} />

                  <Text style={[styles.sectionLabel, { color: textColor, marginTop: 16 }]}>{t('moveToFolder')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderPickerContainer}>
                    <TouchableOpacity
                      style={[
                        styles.folderChip,
                        { backgroundColor: editDeckFolderId === null ? accentColor : secondaryBg }
                      ]}
                      onPress={() => setEditDeckFolderId(null)}
                    >
                      <Text style={[
                        styles.folderChipText,
                        { color: editDeckFolderId === null ? primaryForeground : textColor }
                      ]}>
                        {t('root')}
                      </Text>
                    </TouchableOpacity>
                    {folders.map((folder) => (
                      <TouchableOpacity
                        key={folder.id}
                        style={[
                          styles.folderChip,
                          { backgroundColor: editDeckFolderId === folder.id ? accentColor : secondaryBg }
                        ]}
                        onPress={() => setEditDeckFolderId(folder.id)}
                      >
                        <FolderIcon size={14} color={editDeckFolderId === folder.id ? primaryForeground : textColor} />
                        <Text style={[
                          styles.folderChipText,
                          { color: editDeckFolderId === folder.id ? primaryForeground : textColor }
                        ]}>
                          {folder.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Button
                    title={t('saveChanges')}
                    onPress={handleSaveEditDeck}
                    style={styles.saveButton}
                  />
                </View>
              </ScrollView>
      </BottomSheet>
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
  summaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  deckCard: {
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
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteButtonContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Badges must wrap: with three of them (count, due, exam) a nowrap row's
  // min-content width would push the card past its half-screen column.
  cardTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  deckIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
  },
  countLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  dueText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  cardBottom: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  deckName: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  progressSection: {
    width: '100%',
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressPercent: {
    fontSize: 11,
    fontWeight: '900',
  },
  progressBarBg: {
    height: 6,
    width: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexWrap: 'wrap',
  },
  breadcrumbText: {
    fontSize: 14,
    marginHorizontal: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 100,
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalDismiss: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  pickZone: {
    height: 200,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pickIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pickText: {
    fontSize: 18,
    fontWeight: '800',
  },
  pickSub: {
    fontSize: 13,
    opacity: 0.6,
  },
  pasteInput: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    minHeight: 110,
    fontSize: 14,
    fontWeight: '500',
    textAlignVertical: 'top',
  },
  importZone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 24,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 46,
    borderRadius: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    height: '100%',
  },
  focusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 10,
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
  },
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 10,
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
  },
  todayGo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  focusSub: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.85,
    marginTop: 2,
  },
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginBottom: 8,
    padding: 16,
    borderRadius: 20,
    justifyContent: 'space-evenly',
  },
  statsBannerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statsBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBannerValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  statsBannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsBannerDivider: {
    width: 1,
    height: 32,
  },
  formScroll: {
    paddingBottom: 20,
  },
  formSection: {
    gap: 20,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: -12,
  },
  pickedFileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  pickedFileName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  saveButton: {
    marginTop: 12,
    height: 56,
    borderRadius: 18,
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
});
