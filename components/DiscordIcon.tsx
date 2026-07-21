import { FontAwesome6 } from '@expo/vector-icons';
import React from 'react';

// The real Discord brand mark (lucide has no brand icons) — matches the
// { size, color } call shape used everywhere else icons are rendered.
export function DiscordIcon({ size = 20, color }: { size?: number; color?: string }) {
    return <FontAwesome6 name="discord" brand size={size} color={color} />;
}
