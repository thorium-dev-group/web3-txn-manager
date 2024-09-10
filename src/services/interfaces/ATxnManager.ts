
import {TransactionRequest, TransactionResponse} from 'ethers';
import { ITxnOpts } from './ITxnLifecycle';


export abstract class ATxnManager {
    abstract getWalletAddresses(): Promise<string[]>;
    abstract submit(txn: TransactionRequest, opts?: ITxnOpts): Promise<TransactionResponse>;
}