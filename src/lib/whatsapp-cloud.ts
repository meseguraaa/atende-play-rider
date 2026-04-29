// src/lib/whatsapp-cloud.ts
type WhatsAppSendTextParams = {
    to: string; // número/wa_id no formato internacional sem "+" (ex: 5511999999999)
    text: string;
    previewUrl?: boolean;
};

type WhatsAppSendResult =
    | { ok: true; messageId?: string; raw?: any }
    | { ok: false; error: string; status?: number; raw?: any };

function getEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function isTruthyEnv(name: string): boolean {
    const v = (process.env[name] || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function sanitizeGraphVersion(input?: string): string {
    // Aceita: "v24.0", "24.0", "/v24.0", "https://graph.facebook.com/v24.0"
    // Sempre retorna: "vXX.X"
    const raw = (input || '').trim();
    if (!raw) return 'v24.0';

    // Se vier URL completa, tenta extrair o trecho /vXX.X
    const match = raw.match(/\/v\d+(\.\d+)?/i);
    let v = match ? match[0] : raw;

    v = v.replace(/^https?:\/\//i, '');
    v = v.replace(/^graph\.facebook\.com\//i, '');
    v = v.replace(/^\/+/, '');
    v = v.replace(/\/+$/, '');

    // Se ficou "24.0", prefixa "v"
    if (!/^v/i.test(v)) v = `v${v}`;

    // Remove espaços internos (só por garantia)
    v = v.replace(/\s+/g, '');

    // Fallback seguro
    if (!/^v\d+(\.\d+)?$/i.test(v)) return 'v24.0';

    return v.toLowerCase();
}

function graphBaseUrl() {
    const version = sanitizeGraphVersion(process.env.WHATSAPP_GRAPH_VERSION);
    return `https://graph.facebook.com/${version}`;
}

/**
 * ✅ Resolve o Phone Number ID alvo:
 * - Se existir WHATSAPP_PHONE_NUMBER_ID, usa ele (comportamento atual)
 * - Se o caller passar explicitamente, usa o passado (vamos usar no futuro com multi-número)
 */
function resolvePhoneNumberId(explicit?: string) {
    if (explicit) return explicit;
    return getEnv('WHATSAPP_PHONE_NUMBER_ID');
}

function summarizeGraphError(raw: any, status: number): string {
    const msg =
        raw?.error?.message ||
        raw?.message ||
        `WhatsApp API error (status ${status})`;

    const code = raw?.error?.code ?? raw?.code;
    const type = raw?.error?.type ?? raw?.type;
    const subcode = raw?.error?.error_subcode ?? raw?.error_subcode;
    const fbtrace = raw?.error?.fbtrace_id ?? raw?.fbtrace_id;

    const extras: string[] = [];
    if (code != null) extras.push(`code=${code}`);
    if (subcode != null) extras.push(`subcode=${subcode}`);
    if (type) extras.push(`type=${type}`);
    if (fbtrace) extras.push(`fbtrace_id=${fbtrace}`);

    return extras.length ? `${msg} (${extras.join(', ')})` : msg;
}

async function safeReadBody(
    res: Response
): Promise<{ rawText: string; rawJson: any | null }> {
    const rawText = await res.text().catch(() => '');
    if (!rawText) return { rawText: '', rawJson: null };

    try {
        return { rawText, rawJson: JSON.parse(rawText) };
    } catch {
        return { rawText, rawJson: null };
    }
}

function isTransientNetworkError(err: any): boolean {
    const msg = String(err?.message || '');
    const code = String(err?.code || '');
    return (
        msg.includes('fetch failed') ||
        msg.includes('ERR_SSL_WRONG_VERSION_NUMBER') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ENOTFOUND') ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND'
    );
}

async function sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
}

/**
 * Envia mensagem de texto (WhatsApp Cloud API).
 * Requisitos de env:
 * - WHATSAPP_ACCESS_TOKEN
 * - WHATSAPP_PHONE_NUMBER_ID (ou passar explicitamente via params no futuro)
 * Opcional:
 * - WHATSAPP_GRAPH_VERSION (default: v24.0)
 * - WHATSAPP_SEND_TIMEOUT_MS (default: 15000)
 * - WHATSAPP_SEND_RETRY (default: 1) -> número de retries em erro transitório de rede
 * - WHATSAPP_DEBUG (1/true) -> logs de diagnóstico (sem token)
 *
 * ⚠️ Não loga token.
 */
export async function whatsappSendText(
    params: WhatsAppSendTextParams & { phoneNumberId?: string }
): Promise<WhatsAppSendResult> {
    const debug = isTruthyEnv('WHATSAPP_DEBUG');

    const timeoutMs = Number(process.env.WHATSAPP_SEND_TIMEOUT_MS || '15000');
    const maxRetry = Math.max(
        0,
        Number(process.env.WHATSAPP_SEND_RETRY || '1')
    );

    const token = getEnv('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = resolvePhoneNumberId(params.phoneNumberId);

    // Normaliza "to" por segurança (caso alguém mande com "+" ou espaços)
    const to = normalizeWaPhone(params.to);

    const url = `${graphBaseUrl()}/${phoneNumberId}/messages`;

    const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
            body: params.text,
            preview_url: params.previewUrl ?? false,
        },
    };

    let attempt = 0;
    while (true) {
        attempt++;

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        try {
            if (debug) {
                console.log('[WA] sendText attempt', {
                    attempt,
                    url,
                    phoneNumberId,
                    to,
                    textLen: params.text?.length ?? 0,
                    graphVersion: sanitizeGraphVersion(
                        process.env.WHATSAPP_GRAPH_VERSION
                    ),
                    timeoutMs,
                });
            }

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            const { rawText, rawJson } = await safeReadBody(res);

            if (!res.ok) {
                const errMsg = summarizeGraphError(
                    rawJson ?? { message: rawText },
                    res.status
                );

                if (debug) {
                    console.error('[WA] sendText error', {
                        attempt,
                        status: res.status,
                        errMsg,
                        raw: rawJson ?? rawText,
                    });
                }

                return {
                    ok: false,
                    error: errMsg,
                    status: res.status,
                    raw: rawJson ?? rawText,
                };
            }

            const messageId: string | undefined = rawJson?.messages?.[0]?.id;

            if (debug) {
                console.log('[WA] sendText ok', {
                    attempt,
                    status: res.status,
                    messageId,
                });
            }

            return { ok: true, messageId, raw: rawJson ?? rawText };
        } catch (e: any) {
            const msg =
                e?.name === 'AbortError'
                    ? `WhatsApp send timeout after ${timeoutMs}ms`
                    : e?.message || 'Unknown error';

            if (debug) {
                console.error('[WA] sendText exception', {
                    attempt,
                    message: msg,
                    name: e?.name,
                    code: e?.code,
                });
            }

            // Retry somente para falhas transitórias de rede/SSL
            if (attempt <= 1 + maxRetry && isTransientNetworkError(e)) {
                // backoff simples
                await sleep(250 * attempt);
                continue;
            }

            return {
                ok: false,
                error: msg,
                raw: { name: e?.name, code: e?.code, message: msg },
            };
        } finally {
            clearTimeout(t);
        }
    }
}

type WhatsAppSendTemplateParams = {
    to: string;
    templateName: string;
    languageCode?: string; // default pt_BR
    variables?: string[]; // ordem: {{1}}, {{2}}, ...
    phoneNumberId?: string;
};

export async function whatsappSendTemplate(
    params: WhatsAppSendTemplateParams
): Promise<WhatsAppSendResult> {
    const debug = isTruthyEnv('WHATSAPP_DEBUG');

    const timeoutMs = Number(process.env.WHATSAPP_SEND_TIMEOUT_MS || '15000');
    const maxRetry = Math.max(
        0,
        Number(process.env.WHATSAPP_SEND_RETRY || '1')
    );

    const token = getEnv('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = resolvePhoneNumberId(params.phoneNumberId);

    const to = normalizeWaPhone(params.to);

    const url = `${graphBaseUrl()}/${phoneNumberId}/messages`;

    const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
            name: params.templateName,
            language: {
                code: params.languageCode || 'pt_BR',
            },
            components: [
                {
                    type: 'body',
                    parameters: (params.variables || []).map((v) => ({
                        type: 'text',
                        text: v,
                    })),
                },
            ],
        },
    };

    let attempt = 0;
    while (true) {
        attempt++;

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        try {
            if (debug) {
                console.log('[WA] sendTemplate attempt', {
                    attempt,
                    url,
                    to,
                    template: params.templateName,
                    variablesCount: params.variables?.length ?? 0,
                });
            }

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            const { rawText, rawJson } = await safeReadBody(res);

            if (!res.ok) {
                const errMsg = summarizeGraphError(
                    rawJson ?? { message: rawText },
                    res.status
                );

                if (debug) {
                    console.error('[WA] sendTemplate error', {
                        attempt,
                        status: res.status,
                        errMsg,
                        raw: rawJson ?? rawText,
                    });
                }

                return {
                    ok: false,
                    error: errMsg,
                    status: res.status,
                    raw: rawJson ?? rawText,
                };
            }

            const messageId: string | undefined = rawJson?.messages?.[0]?.id;

            if (debug) {
                console.log('[WA] sendTemplate ok', {
                    attempt,
                    messageId,
                });
            }

            return { ok: true, messageId, raw: rawJson ?? rawText };
        } catch (e: any) {
            const msg =
                e?.name === 'AbortError'
                    ? `WhatsApp send timeout after ${timeoutMs}ms`
                    : e?.message || 'Unknown error';

            if (debug) {
                console.error('[WA] sendTemplate exception', {
                    attempt,
                    message: msg,
                });
            }

            if (attempt <= 1 + maxRetry && isTransientNetworkError(e)) {
                await sleep(250 * attempt);
                continue;
            }

            return {
                ok: false,
                error: msg,
                raw: { message: msg },
            };
        } finally {
            clearTimeout(t);
        }
    }
}

/**
 * Normaliza telefone:
 * - remove tudo que não é número
 * - remove "+" se existir
 */
export function normalizeWaPhone(input: string): string {
    return (input || '').replace(/[^\d]/g, '');
}

import { consumeWhatsappMessageCredit } from '@/lib/whatsapp/whatsapp-message-credits';

type SendWhatsappWithCreditParams = {
    companyId: string;
    to: string;
    text: string;
    previewUrl?: boolean;
    phoneNumberId?: string;
};

type SendWhatsappWithCreditResult =
    | {
          ok: true;
          mode: 'FREE_MONTHLY' | 'CREDIT';
          messageId?: string;
      }
    | {
          ok: false;
          reason: 'NO_CREDITS' | 'SEND_ERROR';
          error?: string;
      };

/**
 * 🚀 Envio com controle de crédito
 */
export async function sendWhatsappMessageWithCreditControl(
    params: SendWhatsappWithCreditParams
): Promise<SendWhatsappWithCreditResult> {
    const { companyId, to, text, previewUrl, phoneNumberId } = params;

    // 1) Valida e consome crédito (ou grátis)
    const creditResult = await consumeWhatsappMessageCredit(companyId);

    if (!creditResult.ok) {
        return {
            ok: false,
            reason: 'NO_CREDITS',
        };
    }

    // 2) Envia mensagem
    const sendResult = await whatsappSendText({
        to,
        text,
        previewUrl,
        phoneNumberId,
    });

    if (!sendResult.ok) {
        return {
            ok: false,
            reason: 'SEND_ERROR',
            error: sendResult.error,
        };
    }

    return {
        ok: true,
        mode: creditResult.mode,
        messageId: sendResult.messageId,
    };
}
