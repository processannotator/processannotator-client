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
  constructor(onSensorState, onEvent) {
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

    this.reset();
    this.onSensorState = onSensorState;
    this.onEvent = onEvent;
  }

  reset() {
    this.buffer = '';
  }

  straighten() {
    // Re-orient the 3D model so it's facing forward based on the current
    // BNO sensor orientation.
    const currentQuat = new THREE.Quaternion(
      this.state.quatX,
      this.state.quatY,
      this.state.quatZ,
      this.state.quatW
    );
    this.state.offsetQuat = currentQuat.conjugate();
    console.log('Orientation straightened.');
  }

  push(data) {
    // Read BNO055 readings from the BLE UART.
    // Add the received data to the buffer.
    if (data === null) {
      return;
    }

    this.buffer += data;
    // Look for a newline in the buffer that signals a complete reading.
    // TODO: may regex to parse for newline instead of just \n or \r

    const newLine = this.buffer.indexOf('\n');
    // const newLine = /[\t \n \r]/.test(this.buffer);
    if (newLine === -1) {
      // New line not found, stop processing until more data is received.
      return;
    }
    // Found a new line, pull it out of the buffer.
    const line = this.buffer.slice(0, newLine);
    // console.log(line);
    this.buffer = this.buffer.slice(newLine+1);
    if (line === 'buttonDown\r') {
      console.log('physical button pressed');
      this.onEvent('buttonDown');
      return;
    }
    if (line === 'buttonUp\r') {
      console.log('physical button released');
      this.onEvent('buttonUp');
      return;
    }
    // TODO: Investigage here!

    // Now parse the components from the reading.
    const components = line.split(',');
    //console.log(line, components);
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
      offsetQuat: this.state.offsetQuat || quat,
      quat,
      euler,
      quatX: x,
      quatY: y,
      quatZ: z,
      quatW: w,
      roll: euler.x,
      pitch: euler.y,
      heading: euler.z,
      calSys: sys,
      calAccel: accel,
      calGyro: gyro,
      calMag: mag
    };
    // console.log('State:', this.state);

    this.onSensorState(this.state);
  }
}
