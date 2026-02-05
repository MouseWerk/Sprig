'use client';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';
import { BookOpen, FileText, FolderOpen, Library, Music, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Deck {
  _id: string;
  name: string;
  description?: string;
  cardCount: number;
  icon?: string;
}

interface Stats {
  decks: number;
  cards: number;
  audio: number;
  pdfs: number;
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [stats, setStats] = useState<Stats>({ decks: 0, cards: 0, audio: 0, pdfs: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
    }
  }, [isAuthenticated]);

  const loadDashboardData = async () => {
    try {
      const [decksData, audioData, pdfsData] = await Promise.all([
        apiClient.getDecks(),
        apiClient.getAudioFiles(),
        apiClient.getPDFs(),
      ]);

      setDecks(decksData.slice(0, 6));
      
      const totalCards = decksData.reduce((sum: number, deck: any) => sum + (deck.cardCount || 0), 0);
      setStats({
        decks: decksData.length,
        cards: totalCards,
        audio: audioData.length,
        pdfs: pdfsData.length,
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 lg:ml-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Welcome back, {user?.name}!
            </h1>
            <p className="text-muted-foreground">
              Continue your learning journey
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 rounded-xl">
                  <Library className="text-purple-600 dark:text-purple-400" size={24} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Decks</p>
                  <p className="text-2xl font-bold text-foreground">{stats.decks}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-pink-500/10 rounded-xl">
                  <FolderOpen className="text-pink-600 dark:text-pink-400" size={24} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cards</p>
                  <p className="text-2xl font-bold text-foreground">{stats.cards}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl">
                  <Music className="text-blue-600 dark:text-blue-400" size={24} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Audio Files</p>
                  <p className="text-2xl font-bold text-foreground">{stats.audio}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/10 rounded-xl">
                  <FileText className="text-green-600 dark:text-green-400" size={24} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">PDF Documents</p>
                  <p className="text-2xl font-bold text-foreground">{stats.pdfs}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-foreground">Recent Decks</h2>
            <Link href="/dashboard/decks">
              <Button>
                <Plus size={18} />
                New Deck
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading decks...
            </div>
          ) : decks.length === 0 ? (
            <Card className="p-12 text-center">
              <Library className="mx-auto mb-4 text-muted-foreground" size={48} />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No decks yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Create your first deck to start learning
              </p>
              <Link href="/dashboard/decks">
                <Button>
                  <Plus size={18} />
                  Create Deck
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {decks.map((deck) => (
                <Link key={deck._id} href={`/dashboard/decks/${deck._id}`}>
                  <Card hover className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-secondary rounded-lg">
                        <BookOpen size={20} className="text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {deck.name}
                      </h3>
                    </div>
                    {deck.description && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {deck.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FolderOpen size={16} />
                      <span>{deck.cardCount || 0} cards</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
