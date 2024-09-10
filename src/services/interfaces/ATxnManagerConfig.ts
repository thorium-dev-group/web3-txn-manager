import { ALowBalanceNotifier } from "./ALowBalanceNotifier";
import { ASignerFactory } from "./ASignerFactory";
import { ITxnOpts } from "./ITxnLifecycle";

export abstract class ATxnManagerConfig {
    abstract getRpcUrl(): string;

    abstract getMinWalletBalance(): bigint;

    abstract getTxnManagerOpts(): ITxnOpts | undefined;

    abstract getSignerFactory(): ASignerFactory;

    abstract getBalanceNotifier(): ALowBalanceNotifier | undefined;
}