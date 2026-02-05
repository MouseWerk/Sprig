import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Icons from 'lucide-react-native';
import { BookOpen, ChevronRight, Folder as FolderIcon, Plus, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconPicker } from '../../components/IconPicker';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { createEmptyDeck, Deck, deleteDeck, deleteFolder, Folder, getDecks, getFolders, saveDeck, saveFolder, updateDeck } from '../../utils/Storage';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { t } = useLanguage();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [importModalVisible, setImportModalVisible] = useState(false);
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [editDeckModalVisible, setEditDeckModalVisible] = useState(false);

  const [boxName, setBoxName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Book');
  const [newFolderName, setNewFolderName] = useState('');
  
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
  const borderColor = useThemeColor({}, 'border');

  const loadData = useCallback(async () => {
    const [savedDecks, savedFolders] = await Promise.all([getDecks(), getFolders()]);
    setDecks(savedDecks.filter(d => d.type === 'csv'));
    setFolders(savedFolders);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );



  const handleSaveDeck = async () => {
    if (!boxName.trim()) return;

    try {
      await saveDeck(boxName, '', selectedIcon, 'csv', 0, currentFolderId); // Fallback for old saveDeck if needed, but better use createEmptyDeck
      setImportModalVisible(false);
      setBoxName('');
      setSelectedIcon('Book');
      loadData();
    } catch (e) {
      Alert.alert('Error', 'Failed to create deck');
    }
  };

  // Actually let's use the new createEmptyDeck
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
      showToast({ message: t('error'), type: 'error' });
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
      showToast({ message: t('error'), type: 'error' });
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      t('deleteDeck'),
      t('deleteDeckMessage').replace('{name}', name),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteDeck(id);
            loadData();
            showToast({ message: t('deckDeleted').replace('{name}', name), type: 'info' });
          }
        }
      ]
    );
  };

  const handleDeleteFolder = (id: string, name: string) => {
    Alert.alert(
      t('deleteFolder'),
      t('deleteFolderMessage').replace('{name}', name),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteFolder(id);
            loadData();
            showToast({ message: t('folderDeleted').replace('{name}', name), type: 'info' });
          }
        }
      ]
    );
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

  const currentFolders = folders.filter(f => (f.parentId || null) === currentFolderId);
  const currentDecks = decks.filter(d => (d.folderId || null) === currentFolderId);
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
          >
            <FolderIcon size={24} color={accentColor} strokeWidth={3} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: accentColor }]}
            onPress={() => setImportModalVisible(true)}
            activeOpacity={0.9}
          >
            <Plus size={24} color={primaryForeground} strokeWidth={3} />
          </TouchableOpacity>
        </View>
      </View>

      {folderPath.length > 0 && (
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
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: secondaryBg }]}>
              <BookOpen size={48} color={accentColor} strokeWidth={2.5} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>{currentFolderId ? 'Folder is empty' : 'No flashcards yet'}</Text>
            <Text style={[styles.emptyText, { color: mutedForeground }]}>
              {currentFolderId ? 'Create a subfolder or import a CSV deck here.' : 'Import a CSV file to create your first study deck.'}
            </Text>
            <Button
              title="Create New Deck"
              onPress={() => setImportModalVisible(true)}
              style={styles.emptyButton}
            />
          </View>
        }
      />

      {/* New Folder Modal */}
      <Modal
        visible={newFolderModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setNewFolderModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalDismiss} onPress={() => setNewFolderModalVisible(false)} />
            <View style={[styles.modalContent, { backgroundColor }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>New Folder</Text>
                <TouchableOpacity onPress={() => setNewFolderModalVisible(false)}>
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
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Import Deck Modal */}
      <Modal
        visible={importModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setImportModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalDismiss}
              activeOpacity={1}
              onPress={() => {
                setImportModalVisible(false);
              }}
            />
            <View style={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  Create New Deck
                </Text>
                <TouchableOpacity onPress={() => {
                  setImportModalVisible(false);
                }}>
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

                  <View style={[styles.pickedFileBadge, { backgroundColor: secondaryBg }]}>
                    <Text style={[styles.pickedFileName, { color: mutedForeground, fontSize: 12, marginLeft: 0 }]}>
                      You can import a CSV file later inside the deck settings.
                    </Text>
                  </View>

                  <Button
                    title="Start Building"
                    onPress={handleCreateDeck}
                    style={styles.saveButton}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Deck Modal */}
      <Modal
        visible={editDeckModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditDeckModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalDismiss}
              activeOpacity={1}
              onPress={() => setEditDeckModalVisible(false)}
            />
            <View style={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  Edit Deck
                </Text>
                <TouchableOpacity onPress={() => setEditDeckModalVisible(false)}>
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
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
