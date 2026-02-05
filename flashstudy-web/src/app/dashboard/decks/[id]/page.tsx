'use client';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';
import { ArrowLeft, ChevronLeft, ChevronRight, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Card {
  _id: string;
  front: string;
  back: string;
}

interface Deck {
  _id: string;
  name: string;
  description?: string;
  cardCount: number;
}

export default function DeckDetailPage() {
  const params = useParams();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStudyMode, setShowStudyMode] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated && params.id) {
      loadDeck();
      loadCards();
    }
  }, [isAuthenticated, params.id]);

  const loadDeck = async () => {
    try {
      const allDecks = await apiClient.getDecks();
      const foundDeck = allDecks.find((d: any) => d._id === params.id || d.id === params.id);
      if (foundDeck) {
        setDeck(foundDeck);
      }
    } catch (error) {
      console.error('Failed to load deck:', error);
    }
  };

  const loadCards = async () => {
    try {
      const data = await apiClient.getCards(params.id as string);
      let cardsArray = Array.isArray(data?.cards) ? data.cards : Array.isArray(data) ? data : [];
      
      // Map question/answer to front/back
      cardsArray = cardsArray.map((card: any) => ({
        _id: card._id || card.id,
        front: card.front || card.question,
        back: card.back || card.answer
      }));
      
      setCards(cardsArray);
    } catch (error) {
      console.error('Failed to load cards:', error);
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCard = async () => {
    if (!front.trim() || !back.trim()) return;
    try {
      await apiClient.createCard({
        deckId: params.id as string,
        front,
        back,
      });
      setShowAddModal(false);
      setFront('');
      setBack('');
      loadCards();
      loadDeck();
    } catch (error) {
      console.error('Failed to add card:', error);
    }
  };

  const handleDeleteCard = async (id: string) => {
    setDeleteCardId(id);
  };

  const confirmDeleteCard = async () => {
    if (!deleteCardId) return;
    try {
      await apiClient.deleteCard(deleteCardId);
      loadCards();
      loadDeck();
    } catch (error) {
      console.error('Failed to delete card:', error);
    }
  };

  const nextCard = () => {
    setShowAnswer(false);
    setCurrentCardIndex((prev) => (prev + 1) % cards.length);
  };

  const previousCard = () => {
    setShowAnswer(false);
    setCurrentCardIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const resetStudy = () => {
    setCurrentCardIndex(0);
    setShowAnswer(false);
  };

  if (isLoading || !isAuthenticated || loading) {
    return null;
  }

  if (showStudyMode && cards.length > 0) {
    const currentCard = cards[currentCardIndex];

    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        
        <div className="flex-1 lg:ml-0">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between mb-8">
              <Button
                onClick={() => setShowStudyMode(false)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ArrowLeft size={18} />
                Back to Deck
              </Button>
              <div className="text-muted-foreground">
                {currentCardIndex + 1} / {cards.length}
              </div>
              <Button
                onClick={resetStudy}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RotateCcw size={18} />
                Reset
              </Button>
            </div>

            <div className="mb-8">
              <Card
                className="p-12 min-h-[400px] flex items-center justify-center cursor-pointer"
                onClick={() => setShowAnswer(!showAnswer)}
              >
                <div className="text-center">
                  {!showAnswer ? (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">Question</p>
                      <p className="text-2xl font-medium text-foreground whitespace-pre-wrap">
                        {currentCard.front}
                      </p>
                      <p className="text-sm text-muted-foreground mt-8">
                        Click to reveal answer
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">Answer</p>
                      <p className="text-2xl font-medium text-foreground whitespace-pre-wrap">
                        {currentCard.back}
                      </p>
                    </>
                  )}
                </div>
              </Card>
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button
                onClick={previousCard}
                variant="outline"
                size="lg"
                disabled={cards.length === 1}
              >
                <ChevronLeft size={24} />
                Previous
              </Button>
              <Button
                onClick={nextCard}
                size="lg"
                disabled={cards.length === 1}
              >
                Next
                <ChevronRight size={24} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 lg:ml-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <Link href="/dashboard/decks">
              <Button variant="outline" className="mb-4">
                <ArrowLeft size={18} />
                Back to Decks
              </Button>
            </Link>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  {deck?.name}
                </h1>
                {deck?.description && (
                  <p className="text-muted-foreground">{deck.description}</p>
                )}
              </div>
              <div className="flex gap-3">
                {cards.length > 0 && (
                  <Button
                    onClick={() => setShowStudyMode(true)}
                    className="flex items-center gap-2"
                  >
                    <Play size={18} />
                    Study
                  </Button>
                )}
                <Button
                  onClick={() => setShowAddModal(true)}
                  variant="outline"
                >
                  <Plus size={18} />
                  Add Card
                </Button>
              </div>
            </div>
          </div>

          {cards.length === 0 ? (
            <Card className="p-12 text-center">
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No cards yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Add your first card to start studying
              </p>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus size={18} />
                Add Card
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {cards.map((card) => (
                <Card key={card._id} className="p-6 group">
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">FRONT</p>
                    <p className="text-foreground font-medium whitespace-pre-wrap">
                      {card.front}
                    </p>
                  </div>
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">BACK</p>
                    <p className="text-foreground whitespace-pre-wrap">
                      {card.back}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleDeleteCard(card._id)}
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive-foreground transition-opacity"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Card Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-2xl font-bold text-foreground mb-4">Add New Card</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Front (Question)
                </label>
                <textarea
                  className="w-full p-3 bg-secondary text-foreground rounded-lg border border-border focus:border-primary outline-none min-h-[100px]"
                  placeholder="Enter the question"
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Back (Answer)
                </label>
                <textarea
                  className="w-full p-3 bg-secondary text-foreground rounded-lg border border-border focus:border-primary outline-none min-h-[100px]"
                  placeholder="Enter the answer"
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleAddCard} className="flex-1">
                  Add Card
                </Button>
                <Button onClick={() => setShowAddModal(false)} variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Card Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteCardId}
        onClose={() => setDeleteCardId(null)}
        onConfirm={confirmDeleteCard}
        title="Delete Card"
        message="Are you sure you want to delete this card? This action cannot be undone."
        confirmText="Delete Card"
        variant="danger"
      />
    </div>
  );
}
