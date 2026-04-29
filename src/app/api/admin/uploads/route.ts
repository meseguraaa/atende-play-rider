// src/app/api/admin/uploads/route.ts
import { NextResponse } from 'next/server';
import { mkdir, writeFile, stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { requirePlatformForModuleApi } from '@/lib/plataform-permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function getUploadsRootDir() {
    const raw =
        process.env.UPLOAD_DIR?.trim() || process.env.UPLOADS_DIR?.trim() || '';

    if (!raw) return '';

    return path.resolve(raw);
}

type UploadModule = 'PRODUCTS' | 'PARTNERS' | 'RIDES';

type UploadCategory = 'products' | 'partners' | 'rides';

const MODULE_TO_CATEGORY: Record<UploadModule, UploadCategory> = {
    PRODUCTS: 'products',
    PARTNERS: 'partners',
    RIDES: 'rides',
};

type AdminModuleLike = Parameters<typeof requireAdminForModule>[0];

const MODULE_TO_PERMISSION: Record<UploadModule, AdminModuleLike> = {
    PRODUCTS: 'PRODUCTS' as AdminModuleLike,
    PARTNERS: 'SETTINGS' as AdminModuleLike,
    RIDES: 'RIDES' as AdminModuleLike,
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeString(raw: unknown) {
    const s = String(raw ?? '').trim();
    return s.length ? s : '';
}

function formGet(formData: unknown, key: string): unknown {
    const anyForm = formData as any;
    if (anyForm && typeof anyForm.get === 'function') return anyForm.get(key);
    return undefined;
}

function safeExtFrom(fileName: string, mime: string) {
    const byName = path.extname(fileName || '').toLowerCase();

    const allowed = new Set([
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
        '.gif',
        '.svg',
        '.avif',
    ]);

    if (allowed.has(byName)) return byName;

    const m = String(mime || '').toLowerCase();
    if (m === 'image/jpeg') return '.jpg';
    if (m === 'image/png') return '.png';
    if (m === 'image/webp') return '.webp';
    if (m === 'image/gif') return '.gif';
    if (m === 'image/svg+xml') return '.svg';
    if (m === 'image/avif') return '.avif';

    return '';
}

function parseModule(v: unknown): UploadModule | null {
    const raw = normalizeString(v).toUpperCase();

    if (raw === 'PRODUCTS') return 'PRODUCTS';
    if (raw === 'PARTNERS') return 'PARTNERS';
    if (raw === 'RIDES') return 'RIDES';

    return null;
}

type UploadScope = { kind: 'company'; companyId: string } | { kind: 'global' };

async function resolveScopeForModule(
    module: UploadModule
): Promise<UploadScope | NextResponse> {
    if (module === 'PARTNERS') {
        const auth = await requirePlatformForModuleApi('PARTNERS');
        if (auth instanceof NextResponse) return auth;
        return { kind: 'global' };
    }

    const permissionModule = MODULE_TO_PERMISSION[module];
    const session = await requireAdminForModule(permissionModule);

    const companyId = normalizeString((session as any)?.companyId);
    if (!companyId) {
        return jsonErr(
            'Contexto inválido: companyId ausente (multi-tenant).',
            401
        );
    }

    return { kind: 'company', companyId };
}

async function ensureWritableDir(dir: string) {
    await mkdir(dir, { recursive: true });
    await stat(dir);
}

/**
 * POST /api/admin/uploads
 * multipart/form-data:
 * - file: File obrigatório
 * - module: "PRODUCTS" | "PARTNERS" | "RIDES"
 *
 * Salva em:
 * - PRODUCTS/RIDES:     <UPLOAD_DIR>/<companyId>/<category>/<uuid>.<ext>
 * - PARTNERS plataforma: <UPLOAD_DIR>/global/partners/<uuid>.<ext>
 *
 * Retorna:
 * - /media/<namespace>/<category>/<fileName>
 */
export async function POST(request: Request) {
    try {
        const uploadsRootDir = getUploadsRootDir();

        if (!uploadsRootDir) {
            return jsonErr(
                'UPLOAD_DIR não configurado. Defina um diretório persistente fora da pasta da aplicação.',
                500
            );
        }

        const form = await request.formData().catch(() => null);
        if (!form) return jsonErr('FormData inválido.', 400);

        const module = parseModule(formGet(form, 'module'));
        if (!module) {
            return jsonErr(
                'Campo "module" é obrigatório e deve ser "PRODUCTS", "PARTNERS" ou "RIDES".',
                400
            );
        }

        const scope = await resolveScopeForModule(module);
        if (scope instanceof NextResponse) return scope;

        const file = formGet(form, 'file');
        if (!file || !(file instanceof File)) {
            return jsonErr('Campo "file" é obrigatório.', 400);
        }

        const originalName = file.name || 'upload';
        const mime = String(file.type || '').toLowerCase();

        if (!mime.startsWith('image/')) {
            return jsonErr('Apenas arquivos de imagem são permitidos.', 400);
        }

        const size = Number(file.size || 0);
        if (!Number.isFinite(size) || size <= 0) {
            return jsonErr('Arquivo inválido (tamanho).', 400);
        }

        if (size > MAX_FILE_SIZE_BYTES) {
            return jsonErr(
                `Imagem muito grande. Máximo: ${Math.floor(
                    MAX_FILE_SIZE_BYTES / (1024 * 1024)
                )}MB.`,
                413
            );
        }

        const ext = safeExtFrom(originalName, mime);
        if (!ext) {
            return jsonErr(
                'Formato de imagem não suportado. Use JPG, PNG, WEBP, GIF, SVG ou AVIF.',
                400
            );
        }

        const category = MODULE_TO_CATEGORY[module];
        const key = crypto.randomUUID();
        const fileName = `${key}${ext}`;

        const namespace = scope.kind === 'global' ? 'global' : scope.companyId;
        const targetDir = path.join(uploadsRootDir, namespace, category);

        await ensureWritableDir(targetDir);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const absPath = path.join(targetDir, fileName);
        await writeFile(absPath, buffer);

        const url = `/media/${namespace}/${category}/${fileName}`;

        return jsonOk(
            {
                url,
                key,
                mime,
                size,
                originalName,
                module,
                category,
            },
            { status: 201 }
        );
    } catch (e: any) {
        const msg = String(e?.message || e || 'Erro desconhecido');
        const code = String((e as any)?.code || '');
        const uploadsRootDir = getUploadsRootDir();

        if (code === 'EACCES' || code === 'EPERM') {
            return jsonErr(
                `Sem permissão para gravar em "${uploadsRootDir}". Verifique permissões.`,
                500
            );
        }

        if (code === 'ENOENT') {
            return jsonErr(
                `Caminho inválido para uploads: "${uploadsRootDir}".`,
                500
            );
        }

        if (msg === 'missing_token' || msg === 'unauthorized') {
            return jsonErr('Não autenticado.', 401);
        }

        return jsonErr(`Falha no upload: ${msg}`, 500);
    }
}
