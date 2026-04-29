import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    Pressable,
    Image,
    StyleSheet,
    ScrollView,
    TextInput,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    InputAccessoryView,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { UI, styles } from '../../../src/theme/client-theme';
import { useAuth } from '../../../src/auth/auth-context';
import { apiFetch } from '../../../src/lib/api';

import { ScreenGate } from '../../../src/components/layout/ScreenGate';
import { ProfileSkeleton } from '../../../src/components/loading/ProfileSkeleton';

const STICKY_ROW_H = 0;
const IOS_ACCESSORY_ID = 'profileEmptyAccessory';

// ✅ removemos placeholder de imagem externa (agora fallback é ícone)
const AVATAR_PLACEHOLDER = '';

/* ===========================
 * Máscaras (sem libs)
 * ===========================*/
function maskPhone(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11);

    if (digits.length === 0) return '';

    if (digits.length <= 10) {
        const m = digits
            .replace(/(\d{0,2})(\d{0,4})(\d{0,4}).*/, '($1) $2-$3')
            .replace(/\(\)\s?/, '')
            .replace(/\)\s-/, ') ')
            .replace(/-$/, '');
        return m.trim();
    }

    const m = digits
        .replace(/(\d{0,2})(\d{0,5})(\d{0,4}).*/, '($1) $2-$3')
        .replace(/\(\)\s?/, '')
        .replace(/\)\s-/, ') ')
        .replace(/-$/, '');
    return m.trim();
}

function maskDate(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length === 0) return '';

    let out = digits;
    if (digits.length >= 3) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length >= 5)
        out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;

    return out;
}

function formatBirthdayBR(input: unknown): string {
    if (!input) return '';

    const d =
        input instanceof Date
            ? input
            : typeof input === 'string'
              ? new Date(input)
              : null;

    if (!d || Number.isNaN(d.getTime())) return '';

    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear());
    return `${dd}/${mm}/${yyyy}`;
}

function digitsOnly(s: string) {
    return (s || '').replace(/\D/g, '');
}

function isValidBirthBR(b: string) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(b)) return false;

    const [ddS, mmS, yyyyS] = b.split('/');
    const dd = Number(ddS);
    const mm = Number(mmS);
    const yyyy = Number(yyyyS);

    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy))
        return false;
    if (yyyy < 1900 || yyyy > 2100) return false;
    if (mm < 1 || mm > 12) return false;
    if (dd < 1 || dd > 31) return false;

    // valida data real
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (Number.isNaN(d.getTime())) return false;
    if (
        d.getUTCFullYear() !== yyyy ||
        d.getUTCMonth() !== mm - 1 ||
        d.getUTCDate() !== dd
    )
        return false;

    return true;
}

// ✅ converte dd/mm/aaaa -> yyyy-mm-dd (melhor pro backend)
function birthBRToISO(b: string): string | null {
    const s = String(b ?? '').trim();
    if (!s) return null;
    if (!isValidBirthBR(s)) return null;

    const [ddS, mmS, yyyyS] = s.split('/');
    const dd = Number(ddS);
    const mm = Number(mmS);
    const yyyy = Number(yyyyS);

    const pad2 = (n: number) => String(n).padStart(2, '0');
    return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

/* ===========================
 * ✅ Avatar helpers
 * ===========================*/
function normalizeImageUrl(v: unknown): string {
    const s = String(v ?? '').trim();
    if (!s) return '';
    // evita usar "null", "undefined", etc. como URL
    if (s === 'null' || s === 'undefined') return '';
    return s;
}

/* ===========================
 * ✅ Cursor-safe helpers p/ máscara
 * ===========================*/
function countDigitsBeforeIndex(text: string, idx: number) {
    const s = String(text ?? '');
    const end = Math.max(0, Math.min(idx, s.length));
    let count = 0;
    for (let i = 0; i < end; i++) {
        if (/\d/.test(s[i])) count++;
    }
    return count;
}

function indexAfterNDigits(masked: string, nDigits: number) {
    const s = String(masked ?? '');
    if (nDigits <= 0) return 0;

    let seen = 0;
    for (let i = 0; i < s.length; i++) {
        if (/\d/.test(s[i])) {
            seen++;
            if (seen >= nDigits) return i + 1;
        }
    }
    return s.length;
}

type MeApiUser = {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    phone: string | null;
    birthday: string | Date | null;

    // ✅ novo (backend /me)
    profileComplete?: boolean;
    missingFields?: Array<'phone' | 'birthday'>;
};

// =======================
// 🎨 NÍVEL DO CLIENTE (cores copiadas do Admin)
// =======================
type CustomerLevelKey = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';

function normalizeCustomerLevelKey(user: any): CustomerLevelKey | null {
    const raw = String(
        user?.customerLevel?.key ??
            user?.customerLevel?.level ??
            user?.customerLevel?.value ??
            user?.customerLevel ??
            user?.level?.key ??
            user?.level?.value ??
            user?.level ??
            user?.levelKey ??
            user?.levelEnum ??
            ''
    ).trim();

    if (
        raw === 'BRONZE' ||
        raw === 'PRATA' ||
        raw === 'OURO' ||
        raw === 'DIAMANTE'
    )
        return raw;

    const label = String(
        user?.customerLevel?.label ??
            user?.level?.label ??
            user?.levelLabel ??
            user?.tier?.label ??
            user?.tier ??
            ''
    )
        .trim()
        .toLowerCase();

    if (label.includes('bronze')) return 'BRONZE';
    if (label.includes('prata')) return 'PRATA';
    if (label.includes('ouro')) return 'OURO';
    if (label.includes('diam')) return 'DIAMANTE';

    return null;
}

function levelChipColors(level: CustomerLevelKey) {
    switch (level) {
        case 'BRONZE':
            return {
                bg: 'rgba(245, 158, 11, 0.10)',
                border: 'rgba(245, 158, 11, 0.30)',
                text: 'rgb(180, 83, 9)',
            };
        case 'PRATA':
            return {
                bg: 'rgba(100, 116, 139, 0.10)',
                border: 'rgba(100, 116, 139, 0.30)',
                text: 'rgb(226, 232, 240)',
            };
        case 'OURO':
            return {
                bg: 'rgba(234, 179, 8, 0.10)',
                border: 'rgba(234, 179, 8, 0.30)',
                text: 'rgb(161, 98, 7)',
            };
        case 'DIAMANTE':
            return {
                bg: 'rgba(14, 165, 233, 0.10)',
                border: 'rgba(14, 165, 233, 0.30)',
                text: 'rgb(3, 105, 161)',
            };
    }
}

const Field = memo(function Field({
    label,
    value,
    placeholder,
    icon,
    editable,
    onChangeText,
    keyboardType,
    selection,
    onSelectionChange,
    textContentType,
}: {
    label: string;
    value?: string;
    placeholder: string;
    icon: any;
    editable?: boolean;
    onChangeText?: (t: string) => void;
    keyboardType?: any;
    selection?: { start: number; end: number };
    onSelectionChange?: (sel: { start: number; end: number }) => void;
    textContentType?: any;
}) {
    return (
        <View style={S.fieldWrap}>
            <Text style={S.fieldLabel}>{label}</Text>

            <View style={S.inputRow}>
                <View style={S.inputIcon}>
                    <FontAwesome
                        name={icon}
                        size={16}
                        color={UI.colors.historyIconColor}
                    />
                </View>

                <TextInput
                    value={value}
                    placeholder={placeholder}
                    placeholderTextColor={UI.colors.black45}
                    style={[S.input, editable === false && S.inputDisabled]}
                    editable={editable}
                    onChangeText={onChangeText}
                    keyboardType={keyboardType}
                    inputAccessoryViewID={
                        Platform.OS === 'ios' ? IOS_ACCESSORY_ID : undefined
                    }
                    autoCorrect={false}
                    autoCapitalize="none"
                    selection={selection}
                    onSelectionChange={
                        onSelectionChange
                            ? (e) => onSelectionChange(e.nativeEvent.selection)
                            : undefined
                    }
                    textContentType={textContentType}
                />
            </View>
        </View>
    );
});

export default function Profile() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { signOut, user, refreshMe } = useAuth();

    const [loadingMe, setLoadingMe] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');

    // ✅ agora avatar pode ser vazio; quando vazio, renderiza fallback com ícone
    const [avatar, setAvatar] = useState<string>(AVATAR_PLACEHOLDER);

    const [phone, setPhone] = useState('');
    const [birth, setBirth] = useState('');

    // ✅ cursor control p/ telefone (iOS-friendly)
    const [phoneSelection, setPhoneSelection] = useState({ start: 0, end: 0 });

    // último selection conhecido (iOS às vezes atrasa)
    const phoneSelRef = useRef<{ start: number; end: number }>({
        start: 0,
        end: 0,
    });

    // últimos valores (para delta de dígitos)
    const prevPhoneMaskedRef = useRef('');
    const prevPhoneDigitsRef = useRef('');

    // ✅ onboarding gate
    const [profileComplete, setProfileComplete] = useState<boolean>(true);
    const [missingFields, setMissingFields] = useState<
        Array<'phone' | 'birthday'>
    >([]);

    const didMeRef = useRef(false);
    const [dataReady, setDataReady] = useState(false);

    // ✅ topo fixo: safe top + header (importante pro offset do teclado)
    const TOP_OFFSET = useMemo(() => insets.top + STICKY_ROW_H, [insets.top]);

    // ✅ offset do teclado (Android e iOS) para não cobrir campos com header fixo
    const keyboardOffset = useMemo(() => {
        if (Platform.OS === 'ios') return TOP_OFFSET;
        return TOP_OFFSET;
    }, [TOP_OFFSET]);

    // ✅ regra: se tem URL válida (ex: Google), mostra imagem. Se não, mostra ícone.
    const avatarUrl = useMemo(() => normalizeImageUrl(avatar), [avatar]);
    const hasAvatar = useMemo(() => Boolean(avatarUrl), [avatarUrl]);

    // ✅ nível (label curta) + cores do Admin
    const userLevelLabel = useMemo(() => {
        const raw =
            (user as any)?.level?.label ??
            (user as any)?.levelLabel ??
            (user as any)?.level ??
            (user as any)?.customerLevel?.label ??
            (user as any)?.customerLevel ??
            (user as any)?.tier?.label ??
            (user as any)?.tier ??
            null;

        const s = String(raw ?? '').trim();
        if (!s) return null;

        return s.length > 12 ? `${s.slice(0, 12)}…` : s;
    }, [user]);

    const userLevelIcon = useMemo(() => {
        const l = String(userLevelLabel ?? '').toLowerCase();
        if (l.includes('diam')) return 'diamond';
        if (l.includes('ouro')) return 'trophy';
        if (l.includes('prata')) return 'certificate';
        return 'star';
    }, [userLevelLabel]);

    const userLevelKey = useMemo(() => normalizeCustomerLevelKey(user), [user]);

    const userLevelStyle = useMemo(() => {
        if (!userLevelKey) return null;
        const c = levelChipColors(userLevelKey);

        return {
            container: {
                backgroundColor: c.bg,
                borderColor: c.border,
            },
            text: {
                color: c.text,
            },
            icon: {
                color: c.text,
            },
        } as const;
    }, [userLevelKey]);

    const needsOnboarding = useMemo(() => !profileComplete, [profileComplete]);

    const onboardingTitle = useMemo(() => {
        const fields = missingFields || [];
        const hasPhone = fields.includes('phone');
        const hasBirth = fields.includes('birthday');

        if (hasPhone && hasBirth) return 'Complete seu cadastro';
        if (hasPhone) return 'Falta seu telefone';
        if (hasBirth) return 'Falta sua data de nascimento';
        return 'Complete seu cadastro';
    }, [missingFields]);

    const onboardingText = useMemo(() => {
        const fields = missingFields || [];
        const parts: string[] = [];

        if (fields.includes('phone')) parts.push('telefone');
        if (fields.includes('birthday')) parts.push('data de nascimento');

        if (parts.length === 0) {
            return 'Para continuar usando o app, complete seu cadastro.';
        }

        return `Para continuar usando o app, informe ${parts.join(' e ')}.`;
    }, [missingFields]);

    async function forceLogoutToLogin() {
        try {
            await signOut();
        } finally {
            router.replace('/(auth)/login');
        }
    }

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                setLoadingMe(true);

                const res = await apiFetch<{
                    user: MeApiUser;
                    profileComplete?: boolean;
                }>('/api/mobile/me');
                if (!alive) return;

                const u = res.user;

                setName(u.name ?? '');
                setEmail(u.email ?? '');

                // ✅ se vier do Google (ou tiver foto), usa.
                // ✅ se vier de cadastro manual (sem foto), fica vazio e cai no fallback.
                setAvatar(normalizeImageUrl(u.image));

                const maskedPhone = u.phone ? maskPhone(u.phone) : '';
                setPhone(maskedPhone);
                setBirth(maskDate(formatBirthdayBR(u.birthday)));

                // ✅ prepara refs do telefone
                prevPhoneMaskedRef.current = maskedPhone;
                prevPhoneDigitsRef.current = digitsOnly(maskedPhone);

                const end = maskedPhone.length;
                setPhoneSelection({ start: end, end });
                phoneSelRef.current = { start: end, end };

                // ✅ gate
                const pc =
                    typeof u.profileComplete === 'boolean'
                        ? u.profileComplete
                        : typeof (res as any)?.profileComplete === 'boolean'
                          ? Boolean((res as any).profileComplete)
                          : true;

                setProfileComplete(pc);
                setMissingFields(
                    Array.isArray(u.missingFields) ? u.missingFields : []
                );
            } catch {
                Alert.alert('Erro', 'Não foi possível carregar seus dados.');
                setAvatar('');
            } finally {
                if (!alive) return;
                setLoadingMe(false);

                if (!didMeRef.current) {
                    didMeRef.current = true;
                    setDataReady(true);
                }
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    async function handleDeleteAccount() {
        if (deleting) return;

        Alert.alert(
            'Excluir conta',
            'Isso vai apagar sua conta e seus dados do app. Essa ação não pode ser desfeita.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Excluir',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setDeleting(true);

                            await apiFetch('/api/mobile/account/delete', {
                                method: 'POST',
                                body: JSON.stringify({ confirm: 'DELETE' }),
                            });

                            Alert.alert(
                                'Conta excluída',
                                'Sua conta foi excluída com sucesso.',
                                [
                                    {
                                        text: 'OK',
                                        onPress: async () => {
                                            await forceLogoutToLogin();
                                        },
                                    },
                                ]
                            );
                        } catch (e: any) {
                            Alert.alert(
                                'Erro',
                                e?.message ||
                                    'Não foi possível excluir sua conta. Tente novamente.'
                            );
                        } finally {
                            setDeleting(false);
                        }
                    },
                },
            ]
        );
    }

    async function handleLogout() {
        Alert.alert('Sair da conta', 'Quer mesmo sair?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Sair', style: 'destructive', onPress: forceLogoutToLogin },
        ]);
    }

    function validateRequiredForOnboarding() {
        const pDigits = digitsOnly(phone);
        const b = birth.trim();

        if (!pDigits || pDigits.length < 10) {
            Alert.alert(
                'Telefone obrigatório',
                'Informe um telefone válido para continuar.'
            );
            return false;
        }

        if (!b || !isValidBirthBR(b)) {
            Alert.alert(
                'Data de nascimento obrigatória',
                'Informe sua data no formato dd/mm/aaaa para continuar.'
            );
            return false;
        }

        return true;
    }

    // ✅ telefone com máscara + cursor estável no iOS
    function handlePhoneSelectionChange(sel: { start: number; end: number }) {
        setPhoneSelection(sel);
        phoneSelRef.current = sel;
    }

    function applyPhoneSelectionNextFrame(start: number) {
        const sel = { start, end: start };

        if (Platform.OS === 'ios') {
            requestAnimationFrame(() => {
                setPhoneSelection(sel);
                phoneSelRef.current = sel;
            });
        } else {
            setPhoneSelection(sel);
            phoneSelRef.current = sel;
        }
    }

    function handlePhoneChangeText(t: string) {
        const prevMasked = prevPhoneMaskedRef.current || '';
        const prevDigits = prevPhoneDigitsRef.current || '';

        const nextDigits = digitsOnly(t).slice(0, 11);
        const nextMasked = maskPhone(nextDigits);

        // caret ANTERIOR (mais confiável no iOS)
        const prevSel = phoneSelRef.current;
        const prevDigitsBefore = countDigitsBeforeIndex(
            prevMasked,
            prevSel.start
        );

        // delta de dígitos (digitou/apagou/colou)
        const delta = nextDigits.length - prevDigits.length;

        let desiredDigitsBefore = prevDigitsBefore;
        if (delta > 0) desiredDigitsBefore = prevDigitsBefore + delta;
        if (delta < 0)
            desiredDigitsBefore = Math.max(0, prevDigitsBefore + delta);

        const nextCursor = indexAfterNDigits(nextMasked, desiredDigitsBefore);

        setPhone(nextMasked);
        applyPhoneSelectionNextFrame(nextCursor);

        prevPhoneMaskedRef.current = nextMasked;
        prevPhoneDigitsRef.current = nextDigits;
    }

    async function handleSave() {
        if (saving) return;

        const trimmedName = name.trim();

        if (!trimmedName) {
            Alert.alert('Nome obrigatório', 'Informe seu nome para continuar.');
            return;
        }

        const b = birth.trim();

        if (needsOnboarding) {
            if (!validateRequiredForOnboarding()) return;
        } else {
            if (b.length > 0 && !/^\d{2}\/\d{2}\/\d{4}$/.test(b)) {
                Alert.alert('Data inválida', 'Use o formato 00/00/0000.');
                return;
            }
            if (b.length > 0 && !isValidBirthBR(b)) {
                Alert.alert('Data inválida', 'Verifique o dia/mês/ano.');
                return;
            }
        }

        const phoneDigits = digitsOnly(phone);
        const birthdayISO = b ? birthBRToISO(b) : null;

        if (b && !birthdayISO) {
            Alert.alert('Data inválida', 'Verifique o dia/mês/ano.');
            return;
        }

        try {
            setSaving(true);

            const res = await apiFetch<{
                user: any;
                profileComplete?: boolean;
            }>('/api/mobile/me', {
                method: 'PATCH',
                body: JSON.stringify({
                    name: name.trim() || null,
                    phone: phoneDigits || null,
                    birthday: birthdayISO || null,
                }),
            });

            const u = (res as any)?.user ?? null;

            const pc =
                typeof u?.profileComplete === 'boolean'
                    ? u.profileComplete
                    : typeof (res as any)?.profileComplete === 'boolean'
                      ? Boolean((res as any).profileComplete)
                      : true;

            setProfileComplete(pc);
            setMissingFields(
                Array.isArray(u?.missingFields) ? u.missingFields : []
            );

            if (!pc) {
                Alert.alert(
                    'Cadastro incompleto',
                    'Preencha telefone e data de nascimento para continuar.'
                );
                return;
            }

            // ✅ Atualiza o user do AuthContext para o gate parar de prender no profile
            try {
                await refreshMe();
            } catch {
                // se falhar por rede momentânea, seguimos mesmo assim
            }

            router.replace('/(app)/(tabs)/home');
        } catch (e: any) {
            Alert.alert('Erro', e?.message || 'Não foi possível salvar.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScreenGate dataReady={dataReady} skeleton={<ProfileSkeleton />}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                enabled
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={keyboardOffset}
            >
                <View style={S.page}>
                    {Platform.OS === 'ios' ? (
                        <InputAccessoryView nativeID={IOS_ACCESSORY_ID}>
                            <View />
                        </InputAccessoryView>
                    ) : null}

                    {/* TOPO FIXO */}
                    <View style={S.fixedTop}>
                        <View
                            style={{
                                height: insets.top,
                                backgroundColor: UI.brand.primary,
                            }}
                        />
                        <View style={S.stickyRow}>
                            {/* ✅ removido "Perfil" para tudo subir */}
                        </View>
                    </View>

                    <ScrollView
                        style={S.scroll}
                        contentContainerStyle={[
                            S.scrollContent,
                            {
                                paddingBottom:
                                    (Platform.OS === 'android' ? 44 : 28) +
                                    insets.bottom,
                            },
                        ]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="interactive"
                        {...(Platform.OS === 'ios'
                            ? ({
                                  automaticallyAdjustKeyboardInsets: true,
                              } as any)
                            : null)}
                    >
                        <View
                            pointerEvents="none"
                            style={[
                                S.topBounceDark,
                                { height: insets.top + STICKY_ROW_H + 1400 },
                            ]}
                        />

                        <View
                            style={{
                                height: insets.top + STICKY_ROW_H,
                                backgroundColor: UI.colors.bg,
                            }}
                        />

                        {/* BLOCO ESCURO */}
                        <View style={S.darkShell}>
                            <View style={S.darkInner}>
                                <View style={S.heroCard}>
                                    <View style={S.profileHeroRow}>
                                        <View style={S.avatarWrap}>
                                            {hasAvatar ? (
                                                <Image
                                                    source={{ uri: avatarUrl }}
                                                    style={S.avatarBig}
                                                />
                                            ) : (
                                                <View style={S.avatarFallback}>
                                                    <FontAwesome
                                                        name="user"
                                                        size={32}
                                                        color={UI.colors.white}
                                                    />
                                                </View>
                                            )}
                                        </View>

                                        <View style={S.heroTextCol}>
                                            <Text style={S.heroHello}>
                                                Seus dados{loadingMe ? '…' : ''}
                                            </Text>
                                            <Text
                                                style={S.heroName}
                                                numberOfLines={1}
                                            >
                                                {name || ' '}
                                            </Text>
                                            <Text
                                                style={S.heroEmail}
                                                numberOfLines={1}
                                            >
                                                {email || ' '}
                                            </Text>
                                        </View>

                                        {userLevelLabel ? (
                                            <View
                                                style={[
                                                    S.levelPill,
                                                    S.levelPillRight,
                                                    userLevelStyle?.container,
                                                ]}
                                            >
                                                <FontAwesome
                                                    name={userLevelIcon as any}
                                                    size={14}
                                                    color={
                                                        userLevelStyle?.icon
                                                            ?.color ??
                                                        UI.colors.white
                                                    }
                                                />
                                                <Text
                                                    style={[
                                                        S.levelPillText,
                                                        userLevelStyle?.text,
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {userLevelLabel}
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* ÁREA BRANCA */}
                        <View style={S.whiteArea}>
                            <View style={S.whiteContent}>
                                {needsOnboarding ? (
                                    <View style={S.onboardingCard}>
                                        <View style={S.onboardingIcon}>
                                            <FontAwesome
                                                name="exclamation"
                                                size={14}
                                                color={UI.brand.primaryText}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={S.onboardingTitle}>
                                                {onboardingTitle}
                                            </Text>
                                            <Text style={S.onboardingText}>
                                                {onboardingText}
                                            </Text>
                                        </View>
                                    </View>
                                ) : null}

                                <Text style={S.sectionTitle}>Informações</Text>

                                <View style={S.formCard}>
                                    <Field
                                        label="Nome"
                                        value={name}
                                        placeholder="Seu nome completo"
                                        icon="user"
                                        editable={!loadingMe && !saving}
                                        onChangeText={setName}
                                        textContentType="name"
                                    />

                                    <Field
                                        label="E-mail"
                                        value={email}
                                        placeholder="seu@email.com"
                                        icon="envelope"
                                        editable={false}
                                    />

                                    <Field
                                        label="Telefone"
                                        value={phone}
                                        placeholder="(00) 00000-0000"
                                        icon="phone"
                                        editable={!loadingMe && !saving}
                                        onChangeText={handlePhoneChangeText}
                                        onSelectionChange={
                                            handlePhoneSelectionChange
                                        }
                                        selection={phoneSelection}
                                        keyboardType="number-pad"
                                        textContentType="telephoneNumber"
                                    />

                                    <Field
                                        label="Data de nascimento"
                                        value={birth}
                                        placeholder="dd/mm/aaaa"
                                        icon="calendar"
                                        editable={!loadingMe && !saving}
                                        onChangeText={(t) =>
                                            setBirth(maskDate(t))
                                        }
                                        keyboardType="number-pad"
                                    />
                                </View>

                                <Pressable
                                    style={[
                                        S.saveBtn,
                                        saving || loadingMe
                                            ? { opacity: 0.85 }
                                            : null,
                                    ]}
                                    onPress={handleSave}
                                    disabled={saving || loadingMe}
                                >
                                    {saving ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={S.saveBtnText}>
                                            {needsOnboarding
                                                ? 'Completar cadastro'
                                                : 'Salvar alterações'}
                                        </Text>
                                    )}
                                </Pressable>

                                <Pressable
                                    style={[
                                        S.deleteBtn,
                                        deleting || saving || loadingMe
                                            ? { opacity: 0.85 }
                                            : null,
                                    ]}
                                    onPress={handleDeleteAccount}
                                    disabled={deleting || saving || loadingMe}
                                >
                                    {deleting ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <Text style={S.deleteBtnText}>
                                            Excluir conta
                                        </Text>
                                    )}
                                </Pressable>

                                <Pressable
                                    style={S.dangerLink}
                                    onPress={handleLogout}
                                >
                                    <Text style={S.dangerText}>
                                        Sair da conta
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </ScreenGate>
    );
}

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.bg },

    fixedTop: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        zIndex: 999,
    },

    stickyRow: {
        height: STICKY_ROW_H,
        backgroundColor: UI.colors.bg,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ✅ título removido

    scroll: { flex: 1, backgroundColor: UI.colors.white },
    scrollContent: { paddingBottom: 28 },

    topBounceDark: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: -1400,
        backgroundColor: UI.colors.bg,
    },

    darkShell: {
        backgroundColor: UI.colors.bg,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        overflow: 'hidden',
    },

    darkInner: {
        paddingHorizontal: UI.spacing.screenX,
        paddingBottom: UI.spacing.screenX,
    },

    heroCard: {
        marginTop: 14,
        backgroundColor: UI.colors.heroCardBg,
        borderRadius: UI.radius.card,
        padding: UI.spacing.cardPad,
        borderWidth: 1,
        borderColor: UI.colors.heroCardBorder,
    },

    profileHeroRow: {
        flexDirection: 'row',
        gap: 14,
        alignItems: 'center',
    },

    levelPill: {
        height: 56,
        minWidth: 64,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    levelPillText: {
        fontSize: 10,
        fontWeight: '900',
        includeFontPadding: false,
        maxWidth: 80,
        textAlign: 'center',
    },

    avatarWrap: { position: 'relative' },
    avatarBig: {
        width: 74,
        height: 74,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: UI.brand.primary,
    },

    // ✅ fallback: círculo brand + ícone branco (igual profissional sem foto)
    avatarFallback: {
        width: 74,
        height: 74,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: UI.brand.primary,
        backgroundColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },

    avatarBadge: {
        position: 'absolute',
        right: -6,
        bottom: -6,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
    },

    heroHello: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        fontWeight: '600',
    },
    heroName: {
        color: UI.colors.text,
        fontSize: 18,
        fontWeight: '600',
        marginTop: 4,
    },
    heroEmail: {
        color: 'rgba(255,255,255,0.82)',
        fontSize: 13,
        marginTop: 3,
        fontWeight: '500',
    },

    whiteArea: { backgroundColor: UI.colors.white },
    whiteContent: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 18,
    },

    onboardingCard: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        backgroundColor: 'rgba(245, 158, 11, 0.10)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.25)',
        borderRadius: UI.radius.card,
        padding: 12,
        marginBottom: 14,
    },
    onboardingIcon: {
        width: 28,
        height: 28,
        borderRadius: 10,
        backgroundColor: 'rgba(245, 158, 11, 0.16)',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    onboardingTitle: {
        color: UI.brand.primaryText,
        fontSize: 13,
        fontWeight: '800',
    },
    onboardingText: {
        marginTop: 4,
        color: UI.colors.black45,
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 16,
    },

    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: UI.brand.primaryText,
        marginBottom: 12,
    },

    formCard: {
        backgroundColor: UI.colors.white,
        borderWidth: 1,
        borderColor: UI.colors.black08,
        borderRadius: UI.radius.card,
        padding: 14,
    },

    fieldWrap: { paddingVertical: 8 },

    fieldLabel: {
        color: '#141414',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 8,
    },

    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: UI.colors.black05,
        borderRadius: UI.radius.input,
        borderWidth: 1,
        borderColor: UI.colors.black08,
        paddingHorizontal: 12,
        height: 48,
    },

    inputIcon: {
        width: 28,
        height: 28,
        borderRadius: 10,
        backgroundColor: UI.colors.historyIconBg,
        alignItems: 'center',
        justifyContent: 'center',
    },

    input: {
        flex: 1,
        color: UI.brand.primaryText,
        fontSize: 15,
        fontWeight: '500',
        paddingVertical: 0,
    },

    // ✅ cinza mais escuro para campos não editáveis (Nome e E-mail)
    inputReadonly: {
        color: '#3F3F3F',
    },

    saveBtn: {
        marginTop: 16,
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },

    deleteBtn: {
        marginTop: 12,
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        backgroundColor: '#DC2626', // vermelho
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },

    dangerLink: {
        marginTop: 14,
        alignItems: 'center',
        paddingVertical: 10,
    },
    dangerText: {
        color: UI.colors.black45,
        fontSize: 13,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },

    heroTextCol: {
        flex: 1,
        paddingVertical: 4,
    },

    levelPillRight: {
        marginLeft: 'auto',
    },
    inputDisabled: {
        color: '#9CA3AF', // cinza típico de campo desabilitado (estilo iOS / Android)
    },
});
