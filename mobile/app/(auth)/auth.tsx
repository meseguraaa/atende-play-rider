// app/(auth)/auth.tsx
import { BRAND } from '../../src/config/brand';
import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '../../src/auth/auth-context';
import { UI, styles } from '../../src/theme/client-theme';

const COMPANY_ID = BRAND.companyId;

function safeDecodeURIComponentOnce(v: string) {
    try {
        return decodeURIComponent(v);
    } catch {
        return v;
    }
}

function safeDecodeURIComponentTwice(v: string) {
    const once = safeDecodeURIComponentOnce(v);
    const twice = safeDecodeURIComponentOnce(once);
    return twice;
}

function parsePayloadParam(value: string): any | null {
    try {
        // backend manda encodeURIComponent(JSON.stringify(payload))
        // dependendo de como chega aqui, pode estar 0x, 1x ou 2x encoded
        const decoded = safeDecodeURIComponentTwice(String(value || ''));
        return JSON.parse(decoded);
    } catch {
        return null;
    }
}

function ensureCompanyIdInSession(session: any, companyId: string) {
    if (!session || typeof session !== 'object') return session;

    const cid = String(companyId || '').trim();
    if (!cid) return session;

    const already =
        String(session?.companyId ?? '').trim() ||
        String(session?.company_id ?? '').trim() ||
        String(session?.tenantId ?? '').trim() ||
        String(session?.tenant_id ?? '').trim() ||
        String(session?.user?.companyId ?? '').trim() ||
        String(session?.user?.company?.id ?? '').trim() ||
        String(session?.session?.companyId ?? '').trim() ||
        String(session?.data?.companyId ?? '').trim();

    if (already) return session;

    const next = { ...session };
    next.companyId = cid;

    if (next.user && typeof next.user === 'object') {
        next.user = { ...next.user, companyId: cid };
    }

    if (next.session && typeof next.session === 'object') {
        next.session = { ...next.session, companyId: cid };
        if (next.session.user && typeof next.session.user === 'object') {
            next.session.user = { ...next.session.user, companyId: cid };
        }
    }

    if (next.data && typeof next.data === 'object') {
        next.data = { ...next.data, companyId: cid };
        if (next.data.user && typeof next.data.user === 'object') {
            next.data.user = { ...next.data.user, companyId: cid };
        }
    }

    return next;
}

export default function AuthCallbackScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        token?: string;
        session?: string;
        error?: string;
        message?: string;
    }>();

    const { signIn, refreshMe } = useAuth();

    const ran = useRef(false);
    const [status, setStatus] = useState<'loading' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState<string>('');

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        (async () => {
            try {
                const error =
                    typeof params.error === 'string' ? params.error : '';
                const message =
                    typeof params.message === 'string' ? params.message : '';

                if (error) {
                    const msg =
                        message || `Não foi possível autenticar (${error}).`;
                    setStatus('error');
                    setErrorMsg(msg);
                    Alert.alert('Login', msg, [
                        {
                            text: 'OK',
                            onPress: () => router.replace('/(auth)/login'),
                        },
                    ]);
                    return;
                }

                const tokenParam =
                    typeof params.token === 'string' ? params.token : '';
                const sessionParam =
                    typeof params.session === 'string' ? params.session : '';

                const raw = tokenParam || sessionParam;
                if (!raw) {
                    const msg =
                        'Não recebemos token do login. Tente novamente.';
                    setStatus('error');
                    setErrorMsg(msg);
                    Alert.alert('Login', msg, [
                        {
                            text: 'OK',
                            onPress: () => router.replace('/(auth)/login'),
                        },
                    ]);
                    return;
                }

                const parsed = parsePayloadParam(raw);
                if (!parsed) {
                    const msg =
                        'Token inválido retornado pelo login. Tente novamente.';
                    setStatus('error');
                    setErrorMsg(msg);
                    Alert.alert('Login', msg, [
                        {
                            text: 'OK',
                            onPress: () => router.replace('/(auth)/login'),
                        },
                    ]);
                    return;
                }

                const payload = ensureCompanyIdInSession(parsed, COMPANY_ID);

                await signIn(JSON.stringify(payload));

                try {
                    await refreshMe();
                } catch {
                    // ok
                }

                // ✅ ajuste aqui o destino final do app após login
                router.replace('/');
            } catch {
                const msg = 'Erro inesperado ao concluir login.';
                setStatus('error');
                setErrorMsg(msg);
                Alert.alert('Login', msg, [
                    {
                        text: 'OK',
                        onPress: () => router.replace('/(auth)/login'),
                    },
                ]);
            }
        })();
    }, [params, router, signIn, refreshMe]);

    return (
        <View
            style={[
                styles.screen,
                { alignItems: 'center', justifyContent: 'center', padding: 24 },
            ]}
        >
            {status === 'loading' ? (
                <>
                    <ActivityIndicator size="large" color={UI.brand.primary} />
                    <Text
                        style={[
                            styles.subtitle,
                            { marginTop: 12, textAlign: 'center' },
                        ]}
                    >
                        Concluindo login…
                    </Text>
                </>
            ) : (
                <Text style={[styles.subtitle, { textAlign: 'center' }]}>
                    {errorMsg || 'Falha ao autenticar.'}
                </Text>
            )}
        </View>
    );
}
