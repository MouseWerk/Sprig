'use client';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { LogOut, Mail, Moon, Sun, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function SettingsPage() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      logout();
    }
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 lg:ml-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-foreground mb-8">Settings</h1>

          {/* Profile Section */}
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Profile</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-secondary rounded-full">
                  <User className="text-primary" size={24} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="text-lg font-medium text-foreground">{user?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-secondary rounded-full">
                  <Mail className="text-primary" size={24} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-lg font-medium text-foreground">{user?.email}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Appearance Section */}
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Appearance</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Theme</p>
                <p className="text-sm text-muted-foreground">
                  Choose your preferred theme
                </p>
              </div>
              <Button
                onClick={toggleTheme}
                variant="outline"
                className="flex items-center gap-2"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun size={18} />
                    Light
                  </>
                ) : (
                  <>
                    <Moon size={18} />
                    Dark
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Account Section */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Account</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Sign Out</p>
                <p className="text-sm text-muted-foreground">
                  Log out from your account
                </p>
              </div>
              <Button
                onClick={handleLogout}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <LogOut size={18} />
                Logout
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
