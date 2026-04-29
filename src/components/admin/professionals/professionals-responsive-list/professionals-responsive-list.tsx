// src/components/admin/professionals/professionals-responsive-list/professionals-responsive-list.tsx
'use client';

import { useEffect, useState } from 'react';
import { Accordion } from '@/components/ui/accordion';
import {
    ProfessionalRow,
    ProfessionalRowMobile,
    type ProfessionalRowUIData,
} from '@/components/admin/professionals/professional-row/professional-row';

type UnitOption = { id: string; name: string; isActive: boolean };

export function ProfessionalsResponsiveList({
    rows,
    units,
    breakpointPx = 768, // md default
    defaultUnitId = null,
    canSeeAllUnits = true,
}: {
    rows: ProfessionalRowUIData[];
    units: UnitOption[];
    breakpointPx?: number;
    defaultUnitId?: string | null;
    canSeeAllUnits?: boolean;
}) {
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

    useEffect(() => {
        const mq = window.matchMedia(`(min-width: ${breakpointPx}px)`);
        const onChange = () => setIsDesktop(mq.matches);
        onChange();
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, [breakpointPx]);

    // enquanto hidrata, evita “piscar” os dois
    if (isDesktop === null) return null;

    if (!isDesktop) {
        return (
            <div className="space-y-2">
                {rows.map((row) => (
                    <ProfessionalRowMobile
                        key={row.id}
                        row={row}
                        units={units}
                        defaultUnitId={defaultUnitId}
                        canSeeAllUnits={canSeeAllUnits}
                    />
                ))}
            </div>
        );
    }

    return (
        <Accordion type="single" collapsible className="space-y-2">
            {rows.map((row) => (
                <ProfessionalRow
                    key={row.id}
                    row={row}
                    units={units}
                    defaultUnitId={defaultUnitId}
                    canSeeAllUnits={canSeeAllUnits}
                />
            ))}
        </Accordion>
    );
}
