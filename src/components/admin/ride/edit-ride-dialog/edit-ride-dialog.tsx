'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type UnitOption = {
    id: string;
    name: string;
};

type MeetingPointFormItem = {
    name: string;
    address: string | null;
};

type RideImageFormItem = {
    imageUrl: string;
    imageKey?: string | null;
    imageMime?: string | null;
    imageSize?: number | null;
};

export type RideToEdit = {
    id: string;
    title: string;
    destination: string;
    description: string | null;
    observation: string | null;
    startsAt: string | Date;
    endsAt: string | Date | null;
    images?: RideImageFormItem[];
    meetingPoints?: MeetingPointFormItem[];
};

type Props = {
    children?: React.ReactNode;
    ride: RideToEdit;
};

type UploadResponse =
    | {
          ok: true;
          data: {
              url: string;
              key?: string;
              mime?: string;
              size?: number;
          };
      }
    | {
          ok: false;
          error?: string;
      };

const MAX_UPLOAD_MB = 8;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

function toDatetimeLocalValue(value: string | Date | null) {
    if (!value) return '';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const pad = (n: number) => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EditRideDialog({ children, ride }: Props) {
    const router = useRouter();

    const [open, setOpen] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [uploadingImage, setUploadingImage] = React.useState(false);

    const [title, setTitle] = React.useState('');
    const [destination, setDestination] = React.useState('');
    const [startsAt, setStartsAt] = React.useState('');
    const [endsAt, setEndsAt] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [observation, setObservation] = React.useState('');
    const [meetingPoints, setMeetingPoints] = React.useState<
        MeetingPointFormItem[]
    >([{ name: '', address: '' }]);
    const [images, setImages] = React.useState<RideImageFormItem[]>([]);

    function hydrateForm() {
        setTitle(ride.title ?? '');
        setDestination(ride.destination ?? '');
        setStartsAt(toDatetimeLocalValue(ride.startsAt));
        setEndsAt(toDatetimeLocalValue(ride.endsAt));
        setDescription(ride.description ?? '');
        setObservation(ride.observation ?? '');

        setMeetingPoints(
            ride.meetingPoints?.length
                ? ride.meetingPoints.map((point) => ({
                      name: point.name ?? '',
                      address: point.address ?? '',
                  }))
                : [{ name: '', address: '' }]
        );

        setImages(
            ride.images?.length
                ? ride.images.map((image) => ({
                      imageUrl: image.imageUrl,
                      imageKey: image.imageKey ?? null,
                      imageMime: image.imageMime ?? null,
                      imageSize: image.imageSize ?? null,
                  }))
                : []
        );
    }

    React.useEffect(() => {
        if (!open) return;
        hydrateForm();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, ride.id]);

    function updateMeetingPoint(
        index: number,
        field: keyof MeetingPointFormItem,
        value: string
    ) {
        setMeetingPoints((current) =>
            current.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        );
    }

    function addMeetingPoint() {
        setMeetingPoints((current) => [...current, { name: '', address: '' }]);
    }

    function removeMeetingPoint(index: number) {
        setMeetingPoints((current) => {
            if (current.length <= 1) return current;
            return current.filter((_, i) => i !== index);
        });
    }

    function removeImage(index: number) {
        setImages((current) => current.filter((_, i) => i !== index));
    }

    async function uploadImage(file: File) {
        if (!file.type?.startsWith('image/')) {
            toast.error('Selecione um arquivo de imagem.');
            return;
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            toast.error(`Imagem muito grande. Máximo: ${MAX_UPLOAD_MB}MB.`);
            return;
        }

        try {
            setUploadingImage(true);

            const formData = new FormData();
            formData.append('file', file);
            formData.append('module', 'RIDES');

            const response = await fetch('/api/admin/uploads', {
                method: 'POST',
                body: formData,
            });

            const json = (await response
                .json()
                .catch(() => null)) as UploadResponse | null;

            if (!response.ok || !json || json.ok !== true) {
                toast.error(
                    json?.ok === false && json.error
                        ? json.error
                        : 'Não foi possível enviar a imagem.'
                );
                return;
            }

            setImages((current) => [
                ...current,
                {
                    imageUrl: json.data.url,
                    imageKey: json.data.key ?? null,
                    imageMime: json.data.mime ?? null,
                    imageSize: json.data.size ?? null,
                },
            ]);

            toast.success('Imagem adicionada ao rolê!');
        } catch {
            toast.error('Erro ao enviar imagem.');
        } finally {
            setUploadingImage(false);
        }
    }

    async function handleSubmit() {
        const cleanTitle = title.trim();
        const cleanDestination = destination.trim();

        if (!cleanTitle) return toast.error('Informe o título do rolê.');
        if (!cleanDestination) return toast.error('Informe o destino do rolê.');
        if (!startsAt) return toast.error('Informe a data e hora de início.');

        const startsAtDate = new Date(startsAt);
        const endsAtDate = endsAt ? new Date(endsAt) : null;

        if (Number.isNaN(startsAtDate.getTime())) {
            return toast.error('Data de início inválida.');
        }

        if (endsAtDate && Number.isNaN(endsAtDate.getTime())) {
            return toast.error('Data de fim inválida.');
        }

        if (endsAtDate && endsAtDate <= startsAtDate) {
            return toast.error('A data de fim precisa ser depois do início.');
        }

        const cleanMeetingPoints = meetingPoints
            .map((point) => ({
                name: point.name.trim(),
                address: String(point.address ?? '').trim(),
            }))
            .filter((point) => point.name || point.address);

        if (cleanMeetingPoints.length === 0) {
            return toast.error('Informe pelo menos um ponto de encontro.');
        }

        try {
            setSubmitting(true);

            const response = await fetch(`/api/admin/rides/${ride.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update',
                    title: cleanTitle,
                    destination: cleanDestination,
                    startsAt: startsAtDate.toISOString(),
                    endsAt: endsAtDate ? endsAtDate.toISOString() : null,
                    description: description.trim() || null,
                    observation: observation.trim() || null,
                    meetingPoints: cleanMeetingPoints,
                    images,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(data?.error ?? 'Não foi possível editar o rolê.');
                return;
            }

            toast.success('Rolê atualizado com sucesso!');
            setOpen(false);
            router.refresh();
        } catch {
            toast.error('Erro ao editar rolê.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <span className="inline-flex">{children}</span>
            </DialogTrigger>

            <DialogContent
                variant="appointment"
                overlayVariant="blurred"
                showCloseButton
            >
                <DialogHeader>
                    <DialogTitle size="modal">Editar rolê</DialogTitle>
                    <DialogDescription size="modal">
                        Ajuste as informações principais do rolê.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Título
                        </p>
                        <Input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Ex: Bate-volta para Serra Negra"
                        />
                    </div>

                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Destino
                        </p>
                        <Input
                            value={destination}
                            onChange={(event) =>
                                setDestination(event.target.value)
                            }
                            placeholder="Ex: Serra Negra - SP"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <p className="text-label-medium-size text-content-primary">
                                Início
                            </p>
                            <Input
                                type="datetime-local"
                                value={startsAt}
                                onChange={(event) =>
                                    setStartsAt(event.target.value)
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <p className="text-label-medium-size text-content-primary">
                                Fim
                            </p>
                            <Input
                                type="datetime-local"
                                value={endsAt}
                                onChange={(event) =>
                                    setEndsAt(event.target.value)
                                }
                            />
                        </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border-primary bg-background-secondary p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-label-medium-size text-content-primary">
                                    Pontos de encontro
                                </p>
                                <p className="text-xs text-content-secondary">
                                    Adicione um ou mais locais de saída/parada.
                                </p>
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addMeetingPoint}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Adicionar
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {meetingPoints.map((point, index) => (
                                <div
                                    key={index}
                                    className="rounded-lg border border-border-primary bg-background-tertiary p-3"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-medium text-content-primary">
                                            Ponto {index + 1}
                                        </p>

                                        {meetingPoints.length > 1 ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removeMeetingPoint(index)
                                                }
                                                className="rounded-md p-1 text-content-secondary hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        ) : null}
                                    </div>

                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        <Input
                                            value={point.name}
                                            onChange={(event) =>
                                                updateMeetingPoint(
                                                    index,
                                                    'name',
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Nome do ponto"
                                        />

                                        <Input
                                            value={point.address ?? ''}
                                            onChange={(event) =>
                                                updateMeetingPoint(
                                                    index,
                                                    'address',
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Endereço ou referência"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border-primary bg-background-secondary p-3">
                        <div>
                            <p className="text-label-medium-size text-content-primary">
                                Imagens do rolê
                            </p>
                            <p className="text-xs text-content-secondary">
                                Adicione fotos para ilustrar o destino, rota ou
                                ponto de encontro.
                            </p>
                        </div>

                        <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border-primary bg-background-tertiary px-4 py-6 text-sm text-content-secondary hover:border-border-secondary">
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                disabled={uploadingImage}
                                onChange={async (event) => {
                                    const files = Array.from(
                                        event.target.files ?? []
                                    );

                                    for (const file of files) {
                                        await uploadImage(file);
                                    }

                                    event.target.value = '';
                                }}
                            />

                            <span className="inline-flex items-center gap-2">
                                {uploadingImage ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <ImagePlus className="h-4 w-4" />
                                )}
                                {uploadingImage
                                    ? 'Enviando imagem...'
                                    : 'Selecionar imagens'}
                            </span>
                        </label>

                        {images.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                {images.map((image, index) => (
                                    <div
                                        key={`${image.imageUrl}-${index}`}
                                        className="relative overflow-hidden rounded-lg border border-border-primary bg-background-tertiary"
                                    >
                                        <img
                                            src={image.imageUrl}
                                            alt={`Imagem ${index + 1}`}
                                            className="h-28 w-full object-cover"
                                        />

                                        <button
                                            type="button"
                                            onClick={() => removeImage(index)}
                                            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Descrição
                        </p>
                        <Textarea
                            value={description}
                            onChange={(event) =>
                                setDescription(event.target.value)
                            }
                            placeholder="Detalhes do trajeto, ritmo, regras, recomendações..."
                            rows={4}
                        />
                    </div>

                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Observação
                        </p>
                        <Textarea
                            value={observation}
                            onChange={(event) =>
                                setObservation(event.target.value)
                            }
                            placeholder="Observações internas ou avisos extras"
                            rows={3}
                        />
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            type="button"
                            variant="brand"
                            onClick={handleSubmit}
                            disabled={submitting || uploadingImage}
                        >
                            {submitting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Salvar alterações
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
