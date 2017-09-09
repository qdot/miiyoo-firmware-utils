import { LaunchBluetooth } from "./bluetooth";

const firmwareTest = async () => {
  console.log("Finding Launch");
  const d = new LaunchBluetooth();
  await d.findLaunch();
  console.log("Found Launch");
};

firmwareTest();
