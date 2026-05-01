// src/components/admin/members/admin-edit-member-dialog/admin-edit-member-dialog.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Bike, Gauge, Loader2, Mail, Phone, User } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Calendar as UICalendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';

type AdminEditMemberDialogProps = {
    member: {
        id: string;
        name: string;
        email: string;
        phone: string;
        birthday: Date | null;
        motorcycle?: string;
        plate?: string;
        cylinderCc?: number | null;
    };
};

function onlyDigits(value: string): string {
    return String(value ?? '').replace(/\D/g, '');
}

function formatPhone(value: string): string {
    const digits = onlyDigits(value).slice(0, 11);

    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatPlate(value: string): string {
    return String(value ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 7);
}

function parseISODateToDate(dateISO: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || '').trim())) return null;

    const [y, m, d] = dateISO.split('-').map(Number);
    if (!y || !m || !d) return null;

    const dt = new Date(y, m - 1, d);
    return isValid(dt) ? dt : null;
}

function toISODateLocal(d: Date): string {
    return format(d, 'yyyy-MM-dd');
}

function dateToISODateLocal(date: Date | null): string {
    if (!date || !isValid(date)) return '';
    return format(date, 'yyyy-MM-dd');
}

function IconInput(
    props: {
        icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
        disabledIcon?: boolean;
        inputClassName?: string;
        wrapperClassName?: string;
    } & React.ComponentProps<typeof Input>
) {
    const {
        icon: Icon,
        disabledIcon,
        inputClassName,
        wrapperClassName,
        className,
        ...rest
    } = props;

    return (
        <div className={`relative ${wrapperClassName ?? ''}`}>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 -mt-px pointer-events-none">
                <Icon
                    width={20}
                    height={20}
                    className={
                        disabledIcon
                            ? 'text-content-secondary/50'
                            : 'text-content-brand'
                    }
                />
            </div>

            <Input
                {...rest}
                className={[
                    'pl-10',
                    inputClassName ?? '',
                    className ?? '',
                ].join(' ')}
            />
        </div>
    );
}

export function AdminEditMemberDialog({ member }: AdminEditMemberDialogProps) {
    const router = useRouter();

    const [open, setOpen] = React.useState(false);
    const [isPending, setIsPending] = React.useState(false);

    const [name, setName] = React.useState(member.name ?? '');
    const [email, setEmail] = React.useState(member.email ?? '');
    const [phone, setPhone] = React.useState(formatPhone(member.phone ?? ''));
    const [birthday, setBirthday] = React.useState(
        dateToISODateLocal(member.birthday)
    );

    const [motorcycle, setMotorcycle] = React.useState(member.motorcycle ?? '');
    const [plate, setPlate] = React.useState(formatPlate(member.plate ?? ''));
    const [cylinderCc, setCylinderCc] = React.useState(
        member.cylinderCc ? String(member.cylinderCc) : ''
    );

    const [birthdayPopoverOpen, setBirthdayPopoverOpen] = React.useState(false);

    function resetAll() {
        setName(member.name ?? '');
        setEmail(member.email ?? '');
        setPhone(formatPhone(member.phone ?? ''));
        setBirthday(dateToISODateLocal(member.birthday));
        setMotorcycle(member.motorcycle ?? '');
        setPlate(formatPlate(member.plate ?? ''));
        setCylinderCc(member.cylinderCc ? String(member.cylinderCc) : '');
        setBirthdayPopoverOpen(false);
    }

    React.useEffect(() => {
        if (!open) return;
        resetAll();
    }, [open, member]);

    const selectedBirthday = React.useMemo(() => {
        return parseISODateToDate(birthday);
    }, [birthday]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (isPending) return;

        const n = name.trim();
        const em = email.trim().toLowerCase();
        const ph = phone.trim();
        const bd = birthday.trim();

        const moto = motorcycle.trim();
        const vehiclePlate = plate.trim().toUpperCase();
        const ccDigits = onlyDigits(cylinderCc.trim());

        if (!n) return toast.error('Informe o nome do membro.');
        if (!em) return toast.error('Informe o e-mail do membro.');
        if (!ph) return toast.error('Informe o telefone do membro.');
        if (!bd) return toast.error('Preencha a data de nascimento.');

        if (!moto) return toast.error('Informe a moto do membro.');
        if (!vehiclePlate) return toast.error('Informe a placa da moto.');
        if (!ccDigits) return toast.error('Informe a cilindrada da moto.');

        const digits = onlyDigits(ph);
        if (digits.length < 10) {
            return toast.error('Informe um telefone válido (com DDD).');
        }

        if (!parseISODateToDate(bd)) {
            return toast.error('Informe uma data de nascimento válida.');
        }

        const parsedCylinderCc = Number(ccDigits);
        if (!Number.isFinite(parsedCylinderCc) || parsedCylinderCc <= 0) {
            return toast.error('Informe uma cilindrada válida.');
        }

        try {
            setIsPending(true);

            const res = await fetch(`/api/admin/members/${member.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: n,
                    email: em,
                    phone: ph,
                    birthday: bd,
                    motorcycle: moto,
                    plate: vehiclePlate,
                    cylinderCc: parsedCylinderCc,
                }),
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                const msg =
                    json?.error ||
                    (res.status === 409
                        ? 'Já existe um usuário com esse e-mail.'
                        : 'Não foi possível atualizar o membro.');
                toast.error(msg);
                return;
            }

            toast.success('Membro atualizado com sucesso!');
            setOpen(false);
            resetAll();
            router.refresh();
        } catch {
            toast.error('Falha de rede ao atualizar o membro.');
        } finally {
            setIsPending(false);
        }
    }

    const inputBase =
        'bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0';

    const thisYear = new Date().getFullYear();

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (isPending) return;
                setOpen(next);
                if (!next) resetAll();
            }}
        >
            <DialogTrigger asChild>
                <Button
                    variant="brand"
                    size="sm"
                    className="border-border-primary text-paragraph-small"
                >
                    Editar
                </Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary sm:max-w-140 max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Editar membro
                    </DialogTitle>
                    <DialogDescription className="text-paragraph-small text-content-secondary">
                        Atualize os dados principais do membro.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={handleSubmit}
                    className="space-y-4 overflow-y-auto pr-1"
                >
                    <div className="space-y-2">
                        <label
                            className="text-label-medium-size text-content-primary"
                            htmlFor={`edit-member-name-${member.id}`}
                        >
                            Nome <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            id={`edit-member-name-${member.id}`}
                            name="name"
                            icon={User}
                            value={name}
                            onChange={(ev) => setName(ev.target.value)}
                            disabled={isPending}
                            disabledIcon={isPending}
                            placeholder="Nome do membro"
                            className={inputBase}
                        />
                    </div>

                    <div className="space-y-2">
                        <label
                            className="text-label-medium-size text-content-primary"
                            htmlFor={`edit-member-email-${member.id}`}
                        >
                            E-mail <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            id={`edit-member-email-${member.id}`}
                            type="email"
                            name="email"
                            icon={Mail}
                            value={email}
                            onChange={(ev) => setEmail(ev.target.value)}
                            disabled={isPending}
                            disabledIcon={isPending}
                            placeholder="email@exemplo.com"
                            className={inputBase}
                        />
                    </div>

                    <div className="space-y-2">
                        <label
                            className="text-label-medium-size text-content-primary"
                            htmlFor={`edit-member-phone-${member.id}`}
                        >
                            Telefone <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            id={`edit-member-phone-${member.id}`}
                            name="phone"
                            type="tel"
                            icon={Phone}
                            placeholder="(99) 99999-9999"
                            value={phone}
                            onChange={(ev) =>
                                setPhone(formatPhone(ev.target.value))
                            }
                            disabled={isPending}
                            disabledIcon={isPending}
                            className={inputBase}
                        />

                        <p className="text-[11px] text-content-tertiary">
                            Ex.: (11) 99999-9999
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-label-medium-size text-content-primary">
                            Data de nascimento{' '}
                            <span className="text-red-500">*</span>
                        </label>

                        <Popover
                            open={birthdayPopoverOpen}
                            onOpenChange={setBirthdayPopoverOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={cn(
                                        'w-full justify-between text-left font-normal',
                                        'bg-transparent border-border-primary text-content-primary',
                                        'hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary',
                                        'focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand',
                                        'focus:border-border-brand focus-visible:border-border-brand'
                                    )}
                                    disabled={isPending}
                                >
                                    <div className="flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4 text-content-brand" />
                                        {selectedBirthday ? (
                                            format(
                                                selectedBirthday,
                                                'dd/MM/yyyy',
                                                { locale: ptBR }
                                            )
                                        ) : (
                                            <span className="text-content-secondary">
                                                Selecione uma data
                                            </span>
                                        )}
                                    </div>
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>

                            <PopoverContent
                                className="w-auto p-0"
                                align="start"
                            >
                                <UICalendar
                                    mode="single"
                                    selected={selectedBirthday ?? undefined}
                                    onSelect={(d) => {
                                        if (!d) return;
                                        setBirthday(toISODateLocal(d));
                                        setBirthdayPopoverOpen(false);
                                    }}
                                    autoFocus
                                    locale={ptBR}
                                    captionLayout="dropdown"
                                    fromYear={1900}
                                    toYear={thisYear}
                                    disabled={(date) => date > new Date()}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="border-t border-border-primary pt-4 space-y-4">
                        <div>
                            <p className="text-label-medium-size text-content-primary">
                                Dados da moto
                            </p>
                            <p className="text-[11px] text-content-tertiary">
                                Atualize os dados principais da moto do membro.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label
                                className="text-label-medium-size text-content-primary"
                                htmlFor={`edit-member-motorcycle-${member.id}`}
                            >
                                Moto <span className="text-red-500">*</span>
                            </label>

                            <IconInput
                                id={`edit-member-motorcycle-${member.id}`}
                                name="motorcycle"
                                icon={Bike}
                                value={motorcycle}
                                onChange={(ev) =>
                                    setMotorcycle(ev.target.value)
                                }
                                disabled={isPending}
                                disabledIcon={isPending}
                                placeholder="Ex.: Honda CB 500F"
                                className={inputBase}
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label
                                    className="text-label-medium-size text-content-primary"
                                    htmlFor={`edit-member-plate-${member.id}`}
                                >
                                    Placa{' '}
                                    <span className="text-red-500">*</span>
                                </label>

                                <IconInput
                                    id={`edit-member-plate-${member.id}`}
                                    name="plate"
                                    icon={Bike}
                                    value={plate}
                                    onChange={(ev) =>
                                        setPlate(formatPlate(ev.target.value))
                                    }
                                    disabled={isPending}
                                    disabledIcon={isPending}
                                    placeholder="ABC1D23"
                                    className={inputBase}
                                />
                            </div>

                            <div className="space-y-2">
                                <label
                                    className="text-label-medium-size text-content-primary"
                                    htmlFor={`edit-member-cylinder-cc-${member.id}`}
                                >
                                    Cilindrada{' '}
                                    <span className="text-red-500">*</span>
                                </label>

                                <IconInput
                                    id={`edit-member-cylinder-cc-${member.id}`}
                                    name="cylinderCc"
                                    inputMode="numeric"
                                    icon={Gauge}
                                    value={cylinderCc}
                                    onChange={(ev) =>
                                        setCylinderCc(
                                            onlyDigits(ev.target.value).slice(
                                                0,
                                                5
                                            )
                                        )
                                    }
                                    disabled={isPending}
                                    disabledIcon={isPending}
                                    placeholder="Ex.: 500"
                                    className={inputBase}
                                />

                                <p className="text-[11px] text-content-tertiary">
                                    Informe apenas números. Ex.: 160, 300, 650.
                                </p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-3 pt-2">
                        <Button
                            type="submit"
                            variant="edit2"
                            size="sm"
                            disabled={isPending}
                        >
                            {isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {isPending ? 'Salvando...' : 'Salvar alterações'}
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => {
                                if (isPending) return;
                                setOpen(false);
                                resetAll();
                            }}
                        >
                            Cancelar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
