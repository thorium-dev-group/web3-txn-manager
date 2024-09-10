

export interface INonceUpdate {
    nonce: number;
    address: string;
    updateType: "ALLOCATED" | "REJECTED";
}

export type NonceListener = (update: INonceUpdate) => Promise<void>;

export abstract class ANonceManager {

    abstract getNextNonce(address: string): Promise<number>;

    abstract rejectNonce(address: string, nonce: number): Promise<void>;

    abstract refreshNonce(address: string): Promise<void>;

    abstract registerNonceListener(listener: NonceListener): void;
}