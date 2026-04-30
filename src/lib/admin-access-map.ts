// src/lib/admin-access-map.ts

export type AdminAccessLike = Partial<
    Record<
        | 'canAccessDashboard'
        | 'canAccessReports'
        | 'canAccessRides'
        | 'canAccessCategories'
        | 'canAccessReviews'
        | 'canAccessProducts'
        | 'canAccessPartners'
        | 'canAccessMembers'
        | 'canAccessFinance'
        | 'canAccessSettings'
        | 'canAccessCommunication'
        | 'canAccessFaq'
        | 'canAccessFaqReports',
        boolean
    >
>;

export type AdminMenuKey =
    | 'dashboard'
    | 'reports'
    | 'appointments'
    | 'categories'
    | 'reviews'
    | 'products'
    | 'partners'
    | 'clients'
    | 'communication'
    | 'finance'
    | 'settings'
    | 'faq'
    | 'faqReports';

const MENU_TO_ACCESS_FIELD: Record<
    AdminMenuKey,
    keyof Required<AdminAccessLike>
> = {
    dashboard: 'canAccessDashboard',
    reports: 'canAccessReports',
    appointments: 'canAccessRides',
    categories: 'canAccessCategories',
    reviews: 'canAccessReviews',
    products: 'canAccessProducts',
    partners: 'canAccessPartners',
    clients: 'canAccessMembers',
    communication: 'canAccessCommunication',
    finance: 'canAccessFinance',
    settings: 'canAccessSettings',
    faq: 'canAccessFaq',
    faqReports: 'canAccessFaqReports',
};

export function canAccess(
    adminAccess: AdminAccessLike | null | undefined,
    key: AdminMenuKey
): boolean {
    if (!adminAccess) return false;

    const field = MENU_TO_ACCESS_FIELD[key];
    return Boolean(adminAccess[field]);
}
