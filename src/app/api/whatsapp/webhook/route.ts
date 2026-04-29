// src/app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { whatsappSendText, normalizeWaPhone } from '@/lib/whatsapp-cloud';
import { handleAppointmentInvite } from '@/lib/whatsapp/send-appointment-invite';
import {
    clearFaqPayload,
    createFaqEvent,
    getFaqAnswer,
    isBackCommand,
    isFaqEntryCommand,
    listFaqCategories,
    listFaqQuestions,
    renderFaqAnswer,
    renderFaqCategories,
    renderFaqEmpty,
    renderFaqQuestions,
} from '@/lib/whatsapp/faq-flow';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function jsonOk(data: any = { ok: true }, status = 200) {
    return NextResponse.json(data, { status });
}

function textOk(text: string, status = 200) {
    return new NextResponse(text, {
        status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}

function getVerifyToken() {
    return process.env.WHATSAPP_VERIFY_TOKEN || '';
}

function normalizeInboundText(input: string) {
    return (input || '').trim();
}

function normalizeInboundChoice(input: string) {
    const t = normalizeInboundText(input).toLowerCase();
    const cleaned = t.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
    return cleaned;
}

function isMenuCommand(cleaned: string) {
    return ['menu', '0', 'inicio', 'início', 'start'].includes(cleaned);
}

function isNumericChoice(cleaned: string) {
    return /^\d+$/.test(cleaned);
}

function renderMenu() {
    return [
        '👋 Oi! Como posso te ajudar?',
        '',
        '1) Agendar',
        '2) Reagendar',
        '3) Cancelar',
        '4) Tire suas dúvidas',
        '',
        'Responda com o número da opção. (Digite “menu” a qualquer momento)',
    ].join('\n');
}

function renderUnknown() {
    return [
        'Não entendi 😅',
        '',
        'Responda com uma opção:',
        '1) Agendar',
        '2) Reagendar',
        '3) Cancelar',
        '4) Tire suas dúvidas',
        '',
        'Ou digite “menu”.',
    ].join('\n');
}

function renderStartReschedule() {
    return [
        'Certo! Vamos reagendar. 🔁',
        '',
        'Me diga qual agendamento você quer reagendar.',
        '(No MVP, já já eu te mostro uma lista para escolher.)',
    ].join('\n');
}

function renderStartCancel() {
    return [
        'Entendi. Vamos cancelar. 🧾',
        '',
        'Me diga qual agendamento você quer cancelar.',
        '(No MVP, já já eu te mostro uma lista para escolher.)',
    ].join('\n');
}

function renderList(title: string, items: Array<{ label: string }>): string {
    const lines: string[] = [title, ''];
    items.forEach((it, idx) => {
        lines.push(`${idx + 1}) ${it.label}`);
    });
    lines.push('');
    lines.push('Responda com o número');
    lines.push('(Digite “menu” para voltar)');
    return lines.join('\n');
}

function renderServiceList(
    title: string,
    items: Array<{ label: string }>
): string {
    const lines: string[] = [title, ''];

    items.forEach((it, idx) => {
        lines.push(`${idx + 1}) ${it.label}`);

        // linha em branco entre os serviços
        if (idx < items.length - 1) {
            lines.push('');
        }
    });

    lines.push('');
    lines.push('Responda com o número');
    lines.push('(Digite “menu” para voltar)');
    return lines.join('\n');
}

function formatBRLFromDecimalString(value: string) {
    const n = Number(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(n)) return 'R$ —';

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(n);
}

function compactWhitespace(s: string) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncateWhatsAppText(s: string, max = 90) {
    const t = compactWhitespace(s);
    if (!t) return '';
    if (t.length <= max) return t;
    return t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function renderClientNotFoundAndMenu() {
    // Mantém o fluxo vivo: volta para MENU, sem “travar” em DONE
    return [
        'Quase lá ✅',
        '',
        'Infelizmente não encontrei seus dados com esse telefone.',
        '',
        'Voltando pro menu 👇',
        '',
        renderMenu(),
    ].join('\n');
}

function renderSignupOffer() {
    return [
        '📌 Não encontrei seu cadastro com esse telefone.',
        '',
        'Quer criar agora por aqui?',
        '',
        '1) Sim, criar meu cadastro',
        '2) Não, voltar pro menu',
        '',
        '(Digite “menu” para voltar)',
    ].join('\n');
}

function isValidEmailSimple(email: string) {
    const e = String(email || '')
        .trim()
        .toLowerCase();
    if (!e) return false;
    // simples e eficiente pro WhatsApp (sem exagero)
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function normalizePhoneToWaId(input: string) {
    const d = digitsOnly(input);

    // BR:
    // - 10/11 dígitos -> adiciona 55
    // - 12/13 dígitos começando com 55 -> ok
    // Retorna SEM "+" no formato que você já usa (ex: "5511999999999")
    if (!d) return null;

    if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) {
        return `55${d}`;
    }

    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
        return d;
    }

    // alguns usuários digitam com +55, já vira digitsOnly e cai acima
    return null;
}

function parseBirthdateBR(
    input: string
): { ok: true; iso: string } | { ok: false } {
    const raw = String(input || '')
        .trim()
        .replace(/\s+/g, '');

    // aceita 5/5/1980 e 05/05/1980
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return { ok: false };

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);

    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy))
        return { ok: false };

    if (yyyy < 1900 || yyyy > 2100) return { ok: false };
    if (mm < 1 || mm > 12) return { ok: false };
    if (dd < 1 || dd > 31) return { ok: false };

    // valida dia do mês (ex: 31/02 cai fora)
    const dt = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0, 0));
    const y = dt.getUTCFullYear();
    const mo = dt.getUTCMonth() + 1;
    const da = dt.getUTCDate();

    if (y !== yyyy || mo !== mm || da !== dd) return { ok: false };

    // não permitir futuro (compara datas UTC do “meio-dia” para não dar bug de fuso)
    const now = new Date();
    if (dt.getTime() > now.getTime()) return { ok: false };

    const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(
        2,
        '0'
    )}-${String(dd).padStart(2, '0')}`;

    return { ok: true, iso };
}

async function listActiveCompaniesForSignup() {
    const companies = await prisma.company.findMany({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true },
    });

    return companies.map((c) => ({ id: c.id, label: c.name }));
}

async function ensureClientMembership(args: {
    companyId: string;
    name: string;
    email: string;
    phone: string;
    birthdayIso: string | null;
}) {
    const { companyId, name, email, phone, birthdayIso } = args;

    // tenta achar user por email primeiro (seu fluxo pede email obrigatório)
    let user = await prisma.user.findFirst({
        where: { email: email.toLowerCase().trim() },
        select: { id: true },
    });

    if (!user) {
        // tenta achar por telefone (digits)
        const variants = phoneDigitVariants(phone);
        const rows = await prisma.$queryRaw<Array<{ id: string }>>`
            select u.id as id
            from "User" u
            where u."isActive" = true
              and regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') = any(${variants}::text[])
            limit 1
        `;
        if (rows?.[0]?.id) user = { id: String(rows[0].id) };
    }

    const userId =
        user?.id ??
        (
            await prisma.user.create({
                data: {
                    name: name.trim(),
                    email: email.toLowerCase().trim(),
                    phone,
                    birthday: birthdayIso
                        ? new Date(`${birthdayIso}T00:00:00.000Z`)
                        : null,
                    isActive: true,
                } as any,
                select: { id: true },
            })
        ).id;

    // cria/reativa membership CLIENT
    const existing = await prisma.companyMember.findFirst({
        where: { companyId, userId },
        select: { id: true, isActive: true, role: true },
    });

    if (!existing) {
        await prisma.companyMember.create({
            data: {
                companyId,
                userId,
                role: 'CLIENT',
                isActive: true,
            } as any,
            select: { id: true },
        });
    } else {
        await prisma.companyMember.update({
            where: { id: existing.id },
            data: {
                role: 'CLIENT',
                isActive: true,
            } as any,
            select: { id: true },
        });
    }

    return userId;
}

function renderAppointmentConfirmationPrompt(args: {
    when: string;
    serviceLabel?: string | null;
    professionalLabel?: string | null;
    unitLabel?: string | null;
}) {
    const details: string[] = [];
    if (args.serviceLabel) details.push(`Serviço: *${args.serviceLabel}*`);
    if (args.professionalLabel)
        details.push(`Profissional: *${args.professionalLabel}*`);
    if (args.unitLabel) details.push(`Unidade: *${args.unitLabel}*`);

    return [
        '📌 Confirme seu agendamento:',
        '',
        `Quando: *${args.when}*`,
        ...(details.length ? [''] : []),
        ...details,
        '',
        'Digite *1* para *CONFIRMAR* ✅',
        'Digite *3* para *CANCELAR* ❌',
        '',
        '(Digite “menu” para voltar)',
    ].join('\n');
}

function renderSignupReview(payload: any) {
    const companyLabel = String(payload?.signupCompanyLabel ?? 'Empresa');
    const name = String(payload?.signupName ?? '').trim();
    const email = String(payload?.signupEmail ?? '').trim();
    const phone = String(payload?.signupPhone ?? '').trim();
    const birth = String(payload?.signupBirthdate ?? '').trim();

    return [
        '✅ Revisão do cadastro:',
        '',
        `Empresa: *${companyLabel}*`,
        `Nome: *${name || '—'}*`,
        `Email: *${email || '—'}*`,
        `Telefone: *${phone ? maskPhoneDigits(phone) : '—'}*`,
        `Nascimento: *${birth ? birth : '—'}*`,
        '',
        'Digite *1* para *CONFIRMAR E CRIAR*',
        'Digite *2* para *CANCELAR* e voltar pro menu',
        '',
        '(Digite “menu” para voltar)',
    ].join('\n');
}

// 🔎 log controlado (não vaza token)
function logSendFailure(ctx: {
    phoneNumberId: string;
    fromPhone: string;
    stage: string;
    error?: string;
    status?: number;
    fbCode?: number;
}) {
    console.error('[whatsapp][send_failed]', {
        phoneNumberId: ctx.phoneNumberId,
        to: ctx.fromPhone,
        stage: ctx.stage,
        status: ctx.status,
        fbCode: ctx.fbCode,
        error: ctx.error,
    });
}

type LastListPayload =
    | {
          type: 'UNIT';
          items: Array<{ id: string; label: string }>;
      }
    | {
          type: 'COMPANY';
          items: Array<{ id: string; label: string }>;
      }
    | {
          type: 'PROFESSIONAL';
          items: Array<{ id: string; label: string }>;
      }
    | {
          type: 'CATEGORY';
          items: Array<{ id: string; label: string }>;
      }
    | {
          type: 'SERVICE';
          items: Array<{
              id: string;
              label: string;
              name: string;
              durationMinutes: number;
              priceLabel: string; // ex: "R$ 49,90"
              description: string | null;
          }>;
      }
    | {
          type: 'DAY';
          items: Array<{ id: string; label: string; dateStr: string }>;
      }
    | {
          type: 'TIME';
          items: Array<{ id: string; label: string; time: string }>;
      }
    | {
          type: 'APPOINTMENT';
          items: Array<{
              id: string;
              label: string;
              unitId: string;
              unitLabel: string;
              professionalId: string;
              professionalLabel: string;
              serviceId: string;
              serviceLabel: string;
              scheduleAtIso: string;
          }>;
      }
    | {
          type: 'FAQ_CATEGORY';
          items: Array<{ id: string; label: string }>;
      }
    | {
          type: 'FAQ_QUESTION';
          items: Array<{ id: string; label: string }>;
      };

function pickFromLastList(args: {
    cleaned: string;
    lastList: LastListPayload | null;
}): { ok: true; id: string; meta?: any } | { ok: false } {
    const { cleaned, lastList } = args;
    if (!lastList) return { ok: false };

    if (isNumericChoice(cleaned)) {
        const n = Number(cleaned);
        if (!Number.isFinite(n) || n <= 0) return { ok: false };
        const idx = n - 1;

        const item: any = (lastList as any).items?.[idx];
        if (!item?.id) return { ok: false };
        return { ok: true, id: String(item.id), meta: item };
    }

    const q = cleaned.trim().toLowerCase();
    if (!q) return { ok: false };

    const items: any[] = (lastList as any).items ?? [];
    const found =
        items.find((it) => String(it.label ?? '').toLowerCase() === q) ??
        items.find((it) =>
            String(it.label ?? '')
                .toLowerCase()
                .includes(q)
        );

    if (!found?.id) return { ok: false };
    return { ok: true, id: String(found.id), meta: found };
}

async function listUnits(companyId: string) {
    const units = await prisma.unit.findMany({
        where: { companyId, isActive: true },
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true },
    });

    return units.map((u) => ({
        id: u.id,
        label: u.name,
    }));
}

async function listProfessionals(companyId: string, unitId: string) {
    const profs = await prisma.professional.findMany({
        where: {
            companyId,
            isActive: true,
            units: {
                some: {
                    unitId,
                    isActive: true,
                },
            },
        },
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true },
    });

    return profs.map((p) => ({
        id: p.id,
        label: p.name,
    }));
}

async function listCategories(companyId: string, unitId: string) {
    const categories = await prisma.category.findMany({
        where: {
            companyId,
            isActive: true,
            showInServices: true,
            serviceLinks: {
                some: {
                    service: {
                        isActive: true,
                        OR: [{ unitId }, { unitId: null }],
                    },
                },
            },
        },
        orderBy: [{ name: 'asc' }],
        select: {
            id: true,
            name: true,
        },
    });

    return categories.map((c) => ({
        id: c.id,
        label: c.name,
    }));
}

async function listServices(
    companyId: string,
    unitId: string,
    categoryId: string
) {
    const services = await prisma.service.findMany({
        where: {
            companyId,
            isActive: true,
            OR: [{ unitId }, { unitId: null }],
            categories: {
                some: {
                    categoryId,
                },
            },
        },
        orderBy: [{ name: 'asc' }],
        select: {
            id: true,
            name: true,
            durationMinutes: true,
            price: true,
            description: true,
        },
    });

    return services.map((s) => {
        const duration =
            typeof s.durationMinutes === 'number' &&
            Number.isFinite(s.durationMinutes)
                ? s.durationMinutes
                : 30;

        const priceLabel = formatBRLFromDecimalString(
            s.price?.toString?.() ?? ''
        );

        const desc = s.description
            ? compactWhitespace(String(s.description))
            : null;
        const descShort = desc ? truncateWhatsAppText(desc, 90) : '';

        const label =
            `${s.name} (${duration} min) - ${priceLabel}` +
            (descShort ? `\n${descShort}` : '');

        return {
            id: s.id,
            label,
            name: s.name,
            durationMinutes: duration,
            priceLabel,
            description: desc,
        };
    });
}

/* ===========================
 * ✅ Helpers de data/semana BR
 * =========================== */

function parseDateParam(
    dateStr?: string
): { y: number; m: number; d: number } | null {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    return { y, m, d };
}

function formatDateBR(dateStr: string) {
    const ymd = parseDateParam(dateStr);
    if (!ymd) return dateStr;
    const dd = String(ymd.d).padStart(2, '0');
    const mm = String(ymd.m).padStart(2, '0');
    return `${dd}/${mm}/${ymd.y}`;
}

function weekdayShortPt(dateStr: string) {
    const ymd = parseDateParam(dateStr);
    if (!ymd) return '';
    const utcMidday = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12, 0, 0, 0));

    const wd = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
    }).format(utcMidday);

    return String(wd).replace('.', '').trim().toLowerCase();
}

const SAO_PAULO_UTC_OFFSET_HOURS = 3; // SP = UTC-03

function buildScheduleAtUtcFromDateAndTime(dateStr: string, timeHHmm: string) {
    const ymd = parseDateParam(dateStr);
    if (!ymd) return null;

    const [hh, mm] = String(timeHHmm || '')
        .split(':')
        .map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

    return new Date(
        Date.UTC(
            ymd.y,
            ymd.m - 1,
            ymd.d,
            hh + SAO_PAULO_UTC_OFFSET_HOURS,
            mm,
            0,
            0
        )
    );
}

function formatDateTimeBRFromUtc(dt: Date) {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(dt);

    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get(
        'minute'
    )}`;
}

/* ==========================================
 * ✅ Cliente por telefone (robusto + SQL)
 * ========================================== */

function digitsOnly(s: string) {
    return String(s || '').replace(/\D+/g, '');
}

function maskPhoneDigits(d: string) {
    const x = digitsOnly(d);
    if (!x) return '';
    return `***${x.slice(-4)}`;
}

function phoneDigitVariants(fromPhone: string) {
    const rawDigits = digitsOnly(fromPhone);
    const set = new Set<string>();
    if (rawDigits) set.add(rawDigits);

    // veio com 55 → adiciona sem 55
    if (rawDigits.startsWith('55') && rawDigits.length >= 12) {
        set.add(rawDigits.slice(2));
    }

    // veio sem 55 (DDD+numero) → adiciona com 55
    if (
        !rawDigits.startsWith('55') &&
        (rawDigits.length === 10 || rawDigits.length === 11)
    ) {
        set.add(`55${rawDigits}`);
    }

    const noLeadingZeros = rawDigits.replace(/^0+/, '');
    if (noLeadingZeros && noLeadingZeros !== rawDigits) {
        set.add(noLeadingZeros);
    }

    return Array.from(set).filter(Boolean);
}

async function findClientIdByPhoneInCompany(
    companyId: string,
    fromPhone: string
) {
    const variants = phoneDigitVariants(fromPhone);

    console.log('[whatsapp][client_lookup][start]', {
        companyId,
        fromPhoneMasked: maskPhoneDigits(fromPhone),
        variantsMasked: variants.map(maskPhoneDigits),
    });

    if (variants.length === 0) return null;

    const rows = await prisma.$queryRaw<
        Array<{ id: string; phone_digits: string | null }>
    >`
        select
            u.id as id,
            regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') as phone_digits
        from "User" u
        join company_members cm
            on cm."userId" = u.id
        where
            u."isActive" = true
            and cm."isActive" = true
            and cm.role = 'CLIENT'
            and cm."companyId" = ${companyId}
            and regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') = any(${variants}::text[])
        limit 1
    `;

    const found = rows?.[0]?.id ?? null;

    console.log('[whatsapp][client_lookup][result]', {
        companyId,
        fromPhoneMasked: maskPhoneDigits(fromPhone),
        found: !!found,
        matchedDigitsMasked: rows?.[0]?.phone_digits
            ? maskPhoneDigits(rows[0].phone_digits)
            : null,
    });

    return found;
}

async function isClientActiveInCompany(companyId: string, userId: string) {
    const cid = String(companyId || '').trim();
    const uid = String(userId || '').trim();
    if (!cid || !uid) return false;

    const cm = await prisma.companyMember.findFirst({
        where: {
            companyId: cid,
            userId: uid,
            isActive: true,
            role: 'CLIENT',
        },
        select: { id: true },
    });

    return !!cm?.id;
}

async function listClientCompaniesByPhone(fromPhone: string) {
    const variants = phoneDigitVariants(fromPhone);

    console.log('[whatsapp][companies_by_phone][start]', {
        fromPhoneMasked: maskPhoneDigits(fromPhone),
        variantsMasked: variants.map(maskPhoneDigits),
    });

    if (variants.length === 0) return [];

    const rows = await prisma.$queryRaw<
        Array<{ company_id: string; company_name: string | null }>
    >`
        select
            cm."companyId" as company_id,
            c.name as company_name
        from "User" u
        join company_members cm
            on cm."userId" = u.id
        join companies c
            on c.id = cm."companyId"
        where
            u."isActive" = true
            and cm."isActive" = true
            and cm.role = 'CLIENT'
            and c."isActive" = true
            and regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') = any(${variants}::text[])
        order by c.name asc
    `;

    const map = new Map<string, string>();
    for (const r of rows) {
        map.set(
            String(r.company_id),
            r.company_name ? String(r.company_name) : String(r.company_id)
        );
    }

    const out = Array.from(map.entries()).map(([id, label]) => ({
        id,
        label,
    }));

    console.log('[whatsapp][companies_by_phone][result]', {
        count: out.length,
    });

    return out;
}

/* ============================================================
 * ✅ Disponibilidade (dias/horários)
 * ============================================================ */

function getInternalOrigin() {
    const env =
        process.env.INTERNAL_HTTP_ORIGIN ||
        process.env.ATENDEPLAY_INTERNAL_HTTP_ORIGIN ||
        '';

    if (env && /^https?:\/\//i.test(env)) return env;

    const port = Number(process.env.PORT || 3000) || 3000;
    return `http://127.0.0.1:${port}`;
}

function getInternalSecret() {
    return String(process.env.INTERNAL_API_SECRET || '').trim();
}

async function fetchAvailabilityTimes(args: {
    originUrl: string;
    unitId: string;
    professionalId: string;
    serviceId: string;
    dateStr: string;
}) {
    const { originUrl, unitId, professionalId, serviceId, dateStr } = args;

    const url = new URL('/api/admin/availability/times', originUrl);
    url.searchParams.set('unitId', unitId);
    url.searchParams.set('professionalId', professionalId);
    url.searchParams.set('serviceId', serviceId);
    url.searchParams.set('date', dateStr);

    const internalSecret = getInternalSecret();
    if (!internalSecret) {
        console.warn(
            '[whatsapp][availability] INTERNAL_API_SECRET não configurado. A rota /api/admin/availability/times pode retornar 401.'
        );
    }

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
        },
        cache: 'no-store',
    });

    const payload = (await res.json().catch(() => null)) as any;
    if (!res.ok || !payload?.ok) {
        return { ok: false as const, times: [] as string[] };
    }

    const times = Array.isArray(payload?.data?.times) ? payload.data.times : [];
    return { ok: true as const, times: times as string[] };
}

function filterFutureTimesForDateStr(dateStr: string, times: string[]) {
    if (!Array.isArray(times) || !times.length) return [];

    const now = new Date();

    const nowParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(now);

    const getPart = (
        parts: Intl.DateTimeFormatPart[],
        type: 'year' | 'month' | 'day' | 'hour' | 'minute'
    ) => Number(parts.find((p) => p.type === type)?.value ?? '0');

    const todayStr = `${String(getPart(nowParts, 'year')).padStart(4, '0')}-${String(
        getPart(nowParts, 'month')
    ).padStart(2, '0')}-${String(getPart(nowParts, 'day')).padStart(2, '0')}`;

    // se não for hoje, não filtra nada
    if (dateStr !== todayStr) return times;

    const nowMinutes =
        getPart(nowParts, 'hour') * 60 + getPart(nowParts, 'minute');

    return times.filter((t) => {
        const [hh, mm] = String(t || '')
            .split(':')
            .map(Number);

        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;

        const slotMinutes = hh * 60 + mm;

        // cliente NUNCA pode ver horário no passado
        return slotMinutes > nowMinutes;
    });
}

async function listNextAvailableDays(args: {
    originUrl: string;
    companyId: string;
    unitId: string;
    professionalId: string;
    serviceId: string;
}) {
    const { originUrl, companyId, unitId, professionalId, serviceId } = args;

    const out: Array<{ id: string; label: string; dateStr: string }> = [];

    const unit = await prisma.unit.findFirst({
        where: {
            id: unitId,
            companyId,
            isActive: true,
        },
        select: {
            bookingWindowDays: true,
            reminderLeadHours: true,
        },
    });

    const bookingWindowDays =
        typeof unit?.bookingWindowDays === 'number'
            ? Math.max(1, Math.min(365, Math.trunc(unit.bookingWindowDays)))
            : 30;

    const nowParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const y = Number(nowParts.find((p) => p.type === 'year')?.value ?? '0');
    const m = Number(nowParts.find((p) => p.type === 'month')?.value ?? '0');
    const d = Number(nowParts.find((p) => p.type === 'day')?.value ?? '0');

    if (!y || !m || !d) return out;

    for (let i = 0; i < bookingWindowDays; i++) {
        const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0, 0));
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(dt);

        const yy = parts.find((p) => p.type === 'year')?.value ?? '';
        const mm = parts.find((p) => p.type === 'month')?.value ?? '';
        const dd = parts.find((p) => p.type === 'day')?.value ?? '';
        const dateStr = `${yy}-${mm}-${dd}`;

        const avail = await fetchAvailabilityTimes({
            originUrl,
            unitId,
            professionalId,
            serviceId,
            dateStr,
        });

        const visibleTimes = avail.ok
            ? filterFutureTimesForDateStr(dateStr, avail.times)
            : [];

        if (avail.ok && visibleTimes.length > 0) {
            const wd = weekdayShortPt(dateStr);
            const br = formatDateBR(dateStr);
            out.push({
                id: dateStr,
                dateStr,
                label: `${br} (${wd})`,
            });

            if (out.length >= bookingWindowDays) break;
        }
    }

    return out;
}

function renderConfirmSummary(payload: any) {
    const unitLabel = String(payload.unitLabel ?? 'Unidade');
    const professionalLabel = String(
        payload.professionalLabel ?? 'Profissional'
    );
    const categoryLabel = String(payload.categoryLabel ?? 'Categoria');
    const serviceLabel = String(payload.serviceLabel ?? 'Serviço');
    const servicePriceLabel = String(payload.servicePriceLabel ?? '').trim();
    const dateStr = String(payload.dateStr ?? '');
    const timeHHmm = String(payload.timeHHmm ?? '');

    const brFull = dateStr ? formatDateBR(dateStr) : '';
    const wd = dateStr ? weekdayShortPt(dateStr) : '';

    const dateLine = brFull ? `${brFull}${wd ? ` (${wd})` : ''}` : dateStr;

    return [
        'Confirme se está correto:',
        '',
        `Unidade selecionada: ${unitLabel} ✅`,
        `Profissional selecionado: ${professionalLabel} ✅`,
        `Categoria selecionada: ${categoryLabel} ✅`,
        `Serviço selecionado: ${serviceLabel}${servicePriceLabel ? ` - ${servicePriceLabel}` : ''} ✅`,
        `Dia selecionado: ${dateLine} ✅`,
        `Horário selecionado: ${timeHHmm} ✅`,
        '',
        'Digite *1* para *CONFIRMAR E FINALIZAR O AGENDAMENTO*',
        'Digite *menu* para voltar',
    ].join('\n');
}

function renderRescheduleConfirm(payload: any) {
    const oldAt = payload.rescheduleOldAtIso
        ? formatDateTimeBRFromUtc(new Date(payload.rescheduleOldAtIso))
        : '—';

    const newAt =
        payload.dateStr && payload.timeHHmm
            ? `${formatDateBR(payload.dateStr)} (${weekdayShortPt(
                  payload.dateStr
              )}) às ${payload.timeHHmm}`
            : '—';

    return [
        'Confirme o reagendamento:',
        '',
        `Agendamento atual: *${oldAt}*`,
        `Novo horário: *${newAt}*`,
        '',
        `Unidade: *${String(payload.unitLabel ?? 'Unidade')}* ✅`,
        `Profissional: *${String(payload.professionalLabel ?? 'Profissional')}* ✅`,
        `Serviço: *${String(payload.serviceLabel ?? 'Serviço')}* ✅`,
        '',
        'Digite *1* para *CONFIRMAR O REAGENDAMENTO*',
        'Digite *menu* para voltar',
    ].join('\n');
}

function renderCancelConfirm(payload: any) {
    const when = payload.cancelOldAtIso
        ? formatDateTimeBRFromUtc(new Date(payload.cancelOldAtIso))
        : '—';

    const unitLabel = String(
        payload.cancelUnitLabel ?? payload.unitLabel ?? ''
    );
    const professionalLabel = String(
        payload.cancelProfessionalLabel ?? payload.professionalLabel ?? ''
    );
    const serviceLabel = String(
        payload.cancelServiceLabel ?? payload.serviceLabel ?? ''
    );

    const details: string[] = [];
    if (serviceLabel) details.push(`Serviço: *${serviceLabel}*`);
    if (professionalLabel) details.push(`Profissional: *${professionalLabel}*`);
    if (unitLabel) details.push(`Unidade: *${unitLabel}*`);

    return [
        'Confirme o cancelamento:',
        '',
        `Agendamento: *${when}*`,
        ...(details.length ? [''] : []),
        ...details,
        '',
        'Digite *1* para *CONFIRMAR O CANCELAMENTO*',
        'Digite *menu* para voltar',
    ].join('\n');
}

/* ===========================
 * ✅ Webhook GET/POST
 * =========================== */

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (!mode || !token || !challenge) return textOk('missing hub params', 400);
    if (mode !== 'subscribe') return textOk('invalid hub.mode', 400);

    const expected = getVerifyToken();
    if (!expected) return textOk('verify token not configured', 500);
    if (token !== expected) return textOk('unauthorized', 401);

    return textOk(challenge, 200);
}

export async function POST(req: NextRequest) {
    let body: any;
    try {
        body = await req.json();
    } catch {
        return jsonOk({ ok: true, ignored: 'invalid json' }, 200);
    }

    const entry0 = body?.entry?.[0];
    const change0 = entry0?.changes?.[0];
    const value = change0?.value;

    if (!value) return jsonOk({ ok: true, ignored: 'no value' }, 200);

    const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;

    if (Array.isArray(value.statuses) && value.statuses.length > 0) {
        for (const st of value.statuses) {
            const status = st?.status;
            const msgId = st?.id;
            const recipient = st?.recipient_id;
            const timestamp = st?.timestamp;
            const errors = st?.errors;

            if (status === 'failed') {
                console.error('[whatsapp][status_failed]', {
                    phoneNumberId,
                    msgId,
                    recipient,
                    timestamp,
                    errors,
                });
            } else {
                console.log('[whatsapp][status]', {
                    phoneNumberId,
                    status,
                    msgId,
                    recipient,
                    timestamp,
                });
            }
        }
        return jsonOk({ ok: true, handled: 'statuses' }, 200);
    }

    const msg = value?.messages?.[0];

    if (!phoneNumberId) {
        console.log('[whatsapp][ignored] missing metadata.phone_number_id');
        return jsonOk(
            { ok: true, ignored: 'missing metadata.phone_number_id' },
            200
        );
    }
    if (!msg) {
        console.log('[whatsapp][ignored] no messages', { phoneNumberId });
        return jsonOk({ ok: true, ignored: 'no messages' }, 200);
    }

    if (msg?.from_me === true || msg?.fromMe === true) {
        console.log('[whatsapp][ignored] from_me', { phoneNumberId });
        return jsonOk({ ok: true, ignored: 'from_me' }, 200);
    }

    const fromPhoneRaw: string | undefined = msg?.from;
    const type: string | undefined = msg?.type;

    if (!fromPhoneRaw) {
        console.log('[whatsapp][ignored] missing msg.from', { phoneNumberId });
        return jsonOk({ ok: true, ignored: 'missing msg.from' }, 200);
    }

    const fromPhone = normalizeWaPhone(fromPhoneRaw);
    console.log('[whatsapp][inbound]', { phoneNumberId, fromPhone, type });

    const channel = await prisma.whatsappChannel.findUnique({
        where: { phoneNumberId },
        select: {
            id: true,
            companyId: true,
            defaultUnitId: true,
            isActive: true,
        },
    });

    if (!channel || !channel.isActive) {
        console.log('[whatsapp][ignored] channel not found or inactive', {
            phoneNumberId,
            found: !!channel,
            isActive: channel?.isActive ?? null,
        });
        return jsonOk(
            {
                ok: true,
                ignored: true,
                ignoredReason: 'channel not found or inactive',
                phoneNumberId,
            },
            200
        );
    }

    let text: string | null = null;
    if (type === 'text') text = msg?.text?.body ?? null;

    if (!text) {
        console.log('[whatsapp][ignored] unsupported type', {
            phoneNumberId,
            type,
        });
        return jsonOk({ ok: true, ignored: `unsupported type: ${type}` }, 200);
    }

    const now = new Date();

    // ✅ Sessão expira em 5 minutos sem interação
    const SESSION_TTL_MS = 5 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    const existing = await prisma.whatsappSession.findUnique({
        where: { channelId_fromPhone: { channelId: channel.id, fromPhone } },
        select: {
            id: true,
            expiresAt: true,
            stage: true,
            payload: true,
            unitId: true,
            companyId: true,
        },
    });

    let normalizedText = normalizeInboundChoice(text);
    const wantsMenu = isMenuCommand(normalizedText);

    // ✅ Se EXISTE sessão e ela expirou: zera tudo + avisa + PARA AQUI
    const isSessionExpired =
        !!existing && existing.expiresAt.getTime() < now.getTime();

    if (isSessionExpired) {
        // ✅ EXCEÇÃO: permitir confirmação/cancelamento mesmo com sessão expirada
        // Se o usuário respondeu "1" ou "3", tentamos resolver pelo banco sem depender de sessão.
        if (normalizedText === '1' || normalizedText === '3') {
            const companyId = String(channel.companyId);

            // tenta achar clientId pelo telefone (robusto)
            const clientId = await findClientIdByPhoneInCompany(
                companyId,
                fromPhone
            );

            if (clientId) {
                // pega o próximo agendamento pendente futuro que já teve lembrete enviado
                // e ainda não foi confirmado/cancelado
                const appt = await prisma.appointment.findFirst({
                    where: {
                        companyId,
                        clientId,
                        status: 'PENDING',

                        // 👇 só considera agendamentos dentro de uma janela razoável
                        scheduleAt: {
                            gte: now,
                            lte: new Date(now.getTime() + 48 * 60 * 60 * 1000), // +48h
                        },

                        reminderSentAt: { not: null },
                        confirmedAt: null,
                        confirmationCanceledAt: null,
                    },
                    orderBy: [{ scheduleAt: 'asc' }],
                    select: {
                        id: true,
                        scheduleAt: true,
                        unit: { select: { name: true } },
                        professional: {
                            select: { name: true },
                        },
                        service: { select: { name: true } },
                    },
                });

                if (appt) {
                    const when = formatDateTimeBRFromUtc(
                        new Date(appt.scheduleAt)
                    );

                    if (normalizedText === '1') {
                        await prisma.appointment.update({
                            where: { id: appt.id },
                            data: {
                                confirmationStatus: 'CONFIRMED',
                                confirmedAt: now,
                            } as any,
                            select: { id: true },
                        });

                        const sendResult = await whatsappSendText({
                            to: fromPhone,
                            text: [
                                '✅ Presença confirmada!',
                                '',
                                `Te espero em *${when}* 😉`,
                                '',
                                'Se quiser, digite *menu* para ver opções.',
                            ].join('\n'),
                        });

                        return jsonOk({
                            ok: true,
                            received: true,
                            handled: 'expired_but_confirmed',
                            phoneNumberId,
                            fromPhone,
                            appointmentId: appt.id,
                            send: sendResult,
                        });
                    }

                    // normalizedText === '3'
                    await prisma.appointment.update({
                        where: { id: appt.id },
                        data: {
                            confirmationStatus: 'CANCELED',
                            confirmationCanceledAt: now,
                            status: 'CANCELED',
                        } as any,
                        select: { id: true },
                    });

                    const sendResult = await whatsappSendText({
                        to: fromPhone,
                        text: [
                            '✅ Agendamento cancelado.',
                            '',
                            'Se quiser marcar outro horário, digite *menu*.',
                        ].join('\n'),
                    });

                    return jsonOk({
                        ok: true,
                        received: true,
                        handled: 'expired_but_canceled',
                        phoneNumberId,
                        fromPhone,
                        appointmentId: appt.id,
                        send: sendResult,
                    });
                }
            }

            // se não conseguiu resolver, cai no comportamento padrão de expiração
        }

        // tenta apagar a sessão (se falhar, ainda assim avisamos e paramos)
        try {
            await prisma.whatsappSession.delete({
                where: {
                    channelId_fromPhone: { channelId: channel.id, fromPhone },
                },
            });
        } catch (err) {
            console.error('[whatsapp][session_expire][delete_failed]', {
                phoneNumberId,
                fromPhone,
                error: String(err),
            });
        }

        if (
            ['FAQ_CATEGORY', 'FAQ_QUESTION', 'FAQ_ANSWER'].includes(
                String(existing?.stage ?? '')
            )
        ) {
            await createFaqEvent({
                companyId: String(existing?.companyId ?? channel.companyId),
                channelId: channel.id,
                fromPhone,
                whatsappSessionId: existing?.id ?? null,
                categoryId:
                    String(
                        (existing?.payload as any)?.faqCategoryId ?? ''
                    ).trim() || null,
                faqItemId:
                    String(
                        (existing?.payload as any)?.faqQuestionId ?? ''
                    ).trim() || null,
                eventType: 'FAQ_SESSION_EXPIRED',
            });
        }

        const expiredMsg =
            '⏳ Sua sessão expirou por falta de interação.\n' +
            'Para continuar, digite *menu* ou envie uma nova mensagem com o que você deseja fazer.';

        const sendResult = await whatsappSendText({
            to: fromPhone,
            text: expiredMsg,
        });

        if (!sendResult.ok) {
            logSendFailure({
                phoneNumberId: phoneNumberId!,
                fromPhone,
                stage: String(existing?.stage ?? 'UNKNOWN'),
                error: sendResult.error,
                status: sendResult.status,
                fbCode: sendResult?.raw?.error?.code,
            });
        } else {
            console.log('[whatsapp][session_expire][sent_ok]', {
                phoneNumberId,
                to: fromPhone,
                messageId: sendResult.messageId,
            });
        }

        return jsonOk({
            ok: true,
            received: true,
            handled: 'session_expired',
            phoneNumberId,
            fromPhone,
            send: sendResult,
        });
    }

    // ✅ Fallback: se NÃO existe sessão e o usuário respondeu 1/3,
    // tenta confirmar/cancelar o próximo lembrete pendente direto pelo banco.
    if (!existing && (normalizedText === '1' || normalizedText === '3')) {
        const companies = await listClientCompaniesByPhone(fromPhone);

        for (const c of companies) {
            const clientId = await findClientIdByPhoneInCompany(
                c.id,
                fromPhone
            );
            if (!clientId) continue;

            const appt = await prisma.appointment.findFirst({
                where: {
                    companyId: c.id,
                    clientId,
                    status: 'PENDING',
                    scheduleAt: { gte: now },
                    reminderSentAt: { not: null },
                    confirmedAt: null,
                    confirmationCanceledAt: null,
                },
                orderBy: [{ scheduleAt: 'asc' }],
                select: {
                    id: true,
                    scheduleAt: true,
                },
            });

            if (!appt) continue;

            const when = formatDateTimeBRFromUtc(new Date(appt.scheduleAt));

            if (normalizedText === '1') {
                await prisma.appointment.update({
                    where: { id: appt.id },
                    data: {
                        confirmationStatus: 'CONFIRMED',
                        confirmedAt: now,
                    } as any,
                    select: { id: true },
                });

                const sendResult = await whatsappSendText({
                    to: fromPhone,
                    text: [
                        '✅ Presença confirmada!',
                        '',
                        `Te espero em *${when}* 😉`,
                        '',
                        'Se quiser, digite *menu* para ver opções.',
                    ].join('\n'),
                });

                return jsonOk({
                    ok: true,
                    received: true,
                    handled: 'no_session_but_confirmed',
                    phoneNumberId,
                    fromPhone,
                    appointmentId: appt.id,
                    send: sendResult,
                });
            }

            await prisma.appointment.update({
                where: { id: appt.id },
                data: {
                    confirmationStatus: 'CANCELED',
                    confirmationCanceledAt: now,
                    status: 'CANCELED',
                } as any,
                select: { id: true },
            });

            const sendResult = await whatsappSendText({
                to: fromPhone,
                text: [
                    '✅ Agendamento cancelado.',
                    '',
                    'Se quiser marcar outro horário, digite *menu*.',
                ].join('\n'),
            });

            return jsonOk({
                ok: true,
                received: true,
                handled: 'no_session_but_canceled',
                phoneNumberId,
                fromPhone,
                appointmentId: appt.id,
                send: sendResult,
            });
        }
    }

    const currentStage = existing?.stage ?? 'MENU';
    let nextStage: string = currentStage;

    // ✅ "menu" continua funcionando como antes (força MENU), mas NÃO é expiração
    if (wantsMenu) nextStage = 'MENU';

    const payload: any = {
        ...(typeof existing?.payload === 'object' && existing?.payload
            ? existing.payload
            : {}),
        lastInboundText: text,
        lastInboundAt: now.toISOString(),
    };

    // ✅ Atalho interno: depois de escolher empresa (reagendar/cancelar), simula a opção do menu
    const autoNext = String(payload._autoNextMenuChoice ?? '').trim();
    if (
        !wantsMenu &&
        (autoNext === '1' || autoNext === '2' || autoNext === '3')
    ) {
        payload._autoNextMenuChoice = null;
        normalizedText = autoNext;
    }

    const lastList: LastListPayload | null =
        payload?.lastList && typeof payload.lastList === 'object'
            ? (payload.lastList as LastListPayload)
            : null;

    // company efetiva da sessão (pode vir da escolha do usuário)
    const effectiveCompanyId: string =
        String(payload.companyId ?? '').trim() ||
        String(existing?.companyId ?? '').trim() ||
        String(channel.companyId);

    let replyText: string | null = null;

    /* ============================================================
     * ✅ CONFIRMAÇÃO RÁPIDA DE AGENDAMENTO (1 confirma, 3 cancela)
     * Regras:
     * - Só entra aqui se stage == 'APPT_CONFIRMATION' OU payload.confirmAppointmentId existir
     * - "1" => confirmationStatus=CONFIRMED, confirmedAt=now
     * - "3" => confirmationStatus=CANCELED, confirmationCanceledAt=now, status=CANCELED
     * ============================================================ */
    const confirmAppointmentId = String(
        payload.confirmAppointmentId ?? payload.apptConfirmId ?? ''
    ).trim();

    const inConfirmationFlow =
        nextStage !== 'MENU' &&
        (String(existing?.stage ?? '') === 'APPT_CONFIRMATION' ||
            String(payload.confirmStage ?? '') === 'APPT_CONFIRMATION' ||
            !!confirmAppointmentId);

    if (inConfirmationFlow) {
        if (!confirmAppointmentId) {
            nextStage = 'MENU';
            payload.confirmAppointmentId = null;
            payload.apptConfirmId = null;
            payload.confirmStage = null;

            replyText = renderMenu();
        } else {
            let clientId = String(payload.clientId ?? '').trim();
            if (!clientId) {
                const found = await findClientIdByPhoneInCompany(
                    effectiveCompanyId,
                    fromPhone
                );
                clientId = found ?? '';
            }

            if (!clientId) {
                nextStage = 'MENU';
                payload.confirmAppointmentId = null;
                payload.apptConfirmId = null;
                payload.confirmStage = null;

                replyText = renderClientNotFoundAndMenu();
            } else {
                const appt = await prisma.appointment.findFirst({
                    where: {
                        id: confirmAppointmentId,
                        companyId: effectiveCompanyId,
                        clientId,
                    },
                    select: {
                        id: true,
                        status: true,
                        scheduleAt: true,
                        unit: { select: { name: true } },
                        professional: { select: { name: true } },
                        service: { select: { name: true } },
                    },
                });

                if (!appt) {
                    nextStage = 'MENU';
                    payload.confirmAppointmentId = null;
                    payload.apptConfirmId = null;
                    payload.confirmStage = null;

                    replyText = [
                        'Não encontrei esse agendamento para confirmar. 😕',
                        '',
                        'Voltando pro menu 👇',
                        '',
                        renderMenu(),
                    ].join('\n');
                } else {
                    const when = formatDateTimeBRFromUtc(
                        new Date(appt.scheduleAt)
                    );

                    const unitLabel = appt.unit?.name ?? null;
                    const professionalLabel = appt.professional?.name ?? null;
                    const serviceLabel = appt.service?.name ?? null;

                    if (normalizedText === '1') {
                        await prisma.appointment.update({
                            where: { id: appt.id },
                            data: {
                                confirmationStatus: 'CONFIRMED',
                                confirmedAt: now,
                            } as any,
                            select: { id: true },
                        });

                        nextStage = 'DONE';
                        payload.confirmAppointmentId = null;
                        payload.apptConfirmId = null;
                        payload.confirmStage = null;

                        replyText = [
                            '✅ Presença confirmada!',
                            '',
                            `Te espero em *${when}* 😉`,
                            '',
                            'Se quiser, digite *menu* para ver opções.',
                        ].join('\n');
                    } else if (normalizedText === '3') {
                        await prisma.appointment.update({
                            where: { id: appt.id },
                            data: {
                                confirmationStatus: 'CANCELED',
                                confirmationCanceledAt: now,
                                status: 'CANCELED',
                            } as any,
                            select: { id: true },
                        });

                        nextStage = 'DONE';
                        payload.confirmAppointmentId = null;
                        payload.apptConfirmId = null;
                        payload.confirmStage = null;

                        replyText = [
                            '✅ Agendamento cancelado.',
                            '',
                            'Se quiser marcar outro horário, digite *menu*.',
                        ].join('\n');
                    } else {
                        nextStage = 'APPT_CONFIRMATION';
                        payload.confirmAppointmentId = appt.id;
                        payload.confirmStage = 'APPT_CONFIRMATION';

                        replyText = renderAppointmentConfirmationPrompt({
                            when,
                            unitLabel,
                            professionalLabel,
                            serviceLabel,
                        });
                    }
                }
            }
        }
    }

    // ============= MENU =============
    if (!replyText && nextStage === 'MENU') {
        // reset de escolhas do agendamento
        // ✅ Regra: se o usuário digitou "menu", limpa também empresa/cliente para não "grudar" em uma empresa antiga.
        // (A escolha de empresa volta a acontecer automaticamente quando ele escolher "1) Agendar".)
        if (wantsMenu) {
            payload.companyId = null;
            payload.companyLabel = null;
            payload.clientId = null;
            payload.lastList = null;

            payload.chooseCompanyIntent = null;
            payload._autoNextMenuChoice = null;

            clearFaqPayload(payload);
        }

        payload.unitId = null;
        payload.unitLabel = null;

        payload.professionalId = null;
        payload.professionalLabel = null;

        payload.serviceId = null;
        payload.serviceLabel = null;
        payload.serviceDurationMinutes = null;

        payload.dateStr = null;
        payload.timeHHmm = null;

        payload.lastList = null;

        // reagendar
        payload.rescheduleAppointmentId = null;
        payload.rescheduleOldAtIso = null;
        payload.rescheduleStep = null;
        payload.isReschedule = false;

        // cancelar
        payload.cancelAppointmentId = null;
        payload.cancelOldAtIso = null;
        payload.cancelUnitLabel = null;
        payload.cancelProfessionalLabel = null;
        payload.cancelServiceLabel = null;
        payload.isCancel = false;
        payload.confirmAppointmentId = null;
        payload.apptConfirmId = null;
        payload.confirmStage = null;

        if (
            wantsMenu ||
            normalizedText === '' ||
            normalizedText === 'oi' ||
            normalizedText === 'olá' ||
            normalizedText === 'ola'
        ) {
            replyText = renderMenu();
        } else if (
            normalizedText === '1' ||
            normalizedText === 'agendar' ||
            normalizedText === 'agenda'
        ) {
            // ✅ VALIDAÇÃO IMEDIATA NO CLIQUE DO "1"
            // regra:
            // 1) tenta na company do canal
            // 2) se não achar, lista companies onde o telefone é CLIENT
            //    - 0: volta pro menu com aviso
            //    - 1: escolhe automaticamente
            //    - N: pede escolha

            // ✅ Preferimos a company já escolhida na sessão (ex: após signup)
            let chosenCompanyId =
                String(payload.companyId ?? '').trim() ||
                String(channel.companyId);

            // ✅ Preferimos o vínculo persistido na sessão (não depende do telefone)
            let clientId: string | null = null;

            const sessionClientId = String(payload.clientId ?? '').trim();
            if (sessionClientId) {
                const ok = await isClientActiveInCompany(
                    chosenCompanyId,
                    sessionClientId
                );
                if (ok) clientId = sessionClientId;
            }

            // ✅ Regra nova:
            // Sempre que o telefone estiver em 2+ empresas, perguntar empresa (não depender de "não achei clientId").
            const companies = await listClientCompaniesByPhone(fromPhone);

            if (companies.length === 0) {
                // ✅ Novo: oferece cadastro automático
                nextStage = 'SIGNUP_OFFER';
                payload.lastList = null;

                // limpa vínculo do agendamento atual (ainda não existe client)
                payload.clientId = null;

                // dados do signup
                payload.signupIntent = 'AGENDAR';
                payload.signupCompanyId = null;
                payload.signupCompanyLabel = null;
                payload.signupName = null;
                payload.signupEmail = null;

                // por padrão sugerimos o telefone do WhatsApp
                payload.signupPhone = fromPhone;

                payload.signupBirthdateIso = null;
                payload.signupBirthdate = null;

                replyText = renderSignupOffer();
            } else if (companies.length === 1) {
                chosenCompanyId = companies[0].id;
                payload.companyId = chosenCompanyId;
                payload.companyLabel = companies[0].label;

                // agora sim tenta resolver o clientId na única empresa possível
                // ✅ Preferimos o vínculo persistido na sessão (não depende do telefone)
                let resolvedClientId: string | null = null;

                const sessionClientId = String(payload.clientId ?? '').trim();
                if (sessionClientId) {
                    const ok = await isClientActiveInCompany(
                        chosenCompanyId,
                        sessionClientId
                    );
                    if (ok) resolvedClientId = sessionClientId;
                }

                if (!resolvedClientId) {
                    resolvedClientId = await findClientIdByPhoneInCompany(
                        chosenCompanyId,
                        fromPhone
                    );
                }

                clientId = resolvedClientId;

                if (!clientId) {
                    nextStage = 'MENU';
                    payload.lastList = null;
                    payload.clientId = null;
                    replyText = renderClientNotFoundAndMenu();
                }
            } else {
                // 2+ empresas => SEMPRE perguntar
                nextStage = 'CHOOSE_COMPANY';
                payload.clientId = null;
                payload.companyId = null;
                payload.companyLabel = null;

                const lp: LastListPayload = {
                    type: 'COMPANY',
                    items: companies.map((c) => ({
                        id: c.id,
                        label: c.label,
                    })),
                };
                payload.lastList = lp;

                replyText = [
                    'Beleza! Antes de agendar, me diga em qual empresa você quer marcar:',
                    '',
                    renderList('🏢 Escolha a empresa:', lp.items),
                ].join('\n');
            }

            if (!replyText && clientId) {
                payload.clientId = clientId;
                payload.companyId = chosenCompanyId;

                const units = await listUnits(chosenCompanyId);

                if (units.length === 0) {
                    nextStage = 'MENU';
                    payload.lastList = null;
                    replyText = [
                        'Não encontrei unidades ativas no momento. 😕',
                        '',
                        'Voltando pro menu 👇',
                        '',
                        renderMenu(),
                    ].join('\n');
                } else if (units.length === 1) {
                    const only = units[0];
                    payload.unitId = only.id;
                    payload.unitLabel = only.label;

                    const profs = await listProfessionals(
                        chosenCompanyId,
                        only.id
                    );

                    if (profs.length === 0) {
                        nextStage = 'MENU';
                        payload.lastList = null;
                        replyText = [
                            `Unidade selecionada: *${only.label}* ✅`,
                            '',
                            'Não encontrei profissionais ativos pra essa unidade. 😕',
                            '',
                            'Voltando pro menu 👇',
                            '',
                            renderMenu(),
                        ].join('\n');
                    } else {
                        nextStage = 'ASK_PROFESSIONAL';
                        const lp: LastListPayload = {
                            type: 'PROFESSIONAL',
                            items: profs,
                        };
                        payload.lastList = lp;

                        replyText = [
                            'Beleza! Vamos agendar. ✅',
                            '',
                            `Unidade selecionada: *${only.label}* ✅`,
                            '',
                            renderList('👤 Profissionais disponíveis:', profs),
                        ].join('\n');
                    }
                } else {
                    nextStage = 'ASK_UNIT';
                    const lp: LastListPayload = { type: 'UNIT', items: units };
                    payload.lastList = lp;

                    replyText = [
                        'Beleza! Vamos agendar. ✅',
                        '',
                        renderList('🏬 Escolha a unidade:', units),
                    ].join('\n');
                }
            }
        } else if (
            normalizedText === '2' ||
            normalizedText === 'reagendar' ||
            normalizedText === 'remarcar'
        ) {
            // ✅ Regra nova: se telefone estiver em 2+ empresas, perguntar antes de reagendar
            const companies = await listClientCompaniesByPhone(fromPhone);

            let chosenCompanyId =
                String(payload.companyId ?? '').trim() ||
                String(channel.companyId);
            let clientId: string | null = null;

            if (companies.length === 1) {
                chosenCompanyId = companies[0].id;
                payload.companyId = chosenCompanyId;
                payload.companyLabel = companies[0].label;
            } else if (companies.length > 1) {
                nextStage = 'CHOOSE_COMPANY';
                payload.clientId = null;
                payload.companyId = null;
                payload.companyLabel = null;

                // ✅ dica pro próximo passo saber que foi para reagendar
                payload.chooseCompanyIntent = 'RESCHEDULE';

                const lp: LastListPayload = {
                    type: 'COMPANY',
                    items: companies.map((c) => ({ id: c.id, label: c.label })),
                };
                payload.lastList = lp;

                replyText = [
                    'Antes de reagendar, me diga em qual empresa é o agendamento:',
                    '',
                    renderList('🏢 Escolha a empresa:', lp.items),
                ].join('\n');
            }

            // só continua se não montou replyText (ou seja, não pediu escolha)
            if (!replyText) {
                clientId = await findClientIdByPhoneInCompany(
                    chosenCompanyId,
                    fromPhone
                );
            }

            if (!replyText && !clientId) {
                nextStage = 'MENU';
                payload.lastList = null;
                payload.clientId = null;
                replyText = renderClientNotFoundAndMenu();
            } else if (!replyText) {
                payload.clientId = clientId;
                payload.companyId = chosenCompanyId;

                const appts = await prisma.appointment.findMany({
                    where: {
                        companyId:
                            String(payload.companyId ?? '').trim() ||
                            chosenCompanyId,
                        clientId: clientId ?? undefined,
                        status: 'PENDING',
                        scheduleAt: { gte: now },
                    },
                    orderBy: [{ scheduleAt: 'asc' }],
                    take: 10,
                    select: {
                        id: true,
                        scheduleAt: true,
                        unitId: true,
                        professionalId: true,
                        serviceId: true,
                        unit: { select: { name: true } },
                        professional: {
                            select: { name: true },
                        },
                        service: { select: { name: true } },
                    },
                });

                if (appts.length === 0) {
                    nextStage = 'MENU';
                    payload.lastList = null;
                    replyText = [
                        'Não encontrei agendamentos *pendentes* para reagendar. 🙂',
                        '',
                        'Voltando pro menu 👇',
                        '',
                        renderMenu(),
                    ].join('\n');
                } else {
                    const items = appts
                        .filter(
                            (a) =>
                                a.professionalId &&
                                a.serviceId &&
                                a.unitId &&
                                a.unit?.name &&
                                a.professional?.name &&
                                a.service?.name
                        )
                        .map((a) => {
                            const when = formatDateTimeBRFromUtc(a.scheduleAt);
                            const unitLabel = a.unit!.name;
                            const proLabel = a.professional!.name;
                            const svcLabel = a.service!.name;

                            return {
                                id: a.id,
                                scheduleAtIso: a.scheduleAt.toISOString(),
                                unitId: a.unitId,
                                unitLabel,
                                professionalId: a.professionalId!,
                                professionalLabel: proLabel,
                                serviceId: a.serviceId!,
                                serviceLabel: svcLabel,
                                label: `${when} - ${svcLabel} (${proLabel}) • ${unitLabel}`,
                            };
                        });

                    const lp: LastListPayload = {
                        type: 'APPOINTMENT',
                        items,
                    };

                    payload.lastList = lp;
                    nextStage = 'RESCHEDULE_SELECT_APPOINTMENT';

                    replyText = [
                        'Certo! Vamos reagendar. 🔁',
                        '',
                        renderList(
                            '📌 Qual agendamento você quer reagendar?',
                            items
                        ),
                    ].join('\n');
                }
            }
        } else if (isFaqEntryCommand(normalizedText)) {
            const companies = await listClientCompaniesByPhone(fromPhone);

            clearFaqPayload(payload);

            if (companies.length === 0) {
                nextStage = 'MENU';
                payload.lastList = null;
                payload.companyId = null;
                payload.companyLabel = null;
                payload.clientId = null;

                replyText = renderFaqEmpty();
            } else if (companies.length === 1) {
                const companyId = companies[0].id;
                const companyLabel = companies[0].label;

                payload.companyId = companyId;
                payload.companyLabel = companyLabel;

                const clientId = await findClientIdByPhoneInCompany(
                    companyId,
                    fromPhone
                );

                payload.clientId = clientId ?? null;

                const categories = await listFaqCategories(companyId);

                if (!categories.length) {
                    nextStage = 'MENU';
                    payload.lastList = null;
                    replyText = renderFaqEmpty();
                } else {
                    nextStage = 'FAQ_CATEGORY';
                    payload.lastList = {
                        type: 'FAQ_CATEGORY',
                        items: categories,
                    };

                    await createFaqEvent({
                        companyId,
                        channelId: channel.id,
                        fromPhone,
                        whatsappSessionId: existing?.id ?? null,
                        eventType: 'FAQ_MENU_ENTRY',
                        payload: {
                            companyLabel,
                        },
                    });

                    replyText = renderFaqCategories(categories);
                }
            } else {
                nextStage = 'CHOOSE_COMPANY';
                payload.clientId = null;
                payload.companyId = null;
                payload.companyLabel = null;
                payload.chooseCompanyIntent = 'FAQ';

                const lp: LastListPayload = {
                    type: 'COMPANY',
                    items: companies.map((c) => ({
                        id: c.id,
                        label: c.label,
                    })),
                };
                payload.lastList = lp;

                replyText = [
                    'Antes de tirar sua dúvida, me diga em qual empresa você quer atendimento:',
                    '',
                    renderList('🏢 Escolha a empresa:', lp.items),
                ].join('\n');
            }
        } else if (
            normalizedText === '3' ||
            normalizedText === 'cancelar' ||
            normalizedText === 'cancela'
        ) {
            // ✅ Regra nova: se telefone estiver em 2+ empresas, perguntar antes de cancelar
            const companies = await listClientCompaniesByPhone(fromPhone);

            let chosenCompanyId =
                String(payload.companyId ?? '').trim() ||
                String(channel.companyId);
            let clientId: string | null = null;

            if (companies.length === 1) {
                chosenCompanyId = companies[0].id;
                payload.companyId = chosenCompanyId;
                payload.companyLabel = companies[0].label;
            } else if (companies.length > 1) {
                nextStage = 'CHOOSE_COMPANY';
                payload.clientId = null;
                payload.companyId = null;
                payload.companyLabel = null;

                // ✅ dica pro próximo passo saber que foi para cancelar
                payload.chooseCompanyIntent = 'CANCEL';

                const lp: LastListPayload = {
                    type: 'COMPANY',
                    items: companies.map((c) => ({ id: c.id, label: c.label })),
                };
                payload.lastList = lp;

                replyText = [
                    'Antes de cancelar, me diga em qual empresa é o agendamento:',
                    '',
                    renderList('🏢 Escolha a empresa:', lp.items),
                ].join('\n');
            }

            if (!replyText) {
                clientId = await findClientIdByPhoneInCompany(
                    chosenCompanyId,
                    fromPhone
                );
            }

            if (!replyText && !clientId) {
                nextStage = 'MENU';
                payload.lastList = null;
                payload.clientId = null;
                replyText = renderClientNotFoundAndMenu();
            } else if (!replyText) {
                payload.clientId = clientId;
                payload.companyId = chosenCompanyId;

                const appts = await prisma.appointment.findMany({
                    where: {
                        companyId:
                            String(payload.companyId ?? '').trim() ||
                            chosenCompanyId,
                        clientId: clientId ?? undefined,
                        status: 'PENDING',
                        scheduleAt: { gte: now },
                    },
                    orderBy: [{ scheduleAt: 'asc' }],
                    take: 10,
                    select: {
                        id: true,
                        scheduleAt: true,
                        unitId: true,
                        professionalId: true,
                        serviceId: true,
                        unit: { select: { name: true } },
                        professional: {
                            select: { name: true },
                        },
                        service: { select: { name: true } },
                    },
                });

                if (appts.length === 0) {
                    nextStage = 'MENU';
                    payload.lastList = null;
                    replyText = [
                        'Não encontrei agendamentos *pendentes* para cancelar. 🙂',
                        '',
                        'Voltando pro menu 👇',
                        '',
                        renderMenu(),
                    ].join('\n');
                } else {
                    const items = appts
                        .filter(
                            (a) =>
                                a.professionalId &&
                                a.serviceId &&
                                a.unitId &&
                                a.unit?.name &&
                                a.professional?.name &&
                                a.service?.name
                        )
                        .map((a) => {
                            const when = formatDateTimeBRFromUtc(a.scheduleAt);
                            const unitLabel = a.unit!.name;
                            const proLabel = a.professional!.name;
                            const svcLabel = a.service!.name;

                            return {
                                id: a.id,
                                scheduleAtIso: a.scheduleAt.toISOString(),
                                unitId: a.unitId,
                                unitLabel,
                                professionalId: a.professionalId!,
                                professionalLabel: proLabel,
                                serviceId: a.serviceId!,
                                serviceLabel: svcLabel,
                                label: `${when} - ${svcLabel} (${proLabel}) • ${unitLabel}`,
                            };
                        });

                    const lp: LastListPayload = {
                        type: 'APPOINTMENT',
                        items,
                    };
                    payload.lastList = lp;

                    nextStage = 'CANCEL_SELECT_APPOINTMENT';
                    replyText = [
                        'Certo! Vamos cancelar. 🧾',
                        '',
                        renderList(
                            '📌 Qual agendamento você quer cancelar?',
                            items
                        ),
                    ].join('\n');
                }
            }
        } else {
            replyText = renderUnknown();
        }
    }

    // ============= CHOOSE_COMPANY =============
    else if (nextStage === 'CHOOSE_COMPANY') {
        const lp =
            lastList?.type === 'COMPANY' ? (lastList as LastListPayload) : null;

        const items = lp?.type === 'COMPANY' ? (lp.items as any[]) : [];

        if (!items.length) {
            nextStage = 'MENU';
            payload.lastList = null;
            replyText = renderMenu();
        } else {
            const picked = pickFromLastList({
                cleaned: normalizedText,
                lastList: lp,
            });

            if (!normalizedText || !picked.ok) {
                replyText = renderList('🏢 Escolha a empresa:', items);
            } else {
                const companyId = picked.id;
                const companyLabel =
                    (picked.meta?.label as string | undefined) ?? 'Empresa';

                payload.companyId = companyId;
                payload.companyLabel = companyLabel;
                payload.lastList = null;

                // ✅ Preferimos o vínculo persistido na sessão
                let clientId: string | null = null;

                const sessionClientId = String(payload.clientId ?? '').trim();
                if (sessionClientId) {
                    const ok = await isClientActiveInCompany(
                        companyId,
                        sessionClientId
                    );
                    if (ok) clientId = sessionClientId;
                }

                // fallback: procura por telefone
                if (!clientId) {
                    clientId = await findClientIdByPhoneInCompany(
                        companyId,
                        fromPhone
                    );
                }

                if (!clientId) {
                    nextStage = 'MENU';
                    payload.clientId = null;
                    payload.chooseCompanyIntent = null;
                    replyText = renderClientNotFoundAndMenu();
                } else {
                    payload.clientId = clientId;

                    const intent = String(payload.chooseCompanyIntent ?? '')
                        .trim()
                        .toUpperCase();

                    if (intent === 'FAQ') {
                        payload.chooseCompanyIntent = null;
                        payload.lastList = null;

                        const categories = await listFaqCategories(companyId);

                        if (!categories.length) {
                            nextStage = 'MENU';
                            payload.lastList = null;

                            replyText = [
                                'Ainda não encontrei dúvidas cadastradas para esta empresa. 🙂',
                                '',
                                'Voltando pro menu 👇',
                                '',
                                renderMenu(),
                            ].join('\n');
                        } else {
                            nextStage = 'FAQ_CATEGORY';
                            payload.lastList = {
                                type: 'FAQ_CATEGORY',
                                items: categories,
                            };

                            await createFaqEvent({
                                companyId,
                                channelId: channel.id,
                                fromPhone,
                                whatsappSessionId: existing?.id ?? null,
                                eventType: 'FAQ_MENU_ENTRY',
                                payload: {
                                    companyLabel,
                                },
                            });

                            replyText = [
                                `Empresa: *${companyLabel}* ✅`,
                                '',
                                renderFaqCategories(categories),
                            ].join('\n');
                        }
                    } else if (intent === 'RESCHEDULE') {
                        // ✅ depois de escolher empresa, continua no fluxo correto
                        payload.chooseCompanyIntent = null;
                        payload.lastList = null;

                        const appts = await prisma.appointment.findMany({
                            where: {
                                companyId,
                                clientId: clientId ?? undefined,
                                status: 'PENDING',
                                scheduleAt: {
                                    gte: now,
                                },
                            },
                            orderBy: [
                                {
                                    scheduleAt: 'asc',
                                },
                            ],
                            take: 10,
                            select: {
                                id: true,
                                scheduleAt: true,
                                unitId: true,
                                professionalId: true,
                                serviceId: true,
                                unit: {
                                    select: {
                                        name: true,
                                    },
                                },
                                professional: {
                                    select: {
                                        name: true,
                                    },
                                },
                                service: {
                                    select: {
                                        name: true,
                                    },
                                },
                            },
                        });

                        if (appts.length === 0) {
                            nextStage = 'MENU';
                            payload.lastList = null;

                            replyText = [
                                'Não encontrei agendamentos *pendentes* para reagendar. 🙂',
                                '',
                                'Voltando pro menu 👇',
                                '',
                                renderMenu(),
                            ].join('\n');
                        } else {
                            const items = appts
                                .filter(
                                    (a) =>
                                        a.professionalId &&
                                        a.serviceId &&
                                        a.unitId &&
                                        a.unit?.name &&
                                        a.professional?.name &&
                                        a.service?.name
                                )
                                .map((a) => {
                                    const when = formatDateTimeBRFromUtc(
                                        a.scheduleAt
                                    );
                                    const unitLabel = a.unit!.name;
                                    const proLabel = a.professional!.name;
                                    const svcLabel = a.service!.name;

                                    return {
                                        id: a.id,
                                        scheduleAtIso:
                                            a.scheduleAt.toISOString(),
                                        unitId: a.unitId,
                                        unitLabel,
                                        professionalId: a.professionalId!,
                                        professionalLabel: proLabel,
                                        serviceId: a.serviceId!,
                                        serviceLabel: svcLabel,
                                        label: `${when} - ${svcLabel} (${proLabel}) • ${unitLabel}`,
                                    };
                                });

                            const lp: LastListPayload = {
                                type: 'APPOINTMENT',
                                items,
                            };

                            payload.lastList = lp;
                            nextStage = 'RESCHEDULE_SELECT_APPOINTMENT';

                            replyText = [
                                `Empresa: *${companyLabel}* ✅`,
                                '',
                                'Certo! Vamos reagendar. 🔁',
                                '',
                                renderList(
                                    '📌 Qual agendamento você quer reagendar?',
                                    items
                                ),
                            ].join('\n');
                        }
                    } else if (intent === 'CANCEL') {
                        payload.chooseCompanyIntent = null;
                        payload.lastList = null;

                        const appts = await prisma.appointment.findMany({
                            where: {
                                companyId,
                                clientId: clientId ?? undefined,
                                status: 'PENDING',
                                scheduleAt: {
                                    gte: now,
                                },
                            },
                            orderBy: [
                                {
                                    scheduleAt: 'asc',
                                },
                            ],
                            take: 10,
                            select: {
                                id: true,
                                scheduleAt: true,
                                unitId: true,
                                professionalId: true,
                                serviceId: true,
                                unit: {
                                    select: {
                                        name: true,
                                    },
                                },
                                professional: {
                                    select: {
                                        name: true,
                                    },
                                },
                                service: {
                                    select: {
                                        name: true,
                                    },
                                },
                            },
                        });

                        if (appts.length === 0) {
                            nextStage = 'MENU';
                            payload.lastList = null;

                            replyText = [
                                'Não encontrei agendamentos *pendentes* para cancelar. 🙂',
                                '',
                                'Voltando pro menu 👇',
                                '',
                                renderMenu(),
                            ].join('\n');
                        } else {
                            const items = appts
                                .filter(
                                    (a) =>
                                        a.professionalId &&
                                        a.serviceId &&
                                        a.unitId &&
                                        a.unit?.name &&
                                        a.professional?.name &&
                                        a.service?.name
                                )
                                .map((a) => {
                                    const when = formatDateTimeBRFromUtc(
                                        a.scheduleAt
                                    );
                                    const unitLabel = a.unit!.name;
                                    const proLabel = a.professional!.name;
                                    const svcLabel = a.service!.name;

                                    return {
                                        id: a.id,
                                        scheduleAtIso:
                                            a.scheduleAt.toISOString(),
                                        unitId: a.unitId,
                                        unitLabel,
                                        professionalId: a.professionalId!,
                                        professionalLabel: proLabel,
                                        serviceId: a.serviceId!,
                                        serviceLabel: svcLabel,
                                        label: `${when} - ${svcLabel} (${proLabel}) • ${unitLabel}`,
                                    };
                                });

                            const lp: LastListPayload = {
                                type: 'APPOINTMENT',
                                items,
                            };

                            payload.lastList = lp;
                            nextStage = 'CANCEL_SELECT_APPOINTMENT';

                            replyText = [
                                `Empresa: *${companyLabel}* ✅`,
                                '',
                                'Certo! Vamos cancelar. ❌',
                                '',
                                renderList(
                                    '📌 Qual agendamento você quer cancelar?',
                                    items
                                ),
                            ].join('\n');
                        }
                    } else {
                        // padrão: AGENDAR
                        payload.chooseCompanyIntent = null;

                        const units = await listUnits(companyId);
                        if (units.length === 0) {
                            nextStage = 'MENU';
                            payload.lastList = null;
                            replyText = [
                                'Não encontrei unidades ativas no momento. 😕',
                                '',
                                'Voltando pro menu 👇',
                                '',
                                renderMenu(),
                            ].join('\n');
                        } else if (units.length === 1) {
                            const only = units[0];
                            payload.unitId = only.id;
                            payload.unitLabel = only.label;

                            const profs = await listProfessionals(
                                companyId,
                                only.id
                            );

                            if (profs.length === 0) {
                                nextStage = 'MENU';
                                payload.lastList = null;
                                replyText = [
                                    `Unidade selecionada: *${only.label}* ✅`,
                                    '',
                                    'Não encontrei profissionais ativos pra essa unidade. 😕',
                                    '',
                                    'Voltando pro menu 👇',
                                    '',
                                    renderMenu(),
                                ].join('\n');
                            } else {
                                nextStage = 'ASK_PROFESSIONAL';
                                const lpp: LastListPayload = {
                                    type: 'PROFESSIONAL',
                                    items: profs,
                                };
                                payload.lastList = lpp;

                                replyText = [
                                    'Beleza! Vamos agendar. ✅',
                                    '',
                                    `Empresa: *${companyLabel}* ✅`,
                                    `Unidade selecionada: *${only.label}* ✅`,
                                    '',
                                    renderList(
                                        '👤 Profissionais disponíveis:',
                                        profs
                                    ),
                                ].join('\n');
                            }
                        } else {
                            nextStage = 'ASK_UNIT';
                            const lpu: LastListPayload = {
                                type: 'UNIT',
                                items: units,
                            };
                            payload.lastList = lpu;

                            replyText = [
                                'Beleza! Vamos agendar. ✅',
                                '',
                                `Empresa: *${companyLabel}* ✅`,
                                '',
                                renderList('🏬 Escolha a unidade:', units),
                            ].join('\n');
                        }
                    }
                }
            }
        }
    }

    // ============= FAQ_CATEGORY =============
    else if (nextStage === 'FAQ_CATEGORY') {
        const companyId =
            String(payload.companyId ?? '').trim() || String(channel.companyId);

        const categories = await listFaqCategories(companyId);

        if (!categories.length) {
            nextStage = 'MENU';
            payload.lastList = null;
            clearFaqPayload(payload);
            replyText = renderFaqEmpty();
        } else {
            const lp: LastListPayload = {
                type: 'FAQ_CATEGORY',
                items: categories,
            };
            payload.lastList = lp;

            const picked = pickFromLastList({
                cleaned: normalizedText,
                lastList: lp,
            });

            if (!normalizedText || !picked.ok) {
                replyText = renderFaqCategories(categories);
            } else {
                payload.faqCategoryId = picked.id;
                payload.faqCategoryLabel =
                    (picked.meta?.label as string | undefined) ?? 'Categoria';
                payload.faqQuestionId = null;
                payload.faqQuestionLabel = null;
                payload.faqAnswerText = null;

                const questions = await listFaqQuestions(companyId, picked.id);

                if (!questions.length) {
                    nextStage = 'FAQ_CATEGORY';
                    payload.lastList = lp;

                    replyText = [
                        `📌 Categoria: ${payload.faqCategoryLabel}`,
                        '',
                        'Ainda não encontrei perguntas ativas nessa categoria.',
                        '',
                        'Escolha outra categoria ou digite “menu”.',
                    ].join('\n');
                } else {
                    nextStage = 'FAQ_QUESTION';
                    payload.lastList = {
                        type: 'FAQ_QUESTION',
                        items: questions,
                    };

                    await createFaqEvent({
                        companyId,
                        channelId: channel.id,
                        fromPhone,
                        categoryId: picked.id,
                        whatsappSessionId: existing?.id ?? null,
                        eventType: 'FAQ_CATEGORY_SELECTED',
                        payload: {
                            categoryLabel: payload.faqCategoryLabel,
                        },
                    });

                    replyText = renderFaqQuestions(
                        String(payload.faqCategoryLabel ?? 'Categoria'),
                        questions
                    );
                }
            }
        }
    }

    // ============= FAQ_QUESTION =============
    else if (nextStage === 'FAQ_QUESTION') {
        const companyId =
            String(payload.companyId ?? '').trim() || String(channel.companyId);

        if (isBackCommand(normalizedText)) {
            const categories = await listFaqCategories(companyId);

            nextStage = 'FAQ_CATEGORY';
            payload.lastList = {
                type: 'FAQ_CATEGORY',
                items: categories,
            };
            payload.faqQuestionId = null;
            payload.faqQuestionLabel = null;
            payload.faqAnswerText = null;

            replyText = renderFaqCategories(categories);
        } else {
            const categoryId = String(payload.faqCategoryId ?? '').trim();
            const categoryLabel = String(payload.faqCategoryLabel ?? '').trim();

            if (!categoryId) {
                nextStage = 'FAQ_CATEGORY';
                payload.lastList = null;
                replyText = renderFaqCategories(
                    await listFaqCategories(companyId)
                );
            } else {
                const questions = await listFaqQuestions(companyId, categoryId);

                if (!questions.length) {
                    nextStage = 'FAQ_CATEGORY';
                    payload.lastList = {
                        type: 'FAQ_CATEGORY',
                        items: await listFaqCategories(companyId),
                    };
                    replyText = renderFaqCategories(
                        await listFaqCategories(companyId)
                    );
                } else {
                    const lp: LastListPayload = {
                        type: 'FAQ_QUESTION',
                        items: questions,
                    };
                    payload.lastList = lp;

                    const picked = pickFromLastList({
                        cleaned: normalizedText,
                        lastList: lp,
                    });

                    if (!normalizedText || !picked.ok) {
                        replyText = renderFaqQuestions(
                            categoryLabel,
                            questions
                        );
                    } else {
                        const faq = await getFaqAnswer(companyId, picked.id);

                        if (!faq) {
                            replyText = renderFaqQuestions(
                                categoryLabel,
                                questions
                            );
                        } else {
                            payload.faqQuestionId = faq.id;
                            payload.faqQuestionLabel = faq.question;
                            payload.faqAnswerText = faq.answer;
                            payload.faqCategoryId = faq.categoryId;
                            payload.faqCategoryLabel = faq.categoryLabel;
                            payload.lastList = lp;

                            nextStage = 'FAQ_ANSWER';

                            await createFaqEvent({
                                companyId,
                                channelId: channel.id,
                                fromPhone,
                                categoryId: faq.categoryId,
                                faqItemId: faq.id,
                                whatsappSessionId: existing?.id ?? null,
                                eventType: 'FAQ_QUESTION_SELECTED',
                                payload: {
                                    categoryLabel: faq.categoryLabel,
                                    question: faq.question,
                                },
                            });

                            await createFaqEvent({
                                companyId,
                                channelId: channel.id,
                                fromPhone,
                                categoryId: faq.categoryId,
                                faqItemId: faq.id,
                                whatsappSessionId: existing?.id ?? null,
                                eventType: 'FAQ_ANSWER_VIEWED',
                                payload: {
                                    categoryLabel: faq.categoryLabel,
                                    question: faq.question,
                                },
                            });

                            replyText = renderFaqAnswer({
                                question: faq.question,
                                answer: faq.answer,
                            });
                        }
                    }
                }
            }
        }
    }

    // ============= FAQ_ANSWER =============
    else if (nextStage === 'FAQ_ANSWER') {
        const companyId =
            String(payload.companyId ?? '').trim() || String(channel.companyId);

        const categoryId = String(payload.faqCategoryId ?? '').trim();
        const categoryLabel = String(payload.faqCategoryLabel ?? '').trim();
        const question = String(payload.faqQuestionLabel ?? '').trim();
        const answer = String(payload.faqAnswerText ?? '').trim();

        if (normalizedText === '1' || isBackCommand(normalizedText)) {
            if (!categoryId) {
                nextStage = 'FAQ_CATEGORY';
                payload.lastList = {
                    type: 'FAQ_CATEGORY',
                    items: await listFaqCategories(companyId),
                };
                replyText = renderFaqCategories(
                    await listFaqCategories(companyId)
                );
            } else {
                const questions = await listFaqQuestions(companyId, categoryId);

                nextStage = 'FAQ_QUESTION';
                payload.lastList = {
                    type: 'FAQ_QUESTION',
                    items: questions,
                };

                await createFaqEvent({
                    companyId,
                    channelId: channel.id,
                    fromPhone,
                    categoryId,
                    faqItemId:
                        String(payload.faqQuestionId ?? '').trim() || null,
                    whatsappSessionId: existing?.id ?? null,
                    eventType: 'FAQ_BACK_TO_QUESTIONS',
                });

                replyText = renderFaqQuestions(categoryLabel, questions);
            }
        } else if (normalizedText === '2') {
            nextStage = 'MENU';
            payload.lastList = null;
            clearFaqPayload(payload);

            await createFaqEvent({
                companyId,
                channelId: channel.id,
                fromPhone,
                categoryId: categoryId || null,
                faqItemId: String(payload.faqQuestionId ?? '').trim() || null,
                whatsappSessionId: existing?.id ?? null,
                eventType: 'FAQ_BACK_TO_MENU',
            });

            replyText = renderMenu();
        } else {
            replyText = renderFaqAnswer({
                question,
                answer,
            });
        }
    }
    // ============= ASK_UNIT =============
    else if (nextStage === 'ASK_UNIT') {
        // ✅ validação no máximo ao entrar ASK_UNIT (extra segurança)
        if (!String(payload.clientId ?? '').trim()) {
            const clientId = await findClientIdByPhoneInCompany(
                effectiveCompanyId,
                fromPhone
            );

            if (!clientId) {
                nextStage = 'MENU';
                payload.lastList = null;
                payload.clientId = null;
                replyText = renderClientNotFoundAndMenu();
            } else {
                payload.clientId = clientId;
            }
        }

        if (!replyText) {
            const units = await listUnits(effectiveCompanyId);

            if (units.length === 0) {
                nextStage = 'MENU';
                payload.lastList = null;
                replyText = [
                    'Não encontrei unidades ativas no momento. 😕',
                    '',
                    'Voltando pro menu 👇',
                    '',
                    renderMenu(),
                ].join('\n');
            } else if (units.length === 1) {
                const only = units[0];
                payload.unitId = only.id;
                payload.unitLabel = only.label;
                payload.lastList = null;

                const profs = await listProfessionals(
                    effectiveCompanyId,
                    only.id
                );

                if (profs.length === 0) {
                    nextStage = 'MENU';
                    replyText = [
                        `Unidade selecionada: *${only.label}* ✅`,
                        '',
                        'Não encontrei profissionais ativos pra essa unidade. 😕',
                        '',
                        'Voltando pro menu 👇',
                        '',
                        renderMenu(),
                    ].join('\n');
                } else {
                    nextStage = 'ASK_PROFESSIONAL';

                    const lp: LastListPayload = {
                        type: 'PROFESSIONAL',
                        items: profs,
                    };
                    payload.lastList = lp;

                    replyText = [
                        'Beleza! Vamos agendar. ✅',
                        '',
                        `Unidade selecionada: *${only.label}* ✅`,
                        '',
                        renderList('👤 Profissionais disponíveis:', profs),
                    ].join('\n');
                }
            } else {
                const listPayload: LastListPayload = {
                    type: 'UNIT',
                    items: units,
                };
                payload.lastList = listPayload;

                const picked = pickFromLastList({
                    cleaned: normalizedText,
                    lastList: listPayload,
                });

                if (
                    !normalizedText ||
                    normalizedText.length < 1 ||
                    !picked.ok
                ) {
                    replyText = renderList('🏬 Escolha a unidade:', units);
                } else {
                    const unitId = picked.id;
                    const unitLabel =
                        (picked.meta?.label as string | undefined) ?? 'Unidade';

                    payload.unitId = unitId;
                    payload.unitLabel = unitLabel;
                    payload.professionalId = null;
                    payload.professionalLabel = null;

                    payload.categoryId = null;
                    payload.categoryLabel = null;

                    payload.serviceId = null;
                    payload.serviceLabel = null;
                    payload.serviceDurationMinutes = null;
                    payload.servicePriceLabel = null;
                    payload.serviceDescription = null;

                    payload.dateStr = null;
                    payload.timeHHmm = null;

                    payload.lastList = null;

                    nextStage = 'ASK_PROFESSIONAL';

                    const profs = await listProfessionals(
                        effectiveCompanyId,
                        unitId
                    );

                    if (profs.length === 0) {
                        nextStage = 'ASK_UNIT';
                        replyText = [
                            `Unidade selecionada: *${unitLabel}* ✅`,
                            '',
                            'Não encontrei profissionais ativos pra essa unidade. 😕',
                            '',
                            'Escolha outra unidade:',
                        ].join('\n');
                    } else {
                        const lp: LastListPayload = {
                            type: 'PROFESSIONAL',
                            items: profs,
                        };
                        payload.lastList = lp;

                        replyText = [
                            'Beleza! Vamos agendar. ✅',
                            '',
                            `Unidade selecionada: *${unitLabel}* ✅`,
                            '',
                            renderList('👤 Profissionais disponíveis:', profs),
                        ].join('\n');
                    }
                }
            }
        }
    }

    // ASK_PROFESSIONAL
    else if (nextStage === 'ASK_PROFESSIONAL') {
        const unitId = String(payload.unitId ?? '').trim();
        if (!unitId) {
            nextStage = 'ASK_UNIT';
            payload.lastList = null;
            replyText = [
                'Beleza! Vamos agendar. ✅',
                '',
                'Escolha a unidade:',
            ].join('\n');
        } else {
            const profs = await listProfessionals(effectiveCompanyId, unitId);

            if (profs.length === 0) {
                nextStage = 'ASK_UNIT';
                payload.professionalId = null;
                payload.professionalLabel = null;
                payload.lastList = null;

                replyText = [
                    'Não encontrei profissionais ativos para essa unidade. 😕',
                    '',
                    'Escolha outra unidade:',
                ].join('\n');
            } else {
                const listPayload: LastListPayload = {
                    type: 'PROFESSIONAL',
                    items: profs,
                };
                payload.lastList = listPayload;

                const picked = pickFromLastList({
                    cleaned: normalizedText,
                    lastList: listPayload,
                });

                if (!normalizedText || !picked.ok) {
                    replyText = renderList(
                        '👤 Profissionais disponíveis:',
                        profs
                    );
                } else {
                    payload.professionalId = picked.id;
                    payload.professionalLabel =
                        (picked.meta?.label as string | undefined) ??
                        'Profissional';

                    payload.categoryId = null;
                    payload.categoryLabel = null;

                    payload.serviceId = null;
                    payload.serviceLabel = null;
                    payload.serviceDurationMinutes = null;
                    payload.servicePriceLabel = null;
                    payload.serviceDescription = null;

                    payload.dateStr = null;
                    payload.timeHHmm = null;

                    payload.lastList = null;
                    nextStage = 'ASK_CATEGORY';

                    const categories = await listCategories(
                        effectiveCompanyId,
                        unitId
                    );
                    if (categories.length === 0) {
                        nextStage = 'ASK_PROFESSIONAL';
                        replyText = [
                            `Profissional selecionado: *${payload.professionalLabel}* ✅`,
                            '',
                            'Não encontrei categorias com serviços ativos para essa unidade. 😕',
                            '',
                            'Escolha outro profissional ou digite “menu”.',
                        ].join('\n');
                    } else {
                        const lp: LastListPayload = {
                            type: 'CATEGORY',
                            items: categories,
                        };
                        payload.lastList = lp;

                        replyText = [
                            `Profissional selecionado: *${payload.professionalLabel}* ✅`,
                            '',
                            renderList(
                                '🔖 Categorias disponíveis:',
                                categories
                            ),
                        ].join('\n');
                    }
                }
            }
        }
    }

    // ASK_CATEGORY
    else if (nextStage === 'ASK_CATEGORY') {
        const unitId = String(payload.unitId ?? '').trim();
        const professionalId = String(payload.professionalId ?? '').trim();

        if (!unitId) {
            nextStage = 'ASK_UNIT';
            payload.lastList = null;
            replyText = [
                'Beleza! Vamos agendar. ✅',
                '',
                'Escolha a unidade:',
            ].join('\n');
        } else if (!professionalId) {
            nextStage = 'ASK_PROFESSIONAL';
            payload.lastList = null;
            replyText = [
                'Pra agendar, preciso que você escolha um profissional.',
                '',
                'Vamos lá:',
            ].join('\n');
        } else {
            const categories = await listCategories(effectiveCompanyId, unitId);

            if (categories.length === 0) {
                nextStage = 'ASK_PROFESSIONAL';
                payload.categoryId = null;
                payload.categoryLabel = null;
                payload.lastList = null;

                replyText = [
                    'Não encontrei categorias com serviços ativos para essa unidade. 😕',
                    '',
                    'Escolha outro profissional ou digite “menu”.',
                ].join('\n');
            } else {
                const listPayload: LastListPayload = {
                    type: 'CATEGORY',
                    items: categories,
                };
                payload.lastList = listPayload;

                const picked = pickFromLastList({
                    cleaned: normalizedText,
                    lastList: listPayload,
                });

                if (!normalizedText || !picked.ok) {
                    replyText = renderList(
                        '🔖 Escolha a categoria:',
                        categories
                    );
                } else {
                    payload.categoryId = picked.id;
                    payload.categoryLabel =
                        (picked.meta?.label as string | undefined) ??
                        'Categoria';

                    payload.serviceId = null;
                    payload.serviceLabel = null;
                    payload.serviceDurationMinutes = null;
                    payload.servicePriceLabel = null;
                    payload.serviceDescription = null;

                    payload.dateStr = null;
                    payload.timeHHmm = null;

                    const svcs = await listServices(
                        effectiveCompanyId,
                        unitId,
                        picked.id
                    );

                    if (svcs.length === 0) {
                        payload.categoryId = null;
                        payload.categoryLabel = null;
                        nextStage = 'ASK_CATEGORY';
                        payload.lastList = null;

                        replyText = [
                            `Categoria selecionada: *${picked.meta?.label ?? 'Categoria'}*`,
                            '',
                            'Não encontrei serviços ativos nessa categoria. 😕',
                            '',
                            'Escolha outra categoria:',
                        ].join('\n');
                    } else {
                        payload.lastList = {
                            type: 'SERVICE',
                            items: svcs,
                        };

                        nextStage = 'ASK_SERVICE';

                        replyText = [
                            `Categoria selecionada: *${payload.categoryLabel}* ✅`,
                            '',
                            renderServiceList('⭐ Serviços disponíveis:', svcs),
                        ].join('\n');
                    }
                }
            }
        }
    }

    // ASK_SERVICE
    else if (nextStage === 'ASK_SERVICE') {
        const unitId = String(payload.unitId ?? '').trim();
        const professionalId = String(payload.professionalId ?? '').trim();
        const categoryId = String(payload.categoryId ?? '').trim();

        if (!unitId) {
            nextStage = 'ASK_UNIT';
            payload.lastList = null;
            replyText = [
                'Beleza! Vamos agendar. ✅',
                '',
                'Escolha a unidade:',
            ].join('\n');
        } else if (!professionalId) {
            nextStage = 'ASK_PROFESSIONAL';
            payload.lastList = null;
            replyText = [
                'Pra agendar, preciso que você escolha um profissional (obrigatório).',
                '',
                'Vamos lá:',
            ].join('\n');
        } else if (!categoryId) {
            nextStage = 'ASK_CATEGORY';
            payload.lastList = null;
            replyText = [
                'Agora preciso que você escolha uma categoria.',
                '',
                'Vamos lá:',
            ].join('\n');
        } else {
            const svcs = await listServices(
                effectiveCompanyId,
                unitId,
                categoryId
            );

            if (svcs.length === 0) {
                nextStage = 'ASK_PROFESSIONAL';
                payload.serviceId = null;
                payload.serviceLabel = null;
                payload.serviceDurationMinutes = null;
                payload.lastList = null;

                replyText = [
                    'Não encontrei serviços ativos para essa unidade. 😕',
                    '',
                    'Escolha outro profissional ou digite “menu”.',
                ].join('\n');
            } else {
                const listPayload: LastListPayload = {
                    type: 'SERVICE',
                    items: svcs,
                };
                payload.lastList = listPayload;

                const picked = pickFromLastList({
                    cleaned: normalizedText,
                    lastList: listPayload,
                });

                if (!normalizedText || !picked.ok) {
                    replyText = renderServiceList(
                        '⭐ Escolha o serviço:',
                        svcs
                    );
                } else {
                    payload.serviceId = picked.id;

                    // a label agora pode ter quebra de linha (preço/descrição). Para “nome do serviço”,
                    // usamos o campo name e deixamos label apenas para listar.
                    payload.serviceLabel =
                        (picked.meta?.name as string | undefined) ??
                        (picked.meta?.label as string | undefined) ??
                        'Serviço';

                    payload.serviceDurationMinutes =
                        Number(picked.meta?.durationMinutes || 30) || 30;

                    // ✅ novos campos no payload (pra mostrar no resumo e outras mensagens)
                    payload.servicePriceLabel =
                        (picked.meta?.priceLabel as string | undefined) ?? null;

                    payload.serviceDescription =
                        (picked.meta?.description as
                            | string
                            | null
                            | undefined) ?? null;

                    payload.lastList = null;
                    nextStage = 'ASK_DAY';

                    const internalOrigin = getInternalOrigin();

                    const days = await listNextAvailableDays({
                        originUrl: internalOrigin,
                        companyId: effectiveCompanyId,
                        unitId,
                        professionalId,
                        serviceId: payload.serviceId,
                    });

                    if (days.length === 0) {
                        nextStage = 'ASK_SERVICE';
                        replyText = [
                            `Serviço selecionado: *${payload.serviceLabel}* ✅`,
                            '',
                            'Não encontrei dias com horários disponíveis nos próximos dias. 😕',
                            '',
                            'Escolha outro serviço ou digite “menu”.',
                        ].join('\n');
                    } else {
                        const lp: LastListPayload = {
                            type: 'DAY',
                            items: days,
                        };
                        payload.lastList = lp;

                        replyText = [
                            `Serviço selecionado: *${payload.serviceLabel}* ✅`,
                            '',
                            renderList('📅 Dias disponíveis:', days),
                        ].join('\n');
                    }
                }
            }
        }
    }

    // ASK_DAY
    else if (nextStage === 'ASK_DAY') {
        const unitId = String(payload.unitId ?? '').trim();
        const professionalId = String(payload.professionalId ?? '').trim();
        const serviceId = String(payload.serviceId ?? '').trim();

        if (!unitId || !professionalId || !serviceId) {
            nextStage = 'ASK_UNIT';
            payload.lastList = null;
            replyText = [
                'Beleza! Vamos agendar. ✅',
                '',
                'Escolha a unidade:',
            ].join('\n');
        } else {
            let days: Array<{ id: string; label: string; dateStr: string }> =
                (lastList?.type === 'DAY' ? (lastList.items as any) : null) ??
                [];

            const internalOrigin = getInternalOrigin();

            if (!days.length) {
                days = await listNextAvailableDays({
                    originUrl: internalOrigin,
                    companyId: effectiveCompanyId,
                    unitId,
                    professionalId,
                    serviceId,
                });
            }

            if (!days.length) {
                nextStage = 'ASK_SERVICE';
                payload.lastList = null;
                replyText = [
                    'Não encontrei dias disponíveis no momento. 😕',
                    '',
                    'Escolha outro serviço ou digite “menu”.',
                ].join('\n');
            } else {
                const lp: LastListPayload = { type: 'DAY', items: days };
                payload.lastList = lp;

                const picked = pickFromLastList({
                    cleaned: normalizedText,
                    lastList: lp,
                });

                if (!normalizedText || !picked.ok) {
                    replyText = renderList('📅 Escolha o dia:', days);
                } else {
                    const dateStr =
                        (picked.meta?.dateStr as string | undefined) ??
                        String(picked.id);

                    payload.dateStr = dateStr;
                    payload.lastList = null;
                    nextStage = 'ASK_TIME';

                    const avail = await fetchAvailabilityTimes({
                        originUrl: internalOrigin,
                        unitId,
                        professionalId,
                        serviceId,
                        dateStr,
                    });

                    const times = avail.ok
                        ? filterFutureTimesForDateStr(dateStr, avail.times)
                        : [];

                    if (!times.length) {
                        nextStage = 'ASK_DAY';
                        replyText = [
                            `Dia selecionado: *${formatDateBR(dateStr)} (${weekdayShortPt(
                                dateStr
                            )})* ✅`,
                            '',
                            'Não encontrei horários disponíveis para esse dia. 😕',
                            '',
                            'Escolha outro dia:',
                        ].join('\n');
                    } else {
                        const items = times.map((t: string) => ({
                            id: t,
                            label: t,
                            time: t,
                        }));

                        const timeList: LastListPayload = {
                            type: 'TIME',
                            items,
                        };
                        payload.lastList = timeList;

                        replyText = [
                            `Dia selecionado: *${formatDateBR(dateStr)} (${weekdayShortPt(
                                dateStr
                            )})* ✅`,
                            '',
                            renderList('⏰ Horários disponíveis:', items),
                        ].join('\n');
                    }
                }
            }
        }
    }

    // ASK_TIME
    else if (nextStage === 'ASK_TIME') {
        const dateStr = String(payload.dateStr ?? '').trim();
        const unitId = String(payload.unitId ?? '').trim();
        const professionalId = String(payload.professionalId ?? '').trim();
        const serviceId = String(payload.serviceId ?? '').trim();

        const internalOrigin = getInternalOrigin();

        if (!dateStr || !unitId || !professionalId || !serviceId) {
            nextStage = 'ASK_DAY';
            payload.lastList = null;
            replyText =
                'Vamos escolher o dia primeiro. Digite “menu” para recomeçar.';
        } else {
            const lp =
                lastList?.type === 'TIME'
                    ? (lastList as LastListPayload)
                    : null;

            let times: Array<{ id: string; label: string; time: string }> =
                lp?.type === 'TIME' ? (lp.items as any) : [];

            if (!times.length) {
                const avail = await fetchAvailabilityTimes({
                    originUrl: internalOrigin,
                    unitId,
                    professionalId,
                    serviceId,
                    dateStr,
                });

                const rawTimes = avail.ok
                    ? filterFutureTimesForDateStr(dateStr, avail.times)
                    : [];

                times = rawTimes.map((t: string) => ({
                    id: t,
                    label: t,
                    time: t,
                }));

                payload.lastList = {
                    type: 'TIME',
                    items: times,
                };
            }

            if (!times.length) {
                nextStage = 'ASK_DAY';
                payload.lastList = null;
                replyText = [
                    'Não encontrei horários disponíveis agora. 😕',
                    '',
                    'Escolha outro dia:',
                ].join('\n');
            } else {
                const picked = pickFromLastList({
                    cleaned: normalizedText,
                    lastList: payload.lastList as any,
                });

                if (!normalizedText || !picked.ok) {
                    replyText = renderList('⏰ Escolha o horário:', times);
                } else {
                    const timeHHmm =
                        (picked.meta?.time as string | undefined) ??
                        String(picked.id);

                    payload.timeHHmm = timeHHmm;
                    payload.lastList = null;

                    nextStage = 'CONFIRM_APPOINTMENT';
                    replyText = renderConfirmSummary(payload);
                }
            }
        }
    }

    // CONFIRM_APPOINTMENT
    else if (nextStage === 'CONFIRM_APPOINTMENT') {
        if (normalizedText === '1') {
            const unitId = String(payload.unitId ?? '').trim();
            const professionalId = String(payload.professionalId ?? '').trim();
            const serviceId = String(payload.serviceId ?? '').trim();
            const dateStr = String(payload.dateStr ?? '').trim();
            const timeHHmm = String(payload.timeHHmm ?? '').trim();

            const companyId =
                String(payload.companyId ?? '').trim() || effectiveCompanyId;

            const scheduleAtUtc = buildScheduleAtUtcFromDateAndTime(
                dateStr,
                timeHHmm
            );

            if (!unitId || !professionalId || !serviceId || !scheduleAtUtc) {
                nextStage = 'ASK_UNIT';
                payload.lastList = null;
                replyText = [
                    'Ops, perdi algumas infos do agendamento. 😅',
                    '',
                    'Vamos recomeçar:',
                ].join('\n');
            } else {
                const unit = await prisma.unit.findFirst({
                    where: {
                        id: unitId,
                        companyId,
                        isActive: true,
                    },
                    select: {
                        bookingWindowDays: true,
                        reminderLeadHours: true,
                    },
                });

                const bookingWindowDays =
                    typeof unit?.bookingWindowDays === 'number'
                        ? Math.max(
                              1,
                              Math.min(365, Math.trunc(unit.bookingWindowDays))
                          )
                        : 30;

                const todayParts = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'America/Sao_Paulo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                }).formatToParts(new Date());

                const y = Number(
                    todayParts.find((p) => p.type === 'year')?.value ?? '0'
                );
                const m = Number(
                    todayParts.find((p) => p.type === 'month')?.value ?? '0'
                );
                const d = Number(
                    todayParts.find((p) => p.type === 'day')?.value ?? '0'
                );

                const todayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));

                const maxDate = new Date(todayStart);
                maxDate.setUTCDate(
                    maxDate.getUTCDate() + bookingWindowDays - 1
                );

                const target = new Date(scheduleAtUtc);
                target.setUTCHours(0, 0, 0, 0);

                if (target.getTime() > maxDate.getTime()) {
                    nextStage = 'ASK_DAY';

                    const internalOrigin = getInternalOrigin();
                    const days = await listNextAvailableDays({
                        originUrl: internalOrigin,
                        companyId,
                        unitId,
                        professionalId,
                        serviceId,
                    });

                    payload.lastList = {
                        type: 'DAY',
                        items: days,
                    };

                    replyText = [
                        '⚠️ Esse dia está fora da agenda disponível.',
                        '',
                        `Essa unidade permite agendamentos em até *${bookingWindowDays} dias*.`,
                        '',
                        'Escolha um dia válido 👇',
                        '',
                        renderList('📅 Dias disponíveis:', days),
                    ].join('\n');
                } else {
                    let clientId = String(payload.clientId ?? '').trim();

                    if (!clientId) {
                        const found = await findClientIdByPhoneInCompany(
                            companyId,
                            fromPhone
                        );
                        clientId = found ?? '';
                    }

                    if (!clientId) {
                        nextStage = 'MENU';
                        payload.lastList = null;
                        payload.clientId = null;
                        replyText = renderClientNotFoundAndMenu();
                    } else {
                        const svc = await prisma.service.findFirst({
                            where: { id: serviceId, companyId },
                            select: { id: true, name: true },
                        });

                        const description =
                            svc?.name ??
                            String(payload.serviceLabel ?? 'Atendimento');

                        const client = await prisma.user.findUnique({
                            where: { id: clientId },
                            select: { name: true, phone: true, email: true },
                        });

                        const clientName =
                            String(client?.name ?? '').trim() ||
                            String(client?.email ?? '').split('@')[0] ||
                            `Cliente ${fromPhone.slice(-4)}`;

                        const isReschedule = payload.isReschedule === true;
                        const rescheduleId = String(
                            payload.rescheduleAppointmentId ?? ''
                        ).trim();

                        if (isReschedule) {
                            if (!rescheduleId) {
                                nextStage = 'MENU';
                                payload.lastList = null;
                                payload.isReschedule = false;

                                replyText = [
                                    'Ops, perdi qual agendamento você queria reagendar. 😅',
                                    '',
                                    'Voltando pro menu 👇',
                                    '',
                                    renderMenu(),
                                ].join('\n');
                            } else {
                                const conflict =
                                    await prisma.appointment.findFirst({
                                        where: {
                                            companyId,
                                            unitId,
                                            professionalId,
                                            scheduleAt: scheduleAtUtc,
                                            status: {
                                                in: ['PENDING', 'DONE'],
                                            },
                                            NOT: { id: rescheduleId },
                                        },
                                        select: { id: true },
                                    });

                                if (conflict) {
                                    nextStage = 'ASK_TIME';
                                    replyText = [
                                        'Esse horário acabou de ficar indisponível. 😕',
                                        '',
                                        'Escolha outro horário:',
                                    ].join('\n');
                                } else {
                                    const safeLeadHours = Math.max(
                                        1,
                                        Math.min(
                                            168,
                                            Number(unit?.reminderLeadHours) ||
                                                24
                                        )
                                    );

                                    const diffMs =
                                        scheduleAtUtc.getTime() - now.getTime();
                                    const diffHours = diffMs / (1000 * 60 * 60);

                                    const confirmationStatus =
                                        diffHours >= safeLeadHours
                                            ? 'PENDING'
                                            : 'NOT_REQUIRED';

                                    const updatedAppointment =
                                        await prisma.appointment.update({
                                            where: { id: rescheduleId },
                                            data: {
                                                unitId,
                                                professionalId,
                                                serviceId,
                                                scheduleAt: scheduleAtUtc,
                                                status: 'PENDING',
                                                confirmationStatus,
                                                description,
                                            },
                                            select: { id: true },
                                        });

                                    // 🎯 NOVO: tenta gerar invite no reagendamento
                                    let inviteTextExtra = '';

                                    try {
                                        const invite =
                                            await handleAppointmentInvite(
                                                updatedAppointment.id
                                            );

                                        if (
                                            invite.shouldSend &&
                                            invite.inviteUrl
                                        ) {
                                            inviteTextExtra = [
                                                '',
                                                '📅 Adicione ao seu calendário:',
                                                invite.inviteUrl,
                                            ].join('\n');
                                        }
                                    } catch (err) {
                                        console.error(
                                            '[calendar][invite][reschedule][error]',
                                            {
                                                appointmentId:
                                                    updatedAppointment.id,
                                                error: String(err),
                                            }
                                        );
                                    }

                                    nextStage = 'DONE';
                                    payload.lastList = null;
                                    payload.isReschedule = false;
                                    payload.rescheduleAppointmentId = null;
                                    payload.rescheduleOldAtIso = null;

                                    replyText = [
                                        '✅ Reagendamento concluído!',
                                        inviteTextExtra,
                                        '',
                                        'Se quiser fazer outro, digite *menu*.',
                                    ].join('\n');
                                }
                            }
                        } else {
                            const conflict = await prisma.appointment.findFirst(
                                {
                                    where: {
                                        companyId,
                                        unitId,
                                        professionalId,
                                        scheduleAt: scheduleAtUtc,
                                        status: { in: ['PENDING', 'DONE'] },
                                    },
                                    select: { id: true },
                                }
                            );

                            if (conflict) {
                                nextStage = 'ASK_TIME';
                                replyText = [
                                    'Esse horário acabou de ficar indisponível. 😕',
                                    '',
                                    'Escolha outro horário:',
                                ].join('\n');
                            } else {
                                const safeLeadHours = Math.max(
                                    1,
                                    Math.min(
                                        168,
                                        Number(unit?.reminderLeadHours) || 24
                                    )
                                );

                                const diffMs =
                                    scheduleAtUtc.getTime() - now.getTime();
                                const diffHours = diffMs / (1000 * 60 * 60);

                                const confirmationStatus =
                                    diffHours >= safeLeadHours
                                        ? 'PENDING'
                                        : 'NOT_REQUIRED';

                                const created = await prisma.appointment.create(
                                    {
                                        data: {
                                            companyId,
                                            unitId,
                                            professionalId,
                                            serviceId,
                                            clientId,
                                            clientName,
                                            phone:
                                                String(
                                                    client?.phone ?? ''
                                                ).trim() || fromPhone,
                                            description,
                                            scheduleAt: scheduleAtUtc,
                                            confirmationStatus,

                                            // ✅ NOVO: rastreio de origem (WhatsApp)
                                            createdByRole: 'CLIENT',
                                            createdSource: 'CLIENT_WHATSAPP',
                                            createdByUserId: clientId,
                                        },
                                        select: { id: true },
                                    }
                                );

                                // 🎯 NOVO: tenta gerar invite
                                let inviteTextExtra = '';

                                try {
                                    const invite =
                                        await handleAppointmentInvite(
                                            created.id
                                        );

                                    if (invite.shouldSend && invite.inviteUrl) {
                                        inviteTextExtra = [
                                            '',
                                            '📅 Adicione ao seu calendário:',
                                            invite.inviteUrl,
                                        ].join('\n');
                                    }
                                } catch (err) {
                                    console.error('[calendar][invite][error]', {
                                        appointmentId: created.id,
                                        error: String(err),
                                    });
                                }

                                nextStage = 'DONE';
                                payload.lastList = null;

                                replyText = [
                                    '✅ Seu agendamento foi concluído!',
                                    '',
                                    `Protocolo: *${created.id}*`,
                                    inviteTextExtra,
                                    '',
                                    'Se quiser fazer outro, digite *menu*.',
                                ].join('\n');
                            }
                        }
                    }
                }
            }
        } else {
            replyText = renderConfirmSummary(payload);
        }
    }

    // ============= RESCHEDULE_SELECT_APPOINTMENT =============
    else if (nextStage === 'RESCHEDULE_SELECT_APPOINTMENT') {
        const lp =
            lastList?.type === 'APPOINTMENT'
                ? (lastList as LastListPayload)
                : null;

        const items = lp?.type === 'APPOINTMENT' ? (lp.items as any[]) : [];

        if (!items.length) {
            nextStage = 'MENU';
            payload.lastList = null;
            replyText = renderMenu();
        } else {
            const picked = pickFromLastList({
                cleaned: normalizedText,
                lastList: lp,
            });

            if (!normalizedText || !picked.ok) {
                replyText = renderList(
                    '📌 Qual agendamento você quer reagendar?',
                    items
                );
            } else {
                const meta = picked.meta ?? {};

                payload.isReschedule = true;

                payload.rescheduleAppointmentId = picked.id;
                payload.rescheduleOldAtIso = String(meta.scheduleAtIso ?? '');

                payload.unitId = null;
                payload.unitLabel = null;

                payload.professionalId = null;
                payload.professionalLabel = null;

                payload.categoryId = null;
                payload.categoryLabel = null;

                payload.serviceId = null;
                payload.serviceLabel = null;
                payload.serviceDurationMinutes = null;
                payload.servicePriceLabel = null;
                payload.serviceDescription = null;

                payload.dateStr = null;
                payload.timeHHmm = null;

                payload.lastList = null;

                nextStage = 'ASK_UNIT';

                const units = await listUnits(effectiveCompanyId);

                if (units.length === 0) {
                    nextStage = 'MENU';
                    payload.lastList = null;
                    payload.isReschedule = false;
                    replyText = [
                        'Não encontrei unidades ativas no momento. 😕',
                        '',
                        'Voltando pro menu 👇',
                        '',
                        renderMenu(),
                    ].join('\n');
                } else if (units.length === 1) {
                    const only = units[0];
                    payload.unitId = only.id;
                    payload.unitLabel = only.label;

                    const profs = await listProfessionals(
                        effectiveCompanyId,
                        only.id
                    );

                    if (profs.length === 0) {
                        nextStage = 'MENU';
                        payload.lastList = null;
                        payload.isReschedule = false;
                        replyText = [
                            `Unidade selecionada: *${only.label}* ✅`,
                            '',
                            'Não encontrei profissionais ativos pra essa unidade. 😕',
                            '',
                            'Voltando pro menu 👇',
                            '',
                            renderMenu(),
                        ].join('\n');
                    } else {
                        nextStage = 'ASK_PROFESSIONAL';
                        const lpp: LastListPayload = {
                            type: 'PROFESSIONAL',
                            items: profs,
                        };
                        payload.lastList = lpp;

                        replyText = [
                            'Beleza! Vamos reagendar. 🔁',
                            '',
                            'Agora vamos escolher tudo de novo, começando pela unidade.',
                            '',
                            `Unidade selecionada: *${only.label}* ✅`,
                            '',
                            renderList('👤 Profissionais disponíveis:', profs),
                        ].join('\n');
                    }
                } else {
                    const lpu: LastListPayload = { type: 'UNIT', items: units };
                    payload.lastList = lpu;

                    replyText = [
                        'Beleza! Vamos reagendar. 🔁',
                        '',
                        'Agora vamos escolher tudo de novo.',
                        '',
                        renderList('🏬 Escolha a unidade:', units),
                    ].join('\n');
                }
            }
        }
    }

    // ============= CANCEL_SELECT_APPOINTMENT =============
    else if (nextStage === 'CANCEL_SELECT_APPOINTMENT') {
        const lp =
            lastList?.type === 'APPOINTMENT'
                ? (lastList as LastListPayload)
                : null;

        const items = lp?.type === 'APPOINTMENT' ? (lp.items as any[]) : [];

        if (!items.length) {
            nextStage = 'MENU';
            payload.lastList = null;
            replyText = renderMenu();
        } else {
            const picked = pickFromLastList({
                cleaned: normalizedText,
                lastList: lp,
            });

            if (!normalizedText || !picked.ok) {
                replyText = renderList(
                    '📌 Qual agendamento você quer cancelar?',
                    items
                );
            } else {
                const meta = picked.meta ?? {};

                payload.isCancel = true;
                payload.cancelAppointmentId = picked.id;

                payload.cancelOldAtIso = String(meta.scheduleAtIso ?? '');
                payload.cancelUnitLabel = String(meta.unitLabel ?? '');
                payload.cancelProfessionalLabel = String(
                    meta.professionalLabel ?? ''
                );
                payload.cancelServiceLabel = String(meta.serviceLabel ?? '');

                payload.lastList = null;
                nextStage = 'CANCEL_CONFIRM';

                replyText = renderCancelConfirm(payload);
            }
        }
    }

    // ============= CANCEL_CONFIRM =============
    else if (nextStage === 'CANCEL_CONFIRM') {
        if (normalizedText === '1') {
            const companyId =
                String(payload.companyId ?? '').trim() || effectiveCompanyId;

            let clientId = String(payload.clientId ?? '').trim();
            if (!clientId) {
                const found = await findClientIdByPhoneInCompany(
                    companyId,
                    fromPhone
                );
                clientId = found ?? '';
            }

            if (!clientId) {
                nextStage = 'MENU';
                payload.lastList = null;
                payload.clientId = null;
                payload.isCancel = false;
                payload.cancelAppointmentId = null;
                replyText = renderClientNotFoundAndMenu();
            } else {
                const cancelId = String(
                    payload.cancelAppointmentId ?? ''
                ).trim();

                if (!cancelId) {
                    nextStage = 'MENU';
                    payload.lastList = null;
                    payload.isCancel = false;
                    replyText = [
                        'Ops, perdi qual agendamento você queria cancelar. 😅',
                        '',
                        'Voltando pro menu 👇',
                        '',
                        renderMenu(),
                    ].join('\n');
                } else {
                    // ✅ revalida: ainda pertence ao cliente, ainda é PENDING, ainda é futuro
                    const appt = await prisma.appointment.findFirst({
                        where: {
                            id: cancelId,
                            companyId,
                            clientId,
                        },
                        select: {
                            id: true,
                            status: true,
                            scheduleAt: true,
                        },
                    });

                    if (!appt) {
                        nextStage = 'MENU';
                        payload.lastList = null;
                        payload.isCancel = false;
                        payload.cancelAppointmentId = null;

                        replyText = [
                            'Não encontrei esse agendamento (talvez já tenha sido alterado). 😕',
                            '',
                            'Voltando pro menu 👇',
                            '',
                            renderMenu(),
                        ].join('\n');
                    } else if (String(appt.status) !== 'PENDING') {
                        nextStage = 'MENU';
                        payload.lastList = null;
                        payload.isCancel = false;
                        payload.cancelAppointmentId = null;

                        replyText = [
                            'Esse agendamento não está mais como *pendente*. 🙂',
                            '',
                            'Voltando pro menu 👇',
                            '',
                            renderMenu(),
                        ].join('\n');
                    } else if (appt.scheduleAt.getTime() < now.getTime()) {
                        nextStage = 'MENU';
                        payload.lastList = null;
                        payload.isCancel = false;
                        payload.cancelAppointmentId = null;

                        replyText = [
                            'Esse agendamento já passou e não pode ser cancelado por aqui. 🙂',
                            '',
                            'Voltando pro menu 👇',
                            '',
                            renderMenu(),
                        ].join('\n');
                    } else {
                        await prisma.appointment.update({
                            where: { id: cancelId },
                            data: {
                                status: 'CANCELED',
                            },
                            select: { id: true },
                        });

                        nextStage = 'DONE';
                        payload.lastList = null;

                        payload.isCancel = false;
                        payload.cancelAppointmentId = null;
                        payload.cancelOldAtIso = null;
                        payload.cancelUnitLabel = null;
                        payload.cancelProfessionalLabel = null;
                        payload.cancelServiceLabel = null;

                        replyText = [
                            '✅ Cancelamento concluído!',
                            '',
                            'Se quiser fazer outro, digite *menu*.',
                        ].join('\n');
                    }
                }
            }
        } else {
            replyText = renderCancelConfirm(payload);
        }
    }

    // ============= SIGNUP_OFFER =============
    else if (nextStage === 'SIGNUP_OFFER') {
        if (normalizedText === '1' || normalizedText === 'sim') {
            const companies = await listActiveCompaniesForSignup();

            if (companies.length === 0) {
                nextStage = 'MENU';
                replyText = [
                    'Não encontrei empresas ativas para cadastrar agora. 😕',
                    '',
                    'Voltando pro menu 👇',
                    '',
                    renderMenu(),
                ].join('\n');
            } else {
                nextStage = 'SIGNUP_CHOOSE_COMPANY';

                const lp: LastListPayload = {
                    type: 'COMPANY',
                    items: companies.map((c) => ({ id: c.id, label: c.label })),
                };
                payload.lastList = lp;

                replyText = [
                    'Perfeito! Vamos criar seu cadastro. ✍️',
                    '',
                    renderList('🏢 Escolha a empresa:', lp.items),
                ].join('\n');
            }
        } else if (
            normalizedText === '2' ||
            normalizedText === 'nao' ||
            normalizedText === 'não'
        ) {
            nextStage = 'MENU';
            payload.lastList = null;

            replyText = [
                'Sem problemas 🙂',
                '',
                'Voltando pro menu 👇',
                '',
                renderMenu(),
            ].join('\n');
        } else {
            replyText = renderSignupOffer();
        }
    }

    // ============= SIGNUP_CHOOSE_COMPANY =============
    else if (nextStage === 'SIGNUP_CHOOSE_COMPANY') {
        const lp =
            lastList?.type === 'COMPANY' ? (lastList as LastListPayload) : null;

        const items = lp?.type === 'COMPANY' ? (lp.items as any[]) : [];

        if (!items.length) {
            nextStage = 'SIGNUP_OFFER';
            payload.lastList = null;
            replyText = renderSignupOffer();
        } else {
            const picked = pickFromLastList({
                cleaned: normalizedText,
                lastList: lp,
            });

            if (!normalizedText || !picked.ok) {
                replyText = renderList('🏢 Escolha a empresa:', items);
            } else {
                payload.signupCompanyId = picked.id;
                payload.signupCompanyLabel =
                    (picked.meta?.label as string | undefined) ?? 'Empresa';

                payload.lastList = null;
                nextStage = 'SIGNUP_ASK_NAME';

                replyText = [
                    `Empresa: *${payload.signupCompanyLabel}* ✅`,
                    '',
                    'Qual seu *nome completo*?',
                ].join('\n');
            }
        }
    }

    // ============= SIGNUP_ASK_NAME =============
    else if (nextStage === 'SIGNUP_ASK_NAME') {
        const name = normalizeInboundText(text);
        if (!name || name.length < 3) {
            replyText = [
                'Me diga seu *nome completo* (mínimo 3 caracteres). 🙂',
            ].join('\n');
        } else {
            payload.signupName = name.trim();
            nextStage = 'SIGNUP_ASK_EMAIL';

            replyText = [
                `Nome: *${payload.signupName}* ✅`,
                '',
                'Agora me diga seu *email*:',
            ].join('\n');
        }
    }

    // ============= SIGNUP_ASK_EMAIL =============
    else if (nextStage === 'SIGNUP_ASK_EMAIL') {
        const email = normalizeInboundText(text);
        if (!isValidEmailSimple(email)) {
            replyText = [
                'Esse email parece inválido. 😅',
                '',
                'Digite novamente (ex: nome@email.com)',
            ].join('\n');
        } else {
            payload.signupEmail = email.trim().toLowerCase();

            nextStage = 'SIGNUP_CONFIRM_PHONE';

            replyText = [
                `Email: *${payload.signupEmail}* ✅`,
                '',
                'Seu telefone do WhatsApp é este mesmo?',
                `${maskPhoneDigits(fromPhone)}`,
                '',
                '1) Sim, usar este',
                '2) Não, informar outro',
            ].join('\n');
        }
    }

    // ============= SIGNUP_CONFIRM_PHONE =============
    else if (nextStage === 'SIGNUP_CONFIRM_PHONE') {
        if (normalizedText === '1' || normalizedText === 'sim') {
            payload.signupPhone = fromPhone;
            nextStage = 'SIGNUP_ASK_BIRTHDATE';

            replyText = [
                `Telefone: *${maskPhoneDigits(payload.signupPhone)}* ✅`,
                '',
                'Qual sua *data de nascimento*? (dd/mm/aaaa)',
            ].join('\n');
        } else if (
            normalizedText === '2' ||
            normalizedText === 'nao' ||
            normalizedText === 'não'
        ) {
            nextStage = 'SIGNUP_ASK_PHONE';
            replyText = [
                'Beleza! Digite o telefone com DDD.',
                'Ex: 11999999999 ou 5511999999999',
            ].join('\n');
        } else {
            replyText = ['Responda com *1* (sim) ou *2* (não). 🙂'].join('\n');
        }
    }

    // ============= SIGNUP_ASK_PHONE =============
    else if (nextStage === 'SIGNUP_ASK_PHONE') {
        const normalized = normalizePhoneToWaId(text);
        if (!normalized) {
            replyText = [
                'Esse telefone parece inválido. 😅',
                '',
                'Digite com DDD.',
                'Ex: 11999999999 ou 5511999999999',
            ].join('\n');
        } else {
            payload.signupPhone = normalized;
            nextStage = 'SIGNUP_ASK_BIRTHDATE';

            replyText = [
                `Telefone: *${maskPhoneDigits(payload.signupPhone)}* ✅`,
                '',
                'Qual sua *data de nascimento*? (dd/mm/aaaa)',
            ].join('\n');
        }
    }

    // ============= SIGNUP_ASK_BIRTHDATE =============
    else if (nextStage === 'SIGNUP_ASK_BIRTHDATE') {
        const parsed = parseBirthdateBR(text);

        if (!parsed.ok) {
            replyText = [
                'Data inválida. 😅',
                '',
                'Digite no formato *dd/mm/aaaa*',
                'Ex: 25/12/1995',
            ].join('\n');
        } else {
            payload.signupBirthdateIso = parsed.iso;
            payload.signupBirthdate = String(text).trim();

            nextStage = 'SIGNUP_REVIEW';
            replyText = renderSignupReview(payload);
        }
    }

    // ============= SIGNUP_REVIEW =============
    else if (nextStage === 'SIGNUP_REVIEW') {
        if (normalizedText === '1') {
            const companyId = String(payload.signupCompanyId ?? '').trim();
            const name = String(payload.signupName ?? '').trim();
            const email = String(payload.signupEmail ?? '').trim();
            const phone = String(payload.signupPhone ?? '').trim();
            const birthIso = String(payload.signupBirthdateIso ?? '').trim();

            if (!companyId || !name || !email || !phone) {
                nextStage = 'SIGNUP_OFFER';
                payload.lastList = null;
                replyText = [
                    'Ops, perdi algumas infos do cadastro. 😅',
                    '',
                    'Vamos recomeçar:',
                    '',
                    renderSignupOffer(),
                ].join('\n');
            } else {
                const userId = await ensureClientMembership({
                    companyId,
                    name,
                    email,
                    phone,
                    birthdayIso: birthIso || null,
                });

                // ✅ Persistimos o vínculo na sessão
                payload.clientId = userId;
                payload.companyId = companyId;
                payload.companyLabel =
                    String(payload.signupCompanyLabel ?? '').trim() || null;

                // limpa dados do signup
                payload.signupIntent = null;
                payload.signupCompanyId = null;
                payload.signupCompanyLabel = null;
                payload.signupName = null;
                payload.signupEmail = null;
                payload.signupPhone = null;
                payload.signupBirthdateIso = null;
                payload.signupBirthdate = null;

                nextStage = 'MENU';
                payload.lastList = null;

                replyText = [
                    '✅ Cadastro criado com sucesso!',
                    '',
                    'Voltando pro menu 👇',
                    '',
                    renderMenu(),
                ].join('\n');
            }
        } else if (normalizedText === '2') {
            // cancela e volta
            nextStage = 'MENU';
            payload.lastList = null;

            replyText = [
                'Cadastro cancelado 🙂',
                '',
                'Voltando pro menu 👇',
                '',
                renderMenu(),
            ].join('\n');
        } else {
            replyText = renderSignupReview(payload);
        }
    }

    // DONE
    else if (nextStage === 'DONE') {
        replyText = [
            'Tudo certo ✅',
            '',
            'Digite *menu* para ver as opções.',
        ].join('\n');
    }

    // fallback
    else {
        replyText = ['Anotado ✅', '', 'Se quiser voltar, digite “menu”.'].join(
            '\n'
        );
    }

    // companyId persistida na sessão: preferimos a escolhida; senão a do canal
    const sessionCompanyId =
        String(payload.companyId ?? '').trim() || String(channel.companyId);

    const session = await prisma.whatsappSession.upsert({
        where: { channelId_fromPhone: { channelId: channel.id, fromPhone } },
        create: {
            channelId: channel.id,
            companyId: sessionCompanyId,
            fromPhone,
            stage: nextStage as any,
            payload,
            unitId: payload.unitId ?? channel.defaultUnitId ?? null,
            expiresAt,
        },
        update: {
            companyId: sessionCompanyId,
            stage: nextStage as any,
            payload,
            unitId:
                payload.unitId ??
                channel.defaultUnitId ??
                existing?.unitId ??
                null,
            expiresAt,
        },
        select: { id: true, stage: true, companyId: true, unitId: true },
    });

    let sendResult: any = null;

    if (replyText) {
        sendResult = await whatsappSendText({ to: fromPhone, text: replyText });

        if (!sendResult.ok) {
            logSendFailure({
                phoneNumberId: phoneNumberId!,
                fromPhone,
                stage: String(session.stage),
                error: sendResult.error,
                status: sendResult.status,
                fbCode: sendResult?.raw?.error?.code,
            });
        } else {
            console.log('[whatsapp][sent_ok]', {
                phoneNumberId,
                to: fromPhone,
                stage: String(session.stage),
                messageId: sendResult.messageId,
            });
        }
    }

    return jsonOk({
        ok: true,
        received: true,
        phoneNumberId,
        fromPhone,
        session: {
            id: session.id,
            stage: session.stage,
            companyId: session.companyId,
            unitId: session.unitId,
        },
        send: sendResult,
    });
}
