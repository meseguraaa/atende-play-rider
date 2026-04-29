// mobile/src/components/loading/ShimmerBlock.tsx
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    DimensionValue,
    Easing,
    LayoutChangeEvent,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
    width?: DimensionValue;
    height?: number;
    radius?: number;
    style?: StyleProp<ViewStyle>;

    /**
     * Liga/desliga o shimmer.
     * Se false: vira skeleton "estático" (sem brilho).
     */
    active?: boolean;

    /**
     * Anti-flicker: espera um pouquinho antes de mostrar o brilho.
     * Se a tela carregar rápido, o shimmer nem chega a aparecer.
     */
    minDelayMs?: number;

    /**
     * Duração do loop do brilho.
     */
    durationMs?: number;
};

/**
 * Bloco de skeleton com shimmer estilo "Netflix-level".
 * - Tem delay mínimo (anti-flicker)
 * - Tem fade in/out suave
 * - Usa a largura real do componente pra animar certinho
 */
function ShimmerBlockBase({
    width = '100%',
    height = 12,
    radius = 10,
    style,
    active = true,
    minDelayMs = 280,
    durationMs = 1150,
}: Props) {
    const [layoutW, setLayoutW] = useState(0);

    const translate = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loopRef = useRef<Animated.CompositeAnimation | null>(null);

    const shouldAnimate = active && layoutW > 0;

    const containerStyle = useMemo<StyleProp<ViewStyle>>(
        () => [
            styles.container,
            { width, height, borderRadius: radius } as ViewStyle,
            style,
        ],
        [width, height, radius, style]
    );

    const onLayout = (e: LayoutChangeEvent) => {
        const w = Math.max(0, Math.round(e.nativeEvent.layout.width));
        if (w && w !== layoutW) setLayoutW(w);
    };

    const stopAll = useCallbackSafe(() => {
        if (delayTimerRef.current) {
            clearTimeout(delayTimerRef.current);
            delayTimerRef.current = null;
        }
        if (loopRef.current) {
            loopRef.current.stop();
            loopRef.current = null;
        }
        translate.stopAnimation();
    });

    useEffect(() => {
        // sempre limpa antes
        stopAll();

        if (!shouldAnimate) {
            // some com fade (bem rápido) e fica estático
            Animated.timing(opacity, {
                toValue: 0,
                duration: 140,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }).start();
            return;
        }

        // anti-flicker: só liga shimmer depois de um delay curto
        delayTimerRef.current = setTimeout(
            () => {
                delayTimerRef.current = null;

                // começa fora da esquerda
                translate.setValue(0);
                opacity.setValue(0);

                // fade-in suave
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 220,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }).start();

                // loop do brilho
                const anim = Animated.loop(
                    Animated.timing(translate, {
                        toValue: 1,
                        duration: durationMs,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    })
                );

                loopRef.current = anim;
                anim.start();
            },
            Math.max(0, minDelayMs)
        );

        return () => {
            stopAll();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldAnimate, minDelayMs, durationMs, layoutW, active]);

    // range baseado na largura real, passa “além” das bordas
    const travel = Math.max(120, layoutW * 1.35);

    const shimmerTransform = useMemo(
        () => ({
            transform: [
                {
                    translateX: translate.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-travel, travel],
                    }),
                },
            ],
        }),
        [translate, travel]
    );

    return (
        <View style={containerStyle} onLayout={onLayout}>
            {/* brilho */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    shimmerTransform,
                    { opacity: opacity },
                ]}
            >
                <LinearGradient
                    colors={[
                        'rgba(255,255,255,0)',
                        'rgba(255,255,255,0.16)',
                        'rgba(255,255,255,0)',
                    ]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[
                        styles.gradient,
                        { width: Math.max(140, layoutW * 0.45) },
                    ]}
                />
            </Animated.View>
        </View>
    );
}

/**
 * Pequena ajudinha pra não recriar callback em efeito acima sem puxar useCallback
 * (mantém o arquivo simples e evita dependências chatas).
 */
function useCallbackSafe<T extends (...args: any[]) => any>(fn: T): T {
    const ref = useRef(fn);
    ref.current = fn;

    return useMemo(() => ((...args) => ref.current(...args)) as T, []);
}

const styles = StyleSheet.create({
    container: {
        // base do skeleton, neutra e suave
        backgroundColor: 'rgba(255,255,255,0.10)',
        overflow: 'hidden',
    },
    gradient: {
        height: '100%',
    },
});

export const ShimmerBlock = memo(ShimmerBlockBase);
