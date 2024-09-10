import { Injectable, Logger } from "@nestjs/common";
import { ANonceManager, INonceUpdate, NonceListener } from "../interfaces/ANonceManager";
import { Mutex } from "async-mutex";
import { AWeb3Provider } from "../interfaces";

@Injectable()
export class NonceManager extends ANonceManager {

    log: Logger = new Logger(NonceManager.name);
    chainId?: bigint;
    lock: Mutex = new Mutex();
    reuses: Map<string, number[]> = new Map();
    pending: Map<string, number[]> = new Map();
    current: Map<string, number> = new Map();
    listeners: NonceListener[] = [];
    constructor(
        readonly web3Factory: AWeb3Provider,
    ) {
        super();
    }

    async getNextNonce(address: string): Promise<number> {
        const add = address.toLowerCase();
        const rel = await this.lock.acquire();
        let n: number = -1;
        try {

            const reuses = this.reuses.get(add) || [];
            const pending = this.pending.get(add) || [];
            if(reuses.length > 0) {
                n = reuses.shift()!;
            } else if(pending.length > 0) {
                n = Math.max(...pending) + 1;
            } else {
                let c = this.current.get(add) || -1;
                if(c < 0) {
                    const provider = this.web3Factory.getProvider();
                    c = await provider.getTransactionCount(add);
                }
                this.current.set(add, c+1);
                n = c;
            }
            pending.push(n);

        } finally {
            rel();
        }
        return n;
    }


    async rejectNonce(address: string, nonce: number): Promise<void> {
        const rel = await this.lock.acquire();
        const add = address.toLowerCase();
        try {
            let pending = this.pending.get(add) || [];
            let l = pending.length;
            pending = pending.filter(n => n !== nonce);
            if(pending.length === l) {
                //wasn't pending so don't reuse
                return;
            }
            const reuse = this.reuses.get(add) || [];
            reuse.push(nonce);
            this.reuses.set(add, reuse);
            this.pending.set(add, pending);
            await this._notifyListeners({
                address: add,
                nonce,
                updateType: "REJECTED"
            } as INonceUpdate);
        } finally {
            rel();
        }
    }

    async refreshNonce(address: string): Promise<void> {
        this.log.debug({
            msg: "Refreshing nonce for address",
            address
        });
        const p = this.web3Factory.getProvider();
        const c = await p.getTransactionCount(address);
        this.log.debug({
            msg: "Refreshed nonce",
            address,
            nonce: c
        });
        this.current.set(address.toLowerCase(), c);
    }

    registerNonceListener(listener: NonceListener): void {
        this.listeners.push(listener);
    }

    async _notifyListeners(update: INonceUpdate): Promise<void> {
        for (const listener of this.listeners) {
            try {
                await listener(update);
            } catch (e) {
                console.error(`Error notifying nonce listener: ${e}`);
            }
        }
    }

}