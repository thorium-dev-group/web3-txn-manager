
export abstract class ALowBalanceNotifier {

    abstract notify(address: string, balance: bigint): Promise<void>;

}