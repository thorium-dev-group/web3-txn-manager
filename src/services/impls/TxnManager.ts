import { Injectable, Logger } from "@nestjs/common";
import { ATxnManager } from "../interfaces/ATxnManager";
import { ethers, TransactionRequest, TransactionResponse } from "ethers";
import { ATxnWatcher } from "../interfaces/ATxnWatcher";
import { ATxnPreparer } from "../interfaces/ATxnPreparer";
import { AGasPriceManager, ANonceManager, ATxnManagerConfig, AWeb3Provider } from "../interfaces";
import { ABalanceMonitor } from "../interfaces/ABalanceMonitor";
import { TxnLifecycle } from "./txn/TxnLifecycle";
import { ITxnLifecycle, ITxnLifecycleJob, ITxnLifecycleListener, ITxnOpts } from "../interfaces/ITxnLifecycle";
import { ASignerFactory } from "../interfaces/ASignerFactory";
import { ARPCErrorInterceptor, RPCCallStatus } from "../interfaces/ARPCErrorInterceptor";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const defaultTxnOpts: ITxnOpts = {
    cancelAfterSeconds: 60,
    resubmitAfterSeconds: 3,
    retries: 20
};

enum BalanceAdjustment {
    ADD,
    SUBTRACT
}

@Injectable()
export class TxnManager extends ATxnManager implements ITxnLifecycleListener {

    minThreshold: bigint = ethers.parseEther("0.1");
    defaultTxnOpts: ITxnOpts = defaultTxnOpts;
    provider?: ethers.Provider;
    chainId?: bigint;
    log: Logger = new Logger(TxnManager.name);
    constructor(
        readonly signerFactory: ASignerFactory,
        readonly gasPriceWatcher: AGasPriceManager,
        readonly watcher: ATxnWatcher,
        readonly preparer: ATxnPreparer,
        readonly nonceMgr: ANonceManager,
        readonly balanceMonitor: ABalanceMonitor,
        readonly web3Factory: AWeb3Provider,
        readonly rpcIntercept: ARPCErrorInterceptor,
        readonly config: ATxnManagerConfig
    ) {
        super();
        const opts = this.config.getTxnManagerOpts() || {};
        this.defaultTxnOpts = {
            ...defaultTxnOpts,
            ...opts
        };
    }

    async submit(tr: TransactionRequest, opts?: ITxnOpts): Promise<TransactionResponse> {
        const lc = new TxnLifecycle(
            this.signerFactory, 
            this.preparer, 
            this.config, 
            this.web3Factory, 
            this.rpcIntercept, 
            {
                ...defaultTxnOpts,
                ...opts
            },
            this
        );

        const job = await lc.start(tr);
        if(job.failureStatus) {
            throw job.lastError!;
        }

        if(!job.result || job.result.status !== RPCCallStatus.SUCCESS) {
            throw new Error("Txn failed to submit");
        }

        this.log.debug({
            msg: "Job submitted to network. Waiting for receipt",
            hash: job.txn!.hash
        });

        if(!this.chainId) {
            const provider = this.web3Factory.getProvider();
            this.chainId = await provider.getNetwork().then(n => n.chainId);
        }
        
        const txn = job.txn!;
        return new TransactionResponse({
            chainId: BigInt(this.chainId),
            data: txn.data,
            from: txn.from!,
            gasLimit: txn.gasLimit,
            gasPrice: txn.gasPrice!,
            hash: txn.hash!,
            nonce: txn.nonce,
            signature: txn.signature!,
            to: txn.to,
            value: txn.value,
            type: txn.type!,
            blockHash: '',
            blockNumber: 0,
            index: -1,
            maxFeePerGas: 0n,
            maxPriorityFeePerGas: 0n,
            accessList: [],
        }, this.provider!);

    }

    async onSignerAssigned(ctx: ITxnLifecycle): Promise<ITxnLifecycleJob | undefined> {
        if(!this.provider) {
            this.provider = this.web3Factory.getProvider();
        }
        const signer = ctx.getJob().signer!;
        const addy = await signer.getAddress();
        const b = await this.balanceMonitor.getBalance(addy);
        if(b < this.minThreshold) {
            return await ctx.cancelTxn(ctx.getJob(), `Insufficient balance for sender: ${ethers.formatEther(b)} eth`);
        }
    }

    async onTxnPrepared(ctx: ITxnLifecycle): Promise<ITxnLifecycleJob | undefined> {
        //when signing the txn, there could be an issue so we need to check that
        const job = ctx.getJob();
        if(job.failureStatus) {
            if(!job.txn) {
                throw job.lastError!;
            }
            
            const max = ctx.options.retries || defaultTxnOpts.retries!;
            if(ctx.tryCount >= max) {
                //need to reuse the nonce and try again if possible
                await this.nonceMgr.rejectNonce(job.txn!.from!, job.txn!.nonce!);
                   
                return await ctx.cancelTxn(job, "Exceeded retry count after attempting to prepare txn");
            }
            await this.nonceMgr.refreshNonce(job.txn!.from!);
            ++ctx.tryCount;
            return await ctx.prepareTxn(job); //try again
        }
    }

    async onGasEstimated(ctx: ITxnLifecycle): Promise<ITxnLifecycleJob | undefined> {
        //called after gas estimate complete. Gas estimate could either fail due to 
        //nonce issue or rpc problem. We'll try a few times if RPC problem and then give up
        const job = ctx.getJob();
        let res = job.result;
        this.log.debug({
            msg: "Gas estimate result",
            gasLimit: job.txn!.gasLimit,
            status: res?.status,
            err: res?.error
        });
        if(res && res.status !== RPCCallStatus.SUCCESS) {            
            switch(res.status) {
                case RPCCallStatus.NONCE_USED: {
                    //force next nonce update
                    this.log.warn({
                        msg: "Nonce already used, refreshing nonce and trying again",
                        wallet: job.txn!.from,
                        nonce: job.txn!.nonce,
                        gasLimit: job.txn!.gasLimit 
                    });
                    await this.nonceMgr.refreshNonce(job.txn!.from!);
                    return await ctx.prepareTxn(job);
                }
                case RPCCallStatus.RPC_ERROR: {
                    //need to reuse the nonce and try again if possible
                    await this.nonceMgr.rejectNonce(job.txn!.from!, job.txn!.nonce!);
                    this.log.error({
                        msg: "RPC error during gas estimation",
                        error: res.error
                    });
                    const max = ctx.options.retries || defaultTxnOpts.retries!;
                    if(ctx.tryCount >= max) {
                        return await ctx.cancelTxn(job, "Exceeded retry count");
                    } else {
                        ++ctx.tryCount;
                        this.log.debug({
                            msg: "Haven't reached max retries on gas estimate yet, trying again",
                            retries: ctx.tryCount,
                            max
                        });
                        await sleep(1000);
                        return await ctx.prepareTxn(job);
                    }
                }
                default: {
                    this.log.error({
                        msg: "Cancelling job due to unknown gas estimate status",
                        status: res.status,
                    });
                    //need to reuse the nonce and try again next time for wallet
                    await this.nonceMgr.rejectNonce(job.txn!.from!, job.txn!.nonce!);
                    return await ctx.cancelTxn(job, res.error ? res.error.message : 'Unknown call status: ' + res.status);
                }
            }
        } else if(res && res.status === RPCCallStatus.SUCCESS) {
            //good to go, capture total cost of txn and adjust available balance
            await this.adjustPendingBalance(job, BalanceAdjustment.ADD);

            //callback to any hook to persist the txn at this point
            if(ctx.options.hook) {
                try {
                    await ctx.options.hook.beforeSubmit(job.txn!);
                } catch (e:any) {
                    this.log.error({
                        msg: "Error during txn hook",
                        error: e
                    });
                    return await ctx.cancelTxn(job, e.message);
                }
            }
            this.log.debug({
                msg: "Gas estimate successful",
                gasLimit: job.txn!.gasLimit,
            });
        } else if(job.failureStatus) {
            this.log.error({
                msg: "Cancelling job due to unknown gas estimate status",
                status: job.failureStatus,  
            });
            //need to reuse the nonce and try again next time for wallet
            await this.nonceMgr.rejectNonce(job.txn!.from!, job.txn!.nonce!);
            return await ctx.cancelTxn(job, job.lastError ? job.lastError.message : 'Unknown failure status: ' + job.failureStatus);
        }
    }

    async onTxnSubmitted(ctx: ITxnLifecycle): Promise<ITxnLifecycleJob | undefined> {
        if(ctx.options.hook) {
            try {
                await ctx.options.hook.afterSubmit(ctx.getJob().txn!);
            } catch (e:any) {
                this.log.error({
                    msg: "Error during post-submit txn hook",
                    error: e
                });
            }
        }
        return;
    }

    async adjustPendingBalance(job: ITxnLifecycleJob, adj: BalanceAdjustment) {
        let totalCost = job.txn!.gasLimit *  job.txn!.gasPrice!;
        if(adj == BalanceAdjustment.SUBTRACT) {
            totalCost = -totalCost;
        }
        await this.balanceMonitor.adjustPendingAmount(job.txn!.from!, totalCost);
    }

    async getWalletAddresses(): Promise<string[]> {
        return this.signerFactory.getSignerAddresses();
    }
}