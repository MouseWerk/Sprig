import { useCustomTheme } from '@/components/ThemeProvider';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { replayOnboarding } from '@/components/Onboarding';
import { SprigLogo } from '@/components/SprigLogo';
import { createBackup, importBackup } from '@/utils/Backup';
import { cancelStreakReminder, scheduleStreakReminder } from '@/utils/Notifications';
import { DAILY_GOAL_OPTIONS, FOCUS_MINUTES_OPTIONS, Preferences, REMINDER_HOUR_MAX, REMINDER_HOUR_MIN, getPrefsSync, setPref, subscribePrefs } from '@/utils/Preferences';
import { clearCardCache, wipeAllData } from '@/utils/Storage';
import { getWebServerLog, getWebServerUrl, isWebServerRunning, isWebServerSupported, startWebServer, stopWebServer } from '@/utils/WebServer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Bell, ChevronRight, Clock, Coffee, Database, DownloadCloud, Github, Globe, Info, Monitor, Moon, PlayCircle, ScrollText, ShieldCheck, Smartphone, Star, Sun, Target, Timer, Trash2, UploadCloud, Vibrate, Wifi } from 'lucide-react-native';
import { DiscordIcon } from '@/components/DiscordIcon';
import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  // UI Colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'card');
  const textColor = useThemeColor({}, 'text');
  const mutedForeground = useThemeColor({}, 'mutedForeground');
  const accentColor = useThemeColor({}, 'primary');
  const secondaryBg = useThemeColor({}, 'secondary');

  const { mode, setThemeMode, theme } = useCustomTheme();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(getPrefsSync());
  useEffect(() => subscribePrefs(setPrefs), []);

  const [webServerOn, setWebServerOn] = useState(isWebServerRunning());
  const [webServerUrl, setWebServerUrl] = useState<string | null>(null);
  const [webServerLog, setWebServerLog] = useState<string[]>([]);
  useEffect(() => {
    if (!webServerOn) return;
    getWebServerUrl().then(setWebServerUrl);
    // Poll the request log so incoming connections are visible right here
    const timer = setInterval(() => setWebServerLog(getWebServerLog()), 2000);
    return () => clearInterval(timer);
  }, [webServerOn]);

  const toggleWebServer = async () => {
    if (webServerOn) {
      stopWebServer();
      setWebServerOn(false);
      setWebServerUrl(null);
      return;
    }
    if (!isWebServerSupported()) {
      showToast({ message: t('settingsWebUploadNeedsBuild'), type: 'warning' });
      return;
    }
    try {
      const url = await startWebServer((name) => {
        showToast({ message: t('settingsReceived').replace('{name}', name), type: 'success' });
      });
      setWebServerUrl(url);
      setWebServerOn(true);
    } catch (e: any) {
      showToast({
        message: e?.message === 'no-network' ? t('settingsConnectWifiFirst') : t('settingsCouldNotStartServer'),
        type: 'error',
      });
    }
  };

  const isDarkMode = theme === 'dark';

  const toggleStreakReminder = async () => {
    const next = !prefs.streakReminderEnabled;
    await setPref('streakReminderEnabled', next);
    // scheduleStreakReminder reads the pref itself: cancels when off,
    // (re)schedules the daily notification when on.
    if (next) await scheduleStreakReminder();
    else await cancelStreakReminder();
  };

  const shiftReminderHour = async (delta: number) => {
    const next = Math.max(REMINDER_HOUR_MIN, Math.min(REMINDER_HOUR_MAX, prefs.reminderHour + delta));
    if (next === prefs.reminderHour) return;
    await setPref('reminderHour', next);
    if (prefs.streakReminderEnabled) await scheduleStreakReminder();
  };

  const toggleTheme = async () => {
    const nextMode = isDarkMode ? 'light' : 'dark';
    await setThemeMode(nextMode);
  };

  const handleClearCache = async () => {
    const ok = await confirm({
      title: t('settingsClearCache'),
      message: t('settingsClearCacheMessage'),
      confirmText: t('settingsClear'),
      destructive: true,
    });
    if (!ok) return;
    await clearCardCache();
    // Also sweep any parsed-card blobs left over from the pre-SQLite era
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith('csvtudyapp_cache_'));
    if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
    showToast({ message: t('settingsCacheCleared'), type: 'success' });
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: t('settingsShareMessage'),
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handlePrivacy = async () => {
    const viewFull = await confirm({
      title: t('settingsPrivacyTitle'),
      message: t('settingsPrivacyMessage'),
      confirmText: t('settingsViewFullPolicy'),
      cancelText: t('close'),
    });
    if (viewFull) {
      await openUrl('https://mousewerk.de/sprig/privacy');
    }
  };

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (e) {
      console.error('Could not open URL:', e);
      showToast({ message: t('couldNotOpenLink'), type: 'error' });
    }
  };

  const handleRate = async () => {
    // Try the Play Store app first, fall back to the web listing
    try {
      await Linking.openURL('market://details?id=com.mousewerk.sprig');
    } catch {
      await openUrl('https://play.google.com/store/apps/details?id=com.mousewerk.sprig');
    }
  };

  const handleDeleteAll = async () => {
    const first = await confirm({
      title: t('settingsDeleteAllTitle'),
      message: t('settingsDeleteAllMessage'),
      confirmText: t('settingsContinue'),
      destructive: true,
    });
    if (!first) return;
    const second = await confirm({
      title: t('settingsAbsolutelySure'),
      message: t('settingsNoUndo'),
      confirmText: t('settingsDeleteEverything'),
      destructive: true,
    });
    if (!second) return;
    setBusy(true);
    try {
      await wipeAllData();
      await AsyncStorage.clear();
      showToast({ message: t('settingsAllDataDeleted'), type: 'info' });
    } catch (e) {
      console.error('Wipe failed:', e);
      showToast({ message: t('settingsCouldNotDeleteAll'), type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleBackup = async () => {
    if (busy) return;
    setBusy(true);
    try {
      showToast({ message: t('settingsPreparingBackup'), type: 'info' });
      const uri = await createBackup();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: t('settingsSaveBackupDialog') });
      } else {
        showToast({ message: t('settingsSharingUnavailable'), type: 'error' });
      }
    } catch (e) {
      console.error('Backup failed:', e);
      showToast({ message: t('settingsBackupFailed'), type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const ok = await confirm({
        title: t('settingsRestoreTitle'),
        message: t('settingsRestoreMessage'),
        confirmText: t('settingsRestore'),
      });
      if (!ok) return;
      setBusy(true);
      const summary = await importBackup(res.assets[0].uri);
      showToast({
        message: t(summary.decksAdded === 1 ? 'settingsRestoredOne' : 'settingsRestoredMany')
          .replace('{decks}', String(summary.decksAdded))
          .replace('{audio}', String(summary.audioAdded)),
        type: 'success',
      });
    } catch (e) {
      console.error('Restore failed:', e);
      showToast({ message: t('settingsRestoreReadFailed'), type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const SettingItem = ({ icon: Icon, label, value, onPress, toggle, rightElement, destructive }: any) => (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: cardColor }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.iconContainer, { backgroundColor: destructive ? '#ef444418' : secondaryBg }]}>
        <Icon size={20} color={destructive ? '#ef4444' : accentColor} strokeWidth={2.5} />
      </View>
      <Text style={[styles.itemLabel, { color: destructive ? '#ef4444' : textColor }]}>{label}</Text>
      {value && <Text style={[styles.itemValue, { color: mutedForeground }]}>{value}</Text>}
      {toggle !== undefined && (
        <Switch
          value={toggle}
          onValueChange={onPress}
          trackColor={{ false: '#767577', true: accentColor }}
          thumbColor="#f4f3f4"
        />
      )}
      {rightElement}
      {onPress && !toggle && !rightElement && <ChevronRight size={18} color={mutedForeground} />}
    </TouchableOpacity>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionHeader, { color: mutedForeground }]}>{title}</Text>
  );

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={[styles.title, { color: textColor }]}>{t('settings_title')}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <View style={styles.brandHeader}>
          <SprigLogo size={56} />
          <Text style={[styles.brandVersion, { color: mutedForeground }]}>
            {t('settingsVersion')} {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>

        <SectionHeader title={t('language').toUpperCase()} />
        <View style={styles.group}>
          <View style={[styles.item, { backgroundColor: cardColor }]}>
            <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
              <Globe size={20} color={accentColor} strokeWidth={2.5} />
            </View>
            <Text style={[styles.itemLabel, { color: textColor }]}>{t('language')}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.prefChip, { backgroundColor: language === 'en' ? accentColor : secondaryBg, minWidth: 44 }]}
                onPress={() => setLanguage('en')}
                accessibilityLabel="English"
                accessibilityRole="radio"
                accessibilityState={{ selected: language === 'en' }}
              >
                <Text style={[styles.prefChipText, { color: language === 'en' ? backgroundColor : mutedForeground }]}>EN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.prefChip, { backgroundColor: language === 'de' ? accentColor : secondaryBg, minWidth: 44 }]}
                onPress={() => setLanguage('de')}
                accessibilityLabel="Deutsch"
                accessibilityRole="radio"
                accessibilityState={{ selected: language === 'de' }}
              >
                <Text style={[styles.prefChipText, { color: language === 'de' ? backgroundColor : mutedForeground }]}>DE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <SectionHeader title={t('theme').toUpperCase()} />
        <View style={styles.group}>
          <SettingItem
            icon={isDarkMode ? Moon : Sun}
            label={t('settingsDarkMode')}
            toggle={isDarkMode}
            onPress={toggleTheme}
          />
          <SettingItem
            icon={Monitor}
            label={t('settingsUseSystemTheme')}
            toggle={mode === 'system'}
            onPress={() => setThemeMode(mode === 'system' ? theme || 'light' : 'system')}
          />
        </View>

        <SectionHeader title={t('settingsPreferences')} />
        <View style={styles.group}>
          <View style={[styles.item, { backgroundColor: cardColor }]}>
            <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
              <Target size={20} color={accentColor} strokeWidth={2.5} />
            </View>
            <Text style={[styles.itemLabel, { color: textColor }]}>{t('settingsDailyGoal')}</Text>
            <View style={styles.chipRow}>
              {DAILY_GOAL_OPTIONS.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.prefChip, { backgroundColor: prefs.dailyGoal === n ? accentColor : secondaryBg }]}
                  onPress={() => setPref('dailyGoal', n)}
                  accessibilityLabel={`Daily goal ${n} cards`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: prefs.dailyGoal === n }}
                >
                  <Text style={[styles.prefChipText, { color: prefs.dailyGoal === n ? backgroundColor : mutedForeground }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.item, { backgroundColor: cardColor }]}>
            <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
              <Timer size={20} color={accentColor} strokeWidth={2.5} />
            </View>
            <Text style={[styles.itemLabel, { color: textColor }]}>{t('settingsFocusLength')}</Text>
            <View style={styles.chipRow}>
              {FOCUS_MINUTES_OPTIONS.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.prefChip, { backgroundColor: prefs.defaultFocusMinutes === n ? accentColor : secondaryBg }]}
                  onPress={() => setPref('defaultFocusMinutes', n)}
                  accessibilityLabel={`Default focus length ${n} minutes`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: prefs.defaultFocusMinutes === n }}
                >
                  <Text style={[styles.prefChipText, { color: prefs.defaultFocusMinutes === n ? backgroundColor : mutedForeground }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <SettingItem
            icon={Bell}
            label={t('settingsStreakReminder')}
            toggle={prefs.streakReminderEnabled}
            onPress={toggleStreakReminder}
          />
          {prefs.streakReminderEnabled && (
            <View style={[styles.item, { backgroundColor: cardColor }]}>
              <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
                <Clock size={20} color={accentColor} strokeWidth={2.5} />
              </View>
              <Text style={[styles.itemLabel, { color: textColor }]}>{t('settingsReminderTime')}</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.prefChip, { backgroundColor: secondaryBg }]}
                  onPress={() => shiftReminderHour(-1)}
                  disabled={prefs.reminderHour <= REMINDER_HOUR_MIN}
                  accessibilityLabel="Reminder one hour earlier"
                  accessibilityRole="button"
                >
                  <Text style={[styles.prefChipText, { color: prefs.reminderHour <= REMINDER_HOUR_MIN ? mutedForeground + '66' : mutedForeground }]}>−</Text>
                </TouchableOpacity>
                <View style={[styles.prefChip, { backgroundColor: accentColor, minWidth: 62 }]}>
                  <Text style={[styles.prefChipText, { color: backgroundColor }]}>
                    {String(prefs.reminderHour).padStart(2, '0')}:00
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.prefChip, { backgroundColor: secondaryBg }]}
                  onPress={() => shiftReminderHour(1)}
                  disabled={prefs.reminderHour >= REMINDER_HOUR_MAX}
                  accessibilityLabel="Reminder one hour later"
                  accessibilityRole="button"
                >
                  <Text style={[styles.prefChipText, { color: prefs.reminderHour >= REMINDER_HOUR_MAX ? mutedForeground + '66' : mutedForeground }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <SettingItem
            icon={Vibrate}
            label={t('settingsHapticFeedback')}
            toggle={prefs.hapticsEnabled}
            onPress={() => setPref('hapticsEnabled', !prefs.hapticsEnabled)}
          />
          <SettingItem icon={PlayCircle} label={t('settingsReplayIntro')} onPress={replayOnboarding} />
        </View>

        <SectionHeader title={t('settingsWebUpload')} />
        <View style={styles.group}>
          <SettingItem
            icon={Wifi}
            label={t('settingsUploadFromComputer')}
            toggle={webServerOn}
            onPress={toggleWebServer}
          />
          {webServerOn && webServerUrl && (
            <View style={[styles.item, { backgroundColor: cardColor }]}>
              <View style={[styles.iconContainer, { backgroundColor: secondaryBg }]}>
                <Monitor size={20} color={accentColor} strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemLabel, { color: textColor }]}>{webServerUrl}</Text>
                <Text style={[styles.itemHint, { color: mutedForeground }]}>
                  {t('settingsWebUploadHint')}
                </Text>
              </View>
            </View>
          )}
          {webServerOn && webServerLog.length > 0 && (
            <View style={[styles.item, { backgroundColor: cardColor, alignItems: 'flex-start' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemHint, { color: mutedForeground, marginBottom: 6 }]}>{t('settingsRecentRequests')}</Text>
                {webServerLog.slice(0, 6).map((line, i) => (
                  <Text key={i} style={[styles.logLine, { color: mutedForeground }]} numberOfLines={1}>
                    {line}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>

        <SectionHeader title={t('settingsBackupRestore')} />
        <View style={styles.group}>
          <SettingItem icon={DownloadCloud} label={busy ? t('settingsWorking') : t('settingsBackUpEverything')} onPress={handleBackup} />
          <SettingItem icon={UploadCloud} label={t('settingsRestoreFromBackup')} onPress={handleRestore} />
        </View>

        <SectionHeader title={t('storageData')} />
        <View style={styles.group}>
          <SettingItem icon={Database} label={t('settingsClearCache')} onPress={handleClearCache} />
          <SettingItem icon={ShieldCheck} label={t('settingsPrivacy')} onPress={handlePrivacy} />
          <SettingItem icon={Trash2} label={t('settingsDeleteAllData')} onPress={handleDeleteAll} destructive />
        </View>

        <SectionHeader title={t('settingsCommunity')} />
        <View style={styles.group}>
          <SettingItem icon={Coffee} label={t('settingsSupportDevelopment')} onPress={() => openUrl('https://buymeacoffee.com/mousewerk')} />
          <SettingItem icon={DiscordIcon} label={t('settingsJoinDiscord')} onPress={() => openUrl('https://discord.gg/TS9BXaJe9f')} />
          <SettingItem icon={Star} label={t('settingsRateSprig')} onPress={handleRate} />
          <SettingItem icon={Github} label={t('settingsGithubRepo')} onPress={() => openUrl('https://github.com/MouseWerk/Sprig')} />
          <SettingItem icon={Smartphone} label={t('settingsShareWithFriends')} onPress={handleShare} />
        </View>

        <SectionHeader title={t('settingsAbout')} />
        <View style={styles.group}>
          <SettingItem icon={ScrollText} label={t('settingsCreditsLicenses')} onPress={() => router.push('/credits')} />
          <SettingItem icon={Info} label={t('settingsVersion')} value={Constants.expoConfig?.version ?? '1.0.0'} />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: mutedForeground }]}>{t('settingsMadeBy')}</Text>
          <Text style={[styles.footerVersion, { color: mutedForeground }]}>Sprig © 2026</Text>
        </View>
      </ScrollView>
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
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  brandHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  brandVersion: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  group: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 28,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingVertical: 14,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  itemLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  itemValue: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  itemHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  logLine: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  prefChip: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefChipText: {
    fontSize: 13,
    fontWeight: '800',
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
    gap: 4,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerVersion: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.6,
  },
});
