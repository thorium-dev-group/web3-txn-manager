import { ANonceManager, AWeb3Provider } from "../interfaces";
import { AGasPriceManager } from "../interfaces/AGasPriceManager";
import { ATxnPreparer } from "../interfaces/ATxnPreparer";
import { Transaction, TransactionRequest } from "ethers";
import { Injectable, Logger } from "@nestjs/common";
import { ASignerFactory } from "../interfaces/ASignerFactory";

@Injectable()
export class TxnPreparer extends ATxnPreparer {

    log: Logger = new Logger(TxnPreparer.name);
    chainId?: bigint;
    constructor(
        readonly gasWatcher: AGasPriceManager,
        readonly nonceMgr: ANonceManager,
        readonly signerFactory: ASignerFactory,
        readonly web3Factory: AWeb3Provider,
    ) {
        super();
    }

    async prepare(txn: TransactionRequest): Promise<Transaction> {
        const provider = await this.web3Factory.getProvider();
        const signer = (await this.signerFactory.getSigner(txn.from?.toString())).connect(provider);
        const gp = await this.gasWatcher.getGasPrice(true);
        const nonce = await this.nonceMgr.getNextNonce(await signer.getAddress());
        this.log.debug({
            msg: "Incoming transaction request",
            txn,
            nextNonce: nonce,
        });
        if(!this.chainId) {
            this.chainId = await provider.getNetwork().then(n => n.chainId);
        }

        txn.nonce = nonce;
        txn.gasPrice = gp;
        txn.chainId = this.chainId;
        if(!txn.gasLimit) {
            throw new Error("Transaction must have gas limit set");
        }
        this.log.debug({
            msg: "Preparing transaction", 
            from: await signer.getAddress(),
            nonce: nonce,
        });
        return await Transaction.from(await signer.signTransaction(txn));
    }

    async speedup(txn: Transaction): Promise<Transaction> {
        if(!txn.gasPrice) {
            throw new Error("Cannot speed up transaction with no gas price");
        }
        if(!txn.from) {
            throw new Error("Cannot speed up transaction with no from address");
        }
        const provider = await this.web3Factory.getProvider();
        const signer = (await this.signerFactory.getSigner(txn.from)).connect(provider);
        const tr = await this._adjustGasForRetry(txn);
        return await Transaction.from(await signer.signTransaction(tr));
    }

    async cancel(txn: Transaction): Promise<Transaction> {
        if(!txn.from) {
            throw new Error("Cannot cancel transaction with no from address");
        }
        const tr = await this._adjustGasForRetry(txn);
        tr.data = "0x";
        tr.to = txn.from;
        const provider = await this.web3Factory.getProvider();
        const signer = (await this.signerFactory.getSigner(txn.from)).connect(provider);
        return await Transaction.from(await signer.signTransaction(tr));
    }

    async _adjustGasForRetry(txn: TransactionRequest | Transaction): Promise<TransactionRequest> {
        if(!txn.gasPrice) {
            throw new Error("Cannot adjust gas for retry with no gas price");
        }

        const tr: TransactionRequest = {
            nonce: txn.nonce,
            gasLimit: txn.gasLimit,
            gasPrice: txn.gasPrice,
            chainId: txn.chainId,
            to: txn.to,
            value: txn.value,
            data: txn.data
        };
        const txnGp = BigInt(tr.gasPrice!.toString());
        const gp = await this.gasWatcher.getGasPrice(true);
        const diff = gp - txnGp;
        const tenPercent = (txnGp * BigInt(10))/ BigInt(100);
        if(diff < tenPercent) {
            tr.gasPrice = txnGp + tenPercent;
        } else {
            tr.gasPrice = gp;
        }
        return tr;
    }
}