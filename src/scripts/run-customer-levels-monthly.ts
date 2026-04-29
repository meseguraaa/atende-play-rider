// src/scripts/run-customer-levels-monthly.ts
import { runMonthlyCustomerLevelsJob } from '@/jobs/customer-levels/run-monthly-customer-levels';

function readArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

async function main() {
    const onlyCompanyId = readArg('companyId');
    const mode = (readArg('mode') as 'upsert' | 'skip' | undefined) ?? 'upsert';

    const result = await runMonthlyCustomerLevelsJob({
        onlyCompanyId,
        mode,
    });

    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
