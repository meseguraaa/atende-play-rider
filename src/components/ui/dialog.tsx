'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

function Dialog({
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
    return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
    return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
    return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
    return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

// Variantes para DialogOverlay
const dialogOverlayVariants = cva(
    'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50',
    {
        variants: {
            variant: {
                default: 'bg-black/50',
                blurred: 'bg-black/40 backdrop-blur-[2px]',
                dark: 'bg-black/60',
                light: 'bg-black/30',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

function DialogOverlay({
    className,
    variant,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> &
    VariantProps<typeof dialogOverlayVariants>) {
    return (
        <DialogPrimitive.Overlay
            data-slot="dialog-overlay"
            className={cn(dialogOverlayVariants({ variant }), className)}
            {...props}
        />
    );
}

// Variantes para DialogContent
const dialogContentVariants = cva(
    'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 p-6 shadow-lg duration-200',
    {
        variants: {
            variant: {
                default:
                    'bg-background border rounded-lg max-w-[calc(100%-2rem)] sm:max-w-lg',
                appointment:
                    'bg-background-tertiary border-none rounded-lg max-w-[calc(100%-2rem)] sm:max-w-[477px] max-h-[90vh] overflow-y-auto',
                large: 'bg-background border rounded-lg max-w-[calc(100%-2rem)] sm:max-w-2xl',
                wide: 'bg-background border rounded-lg max-w-[calc(100%-2rem)] sm:max-w-4xl',
                xwide: 'bg-background border rounded-lg max-w-[calc(100%-2rem)] sm:max-w-6xl',
                fullscreen:
                    'bg-background border rounded-lg max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)] sm:max-w-6xl sm:max-h-[90vh] overflow-y-auto',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

function DialogContent({
    className,
    children,
    showCloseButton = true,
    variant,
    overlayVariant,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
    VariantProps<typeof dialogContentVariants> & {
        showCloseButton?: boolean;
        overlayVariant?: VariantProps<typeof dialogOverlayVariants>['variant'];
    }) {
    return (
        <DialogPortal data-slot="dialog-portal">
            <DialogOverlay variant={overlayVariant} />
            <DialogPrimitive.Content
                data-slot="dialog-content"
                className={cn(dialogContentVariants({ variant }), className)}
                {...props}
            >
                {children}
                {showCloseButton && (
                    <DialogPrimitive.Close
                        data-slot="dialog-close"
                        className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                    >
                        <XIcon />
                        <span className="sr-only">Close</span>
                    </DialogPrimitive.Close>
                )}
            </DialogPrimitive.Content>
        </DialogPortal>
    );
}

// Variantes para DialogHeader
const dialogHeaderVariants = cva('flex flex-col gap-2', {
    variants: {
        align: {
            left: 'text-left',
            center: 'text-center sm:text-left',
            right: 'text-right',
        },
    },
    defaultVariants: {
        align: 'center',
    },
});

function DialogHeader({
    className,
    align,
    ...props
}: React.ComponentProps<'div'> & VariantProps<typeof dialogHeaderVariants>) {
    return (
        <div
            data-slot="dialog-header"
            className={cn(dialogHeaderVariants({ align }), className)}
            {...props}
        />
    );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="dialog-footer"
            className={cn(
                'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
                className
            )}
            {...props}
        />
    );
}

// Variantes para DialogTitle
const dialogTitleVariants = cva('leading-none font-semibold', {
    variants: {
        size: {
            sm: 'text-base',
            default: 'text-lg',
            lg: 'text-xl',
            xl: 'text-2xl',
            modal: 'text-title-modal text-content-primary',
        },
    },
    defaultVariants: {
        size: 'default',
    },
});

function DialogTitle({
    className,
    size,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Title> &
    VariantProps<typeof dialogTitleVariants>) {
    return (
        <DialogPrimitive.Title
            data-slot="dialog-title"
            className={cn(dialogTitleVariants({ size }), className)}
            {...props}
        />
    );
}

// Variantes para DialogDescription
const dialogDescriptionVariants = cva('text-muted-foreground', {
    variants: {
        size: {
            sm: 'text-xs',
            default: 'text-sm',
            lg: 'text-base',
            modal: 'text-paragraph-medium text-content-secondary',
        },
    },
    defaultVariants: {
        size: 'default',
    },
});

function DialogDescription({
    className,
    size,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Description> &
    VariantProps<typeof dialogDescriptionVariants>) {
    return (
        <DialogPrimitive.Description
            data-slot="dialog-description"
            className={cn(dialogDescriptionVariants({ size }), className)}
            {...props}
        />
    );
}

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
    dialogContentVariants,
    dialogOverlayVariants,
    dialogHeaderVariants,
    dialogTitleVariants,
    dialogDescriptionVariants,
};
