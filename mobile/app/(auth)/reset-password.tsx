// app/(auth)/reset-password.tsx
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
import { useLocalSearchParams, useRouter } from 'expo-router';
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

function pickErrMessage(payload: any): string {
    const raw =
        payload?.error ||
        payload?.message ||
        payload?.data?.error ||
        payload?.data?.message;
    const msg = normalizeString(raw);
    return msg || 'Não foi possível redefinir a senha. Tente novamente.';
}

/**
 * ✅ Padrão de senha
 * - mínimo 6
 * - 1 maiúscula
 * - 1 número
 * - 1 especial na whitelist: !@#$%^&*()_+-=[];':",.<>/?\|
 */
const PASSWORD_REGEX =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\];':",.<>\/?\|]).{6,}$/;

function isStrongPassword(pw: string) {
    return PASSWORD_REGEX.test(String(pw || ''));
}

function passwordRuleMessage() {
    return 'A senha deve ter no mínimo 6 caracteres, incluindo 1 letra maiúscula, 1 número e 1 caractere especial.';
}

export default function ResetPassword() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams();

    const emailParam = normalizeString(params?.email);
    const tokenParam = normalizeString(params?.token);

    const [token, setToken] = useState(tokenParam);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);

    const apiOk = useMemo(() => Boolean(API_BASE_URL), [API_BASE_URL]);
    const companyOk = useMemo(() => Boolean(COMPANY_ID), [COMPANY_ID]);

    const canSubmit = useMemo(() => {
        if (!apiOk || !companyOk) return false;
        if (!normalizeString(token)) return false;
        if (!isStrongPassword(password)) return false;
        if (password !== confirm) return false;
        return true;
    }, [apiOk, companyOk, token, password, confirm]);

    async function handleSubmit() {
        if (loading) return;

        const t = normalizeString(token);

        if (!apiOk) {
            Alert.alert(
                'Redefinir senha',
                'API do app não configurada (EXPO_PUBLIC_API_URL).'
            );
            return;
        }

        if (!companyOk) {
            Alert.alert(
                'Redefinir senha',
                'Aplicativo sem empresa configurada (EXPO_PUBLIC_COMPANY_ID).'
            );
            return;
        }

        if (!t) {
            Alert.alert('Redefinir senha', 'Token é obrigatório.');
            return;
        }

        if (!isStrongPassword(password)) {
            Alert.alert('Redefinir senha', passwordRuleMessage());
            return;
        }

        if (password !== confirm) {
            Alert.alert('Redefinir senha', 'As senhas não conferem.');
            return;
        }

        try {
            setLoading(true);

            const url = `${API_BASE_URL}/api/mobile/auth/reset-password`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-company-id': COMPANY_ID,
                },
                body: JSON.stringify({
                    token: t,
                    password,
                    companyId: COMPANY_ID,
                }),
            });

            const payload = await res.json().catch(() => null);

            if (!res.ok || !payload?.ok) {
                Alert.alert('Redefinir senha', pickErrMessage(payload));
                return;
            }

            Alert.alert('Redefinir senha', 'Senha redefinida com sucesso.');

            // ✅ volta pro login (limpa stack)
            router.replace('/(auth)/login');
        } catch {
            Alert.alert(
                'Redefinir senha',
                'Erro inesperado ao redefinir a senha. Tente novamente.'
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
                                        Redefinir senha
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
                                        {emailParam
                                            ? `Conta: ${emailParam}`
                                            : 'Informe o token e sua nova senha'}
                                    </Text>

                                    <View style={{ gap: 10 }}>
                                        <View style={local.inputWrap}>
                                            <TextInput
                                                value={token}
                                                onChangeText={setToken}
                                                placeholder="Token"
                                                placeholderTextColor={
                                                    UI.colors.textDim
                                                }
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                style={local.input}
                                                editable={!loading}
                                            />
                                        </View>

                                        <View style={local.inputWrap}>
                                            <TextInput
                                                value={password}
                                                onChangeText={setPassword}
                                                placeholder="Nova senha"
                                                placeholderTextColor={
                                                    UI.colors.textDim
                                                }
                                                secureTextEntry
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                style={local.input}
                                                editable={!loading}
                                            />
                                        </View>

                                        <View style={local.inputWrap}>
                                            <TextInput
                                                value={confirm}
                                                onChangeText={setConfirm}
                                                placeholder="Confirmar nova senha"
                                                placeholderTextColor={
                                                    UI.colors.textDim
                                                }
                                                secureTextEntry
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                style={local.input}
                                                editable={!loading}
                                            />
                                        </View>

                                        <Text
                                            style={[
                                                styles.subtitle,
                                                {
                                                    fontSize: 12,
                                                    opacity: 0.9,
                                                    marginTop: 4,
                                                },
                                            ]}
                                        >
                                            {passwordRuleMessage()}
                                        </Text>

                                        {__DEV__ && (!apiOk || !companyOk) ? (
                                            <View style={{ marginTop: 6 }}>
                                                {!apiOk ? (
                                                    <Text
                                                        style={styles.subtitle}
                                                    >
                                                        Configure
                                                        EXPO_PUBLIC_API_URL
                                                    </Text>
                                                ) : null}
                                                {!companyOk ? (
                                                    <Text
                                                        style={styles.subtitle}
                                                    >
                                                        Configure
                                                        EXPO_PUBLIC_COMPANY_ID
                                                    </Text>
                                                ) : null}
                                            </View>
                                        ) : null}
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
                                                Salvar nova senha
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
