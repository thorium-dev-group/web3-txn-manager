import { AbstractSigner } from "ethers";

export abstract class ASignerFactory {

    abstract getSignerAddresses(): Promise<string[]>;
    abstract getSigner(address?: string): Promise<AbstractSigner>;
}