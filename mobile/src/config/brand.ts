import Constants from 'expo-constants';

export type BrandTheme = {
    primary: string;
    primaryText: string;
    secondary: string;

    btnLogin: string;

    background: string;
    card: string;
    cardBorder: string;
    btnAction: string;
    heroCardBg: string;
    heroCardBorder: string;
    historyIconBg: string;
    historyIconColor: string;
    categoryChipText: string;
    categoryChipTextActive: string;

    text: string;
    textMuted: string;
    textDim: string;

    danger: string;
    success: string;

    divider: string;

    white: string;
    black: string;

    overlay08: string;
    overlay10: string;
    overlay12: string;
    overlay18: string;

    black28: string;
    black05: string;
    black08: string;
    black10: string;
    black45: string;

    overlayDim: string;

    authInputBorder: string;
    authInputBg: string;
    authInputText: string;
    authLink: string;

    homeBirthdayDotBg: string;
};

export type BrandConfig = {
    slug: string;
    appName: string;
    companyId: string;
    scheme: string;
    theme: BrandTheme;
    ids: {
        iosBundleId: string;
        androidApplicationId: string;
    };
};

function readExtra(): any {
    // Expo SDK moderno: expoConfig
    // Expo mais antigo / alguns fluxos: manifest
    return (
        (Constants.expoConfig?.extra as any) ??
        ((Constants as any).manifest?.extra as any) ??
        {}
    );
}

const extra = readExtra();

// ✅ O app.config.ts já injeta tudo aqui:
export const BRAND: BrandConfig = {
    slug: String(extra?.brandSlug ?? 'atendeplay'),
    appName: String(extra?.appName ?? extra?.name ?? 'App'),
    companyId: String(extra?.companyId ?? ''),
    scheme: String(extra?.scheme ?? 'atendeplay'),
    theme: (extra?.theme ?? {}) as BrandTheme,
    ids: (extra?.ids ?? {
        iosBundleId: '',
        androidApplicationId: '',
    }) as any,
} as BrandConfig;
