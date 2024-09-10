import { Transaction, TransactionReceipt } from "ethers"
import { ITxnOpts } from "../../interfaces/ITxnLifecycle";
import { IRPCCallResult } from "../../interfaces/ARPCErrorInterceptor";


export interface IMonitorJob {
    txn: Transaction;
    opts: ITxnOpts;
    attemptCount: number;
    pollingStarted: Date;
    callResult?: IRPCCallResult<TransactionReceipt>;
    lastError?: any;
    callback?: (result: IMonitorJob) => Promise<void>;
}