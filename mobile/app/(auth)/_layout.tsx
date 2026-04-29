// app/(auth)/_layout.tsx
import React from 'react';
import { Stack } from 'expo-router';

export default function AuthLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="signup" options={{ headerShown: false }} />
            <Stack.Screen
                name="forgot-password"
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="reset-password"
                options={{ headerShown: false }}
            />
        </Stack>
    );
}
