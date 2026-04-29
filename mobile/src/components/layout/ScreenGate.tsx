// mobile/src/components/layout/ScreenGate.tsx
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleProp, View, ViewStyle } from 'react-native';
import { useAuth } from '../../auth/auth-context';

type Props = {
    /**
     * Quando os dados da tela terminaram de carregar (mesmo que seja vazio).
     */
    dataReady: boolean;

    /**
     * Skeleton específico da tela (HomeSkeleton, ProductsSkeleton, etc).
     */
    skeleton: React.ReactNode;

    /**
     * Conteúdo real da tela.
     */
    children: React.ReactNode;

    /**
     * Estilo opcional do container.
     */
    style?: StyleProp<ViewStyle>;

    /**
     * Duração do fade quando troca skeleton -> conteúdo.
     */
    fadeMs?: number;
};

/**
 * Gate padrão para telas:
 * - segura a UI até (dataReady && avatarReady)
 * - mostra skeleton com shimmer enquanto carrega
 * - faz crossfade (skeleton out + content in) quando libera
 * - desliga shimmer durante o fade-out do skeleton (Netflix-level)
 */
function ScreenGateBase({
    dataReady,
    skeleton,
    children,
    style,
    fadeMs = 180,
}: Props) {
    const { isBooting, avatarReady } = useAuth();

    // gate final
    const ready = !!dataReady && !!avatarReady && !isBooting;

    const containerStyle = useMemo(() => [{ flex: 1 }, style], [style]);

    // controla o que está montado
    const [mountedContent, setMountedContent] = useState(false);
    const [mountedSkeleton, setMountedSkeleton] = useState(true);

    // quando estamos fazendo a transição, desligamos shimmer no skeleton
    const [skeletonActive, setSkeletonActive] = useState(true);

    // animações
    const contentOpacity = useRef(new Animated.Value(0)).current;
    const skeletonOpacity = useRef(new Animated.Value(1)).current;

    // helper: tenta injetar prop active no skeleton (se ele for um ReactElement)
    const renderedSkeleton = useMemo(() => {
        if (!mountedSkeleton) return null;

        // se for elemento React, tenta clonar com active
        if (React.isValidElement(skeleton)) {
            try {
                return React.cloneElement(skeleton as any, {
                    active: skeletonActive,
                });
            } catch {
                return skeleton;
            }
        }

        // se não for elemento (string, fragmento, etc), retorna normal
        return skeleton;
    }, [mountedSkeleton, skeleton, skeletonActive]);

    // Se voltar a "não pronto": reseta tudo (ex: logout, troca de sessão, etc)
    useEffect(() => {
        if (ready) return;

        setMountedContent(false);
        setMountedSkeleton(true);
        setSkeletonActive(true);

        contentOpacity.stopAnimation();
        skeletonOpacity.stopAnimation();

        contentOpacity.setValue(0);
        skeletonOpacity.setValue(1);
    }, [ready, contentOpacity, skeletonOpacity]);

    // Quando ficar pronto: crossfade
    useEffect(() => {
        if (!ready) return;

        // monta conteúdo
        setMountedContent(true);

        // garante skeleton montado pra fazer fade-out
        setMountedSkeleton(true);

        // inicia estados
        setSkeletonActive(true);
        contentOpacity.setValue(0);
        skeletonOpacity.setValue(1);

        // passo 1: desliga shimmer um tiquinho antes do fade-out (evita brilho nervoso)
        const t = setTimeout(() => {
            setSkeletonActive(false);
        }, 16);

        // passo 2: crossfade
        Animated.parallel([
            Animated.timing(contentOpacity, {
                toValue: 1,
                duration: fadeMs,
                useNativeDriver: true,
            }),
            Animated.timing(skeletonOpacity, {
                toValue: 0,
                duration: fadeMs,
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            if (!finished) return;

            // desmonta skeleton depois da transição
            setMountedSkeleton(false);
        });

        return () => {
            clearTimeout(t);
        };
    }, [ready, fadeMs, contentOpacity, skeletonOpacity]);

    // Enquanto não montou conteúdo ainda, mostra só skeleton (mais simples e leve)
    if (!mountedContent) {
        return <View style={containerStyle}>{renderedSkeleton}</View>;
    }

    return (
        <View style={containerStyle}>
            {/* Skeleton por baixo, saindo em fade-out */}
            {mountedSkeleton ? (
                <Animated.View
                    style={[{ flex: 1 }, { opacity: skeletonOpacity }]}
                >
                    {renderedSkeleton}
                </Animated.View>
            ) : null}

            {/* Conteúdo por cima, entrando em fade-in */}
            <Animated.View
                style={[
                    { flex: 1 },
                    {
                        opacity: contentOpacity,
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 0,
                        bottom: 0,
                    },
                ]}
            >
                {children}
            </Animated.View>
        </View>
    );
}

export const ScreenGate = memo(ScreenGateBase);
