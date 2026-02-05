'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Library, Music, FileText, Settings as SettingsIcon, LogOut, Moon, Sun } from 'lucide-react';
import { Button } from '../Button';

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/decks', label: 'Decks', icon: Library },
    { href: '/audio', label: 'Audio', icon: Music },
    { href: '/pdfs', label: 'PDFs', icon: FileText },
    { href: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/dashboard" className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            FlashStudy
          </Link>

          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {theme === 'dark' ? <Sun size={20} className="text-yellow-500" /> : <Moon size={20} className="text-gray-700" />}
            </button>

            <div className="hidden md:flex items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">{user?.name}</span>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut size={16} />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
