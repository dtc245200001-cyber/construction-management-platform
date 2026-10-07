import { Value } from '..';
import { Name } from './generalTypes';
export declare type Sql = (sqlStr: string, args?: {
    [key: string]: Name | Value;
}) => string | string[];
