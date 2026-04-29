// src/utils/money.ts
export function formatMoneySmartBRL(value: number) {
    const v = Number(value ?? 0);
    const safe = Number.isFinite(v) ? v : 0;

    const isInt = Math.abs(safe - Math.round(safe)) < 1e-9;

    try {
        return safe.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: isInt ? 0 : 2,
            maximumFractionDigits: isInt ? 0 : 2,
        });
    } catch {
        const fixed = isInt ? String(Math.round(safe)) : safe.toFixed(2);
        return `R$ ${fixed.replace('.', ',')}`;
    }
}
