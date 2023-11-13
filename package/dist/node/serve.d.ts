declare type ServeOptions = {
    port: string;
    enableCache: 'true' | 'false';
    repeatRender: string;
};
export default function serveProject(viseAppDir: string, options: ServeOptions): Promise<import("zx").ProcessOutput | undefined>;
export {};
