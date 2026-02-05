'use client';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';
import { parseCSV } from '@/lib/csv-parser';
import * as Icons from 'lucide-react';
import { BookOpen, ChevronRight, Edit, FileUp, Folder as FolderIcon, Home, Library, Plus, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Deck {
  _id: string;
  name: string;
  description?: string;
  cardCount: number;
  icon?: string;
  folderId?: string;
}

interface Folder {
  _id: string;
  name: string;
  parentId?: string;
}

export default function DecksPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDeckModal, setShowNewDeckModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showEditDeckModal, setShowEditDeckModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDescription, setNewDeckDescription] = useState('');
  const [newDeckIcon, setNewDeckIcon] = useState('Book');
  const [newFolderName, setNewFolderName] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [editDeckName, setEditDeckName] = useState('');
  const [editDeckDescription, setEditDeckDescription] = useState('');
  const [editDeckIcon, setEditDeckIcon] = useState('Book');
  const [folderPath, setFolderPath] = useState<Folder[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    console.log('Auth check:', { isLoading, isAuthenticated });
    if (!isLoading && !isAuthenticated) {
      console.log('Not authenticated, redirecting to login');
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    console.log('Load data effect:', { isAuthenticated, currentFolderId });
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, currentFolderId]);

  const loadData = async () => {
    console.log('Starting loadData...');
    try {
      console.log('Fetching decks and folders...');
      const [decksData, foldersData] = await Promise.all([
        apiClient.getDecks(),
        apiClient.getFolders(),
      ]);
      
      console.log('Loaded decks:', decksData);
      console.log('Loaded folders:', foldersData);
      
      setDecks(Array.isArray(decksData) ? decksData : []);
      setFolders(Array.isArray(foldersData) ? foldersData : []);
      
      // Build folder path for breadcrumbs
      if (currentFolderId) {
        const path: Folder[] = [];
        let folderId = currentFolderId;
        while (folderId) {
          const folder = foldersData.find((f: Folder) => f._id === folderId);
          if (folder) {
            path.unshift(folder);
            folderId = folder.parentId || null;
          } else {
            break;
          }
        }
        setFolderPath(path);
      } else {
        setFolderPath([]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return;
    try {
      await apiClient.createDeck({
        name: newDeckName,
        description: newDeckDescription,
        folderId: currentFolderId || undefined,
      });
      setShowNewDeckModal(false);
      setNewDeckName('');
      setNewDeckDescription('');
      setNewDeckIcon('Book');
      loadData();
    } catch (error) {
      console.error('Failed to create deck:', error);
    }
  };

  const handleEditDeck = (deck: Deck) => {
    setEditingDeck(deck);
    setEditDeckName(deck.name);
    setEditDeckDescription(deck.description || '');
    setEditDeckIcon(deck.icon || 'Book');
    setShowEditDeckModal(true);
  };

  const handleUpdateDeck = async () => {
    if (!editingDeck || !editDeckName.trim()) return;
    try {
      await apiClient.updateDeck(editingDeck._id, {
        name: editDeckName,
        description: editDeckDescription,
      });
      setShowEditDeckModal(false);
      setEditingDeck(null);
      loadData();
    } catch (error) {
      console.error('Failed to update deck:', error);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await apiClient.createFolder({ name: newFolderName });
      setShowNewFolderModal(false);
      setNewFolderName('');
      loadData();
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleDeleteDeck = async (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await apiClient.deleteDeck(deleteConfirm.id);
      loadData();
    } catch (error) {
      console.error('Failed to delete deck:', error);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const cards = await parseCSV(file);
      
      const deckName = file.name.replace('.csv', '');
      const deck = await apiClient.createDeck({ name: deckName });

      for (const card of cards) {
        await apiClient.createCard({
          deckId: deck._id,
          front: card.front,
          back: card.back,
        });
      }

      setShowImportModal(false);
      loadData();
    } catch (error) {
      console.error('Failed to import CSV:', error);
      alert('Failed to import CSV file');
    }
  };

  const filteredDecks = currentFolderId
    ? decks.filter(d => d.folderId === currentFolderId)
    : decks.filter(d => !d.folderId);

  const filteredFolders = currentFolderId
    ? folders.filter(f => f.parentId === currentFolderId)
    : folders.filter(f => !f.parentId);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 lg:ml-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Debug info */}
          <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900 rounded text-sm">
            <p>Debug Info:</p>
            <p>Decks count: {decks.length}</p>
            <p>Folders count: {folders.length}</p>
            <p>Filtered Decks: {filteredDecks.length}</p>
            <p>Filtered Folders: {filteredFolders.length}</p>
            <p>Loading: {loading ? 'true' : 'false'}</p>
          </div>
          
          {/* Breadcrumb navigation */}
          {folderPath.length > 0 && (
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <button
                onClick={() => setCurrentFolderId(null)}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <Home size={16} />
                Home
              </button>
              {folderPath.map((folder) => (
                <div key={folder._id} className="flex items-center gap-2">
                  <ChevronRight size={16} />
                  <button
                    onClick={() => setCurrentFolderId(folder._id)}
                    className="hover:text-foreground transition-colors"
                  >
                    {folder.name}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-foreground">Flashcard Decks</h1>
            <div className="flex gap-3">
              <Button onClick={() => setShowImportModal(true)} variant="outline">
                <Upload size={18} />
                Import CSV
              </Button>
              <Button onClick={() => setShowNewFolderModal(true)} variant="outline">
                <Plus size={18} />
                New Folder
              </Button>
              <Button onClick={() => setShowNewDeckModal(true)}>
                <Plus size={18} />
                New Deck
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFolders.map((folder) => (
                <Card
                  key={folder._id}
                  className="p-6 cursor-pointer hover:border-primary"
                  onClick={() => setCurrentFolderId(folder._id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-500/10 rounded-xl">
                      <FolderIcon className="text-amber-600 dark:text-amber-400" size={24} />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{folder.name}</h3>
                  </div>
                </Card>
              ))}

              {filteredDecks.map((deck) => {
                console.log('Rendering deck:', deck);
                const IconComponent = deck.icon ? (Icons as any)[deck.icon] : BookOpen;
                console.log('Icon component:', IconComponent, 'for icon:', deck.icon);
                return (
                <Card key={deck._id} className="p-6 group">
                  <Link href={`/dashboard/decks/${deck._id}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-secondary rounded-lg">
                        {IconComponent ? <IconComponent size={20} className="text-primary" /> : <BookOpen size={20} className="text-primary" />}
                      </div>
                      <h3 className="text-lg font-semibold text-foreground flex-1">{deck.name}</h3>
                    </div>
                    {deck.description && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {deck.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {deck.cardCount || 0} cards
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleEditDeck(deck);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleDeleteDeck(deck._id, deck.name);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive-foreground transition-opacity"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </Link>
                </Card>
                );
              })}

              {filteredDecks.length === 0 && filteredFolders.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Library className="mx-auto mb-4 text-muted-foreground" size={48} />
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    No decks yet
                  </h3>
                  <p className="text-muted-foreground">
                    Create your first deck to start learning
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Deck Modal */}
      {showNewDeckModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-foreground mb-4">Create New Deck</h2>
            <div className="space-y-4">
              <Input
                placeholder="Deck Name"
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
              />
              <Input
                placeholder="Description (optional)"
                value={newDeckDescription}
                onChange={(e) => setNewDeckDescription(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Choose Icon
                </label>
                <IconPicker
                  selectedIcon={newDeckIcon}
                  onSelect={setNewDeckIcon}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleCreateDeck} className="flex-1">
                  Create
                </Button>
                <Button onClick={() => setShowNewDeckModal(false)} variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-2xl font-bold text-foreground mb-4">Create New Folder</h2>
            <div className="space-y-4">
              <Input
                placeholder="Folder Name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <div className="flex gap-3">
                <Button onClick={handleCreateFolder} className="flex-1">
                  Create
                </Button>
                <Button onClick={() => setShowNewFolderModal(false)} variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Deck Modal */}
      {showEditDeckModal && editingDeck && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-foreground mb-4">Edit Deck</h2>
            <div className="space-y-4">
              <Input
                placeholder="Deck Name"
                value={editDeckName}
                onChange={(e) => setEditDeckName(e.target.value)}
              />
              <Input
                placeholder="Description (optional)"
                value={editDeckDescription}
                onChange={(e) => setEditDeckDescription(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Choose Icon
                </label>
                <IconPicker
                  selectedIcon={editDeckIcon}
                  onSelect={setEditDeckIcon}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleUpdateDeck} className="flex-1">
                  Save Changes
                </Button>
                <Button onClick={() => setShowEditDeckModal(false)} variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title="Delete Deck"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This will permanently delete all cards in this deck. This action cannot be undone.`}
        confirmText="Delete Deck"
        variant="danger"
      />

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-2xl font-bold text-foreground mb-4">Import CSV File</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Upload a CSV file with two columns: front and back
            </p>
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary">
                <FileUp size={32} className="text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Click to select CSV file</span>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleImportCSV}
                />
              </label>
              <Button onClick={() => setShowImportModal(false)} variant="outline" className="w-full">
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
