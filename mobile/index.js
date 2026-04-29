// 🔍 Logs de diagnóstico no boot (antes de qualquer render)
try {
    // eslint-disable-next-line no-console
    console.log('[BOOT] react version:', require('react/package.json').version);
} catch (e) {
    // eslint-disable-next-line no-console
    console.log('[BOOT] react version: <failed>', String(e));
}

try {
    // eslint-disable-next-line no-console
    console.log(
        '[BOOT] react-native version:',
        require('react-native/package.json').version
    );
} catch (e) {
    // eslint-disable-next-line no-console
    console.log('[BOOT] react-native version: <failed>', String(e));
}

import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import React from 'react';

export function App() {
    const ctx = require.context('./app');
    return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
