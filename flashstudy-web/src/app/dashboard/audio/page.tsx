'use client';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';
import { Music, Pause, Play, SkipBack, SkipForward, Trash2, Upload, Volume2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface AudioFile {
  _id: string;
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

export default function AudioPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentAudio, setCurrentAudio] = useState<AudioFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAudioFiles();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const loadAudioFiles = async () => {
    try {
      const data = await apiClient.getAudioFiles();
      setAudioFiles(data);
    } catch (error) {
      console.error('Failed to load audio files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('audio', file);

    try {
      await apiClient.uploadAudio(formData);
      loadAudioFiles();
    } catch (error) {
      console.error('Failed to upload audio:', error);
      alert('Failed to upload audio file');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await apiClient.deleteAudio(id);
      if (currentAudio?._id === id) {
        setCurrentAudio(null);
        setIsPlaying(false);
      }
      loadAudioFiles();
    } catch (error) {
      console.error('Failed to delete audio:', error);
    }
  };

  const playAudio = (audio: AudioFile) => {
    if (currentAudio?._id === audio._id) {
      togglePlayPause();
    } else {
      setCurrentAudio(audio);
      setIsPlaying(true);
      setTimeout(() => audioRef.current?.play(), 100);
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seek = (value: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const skipForward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 10, duration);
  };

  const skipBackward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 10, 0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 lg:ml-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-foreground">Audio Files</h1>
            <label>
              <Button>
                <Upload size={18} />
                Upload Audio
              </Button>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : audioFiles.length === 0 ? (
            <Card className="p-12 text-center">
              <Music className="mx-auto mb-4 text-muted-foreground" size={48} />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No audio files yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Upload your first audio file to start listening
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {audioFiles.map((audio) => (
                  <Card
                    key={audio._id}
                    className={`p-6 group cursor-pointer ${
                      currentAudio?._id === audio._id ? 'border-primary' : ''
                    }`}
                    onClick={() => playAudio(audio)}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-3 rounded-xl ${
                        currentAudio?._id === audio._id
                          ? 'bg-primary/20'
                          : 'bg-blue-500/10'
                      }`}>
                        <Music className={`${
                          currentAudio?._id === audio._id
                            ? 'text-primary'
                            : 'text-blue-600 dark:text-blue-400'
                        }`} size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-foreground truncate">
                          {audio.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {(audio.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        className={`p-2 rounded-full ${
                          currentAudio?._id === audio._id && isPlaying
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          playAudio(audio);
                        }}
                      >
                        {currentAudio?._id === audio._id && isPlaying ? (
                          <Pause size={16} />
                        ) : (
                          <Play size={16} />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(audio._id, audio.name);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive-foreground transition-opacity"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Audio Player */}
              {currentAudio && (
                <Card className="fixed bottom-0 left-0 right-0 lg:left-64 p-6 rounded-none border-t">
                  <div className="max-w-7xl mx-auto">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-blue-500/10 rounded-xl">
                        <Volume2 className="text-blue-600 dark:text-blue-400" size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-foreground truncate">
                          {currentAudio.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </p>
                      </div>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max={duration || 0}
                      value={currentTime}
                      onChange={(e) => seek(parseFloat(e.target.value))}
                      className="w-full mb-4"
                    />

                    <div className="flex items-center justify-center gap-4">
                      <Button onClick={skipBackward} variant="outline" size="sm">
                        <SkipBack size={18} />
                      </Button>
                      <Button onClick={togglePlayPause} size="lg">
                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                      </Button>
                      <Button onClick={skipForward} variant="outline" size="sm">
                        <SkipForward size={18} />
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              <audio
                ref={audioRef}
                src={currentAudio?.url}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
