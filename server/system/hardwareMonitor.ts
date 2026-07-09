import si from "systeminformation";

export interface HardwareMetrics {
  cpu: {
    loadPercent: number;
    tempCelsius: number | null;
    cores: number;
    brand: string;
  };
  ram: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
  };
  disk: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
  };
  battery: {
    hasBattery: boolean;
    percent: number | null;
    isCharging: boolean | null;
  };
  /** 4.3. pont: ha igaz, az ütemezett feladatokat le kell lassítani */
  shouldThrottleBackground: boolean;
  collectedAt: string;
}

const CPU_TEMP_THROTTLE_THRESHOLD = 80;   // °C
const BATTERY_LOW_THRESHOLD = 20;          // %

export async function collectHardwareMetrics(): Promise<HardwareMetrics> {
  const [load, temp, mem, diskLayout, battery] = await Promise.all([
    si.currentLoad(),
    si.cpuTemperature(),
    si.mem(),
    si.fsSize(),
    si.battery(),
  ]);

  const cpuInfo = await si.cpu();
  const tempCelsius = temp.main ?? null;
  const batteryPercent = battery.hasBattery ? (battery.percent ?? null) : null;

  const primaryDisk = diskLayout.find((d) => d.mount === "/") ?? diskLayout[0];

  const shouldThrottleBackground =
    (tempCelsius !== null && tempCelsius >= CPU_TEMP_THROTTLE_THRESHOLD) ||
    (battery.hasBattery && batteryPercent !== null && batteryPercent < BATTERY_LOW_THRESHOLD && battery.isCharging === false);

  return {
    cpu: {
      loadPercent: Math.round(load.currentLoad),
      tempCelsius,
      cores: cpuInfo.cores,
      brand: cpuInfo.brand,
    },
    ram: {
      totalMb: Math.round(mem.total / 1_048_576),
      usedMb: Math.round(mem.used / 1_048_576),
      freeMb: Math.round(mem.available / 1_048_576),
    },
    disk: primaryDisk
      ? {
          totalGb: Math.round(primaryDisk.size / 1_073_741_824),
          usedGb: Math.round(primaryDisk.used / 1_073_741_824),
          freeGb: Math.round((primaryDisk.size - primaryDisk.used) / 1_073_741_824),
        }
      : { totalGb: 0, usedGb: 0, freeGb: 0 },
    battery: {
      hasBattery: battery.hasBattery,
      percent: batteryPercent,
      isCharging: battery.hasBattery ? (battery.isCharging ?? null) : null,
    },
    shouldThrottleBackground,
    collectedAt: new Date().toISOString(),
  };
}
