
import { TransactionRequest, Transaction, ethers } from 'ethers';
import {ATxnPreparer} from '../../interfaces/ATxnPreparer';
import { ITxnLifecycle, ITxnLifecycleJob, ITxnLifecycleListener, ITxnOpts, TxnLifecycleFailure } from '../../interfaces/ITxnLifecycle';
import { ARPCErrorInterceptor, IRPCCallResult, RPCCallStatus } from '../../interfaces/ARPCErrorInterceptor';
import { ASignerFactory } from '../../interfaces/ASignerFactory';
import { ATxnManagerConfig, AWeb3Provider } from '../../interfaces';

export class TxnLifecycleJob implements ITxnLifecycleJob {
    request: TransactionRequest;
    txn?: Transaction | undefined;
    failureStatus?: TxnLifecycleFailure;
    result?: IRPCCallResult<string>;
    lastError?: any;
    signerBalance?: bigint;
    submitted: boolean = false;
    cancelReason?: string;
    constructor(request: TransactionRequest) {
        this.request = request;
    }

    clearStatus(): void {
        this.failureStatus = undefined;
        this.result = undefined;
        this.lastError = undefined;
    }
}

export class TxnLifecycle implements ITxnLifecycle {

    private job?: TxnLifecycleJob;
    private provider?: ethers.JsonRpcProvider;
    tryCount: number = 0;
    metadata: any = {};
    constructor(
        readonly sigFactory: ASignerFactory,
        readonly prep: ATxnPreparer,
        readonly config: ATxnManagerConfig,
        readonly web3: AWeb3Provider,
        readonly rpcIntercept: ARPCErrorInterceptor,
        readonly options: ITxnOpts,
        readonly lifecycleListener?: ITxnLifecycleListener
    ) {
        
    }

    async start(req: TransactionRequest): Promise<ITxnLifecycleJob> {
        this.job = new TxnLifecycleJob(req);
        this.provider = this.web3.getProvider();
        return await this.assignSigner(this.job);
    }

    async cancelTxn(job: ITxnLifecycleJob, reason: string): Promise<ITxnLifecycleJob> {
        if((job as TxnLifecycleJob).submitted) {
            throw new Error("Cannot cancel submitted job");
        }
        job.failureStatus = TxnLifecycleFailure.TxnCancelled;
        job.cancelReason = reason;
        return job;
    }

    getJob(): ITxnLifecycleJob {
        if(!this.job) {
            throw new Error('No job found');
        }
        return this.job;    
    }

    async assignSigner(job: ITxnLifecycleJob): Promise<ITxnLifecycleJob> {
        try {
            job.clearStatus();
            const sig = await this.sigFactory.getSigner(job.request.from?.toString());
            job.signer = sig;

        } catch (e) {
            job.failureStatus = TxnLifecycleFailure.SignerAssignmentFailed;
            job.lastError = e;
        }
        if(this.lifecycleListener) {
            const j = await this.lifecycleListener.onSignerAssigned(this);
            if(j) {
                return j;
            }
        }
        if(!job.failureStatus) {
            return await this.prepareTxn(job);
        }
        return job;
    }

    async prepareTxn(job: ITxnLifecycleJob, cancel?: boolean): Promise<ITxnLifecycleJob> {
        try {
            job.clearStatus();
            job.txn = await (cancel ? this.prep.cancel(job.txn!) : this.prep.prepare(job.request));
        } catch (e) {
            job.failureStatus = TxnLifecycleFailure.TxnPreparationFailed;
            job.lastError = e;
        }
        if(this.lifecycleListener) {
            //listener can recycle the job to another lifecycle stage to retry after 
            //making any external adjustments.
            const j = await this.lifecycleListener.onTxnPrepared(this);
            if(j) {
                //return the version returned by the listener since it was recycled 
                //through another stack of calls
                return j;
            }
        }
        if(!job.failureStatus) {
            return await this.estimateGas(job);
        }
        return job;
    }

    async estimateGas(job: ITxnLifecycleJob): Promise<ITxnLifecycleJob> {
        try {
            job.clearStatus();
            const ctx = await this.rpcIntercept.newContext();
            const res = await ctx.call(async () => {
                return await this.provider!.estimateGas(job.txn!);
            });
            if(res.status !== RPCCallStatus.SUCCESS) {
                job.result = {
                    status: res.status,
                    error: res.error
                };
                job.failureStatus = TxnLifecycleFailure.GasEstimationFailed;
                job.lastError = res.error;
            } else  {
                const estGL = BigInt(res.result!.toString());
                const txnGL = BigInt(job.txn!.gasLimit.toString());
                if(estGL > txnGL) {
                    job.txn!.gasLimit = estGL;
                }
            }
        } catch (e) {
            job.failureStatus = TxnLifecycleFailure.GasEstimationFailed;
            job.lastError = e;
        }

        if(this.lifecycleListener) {
            const j = await this.lifecycleListener.onGasEstimated(this);
            if(j) {
                return j;
            }
        }
        if(!job.failureStatus) {
            return await this.submitTxn(job);
        }
        return job;
    }

    async submitTxn(job: ITxnLifecycleJob): Promise<ITxnLifecycleJob> {
        job.clearStatus();
        const ctx = await this.rpcIntercept.newContext();
        const res = await ctx.call(async () => {
            return await this.provider!.send("eth_sendRawTransaction", [job.txn!.serialized]);
        });
        job.result = res;
        if(res.status !== RPCCallStatus.SUCCESS) {
            job.failureStatus = TxnLifecycleFailure.TxnSubmissionFailed;
            job.lastError = res.error;
        }
        if(this.lifecycleListener) {
            const j = await this.lifecycleListener.onTxnSubmitted(this);
            if(j) {
                return j;
            }
        }
        
        return job;
    }

}