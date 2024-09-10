import { Transaction, TransactionRequest } from "ethers";

export abstract class ATxnPreparer {
    abstract prepare(txn: TransactionRequest): Promise<Transaction>;
    abstract speedup(txn: Transaction): Promise<Transaction>;
    abstract cancel(txn: Transaction): Promise<Transaction>;
}