// src/utils/datetime.ts
export const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

export function getSaoPauloHour(dateInput: string | Date): number {
    const date =
        typeof dateInput === 'string' ? new Date(dateInput) : dateInput;

    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: SAO_PAULO_TIMEZONE,
        hour: 'numeric',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');

    return hourPart ? Number(hourPart.value) : 0;
}

export function formatTimeSaoPaulo(dateInput: string | Date): string {
    const date =
        typeof dateInput === 'string' ? new Date(dateInput) : dateInput;

    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: SAO_PAULO_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}
