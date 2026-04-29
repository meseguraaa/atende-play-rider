import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function AuthCallback() {
    const params = useLocalSearchParams();
    const router = useRouter();

    useEffect(() => {
        // Aqui você vai tratar success/error vindo do backend
        // Ex.: ?token=... ou ?error=...
        const error = params?.error as string | undefined;

        if (error) {
            // leve para sua tela de login com o erro
            router.replace({ pathname: '/(auth)/login', params: { error } });
            return;
        }

        // caso de sucesso (ajuste conforme seu backend enviar)
        router.replace('/(app)/(tabs)/home');
    }, [params, router]);

    return (
        <View
            style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
        >
            <Text>Finalizando login…</Text>
            <Text selectable style={{ marginTop: 12, opacity: 0.7 }}>
                {JSON.stringify(params)}
            </Text>
        </View>
    );
}
