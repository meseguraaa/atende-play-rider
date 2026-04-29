import type { AppointmentCalendarEvent } from './build-appointment-calendar-event';

export type GenerateIcsInput = {
    event: AppointmentCalendarEvent;
    companyName: string;
};

function asCleanString(value: unknown): string {
    return String(value ?? '').trim();
}

function escapeIcsText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function formatDateToIcsLocal(date: Date): string {
    return (
        [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate()),
        ].join('') +
        'T' +
        [
            pad(date.getHours()),
            pad(date.getMinutes()),
            pad(date.getSeconds()),
        ].join('')
    );
}

function formatDateToIcsUtc(date: Date): string {
    return (
        [
            date.getUTCFullYear(),
            pad(date.getUTCMonth() + 1),
            pad(date.getUTCDate()),
        ].join('') +
        'T' +
        [
            pad(date.getUTCHours()),
            pad(date.getUTCMinutes()),
            pad(date.getUTCSeconds()),
        ].join('') +
        'Z'
    );
}

function foldIcsLine(line: string): string {
    const limit = 75;

    if (line.length <= limit) {
        return line;
    }

    const chunks: string[] = [];
    let remaining = line;

    while (remaining.length > limit) {
        chunks.push(remaining.slice(0, limit));
        remaining = remaining.slice(limit);
    }

    if (remaining) {
        chunks.push(remaining);
    }

    return chunks.join('\r\n ');
}

function buildUid(event: AppointmentCalendarEvent): string {
    return (
        asCleanString(event.uid) ||
        `appointment-${event.appointmentId}@atendeplay.com`
    );
}

function buildFileName(event: AppointmentCalendarEvent): string {
    const safeId = asCleanString(event.appointmentId) || 'appointment';
    return `invite-${safeId}.ics`;
}

export function generateIcs({ event, companyName }: GenerateIcsInput): {
    content: string;
    fileName: string;
} {
    const cleanCompanyName = asCleanString(companyName) || 'AtendePlay';

    const uid = buildUid(event);
    const dtStamp = formatDateToIcsUtc(event.dtstamp);

    const summary = escapeIcsText(event.title);
    const description = escapeIcsText(event.description);
    const location = escapeIcsText(event.locationText);

    const organizerName = escapeIcsText(
        asCleanString(event.organizerName) || cleanCompanyName
    );
    const organizerEmail =
        asCleanString(event.organizerEmail) || 'naoresponda@atendeplay.com.br';

    const attendeeName = escapeIcsText(
        asCleanString(event.attendeeName) || 'Cliente'
    );
    const attendeeEmail = asCleanString(event.attendeeEmail);

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        'PRODID:-//AtendePlay//Appointment Invite//PT-BR',
        `METHOD:${event.method}`,
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `SEQUENCE:${event.sequence}`,
        `STATUS:${event.status}`,
        `DTSTART;TZID=America/Sao_Paulo:${formatDateToIcsLocal(event.startAt)}`,
        `DTEND;TZID=America/Sao_Paulo:${formatDateToIcsLocal(event.endAt)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${location}`,
        `ORGANIZER;CN=${organizerName}:mailto:${organizerEmail}`,
        'TRANSP:OPAQUE',
    ];

    if (attendeeEmail) {
        lines.push(
            `ATTENDEE;CN=${attendeeName};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendeeEmail}`
        );
    }

    lines.push('END:VEVENT', 'END:VCALENDAR');

    const content = lines.map(foldIcsLine).join('\r\n');

    return {
        content,
        fileName: buildFileName(event),
    };
}
