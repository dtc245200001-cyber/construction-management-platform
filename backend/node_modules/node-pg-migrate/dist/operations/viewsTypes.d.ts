import { Name, Value, DropOptions, Nullable } from './generalTypes';
export declare type ViewOptions = {
    [key: string]: boolean | number | string;
};
export interface CreateViewOptions {
    temporary?: boolean;
    replace?: boolean;
    recursive?: boolean;
    columns?: string | string[];
    checkOption?: 'CASCADED' | 'LOCAL';
    options?: ViewOptions;
}
export interface AlterViewOptions {
    checkOption?: null | 'CASCADED' | 'LOCAL';
    options?: Nullable<ViewOptions>;
}
export interface AlterViewColumnOptions {
    default?: Value;
}
declare type CreateViewFn = (viewName: Name, options: CreateViewOptions & DropOptions, definition: string) => string | string[];
export declare type CreateView = CreateViewFn & {
    reverse: CreateViewFn;
};
export declare type DropView = (viewName: Name, options?: DropOptions) => string | string[];
export declare type AlterView = (viewName: Name, options: AlterViewOptions) => string | string[];
export declare type AlterViewColumn = (viewName: Name, columnName: string, options: AlterViewColumnOptions) => string | string[];
declare type RenameViewFn = (viewName: Name, newViewName: Name) => string | string[];
export declare type RenameView = RenameViewFn & {
    reverse: RenameViewFn;
};
export {};
