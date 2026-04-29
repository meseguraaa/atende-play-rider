import type { ExpoConfig } from 'expo/config';
import fs from 'node:fs';
import path from 'node:path';

type BrandConfig = {
    slug?: string;
    appName?: string;
    scheme?: string;
    companyId?: string;
    theme?: Record<string, unknown>;
    ids?: {
        iosBundleId?: string;
        androidApplicationId?: string;
    };
    eas?: {
        projectId?: string;
    };
};

function loadBrand(config: ExpoConfig) {
    const slug =
        process.env.BRAND_SLUG?.trim() ||
        String((config.extra as any)?.brandSlug ?? '').trim() ||
        'atendeplay';

    const brandPath = path.join(__dirname, 'brands', slug, 'brand.json');

    if (!fs.existsSync(brandPath)) {
        throw new Error(`Brand não encontrado: ${brandPath}`);
    }

    const raw = fs.readFileSync(brandPath, 'utf-8');
    const brand = JSON.parse(raw) as BrandConfig;

    return { slug, brand };
}

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
    const { slug, brand } = loadBrand(config);

    const icon = `./brands/${slug}/assets/icon.png`;
    const adaptiveIcon = `./brands/${slug}/assets/adaptive-icon.png`;
    const splash = `./brands/${slug}/assets/splash-icon.png`;

    const brandProjectId = String(brand?.eas?.projectId ?? '').trim();

    return {
        ...config,

        name: brand.appName ?? config.name,
        slug: brand.slug ?? config.slug,
        scheme: brand.scheme ?? config.scheme,

        runtimeVersion: {
            policy: 'appVersion',
        },

        ...(brandProjectId
            ? {
                  updates: {
                      url: `https://u.expo.dev/${brandProjectId}`,
                  },
              }
            : {}),

        icon,

        splash: {
            image: splash,
            resizeMode: 'contain',
            backgroundColor: (brand?.theme as any)?.background ?? '#FFFFFF',
        },

        ios: {
            ...(config.ios ?? {}),
            bundleIdentifier:
                brand?.ids?.iosBundleId ?? config?.ios?.bundleIdentifier,
        },

        android: {
            ...(config.android ?? {}),
            package:
                brand?.ids?.androidApplicationId ?? config?.android?.package,
            adaptiveIcon: {
                foregroundImage: adaptiveIcon,
                backgroundColor: (brand?.theme as any)?.background ?? '#FFFFFF',
            },
        },

        extra: {
            ...(config.extra ?? {}),
            brandSlug: slug,
            companyId: brand.companyId,
            appName: brand.appName,
            scheme: brand.scheme,
            theme: brand.theme,
            ...(brandProjectId
                ? {
                      eas: {
                          projectId: brandProjectId,
                      },
                  }
                : {}),
        },
    };
};
