export declare function isObject(value: unknown): boolean;
declare type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial10<T[P]>;
} : T;
declare type DeepPartial10<T> = T extends object ? {
    [P in keyof T]?: DeepPartial9<T[P]>;
} : T;
declare type DeepPartial9<T> = T extends object ? {
    [P in keyof T]?: DeepPartial8<T[P]>;
} : T;
declare type DeepPartial8<T> = T extends object ? {
    [P in keyof T]?: DeepPartial7<T[P]>;
} : T;
declare type DeepPartial7<T> = T extends object ? {
    [P in keyof T]?: DeepPartial6<T[P]>;
} : T;
declare type DeepPartial6<T> = T extends object ? {
    [P in keyof T]?: DeepPartial5<T[P]>;
} : T;
declare type DeepPartial5<T> = T extends object ? {
    [P in keyof T]?: DeepPartial4<T[P]>;
} : T;
declare type DeepPartial4<T> = T extends object ? {
    [P in keyof T]?: DeepPartial3<T[P]>;
} : T;
declare type DeepPartial3<T> = T extends object ? {
    [P in keyof T]?: DeepPartial2<T[P]>;
} : T;
declare type DeepPartial2<T> = T extends object ? Partial<T> : T;
export default function mergeConfig<T>(defaults: T, ...overrides: Array<DeepPartial<T>>): T;
export {};
