import * as util from "util";
import * as noble from "noble";
export class LaunchBluetooth {
  private serviceUUID = "88f80580000001e6aace0002a5d5c51b";
  private charUUIDs = { cmd: "88f80583000001e6aace0002a5d5c51b",
                        // sensor: "88f80582-0000-01e6-aace-0002a5d5c51b",
                        data: "88f80581000001e6aace0002a5d5c51b" };
  private device: noble.Peripheral;
  private service: noble.Service;
  private cmdChar: noble.Characteristic;
  private dataChar: noble.Characteristic;

  public async findLaunch() {
    let res;
    let rej;
    const startup = new Promise<{}>((aRes, aRej) => { res = aRes; rej = aRej; });
    noble.on("stateChange", function(state) {
      if (state === "poweredOn") {
        noble.startScanning();
        res();
      } else {
        noble.stopScanning();
        rej();
      }
    });
    await startup;
    const launchFinder = new Promise<noble.Peripheral>((aRes, aRej) => { res = aRes; rej = aRej; });
    noble.on("discover", (d: noble.Peripheral) => {
      if (d.advertisement.localName === "Launch") {
        res(d);
      }
    });
    this.device = await launchFinder;
    const connectAsync = util.promisify(this.device.connect.bind(this.device));
    const discoverServicesAsync = util.promisify(this.device.discoverServices.bind(this.device));
    await connectAsync();
    this.service = (await discoverServicesAsync([this.serviceUUID]))[0];

    const discoverCharsAsync = util.promisify(this.service.discoverCharacteristics.bind(this.service));
    this.cmdChar = (await discoverCharsAsync([this.charUUIDs.cmd]))[0];
    this.dataChar = (await discoverCharsAsync([this.charUUIDs.data]))[0];
  }

  public async readCmd(): Promise<Buffer> {
    return await util.promisify(this.cmdChar.read.bind(this.cmdChar))();
  }

  public async writeCmd(aData: Buffer) {
    return await util.promisify(this.cmdChar.write.bind(this.cmdChar))(aData, false);
  }

  public async readData(): Promise<Buffer> {
    return await util.promisify(this.dataChar.read.bind(this.dataChar))();
  }

  public async writeData(aData: Buffer) {
    return await util.promisify(this.dataChar.write.bind(this.dataChar))(aData, false);
  }

  public async CommandWithResponse(aCommand: number, aData: number = 0x00): Promise<Buffer> {
    const cmd = Buffer.from([aCommand]);
    await this.writeCmd(cmd);
    await this.writeData(Buffer.from([aData]));
    const cmdRet = await this.readCmd();
    const dataRet = await this.readData();
    return dataRet;
  }

  // Seems to be used after firmware loading to set machine back to app mode?
  public async LockAppMode() {
    await this.writeCmd(Buffer.from([0x0D]));
    await this.writeData(Buffer.from([0x4F, 0x4B]));
  }

  public async GetVersion() {
    return await this.CommandWithResponse(0x05);
  }

  public async GetExecutionMode() {
    return await this.CommandWithResponse(0x03);
  }

  public async GetFlashInfo() {
    const flashInfo = await this.CommandWithResponse(0x0A);
    let i = 0;
    const is24BitAddressed: boolean = flashInfo.length === 9;
    const writeBlockCommandSize = is24BitAddressed ? 3 : 2;
    const flashEraseValue = is24BitAddressed ? flashInfo.readUInt8(i) : 0xFF;
    if (is24BitAddressed) {
      i += 1;
    }
    const addressIncrement = (flashInfo.readUInt8(i) & 0xF0) >> 4;
    const wordSize = flashInfo.readUInt8(i) & 0x0F;
    i += 1;
    const programLength = flashInfo.readUInt16BE(i);
    i += 2;
    const programBase = is24BitAddressed ?
      // Ugh no 24-bit reads in node's buffer class.
      flashInfo.readUInt8(i) | (flashInfo.readUInt16BE(i + 1) << 8) :
      flashInfo.readUInt16BE(i);
    i += is24BitAddressed ? 3 : 2;
    const rowSize = flashInfo.readUInt16BE(i);
    return {
      writeBlockCommandSize,
      flashEraseValue,
      programLength,
      wordSize,
      addressIncrement,
      programBase,
      rowSize,
    };
  }

  public async Initialize() {
    await this.readCmd();
    await this.writeCmd(Buffer.from([0]));
  }
}
