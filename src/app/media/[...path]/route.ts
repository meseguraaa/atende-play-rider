// src/app/media/[...path]/route.ts
import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getUploadsRootDir() {
    const raw =
        process.env.UPLOAD_DIR?.trim() || process.env.UPLOADS_DIR?.trim() || '';

    if (!raw) return '';

    return path.resolve(raw);
}

// mapeamento simples de mime
function mimeFromExt(ext: string) {
    switch (ext.toLowerCase()) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        case '.gif':
            return 'image/gif';
        case '.svg':
            return 'image/svg+xml';
        case '.avif':
            return 'image/avif';
        default:
            return 'application/octet-stream';
    }
}

// evita path traversal tipo ../../etc/passwd
function safeJoin(base: string, parts: string[]) {
    const joined = path.join(base, ...parts);
    const normalizedBase = path.resolve(base);
    const normalizedJoined = path.resolve(joined);

    if (
        normalizedJoined !== normalizedBase &&
        !normalizedJoined.startsWith(normalizedBase + path.sep)
    ) {
        throw new Error('invalid_path');
    }

    return normalizedJoined;
}

function sanitizeParts(parts: unknown): string[] {
    if (!Array.isArray(parts) || parts.length === 0) return [];

    return parts
        .map((p) => String(p ?? '').trim())
        .filter(Boolean)
        .filter((p) => p !== '.' && p !== '..');
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ path: string[] }> }
) {
    try {
        const uploadsRootDir = getUploadsRootDir();
        if (!uploadsRootDir) {
            return new NextResponse('UPLOAD_DIR not configured', {
                status: 500,
            });
        }

        const { path: rawParts } = await ctx.params;

        const parts = sanitizeParts(rawParts);
        if (parts.length === 0) {
            return new NextResponse('Not Found', { status: 404 });
        }

        const absPath = safeJoin(uploadsRootDir, parts);

        const st = await stat(absPath).catch(() => null);
        if (!st || !st.isFile()) {
            return new NextResponse('Not Found', { status: 404 });
        }

        const buf = await readFile(absPath);

        const ext = path.extname(absPath);
        const contentType = mimeFromExt(ext);

        return new NextResponse(buf, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': 'inline',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'X-Content-Type-Options': 'nosniff',
                Vary: 'Accept-Encoding',
            },
        });
    } catch (e: any) {
        const msg = String(e?.message || '');
        if (msg === 'invalid_path') {
            return new NextResponse('Forbidden', { status: 403 });
        }

        return new NextResponse('Not Found', { status: 404 });
    }
}
