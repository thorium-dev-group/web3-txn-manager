import { DynamicModule, Global, Inject, Module, Provider, Type } from "@nestjs/common";
import { ITxnOpts } from "./services/interfaces/ITxnLifecycle";
import { ASignerFactory } from "./services/interfaces/ASignerFactory";
import { ABalanceMonitor, AGasPriceManager, ALowBalanceNotifier, ANonceManager, ARPCErrorInterceptor, ATxnManager, ATxnManagerConfig, ATxnPreparer, ATxnWatcher, AWeb3Provider } from "./services/interfaces";
import { BalanceMonitor, ConsoleLowBalanceNotifier, GasPriceManager, MonitorLoop, NonceManager, TxnManager, TxnManagerConfig, TxnPreparer, TxnWatcher, Web3Provider } from "./services/impls";
import { RPCErrorInterceptor } from "./services/impls/txn/RPCErrorInterceptor";
import { WEB3_MGR_CONFIG } from "./services/symbols";

export interface IWeb3TxnMgrOptions {
    rpcUrl: string;
    minWalletBalance?: bigint;
    txnOpts?: ITxnOpts;
    signerFactory: ASignerFactory;
    balanceNotifier?:ALowBalanceNotifier;
}

export interface IWeb3TxnManagerModuleAsyncOptions {
    inject?: any[];
    useFactory: (...args: any[]) => Promise<IWeb3TxnMgrOptions>;
}

const web3OptsProvider = (opts: IWeb3TxnManagerModuleAsyncOptions): Provider[] => {
    return [
        {
            provide: ATxnManagerConfig,
            useFactory: async (...args: any[]) => {
                return new TxnManagerConfig(await opts.useFactory(...args));
            },
            inject: opts.inject || []
        },
        {
            provide: ASignerFactory,
            useFactory: async (...args: any[]) => {
                const cfg = await opts.useFactory(...args);
                return cfg.signerFactory
            },
            inject: opts.inject || []
        },
        {
            provide: ALowBalanceNotifier,
            useFactory: async (...args: any[]) => {
                const cfg = await opts.useFactory(...args);
                return cfg.balanceNotifier || ConsoleLowBalanceNotifier;
            },
            inject: opts.inject || []
        }
    ]
}

@Global()
@Module({})
export class Web3TxnManagerModule {

    static async registerAsync(opts: IWeb3TxnManagerModuleAsyncOptions): Promise<DynamicModule> {

        const exports = [
            
            {
                provide: ATxnManager,
                useClass: TxnManager
            },
            
        ];

        const providers = [
            ...web3OptsProvider(opts),
            ...exports,
            MonitorLoop,
            {
                provide: ABalanceMonitor,
                useClass: BalanceMonitor
            },
            {
                provide: AGasPriceManager,
                useClass: GasPriceManager
            },
            
            {
                provide: ANonceManager,
                useClass: NonceManager
            },
            {
                provide: ARPCErrorInterceptor,
                useClass: RPCErrorInterceptor
            },
            
            {
                provide: ATxnPreparer,
                useClass: TxnPreparer
            },
            {
                provide: ATxnWatcher,
                useClass: TxnWatcher
            },
            {
                provide: AWeb3Provider,
                useClass: Web3Provider
            }
        ];

        return {
            module: Web3TxnManagerModule,
            providers,
            exports,
            global: true
        }
    }
}