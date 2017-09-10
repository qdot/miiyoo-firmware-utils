import { LaunchBluetooth } from "./bluetooth";
import { hexToArrays } from "nrf-intel-hex";
import * as util from "util";
import * as fs from "fs";
const readFileAsync = util.promisify(fs.readFile);

// cheap trick to get us from [[a, b], [c], [d, e]] to [a, b, c, d, e]
function flatten(aValue: any) {
  return [].concat.apply([], aValue);
}

// { writeBlockCommandSize: 2,
//   flashEraseValue: 255,
//   programLength: 240,
//   wordSize: 3,
//   addressIncrement: 2,
//   programBase: 8,
//   rowSize: 128 }

const firmwareFileTest = async () => {
  const aFlashInfo = { writeBlockCommandSize: 2,
                       flashEraseValue: 255,
                       programRowLength: 240,
                       bytesPerAddress: 3,
                       addressIncrementSize: 2,
                       programStartRow: 8,
                       addressesPerRow: 128 };
  const hexFile = await readFileAsync("./Launch_V1.3.hex", {encoding: "ascii"});
  const hexArrays: Map<number, Uint8Array> = hexToArrays(hexFile);

  // Map of row number to commands with data to fill the row with.
  const dataCommands: Map<number, number[][]> = new Map<number, number[][]>();
  let currentRow = aFlashInfo.programStartRow;

  // Figure out where the program starts
  const startingAddress = aFlashInfo.programStartRow * aFlashInfo.addressesPerRow * aFlashInfo.addressIncrementSize;
  const programAddressLength = aFlashInfo.programRowLength * aFlashInfo.addressesPerRow;

  const keyIter = hexArrays.keys();
  const eraseCommand = Array(3).fill(aFlashInfo.flashEraseValue);
  let keyValue = keyIter.next();
  // Figure out what the closest block is
  while (keyValue.value < startingAddress) {
    keyValue = keyIter.next();
  }

  while (!keyValue.done) {
    const currentBlock = Array.from(hexArrays.get(keyValue.value)!);
    let commandArray: number[][] = [];
    // Since our block from the hex file may start after the row start, fill
    // with the erase value as needed until we hit the start point. Addresses
    // are multiplied by 2, then also related to the increment value, so adjust
    // accordingly.
    const fillValue = (keyValue.value - startingAddress) / aFlashInfo.addressIncrementSize / 2;
    commandArray = commandArray.concat(Array(fillValue).fill(eraseCommand));

    // Next, we'll turn our big block of binary into an array of 3 byte
    // commands. Due to the intel hex packer assuming 32-bit addresses (and the
    // pic24 architecture is crazy pants), every 4th byte is a zero, which we'll
    // need to remove, so we splice, then pop.
    while (currentBlock.length) {
      commandArray.push(currentBlock.splice(0, 3));
      if (currentBlock.shift() !== 0x00) {
        throw new Error("Trying to trim a non-zero value from hex data!");
      }
    }

    const commandLimit = (aFlashInfo.addressesPerRow / 2);

    // Magic number! We're limited by the size of the data GATT characteristic,
    // so we can only send over a certain number of commands per write. This
    // number is 6. Ends up being 19 bytes per line, 6 3-byte commands plus
    // the line counter.
    const commandsPerRowCommand = 6;
    while (commandArray.length > 0) {
      // The low nibble of the first byte of every data loading command is an
      // offset value. We increase it on every command array.
      let lineCounter: number = 0;
      // The high nibble of the first byte of every data loading command is
      // either 0x0 or 0x8. Toggle accordingly.
      let toggle: 0x0 | 0x80 = 0x0;
      let commandsRead = 0;
      const rowCommands: number[][] = [];

      while (commandsRead < commandLimit) {
        let dataCommand: number[] = [];
        if (commandsRead + commandsPerRowCommand < commandLimit) {
          dataCommand = flatten(commandArray.splice(0, commandsPerRowCommand));
          commandsRead += commandsPerRowCommand;
        } else {
          // If we've hit the row end, fill as much as we can then append null commands.
          dataCommand = flatten(commandArray.splice(0, commandLimit - commandsRead));
          // Paste some null commands on to the end to fill things out.
          dataCommand = dataCommand.concat(
            flatten(Array(commandsPerRowCommand - (commandLimit - commandsRead)).fill(eraseCommand)));
          commandsRead = commandLimit;
        }

        // If we have any value that doesn't equal the flash erase value, finish
        // adding the command to our output.
        if (dataCommand.some((x) => x !== aFlashInfo.flashEraseValue)) {
          // Attach the counter to the front of the line
          dataCommand.unshift(toggle | lineCounter);
          // Save it to our command array
          rowCommands.push(dataCommand);
          // Switch the toggle only if we're writing.
          toggle ^= 0x80;
        }
        // Always increment our line counter, as it serves as the write offset
        // into our current row.
        lineCounter += 1;
      }
      currentRow += 1;
    }
    keyValue = keyIter.next();
  }
};

const firmwareTest = async () => {
  console.log("Finding Launch");
  const d = new LaunchBluetooth();
  await d.findLaunch();
  console.log("Found Launch");
  await d.Initialize();
  await d.GetExecutionMode();
  await d.GetVersion();
  console.log(await d.GetFlashInfo());
};

//firmwareTest();
firmwareFileTest().then(() => { process.exit(0); }).catch((e) => { console.log(e); process.exit(0); });
