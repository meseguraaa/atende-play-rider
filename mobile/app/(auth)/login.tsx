// app/(auth)/login.tsx
import { BRAND } from '../../src/config/brand';
import { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    Pressable,
    ActivityIndicator,
    Platform,
    Alert,
    ImageBackground,
    TextInput,
    KeyboardAvoidingView,
    ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome5, AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { UI, styles } from '../../src/theme/client-theme';
import { useAuth } from '../../src/auth/auth-context';
import { BRAND_HOME_IMAGE } from '../../src/config/brand-assets';

WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    (__DEV__ ? 'http://localhost:3000' : '');

const COMPANY_ID = BRAND.companyId;

// ✅ Deep link scheme do app (precisa existir no app config: scheme)
const APP_SCHEME = String(BRAND.scheme || 'atendeplay').trim();

// ✅ redirectUri NATIVO (deep link) para o backend redirecionar de volta pro app
const redirectUri = (() => {
    const native = `${APP_SCHEME}://auth-callback`;

    // ✅ Em DEV (Expo Go), força deep link do app pra não gerar exp://
    if (__DEV__) return native;

    try {
        return AuthSession.makeRedirectUri({ path: 'auth-callback', native });
    } catch {
        return native;
    }
})();

function safeParseUrl(raw: string): URL | null {
    try {
        return new URL(raw);
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
        String(session?.user?.companyId ?? '').trim();

    if (already) return session;

    return {
        ...session,
        companyId: cid,
        user: session.user ? { ...session.user, companyId: cid } : session.user,
    };
}

function normalizeEmail(v: string) {
    return String(v ?? '')
        .trim()
        .toLowerCase();
}

function mapLoginError(codeOrMsg: string) {
    const c = String(codeOrMsg || '').trim();

    if (!c) return 'Não foi possível entrar. Verifique seus dados.';

    // códigos do backend
    if (c === 'missing_company_id') return 'Empresa não informada.';
    if (c === 'missing_email') return 'Informe seu email.';
    if (c === 'missing_password') return 'Informe sua senha.';
    if (c === 'invalid_credentials') return 'Email ou senha inválidos.';
    if (c === 'user_inactive') return 'Usuário inativo.';
    if (c === 'company_not_allowed')
        return 'Você não tem acesso a esta empresa.';
    if (c === 'company_not_found') return 'Empresa não encontrada.';
    if (c === 'company_inactive') return 'Empresa inativa.';
    if (c === 'password_login_not_enabled')
        return 'Este usuário não tem senha cadastrada. Entre com Google ou redefina sua senha.';

    // mensagens genéricas
    return c;
}

function parseBoolish(v: string | null): boolean {
    const s = String(v ?? '').trim();
    if (!s) return false;
    return s === '1' || s.toLowerCase() === 'true' || s.toLowerCase() === 'yes';
}

export default function Login() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { signIn, refreshMe } = useAuth();

    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);

    const [appleAvailable, setAppleAvailable] = useState(false);

    // ✅ NEW: não “congela” o valor na primeira render
    const apiOk = useMemo(() => Boolean(API_BASE_URL), [API_BASE_URL]);
    const companyOk = useMemo(() => Boolean(COMPANY_ID), [COMPANY_ID]);

    const emailOk = useMemo(() => normalizeEmail(email).length > 3, [email]);
    const passOk = useMemo(
        () => String(password ?? '').length >= 1,
        [password]
    );

    useEffect(() => {
        let alive = true;

        (async () => {
            if (Platform.OS !== 'ios') {
                if (alive) setAppleAvailable(false);
                return;
            }
            try {
                const ok = await AppleAuthentication.isAvailableAsync();
                if (alive) setAppleAvailable(Boolean(ok));
            } catch {
                if (alive) setAppleAvailable(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    async function handleAppleLogin() {
        if (loading) return;

        try {
            if (!apiOk) return;

            if (!COMPANY_ID) {
                Alert.alert('Login', 'Empresa não configurada no app.');
                return;
            }

            if (Platform.OS !== 'ios') {
                Alert.alert(
                    'Login',
                    'Entrar com Apple está disponível apenas no iOS.'
                );
                return;
            }

            if (!appleAvailable) {
                Alert.alert(
                    'Login',
                    'Entrar com Apple não está disponível neste dispositivo.'
                );
                return;
            }

            setLoading(true);

            // ✅ Apple: pede nome + email (com opção “ocultar meu email”)
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            const identityToken = String(
                credential?.identityToken || ''
            ).trim();
            if (!identityToken) {
                Alert.alert(
                    'Login',
                    'Não recebemos o token do Apple. Tente novamente.'
                );
                return;
            }

            const endpoint = `${API_BASE_URL}/api/mobile/auth/apple`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            let res: Response;
            try {
                res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-company-id': COMPANY_ID,
                    },
                    body: JSON.stringify({
                        companyId: COMPANY_ID,
                        identityToken,
                        fullName: credential?.fullName
                            ? {
                                  givenName:
                                      credential.fullName.givenName ?? null,
                                  familyName:
                                      credential.fullName.familyName ?? null,
                              }
                            : null,
                        email: credential?.email ?? null,
                    }),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeout);
            }

            let json: any = null;
            try {
                json = await res.json();
            } catch {
                json = null;
            }

            const ok = Boolean(res.ok) && Boolean(json?.ok !== false);
            if (!ok) {
                const raw =
                    String(json?.error ?? json?.message ?? '').trim() ||
                    (res.status ? `HTTP_${res.status}` : '');
                Alert.alert('Login', mapLoginError(raw));
                return;
            }

            const payloadRaw = json?.data ?? json;
            const payload = ensureCompanyIdInSession(payloadRaw, COMPANY_ID);

            await signIn(JSON.stringify(payload));
            await refreshMe();
        } catch (e: any) {
            if (e?.code === 'ERR_REQUEST_CANCELED') return;

            if (e?.name === 'AbortError') {
                Alert.alert(
                    'Login',
                    'A autenticação demorou mais do que o esperado. Tente novamente.'
                );
                return;
            }

            Alert.alert('Login', 'Erro inesperado ao autenticar com Apple.');
        } finally {
            setLoading(false);
        }
    }

    async function handleGoogleLogin() {
        if (loading) return;

        try {
            if (!apiOk) return;

            setLoading(true);

            const start = new URL(
                `${API_BASE_URL}/api/mobile/auth/google/start`
            );

            // ✅ manda companyId pro backend (tenant fixo do app)
            if (COMPANY_ID) start.searchParams.set('companyId', COMPANY_ID);

            // ✅ CRÍTICO: redirect_uri precisa ser deep link do app
            start.searchParams.set('redirect_uri', String(redirectUri));

            // ✅ DEBUG: descobrir qual redirect_uri o app está enviando (e a URL final)
            console.log('[GOOGLE] APP_SCHEME:', APP_SCHEME);
            console.log('[GOOGLE] COMPANY_ID:', COMPANY_ID);
            console.log('[GOOGLE] redirect_uri:', String(redirectUri));
            console.log('[GOOGLE] startUrl:', start.toString());

            const result = await WebBrowser.openAuthSessionAsync(
                start.toString(),
                String(redirectUri),
                { preferEphemeralSession: Platform.OS === 'ios' }
            );

            if (result.type !== 'success' || !result.url) return;

            const url = safeParseUrl(result.url);
            if (!url) return;

            // ✅ auth-redirect devolve token JWT e params extras
            const token = String(url.searchParams.get('token') || '').trim();

            // ✅ companyId resolve com prioridade do redirect; cai no env se faltar
            const resolvedCompanyId =
                String(url.searchParams.get('companyId') || '').trim() ||
                COMPANY_ID;

            const error = String(url.searchParams.get('error') || '').trim();
            const message = String(
                url.searchParams.get('message') || ''
            ).trim();

            if (error) {
                Alert.alert('Login', message || mapLoginError(error));
                return;
            }

            if (!token) {
                Alert.alert(
                    'Login',
                    'Não recebemos o token do login. Tente novamente.'
                );
                return;
            }

            const profile_complete = parseBoolish(
                url.searchParams.get('profile_complete')
            );

            // ✅ payload compatível com o que suas rotas mobile esperam
            const payload = ensureCompanyIdInSession(
                {
                    token,
                    companyId: resolvedCompanyId || null,
                    profile_complete,
                },
                resolvedCompanyId
            );

            await signIn(JSON.stringify(payload));
            await refreshMe();
            router.replace('/');
        } catch {
            Alert.alert('Login', 'Erro inesperado ao autenticar.');
        } finally {
            setLoading(false);
        }
    }

    async function handleEmailLogin() {
        if (loading) return;

        const e = normalizeEmail(email);
        const p = String(password ?? '');

        if (!apiOk) return;

        if (!COMPANY_ID) {
            Alert.alert('Login', 'Empresa não configurada no app.');
            return;
        }

        if (!e) {
            Alert.alert('Login', 'Informe seu email.');
            return;
        }
        if (!p) {
            Alert.alert('Login', 'Informe sua senha.');
            return;
        }

        try {
            setLoading(true);

            const endpoint = `${API_BASE_URL}/api/mobile/auth/login`;
            console.log('[EMAIL LOGIN] endpoint:', endpoint);
            console.log('[EMAIL LOGIN] x-company-id:', COMPANY_ID);

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-company-id': COMPANY_ID,
                },
                body: JSON.stringify({
                    email: e,
                    password: p,
                    companyId: COMPANY_ID,
                }),
            });

            let json: any = null;
            try {
                json = await res.json();
            } catch {
                json = null;
            }

            const ok = Boolean(res.ok) && Boolean(json?.ok !== false);
            if (!ok) {
                const raw =
                    String(json?.error ?? json?.message ?? '').trim() ||
                    (res.status ? `HTTP_${res.status}` : '');
                Alert.alert('Login', mapLoginError(raw));
                return;
            }

            const payloadRaw = json?.data ?? json;
            const payload = ensureCompanyIdInSession(payloadRaw, COMPANY_ID);

            await signIn(JSON.stringify(payload));
            await refreshMe();
        } catch {
            Alert.alert('Login', 'Erro inesperado ao entrar.');
        } finally {
            setLoading(false);
        }
    }

    function handleForgotPassword() {
        router.push('/(auth)/forgot-password');
    }

    function handleGoSignup() {
        router.push('/(auth)/signup');
    }

    const keyboardOffset =
        UI.spacing.headerH + insets.top + (Platform.OS === 'ios' ? 8 : 0);

    const canSignup = apiOk && !loading;
    const canLogin = apiOk && companyOk && emailOk && passOk && !loading;

    return (
        <View style={styles.screen}>
            <StatusBar style="light" backgroundColor={UI.brand.primary} />

            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: insets.top + 2,
                    backgroundColor: UI.brand.primary,
                }}
            />

            <View
                style={[
                    styles.header,
                    {
                        height: UI.spacing.headerH + insets.top,
                        paddingTop: insets.top,
                    },
                ]}
            >
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle}>{UI.brand.name}</Text>
                </View>
            </View>

            <ImageBackground
                source={BRAND_HOME_IMAGE}
                resizeMode="cover"
                style={{ flex: 1 }}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={keyboardOffset}
                    >
                        <ScrollView
                            contentContainerStyle={{
                                flexGrow: 1,
                                justifyContent: 'flex-end',
                                paddingTop: 24,
                                paddingBottom:
                                    24 + (insets.bottom ? insets.bottom : 0),
                            }}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode={
                                Platform.OS === 'ios' ? 'interactive' : 'none'
                            }
                            showsVerticalScrollIndicator={false}
                            contentInsetAdjustmentBehavior={
                                Platform.OS === 'ios' ? 'never' : undefined
                            }
                        >
                            <View
                                style={[
                                    styles.body,
                                    {
                                        paddingBottom: 0,
                                    },
                                ]}
                            >
                                <View style={[styles.card, UI.shadow.card]}>
                                    <Text
                                        style={[
                                            styles.title,
                                            { textAlign: 'center' },
                                        ]}
                                    >
                                        Acesse sua conta
                                    </Text>

                                    <View style={{ gap: 10, marginTop: 12 }}>
                                        <TextInput
                                            placeholder="Email"
                                            placeholderTextColor="rgba(255,255,255,0.6)"
                                            value={email}
                                            onChangeText={setEmail}
                                            style={local.input}
                                            editable={!loading}
                                            autoCapitalize="none"
                                            keyboardType="email-address"
                                            returnKeyType="next"
                                        />

                                        <View style={{ position: 'relative' }}>
                                            <TextInput
                                                placeholder="Senha"
                                                placeholderTextColor="rgba(255,255,255,0.6)"
                                                value={password}
                                                onChangeText={setPassword}
                                                secureTextEntry={!showPass}
                                                style={local.input}
                                                editable={!loading}
                                                returnKeyType="done"
                                                onSubmitEditing={() => {
                                                    if (canLogin) {
                                                        handleEmailLogin();
                                                    }
                                                }}
                                            />

                                            <Pressable
                                                onPress={() =>
                                                    setShowPass((v) => !v)
                                                }
                                                style={local.eyeBtn}
                                                hitSlop={10}
                                                disabled={loading}
                                            >
                                                <FontAwesome5
                                                    name={
                                                        showPass
                                                            ? 'eye-slash'
                                                            : 'eye'
                                                    }
                                                    size={14}
                                                    color="#fff"
                                                />
                                            </Pressable>
                                        </View>

                                        <Pressable
                                            onPress={handleEmailLogin}
                                            style={({ pressed }) => [
                                                local.loginBtn,
                                                !canLogin && { opacity: 0.55 },
                                                pressed &&
                                                    canLogin && {
                                                        opacity: 0.85,
                                                    },
                                            ]}
                                            disabled={!canLogin}
                                        >
                                            {loading ? (
                                                <ActivityIndicator
                                                    color={
                                                        UI.brand.primaryText ??
                                                        UI.colors.white
                                                    }
                                                />
                                            ) : (
                                                <Text
                                                    style={local.loginBtnText}
                                                >
                                                    Entrar
                                                </Text>
                                            )}
                                        </Pressable>

                                        <Pressable
                                            onPress={handleForgotPassword}
                                            style={({ pressed }) => [
                                                local.forgotBtn,
                                                pressed && { opacity: 0.85 },
                                                loading && { opacity: 0.6 },
                                            ]}
                                            hitSlop={10}
                                            disabled={loading}
                                        >
                                            <Text style={local.linkText}>
                                                Esqueci minha senha
                                            </Text>
                                        </Pressable>
                                    </View>

                                    <View style={{ marginVertical: 14 }}>
                                        {appleAvailable ? (
                                            <Pressable
                                                onPress={handleAppleLogin}
                                                style={[
                                                    styles.providerBtnFull,
                                                    loading && { opacity: 0.7 },
                                                ]}
                                                disabled={loading}
                                            >
                                                {loading ? (
                                                    <ActivityIndicator
                                                        color={
                                                            UI.brand
                                                                .primaryText ??
                                                            UI.colors.white
                                                        }
                                                    />
                                                ) : (
                                                    <AntDesign
                                                        name="apple"
                                                        size={20}
                                                        color="#000"
                                                    />
                                                )}

                                                <Text
                                                    style={
                                                        styles.providerBtnFullText
                                                    }
                                                >
                                                    Continuar com Apple
                                                </Text>
                                            </Pressable>
                                        ) : null}

                                        <Pressable
                                            onPress={handleGoogleLogin}
                                            style={[
                                                styles.providerBtnFull,
                                                appleAvailable
                                                    ? { marginTop: 10 }
                                                    : null,
                                                loading && { opacity: 0.7 },
                                            ]}
                                            disabled={loading}
                                        >
                                            {loading ? (
                                                <ActivityIndicator
                                                    color={
                                                        UI.brand.primaryText ??
                                                        UI.colors.white
                                                    }
                                                />
                                            ) : (
                                                <AntDesign
                                                    name="google"
                                                    size={20}
                                                    color="#DB4437"
                                                />
                                            )}

                                            <Text
                                                style={
                                                    styles.providerBtnFullText
                                                }
                                            >
                                                Continuar com Google
                                            </Text>
                                        </Pressable>
                                    </View>

                                    <Pressable
                                        onPress={handleGoSignup}
                                        style={({ pressed }) => [
                                            local.signupBtn,
                                            !canSignup && { opacity: 0.55 },
                                            pressed &&
                                                canSignup && { opacity: 0.85 },
                                        ]}
                                        disabled={!canSignup}
                                    >
                                        <Text style={local.signupBtnText}>
                                            Faça seu cadastro
                                        </Text>
                                    </Pressable>

                                    {__DEV__ && (!apiOk || !companyOk) ? (
                                        <View style={{ marginTop: 12 }}>
                                            {!apiOk ? (
                                                <Text style={styles.subtitle}>
                                                    Configure
                                                    EXPO_PUBLIC_API_URL
                                                </Text>
                                            ) : null}
                                            {!companyOk ? (
                                                <Text style={styles.subtitle}>
                                                    Configure
                                                    EXPO_PUBLIC_COMPANY_ID
                                                </Text>
                                            ) : null}
                                        </View>
                                    ) : null}
                                </View>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </View>
            </ImageBackground>
        </View>
    );
}

const local = {
    input: {
        height: 48,
        borderRadius: 12,
        paddingHorizontal: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        color: '#fff',
    },
    eyeBtn: {
        position: 'absolute' as const,
        right: 14,
        top: 14,
    },

    forgotBtn: {
        alignSelf: 'flex-end' as const,
        marginTop: 8,
        marginBottom: 12,
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    linkText: {
        color: '#fff',
        fontSize: 13,
        textDecorationLine: 'underline' as const,
    },

    loginBtn: {
        height: 48,
        borderRadius: 12,
        backgroundColor: UI.buttons.login,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginTop: 6,
    },
    loginBtnText: {
        color: UI.colors.white,
        fontSize: 15,
        fontWeight: '800' as const,
        letterSpacing: 0.2,
    },

    signupBtn: {
        height: 48,
        borderRadius: 12,
        backgroundColor: UI.buttons.login,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    signupBtnText: {
        color: UI.colors.white,
        fontSize: 15,
        fontWeight: '700' as const,
    },
};
