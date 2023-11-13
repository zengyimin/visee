declare class Logger {
    static info(message: string): void;
    static error(message: string): void;
    static warn(message: string): void;
    static success(message: string): void;
    private static formatViseLog;
    constructor();
}
export default Logger;
