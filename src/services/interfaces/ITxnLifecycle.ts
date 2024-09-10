
import {TransactionRequest, Transaction, ethers} from 'ethers';
import { IRPCCallResult } from './ARPCErrorInterceptor';

export type TransactionHash = string;


export interface ITxnStoreHook {
    beforeSubmit(txn: Transaction): Promise<void>;
    afterSubmit(txn: Transaction): Promise<void>;
}

export interface ITxnOpts {
    cancelAfterSeconds?: number;
    resubmitAfterSeconds?: number;
    retries?: number;
    hook?: ITxnStoreHook;
}

export enum TxnLifecycleFailure {
    SignerAssignmentFailed = 1,
    TxnPreparationFailed,
    GasEstimationFailed,
    TxnSubmissionFailed,
    TxnConfirmationFailed,
    TxnCancelled
}

export interface ITxnLifecycleJob {
    request: TransactionRequest; //origin request
    txn?: Transaction; //current prepared transaction
    failureStatus?: TxnLifecycleFailure; //current failure status
    lastError?: any;
    result?: IRPCCallResult<TransactionHash>;
    signer?: ethers.Signer;
    clearStatus(): void;
    cancelReason?: string;
}

export interface ITxnLifecycleListener {
    onSignerAssigned(ctx: ITxnLifecycle): Promise<ITxnLifecycleJob | undefined>;
    onTxnPrepared(ctx: ITxnLifecycle): Promise<ITxnLifecycleJob | undefined>;
    onGasEstimated(ctx: ITxnLifecycle): Promise<ITxnLifecycleJob | undefined>;
    onTxnSubmitted(ctx: ITxnLifecycle): Promise<ITxnLifecycleJob | undefined>;
}
export interface ITxnLifecycle {
    tryCount: number;
    options: ITxnOpts;
    metadata: any;

    getJob(): ITxnLifecycleJob;
    assignSigner(job: ITxnLifecycleJob): Promise<ITxnLifecycleJob>;
    prepareTxn(job: ITxnLifecycleJob, cancel?: boolean): Promise<ITxnLifecycleJob>;
    estimateGas(job: ITxnLifecycleJob): Promise<ITxnLifecycleJob>;
    submitTxn(job: ITxnLifecycleJob): Promise<ITxnLifecycleJob>;
    cancelTxn(job: ITxnLifecycleJob, reason: string): Promise<ITxnLifecycleJob>;
}