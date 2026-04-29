import { prisma } from '@/lib/prisma';

type SendPushToUsersParams = {
    companyId?: string;
    userIds: string[];
    title: string;
    body: string;
    communicationLogId?: string | null;
};

type SendPushToUsersResult = {
    ok: boolean;
    totalUsers: number;
    totalDevices: number;
    totalSent: number;
    totalFailed: number;
    tokens: string[];
    errors?: string[];
    raw?: unknown;
};

function normalizeString(value: unknown) {
    return String(value ?? '').trim();
}

function isExpoPushToken(token: string) {
    return /^ExponentPushToken\[[A-Za-z0-9-_]+\]$/.test(token);
}

function groupTokensByProjectSlug(
    devices: Array<{
        deviceToken: string;
        projectSlug: string | null;
    }>
) {
    const groups = new Map<string, string[]>();

    for (const device of devices) {
        const projectSlug = normalizeString(device.projectSlug);
        const token = normalizeString(device.deviceToken);

        if (!projectSlug || !token) continue;
        if (!isExpoPushToken(token)) continue;

        const arr = groups.get(projectSlug) ?? [];
        arr.push(token);
        groups.set(projectSlug, arr);
    }

    return groups;
}

async function safeReadJson(res: Response) {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

export async function sendPushToUsers(
    params: SendPushToUsersParams
): Promise<SendPushToUsersResult> {
    console.log('[push] sendPushToUsers called', {
        at: new Date().toISOString(),
        companyId: params.companyId ?? null,
        userIds: params.userIds,
        title: params.title,
        bodyLength: String(params.body ?? '').length,
        communicationLogId: params.communicationLogId ?? null,
    });

    const companyId = normalizeString(params.companyId);
    const title = normalizeString(params.title);
    const body = normalizeString(params.body);
    const communicationLogId = normalizeString(params.communicationLogId);

    if (!title) {
        throw new Error('push_title_required');
    }

    if (!body) {
        throw new Error('push_body_required');
    }

    const uniqueUserIds = Array.from(
        new Set((params.userIds || []).map(normalizeString).filter(Boolean))
    );

    if (uniqueUserIds.length === 0) {
        return {
            ok: true,
            totalUsers: 0,
            totalDevices: 0,
            totalSent: 0,
            totalFailed: 0,
            tokens: [],
            errors: [],
            raw: null,
        };
    }

    const notificationIdByUserId = new Map<string, string>();

    if (companyId) {
        try {
            const createdNotifications = await Promise.all(
                uniqueUserIds.map((userId) =>
                    prisma.appNotification.create({
                        data: {
                            companyId,
                            userId,
                            communicationLogId: communicationLogId || null,
                            type: 'PUSH_MESSAGE',
                            title,
                            message: body,
                        },
                        select: {
                            id: true,
                            userId: true,
                        },
                    })
                )
            );

            for (const notification of createdNotifications) {
                notificationIdByUserId.set(
                    String(notification.userId),
                    String(notification.id)
                );
            }

            console.log('[push] app notifications persisted', {
                at: new Date().toISOString(),
                companyId,
                totalUsers: uniqueUserIds.length,
                totalNotifications: createdNotifications.length,
            });
        } catch (error: any) {
            console.log('[push] app notifications persist:error', {
                at: new Date().toISOString(),
                companyId,
                message: error?.message || String(error),
            });
        }
    } else {
        console.log('[push] app notifications skipped:missing_companyId', {
            at: new Date().toISOString(),
            totalUsers: uniqueUserIds.length,
        });
    }

    const devices = await prisma.pushDevice.findMany({
        where: {
            userId: { in: uniqueUserIds },
            isActive: true,
            projectSlug: {
                not: null,
            },
        },
        select: {
            id: true,
            userId: true,
            deviceToken: true,
            platform: true,
            projectSlug: true,
        },
    });

    const grouped = groupTokensByProjectSlug(
        devices.map((device) => ({
            deviceToken: device.deviceToken,
            projectSlug: device.projectSlug,
        }))
    );

    const allTokens = Array.from(
        new Set(
            devices
                .map((device) => normalizeString(device.deviceToken))
                .filter(Boolean)
                .filter(isExpoPushToken)
        )
    );

    if (allTokens.length === 0 || grouped.size === 0) {
        return {
            ok: false,
            totalUsers: uniqueUserIds.length,
            totalDevices: 0,
            totalSent: 0,
            totalFailed: 0,
            tokens: [],
            errors: ['no_active_push_devices'],
            raw: null,
        };
    }

    let totalSent = 0;
    let totalFailed = 0;
    const errorMessages: string[] = [];
    const rawResponses: Array<{
        projectSlug: string;
        raw: unknown;
        status: number;
        ok: boolean;
    }> = [];

    for (const [projectSlug, groupedTokens] of grouped.entries()) {
        const tokens = Array.from(new Set(groupedTokens));

        if (tokens.length === 0) continue;

        const projectDevices = devices.filter(
            (device) =>
                normalizeString(device.projectSlug) === projectSlug &&
                tokens.includes(normalizeString(device.deviceToken))
        );

        const messages = projectDevices
            .map((device) => {
                const token = normalizeString(device.deviceToken);
                const userId = normalizeString(device.userId);
                const notificationId = notificationIdByUserId.get(userId);

                if (!token) return null;

                return {
                    to: token,
                    sound: 'default',
                    title,
                    body,
                    data: {
                        type: 'app_notification',
                        notificationType: 'PUSH_MESSAGE',
                        notificationId: notificationId || null,
                    },
                };
            })
            .filter(Boolean);

        let response: Response;
        let raw: unknown = null;

        try {
            console.log('[push] expo fetch:start', {
                at: new Date().toISOString(),
                projectSlug,
                totalMessages: messages.length,
                tokens,
                notificationIds: messages.map(
                    (m: any) => m?.data?.notificationId
                ),
            });

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            try {
                response = await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify(messages),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeout);
            }

            console.log('[push] expo fetch:done', {
                at: new Date().toISOString(),
                projectSlug,
                status: response.status,
                ok: response.ok,
            });

            raw = await safeReadJson(response);
        } catch (error: any) {
            console.log('[push] expo fetch:error', {
                at: new Date().toISOString(),
                projectSlug,
                message: error?.message || String(error),
                name: error?.name || null,
            });

            totalFailed += tokens.length;
            errorMessages.push(error?.message || 'expo_fetch_failed');
            rawResponses.push({
                projectSlug,
                raw: null,
                status: 0,
                ok: false,
            });
            continue;
        }

        rawResponses.push({
            projectSlug,
            raw,
            status: response.status,
            ok: response.ok,
        });

        if (!response.ok) {
            console.log(
                '[push] expo raw response error',
                JSON.stringify({ projectSlug, raw }, null, 2)
            );

            totalFailed += tokens.length;

            const message = normalizeString(
                (raw as any)?.errors?.[0]?.message ||
                    (raw as any)?.error ||
                    `expo_push_http_${response.status}`
            );

            if (message) {
                errorMessages.push(message);
            }

            continue;
        }

        const dataItems = Array.isArray((raw as any)?.data)
            ? (raw as any).data
            : [];
        const errors = Array.isArray((raw as any)?.errors)
            ? (raw as any).errors
            : [];

        for (const item of dataItems) {
            const status = normalizeString(item?.status);

            if (status === 'ok') {
                totalSent += 1;
                continue;
            }

            totalFailed += 1;

            const message = normalizeString(
                item?.message || item?.details?.error || 'expo_push_send_failed'
            );

            if (message) {
                errorMessages.push(message);
            }
        }

        for (const err of errors) {
            const message = normalizeString(
                err?.message || err?.details?.error || 'expo_push_request_error'
            );

            if (message) {
                errorMessages.push(message);
            }
        }

        console.log(
            '[push] expo raw response',
            JSON.stringify({ projectSlug, raw }, null, 2)
        );
    }

    return {
        ok: totalSent > 0 && totalFailed === 0,
        totalUsers: uniqueUserIds.length,
        totalDevices: allTokens.length,
        totalSent,
        totalFailed,
        tokens: allTokens,
        errors: Array.from(new Set(errorMessages)),
        raw: rawResponses,
    };
}
