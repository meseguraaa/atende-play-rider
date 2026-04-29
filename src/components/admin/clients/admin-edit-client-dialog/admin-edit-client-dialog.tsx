// src/components/admin/clients/admin-edit-client-dialog/admin-edit-client-dialog.tsx
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
import {
    User,
    Mail,
    Phone,
    Loader2,
    MapPinHouse,
    Home,
    Hash,
    Building2,
    MapPinned,
} from 'lucide-react';

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

type ClientAddress = {
    id?: string;
    label?: string | null;
    street?: string | null;
    number?: string | null;
    city?: string | null;
    state?: string | null;
    isDefault?: boolean | null;
};

type AdminEditClientDialogProps = {
    client: {
        id: string;
        name: string;
        email: string;
        phone: string;
        birthday: Date | null;
        addresses?: ClientAddress[];
    };
};

function onlyDigits(value: string): string {
    return String(value ?? '').replace(/\D/g, '');
}

// máscara (99) 99999-9999
function formatPhone(value: string): string {
    const digits = onlyDigits(value).slice(0, 11);

    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// yyyy-MM-dd -> Date (timezone local)
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

export function AdminEditClientDialog({ client }: AdminEditClientDialogProps) {
    const router = useRouter();

    const [open, setOpen] = React.useState(false);
    const [isPending, setIsPending] = React.useState(false);

    const [name, setName] = React.useState(client.name ?? '');
    const [email, setEmail] = React.useState(client.email ?? '');
    const [phone, setPhone] = React.useState(formatPhone(client.phone ?? ''));
    const [birthday, setBirthday] = React.useState(
        dateToISODateLocal(client.birthday)
    ); // yyyy-MM-dd (API)

    const [addresses, setAddresses] = React.useState<
        {
            id?: string;
            label: string;
            street: string;
            number: string;
            city: string;
            state: string;
            isDefault: boolean;
        }[]
    >([]);

    const [birthdayPopoverOpen, setBirthdayPopoverOpen] = React.useState(false);

    const initialAddresses = React.useMemo(() => {
        if (!client.addresses?.length) {
            return [
                {
                    label: 'Casa',
                    street: '',
                    number: '',
                    city: '',
                    state: '',
                    isDefault: true,
                },
            ];
        }

        return client.addresses.map((address, index) => ({
            id: address.id,
            label: address.label ?? (index === 0 ? 'Casa' : 'Novo'),
            street: address.street ?? '',
            number: address.number ?? '',
            city: address.city ?? '',
            state: address.state ?? '',
            isDefault: !!address.isDefault,
        }));
    }, [client.addresses]);

    function resetAll() {
        setName(client.name ?? '');
        setEmail(client.email ?? '');
        setPhone(formatPhone(client.phone ?? ''));
        setBirthday(dateToISODateLocal(client.birthday));
        setBirthdayPopoverOpen(false);
        setAddresses(initialAddresses);
    }

    React.useEffect(() => {
        if (!open) return;
        resetAll();
    }, [open, client, initialAddresses]);

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

        if (!n) return toast.error('Informe o nome do cliente.');
        if (!em) return toast.error('Informe o e-mail do cliente.');
        if (!ph) return toast.error('Informe o telefone do cliente.');
        if (!bd) return toast.error('Preencha a data de nascimento.');

        const digits = onlyDigits(ph);
        if (digits.length < 10) {
            return toast.error('Informe um telefone válido (com DDD).');
        }

        if (!parseISODateToDate(bd)) {
            return toast.error('Informe uma data de nascimento válida.');
        }

        const formattedAddresses = addresses
            .filter(
                (address) =>
                    address.label.trim() ||
                    address.street.trim() ||
                    address.number.trim() ||
                    address.city.trim() ||
                    address.state.trim()
            )
            .map((address, index) => ({
                ...(address.id ? { id: address.id } : {}),
                label: address.label.trim() || `Endereço ${index + 1}`,
                street: address.street.trim(),
                number: address.number.trim(),
                city: address.city.trim(),
                state: address.state.trim(),
                isDefault: index === 0,
            }));

        try {
            setIsPending(true);

            const res = await fetch(`/api/admin/clients/${client.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: n,
                    email: em,
                    phone: ph,
                    birthday: bd,
                    addresses: formattedAddresses,
                }),
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                const msg =
                    json?.error ||
                    (res.status === 409
                        ? 'Já existe um usuário com esse e-mail.'
                        : 'Não foi possível atualizar o cliente.');
                toast.error(msg);
                return;
            }

            toast.success('Cliente atualizado com sucesso!');
            setOpen(false);
            resetAll();
            router.refresh();
        } catch {
            toast.error('Falha de rede ao atualizar o cliente.');
        } finally {
            setIsPending(false);
        }
    }

    const inputBase =
        'bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0';

    const thisYear = new Date().getFullYear();
    const fromYear = 1900;
    const toYear = thisYear;

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
                        Editar cliente
                    </DialogTitle>
                    <DialogDescription className="text-paragraph-small text-content-secondary">
                        Atualize os dados do cliente e os endereços cadastrados.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={handleSubmit}
                    className="space-y-4 overflow-y-auto pr-1"
                >
                    {/* NOME */}
                    <div className="space-y-2">
                        <label
                            className="text-label-medium-size text-content-primary"
                            htmlFor={`edit-client-name-${client.id}`}
                        >
                            Nome <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            id={`edit-client-name-${client.id}`}
                            name="name"
                            icon={User}
                            value={name}
                            onChange={(ev) => setName(ev.target.value)}
                            disabled={isPending}
                            disabledIcon={isPending}
                            placeholder="Nome do cliente"
                            className={inputBase}
                        />
                    </div>

                    {/* E-MAIL */}
                    <div className="space-y-2">
                        <label
                            className="text-label-medium-size text-content-primary"
                            htmlFor={`edit-client-email-${client.id}`}
                        >
                            E-mail <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            id={`edit-client-email-${client.id}`}
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

                    {/* TELEFONE */}
                    <div className="space-y-2">
                        <label
                            className="text-label-medium-size text-content-primary"
                            htmlFor={`edit-client-phone-${client.id}`}
                        >
                            Telefone <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            id={`edit-client-phone-${client.id}`}
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

                    {/* DATA DE NASCIMENTO */}
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
                                                {
                                                    locale: ptBR,
                                                }
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
                                    fromYear={fromYear}
                                    toYear={toYear}
                                    disabled={(date) => date > new Date()}
                                />
                            </PopoverContent>
                        </Popover>

                        <p className="text-[11px] text-content-tertiary">
                            Usamos essa data para aniversários e relatórios.
                        </p>
                    </div>

                    {/* ENDEREÇOS */}
                    <div className="space-y-3 pt-4 border-t border-border-primary">
                        <div className="flex items-center justify-between gap-3">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <MapPinHouse className="h-4 w-4 text-content-brand" />
                                    <p className="text-label-medium-size text-content-primary">
                                        Endereços
                                    </p>
                                </div>
                                <p className="text-[11px] text-content-tertiary">
                                    Edite os endereços do cliente. O primeiro
                                    será considerado o principal.
                                </p>
                            </div>

                            <Button
                                type="button"
                                variant="edit2"
                                size="sm"
                                disabled={isPending}
                                onClick={() =>
                                    setAddresses((prev) => [
                                        ...prev,
                                        {
                                            label: `Endereço ${prev.length + 1}`,
                                            street: '',
                                            number: '',
                                            city: '',
                                            state: '',
                                            isDefault: false,
                                        },
                                    ])
                                }
                            >
                                Adicionar endereço
                            </Button>
                        </div>

                        {addresses.map((address, index) => (
                            <div
                                key={address.id ?? `new-${index}`}
                                className="space-y-3 rounded-xl border border-border-primary bg-background-secondary p-4"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-label-small text-content-primary">
                                        {index === 0
                                            ? 'Endereço principal'
                                            : `Endereço ${index + 1}`}
                                    </p>

                                    {addresses.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={isPending}
                                            onClick={() =>
                                                setAddresses((prev) =>
                                                    prev.filter(
                                                        (_, i) => i !== index
                                                    )
                                                )
                                            }
                                        >
                                            Remover
                                        </Button>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        className="text-label-medium-size text-content-primary"
                                        htmlFor={`edit-client-address-label-${client.id}-${index}`}
                                    >
                                        Label
                                    </label>

                                    <IconInput
                                        id={`edit-client-address-label-${client.id}-${index}`}
                                        name={`addressLabel-${index}`}
                                        icon={Home}
                                        value={address.label}
                                        onChange={(ev) =>
                                            setAddresses((prev) =>
                                                prev.map((item, i) =>
                                                    i === index
                                                        ? {
                                                              ...item,
                                                              label: ev.target
                                                                  .value,
                                                          }
                                                        : item
                                                )
                                            )
                                        }
                                        disabled={isPending}
                                        disabledIcon={isPending}
                                        placeholder="Ex.: Casa, Trabalho"
                                        className={inputBase}
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <label
                                            className="text-label-medium-size text-content-primary"
                                            htmlFor={`edit-client-address-street-${client.id}-${index}`}
                                        >
                                            Rua
                                        </label>

                                        <IconInput
                                            id={`edit-client-address-street-${client.id}-${index}`}
                                            name={`street-${index}`}
                                            icon={MapPinned}
                                            value={address.street}
                                            onChange={(ev) =>
                                                setAddresses((prev) =>
                                                    prev.map((item, i) =>
                                                        i === index
                                                            ? {
                                                                  ...item,
                                                                  street: ev
                                                                      .target
                                                                      .value,
                                                              }
                                                            : item
                                                    )
                                                )
                                            }
                                            disabled={isPending}
                                            disabledIcon={isPending}
                                            placeholder="Rua do cliente"
                                            className={inputBase}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label
                                            className="text-label-medium-size text-content-primary"
                                            htmlFor={`edit-client-address-number-${client.id}-${index}`}
                                        >
                                            Número
                                        </label>

                                        <IconInput
                                            id={`edit-client-address-number-${client.id}-${index}`}
                                            name={`number-${index}`}
                                            icon={Hash}
                                            value={address.number}
                                            onChange={(ev) =>
                                                setAddresses((prev) =>
                                                    prev.map((item, i) =>
                                                        i === index
                                                            ? {
                                                                  ...item,
                                                                  number: ev
                                                                      .target
                                                                      .value,
                                                              }
                                                            : item
                                                    )
                                                )
                                            }
                                            disabled={isPending}
                                            disabledIcon={isPending}
                                            placeholder="123"
                                            className={inputBase}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <label
                                            className="text-label-medium-size text-content-primary"
                                            htmlFor={`edit-client-address-city-${client.id}-${index}`}
                                        >
                                            Cidade
                                        </label>

                                        <IconInput
                                            id={`edit-client-address-city-${client.id}-${index}`}
                                            name={`city-${index}`}
                                            icon={Building2}
                                            value={address.city}
                                            onChange={(ev) =>
                                                setAddresses((prev) =>
                                                    prev.map((item, i) =>
                                                        i === index
                                                            ? {
                                                                  ...item,
                                                                  city: ev
                                                                      .target
                                                                      .value,
                                                              }
                                                            : item
                                                    )
                                                )
                                            }
                                            disabled={isPending}
                                            disabledIcon={isPending}
                                            placeholder="Cidade"
                                            className={inputBase}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label
                                            className="text-label-medium-size text-content-primary"
                                            htmlFor={`edit-client-address-state-${client.id}-${index}`}
                                        >
                                            Estado
                                        </label>

                                        <IconInput
                                            id={`edit-client-address-state-${client.id}-${index}`}
                                            name={`state-${index}`}
                                            icon={MapPinned}
                                            value={address.state}
                                            onChange={(ev) =>
                                                setAddresses((prev) =>
                                                    prev.map((item, i) =>
                                                        i === index
                                                            ? {
                                                                  ...item,
                                                                  state: ev.target.value
                                                                      .toUpperCase()
                                                                      .slice(
                                                                          0,
                                                                          2
                                                                      ),
                                                              }
                                                            : item
                                                    )
                                                )
                                            }
                                            disabled={isPending}
                                            disabledIcon={isPending}
                                            placeholder="SP"
                                            className={inputBase}
                                            maxLength={2}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
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
