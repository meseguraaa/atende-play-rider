import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'react-native';
import { router, useSegments } from 'expo-router';

import { BRAND } from '../config/brand';

import {
    api,
    AUTH_TOKEN_KEY,
    COMPANY_ID_STORAGE_KEY,
    setApiAuthToken,
    setApiCompanyId,
} from '../services/api';

const AUTH_STORAGE_KEY = 'auth_session';

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type CustomerLevel = {
    id?: string | null;
    label: string;
    icon?: string | null;
};

type AuthUser = {
    id: string;
    name: string | null;
    email: string;
    role: Role;
    image?: string | null;

    phone?: string | null;
    birthday?: string | null;

    profileComplete?: boolean | null;

    isOwner?: boolean;
    adminAccess?: any | null;
    customerLevel?: CustomerLevel | null;

    companyId?: string | null;
};

type StoredSession = {
    appToken: string;
    user?: AuthUser | null; // ✅ agora pode vir vazio; /me preenche depois
    companyId?: string | null; // ✅ compat: pode vir no payload
};

type AuthContextValue = {
    appToken: string | null;
    user: AuthUser | null;
    sessionJson: string | null;

    companyId: string | null;

    isBooting: boolean;
    meLoading: boolean;
    avatarReady: boolean;

    refreshMe: () => Promise<void>;
    signIn: (sessionJson: string) => Promise<void>;
    signOut: () => Promise<void>;

    setCompanyId: (companyId: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function pickToken(obj: any): string | null {
    const candidates = [
        obj?.appToken,
        obj?.token,
        obj?.accessToken,
        obj?.app_token,

        obj?.session?.appToken,
        obj?.session?.token,
        obj?.session?.accessToken,

        obj?.data?.appToken,
        obj?.data?.token,
        obj?.data?.accessToken,
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
}

function pickCompanyId(obj: any): string | null {
    const candidates = [
        obj?.companyId,
        obj?.company_id,
        obj?.tenantId,
        obj?.tenant_id,

        obj?.user?.companyId,
        obj?.user?.company_id,
        obj?.user?.tenantId,
        obj?.user?.tenant_id,

        obj?.session?.companyId,
        obj?.session?.company_id,

        obj?.data?.companyId,
        obj?.data?.company_id,

        obj?.company?.id,
        obj?.tenant?.id,
        obj?.user?.company?.id,
        obj?.user?.tenant?.id,
    ];

    for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
}

/**
 * ✅ Agora suporta dois formatos:
 * A) Completo (antigo): { appToken, user }
 * B) Token-only (novo mobile google): { token, companyId } (user vem do /me)
 */
function parseSession(sessionJson: string): StoredSession | null {
    try {
        const parsed = JSON.parse(sessionJson);
        if (!parsed || typeof parsed !== 'object') return null;

        const appToken = pickToken(parsed);
        if (!appToken) return null;

        const companyId = pickCompanyId(parsed);

        const user =
            parsed?.user && typeof parsed.user === 'object'
                ? parsed.user
                : parsed?.session?.user &&
                    typeof parsed.session.user === 'object'
                  ? parsed.session.user
                  : parsed?.data?.user && typeof parsed.data.user === 'object'
                    ? parsed.data.user
                    : null;

        // ✅ se tiver user, valida mínimos; se não tiver, ok também (token-only)
        if (user) {
            const ok =
                typeof (user as any).id === 'string' &&
                typeof (user as any).email === 'string' &&
                typeof (user as any).role === 'string';

            if (!ok) {
                // token-only ou user inválido => deixa null e /me resolve
                return { appToken, user: null, companyId: companyId ?? null };
            }

            return {
                appToken,
                user: user as AuthUser,
                companyId: companyId ?? null,
            };
        }

        return { appToken, user: null, companyId: companyId ?? null };
    } catch {
        return null;
    }
}

function isAuthInvalidError(e: any) {
    const msg = String(e?.message || '').toLowerCase();
    const status = Number(e?.status || e?.response?.status || 0);

    return (
        status === 401 ||
        msg.includes('missing_token') ||
        msg.includes('invalid_token') ||
        msg.includes('user_not_found') ||
        msg.includes('não autorizado') ||
        msg.includes('token ausente') ||
        msg.includes('http 401')
    );
}

function normalizeAvatarUrl(url?: string | null) {
    const u = (url || '').trim();
    return u.length ? u : null;
}

async function prefetchWithTimeout(url: string, timeoutMs: number) {
    let timeoutId: any = null;

    const prefetchPromise = Image.prefetch(url)
        .then(() => 'prefetch_ok')
        .catch(() => 'prefetch_error');

    const timeoutPromise = new Promise<string>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
    });

    const result = await Promise.race([prefetchPromise, timeoutPromise]);

    if (timeoutId) clearTimeout(timeoutId);

    return result;
}

function normalizeCustomerLevel(u: any): CustomerLevel | null {
    const fromObj =
        u?.customerLevel && typeof u.customerLevel === 'object'
            ? u.customerLevel
            : u?.level && typeof u.level === 'object'
              ? u.level
              : null;

    const labelFromObj =
        fromObj?.label != null ? String(fromObj.label).trim() : '';

    const labelFromFlat =
        u?.levelLabel != null ? String(u.levelLabel).trim() : '';

    const label = labelFromObj || labelFromFlat;
    if (!label) return null;

    const iconFromObj =
        fromObj?.icon != null ? String(fromObj.icon).trim() : '';
    const iconFromFlat = u?.levelIcon != null ? String(u.levelIcon).trim() : '';

    const id =
        fromObj?.id != null && String(fromObj.id).trim()
            ? String(fromObj.id).trim()
            : u?.levelId != null && String(u.levelId).trim()
              ? String(u.levelId).trim()
              : null;

    const icon = (iconFromObj || iconFromFlat || '').trim();

    return { id, label, icon: icon || null };
}

function computeProfileComplete(u: AuthUser | null): boolean {
    if (!u) return true;

    if (typeof u.profileComplete === 'boolean') return u.profileComplete;

    const phoneOk = typeof u.phone === 'string' && u.phone.trim().length > 0;
    const bdayOk =
        typeof u.birthday === 'string' && u.birthday.trim().length > 0;

    return phoneOk && bdayOk;
}

/**
 * Compat layer: se alguém plugar axios no futuro.
 * No fetch-wrapper atual, o header já é injetado via setApiCompanyId.
 */
function tryApplyCompanyIdToApi(_companyId: string | null) {
    try {
        const anyApi = api as any;
        if (anyApi?.defaults?.headers?.common) {
            if (_companyId) {
                anyApi.defaults.headers.common['x-company-id'] = _companyId;
            } else {
                delete anyApi.defaults.headers.common['x-company-id'];
            }
        }
    } catch {
        // noop
    }
}

async function readStoredCompanyId(): Promise<string | null> {
    try {
        const raw = await SecureStore.getItemAsync(COMPANY_ID_STORAGE_KEY);
        const v = typeof raw === 'string' ? raw.trim() : '';
        return v.length ? v : null;
    } catch {
        return null;
    }
}

// ✅ Tenant fixo do app (vem do brand)
function readEnvCompanyId(): string | null {
    const raw = String(BRAND.companyId || '').trim();
    return raw.length ? raw : null;
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const segments = useSegments();

    const [appToken, setAppToken] = useState<string | null>(null);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [sessionJson, setSessionJson] = useState<string | null>(null);

    const [companyId, setCompanyIdState] = useState<string | null>(null);

    const [isBooting, setIsBooting] = useState(true);
    const [meLoading, setMeLoading] = useState(false);

    const [avatarReady, setAvatarReady] = useState(false);

    // ✅ refs pra matar “closure velha” em fluxos async
    const appTokenRef = useRef<string | null>(null);
    const companyIdRef = useRef<string | null>(null);
    useEffect(() => {
        appTokenRef.current = appToken ?? null;
    }, [appToken]);
    useEffect(() => {
        companyIdRef.current = companyId ?? null;
    }, [companyId]);

    const fetchedMeForTokenRef = useRef<string | null>(null);
    const lastAvatarUrlRef = useRef<string | null>(null);
    const avatarPrefetchInFlightRef = useRef<Promise<void> | null>(null);
    const avatarRunIdRef = useRef(0);

    // ✅ dedupe de writes no securestore
    const lastCompanyIdPersistedRef = useRef<string | null>(null);

    // ✅ usado para evitar “deslogar” por race logo após o login
    const lastSignInAtRef = useRef<number>(0);

    const ensureAvatarReady = async (
        maybeUrl?: string | null
    ): Promise<void> => {
        const runId = avatarRunIdRef.current;

        const url = normalizeAvatarUrl(maybeUrl);
        if (!url) {
            lastAvatarUrlRef.current = null;
            if (avatarRunIdRef.current === runId) setAvatarReady(true);
            return;
        }

        if (lastAvatarUrlRef.current === url && avatarReady) return;

        if (
            lastAvatarUrlRef.current === url &&
            avatarPrefetchInFlightRef.current
        ) {
            await avatarPrefetchInFlightRef.current;
            return;
        }

        lastAvatarUrlRef.current = url;
        if (avatarRunIdRef.current === runId) setAvatarReady(false);

        const job = (async () => {
            await prefetchWithTimeout(url, 3000);
            if (avatarRunIdRef.current === runId) setAvatarReady(true);
        })();

        avatarPrefetchInFlightRef.current = job;

        try {
            await job;
        } finally {
            if (avatarPrefetchInFlightRef.current === job) {
                avatarPrefetchInFlightRef.current = null;
            }
        }
    };

    // ✅ setter persistente do companyId (e injeta na API em memória)
    const setCompanyId = async (
        nextCompanyId: string | null
    ): Promise<void> => {
        const fixed = readEnvCompanyId(); // BRAND.companyId (fixo)
        const cleanedIncoming =
            typeof nextCompanyId === 'string' && nextCompanyId.trim()
                ? nextCompanyId.trim()
                : null;

        // ✅ se existe tenant fixo, ele sempre vence
        const cleaned = fixed || cleanedIncoming;

        // ✅ injeta imediatamente em memória (mata o race)
        setApiCompanyId(cleaned);
        tryApplyCompanyIdToApi(cleaned);

        // ✅ atualiza state/ref imediatamente
        setCompanyIdState(cleaned);
        companyIdRef.current = cleaned;

        // ✅ dedupe
        if (lastCompanyIdPersistedRef.current === cleaned) return;

        if (!cleaned) {
            try {
                await SecureStore.deleteItemAsync(COMPANY_ID_STORAGE_KEY);
            } catch {}
            lastCompanyIdPersistedRef.current = null;
            return;
        }

        try {
            await SecureStore.setItemAsync(COMPANY_ID_STORAGE_KEY, cleaned);
            lastCompanyIdPersistedRef.current = cleaned;
        } catch {
            // se falhar, ainda mantém em memória
            lastCompanyIdPersistedRef.current = cleaned;
        }
    };

    const signOut = async () => {
        try {
            await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
        } catch {}
        try {
            await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
        } catch {}
        try {
            await SecureStore.deleteItemAsync(COMPANY_ID_STORAGE_KEY);
        } catch {}

        setAppToken(null);
        setUser(null);
        setSessionJson(null);
        fetchedMeForTokenRef.current = null;

        setCompanyIdState(null);
        lastCompanyIdPersistedRef.current = null;

        // ✅ limpa memória do api
        setApiAuthToken(null);
        setApiCompanyId(null);
        tryApplyCompanyIdToApi(null);

        appTokenRef.current = null;
        companyIdRef.current = null;

        setAvatarReady(false);
        lastAvatarUrlRef.current = null;
        avatarPrefetchInFlightRef.current = null;
        avatarRunIdRef.current += 1;
    };

    // ✅ normaliza leitura do retorno do api.get (às vezes vem em res.data)
    function extractUserFromApiResponse(res: any) {
        return res?.user ?? res?.data?.user ?? res?.data ?? res ?? null;
    }

    // ✅ fetch /me com retry 1x (pra evitar loop de login por race)
    const fetchMeWithRetry = async () => {
        const res = await api.get<{ user: any }>('/api/mobile/me');
        return extractUserFromApiResponse(res);
    };

    const refreshMe = async (): Promise<void> => {
        if (!appTokenRef.current) return;

        try {
            setMeLoading(true);

            let u: any;
            try {
                u = await fetchMeWithRetry();
            } catch (e: any) {
                // ✅ se foi logo após signIn, tenta mais 1 vez com delay curto
                const sinceSignInMs =
                    Date.now() - (lastSignInAtRef.current || 0);
                if (isAuthInvalidError(e) && sinceSignInMs < 6000) {
                    await sleep(600);
                    u = await fetchMeWithRetry();
                } else {
                    throw e;
                }
            }

            const normalizedLevel = normalizeCustomerLevel(u);

            // ✅ agora pode não existir prev (token-only), então criamos do /me
            setUser((prev) => {
                if (!prev) {
                    const next: AuthUser = {
                        id: String(u?.id ?? ''),
                        name: (u?.name ?? null) as any,
                        email: String(u?.email ?? ''),
                        role: (u?.role ?? 'CLIENT') as any,
                        image: (u?.image ?? null) as any,
                        phone: (u?.phone ?? null) as any,
                        birthday: (u?.birthday ?? null) as any,
                        profileComplete: (u?.profileComplete ?? null) as any,
                        isOwner: (u?.isOwner ?? false) as any,
                        adminAccess: (u?.adminAccess ?? null) as any,
                        customerLevel: normalizedLevel ?? null,
                        companyId: (u?.companyId ??
                            u?.company?.id ??
                            null) as any,
                    };
                    return next;
                }

                const next: AuthUser = {
                    ...prev,
                    id: (u?.id ?? prev.id) as any,
                    name: (u?.name ?? prev.name) as any,
                    email: (u?.email ?? prev.email) as any,
                    image: (u?.image ?? prev.image) as any,
                    phone: (u?.phone ?? prev.phone) as any,
                    birthday: (u?.birthday ?? prev.birthday) as any,
                    profileComplete: (u?.profileComplete ??
                        prev.profileComplete) as any,
                    role: (u?.role ?? prev.role) as any,
                    isOwner: (u?.isOwner ?? prev.isOwner) as any,
                    adminAccess: (u?.adminAccess ?? prev.adminAccess) as any,
                    customerLevel:
                        normalizedLevel ?? prev.customerLevel ?? null,
                    companyId: (u?.companyId ??
                        u?.company?.id ??
                        prev.companyId) as any,
                };

                return next;
            });

            // ✅ resolve tenant (como é fixo, setCompanyId força pro BRAND)
            const meCompanyId = pickCompanyId(u);
            await setCompanyId(meCompanyId);

            await ensureAvatarReady(u?.image ?? null);
        } catch (e: any) {
            if (isAuthInvalidError(e)) {
                try {
                    await signOut();
                } finally {
                    router.replace('/(auth)/login');
                }
            } else {
                setAvatarReady(true);
            }
        } finally {
            setMeLoading(false);
        }
    };

    // Boot: lê sessão + tenant
    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                const stored = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
                const storedCompanyId = await readStoredCompanyId();
                const envCompanyId = readEnvCompanyId(); // BRAND.companyId

                // ✅ tenant inicial (brand vence)
                const initialCompanyId =
                    envCompanyId || storedCompanyId || null;
                lastCompanyIdPersistedRef.current = initialCompanyId;

                // injeta companyId em memória mesmo sem sessão
                setApiAuthToken(null);
                setApiCompanyId(initialCompanyId);
                tryApplyCompanyIdToApi(initialCompanyId);

                // persiste env se existir
                if (envCompanyId) {
                    try {
                        await SecureStore.setItemAsync(
                            COMPANY_ID_STORAGE_KEY,
                            envCompanyId
                        );
                    } catch {}
                }

                if (!stored) {
                    if (!alive) return;

                    setAppToken(null);
                    setUser(null);
                    setSessionJson(null);
                    setAvatarReady(false);

                    setCompanyIdState(initialCompanyId);
                    companyIdRef.current = initialCompanyId;

                    return;
                }

                const s = parseSession(stored);
                if (!s) {
                    try {
                        await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
                    } catch {}
                    try {
                        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
                    } catch {}

                    if (!alive) return;

                    setAppToken(null);
                    setUser(null);
                    setSessionJson(null);
                    setAvatarReady(false);

                    setCompanyIdState(initialCompanyId);
                    companyIdRef.current = initialCompanyId;

                    setApiAuthToken(null);
                    setApiCompanyId(initialCompanyId);
                    tryApplyCompanyIdToApi(initialCompanyId);

                    return;
                }

                // ✅ HARD LOCK (BOOT): se sessão armazenada for de outra empresa, apaga
                const lockedCompanyId = envCompanyId; // brand
                const fromSessionObj = (() => {
                    try {
                        return pickCompanyId(JSON.parse(stored));
                    } catch {
                        return null;
                    }
                })();
                const fromUser = s.user ? pickCompanyId(s.user) : null;

                const sessionCompanyIdCandidate =
                    s.companyId || fromSessionObj || fromUser || null;

                if (
                    lockedCompanyId &&
                    sessionCompanyIdCandidate &&
                    sessionCompanyIdCandidate !== lockedCompanyId
                ) {
                    try {
                        await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
                    } catch {}
                    try {
                        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
                    } catch {}

                    if (!alive) return;

                    setAppToken(null);
                    setUser(null);
                    setSessionJson(null);
                    setAvatarReady(false);

                    setCompanyIdState(lockedCompanyId);
                    companyIdRef.current = lockedCompanyId;

                    setApiAuthToken(null);
                    setApiCompanyId(lockedCompanyId);
                    tryApplyCompanyIdToApi(lockedCompanyId);

                    return;
                }

                await SecureStore.setItemAsync(AUTH_TOKEN_KEY, s.appToken);

                if (!alive) return;

                setAppToken(s.appToken);
                appTokenRef.current = s.appToken;

                setUser(s.user ?? null);
                setSessionJson(stored);

                // ✅ companyId resolvido: brand vence sempre
                const resolvedCompanyId =
                    envCompanyId ||
                    sessionCompanyIdCandidate ||
                    initialCompanyId ||
                    null;

                setCompanyIdState(resolvedCompanyId);
                companyIdRef.current = resolvedCompanyId;

                setApiAuthToken(s.appToken);
                setApiCompanyId(resolvedCompanyId);
                tryApplyCompanyIdToApi(resolvedCompanyId);

                if (envCompanyId) {
                    try {
                        await SecureStore.setItemAsync(
                            COMPANY_ID_STORAGE_KEY,
                            envCompanyId
                        );
                    } catch {}
                    lastCompanyIdPersistedRef.current = envCompanyId;
                }

                await ensureAvatarReady((s.user as any)?.image ?? null);
            } catch {
                if (!alive) return;

                setAppToken(null);
                setUser(null);
                setSessionJson(null);
                setAvatarReady(false);

                const storedCompanyId = await readStoredCompanyId();
                const envCompanyId = readEnvCompanyId();

                const fallbackCompanyId =
                    envCompanyId || storedCompanyId || null;
                lastCompanyIdPersistedRef.current = fallbackCompanyId;

                setCompanyIdState(fallbackCompanyId);
                companyIdRef.current = fallbackCompanyId;

                setApiAuthToken(null);
                setApiCompanyId(fallbackCompanyId);
                tryApplyCompanyIdToApi(fallbackCompanyId);
            } finally {
                if (alive) setIsBooting(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    // Guard de rotas (auth + profile gate)
    useEffect(() => {
        if (isBooting) return;

        const group = segments[0];
        const inAuth = group === '(auth)';
        const inApp = group === '(app)';

        const inProfile = segments.join('/').includes('(tabs)/profile');

        if (!appToken && inApp) {
            router.replace('/(auth)/login');
            return;
        }

        if (appToken && inAuth) {
            router.replace('/(app)/(tabs)/home');
            return;
        }

        // ✅ só aplica gate de perfil quando tiver user carregado (token-only precisa do /me)
        if (appToken && inApp && user) {
            const ok = computeProfileComplete(user);
            if (!ok && !inProfile) {
                router.replace('/(app)/(tabs)/profile');
                return;
            }
        }
    }, [appToken, isBooting, segments, user]);

    // Boot-refresh do /me quando token mudar
    useEffect(() => {
        if (isBooting) return;
        if (!appToken) return;

        if (fetchedMeForTokenRef.current === appToken) return;
        fetchedMeForTokenRef.current = appToken;

        let alive = true;

        (async () => {
            try {
                setMeLoading(true);

                let u: any;
                try {
                    u = await fetchMeWithRetry();
                } catch (e: any) {
                    const sinceSignInMs =
                        Date.now() - (lastSignInAtRef.current || 0);
                    if (isAuthInvalidError(e) && sinceSignInMs < 6000) {
                        await sleep(600);
                        u = await fetchMeWithRetry();
                    } else {
                        throw e;
                    }
                }

                if (!alive) return;

                const normalizedLevel = normalizeCustomerLevel(u);

                setUser((prev) => {
                    if (!prev) {
                        const next: AuthUser = {
                            id: String(u?.id ?? ''),
                            name: (u?.name ?? null) as any,
                            email: String(u?.email ?? ''),
                            role: (u?.role ?? 'CLIENT') as any,
                            image: (u?.image ?? null) as any,
                            phone: (u?.phone ?? null) as any,
                            birthday: (u?.birthday ?? null) as any,
                            profileComplete: (u?.profileComplete ??
                                null) as any,
                            isOwner: (u?.isOwner ?? false) as any,
                            adminAccess: (u?.adminAccess ?? null) as any,
                            customerLevel: normalizedLevel ?? null,
                            companyId: (u?.companyId ??
                                u?.company?.id ??
                                null) as any,
                        };
                        return next;
                    }

                    const next: AuthUser = {
                        ...prev,
                        id: (u?.id ?? prev.id) as any,
                        name: (u?.name ?? prev.name) as any,
                        email: (u?.email ?? prev.email) as any,
                        image: (u?.image ?? prev.image) as any,
                        phone: (u?.phone ?? prev.phone) as any,
                        birthday: (u?.birthday ?? prev.birthday) as any,
                        profileComplete: (u?.profileComplete ??
                            prev.profileComplete) as any,
                        role: (u?.role ?? prev.role) as any,
                        isOwner: (u?.isOwner ?? prev.isOwner) as any,
                        adminAccess: (u?.adminAccess ??
                            prev.adminAccess) as any,
                        customerLevel:
                            normalizedLevel ?? prev.customerLevel ?? null,
                        companyId: (u?.companyId ??
                            u?.company?.id ??
                            prev.companyId) as any,
                    };

                    return next;
                });

                // brand vence sempre
                const meCompanyId = pickCompanyId(u);
                await setCompanyId(meCompanyId);

                await ensureAvatarReady(u?.image ?? null);
            } catch (e: any) {
                if (isAuthInvalidError(e)) {
                    try {
                        await signOut();
                    } finally {
                        router.replace('/(auth)/login');
                    }
                } else {
                    if (alive) setAvatarReady(true);
                }
            } finally {
                if (alive) setMeLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [appToken, isBooting]);

    // Se o user.image mudar, tenta prefetch
    useEffect(() => {
        if (isBooting) return;
        if (!appToken) return;

        const url = normalizeAvatarUrl(user?.image ?? null);

        if (!url) {
            setAvatarReady(true);
            return;
        }

        if (lastAvatarUrlRef.current !== url) {
            ensureAvatarReady(url).catch(() => setAvatarReady(true));
        }
    }, [user?.image, appToken, isBooting]);

    const value = useMemo<AuthContextValue>(
        () => ({
            appToken,
            user,
            sessionJson,

            companyId,

            isBooting,
            meLoading,
            avatarReady,

            refreshMe,
            setCompanyId,

            signIn: async (newSessionJson: string) => {
                const s = parseSession(newSessionJson);

                if (!s) {
                    try {
                        await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
                    } catch {}
                    try {
                        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
                    } catch {}
                    try {
                        await SecureStore.deleteItemAsync(
                            COMPANY_ID_STORAGE_KEY
                        );
                    } catch {}

                    setAppToken(null);
                    setUser(null);
                    setSessionJson(null);
                    fetchedMeForTokenRef.current = null;

                    setCompanyIdState(null);
                    lastCompanyIdPersistedRef.current = null;

                    setApiAuthToken(null);
                    setApiCompanyId(null);
                    tryApplyCompanyIdToApi(null);

                    appTokenRef.current = null;
                    companyIdRef.current = null;

                    setAvatarReady(false);
                    lastAvatarUrlRef.current = null;
                    avatarPrefetchInFlightRef.current = null;
                    avatarRunIdRef.current += 1;
                    return;
                }

                // ✅ marca momento do login para tolerar 1 falha transitória do /me
                lastSignInAtRef.current = Date.now();

                await SecureStore.setItemAsync(
                    AUTH_STORAGE_KEY,
                    newSessionJson
                );
                await SecureStore.setItemAsync(AUTH_TOKEN_KEY, s.appToken);

                setAppToken(s.appToken);
                appTokenRef.current = s.appToken;

                setUser(s.user ?? null);
                setSessionJson(newSessionJson);

                fetchedMeForTokenRef.current = null;

                // ✅ injeta token na memória do api imediatamente
                setApiAuthToken(s.appToken);

                const fromLoginObj = (() => {
                    try {
                        return pickCompanyId(JSON.parse(newSessionJson));
                    } catch {
                        return null;
                    }
                })();

                const fromUser = s.user ? pickCompanyId(s.user) : null;

                const lockedCompanyId = readEnvCompanyId(); // brand fixo
                const incomingCompanyId =
                    s.companyId || fromLoginObj || fromUser || null;

                // ✅ HARD LOCK no login: se vier diferente do brand, não aceita
                if (
                    lockedCompanyId &&
                    incomingCompanyId &&
                    incomingCompanyId !== lockedCompanyId
                ) {
                    await signOut();
                    router.replace('/(auth)/login');
                    return;
                }

                // ✅ resolve companyId (brand vence)
                await setCompanyId(incomingCompanyId);

                avatarRunIdRef.current += 1;
                await ensureAvatarReady((s.user as any)?.image ?? null);
            },

            signOut,
        }),
        [
            appToken,
            user,
            sessionJson,
            companyId,
            isBooting,
            meLoading,
            avatarReady,
            refreshMe,
            setCompanyId,
        ]
    );

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider />');
    return ctx;
}
