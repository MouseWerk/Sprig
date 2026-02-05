import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Icons from 'lucide-react-native';
import { ChevronRight, FileText, FileUp, Folder as FolderIcon, Library, Plus, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconPicker } from '../../components/IconPicker';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Deck, deleteDeck, deleteFolder, Folder, getDecks, getFolders, saveDeck, saveFolder } from '../../utils/Storage';

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [pdfs, setPdfs] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [importModalVisible, setImportModalVisible] = useState(false);
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);

  const [pickedFile, setPickedFile] = useState<{ uri: string, name: string } | null>(null);
  const [docName, setDocName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('FileText');
  const [newFolderName, setNewFolderName] = useState('');

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const mutedForeground = useThemeColor({}, 'mutedForeground');
  const secondaryBg = useThemeColor({}, 'secondary');
  const accentColor = useThemeColor({}, 'primary');
  const primaryForeground = useThemeColor({}, 'primaryForeground');
  const borderColor = useThemeColor({}, 'border');

  const loadData = useCallback(async () => {
    const [savedDecks, savedFolders] = await Promise.all([getDecks(), getFolders()]);
    setPdfs(savedDecks.filter(d => d.type === 'pdf'));
    setFolders(savedFolders);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handlePickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setPickedFile({ uri: asset.uri, name: asset.name });
        setDocName(asset.name.replace(/\.pdf$/i, ''));
      }
    } catch (err) {
      console.error('Error picking PDF:', err);
      Alert.alert('Error', 'Failed to pick PDF');
    }
  };

  const handleSaveDoc = async () => {
    if (!pickedFile) return;

    try {
      await saveDeck(docName, pickedFile.uri, selectedIcon, 'pdf', 0, currentFolderId);
      setImportModalVisible(false);
      setPickedFile(null);
      setDocName('');
      setSelectedIcon('FileText');
      loadData();
    } catch (e) {
      Alert.alert('Error', 'Failed to save document');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await saveFolder(newFolderName, currentFolderId);
      setNewFolderName('');
      setNewFolderModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Error', 'Failed to create folder');
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Document',
      `This will permanently remove "${name}" from your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDeck(id);
            loadData();
          }
        }
      ]
    );
  };

  const handleDeleteFolder = (id: string, name: string) => {
    Alert.alert(
      'Delete Folder',
      `Delete "${name}"? Documents inside will be moved to root.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteFolder(id);
            loadData();
          }
        }
      ]
    );
  };

  const renderDocItem = (item: Deck) => {
    const IconComponent = (Icons as any)[item.icon] || Icons.FileText;

    return (
      <View style={[styles.docCard, { backgroundColor: secondaryBg }]}>
        <TouchableOpacity
          style={styles.docContent}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/pdf-view', params: { uri: item.uri, name: item.name } })}
        >
          <View style={[styles.docIconContainer, { backgroundColor: accentColor + '10' }]}>
            <IconComponent size={24} color={accentColor} strokeWidth={2.5} />
          </View>
          <View style={styles.docInfo}>
            <Text style={[styles.docName, { color: textColor }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.docSub, { color: mutedForeground }]}>{t('pdfDocument')}</Text>
          </View>
          <ChevronRight size={18} color={mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.id, item.name)}
        >
          <Trash2 size={18} color="#ef4444" />
        </TouchableOpacity>
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
      >
        <Trash2 size={18} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );

  const currentFolders = folders.filter(f => (f.parentId || null) === currentFolderId);
  const currentPdfs = pdfs.filter(d => (d.folderId || null) === currentFolderId);
  const combinedData = [...currentFolders.map(f => ({ ...f, isFolder: true })), ...currentPdfs.map(d => ({ ...d, isFolder: false }))];

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
        renderItem={({ item }) => item.isFolder ? renderFolderItem(item as any) : renderDocItem(item as any)}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
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
                <Text style={[styles.modalTitle, { color: textColor }]}>{t('newFolder')}</Text>
                <TouchableOpacity onPress={() => setNewFolderModalVisible(false)}>
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
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Import PDF Modal */}
      <Modal
        visible={importModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setImportModalVisible(false);
          setPickedFile(null);
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
                setPickedFile(null);
              }}
            />
            <View style={[styles.modalContent, { backgroundColor, paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  {pickedFile ? 'Document Info' : 'Add to Library'}
                </Text>
                <TouchableOpacity onPress={() => {
                  setImportModalVisible(false);
                  setPickedFile(null);
                }}>
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
  }
});
