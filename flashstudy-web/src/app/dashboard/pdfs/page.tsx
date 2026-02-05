'use client';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';
import { ExternalLink, FileText, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface PDF {
  _id: string;
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

export default function PDFsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadPDFs();
    }
  }, [isAuthenticated]);

  const loadPDFs = async () => {
    try {
      const data = await apiClient.getPDFs();
      setPdfs(data);
    } catch (error) {
      console.error('Failed to load PDFs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      await apiClient.uploadPDF(formData);
      loadPDFs();
    } catch (error) {
      console.error('Failed to upload PDF:', error);
      alert('Failed to upload PDF file');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await apiClient.deletePDF(id);
      loadPDFs();
    } catch (error) {
      console.error('Failed to delete PDF:', error);
    }
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
            <h1 className="text-3xl font-bold text-foreground">PDF Documents</h1>
            <label>
              <Button>
                <Upload size={18} />
                Upload PDF
              </Button>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : pdfs.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="mx-auto mb-4 text-muted-foreground" size={48} />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No PDF documents yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Upload your first PDF to start reading
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pdfs.map((pdf) => (
                <Card key={pdf._id} className="p-6 group">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-3 bg-green-500/10 rounded-xl">
                      <FileText className="text-green-600 dark:text-green-400" size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-foreground truncate">
                        {pdf.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {(pdf.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <a
                      href={pdf.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink size={16} />
                      Open PDF
                    </a>
                    <button
                      onClick={() => handleDelete(pdf._id, pdf.name)}
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
    </div>
  );
}
