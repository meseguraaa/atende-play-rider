// src/app/api/internal/whatsapp/send-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    whatsappSendText,
    whatsappSendTemplate,
    normalizeWaPhone,
} from '@/lib/whatsapp-cloud';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function jsonOk(data: any = { ok: true }, status = 200) {
    return NextResponse.json(data, { status });
}

function getInternalSecret() {
    return String(process.env.INTERNAL_API_SECRET || '').trim();
}

function clean(v: string) {
    return String(v || '')
        .replace(/\s+/g, '')
        .trim();
}

function isAuthorized(req: NextRequest) {
    const secret = clean(getInternalSecret());
    if (!secret) return false;

    const raw = String(req.headers.get('x-internal-secret') || '');
    const got = clean(raw);

    console.log('[send-reminders][auth-clean]', {
        raw,
        got,
        expected: secret,
    });

    return !!got && got === secret;
}

/**
 * Pega "agora" em São Paulo como componentes numéricos.
 */
function getNowSaoPauloParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23', // ✅ garante 00-23 (evita 24:00)
    }).formatToParts(new Date());

    const get = (t: string) =>
        Number(parts.find((p) => p.type === t)?.value ?? '0');

    const hhRaw = get('hour');
    const hh = hhRaw === 24 ? 0 : hhRaw; // ✅ fallback extra (blindagem)

    return {
        y: get('year'),
        m: get('month'),
        d: get('day'),
        hh,
        mm: get('minute'),
    };
}

/**
 * Constrói um Date UTC a partir de uma data/hora em São Paulo,
 * usando offset fixo UTC-03 (SP = UTC-03).
 */

const SAO_PAULO_UTC_OFFSET_HOURS = -3; // SP = UTC-03

function buildUtcFromSp(parts: {
    y: number;
    m: number;
    d: number;
    hh: number;
    mm: number;
}) {
    // Converte "hora em SP" -> Date UTC
    // Ex: 08:00 SP == 11:00 UTC  (por isso somamos 3)
    return new Date(
        Date.UTC(
            parts.y,
            parts.m - 1,
            parts.d,
            parts.hh - SAO_PAULO_UTC_OFFSET_HOURS, // --3 => +3
            parts.mm,
            0,
            0
        )
    );
}

/**
 * Soma minutos em uma data SP (com base em UTC "meio-dia" para evitar bugs).
 * Aqui vamos usar uma conversão simples: pegamos um UTC equivalente e somamos.
 */
function addMinutesUtc(dt: Date, minutes: number) {
    return new Date(dt.getTime() + minutes * 60_000);
}

function getSpPartsFromUtc(dtUtc: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23',
    }).formatToParts(dtUtc);

    const get = (t: string) =>
        Number(parts.find((p) => p.type === t)?.value ?? '0');

    const hhRaw = get('hour');
    const hh = hhRaw === 24 ? 0 : hhRaw;

    return {
        y: get('year'),
        m: get('month'),
        d: get('day'),
        hh,
        mm: get('minute'),
    };
}

function normalizeSlotInterval(v: unknown): 15 | 30 | 45 | 60 {
    const n = Number(v);
    if (n === 15 || n === 30 || n === 45 || n === 60) return n;
    return 30;
}

function normalizeReminderLeadHours(v: unknown): number {
    const n = Number(v);

    if (!Number.isFinite(n)) return 24;

    const int = Math.trunc(n);

    if (int < 1) return 24;
    if (int > 168) return 168;

    return int;
}

function getReminderWindowStartUtc(scheduleAtUtc: Date, leadHours: number) {
    return new Date(scheduleAtUtc.getTime() - leadHours * 60 * 60 * 1000);
}

function applyEarliestSendHourSp(dtUtc: Date, earliestHourSp = 8): Date {
    const sp = getSpPartsFromUtc(dtUtc);

    if (sp.hh >= earliestHourSp) {
        return dtUtc;
    }

    return buildUtcFromSp({
        y: sp.y,
        m: sp.m,
        d: sp.d,
        hh: earliestHourSp,
        mm: 0,
    });
}

function shouldSendReminderNow(input: {
    nowUtc: Date;
    scheduleAtUtc: Date;
    slotIntervalMinutes: number;
    reminderLeadHours: number;
}) {
    const slotMinutes = normalizeSlotInterval(input.slotIntervalMinutes);
    const leadHours = normalizeReminderLeadHours(input.reminderLeadHours);

    const theoreticalReminderStartUtc = getReminderWindowStartUtc(
        input.scheduleAtUtc,
        leadHours
    );

    const effectiveReminderStartUtc = applyEarliestSendHourSp(
        theoreticalReminderStartUtc,
        8
    );

    const effectiveReminderEndUtc = addMinutesUtc(
        effectiveReminderStartUtc,
        slotMinutes
    );

    const shouldSend =
        input.nowUtc >= effectiveReminderStartUtc &&
        input.nowUtc < effectiveReminderEndUtc;

    return {
        shouldSend,
        slotMinutes,
        leadHours,
        theoreticalReminderStartUtc,
        effectiveReminderStartUtc,
        effectiveReminderEndUtc,
    };
}

/**
 * Formata data/hora em SP pra mensagem.
 */
function formatSpDateTime(dtUtc: Date) {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(dtUtc);

    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
}

function formatCancelFeePercentage(v: unknown) {
    const n = Number(v);

    if (!Number.isFinite(n)) return '0%';

    const isInt = Number.isInteger(n);
    return `${isInt ? String(n) : n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

function buildCancellationWarningText(input: {
    cancelLimitHours: unknown;
    cancelFeePercentage: unknown;
}) {
    const hours = Math.max(1, Math.trunc(Number(input.cancelLimitHours) || 0));
    const hoursLabel = hours === 1 ? '1 hora' : `${hours} horas`;
    const feeLabel = formatCancelFeePercentage(input.cancelFeePercentage);

    return `Caso precise cancelar, pedimos que avise com pelo menos *${hoursLabel}* de antecedência. Cancelamentos com menos tempo podem gerar uma taxa de *${feeLabel}* sobre o valor do serviço agendado.`;
}

export async function POST(req: NextRequest) {
    console.log('[send-reminders][auth]', {
        got: String(req.headers.get('x-internal-secret') || ''),
        expected: String(process.env.INTERNAL_API_SECRET || ''),
    });

    if (!isAuthorized(req)) {
        return jsonOk({ ok: false, error: 'unauthorized' }, 401);
    }

    const nowSp = getNowSaoPauloParts();

    // ✅ trava antes das 08:00 SP
    if (nowSp.hh < 8) {
        return jsonOk({
            ok: true,
            skipped: true,
            reason: 'before 08:00 SP',
            nowSp,
        });
    }

    const nowUtc = new Date();

    // Buscamos candidatos em uma janela ampla.
    // Como reminderLeadHours vai até 168h e o maior slot é 60min,
    // trazer ~8 dias à frente cobre a regra toda com folga.
    const candidateWindowEndUtc = addMinutesUtc(nowUtc, 8 * 24 * 60);

    const appts = await prisma.appointment.findMany({
        where: {
            status: 'PENDING',
            confirmationStatus: 'PENDING',
            reminderSentAt: null,
            scheduleAt: {
                gte: nowUtc,
                lte: candidateWindowEndUtc,
            },
        },
        select: {
            id: true,
            phone: true,
            clientName: true,
            scheduleAt: true,
            company: {
                select: {
                    name: true,
                },
            },
            companyId: true,

            locationType: true,

            clientAddress: {
                select: {
                    label: true,
                },
            },

            unit: {
                select: {
                    name: true,
                    slotIntervalMinutes: true,
                    reminderLeadHours: true,
                },
            },
            professional: { select: { name: true } },
            service: {
                select: {
                    name: true,
                    cancelLimitHours: true,
                    cancelFeePercentage: true,
                },
            },
        },
        take: 300,
    });

    console.log('[REMINDERS] found candidate appointments:', appts.length);
    console.log('[REMINDERS] nowSp:', nowSp);

    let sent = 0;
    let failed = 0;
    let eligible = 0;
    let skippedByWindow = 0;

    for (const a of appts) {
        const reminderCheck = shouldSendReminderNow({
            nowUtc,
            scheduleAtUtc: a.scheduleAt,
            slotIntervalMinutes: a.unit?.slotIntervalMinutes,
            reminderLeadHours: a.unit?.reminderLeadHours,
        });

        if (!reminderCheck.shouldSend) {
            skippedByWindow++;
            continue;
        }

        eligible++;

        console.log('[REMINDERS] processing appointment:', {
            id: a.id,
            phone: a.phone,
            scheduleAt: a.scheduleAt,
            slotIntervalMinutes: reminderCheck.slotMinutes,
            reminderLeadHours: reminderCheck.leadHours,
            theoreticalReminderStartUtc:
                reminderCheck.theoreticalReminderStartUtc,
            effectiveReminderStartUtc: reminderCheck.effectiveReminderStartUtc,
            effectiveReminderEndUtc: reminderCheck.effectiveReminderEndUtc,
        });

        const to = normalizeWaPhone(a.phone || '');
        if (!to) {
            console.log('[REMINDERS] invalid phone:', a.phone);
            failed++;
            continue;
        }

        const when = formatSpDateTime(a.scheduleAt);

        const locationText =
            a.locationType === 'CLIENT_ADDRESS'
                ? a.clientAddress?.label
                    ? (() => {
                          const label = a.clientAddress.label.trim();

                          const lower = label.toLowerCase();

                          const isFeminine =
                              lower.startsWith('casa') ||
                              lower.startsWith('resid') ||
                              lower.startsWith('clínica') ||
                              lower.startsWith('clinica') ||
                              lower.startsWith('loja');

                          const article = isFeminine ? 'na' : 'no';

                          return ` ${article} *${label}*`;
                      })()
                    : ''
                : a.unit?.name
                  ? ` na *${a.unit.name}*`
                  : '';

        const svc = a.service?.name ? `*${a.service.name}*` : 'seu serviço';
        const pro = a.professional?.name ? ` com *${a.professional.name}*` : '';
        const cancellationWarning = buildCancellationWarningText({
            cancelLimitHours: a.service?.cancelLimitHours,
            cancelFeePercentage: a.service?.cancelFeePercentage,
        });

        const templateName = 'appointment_confirmation';

        const templateVariables = [
            String(a.clientName || 'cliente'), // {{1}}
            when, // {{2}}
            locationText.replace(/\*/g, '').replace(/\s+/g, ' ').trim(), // {{3}}
            a.service?.name || 'serviço', // {{4}}
            a.professional?.name ? ` com ${a.professional.name}` : '', // {{5}}
            cancellationWarning.replace(/\*/g, ''), // {{6}}
            a.company?.name?.trim() || 'AtendePlay', // {{7}}
        ];

        console.log('[REMINDERS][TEMPLATE PREVIEW]', {
            appointmentId: a.id,
            templateName,
            templateVariables,
        });

        const text = [
            '⏰ *Lembrete de agendamento*',
            '',
            `${String(a.clientName || 'Olá')}, seu horário é *${when}*${locationText}.`,
            `Serviço: ${svc}${pro}.`,
            '',
            cancellationWarning,
            '',
            '📌 *Confirme sua presença:*',
            'Digite *1* para *CONFIRMAR* ✅',
            'Digite *3* para *CANCELAR* ❌',
            '',
            'Se precisar reagendar, responda *menu* e escolha a opção.',
        ].join('\n');

        const channel = await prisma.whatsappChannel.findFirst({
            where: { companyId: a.companyId, isActive: true },
            select: { id: true, defaultUnitId: true },
        });

        if (!channel?.id) {
            console.log('[REMINDERS] no active channel for company:', {
                appointmentId: a.id,
                companyId: a.companyId,
            });
            failed++;
            continue;
        }

        const now = new Date();
        const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h pra confirmar
        const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

        // ✅ arma a confirmação ANTES de enviar a mensagem
        await prisma.whatsappSession.upsert({
            where: {
                channelId_fromPhone: {
                    channelId: channel.id,
                    fromPhone: to,
                },
            },
            create: {
                channelId: channel.id,
                companyId: a.companyId,
                fromPhone: to,
                stage: 'CONFIRM_APPOINTMENT',
                unitId: channel.defaultUnitId ?? null,
                expiresAt,
                payload: {
                    companyId: a.companyId,
                    confirmStage: 'APPT_CONFIRMATION',
                    confirmAppointmentId: a.id,
                    lastInboundText: null,
                    lastInboundAt: now.toISOString(),
                },
            },
            update: {
                companyId: a.companyId,
                stage: 'CONFIRM_APPOINTMENT',
                expiresAt,
                payload: {
                    companyId: a.companyId,
                    confirmStage: 'APPT_CONFIRMATION',
                    confirmAppointmentId: a.id,
                    lastInboundText: null,
                    lastInboundAt: now.toISOString(),
                },
            },
            select: { id: true },
        });

        const res = await whatsappSendTemplate({
            to,
            templateName,
            languageCode: 'pt_BR',
            variables: templateVariables,
        });

        console.log('[REMINDERS][TEMPLATE] send result:', {
            appointmentId: a.id,
            to,
            templateName,
            templateVariables,
            ok: res.ok,
            error: res.ok ? null : res.error,
            status: res.ok ? null : res.status,
            raw: res.raw ?? null,
        });

        if (res.ok) {
            sent++;

            await prisma.appointment.update({
                where: { id: a.id },
                data: { reminderSentAt: now },
                select: { id: true },
            });
        } else {
            failed++;

            await prisma.whatsappSession.deleteMany({
                where: {
                    channelId: channel.id,
                    fromPhone: to,
                    stage: 'CONFIRM_APPOINTMENT',
                },
            });
        }
    }

    console.log('[REMINDERS] summary:', {
        foundCandidates: appts.length,
        eligible,
        skippedByWindow,
        sent,
        failed,
        nowUtc,
        nowSp,
    });

    return jsonOk({
        ok: true,
        nowSp,
        foundCandidates: appts.length,
        eligible,
        skippedByWindow,
        sent,
        failed,
    });
}
