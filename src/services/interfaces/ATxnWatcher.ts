import { Transaction, TransactionReceipt } from "ethers";
import { IRPCCallResult } from "./ARPCErrorInterceptor";


export interface IWatchRequest {
    txn: Transaction;
}

export abstract class ATxnWatcher {

    abstract watchForReceipt(request: IWatchRequest): Promise<IRPCCallResult<TransactionReceipt>>;

}