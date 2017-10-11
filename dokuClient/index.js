'use strict'; /*eslint global-strict:0*/

const electron = require('electron');
const noble = require('noble');
const fs = require('fs');
const dialog = electron.dialog;
const app = electron.app; // Module to control application life.
const ipc = electron.ipcMain; // module for interprocess communication (renderer <-> backend)
const BrowserWindow = electron.BrowserWindow; // Module to create native browser window.
const os = require('os');

// automatically reload the renderer app when the bundle changes
// IMPORTANT: Uncomment before running `npm run package`
// require('electron-reload')(__dirname + '/src/main-app.bundle.js');


app.commandLine.appendSwitch('enable-file-cookies');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is GCed.
let mainWindow = null;

let devices = [];             // List of known devices.

const knownDeviceNames = [
  // 'DokuPen',
  'Adafruit Bluefruit LE',
  'Project Annotator Pen',
  'Project Annotator Asset',
  // 'Adafruit Bluefruit LE 5DE4',
];

let deviceNamesToDeviceInfo = {
  // 'Project Annotator Pen': { // <-- example content
  //   device: { ... }, // reference to the noble device object
  //   macAddress: "...", // used for reconnection
  //   connectStatus: "...",
  //   uartTx: { ... },
  //   uartRx: { ... },
  // }
};

let selectedIndex = null;     // Currently selected/connected device index.
let selectedDevice = null;    // Currently selected device.
let selectedAddress = null;   // MAC address or unique ID of the currently selected device.
                              // Used when reconnecting to find the device again.
let uartRx = null;            // Connected device UART RX char.
let uartTx = null;            // Connected device UART TX char.
let connectStatus = null;
let btConnectionTimeout;

function runningAsRoot() {
  // Check if the user is running as root on a POSIX platform (Linux/OSX).
  // Returns true if it can be determined the user is running as root, otherwise
  // false.
  if (os.platform() === 'linux' || os.platform() === 'darwin') {
    return process.getuid() === 0;
  }
  else {
    return false;
  }
}

function findUARTCharacteristics(deviceName, services) {
  // Find the UART RX and TX characteristics and save them in global state.
  services.forEach(function(s, serviceId) {
    s.characteristics.forEach(function(characteristics, charId) {
      if (characteristics.uuid === '6e400002b5a3f393e0a9e50e24dcca9e') {
        deviceNamesToDeviceInfo[deviceName].uartTx = characteristics;
				console.log('Found TX characteristic');
      }
      else if (characteristics.uuid === '6e400003b5a3f393e0a9e50e24dcca9e') {
        deviceNamesToDeviceInfo[deviceName].uartRx = characteristics;
				console.log('Found RX characteristic');
        characteristics.removeAllListeners('data');
        characteristics.on('data', function(data) {
          if (mainWindow !== null) {
            // console.log(String(data));
            mainWindow.webContents.send('uartRx', deviceName, String(data));
          }
        });
        characteristics.notify(true);
      }
    });
  });
}

function setConnectStatus(deviceName, status, percent) {
  if (deviceName) {
    if (!deviceNamesToDeviceInfo[deviceName]) {
      deviceNamesToDeviceInfo[deviceName] = {};
    }
    deviceNamesToDeviceInfo[deviceName].status = status;
  }
  console.log('Connection status', deviceName, status);
  if (mainWindow) {
    mainWindow.webContents.send('connectStatus', deviceName, status, percent !== undefined ? percent : 0);
  }
}

function disconnectDeviceWithName(deviceName) {
  const deviceInfo = deviceNamesToDeviceInfo[deviceName];
  if (!deviceInfo) {
    return;
  }

  console.log('Disconnecting device', deviceInfo);
  if (deviceInfo.device) {
    deviceInfo.device.disconnect();
  }

  Object.keys(deviceInfo).forEach(function (property) {
    delete deviceInfo[property];
  });

  // Connected, now kick off service discovery.
  setConnectStatus('discovering services', 66);
  if(!selectedDevice) return;
  selectedDevice.discoverAllServicesAndCharacteristics(function(error_, services, characteristics) {
    // Handle if there was an error.
    if (error_) {
      console.log('Error discovering: ' + error_);
      setConnectStatus('error');
      return;
    }
    // Setup the UART characteristics.
    findUARTCharacteristics(services);
    // Service discovery complete, connection is ready to use!
    // Note that setting progress to 100 will cause the page to change to
    // the information page.
    clearTimeout(btConnectionTimeout);
    setConnectStatus('connected', 100);
  });
  delete deviceNamesToDeviceInfo[deviceName];
}

function disconnectAllDevices() {
  knownDeviceNames.forEach(function (name) {
    disconnectDeviceWithName(name);
  });
}

function onDeviceDiscovered(device) {
  // Noble found a device.  Add it to the list of known devices and then send
  // an event to notify the renderer process of the current device state.
  devices.push(device);
  console.log('Found device:', device.address, device.advertisement.localName);

  const deviceName = device.advertisement.localName;
  if (knownDeviceNames.indexOf(deviceName) === -1) {
    return; // Unknown device
  }

  if (deviceNamesToDeviceInfo[deviceName]) {
    console.log('Device:', deviceName, ' is known, but already connected');
    return; // Device is known, but already connected
  }

  console.log('Found device ' + deviceName + ', (re-)connecting...');

  device.connect(function(error) {
    if (error) {
      console.log('Error connecting: ' + error);
      setConnectStatus(deviceName, 'error');
      return;
    }
    deviceNamesToDeviceInfo[deviceName] = {
      device
    };
    device.removeAllListeners('disconnect');
    device.on('disconnect', function() {
      console.log('Reconnecting to device with address: ' + device);
      setConnectStatus(deviceName, 'reconnecting');
      disconnectDeviceWithName(deviceName);
      noble.startScanning();
    });
    setConnectStatus(deviceName, 'setup', 66);
    device.discoverAllServicesAndCharacteristics(function(error_, services, characteristics) {
      if (error_) {
        console.log('Error discovering services: ' + error_);
        setConnectStatus(deviceName, 'error');
        return;
      }
      findUARTCharacteristics(deviceName, services);
      setConnectStatus(deviceName, 'connected', 100);
    });
  });


  if (Object.keys(deviceNamesToDeviceInfo).length === knownDeviceNames.length) {
    console.log('Everything connected:', deviceNamesToDeviceInfo);
    noble.stopScanning(); // All devices found
  }
}

function setupNoble() {
  // ipc.on sets up an event handler so the renderer process (the webpage's
  // javascript) can 'call' functions in this main process.  These events are
  // defined below:
  ipc.on('startScan', function() {
    // Start scanning for new BLE devices.
    // First clear out any known and selected devices.
    devices = [];
    disconnectAllDevices();
    // Start scanning only if already powered up.
    if (noble.state === 'poweredOn') {
      console.log('Starting scan... ');
      setConnectStatus('connecting', 0);
      // btConnectionTimeout = setTimeout(() => {
      //   setConnectStatus('Error');
      //   dialog.showErrorBox('DokuClient', 'TIMEOUT: Unfortunately process.annotator was not able to connect the pen. Is it turned on and powered?');
      //   console.log('Scan timeout.');
      //   disconnectAllDevices();
      // }, 10000);
      noble.startScanning();

    } else {
      // Let the user know the bluetooth module state
      setConnectStatus(null, 'Bluetooth ' + noble.state);
      dialog.showErrorBox('DokuClient', 'WARNING: Unfortunately process.annotator is not able to connect the pen. Have you activated bluetooth on your computer?');
			console.log('Bluetooth adapter not powered on. Can\'t start scan.');
		}
  });

  ipc.on('disconnectPen', function() {
    disconnectAllDevices();
  });

  ipc.on('stopScan', function() {
    // Stop scanning for devices.
    console.log('Stopping scan...');
    noble.stopScanning();
  });

  ipc.on('uartTx', function(event, deviceName, data) {
    // Data is sent from the renderer process out the BLE UART (if connected).
    const uartTx = deviceNamesToDeviceInfo[deviceName].uartTx;
    if (uartTx) {
      console.log('Send to device', deviceName, ':', data);
      uartTx.write(new Buffer(data));
    }
  });

  noble.on('discover', onDeviceDiscovered);
}

app.on('ready', function() {
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.

	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800
	});

	let webContents = mainWindow.webContents;

	mainWindow.setAutoHideMenuBar(true);

	// load the index.html of the app.
	mainWindow.loadURL('file://' + __dirname + '/index.html');
	var session = mainWindow.webContents.session;

  ipc.on('quit', app.quit);

  ipc.on('getConfig', function (event, arg) {
    // read config file and send to back to render process
    var config = JSON.parse(fs.readFileSync('process-annotator.config.json', 'utf8'));
    event.returnValue = config;
  });

	ipc.on('resetLocalDB', function() {

			session.clearStorageData({
				storages: ['cookies', 'indexdb', 'local storage', 'serviceworkers']
			}, () => { console.log('session cleared'); });
			mainWindow.webContents.session.clearCache(function(){
				console.log('session cleared');
				dialog.showMessageBox({type: 'info', buttons: [], message: 'Reset succesfull. The application will quit now. Please start manually afterwards.'}, () => {
					app.quit();
				});
			});
	});



  // Check running as root on Linux (usually required for noble).
  if (os.platform() === 'linux' && !runningAsRoot()) {
    // Throw an error dialog when not running as root.
    dialog.showErrorBox('DokuClient', 'WARNING: This program should be run as a root user with sudo! This is necessary to open Bluetooth connections.');
  }

	setupNoble();

  // mainWindow.openDevTools();

  // Open dev tools if --dev parameter is passed in.
  if (process.argv.indexOf('--dev') !== -1) {
    mainWindow.openDevTools();
  }

  mainWindow.on('closed', function() {
    // Emitted when the window is closed.
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
});


// Quit when all windows are closed.
app.on('window-all-closed', function() {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit();
	}
});


app.on('quit', function() {
  // Make sure device is disconnected before exiting.
  disconnectAllDevices();
});
