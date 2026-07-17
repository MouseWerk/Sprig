import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Tabs } from 'expo-router';
import { BarChart3, Home, Library, Music, Settings } from 'lucide-react-native';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const activeColor = useThemeColor({}, 'tint');
  const inactiveColor = useThemeColor({}, 'tabIconDefault');
  const backgroundColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'border');
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor: backgroundColor,
          borderTopColor: borderColor,
          elevation: 0,
          shadowOpacity: 0,
          height: 64 + insets.bottom, // Increased height and added safe area
          paddingBottom: insets.bottom + 8, // Proper bottom padding for modern devices
          paddingTop: 12,
          paddingHorizontal: 20,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, size }) => <Home size={28} color={color} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t('explore'),
          tabBarIcon: ({ color, size }) => <Library size={28} color={color} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="audio"
        options={{
          title: t('audio'),
          tabBarIcon: ({ color, size }) => <Music size={28} color={color} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('stats'),
          tabBarIcon: ({ color, size }) => <BarChart3 size={28} color={color} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings'),
          tabBarIcon: ({ color, size }) => <Settings size={28} color={color} strokeWidth={2.5} />,
        }}
      />
    </Tabs>
  );
}
