'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-full ${variant === 'danger' ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
            <AlertTriangle className={variant === 'danger' ? 'text-red-500' : 'text-yellow-500'} size={24} />
          </div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
        </div>
        
        <p className="text-muted-foreground mb-6">
          {message}
        </p>

        <div className="flex gap-3 justify-end">
          <Button onClick={onClose} variant="outline">
            {cancelText}
          </Button>
          <Button 
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : ''}
          >
            {confirmText}
          </Button>
        </div>
      </Card>
    </div>
  );
}
