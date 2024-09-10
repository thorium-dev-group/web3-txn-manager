import { Injectable, Logger } from "@nestjs/common";
import { Mutex } from "async-mutex";
import { ABalanceMonitor } from "../interfaces/ABalanceMonitor";
import { ethers } from "ethers";
import { ALowBalanceNotifier, ATxnManagerConfig, AWeb3Provider } from "../interfaces";
import { ASignerFactory } from "../interfaces/ASignerFactory";

@Injectable()
export class BalanceMonitor extends ABalanceMonitor {

    //.1 eth
    minThreshold: bigint = ethers.parseEther("0.1");
    balance: bigint = -1n;
    pendingBalances: Map<string, bigint> = new Map();
    lock: Mutex = new Mutex();
    log: Logger = new Logger(BalanceMonitor.name);
    constructor(
        readonly web3Provider: AWeb3Provider,
        readonly signerFactory: ASignerFactory,
        readonly notifier: ALowBalanceNotifier,
        readonly config: ATxnManagerConfig
    ) {
        super();
        
        const walletNotificationBalance = this.config.getMinWalletBalance();
        
        if(walletNotificationBalance) {
            this.minThreshold = BigInt(walletNotificationBalance);
        }
    
    }

    async getBalance(address: string): Promise<bigint> {
        const add = address.toLowerCase();
        const rel = await this.lock.acquire();
        try {
            if(this.balance < 0) {
                const p = this.web3Provider.getProvider();
                this.balance = await p.getBalance(add);
            }
            let b = this.balance - (this.pendingBalances.get(add) || 0n);
            if(b < this.minThreshold) {
                await this.notifier.notify(add, b);
            }
            return b;
        } finally {
            rel();
        }
    }

    async adjustPendingAmount(address: string, amount: bigint): Promise<void> {
        const rel = await this.lock.acquire();
        const add = address.toLowerCase();
        try {
            let b:bigint = this.pendingBalances.get(add) || 0n;
            b += amount;
            if(b < 0) {
                //because amount can be negative, we need to ensure we don't go below 0
                b = 0n;
            }

            this.pendingBalances.set(add, b);
        } finally {
            rel();
        }
    }

    async updateBalance(address: string): Promise<void> {
        const add = address.toLowerCase();
        const rel = await this.lock.acquire();
        try {
            this.log.debug({
                msg: "Updating wallet balance...",
                address: add
            });
            const p = this.web3Provider.getProvider();
            const b = await p.getBalance(add);
            this.log.debug({
                msg: "Got wallet balance",
                address: add,
                balance: b
            });
            this.balance = BigInt(b.toString());
            if(this.balance < this.minThreshold) {
                await this.notifier.notify(add, this.balance);
            }
        } catch (e) {
            this.log.error({
                msg: "Could not get wallet balance",
                err: e
            });
            throw e;
        } finally {
            rel();
        }
    }
    
}
