import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useFocusEffect, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Icons from 'lucide-react-native';
import { CalendarCheck, ChevronRight, FileUp, Folder as FolderIcon, Leaf, Play, Plus, Search, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconPicker } from '../../components/IconPicker';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { LevelCard } from '../../components/LevelCard';
import { SprigLogo } from '../../components/SprigLogo';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { createEmptyDeck, Deck, deleteDeck, deleteFolder, Folder, getDecks, getExamPlan, getFolders, getUserStats, importCsvToDeck, saveFolder, updateDeck, UserStats } from '../../utils/Storage';
import { buildTodayPlan, startTodaySession, TodayPlan } from '../../utils/TodayPlan';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { t } = useLanguage();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [todayPlan, setTodayPlan] = useState<TodayPlan | null>(null);

  const [importModalVisible, setImportModalVisible] = useState(false);
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [editDeckModalVisible, setEditDeckModalVisible] = useState(false);

  const [boxName, setBoxName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Book');
  const [newFolderName, setNewFolderName] = useState('');
  const [importing, setImporting] = useState(false);
  
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
    const [savedDecks, savedFolders, savedStats] = await Promise.all([getDecks(), getFolders(), getUserStats()]);
    setDecks(savedDecks.filter(d => d.type === 'csv'));
    setFolders(savedFolders);
    setStats(savedStats);
    // Rebuild the Today queue in the background - cheap, all local reads
    buildTodayPlan().then(setTodayPlan).catch(() => setTodayPlan(null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
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
        type: ['text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const fallbackName = asset.name?.replace(/\.[^/.]+$/, '') || 'Imported Deck';
      const name = boxName.trim() || fallbackName;

      setImporting(true);
      const newDeck = await createEmptyDeck(name, selectedIcon, currentFolderId);
      await importCsvToDeck(newDeck.id, asset.uri);

      setImportModalVisible(false);
      setBoxName('');
      setSelectedIcon('Book');
      loadData();
      showToast({ message: t('deckCreated').replace('{name}', name), type: 'success' });
    } catch (e) {
      console.error('Error importing file:', e);
      showToast({ message: t('error'), type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await saveFolder(newFolderName, currentFolderId);
      setNewFolderName('');
      setNewFolderModalVisible(false);
      loadData();
      showToast({ message: t('folderCreated').replace('{name}', newFolderName), type: 'success' });
    } catch (e) {
      console.error('Error creating folder:', e);
      showToast({ message: t('error'), type: 'error' });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('deleteDeck'),
      message: t('deleteDeckMessage').replace('{name}', name),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    await deleteDeck(id);
    loadData();
    showToast({ message: t('deckDeleted').replace('{name}', name), type: 'info' });
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
      showToast({ message: 'Deck updated successfully', type: 'success' });
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
              <View style={[styles.dueBadge, { backgroundColor: plan.daysLeft <= 3 ? '#ef4444' : '#f59e0b' }]}>
                <Text style={styles.dueText}>
                  {plan.daysLeft === 0 ? 'EXAM TODAY' : `📅 ${plan.daysLeft}d`}
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
    <TouchableOpacity
      style={[styles.deckCard, { backgroundColor: secondaryBg }]}
      activeOpacity={0.8}
      onPress={() => setCurrentFolderId(item.id)}
    >
      <View style={styles.cardHeaderAction}>
        <View style={[styles.deckIconContainer, { backgroundColor: accentColor + '15' }]}>
          <FolderIcon size={32} color={accentColor} fill={accentColor + '30'} />
        </View>
        <TouchableOpacity
          style={styles.deleteButtonContainer}
          onPress={() => handleDeleteFolder(item.id, item.name)}
          accessibilityLabel={`Delete folder ${item.name}`}
          accessibilityRole="button"
        >
          <Trash2 size={16} color={mutedForeground} />
        </TouchableOpacity>
      </View>
      <View style={styles.cardBottom}>
        <Text style={[styles.deckName, { color: textColor }]} numberOfLines={2}>{item.name}</Text>
        <Text style={[styles.countLabel, { color: mutedForeground }]}>{t('folder')}</Text>
      </View>
    </TouchableOpacity>
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
          placeholder="Search decks and folders..."
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
        ListHeaderComponent={
          !searching && !currentFolderId ? (
            <View>
              {stats && <LevelCard stats={stats} displayStreak={displayStreak} />}
              {todayPlan && todayPlan.totalCards > 0 && (
                <TouchableOpacity
                  style={[styles.todayCard, { backgroundColor: secondaryBg }]}
                  onPress={handleStartToday}
                  activeOpacity={0.85}
                  accessibilityLabel={`Start today's session with ${todayPlan.totalCards} cards`}
                  accessibilityRole="button"
                >
                  <View style={[styles.focusIcon, { backgroundColor: accentColor + '15' }]}>
                    <CalendarCheck size={22} color={accentColor} strokeWidth={2.5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.focusTitle, { color: textColor }]}>
                      Your {todayPlan.totalCards} for today
                    </Text>
                    <Text style={[styles.focusSub, { color: mutedForeground }]} numberOfLines={1}>
                      {[
                        todayPlan.dueCount > 0 ? `${todayPlan.dueCount} due` : null,
                        todayPlan.examCount > 0 ? `${todayPlan.examCount} exam prep` : null,
                        todayPlan.trickyCount > 0 ? `${todayPlan.trickyCount} tricky` : null,
                      ].filter(Boolean).join(' · ') || 'Ready when you are'}
                      {todayPlan.entries.length > 1 ? ` · ${todayPlan.entries.length} decks` : ''}
                    </Text>
                  </View>
                  <View style={[styles.todayGo, { backgroundColor: accentColor }]}>
                    <Play size={16} color={primaryForeground} fill={primaryForeground} />
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.focusCard, { backgroundColor: accentColor }]}
                onPress={() => router.push('/focus')}
                activeOpacity={0.9}
              >
                <View style={[styles.focusIcon, { backgroundColor: primaryForeground }]}>
                  <Leaf size={22} color={accentColor} strokeWidth={2.5} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.focusTitle, { color: primaryForeground }]}>Focus Session</Text>
                  <Text style={[styles.focusSub, { color: primaryForeground }]}>Grow a plant while you study</Text>
                </View>
                <ChevronRight size={20} color={primaryForeground} />
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          searching ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: secondaryBg }]}>
                <Search size={48} color={accentColor} strokeWidth={2.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: textColor }]}>No results</Text>
              <Text style={[styles.emptyText, { color: mutedForeground }]}>
                Nothing matches {'"'}{searchQuery.trim()}{'"'}. Try a different search.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={{ marginBottom: 24 }}>
                <SprigLogo size={108} />
              </View>
              <Text style={[styles.emptyTitle, { color: textColor }]}>{currentFolderId ? 'Folder is empty' : 'Plant your first deck'}</Text>
              <Text style={[styles.emptyText, { color: mutedForeground }]}>
                {currentFolderId ? 'Create a subfolder or import a CSV deck here.' : 'Import a CSV file to create your first study deck.'}
              </Text>
              <Button
                title="Create New Deck"
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
                <Text style={[styles.modalTitle, { color: textColor }]}>New Folder</Text>
                <TouchableOpacity onPress={() => setNewFolderModalVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                  <X size={20} color={textColor} />
                </TouchableOpacity>
              </View>
              <Input
                label="Folder Name"
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="e.g. Science"
              />
              <Button
                title="Create Folder"
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
                  Create New Deck
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
                    label="Deck Name"
                    value={boxName}
                    onChangeText={setBoxName}
                    placeholder="e.g. History Facts"
                  />

                  <Text style={[styles.sectionLabel, { color: textColor }]}>Pick an Icon</Text>
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
                        {importing ? 'Importing...' : 'Import from CSV / Text File'}
                      </Text>
                      <Text style={[styles.pickSub, { color: mutedForeground }]}>
                        Comma, tab or line-separated question/answer pairs
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <Button
                    title="Start Building"
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
                  Edit Deck
                </Text>
                <TouchableOpacity onPress={() => setEditDeckModalVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                  <X size={20} color={textColor} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
                <View style={styles.formSection}>
                  <Input
                    label="Deck Name"
                    value={editDeckName}
                    onChangeText={setEditDeckName}
                    placeholder="e.g. History Facts"
                  />

                  <Text style={[styles.sectionLabel, { color: textColor }]}>Pick an Icon</Text>
                  <IconPicker selectedIcon={editDeckIcon} onSelect={setEditDeckIcon} />

                  <Text style={[styles.sectionLabel, { color: textColor, marginTop: 16 }]}>Move to Folder</Text>
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
                        Root
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
                    title="Save Changes"
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
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
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
    marginLeft: 10,
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
