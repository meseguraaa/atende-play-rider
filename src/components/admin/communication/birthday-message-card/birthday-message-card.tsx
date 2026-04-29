'use client';

type BirthdayMessageCardProps = {
    enabled: boolean;
};

export function BirthdayMessageCard({ enabled }: BirthdayMessageCardProps) {
    if (!enabled) {
        return null;
    }

    return (
        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-content-primary font-medium">
                        Mensagem automática de aniversário
                    </p>
                    <p className="text-xs text-content-secondary">
                        Envio automático todos os dias às 10h para clientes
                        aniversariantes
                    </p>
                </div>
            </div>

            <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                <div>
                    <p className="text-[11px] text-content-secondary">
                        Template oficial aprovado
                    </p>
                </div>

                <div className="rounded-lg border border-border-primary bg-background-tertiary p-3 text-sm text-content-primary whitespace-pre-line">
                    {
                        '🎉 Parabéns, {nome}! 🎂✨\n\nHoje é um dia especial pra gente aqui na {empresa} 💛\nDesejamos um novo ciclo cheio de coisas boas, conquistas e momentos incríveis!\n\nVai ser um prazer te receber!\nEquipe {empresa}'
                    }
                </div>
            </div>
        </section>
    );
}
