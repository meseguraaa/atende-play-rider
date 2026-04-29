export type AppointmentLocationTypeValue = 'UNIT' | 'CLIENT_ADDRESS';

type AppointmentCalendarAddress = {
    label?: string | null;
    cep?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    reference?: string | null;
};

type AppointmentCalendarUnit = {
    name?: string | null;
    cep?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    address?: string | null;
};

type AppointmentCalendarService = {
    name?: string | null;
    durationMinutes?: number | null;
};

type AppointmentCalendarProfessional = {
    name?: string | null;
};

export type BuildAppointmentCalendarEventInput = {
    id: string;
    clientName: string;
    clientEmail?: string | null;

    description?: string | null;
    scheduleAt: Date | string;
    locationType: AppointmentLocationTypeValue;

    service?: AppointmentCalendarService | null;
    professional?: AppointmentCalendarProfessional | null;

    unit?: AppointmentCalendarUnit | null;
    clientAddress?: AppointmentCalendarAddress | null;

    // 🔐 Preparação para invite real
    calendarInviteUid?: string | null;
    calendarInviteSequence?: number | null;

    organizerName?: string | null;
    organizerEmail?: string | null;
};

export type AppointmentCalendarEvent = {
    appointmentId: string;

    title: string;
    startAt: Date;
    endAt: Date;

    locationLabel: string;
    locationFull: string;
    locationText: string;

    description: string;

    // 📅 NOVO — base para invite real
    uid: string;
    sequence: number;
    status: 'CONFIRMED';
    method: 'REQUEST';
    dtstamp: Date;

    organizerName: string;
    organizerEmail: string;

    attendeeName: string;
    attendeeEmail: string | null;

    shouldSendToClient: boolean;
};

function asCleanString(value: unknown): string {
    return String(value ?? '').trim();
}

function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

function joinParts(
    parts: Array<string | null | undefined>,
    separator = ', '
): string {
    const cleaned = parts.map((part) => asCleanString(part)).filter(Boolean);

    // remove duplicados mantendo ordem
    const unique: string[] = [];

    for (const part of cleaned) {
        if (!unique.includes(part)) {
            unique.push(part);
        }
    }

    return unique.join(separator);
}

function formatStateCity(city?: string | null, state?: string | null): string {
    const cleanCity = asCleanString(city);
    const cleanState = asCleanString(state);

    if (cleanCity && cleanState) return `${cleanCity} - ${cleanState}`;
    return cleanCity || cleanState || '';
}

function formatStructuredAddress(
    address?: AppointmentCalendarAddress | null
): string {
    if (!address) return '';

    const streetLine = joinParts(
        [address.street, address.number, address.complement],
        ', '
    );

    const districtLine = joinParts([
        address.neighborhood,
        formatStateCity(address.city, address.state),
    ]);

    const baseAddress = joinParts([streetLine, districtLine]);
    const cepPart = asCleanString(address.cep);
    const referencePart = asCleanString(address.reference);

    const withCep = joinParts([baseAddress, cepPart ? `CEP: ${cepPart}` : '']);

    return joinParts([withCep, referencePart ? `Ref.: ${referencePart}` : '']);
}

function formatUnitAddress(unit?: AppointmentCalendarUnit | null): string {
    if (!unit) return '';

    const legacyAddress = asCleanString(unit.address);
    if (legacyAddress) return legacyAddress;

    const streetLine = joinParts(
        [unit.street, unit.number, unit.complement],
        ', '
    );

    const districtLine = joinParts([
        unit.neighborhood,
        formatStateCity(unit.city, unit.state),
    ]);

    const baseAddress = joinParts([streetLine, districtLine]);
    const cepPart = asCleanString(unit.cep);

    return joinParts([baseAddress, cepPart ? `CEP: ${cepPart}` : '']);
}

function buildLocation(input: BuildAppointmentCalendarEventInput): {
    locationLabel: string;
    locationFull: string;
    locationText: string;
} {
    if (input.locationType === 'CLIENT_ADDRESS') {
        const label =
            asCleanString(input.clientAddress?.label) || 'Endereço do cliente';
        const full = formatStructuredAddress(input.clientAddress);
        const text = joinParts([label, full], ' - ');

        return {
            locationLabel: label,
            locationFull: full,
            locationText: text || label,
        };
    }

    const unitName = asCleanString(input.unit?.name) || 'Unidade';
    const full = formatUnitAddress(input.unit);
    const text = joinParts([unitName, full], ' - ');

    return {
        locationLabel: unitName,
        locationFull: full,
        locationText: text || unitName,
    };
}

function buildTitle(input: BuildAppointmentCalendarEventInput): string {
    const serviceName = asCleanString(input.service?.name) || 'Agendamento';
    const professionalName = asCleanString(input.professional?.name);

    if (professionalName) {
        return `${serviceName} com ${professionalName}`;
    }

    return serviceName;
}

function buildDescription(
    input: BuildAppointmentCalendarEventInput,
    location: { locationLabel: string; locationFull: string }
): string {
    const serviceName = asCleanString(input.service?.name) || 'Não informado';
    const professionalName =
        asCleanString(input.professional?.name) || 'Não informado';
    const clientName = asCleanString(input.clientName) || 'Não informado';
    const notes = asCleanString(input.description);

    const lines = [
        `Cliente: ${clientName}`,
        `Serviço: ${serviceName}`,
        `Profissional: ${professionalName}`,
        `Local: ${location.locationLabel}`,
    ];

    if (location.locationFull) {
        lines.push(`Endereço: ${location.locationFull}`);
    }

    if (notes) {
        lines.push(`Observações: ${notes}`);
    }

    return lines.join('\n');
}

export function buildAppointmentCalendarEvent(
    input: BuildAppointmentCalendarEventInput
): AppointmentCalendarEvent {
    const startAt = new Date(input.scheduleAt);
    if (Number.isNaN(startAt.getTime())) {
        throw new Error(
            'Data do agendamento inválida para gerar evento de calendário.'
        );
    }

    const durationMinutes =
        typeof input.service?.durationMinutes === 'number' &&
        input.service.durationMinutes > 0
            ? input.service.durationMinutes
            : 60;

    const endAt = addMinutes(startAt, durationMinutes);
    const location = buildLocation(input);

    const uid =
        asCleanString(input.calendarInviteUid) ||
        `appointment-${input.id}@atendeplay.com`;

    const sequence =
        typeof input.calendarInviteSequence === 'number' &&
        input.calendarInviteSequence >= 0
            ? input.calendarInviteSequence
            : 0;

    const organizerName = asCleanString(input.organizerName) || 'AtendePlay';

    const organizerEmail =
        asCleanString(input.organizerEmail) || 'naoresponda@atendeplay.com.br';

    const attendeeName = asCleanString(input.clientName) || 'Cliente';

    const attendeeEmail = asCleanString(input.clientEmail) || null;

    return {
        appointmentId: input.id,

        title: buildTitle(input),
        startAt,
        endAt,

        locationLabel: location.locationLabel,
        locationFull: location.locationFull,
        locationText: location.locationText,

        description: buildDescription(input, location),

        // 📅 NOVO — estrutura de invite
        uid,
        sequence,
        status: 'CONFIRMED',
        method: 'REQUEST',
        dtstamp: new Date(),

        organizerName,
        organizerEmail,

        attendeeName,
        attendeeEmail,

        // ✅ mantém comportamento atual
        shouldSendToClient: input.locationType === 'CLIENT_ADDRESS',
    };
}
