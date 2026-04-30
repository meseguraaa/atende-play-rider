// src/app/page.tsx
export const dynamic = 'force-dynamic';

export default function Home() {
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center p-6 text-center">
            <div className="space-y-3">
                <p className="text-2xl font-semibold text-foreground">
                    AtendePlay - Rider
                </p>
            </div>
        </main>
    );
}
