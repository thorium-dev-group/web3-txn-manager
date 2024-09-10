

export enum RPCCallStatus {
    SUCCESS = 'success',
    TIMEOUT = 'timeout',
    ESTIMATE_FAILED = "estimate-failed",
    NONCE_USED = "nonce-used",
    TXN_SEEN = "txn-seen",
    RPC_ERROR = "rpc-error",
}

export interface IRPCCallResult<T> {
    status: RPCCallStatus;
    error?: any;
    hash?: string;
    result?: T;
}

export interface IRPCHandler {
    execute<T>(): Promise<T>
    handleNonceTooLow(): Promise<void>;
    handleNonceAlreadyUsed(): Promise<void>;
    handleTimeout(): Promise<void>;
}

export interface IRPCContext {
    withRetries(retries: number): IRPCContext;
    call<T>(fn: () =>Promise<T>): Promise<IRPCCallResult<T>>;
}

export abstract class ARPCErrorInterceptor{

    abstract newContext(): Promise<IRPCContext>;
    
}