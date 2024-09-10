
export abstract class AGasPriceManager {
    abstract getGasPrice(forceLookup?: boolean): Promise<bigint>;
    abstract setGasPrice(gasPrice: bigint): Promise<void>;

    //get a gas price that will allow cancellation of existing transaction but take
    //into account the current gas price
    abstract getCancellableGasPrice(current: bigint): bigint;
}