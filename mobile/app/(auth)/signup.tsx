// app/(auth)/signup.tsx
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
import { useAuth } from '../../src/auth/auth-context';

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    (__DEV__ ? 'http://localhost:3000' : '');

const COMPANY_ID = BRAND.companyId;

function digitsOnly(v: string) {
    return String(v || '').replace(/\D+/g, '');
}

function maskBirthDDMMYYYY(raw: string) {
    const d = digitsOnly(raw).slice(0, 8); // ddmmyyyy
    const dd = d.slice(0, 2);
    const mm = d.slice(2, 4);
    const yyyy = d.slice(4, 8);

    if (d.length <= 2) return dd;
    if (d.length <= 4) return `${dd}/${mm}`;
    return `${dd}/${mm}/${yyyy}`;
}

function maskPhoneBR(raw: string) {
    const d = digitsOnly(raw).slice(0, 11); // DDD + 9 dígitos
    const ddd = d.slice(0, 2);
    const p1 = d.slice(2, 7);
    const p2 = d.slice(7, 11);

    if (d.length <= 2) return ddd;
    if (d.length <= 7) return `(${ddd}) ${p1}`;
    return `(${ddd}) ${p1}-${p2}`;
}

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
    return msg || 'Não foi possível criar sua conta. Tente novamente.';
}

/**
 * ✅ Padrão de senha (igual ao PROFISSIONAL)
 * - mínimo 6
 * - 1 maiúscula
 * - 1 número
 * - 1 especial dentre: !@#$%^&*()_+-=[];':",.<>/?\|
 */
const PASSWORD_REGEX =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\];':",.<>\/?\|]).{6,}$/;

function isStrongPassword(pw: string) {
    return PASSWORD_REGEX.test(pw);
}

function passwordRuleMessage() {
    return 'A senha deve ter no mínimo 6 caracteres, incluindo 1 letra maiúscula, 1 número e 1 caractere especial.';
}

export default function Signup() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { signIn, refreshMe } = useAuth();

    const [loading, setLoading] = useState(false);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [birth, setBirth] = useState(''); // dd/mm/aaaa
    const [phone, setPhone] = useState(''); // (00) 00000-0000
    const [pass, setPass] = useState('');
    const [pass2, setPass2] = useState('');
    const [showPass, setShowPass] = useState(false);

    // ✅ não congela, mas também não precisa re-render extra
    const apiOk = useMemo(() => Boolean(API_BASE_URL), [API_BASE_URL]);
    const companyOk = useMemo(() => Boolean(COMPANY_ID), [COMPANY_ID]);

    const canSubmit = useMemo(() => {
        const n = name.trim().length >= 2;
        const e = email.trim().length >= 5 && email.includes('@');
        const b = digitsOnly(birth).length === 8; // ddmmyyyy
        const p = digitsOnly(phone).length === 11; // (DD) + 9

        const strong = isStrongPassword(pass);
        const same = pass === pass2;

        return n && e && b && p && strong && same && apiOk && companyOk;
    }, [name, email, birth, phone, pass, pass2, apiOk, companyOk]);

    async function handleCreateAccount() {
        if (loading) return;

        if (!apiOk) {
            Alert.alert(
                'Cadastro',
                'API do app não configurada (EXPO_PUBLIC_API_URL).'
            );
            return;
        }

        if (!companyOk) {
            Alert.alert(
                'Cadastro',
                'Aplicativo sem empresa configurada (EXPO_PUBLIC_COMPANY_ID).'
            );
            return;
        }

        if (!isStrongPassword(pass)) {
            Alert.alert('Cadastro', passwordRuleMessage());
            return;
        }

        if (pass !== pass2) {
            Alert.alert('Cadastro', 'As senhas não conferem.');
            return;
        }

        try {
            setLoading(true);

            const url = `${API_BASE_URL}/api/mobile/auth/signup`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // ✅ padrão multi-tenant (mesmo com companyId no body)
                    'x-company-id': COMPANY_ID,
                },
                body: JSON.stringify({
                    companyId: COMPANY_ID,
                    name: normalizeString(name),
                    email: normalizeString(email).toLowerCase(),
                    phone: digitsOnly(phone),
                    birthday: normalizeString(birth), // dd/mm/yyyy
                    password: pass,
                }),
            });

            const payload = await res.json().catch(() => null);

            if (!res.ok || !payload?.ok) {
                Alert.alert('Cadastro', pickErrMessage(payload));
                return;
            }

            const token = payload?.data?.token;
            if (!token || typeof token !== 'string') {
                Alert.alert(
                    'Cadastro',
                    'Cadastro concluído, mas não recebemos o token de login.'
                );
                return;
            }

            await signIn(
                JSON.stringify({
                    token,
                    companyId: COMPANY_ID,
                })
            );

            try {
                await refreshMe();
            } catch {
                // ok
            }

            router.replace('/');
        } catch {
            Alert.alert('Cadastro', 'Erro inesperado ao criar conta.');
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
                                                fontSize: 26,
                                                marginBottom: 10,
                                            },
                                        ]}
                                    >
                                        Faça seu cadastro
                                    </Text>

                                    <Text
                                        style={[
                                            styles.subtitle,
                                            {
                                                textAlign: 'center',
                                                fontSize: 15,
                                                marginBottom: 16,
                                            },
                                        ]}
                                    >
                                        Preencha seus dados para criar a conta
                                    </Text>

                                    <View style={{ gap: 10 }}>
                                        <View style={local.inputWrap}>
                                            <TextInput
                                                value={name}
                                                onChangeText={setName}
                                                placeholder="Nome"
                                                placeholderTextColor={
                                                    UI.colors.textDim
                                                }
                                                autoCapitalize="words"
                                                autoCorrect={false}
                                                textContentType="name"
                                                style={local.input}
                                                editable={!loading}
                                                returnKeyType="next"
                                            />
                                        </View>

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
                                                returnKeyType="next"
                                            />
                                        </View>

                                        <View style={local.inputWrap}>
                                            <TextInput
                                                value={birth}
                                                onChangeText={(t) =>
                                                    setBirth(
                                                        maskBirthDDMMYYYY(t)
                                                    )
                                                }
                                                placeholder="Data de nascimento"
                                                placeholderTextColor={
                                                    UI.colors.textDim
                                                }
                                                keyboardType="number-pad"
                                                style={local.input}
                                                maxLength={10}
                                                editable={!loading}
                                                returnKeyType="next"
                                            />
                                        </View>

                                        <View style={local.inputWrap}>
                                            <TextInput
                                                value={phone}
                                                onChangeText={(t) =>
                                                    setPhone(maskPhoneBR(t))
                                                }
                                                placeholder="Telefone (00) 00000-0000"
                                                placeholderTextColor={
                                                    UI.colors.textDim
                                                }
                                                keyboardType="phone-pad"
                                                style={local.input}
                                                maxLength={15}
                                                editable={!loading}
                                                returnKeyType="next"
                                            />
                                        </View>

                                        <View style={local.inputWrap}>
                                            <TextInput
                                                value={pass}
                                                onChangeText={setPass}
                                                placeholder="Senha"
                                                placeholderTextColor={
                                                    UI.colors.textDim
                                                }
                                                secureTextEntry={!showPass}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                textContentType="newPassword"
                                                style={local.input}
                                                editable={!loading}
                                                returnKeyType="next"
                                            />

                                            <Pressable
                                                onPress={() =>
                                                    setShowPass((v) => !v)
                                                }
                                                style={({ pressed }) => [
                                                    local.eyeBtn,
                                                    pressed && { opacity: 0.8 },
                                                ]}
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
                                                    color={UI.auth.inputText}
                                                />
                                            </Pressable>
                                        </View>

                                        <View style={local.inputWrap}>
                                            <TextInput
                                                value={pass2}
                                                onChangeText={setPass2}
                                                placeholder="Confirmar senha"
                                                placeholderTextColor={
                                                    UI.colors.textDim
                                                }
                                                secureTextEntry={!showPass}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                textContentType="newPassword"
                                                style={local.input}
                                                editable={!loading}
                                                returnKeyType="done"
                                                onSubmitEditing={() => {
                                                    if (canSubmit && !loading) {
                                                        handleCreateAccount();
                                                    }
                                                }}
                                            />
                                        </View>

                                        {pass.length > 0 &&
                                        !isStrongPassword(pass) ? (
                                            <Text style={local.hintText}>
                                                {passwordRuleMessage()}
                                            </Text>
                                        ) : null}
                                    </View>

                                    <Pressable
                                        onPress={handleCreateAccount}
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
                                                Criar conta
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
                                            Já tenho conta. Voltar para login
                                        </Text>
                                    </Pressable>

                                    {__DEV__ && (!apiOk || !companyOk) ? (
                                        <View style={{ marginTop: 12 }}>
                                            {!apiOk ? (
                                                <Text style={styles.subtitle}>
                                                    Configure
                                                    EXPO_PUBLIC_API_URL (ex:
                                                    https://xxxx.ngrok-free.dev)
                                                </Text>
                                            ) : null}
                                            {!companyOk ? (
                                                <Text style={styles.subtitle}>
                                                    Configure
                                                    EXPO_PUBLIC_COMPANY_ID (id
                                                    da empresa no banco)
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
        paddingRight: 44,
        color: UI.auth.inputText,
        fontSize: 15,
    },
    eyeBtn: {
        position: 'absolute' as const,
        right: 10,
        top: 0,
        bottom: 0,
        width: 34,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    hintText: {
        marginTop: 8,
        color: UI.colors.text,
        fontSize: 12,
        lineHeight: 16,
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
