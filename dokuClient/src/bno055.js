// Based on code from Adafruit Bluefruit LE Desktop, released under the following license:
//
// The MIT License (MIT)
//
// Copyright (c) 2015 Adafruit Industries
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.


// Useful conversion functions.
function degToRad(deg) {
  // Convert degrees to radians.
  return deg * Math.PI / 180.0;
}

function radToDeg(radians) {
  // Convert radians to degrees.
  return radians * 180.0 / Math.PI;
}

export default class BNO055 {
  constructor(callback) {
    // Set initial state.
    this.state = {
      quatX: 0,
      quatY: 0,
      quatZ: 0,
      quatW: 0,
      roll: 0,
      pitch: 0,
      heading: 0,
      calSys: 0,
      calAccel: 0,
      calGyro: 0,
      calMag: 0
    };

    this.buffer = '';
    this.callback = callback;
  }

  straighten() {
    // Re-orient the 3D model so it's facing forward based on the current
    // BNO sensor orientation.
    const currentQuat = new THREE.Quaternion(this.state.bnoData.quatX,
      this.state.bnoData.quatY, this.state.bnoData.quatZ, this.state.bnoData.quatW);
    this.offset.quaternion.copy(currentQuat.conjugate());
  }

  push(data) {
    // Read BNO055 readings from the BLE UART.
    // Add the received data to the buffer.
    if (data === null) {
      return;
    }
    this.buffer += data;
    // Look for a newline in the buffer that signals a complete reading.
    const newLine = this.buffer.indexOf('\n');
    if (newLine === -1) {
      // New line not found, stop processing until more data is received.
      return;
    }
    // Found a new line, pull it out of the buffer.
    const line = this.buffer.slice(0, newLine);
    this.buffer = this.buffer.slice(newLine+1);
    console.log('Got:', line);
    // Now parse the components from the reading.
    const components = line.split(',');
    if (components.length !== 5) {
      // Didn't get 5 components, something is wrong.
      return;
    }
    const w = Number(components[0]);
    const y = Number(components[1]);
    const x = Number(components[2]);
    const z = Number(components[3]);
    if (components[4].length < 4) {
      // Couldn't parse the calibration status, something is wrong.
      return;
    }
    const sys = Number(components[4][0]);
    const gyro = Number(components[4][1]);
    const accel = Number(components[4][2]);
    const mag = Number(components[4][3]);
    // Now convert quaternion orientation to euler angles to get roll, pitch, heading.
    // This is only used in the display of the orientation.  The actual model rotation
    // uses quaternions.
    const quat = new THREE.Quaternion(x, y, z, w);
    const euler = new THREE.Euler();
    euler.setFromQuaternion(quat);

    // Update the BNO sensor state.
    this.state = {
      quat,
      euler,
      quatX: x,
      quatY: y,
      quatZ: z,
      quatW: w,
      roll: radToDeg(euler.x),
      pitch: radToDeg(euler.y),
      heading: radToDeg(euler.z),
      calSys: sys,
      calAccel: accel,
      calGyro: gyro,
      calMag: mag
    };

    this.callback(this.state);
  }
}
