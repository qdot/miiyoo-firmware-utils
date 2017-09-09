import { LaunchBluetooth } from "./bluetooth";

const firmwareTest = async () => {
  console.log("Finding Launch");
  const d = new LaunchBluetooth();
  await d.findLaunch();
  console.log("Found Launch");
  await d.Initialize();
  await d.GetExecutionMode();
  await d.GetVersion();
};

firmwareTest();
