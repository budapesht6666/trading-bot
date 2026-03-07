import { TradeSignal } from './strategy';
export declare function sendSignalNotification(signal: TradeSignal): Promise<void>;
export declare function sendErrorNotification(message: string): Promise<void>;
export declare function sendStartNotification(): Promise<void>;
export declare function sendSummaryNotification(analyzed: number, signals: number): Promise<void>;
//# sourceMappingURL=telegram.d.ts.map