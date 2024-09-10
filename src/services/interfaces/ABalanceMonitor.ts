
export abstract class ABalanceMonitor {

    abstract getBalance(address: string): Promise<bigint>;

     abstract adjustPendingAmount(address: string, amount: bigint): Promise<void>;

     abstract updateBalance(address: string): Promise<void>;

}