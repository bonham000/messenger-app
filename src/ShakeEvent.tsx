import { Accelerometer } from "expo";
// import React from "react";

const THRESHOLD = 800;

export class ShakeEventExpo {
  static addListener(handler: any) {
    let xPosition: number;
    let yPosition: number;
    let zPosition: number;
    let lastUpdate = 0;

    Accelerometer.addListener(accelerometerData => {
      const { x, y, z } = accelerometerData;
      const currTime = Date.now();
      if (currTime - lastUpdate > 100) {
        const diffTime = currTime - lastUpdate;
        lastUpdate = currTime;

        const speed =
          (Math.abs(x + y + z - xPosition - yPosition - zPosition) / diffTime) *
          10000;

        if (speed > THRESHOLD) {
          handler();
        }
        xPosition = x;
        yPosition = y;
        zPosition = z;
      }
    });
  }

  static removeListener() {
    Accelerometer.removeAllListeners();
  }
}
