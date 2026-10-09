import React, { createContext, useContext } from 'react';

export type AppThemePreference = 'system' | 'light' | 'dark';
export type ResolvedAppTheme = 'light' | 'dark';

export type AppTheme = {
  mode: ResolvedAppTheme;
  colors: {
    background: string;
    backgroundDeep: string;
    surface: string;
    surfaceAlt: string;
    surfaceSubtle: string;
    surfaceInfo: string;
    surfaceSelected: string;
    surfaceRoute: string;
    border: string;
    borderStrong: string;
    borderSubtle: string;
    textPrimary: string;
    textStrong: string;
    textSecondary: string;
    textSoft: string;
    placeholder: string;
    accent: string;
    accentInk: string;
    secondaryButton: string;
    info: string;
    infoText: string;
    overlay: string;
    drawer: string;
    drawerBorder: string;
    powerOn: string;
    powerOff: string;
    pending: string;
    save: string;
    ok: string;
    ring: string;
    ringTrack: string;
    arcTrack: string;
    brightnessDark: string;
    brightnessLight: string;
    hueCool: string;
    hueWarm: string;
    hueHot: string;
  };
};

export const DARK_APP_THEME: AppTheme = {
  mode: 'dark',
  colors: {
    background: '#0f172a',
    backgroundDeep: '#020617',
    surface: '#111827',
    surfaceAlt: '#0b1220',
    surfaceSubtle: '#08111d',
    surfaceInfo: '#0f2a3d',
    surfaceSelected: '#10261b',
    surfaceRoute: '#101827',
    border: '#1f2a44',
    borderStrong: '#334155',
    borderSubtle: '#172033',
    textPrimary: '#e2e8f0',
    textStrong: '#f8fafc',
    textSecondary: '#94a3b8',
    textSoft: '#cbd5f5',
    placeholder: '#64748b',
    accent: '#29a760',
    accentInk: '#062412',
    secondaryButton: '#1f2937',
    info: '#38bdf8',
    infoText: '#7dd3fc',
    overlay: 'rgba(2, 6, 23, 0.70)',
    drawer: 'rgba(11, 18, 32, 0.84)',
    drawerBorder: 'rgba(125, 211, 252, 0.24)',
    powerOn: '#22c55e',
    powerOff: '#ef4444',
    pending: '#f97316',
    save: '#2563eb',
    ok: '#22c55e',
    ring: '#22c55e',
    ringTrack: '#1f2a44',
    arcTrack: '#1f2937',
    brightnessDark: '#0f172a',
    brightnessLight: '#f8fafc',
    hueCool: '#dbeafe',
    hueWarm: '#fb923c',
    hueHot: '#ef4444',
  },
};

export const LIGHT_APP_THEME: AppTheme = {
  mode: 'light',
  colors: {
    background: '#f6f6f3',
    backgroundDeep: '#efefeb',
    surface: '#ffffff',
    surfaceAlt: '#f1f3f1',
    surfaceSubtle: '#e9eeeb',
    surfaceInfo: '#eaf4f7',
    surfaceSelected: '#e8f4ec',
    surfaceRoute: '#f3f5f3',
    border: '#d8ded9',
    borderStrong: '#bdc8c0',
    borderSubtle: '#e3e8e4',
    textPrimary: '#1c2720',
    textStrong: '#101813',
    textSecondary: '#667269',
    textSoft: '#4f5d53',
    placeholder: '#7a877e',
    accent: '#258e51',
    accentInk: '#f7fff9',
    secondaryButton: '#e7ece8',
    info: '#247c9d',
    infoText: '#17617d',
    overlay: 'rgba(20, 29, 23, 0.38)',
    drawer: 'rgba(250, 251, 249, 0.94)',
    drawerBorder: 'rgba(36, 124, 157, 0.22)',
    powerOn: '#258e51',
    powerOff: '#d14a4a',
    pending: '#dc6d20',
    save: '#2868b2',
    ok: '#258e51',
    ring: '#258e51',
    ringTrack: '#d8ded9',
    arcTrack: '#dfe5e0',
    brightnessDark: '#27332b',
    brightnessLight: '#ffffff',
    hueCool: '#dbeafe',
    hueWarm: '#fb923c',
    hueHot: '#ef4444',
  },
};

export const getAppTheme = (mode: ResolvedAppTheme): AppTheme =>
  mode === 'light' ? LIGHT_APP_THEME : DARK_APP_THEME;

export const resolveAppTheme = (
  preference: AppThemePreference,
  systemMode: ResolvedAppTheme | 'unspecified' | null | undefined
): ResolvedAppTheme => preference === 'system'
  ? (systemMode === 'light' || systemMode === 'dark' ? systemMode : 'dark')
  : preference;

const AppThemeContext = createContext<AppTheme>(DARK_APP_THEME);

export const AppThemeProvider = ({ theme, children }: { theme: AppTheme; children: React.ReactNode }) => (
  React.createElement(AppThemeContext.Provider, { value: theme }, children)
);

export const useAppTheme = () => useContext(AppThemeContext);

// Kept for older UI modules while they are moved to semantic theme tokens.
export const COLORS = DARK_APP_THEME.colors;

export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 };

export const TYPOGRAPHY = {
  sizes: { small: 12, body: 14, subtitle: 16, title: 20, display: 26 },
  weights: { regular: '400', medium: '500', semibold: '600', bold: '700' },
} as const;

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20 };
