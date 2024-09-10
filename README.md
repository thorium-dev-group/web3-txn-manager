# Web3 Transaction Manager

If you are building an infrastructure to submit many transactions to an EVM chain concurrently, this utility may be extremely helpful. It handles the transaction lifecycle from preparation to submission with hooks to persist transaction details prior to submitting on-chain.

For the rationale behind it, check out this article: (https://medium.com/@mike_31139/web3-transaction-lifecycle-673a25ba7a91)

This is packaged as a NestJS module for simple injection into a typescript based application. It is intended for use within a backend infrastructure.

## Abstract Class vs Interface

This module makes use of abstract classes as "interfaces" since Typescript erases interface types at runtime. I find it very useful to simply use abstract classes as interfaces and then use the class as a symbol to lookup the implementation of that interface. References to "interface" below are likely referring to an abstract class type that you should extend to implement the required methods.

## Usage

There are a few properties you have to provide to the module when importing into your NestJS app:
* **rpcUrl**: a url for RPC calls to the EVM chain of your choice
* **minWalletBalance**: optional balance threshold that triggers low-balance notifications (see below)
* **signerFactory**: an implementation of the ASignerFactory interface, which has one function to return an instance of an ethers Signer
* **balanceNotificer**: an optional implementation of the ALowBalanceNotifier interface to handle notifications when a signer's balance is below a threshold. Default is a console-based notifier.

Importing the module requires a factory as illustrated here:
```
   const txnMgr = Web3TxnManagerModule.registerAsync({
        useFactory: (config: ConfigService, 
                    mySignerFactory: MySignerFactory, 
                    myNotifier: MyLBNotifier): Promise<IWeb3TxnMgrOptions> => {
            return {
                rpcUrl: config.getOrThrow("web3.rpcUrl"),
                signerFactory: mySignerFactory,
                minWalletBalance: ethers.parseEther("0.5"),
                balanceNotifier: myNotifier
            };
        },
        inject: [ConfigService, MySigner, MyLBNotifier]
   });
```

Once imported into your app, you can inject the transaction manager and use as follows:
```
    constructor(readonly txnMgr: ATxnManager) {}
    ...
    async sendTxn(): Promise<void> {
        const txn = await this.txnMgr.submit({
            to: '0x123...',
            value: ethers.parseEther("0.1")
        });
        const rec = await txn.wait();
        console.log("Receipt", rec);
    }
```

Optionally, you can provide a hook that will be called just before submitting the transaction on-chain. This allows you to persist any details in case your app shuts down for any reason:
```
   constructor(readonly txnMgr, ATxnManager, txnStore: MyTxnStorage) {}
   ...

   async sendTxn(): Promise<void> {
       const hook: ITxnStoreHook = {
           beforeSubmit: async (t: Transaction) => {
               await this.txnStore.persist(t);
           },
           afterSubmit: async (t: Transaction) => {
               await this.txnStore.updateStatus(t, 'SUBMITTED');
           }
       };

       const txn = await this.txnMgr.submit({
            to: '0x1234...',
            value: ethers.parseEther("0.1")
       },{
            hook
       })
   }
```

If you find this useful and want to hire a great team to help scale out your web3 infrastructure, please reach out to mike@thoriumdev.com!



  
