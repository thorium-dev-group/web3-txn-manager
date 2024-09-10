import { Injectable, Logger} from "@nestjs/common";
import { AGasPriceManager } from "../interfaces/AGasPriceManager";
import { Mutex } from "async-mutex";
import { AWeb3Provider } from "../interfaces";

@Injectable()
export class GasPriceManager extends AGasPriceManager {

    current: bigint = 0n;
    log: Logger = new Logger(GasPriceManager.name);
    lock: Mutex = new Mutex();
    constructor(
        readonly web3Factory: AWeb3Provider
    ) {
        super();
    }

    async getGasPrice(forceLookup?: boolean): Promise<bigint> {
        const rel = await this.lock.acquire();
        try {
            if(forceLookup || this.current === 0n) {
                const provider = this.web3Factory.getProvider();
                const gp = (await provider.getFeeData()).gasPrice;
                if(!gp) {
                    this.log.error({
                        msg: "Could not get current gas price"
                    });
                    throw new Error("Could not get current gas price");
                }
                this.current = gp;
            }
            return this.current;
        } finally {
            rel();
        }
    }

    async setGasPrice(gasPrice: bigint): Promise<void> {
        const rel = await this.lock.acquire();
        try {
            this.current = gasPrice;
        } finally {
            rel();
        }
    }

    getCancellableGasPrice(current: bigint): bigint {
        const tenPercentMore = current * 110n / 100n;
        return tenPercentMore > current ? tenPercentMore : current;
    }

}