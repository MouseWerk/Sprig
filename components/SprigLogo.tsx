import React from 'react';
import Svg, { G, Polygon, Rect } from 'react-native-svg';

interface SprigLogoProps {
    size?: number;
    tile?: boolean;        // render the sage rounded tile behind the mark
    tileColor?: string;
    rounded?: boolean;
}

// The Sprig seedling mark. Defaults to the full app-icon tile so the near-black
// stem stays visible in both light and dark mode; pass tile={false} to render
// the bare glyph on a known light surface.
export function SprigLogo({ size = 96, tile = true, tileColor = '#EAF1EC', rounded = true }: SprigLogoProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 100 100">
            {tile && <Rect x={0} y={0} width={100} height={100} rx={rounded ? 22 : 0} fill={tileColor} />}
            {/* Scale the mark to 72% around the tile centre so the leaf tips
                stay clear of the rounded corners. */}
            <G scale={0.72} originX={50} originY={50}>
                <Polygon points="46,20 54,20 50,90" fill="#0C1814" stroke="#0C1814" strokeWidth={2} strokeLinejoin="round" />
                <Polygon points="42,45 42,75 15,25" fill="#2E5C4E" stroke="#2E5C4E" strokeWidth={2} strokeLinejoin="round" />
                <Polygon points="58,30 58,60 85,10" fill="#526B63" stroke="#526B63" strokeWidth={2} strokeLinejoin="round" />
            </G>
        </Svg>
    );
}
