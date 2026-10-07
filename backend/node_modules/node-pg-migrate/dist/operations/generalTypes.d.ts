import PgLiteral from './PgLiteral';
export declare type LiteralUnion<T extends string> = T | (string & {
    zz_IGNORE_ME?: never;
});
export declare type PublicPart<T> = {
    [K in keyof T]: T[K];
};
export declare type Nullable<T> = {
    [P in keyof T]: T[P] | null;
};
export declare type PgLiteralValue = PublicPart<PgLiteral>;
export declare type Value = null | boolean | string | number | PgLiteral | PgLiteralValue | Value[];
export declare type Type = string | {
    type: string;
};
export declare type Name = string | {
    schema?: string;
    name: string;
};
export interface IfNotExistsOption {
    ifNotExists?: boolean;
}
export interface IfExistsOption {
    ifExists?: boolean;
}
export interface CascadeOption {
    cascade?: boolean;
}
export declare type DropOptions = IfExistsOption & CascadeOption;
