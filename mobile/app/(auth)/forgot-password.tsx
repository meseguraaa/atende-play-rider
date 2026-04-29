// app/(auth)/forgot-password.tsx
import { BRAND } from '../../src/config/brand';
import { useMemo, useState } from 'react';
import {
    View,
    Text,
    Pressable,
    TextInput,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { BRAND_HOME_IMAGE } from '../../src/config/brand-assets';

import { UI, styles } from '../../src/theme/client-theme';

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    (__DEV__ ? 'http://localhost:3000' : '');

const COMPANY_ID = BRAND.companyId;

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function toLowerEmail(v: unknown): string {
    return normalizeString(v).toLowerCase();
}

function pickErrMessage(payload: any): string {
    const raw =
        payload?.error ||
        payload?.message ||
        payload?.data?.error ||
        payload?.data?.message;
    const msg = normalizeString(raw);
    return msg || 'Não foi possível solicitar a redefinição. Tente novamente.';
}

export default function ForgotPassword() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const apiOk = useMemo(() => Boolean(API_BASE_URL), [API_BASE_URL]);
    const companyOk = useMemo(() => Boolean(COMPANY_ID), [COMPANY_ID]);

    const canSubmit = useMemo(() => {
        if (!apiOk || !companyOk) return false;
        const e = toLowerEmail(email);
        return e.length >= 5 && e.includes('@');
    }, [apiOk, companyOk, email]);

    async function handleSubmit() {
        if (loading) return;

        if (!apiOk) {
            Alert.alert(
                'Recuperar senha',
                'API do app não configurada (EXPO_PUBLIC_API_URL).'
            );
            return;
        }

        if (!companyOk) {
            Alert.alert(
                'Recuperar senha',
                'Aplicativo sem empresa configurada (EXPO_PUBLIC_COMPANY_ID).'
            );
            return;
        }

        if (!canSubmit) {
            Alert.alert('Recuperar senha', 'Digite um email válido.');
            return;
        }

        try {
            setLoading(true);

            const e = toLowerEmail(email);

            const res = await fetch(
                `${API_BASE_URL}/api/mobile/auth/forgot-password`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-company-id': COMPANY_ID,
                    },
                    body: JSON.stringify({
                        email: e,
                        companyId: COMPANY_ID,
                    }),
                }
            );

            const payload = await res.json().catch(() => null);

            if (!res.ok || !payload?.ok) {
                Alert.alert('Recuperar senha', pickErrMessage(payload));
                return;
            }

            // ✅ backend retorna mensagem genérica sempre
            const msg =
                normalizeString(payload?.data?.message) ||
                'Se este email estiver cadastrado, enviaremos instruções para redefinir sua senha.';

            // ✅ Se o backend devolver token (modo atual), leva direto pro reset
            const token = normalizeString(payload?.data?.token);

            if (token) {
                Alert.alert('Recuperar senha', msg, [
                    {
                        text: 'Continuar',
                        onPress: () => {
                            const qpEmail = encodeURIComponent(e);
                            const qpToken = encodeURIComponent(token);
                            router.push(
                                `/(auth)/reset-password?email=${qpEmail}&token=${qpToken}`
                            );
                        },
                    },
                ]);
                return;
            }

            // ✅ quando você trocar para envio por email (sem token no response)
            Alert.alert('Recuperar senha', msg, [
                {
                    text: 'OK',
                    onPress: () => router.replace('/(auth)/login'),
                },
            ]);
        } catch {
            Alert.alert(
                'Recuperar senha',
                'Erro inesperado ao solicitar redefinição.'
            );
        } finally {
            setLoading(false);
        }
    }

    const keyboardOffset =
        UI.spacing.headerH + insets.top + (Platform.OS === 'ios' ? 8 : 0);

    return (
        <View style={styles.screen}>
            <StatusBar style="light" backgroundColor={UI.brand.primary} />

            {/* Safe-area */}
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: insets.top + 2,
                    backgroundColor: UI.brand.primary,
                    zIndex: 10,
                }}
            />

            {/* Header */}
            <View
                style={[
                    styles.header,
                    {
                        height: UI.spacing.headerH + insets.top,
                        paddingTop: insets.top,
                        borderBottomLeftRadius: 14,
                        borderBottomRightRadius: 14,
                    },
                ]}
            >
                <View style={styles.headerTitleWrap}>
                    <FontAwesome5
                        name="cut"
                        size={18}
                        color={UI.colors.white}
                    />
                    <Text style={styles.headerTitle}>{UI.brand.name}</Text>
                </View>
            </View>

            {/* Background */}
            <ImageBackground
                source={BRAND_HOME_IMAGE}
                resizeMode="cover"
                style={{ flex: 1 }}
            >
                <View style={{ flex: 1, backgroundColor: UI.overlay.dim }}>
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
                            contentInsetAdjustmentBehavior={
                                Platform.OS === 'ios' ? 'never' : undefined
                            }
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={[styles.body, { paddingBottom: 0 }]}>
                                <View style={[styles.card, UI.shadow.card]}>
                                    <Text
                                        style={[
                                            styles.title,
                                            {
                                                textAlign: 'center',
                                                fontSize: 24,
                                                marginBottom: 10,
                                            },
                                        ]}
                                    >
                                        Recuperar senha
                                    </Text>

                                    <Text
                                        style={[
                                            styles.subtitle,
                                            {
                                                textAlign: 'center',
                                                fontSize: 14,
                                                marginBottom: 16,
                                            },
                                        ]}
                                    >
                                        Informe seu email e vamos te enviar um
                                        link para redefinir a senha
                                    </Text>

                                    <View style={{ gap: 10 }}>
                                        <View style={local.inputWrap}>
                                            <TextInput
                                                value={email}
                                                onChangeText={setEmail}
                                                placeholder="Email"
                                                placeholderTextColor={
                                                    UI.colors.textDim
                                                }
                                                keyboardType="email-address"
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                textContentType="emailAddress"
                                                style={local.input}
                                                editable={!loading}
                                                returnKeyType="done"
                                                onSubmitEditing={handleSubmit}
                                            />
                                        </View>
                                    </View>

                                    <Pressable
                                        onPress={handleSubmit}
                                        disabled={!canSubmit || loading}
                                        style={({ pressed }) => [
                                            local.primaryBtn,
                                            (!canSubmit || loading) && {
                                                opacity: 0.55,
                                            },
                                            pressed && canSubmit && !loading
                                                ? { opacity: 0.85 }
                                                : null,
                                        ]}
                                    >
                                        {loading ? (
                                            <ActivityIndicator
                                                color={UI.colors.white}
                                            />
                                        ) : (
                                            <Text style={local.primaryBtnText}>
                                                Enviar link
                                            </Text>
                                        )}
                                    </Pressable>

                                    <Pressable
                                        onPress={() =>
                                            router.replace('/(auth)/login')
                                        }
                                        style={({ pressed }) => [
                                            local.backBtn,
                                            pressed && { opacity: 0.85 },
                                        ]}
                                        disabled={loading}
                                    >
                                        <Text style={local.backBtnText}>
                                            Voltar para login
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
    inputWrap: {
        position: 'relative' as const,
        borderWidth: 1,
        borderColor: UI.auth.inputBorder,
        borderRadius: UI.radius.input,
        backgroundColor: UI.auth.inputBg,
        overflow: 'hidden' as const,
    },
    input: {
        height: 48,
        paddingHorizontal: 14,
        color: UI.auth.inputText,
        fontSize: 15,
    },
    primaryBtn: {
        marginTop: 14,
        height: 48,
        borderRadius: 12,
        backgroundColor: UI.brand.primary,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    primaryBtnText: {
        color: UI.colors.white,
        fontSize: 15,
        fontWeight: '800' as const,
    },
    backBtn: {
        marginTop: 12,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingVertical: 10,
    },
    backBtnText: {
        color: UI.auth.link,
        fontSize: 13,
        textDecorationLine: 'underline' as const,
    },
};
