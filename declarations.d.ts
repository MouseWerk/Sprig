declare module "*.csv" {
    const content: any;
    export default content;
}

declare module "*.mp3" {
    const src: number;
    export default src;
}

// react-test-renderer ships with jest-expo but without types; only the part
// the component tests use is declared here.
declare module "react-test-renderer" {
    import type { ReactElement } from 'react';
    export interface ReactTestInstance {
        props: Record<string, any>;
        findAllByType(type: unknown): ReactTestInstance[];
    }
    export interface ReactTestRenderer {
        root: ReactTestInstance;
        unmount(): void;
    }
    export function create(element: ReactElement): ReactTestRenderer;
    export function act(callback: () => void | Promise<void>): void;
}
