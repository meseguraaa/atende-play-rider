import React from 'react';
import { Stack } from 'expo-router';
import { View } from 'react-native';

export default function AppLayout() {
    /**
     * ✅ IMPORTANTE:
     * O "gap" que você viu no Android acontece quando a gente aplica safe-area bottom
     * aqui E também na TabBar (tabs/_layout.tsx). A TabBar é quem deve respeitar a navbar
     * do Android, então removemos o paddingBottom daqui.
     *
     * Resultado esperado:
     * - O conteúdo não ganha “vão extra”
     * - A TabBar encosta certinho na navbar do Android (com fundo preto contínuo)
     */
    return (
        <View style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false }}>
                {/* ✅ aqui sim o "(tabs)" existe */}
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

                {/* ✅ esses dois são segmentos/pastas: booking/* e client/* */}
                <Stack.Screen name="booking" options={{ headerShown: false }} />
                <Stack.Screen name="client" options={{ headerShown: false }} />
            </Stack>
        </View>
    );
}
