// src/lib/admin-professionals-api.ts

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export type AdminProfessionalDTO = {
    id: string;
    companyId: string;
    name: string;
    email: string;
    phone: string | null;
    imageUrl: string | null;
    isActive: boolean;
    userId: string | null;
    createdAt: string;
    updatedAt: string;
};

export type CreateProfessionalPayload = {
    name: string;
    email: string;
    phone: string;
    imageUrl?: string | null;
    password: string;
    unitIds: string[];
};

export type UpdateProfessionalPayload = Partial<{
    name: string;
    email: string;
    phone: string | null;
    imageUrl: string | null;
    password: string;
    unitIds: string[];
    isActive: boolean;
}>;

function safeJson<T>(res: Response): Promise<T | null> {
    return res.json().catch(() => null);
}

function pickError(payload: any, fallback: string): string {
    const msg = typeof payload?.error === 'string' ? payload.error : '';
    return msg || fallback;
}

/**
 * GET /api/admin/professionals
 * (assumindo que sua rota retorna { ok, data } )
 */
export async function listProfessionals(): Promise<
    ApiResult<AdminProfessionalDTO[]>
> {
    const res = await fetch('/api/admin/professionals', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
    });

    const payload = await safeJson<any>(res);

    if (!res.ok) {
        return {
            ok: false,
            error: pickError(payload, 'Erro ao listar profissionais.'),
        };
    }

    if (!payload?.ok) {
        return {
            ok: false,
            error: pickError(payload, 'Erro ao listar profissionais.'),
        };
    }

    return { ok: true, data: payload.data as AdminProfessionalDTO[] };
}

/**
 * POST /api/admin/professionals
 */
export async function createProfessional(
    input: CreateProfessionalPayload
): Promise<ApiResult<AdminProfessionalDTO>> {
    const res = await fetch('/api/admin/professionals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(input),
    });

    const payload = await safeJson<any>(res);

    if (!res.ok) {
        return {
            ok: false,
            error: pickError(payload, 'Erro ao criar profissional.'),
        };
    }

    if (!payload?.ok) {
        return {
            ok: false,
            error: pickError(payload, 'Erro ao criar profissional.'),
        };
    }

    return { ok: true, data: payload.data as AdminProfessionalDTO };
}

/**
 * PATCH /api/admin/professionals/[professionalId]
 */
export async function updateProfessional(
    professionalId: string,
    input: UpdateProfessionalPayload
): Promise<ApiResult<AdminProfessionalDTO>> {
    const res = await fetch(
        `/api/admin/professionals/${encodeURIComponent(professionalId)}`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify(input),
        }
    );

    const payload = await safeJson<any>(res);

    if (!res.ok) {
        return {
            ok: false,
            error: pickError(payload, 'Erro ao atualizar profissional.'),
        };
    }

    if (!payload?.ok) {
        return {
            ok: false,
            error: pickError(payload, 'Erro ao atualizar profissional.'),
        };
    }

    return { ok: true, data: payload.data as AdminProfessionalDTO };
}

/**
 * Ativar/Desativar via PATCH isActive
 */
export async function setProfessionalActive(
    professionalId: string,
    isActive: boolean
): Promise<ApiResult<AdminProfessionalDTO>> {
    return updateProfessional(professionalId, { isActive });
}
