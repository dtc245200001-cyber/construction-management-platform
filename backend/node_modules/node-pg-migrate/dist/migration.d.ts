import { DBConnection } from './db';
import MigrationBuilder from './migration-builder';
import { MigrationAction, MigrationBuilderActions, MigrationDirection, RunnerOption, Logger } from './types';
import { ColumnDefinitions } from './operations/tablesTypes';
export interface RunMigration {
    readonly path: string;
    readonly name: string;
    readonly timestamp: number;
}
export declare enum FilenameFormat {
    timestamp = "timestamp",
    utc = "utc"
}
export interface CreateOptionsTemplate {
    templateFileName: string;
}
export interface CreateOptionsDefault {
    language?: 'js' | 'ts' | 'sql';
    ignorePattern?: string;
}
export declare type CreateOptions = {
    filenameFormat?: FilenameFormat;
} & (CreateOptionsTemplate | CreateOptionsDefault);
export declare const loadMigrationFiles: (dir: string, ignorePattern?: string | undefined) => Promise<string[]>;
export declare const getTimestamp: (logger: Logger, filename: string) => number;
export declare class Migration implements RunMigration {
    static create(name: string, directory: string, _language?: 'js' | 'ts' | 'sql' | CreateOptions, _ignorePattern?: string, _filenameFormat?: FilenameFormat): Promise<string>;
    readonly db: DBConnection;
    readonly path: string;
    readonly name: string;
    readonly timestamp: number;
    up?: false | MigrationAction;
    down?: false | MigrationAction;
    readonly options: RunnerOption;
    readonly typeShorthands?: ColumnDefinitions;
    readonly logger: Logger;
    constructor(db: DBConnection, migrationPath: string, { up, down }: MigrationBuilderActions, options: RunnerOption, typeShorthands?: ColumnDefinitions, logger?: Logger);
    _getMarkAsRun(action: MigrationAction): string;
    _apply(action: MigrationAction, pgm: MigrationBuilder): Promise<unknown>;
    _getAction(direction: MigrationDirection): MigrationAction;
    apply(direction: MigrationDirection): Promise<unknown>;
    markAsRun(direction: MigrationDirection): Promise<import("pg").QueryResult<any>>;
}
