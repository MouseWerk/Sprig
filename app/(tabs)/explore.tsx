import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Icons from 'lucide-react-native';
import { ArrowUpDown, Check, CheckCircle2, ChevronRight, Circle, FileText, FileUp, Folder as FolderIcon, FolderInput, Library, Plus, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconPicker } from '../../components/IconPicker';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { Deck, deleteDeck, deleteFolder, Folder, getDecks, getFolders, saveDeck, saveFolder, updateDeck } from '../../utils/Storage';
import { subscribeWebServerSaves } from '../../utils/WebServer';

type SortMode = 'nameAsc' | 'nameDesc' | 'newest' | 'oldest';

const SORT_STORAGE_KEY = 'csvtudyapp_library_sort';

const SORT_OPTIONS: { mode: SortMode; labelKey: 'sortNameAsc' | 'sortNameDesc' | 'sortNewest' | 'sortOldest' }[] = [
  { mode: 'nameAsc', labelKey: 'sortNameAsc' },
  { mode: 'nameDesc', labelKey: 'sortNameDesc' },
  { mode: 'newest', labelKey: 'sortNewest' },
  { mode: 'oldest', labelKey: 'sortOldest' },
];

// Legacy items have no createdAt, but their ids are Date.now() strings
function getCreatedAt(item: { id: string; createdAt?: number }): number {
  return item.createdAt ?? (parseInt(item.id, 10) || 0);
}

function sortItems<T extends { id: string; name: string; createdAt?: number }>(items: T[], mode: SortMode): T[] {
  const sorted = [...items];
  switch (mode) {
    case 'nameAsc':
      sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
      break;
    case 'nameDesc':
      sorted.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: 'base', numeric: true }));
      break;
    case 'newest':
      sorted.sort((a, b) => getCreatedAt(b) - getCreatedAt(a));
      break;
    case 'oldest':
      sorted.sort((a, b) => getCreatedAt(a) - getCreatedAt(b));
      break;
  }
  return sorted;
}

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [pdfs, setPdfs] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [importModalVisible, setImportModalVisible] = useState(false);
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const [pickedFile, setPickedFile] = useState<{ uri: string, name: string } | null>(null);
  const [docName, setDocName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('FileText');
  const [newFolderName, setNewFolderName] = useState('');

  // Long-press context sheet (single doc) + multi-select mode
  const [editDoc, setEditDoc] = useState<Deck | null>(null);
  const [editDocName, setEditDocName] = useState('');
  const [editDocFolderId, setEditDocFolderId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedForeground = useThemeColor({}, 'mutedForeground');
  const secondaryBg = useThemeColor({}, 'secondary');
  const accentColor = useThemeColor({}, 'primary');
  const primaryForeground = useThemeColor({}, 'primaryForeground');
  const borderColor = useThemeColor({}, 'border');

  const loadData = useCallback(async () => {
    const [savedDecks, savedFolders] = await Promise.all([getDecks(), getFolders('pdf')]);
    setPdfs(savedDecks.filter(d => d.type === 'pdf'));
    setFolders(savedFolders);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Live-refresh the list when the WiFi upload server saves a PDF.
  useEffect(() => {
    return subscribeWebServerSaves((_name, kind) => {
      if (kind === 'pdf') loadData();
    });
  }, [loadData]);

  useEffect(() => {
    AsyncStorage.getItem(SORT_STORAGE_KEY).then(saved => {
      if (saved === 'nameAsc' || saved === 'nameDesc' || saved === 'newest' || saved === 'oldest') {
        setSortMode(saved);
      }
    });
  }, []);

  const handleSelectSort = (mode: SortMode) => {
    setSortMode(mode);
    setSortModalVisible(false);
    AsyncStorage.setItem(SORT_STORAGE_KEY, mode).catch(() => { });
  };

  const handlePickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      if (result.assets.length === 1) {
        // Single file: let the user name it and pick an icon
        const asset = result.assets[0];
        setPickedFile({ uri: asset.uri, name: asset.name });
        setDocName(asset.name.replace(/\.pdf$/i, ''));
        return;
      }

      // Multiple files: import directly with the file name and default icon
      let imported = 0;
      for (const asset of result.assets) {
        try {
          const name = asset.name.replace(/\.pdf$/i, '') || 'Document';
          await saveDeck(name, asset.uri, 'FileText', 'pdf', 0, currentFolderId);
          imported++;
        } catch (e) {
          console.error('Error importing PDF:', asset.name, e);
        }
      }
      setImportModalVisible(false);
      loadData();
      showToast({
        message: imported === result.assets.length
          ? `${imported} PDFs imported`
          : `${imported} of ${result.assets.length} PDFs imported`,
        type: imported > 0 ? 'success' : 'error',
      });
    } catch (err) {
      console.error('Error picking PDF:', err);
      showToast({ message: 'Failed to pick PDF', type: 'error' });
    }
  };

  const handleSaveDoc = async () => {
    if (!pickedFile) return;

    try {
      const name = docName.trim() || pickedFile.name.replace(/\.pdf$/i, '') || 'Document';
      await saveDeck(name, pickedFile.uri, selectedIcon, 'pdf', 0, currentFolderId);
      setImportModalVisible(false);
      setPickedFile(null);
      setDocName('');
      setSelectedIcon('FileText');
      loadData();
    } catch (e) {
      console.error('Error saving document:', e);
      showToast({ message: 'Failed to save document', type: 'error' });
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await saveFolder(newFolderName, currentFolderId, 'pdf');
      setNewFolderName('');
      setNewFolderModalVisible(false);
      loadData();
    } catch (e) {
      console.error('Error creating folder:', e);
      showToast({ message: 'Failed to create folder', type: 'error' });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Delete Document',
      message: `This will permanently remove "${name}" from your library.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteDeck(id);
    loadData();
    showToast({ message: `"${name}" deleted`, type: 'info' });
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Delete Folder',
      message: `Delete "${name}"? Documents inside will be moved to root.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteFolder(id);
    loadData();
    showToast({ message: `"${name}" deleted`, type: 'info' });
  };

  const openDocMenu = (item: Deck) => {
    setEditDoc(item);
    setEditDocName(item.name);
    setEditDocFolderId(item.folderId || null);
  };

  const handleSaveDocEdit = async () => {
    if (!editDoc || !editDocName.trim()) return;
    try {
      await updateDeck(editDoc.id, editDocName.trim(), undefined, editDocFolderId);
      setEditDoc(null);
      loadData();
      showToast({ message: 'Document updated', type: 'success' });
    } catch (e) {
      console.error('Error updating document:', e);
      showToast({ message: 'Failed to update document', type: 'error' });
    }
  };

  const startSelectMode = (firstId?: string) => {
    setEditDoc(null);
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
        await updateDeck(id, undefined, undefined, folderId);
      }
      exitSelectMode();
      loadData();
      showToast({ message: `Moved ${count} document${count === 1 ? '' : 's'}`, type: 'success' });
    } catch (e) {
      console.error('Error moving documents:', e);
      showToast({ message: 'Failed to move documents', type: 'error' });
    }
  };

  const handleDeleteSelected = async () => {
    const count = selectedIds.size;
    const ok = await confirm({
      title: `Delete ${count} document${count === 1 ? '' : 's'}?`,
      message: 'This permanently removes the selected documents from your library.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    for (const id of selectedIds) {
      await deleteDeck(id);
    }
    exitSelectMode();
    loadData();
    showToast({ message: `Deleted ${count} document${count === 1 ? '' : 's'}`, type: 'info' });
  };

  const renderDocItem = (item: Deck) => {
    const IconComponent = (Icons as any)[item.icon] || Icons.FileText;

    const isSelected = selectedIds.has(item.id);
    return (
      <View style={[
        styles.docCard,
        { backgroundColor: secondaryBg },
        selectMode && isSelected && { borderWidth: 2, borderColor: accentColor },
      ]}>
        <TouchableOpacity
          style={styles.docContent}
          activeOpacity={0.7}
          onPress={() => {
            if (selectMode) toggleSelected(item.id);
            else router.push({ pathname: '/pdf-view', params: { id: item.id, uri: item.uri, name: item.name } });
          }}
          onLongPress={() => { if (!selectMode) openDocMenu(item); }}
          delayLongPress={350}
        >
          <View style={[styles.docIconContainer, { backgroundColor: accentColor + '10' }]}>
            <IconComponent size={24} color={accentColor} strokeWidth={2.5} />
          </View>
          <View style={styles.docInfo}>
            <Text style={[styles.docName, { color: textColor }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.docSub, { color: mutedForeground }]}>{t('pdfDocument')}</Text>
          </View>
          {selectMode ? (
            isSelected
              ? <CheckCircle2 size={22} color={accentColor} strokeWidth={2.5} />
              : <Circle size={22} color={mutedForeground} strokeWidth={2} />
          ) : (
            <ChevronRight size={18} color={mutedForeground} />
          )}
        </TouchableOpacity>
        {!selectMode && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item.id, item.name)}
            accessibilityLabel={`Delete ${item.name}`}
            accessibilityRole="button"
          >
            <Trash2 size={18} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderFolderItem = (item: Folder) => (
    <View style={[styles.docCard, { backgroundColor: secondaryBg }]}>
      <TouchableOpacity
        style={styles.docContent}
        onPress={() => setCurrentFolderId(item.id)}
      >
        <View style={[styles.docIconContainer, { backgroundColor: accentColor + '15' }]}>
          <FolderIcon size={24} color={accentColor} fill={accentColor + '30'} />
        </View>
        <View style={styles.docInfo}>
          <Text style={[styles.docName, { color: textColor }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.docSub, { color: mutedForeground }]}>Folder</Text>
        </View>
        <ChevronRight size={18} color={mutedForeground} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteFolder(item.id, item.name)}
        accessibilityLabel={`Delete folder ${item.name}`}
        accessibilityRole="button"
      >
        <Trash2 size={18} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );

  const currentFolders = sortItems(folders.filter(f => (f.parentId || null) === currentFolderId), sortMode);
  const currentPdfs = sortItems(pdfs.filter(d => (d.folderId || null) === currentFolderId), sortMode);
  const combinedData = [...currentFolders.map(f => ({ ...f, isFolder: true })), ...currentPdfs.map(d => ({ ...d, isFolder: false }))];

  const activeSortLabel = SORT_OPTIONS.find(o => o.mode === sortMode);

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
            <Text style={[styles.title, { color: textColor }]}>{t('library')}</Text>
          </TouchableOpacity>
          <View style={[styles.summaryBadge, { backgroundColor: secondaryBg }]}>
            <Text style={[styles.subtitle, { color: mutedForeground }]}>
              {pdfs.length} {pdfs.length === 1 ? t('doc') : t('docs')}
            </Text>
          </View>
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
            accessibilityLabel="Add PDF document"
            accessibilityRole="button"
            activeOpacity={0.9}
          >
            <Plus size={24} color={primaryForeground} strokeWidth={3} />
          </TouchableOpacity>
        </View>
      </View>

      {combinedData.length > 1 && (
        <View style={styles.sortRow}>
          <TouchableOpacity
            style={[styles.sortButton, { backgroundColor: secondaryBg }]}
            onPress={() => setSortModalVisible(true)}
            activeOpacity={0.7}
          >
            <ArrowUpDown size={14} color={accentColor} strokeWidth={2.5} />
            <Text style={[styles.sortButtonText, { color: textColor }]}>
              {activeSortLabel ? t(activeSortLabel.labelKey) : t('sortBy')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
        renderItem={({ item }) => item.isFolder ? renderFolderItem(item as any) : renderDocItem(item as any)}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: secondaryBg }]}>
              <Library size={48} color={accentColor} strokeWidth={2.5} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>{currentFolderId ? t('folderEmpty') : t('emptyLibrary')}</Text>
            <Text style={[styles.emptyText, { color: mutedForeground }]}>
              {currentFolderId ? t('folderEmptyMessage') : t('emptyLibraryMessage')}
            </Text>
            <Button
              title={t('addPdfDocument')}
              onPress={() => setImportModalVisible(true)}
              style={styles.emptyButton}
            />
          </View>
        }
      />

      {/* Sort Modal */}
      <BottomSheet
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
      >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>{t('sortBy')}</Text>
              <TouchableOpacity onPress={() => setSortModalVisible(false)} accessibilityLabel="Close" accessibilityRole="button">
                <X size={20} color={textColor} />
              </TouchableOpacity>
            </View>
            {SORT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.mode}
                style={[
                  styles.sortOption,
                  { backgroundColor: sortMode === option.mode ? accentColor + '15' : secondaryBg },
                ]}
                onPress={() => handleSelectSort(option.mode)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.sortOptionText,
                  { color: sortMode === option.mode ? accentColor : textColor },
                ]}>{t(option.labelKey)}</Text>
                {sortMode === option.mode && <Check size={18} color={accentColor} strokeWidth={3} />}
              </TouchableOpacity>
            ))}
      </BottomSheet>

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
                title="Create Folder"
                onPress={handleCreateFolder}
                style={{ marginTop: 24 }}
              />
      </BottomSheet>

      {/* Import PDF Modal */}
      <BottomSheet
        visible={importModalVisible}
        onClose={() => {
          setImportModalVisible(false);
          setPickedFile(null);
        }}
        sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
      >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  {pickedFile ? 'Document Info' : 'Add to Library'}
                </Text>
                <TouchableOpacity onPress={() => {
                  setImportModalVisible(false);
                  setPickedFile(null);
                }} accessibilityLabel="Close" accessibilityRole="button">
                  <X size={20} color={textColor} />
                </TouchableOpacity>
              </View>

              {!pickedFile ? (
                <TouchableOpacity
                  style={[styles.pickZone, { borderColor, backgroundColor: secondaryBg + '40' }]}
                  onPress={handlePickPDF}
                  activeOpacity={0.6}
                >
                  <View style={[styles.pickIcon, { backgroundColor: secondaryBg }]}>
                    <FileUp size={32} color={accentColor} strokeWidth={2.5} />
                  </View>
                  <Text style={[styles.pickText, { color: textColor }]}>Choose PDF File</Text>
                  <Text style={[styles.pickSub, { color: mutedForeground }]}>Stored locally in your app</Text>
                </TouchableOpacity>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
                  <View style={styles.formSection}>
                    <Input
                      label="Give it a Name"
                      value={docName}
                      onChangeText={setDocName}
                      placeholder="e.g. Science Book"
                    />

                    <Text style={[styles.sectionLabel, { color: textColor }]}>Select an Icon</Text>
                    <IconPicker selectedIcon={selectedIcon} onSelect={setSelectedIcon} />

                    <View style={[styles.pickedFileBadge, { backgroundColor: secondaryBg }]}>
                      <FileText size={16} color={accentColor} />
                      <Text style={[styles.pickedFileName, { color: textColor }]} numberOfLines={1}>
                        {pickedFile.name}
                      </Text>
                      <TouchableOpacity onPress={() => setPickedFile(null)}>
                        <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 13, marginLeft: 8 }}>Change</Text>
                      </TouchableOpacity>
                    </View>

                    <Button
                      title="Add to Library"
                      onPress={handleSaveDoc}
                      style={styles.saveButton}
                    />
                  </View>
                </ScrollView>
              )}
      </BottomSheet>

      {/* Document context sheet (long-press) */}
      <BottomSheet
        visible={editDoc !== null}
        onClose={() => setEditDoc(null)}
        sheetStyle={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}
      >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>Edit Document</Text>
                <TouchableOpacity onPress={() => setEditDoc(null)} accessibilityLabel="Close" accessibilityRole="button">
                  <X size={20} color={textColor} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
                <View style={styles.formSection}>
                  <Input
                    label="Document Name"
                    value={editDocName}
                    onChangeText={setEditDocName}
                    placeholder="e.g. Science Book"
                  />

                  <Text style={[styles.sectionLabel, { color: textColor, marginTop: 16 }]}>Move to Folder</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderPickerContainer}>
                    <TouchableOpacity
                      style={[styles.folderChip, { backgroundColor: editDocFolderId === null ? accentColor : secondaryBg }]}
                      onPress={() => setEditDocFolderId(null)}
                    >
                      <Text style={[styles.folderChipText, { color: editDocFolderId === null ? primaryForeground : textColor }]}>
                        {t('root')}
                      </Text>
                    </TouchableOpacity>
                    {folders.map((folder) => (
                      <TouchableOpacity
                        key={folder.id}
                        style={[styles.folderChip, { backgroundColor: editDocFolderId === folder.id ? accentColor : secondaryBg }]}
                        onPress={() => setEditDocFolderId(folder.id)}
                      >
                        <FolderIcon size={14} color={editDocFolderId === folder.id ? primaryForeground : textColor} />
                        <Text style={[styles.folderChipText, { color: editDocFolderId === folder.id ? primaryForeground : textColor }]}>
                          {folder.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Button
                    title="Save Changes"
                    onPress={handleSaveDocEdit}
                    style={styles.saveButton}
                  />

                  <TouchableOpacity
                    style={[styles.sheetAction, { backgroundColor: secondaryBg }]}
                    onPress={() => startSelectMode(editDoc?.id)}
                    activeOpacity={0.8}
                  >
                    <CheckCircle2 size={18} color={accentColor} strokeWidth={2.5} />
                    <Text style={[styles.sheetActionText, { color: textColor }]}>Select Multiple</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.sheetAction, { backgroundColor: '#ef444415' }]}
                    onPress={() => {
                      const doc = editDoc;
                      setEditDoc(null);
                      if (doc) handleDelete(doc.id, doc.name);
                    }}
                    activeOpacity={0.8}
                  >
                    <Trash2 size={18} color="#ef4444" strokeWidth={2.5} />
                    <Text style={[styles.sheetActionText, { color: '#ef4444' }]}>Delete Document</Text>
                  </TouchableOpacity>
                </View>
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
                  Move {selectedIds.size} document{selectedIds.size === 1 ? '' : 's'}
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
                <Library size={18} color={accentColor} strokeWidth={2.5} />
                <Text style={[styles.sheetActionText, { color: textColor }]}>{t('root')}</Text>
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

      {/* Multi-select action bar */}
      {selectMode && (
        <View style={[styles.selectBar, { backgroundColor: accentColor, bottom: insets.bottom + 16 }]}>
          <Text style={[styles.selectBarCount, { color: primaryForeground }]}>
            {selectedIds.size} selected
          </Text>
          <View style={styles.selectBarActions}>
            <TouchableOpacity
              style={styles.selectBarBtn}
              onPress={() => setMoveSheetVisible(true)}
              disabled={selectedIds.size === 0}
              accessibilityLabel="Move selected documents"
              accessibilityRole="button"
            >
              <FolderInput size={20} color={primaryForeground} strokeWidth={2.5} />
              <Text style={[styles.selectBarBtnText, { color: primaryForeground }]}>Move</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.selectBarBtn}
              onPress={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              accessibilityLabel="Delete selected documents"
              accessibilityRole="button"
            >
              <Trash2 size={20} color={primaryForeground} strokeWidth={2.5} />
              <Text style={[styles.selectBarBtnText, { color: primaryForeground }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.selectBarBtn}
              onPress={exitSelectMode}
              accessibilityLabel="Cancel selection"
              accessibilityRole="button"
            >
              <X size={20} color={primaryForeground} strokeWidth={2.5} />
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
    paddingHorizontal: 20,
    paddingTop: 8,
    flexGrow: 1,
  },
  docCard: {
    marginBottom: 16,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  docContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  docIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  docSub: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.6,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  sortOptionText: {
    fontSize: 15,
    fontWeight: '700',
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
  }
});
