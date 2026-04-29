// src/app/admin/review-tag/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import ReviewTagToasts from './review-tag-toasts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Tags de Avaliação',
};

type AdminReviewTagPageProps = {
    searchParams: Promise<{
        success?: string;
        error?: string;
    }>;
};

const PAGE_PATH = '/admin/review-tag';

function buildCookieHeader(all: { name: string; value: string }[]) {
    return all.map((c) => `${c.name}=${c.value}`).join('; ');
}

function normalizeLabel(label: unknown): string {
    return String(label ?? '')
        .trim()
        .replace(/\s+/g, ' ');
}

async function getBaseUrlFromHeaders(): Promise<string> {
    const h = await headers();

    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
    const proto = h.get('x-forwarded-proto') ?? 'http';

    return `${proto}://${host}`;
}

export default async function AdminReviewTagPage({
    searchParams,
}: AdminReviewTagPageProps) {
    const sp = await searchParams;

    const session = await requireAdminForModule('REVIEWS');

    // 🔒 Hard lock multi-tenant
    const companyId = session.companyId;

    const tags = await prisma.reviewTag.findMany({
        where: { companyId },
        orderBy: { label: 'asc' },
        select: {
            id: true,
            label: true,
            isActive: true,
            isNegative: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    const activeTags = tags.filter((t) => t.isActive);
    const inactiveTags = tags.filter((t) => !t.isActive);

    async function createTagAction(formData: FormData) {
        'use server';

        await requireAdminForModule('REVIEWS');

        const label = normalizeLabel(formData.get('label'));
        if (!label) {
            redirect(
                `${PAGE_PATH}?error=${encodeURIComponent(
                    'Informe o texto da tag.'
                )}`
            );
        }

        const cookieStore = await cookies();
        const cookieHeader = buildCookieHeader(cookieStore.getAll());
        const baseUrl = await getBaseUrlFromHeaders();

        const res = await fetch(`${baseUrl}/api/admin/review-tags`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                cookie: cookieHeader,
            },
            body: JSON.stringify({ label }),
            cache: 'no-store',
        }).catch(() => null);

        if (!res) {
            redirect(
                `${PAGE_PATH}?error=${encodeURIComponent(
                    'Falha ao criar a tag.'
                )}`
            );
        }

        const json = (await res.json().catch(() => null)) as
            | { ok: true; data: any }
            | { ok: false; error: string }
            | null;

        if (!res.ok || !json || (json as any).ok !== true) {
            const msg =
                (json as any)?.error ??
                'Não foi possível criar a tag. Tente novamente.';
            redirect(`${PAGE_PATH}?error=${encodeURIComponent(msg)}`);
        }

        revalidatePath(PAGE_PATH);
        redirect(
            `${PAGE_PATH}?success=${encodeURIComponent(
                'Tag criada com sucesso.'
            )}`
        );
    }

    async function updateLabelAction(formData: FormData) {
        'use server';

        await requireAdminForModule('REVIEWS');

        const tagId = String(formData.get('tagId') ?? '').trim();
        const label = normalizeLabel(formData.get('label'));

        if (!tagId) {
            redirect(
                `${PAGE_PATH}?error=${encodeURIComponent('Tag inválida.')}`
            );
        }
        if (!label) {
            redirect(
                `${PAGE_PATH}?error=${encodeURIComponent(
                    'Informe o texto da tag.'
                )}`
            );
        }

        const cookieStore = await cookies();
        const cookieHeader = buildCookieHeader(cookieStore.getAll());
        const baseUrl = await getBaseUrlFromHeaders();

        const res = await fetch(`${baseUrl}/api/admin/review-tags/${tagId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                cookie: cookieHeader,
            },
            body: JSON.stringify({ label }),
            cache: 'no-store',
        }).catch(() => null);

        if (!res) {
            redirect(
                `${PAGE_PATH}?error=${encodeURIComponent(
                    'Falha ao salvar o texto.'
                )}`
            );
        }

        const json = (await res.json().catch(() => null)) as
            | { ok: true; data: any }
            | { ok: false; error: string }
            | null;

        if (!res.ok || !json || (json as any).ok !== true) {
            const msg =
                (json as any)?.error ??
                'Não foi possível salvar. Tente novamente.';
            redirect(`${PAGE_PATH}?error=${encodeURIComponent(msg)}`);
        }

        revalidatePath(PAGE_PATH);
        redirect(
            `${PAGE_PATH}?success=${encodeURIComponent(
                'Tag atualizada com sucesso.'
            )}`
        );
    }

    async function toggleStatusAction(formData: FormData) {
        'use server';

        await requireAdminForModule('REVIEWS');

        const tagId = String(formData.get('tagId') ?? '').trim();
        const nextActiveRaw = String(formData.get('nextActive') ?? '').trim();

        if (!tagId) {
            redirect(
                `${PAGE_PATH}?error=${encodeURIComponent('Tag inválida.')}`
            );
        }

        const nextActive =
            nextActiveRaw === 'true'
                ? true
                : nextActiveRaw === 'false'
                  ? false
                  : null;

        if (nextActive === null) {
            redirect(
                `${PAGE_PATH}?error=${encodeURIComponent('Ação inválida.')}`
            );
        }

        const cookieStore = await cookies();
        const cookieHeader = buildCookieHeader(cookieStore.getAll());
        const baseUrl = await getBaseUrlFromHeaders();

        const res = await fetch(`${baseUrl}/api/admin/review-tags/${tagId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                cookie: cookieHeader,
            },
            body: JSON.stringify({ isActive: nextActive }),
            cache: 'no-store',
        }).catch(() => null);

        if (!res) {
            redirect(
                `${PAGE_PATH}?error=${encodeURIComponent(
                    'Falha ao atualizar status.'
                )}`
            );
        }

        const json = (await res.json().catch(() => null)) as
            | { ok: true; data: any }
            | { ok: false; error: string }
            | null;

        if (!res.ok || !json || (json as any).ok !== true) {
            const msg =
                (json as any)?.error ??
                'Não foi possível atualizar o status. Tente novamente.';
            redirect(`${PAGE_PATH}?error=${encodeURIComponent(msg)}`);
        }

        revalidatePath(PAGE_PATH);
        redirect(
            `${PAGE_PATH}?success=${encodeURIComponent(
                nextActive
                    ? 'Tag ativada com sucesso.'
                    : 'Tag desativada com sucesso.'
            )}`
        );
    }

    return (
        <div className="space-y-8 max-w-7xl">
            {/* Toast runner (client) */}
            <ReviewTagToasts success={sp.success} error={sp.error} />

            {/* HEADER */}
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-title text-content-primary">
                        Tags de Avaliação
                    </h1>
                    <p className="text-paragraph-medium text-content-secondary">
                        Gerencie as tags usadas para avaliações e feedbacks (no
                        máximo 3 por avaliação).
                    </p>

                    <p className="mt-1 text-paragraph-small text-content-tertiary">
                        Escopo:{' '}
                        {session.canSeeAllUnits
                            ? 'todas as unidades'
                            : 'unidade atual'}
                    </p>
                </div>
            </header>

            {/* FORM NOVA TAG */}
            <section className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4 space-y-3">
                <p className="text-label-small text-content-primary">
                    Adicionar nova tag
                </p>

                <form
                    action={createTagAction}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center"
                >
                    <Input
                        name="label"
                        placeholder="Ex.: Atendimento rápido, Ambiente agradável..."
                        className="bg-background-secondary border-border-primary text-content-primary placeholder:text-content-tertiary"
                    />
                    <Button type="submit" variant="edit2" size="sm">
                        Salvar tag
                    </Button>
                </form>

                <p className="text-paragraph-small text-content-tertiary">
                    Essas tags aparecem como opções para o cliente escolher (até
                    3) ao avaliar um atendimento.
                </p>
            </section>

            {/* LISTA ATIVOS */}
            <section className="space-y-3">
                <h2 className="text-paragraph-medium text-content-primary">
                    Tags ativas
                </h2>

                {activeTags.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhuma tag ativa no momento. Cadastre acima ou
                            ative uma tag inativa.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {activeTags.map((tag) => (
                            <div
                                key={tag.id}
                                className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3 md:space-y-0 md:flex md:flex-wrap md:items-center md:justify-between md:gap-3"
                            >
                                <form
                                    action={updateLabelAction}
                                    className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3 min-w-0 flex-1"
                                >
                                    <input
                                        type="hidden"
                                        name="tagId"
                                        value={tag.id}
                                    />

                                    <Input
                                        name="label"
                                        defaultValue={tag.label}
                                        className="w-full md:flex-1 bg-background-secondary border-border-primary text-content-primary placeholder:text-content-tertiary"
                                    />

                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant="edit2"
                                        className="border-border-primary whitespace-nowrap w-full md:w-auto"
                                    >
                                        Salvar texto
                                    </Button>
                                </form>

                                <form
                                    action={toggleStatusAction}
                                    className="w-full md:w-auto"
                                >
                                    <input
                                        type="hidden"
                                        name="tagId"
                                        value={tag.id}
                                    />
                                    <input
                                        type="hidden"
                                        name="nextActive"
                                        value="false"
                                    />

                                    <Button
                                        type="submit"
                                        variant="destructive"
                                        size="sm"
                                        className="border-border-primary hover:bg-muted/40 whitespace-nowrap w-full md:w-auto"
                                    >
                                        Desativar
                                    </Button>
                                </form>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* LISTA INATIVOS */}
            <section className="space-y-3">
                <h2 className="text-paragraph-medium text-content-secondary">
                    Tags inativas
                </h2>

                {inactiveTags.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhuma tag inativa no momento.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {inactiveTags.map((tag) => (
                            <div
                                key={tag.id}
                                className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3 md:space-y-0 md:flex md:flex-wrap md:items-center md:justify-between md:gap-3"
                            >
                                <form
                                    action={updateLabelAction}
                                    className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3 min-w-0 flex-1"
                                >
                                    <input
                                        type="hidden"
                                        name="tagId"
                                        value={tag.id}
                                    />

                                    <Input
                                        name="label"
                                        defaultValue={tag.label}
                                        className="w-full md:flex-1 bg-background-secondary border-border-primary text-content-primary placeholder:text-content-tertiary"
                                    />

                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant="edit2"
                                        className="border-border-primary whitespace-nowrap w-full md:w-auto"
                                    >
                                        Salvar texto
                                    </Button>
                                </form>

                                <form
                                    action={toggleStatusAction}
                                    className="w-full md:w-auto"
                                >
                                    <input
                                        type="hidden"
                                        name="tagId"
                                        value={tag.id}
                                    />
                                    <input
                                        type="hidden"
                                        name="nextActive"
                                        value="true"
                                    />

                                    <Button
                                        type="submit"
                                        variant="active"
                                        size="sm"
                                        className="border-border-primary hover:bg-muted/40 whitespace-nowrap w-full md:w-auto"
                                    >
                                        Ativar
                                    </Button>
                                </form>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
