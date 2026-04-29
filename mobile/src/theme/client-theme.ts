import { StyleSheet } from 'react-native';
import { BRAND } from '../config/brand';

export const UI = {
    brand: {
        name: BRAND.appName,
        primary: BRAND.theme.primary,
        primaryText: BRAND.theme.primaryText,
    },
    colors: {
        bg: BRAND.theme.background,
        card: BRAND.theme.card,
        cardBorder: BRAND.theme.cardBorder,
        text: BRAND.theme.text,
        textMuted: BRAND.theme.textMuted,
        textDim: BRAND.theme.textDim,
        danger: BRAND.theme.danger,
        success: BRAND.theme.success,
        divider: BRAND.theme.divider,
        white: BRAND.theme.white,
        black: BRAND.theme.black,
        heroCardBg: BRAND.theme.heroCardBg,
        heroCardBorder: BRAND.theme.heroCardBorder,
        historyIconBg: BRAND.theme.historyIconBg,
        historyIconColor: BRAND.theme.historyIconColor,
        categoryChipText: BRAND.theme.categoryChipText,
        categoryChipTextActive: BRAND.theme.categoryChipTextActive,

        // ✅ overlays/utilidades (pra reduzir hardcode espalhado)
        overlay08: BRAND.theme.overlay08,
        overlay10: BRAND.theme.overlay10,
        overlay12: BRAND.theme.overlay12,
        overlay18: BRAND.theme.overlay18,
        black28: BRAND.theme.black28,
        black05: BRAND.theme.black05,
        black08: BRAND.theme.black08,
        black10: BRAND.theme.black10,
        black45: BRAND.theme.black45,
    },

    // ✅ Overlay tokens
    overlay: {
        // fundo escuro translúcido para telas/modais
        dim: BRAND.theme.overlayDim,
    },

    // ✅ Auth tokens (inputs/links)
    auth: {
        inputBorder: BRAND.theme.authInputBorder,
        inputBg: BRAND.theme.authInputBg,
        inputText: BRAND.theme.authInputText,
        link: BRAND.theme.authLink,
    },

    buttons: {
        login: BRAND.theme.btnLogin,
        action: BRAND.theme.btnAction,
    },

    // ✅ Home tokens (evita crash: UI.home.birthdayDotBg)
    home: {
        birthdayDotBg: BRAND.theme.homeBirthdayDotBg,
    },

    radius: {
        card: 18,
        input: 12,
        pill: 999,
    },
    spacing: {
        screenX: 22,
        headerH: 62,
        cardPad: 18,
    },
    shadow: {
        card: {
            shadowColor: '#fff',
            shadowOpacity: 0.35,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
        },
    },
} as const;

export const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: UI.colors.bg },

    header: {
        height: UI.spacing.headerH,
        backgroundColor: UI.brand.primary,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 14,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },

    headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },

    headerTitle: {
        color: UI.colors.white,
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.2,
    },

    body: {
        flex: 1,
        paddingHorizontal: UI.spacing.screenX,
        justifyContent: 'center',
    },

    card: {
        backgroundColor: `${UI.colors.card}B3`, // 70% transparência (hex + alpha)
        borderWidth: 1.5,
        borderColor: UI.brand.primary,
        borderRadius: UI.radius.card,
        padding: UI.spacing.cardPad,
    },

    title: {
        color: UI.colors.text,
        fontSize: 22,
        fontWeight: '600',
        marginBottom: 14,
    },

    subtitle: {
        color: UI.colors.textMuted,
        fontSize: 14,
        fontWeight: '400',
        textAlign: 'center',
    },

    messageError: { color: UI.colors.danger, marginTop: 12, fontSize: 13 },
    messageSuccess: { color: UI.colors.success, marginTop: 12, fontSize: 13 },

    dividerRow: {
        marginTop: 14,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: UI.colors.divider },
    dividerText: {
        color: UI.colors.textDim, // ✅ saiu do hardcode
        fontSize: 12,
        fontWeight: '700',
    },

    providerStack: { gap: 12 },

    providerBtnFull: {
        width: '100%',
        backgroundColor: UI.colors.white,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 10,
    },

    providerBtnFullText: {
        color: UI.brand.primaryText,
        fontSize: 15,
        fontWeight: '600',
    },

    iconBtnHeader: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: UI.colors.overlay12, // ✅ saiu do hardcode
        borderWidth: 1,
        borderColor: UI.auth.inputBorder, // ✅ reaproveita token
        position: 'relative',
    },

    avatarHeader: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.70)',
        backgroundColor: UI.colors.card,
    },

    /* ------------------------------------------------------------------
     * ✅ Novos globais (reutilizados em Home/Products)
     * ------------------------------------------------------------------ */

    // base do header escuro (sem altura fixa)
    stickyRowBase: {
        backgroundColor: UI.colors.bg,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },

    avatar42: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 2,
        borderColor: UI.brand.primary,
    },

    iconBtn42: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: UI.colors.overlay08,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
    },

    iconDot: {
        position: 'absolute',
        top: 10,
        right: 11,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: UI.brand.primary,
    },

    glassCard: {
        backgroundColor: UI.colors.overlay08,
        borderRadius: UI.radius.card,
        padding: 14,
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
    },

    pillPrimary: {
        backgroundColor: UI.brand.primary,
        borderRadius: UI.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },

    pillPrimaryText: {
        color: UI.colors.white,
        fontWeight: '800',
    },

    pillOutline: {
        borderRadius: UI.radius.pill,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: UI.colors.white,
    },

    pillOutlineText: {
        color: UI.brand.primaryText,
        fontWeight: '700',
    },
} as const);
