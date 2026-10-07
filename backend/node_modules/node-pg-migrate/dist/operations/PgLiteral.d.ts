export default class PgLiteral {
    readonly value: string;
    static create(str: string): PgLiteral;
    readonly literal = true;
    constructor(value: string);
    toString(): string;
}
