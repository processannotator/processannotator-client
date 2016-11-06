'use strict'; /*eslint global-strict:0*/

const electron = require('electron');
const noble = require('noble');
const dialog = electron.dialog;
const app = electron.app; // Module to control application life.
const ipc = electron.ipcMain; // module for interprocess communication (renderer <-> backend)
const BrowserWindow = electron.BrowserWindow; // Module to create native browser window.
const os = require('os');

// automatically reload the renderer app when the bundle changes
// IMPORTANT: Uncomment before running `npm run package`
// require('electron-reload')(__dirname + '/src/main-app-bundle.js');


app.commandLine.appendSwitch('enable-file-cookies');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is GCed.
let mainWindow = null;


// Global state:
let devices = [];             // List of known devices.
let selectedIndex = null;     // Currently selected/connected device index.
let selectedDevice = null;    // Currently selected device.
let selectedAddress = null;   // MAC address or unique ID of the currently selected device.
                              // Used when reconnecting to find the device again.
let uartRx = null;            // Connected device UART RX char.
let uartTx = null;            // Connected device UART TX char.
let connectStatus = null;


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

function serializeDevice(device, index) {
  // Prepare a Noble device for serialization to send to a renderer process.
  // Copies out all the attributes the renderer might need.  Seems to be
  // necessary as Noble's objects don't serialize well and lose attributes when
  // pass around with the ipc class.
  return {
    id: device.id,
    name: device.advertisement.localName,
    address: device.address,
    index: index
  };
}

function serializeServices(index) {
  // Prepare all the services & characteristics for a device to be serialized
  // and sent to the rendering process.  This will be an array of service objects
  // where each one looks like:
  //  { uuid: <service uuid, either short or long>,
  //    name: <friendly service name, if known>,
  //    type: <service type, if known>
  //    characteristics: [<list of characteristics (see below)>] }
  //
  // For each service its characteristics attribute will be a list of
  // characteristic objects that look like:
  //  { uuid: <char uuid>,
  //    name: <char name, if known>
  //    type: <char type, if known>
  //    properties: [<list of properties for the char>],
  //    value: <last known characteristic value, or undefined if not known>
  //  }
  let device = devices[index];
  let services = device.services.map(function(s) {
    return {
      uuid: s.uuid,
      name: s.name,
      type: s.type,
      characteristics: s.characteristics.map(function(c) {
        return {
          uuid: c.uuid,
          name: c.name,
          type: c.type,
          properties: c.properties
        };
      })
    };
  });
  return services;
}

function findUARTCharacteristics(services) {
  // Find the UART RX and TX characteristics and save them in global state.
  // Process all the characteristics.
  services.forEach(function(s, serviceId) {
    s.characteristics.forEach(function(ch, charId) {
      // Search for the UART TX and RX characteristics and save them.
      if (ch.uuid === '6e400002b5a3f393e0a9e50e24dcca9e') {
        uartTx = ch;
				console.log('Found TX characteristic');
      }
      else if (ch.uuid === '6e400003b5a3f393e0a9e50e24dcca9e') {
        uartRx = ch;
        // Setup the RX characteristic to receive data updates and update
        // the UI.  Make sure no other receivers have been set to prevent them
        // stacking up on reconnect.
				console.log('Found RX characteristic');
        uartRx.removeAllListeners('data');
        uartRx.on('data', function(data) {
					// console.log('RX:', String(data));
          if (mainWindow !== null) {
            mainWindow.webContents.send('uartRx', String(data));
          }
        });
        uartRx.notify(true);
      }
    });
  });
}

function setConnectStatus(status, percent) {
  // Set the current device connection status as shown in the UI.
  // Will broadcast out the change on the connectStatus IPC event.
  connectStatus = status;
  mainWindow.webContents.send('connectStatus', status, percent !== undefined ? percent : 0);
}

function connected(error) {
  // Callback for device connection.  Will kick off service discovery and
  // grab the UART service TX & RX characteristics.
  // Handle if there was an error connecting, just update the state and log
  // the full error.
  if (error) {
    console.log('Error connecting: ' + error);
    setConnectStatus('Error!');
    return;
  }
  // When disconnected try to reconnect (unless the user explicitly clicked disconnect).
  // First make sure there are no other disconnect listeners (to prevent building up duplicates).
  selectedDevice.removeAllListeners('disconnect');
  selectedDevice.on('disconnect', function() {
    reconnect(selectedAddress);
  });
  // Connected, now kick off service discovery.
  setConnectStatus('Discovering Services...', 66);
  selectedDevice.discoverAllServicesAndCharacteristics(function(error_, services, characteristics) {
    // Handle if there was an error.
    if (error_) {
      console.log('Error discovering: ' + error_);
      setConnectStatus('Error!');
      return;
    }
    // Setup the UART characteristics.
    findUARTCharacteristics(services);
    // Service discovery complete, connection is ready to use!
    // Note that setting progress to 100 will cause the page to change to
    // the information page.
    setConnectStatus('Connected', 100);
  });
}

function disconnect() {
  // Null out selected device and index so there is no reconnect attempt made
  // if this was an explicit user choice to disconnect.
  let device = selectedDevice;
  selectedDevice = null;
  selectedIndex = null;
  selectedAddress = null;
  // Now disconnect the device.
  if (device != null) {
    device.disconnect();
    setConnectStatus('Disconnected');
  }
}

function reconnect(address) {
  // Don't reconnect if no address is provided.  This handles the case
  // when the user clicks disconnect and really means they don't want to
  // be connected anymore.
  if (address === null) {
    return;
  }
  // Othewise kick off the reconnection to the device.
  console.log('Reconnecting to address: ' + address);
  setConnectStatus('Reconnecting...');
  // Turn on scanning and look for the device again.
  disconnect();
  selectedAddress = address;  // Must happen after disconnect since
                              // disconnect sets selectedAddress null.
  devices = [];
  noble.startScanning();
}

function setupNoble() {
  // ipc.on sets up an event handler so the renderer process (the webpage's
  // javascript) can 'call' functions in this main process.  These events are
  // defined below:
  ipc.on('startScan', function() {
    // Start scanning for new BLE devices.
    // First clear out any known and selected devices.
    devices = [];
    disconnect();
    // Start scanning only if already powered up.
    if (noble.state === 'poweredOn') {
      console.log('Starting scan... ');
      noble.startScanning();
    } else {
			console.log('Bluetooth adapter not powered on. Can\'t start scan.');
		}
  });
  ipc.on('disconnectPen', function() {
    disconnect();
  });
  ipc.on('stopScan', function() {
    // Stop scanning for devices.
    console.log('Stopping scan...');
    noble.stopScanning();
  });

  ipc.on('getDevice', function(event, index) {
    // Retrieve the selected device by index.
    let device = devices[index];
    event.returnValue = serializeDevice(device, index);
  });

  ipc.on('getServices', function(event, index) {
    // Retrieve list of all services and characteristics for a device with
    // the specified index.
    event.returnValue = serializeServices(index);
  });

  ipc.on('getConnectStatus', function(event) {
    // Return the current device connection status.
    event.returnValue = connectStatus;
  });

  ipc.on('deviceConnect', function(event, index) {
    // Start connecting to device at the specified index.
    // First get the selected device and save it for future reference.
    selectedIndex = index;
    selectedDevice = devices[index];
    selectedAddress = selectedDevice.address;
    // Stop scanning and kick off connection to the device.
    noble.stopScanning();
    setConnectStatus('Connecting...', 33);
		console.log('Connecting to device #', index);
    selectedDevice.connect(connected);
  });

  ipc.on('uartTx', function(event, data) {
    // Data is sent from the renderer process out the BLE UART (if connected).
    if (uartTx !== null) {
      console.log('Send to device: ' + data);
      uartTx.write(new Buffer(data));
    }
  });

  ipc.on('readChar', function(event, serviceId, charId) {
    // Request a characteristic value to be read.
    if (selectedIndex !== null) {
      // Grab the selected device, find the characteristic (based on its parent
      // service index), and call its read function to kick off the read.
      let device = devices[selectedIndex];
      device.services[serviceId].characteristics[charId].read(function(error, data) {
        // Char value was read, now check if it failed for some reason and then
        // send the value to the renderer process to update its state and render.
        if (error) {
          console.log('Error reading characteristic: ' + error);
        }
        else {
					console.log(
						'Characteristics updated for service id',
						serviceId,
						'/ characteristic id',
						charId,
						'with data:',
						data
					);
          mainWindow.webContents.send('charUpdated', serviceId, charId, String(data));
        }
      });
    }
  });

  noble.on('discover', function(device) {
    // Noble found a device.  Add it to the list of known devices and then send
    // an event to notify the renderer process of the current device state.
    let index = devices.push(device) - 1;
		const serializedDevices = devices.map(serializeDevice);
    mainWindow.webContents.send('devicesChanged', serializedDevices);
		console.log('Found devices:', serializedDevices);

		if (device.advertisement.localName === 'DokuPen') {
			selectedAddress = device.address;
			console.log('Found DokuPen with address', selectedAddress);
		}

    // Check if the found device is one we're attempting to reconnect to and kick
    // off the reconnection.
    if (selectedAddress !== null && device.address === selectedAddress) {
      console.log('Found device, reconnecting...');
      selectedIndex = index;
      selectedDevice = devices[index];
      noble.stopScanning();
      selectedDevice.connect(connected);
    }
  });
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

	ipc.on('asynchronous-message', function(event, arg) {
		if(arg === 'resetLocalDB') {
			session.clearStorageData({
				storages: ['cookies', 'indexdb', 'local storage', 'serviceworkers']
			}, () => { console.log('session cleared'); });
			mainWindow.webContents.session.clearCache(function(){
				console.log('session cleared');
				dialog.showMessageBox({type: 'info', buttons: [], message: 'Reset succesfull. The application will quit now. Please start manually afterwards.'}, () => {
					app.quit();
				});
			});
		}
	});

  // Check running as root on Linux (usually required for noble).
  if (os.platform() === 'linux' && !runningAsRoot()) {
    // Throw an error dialog when not running as root.
    dialog.showErrorBox('DokuClient', 'WARNING: This program should be run as a root user with sudo! This is necessary to open Bluetooth connections.');
  }

	setupNoble();

  // Start in the scanning mode if powered on, otherwise start in loading
  // mode and wait to power on before scanning.
  // if (noble.state === 'poweredOn') {
  //   mainWindow.loadUrl('file://' + __dirname + '/../app.html#scan');
  // }
  // else {
  //   mainWindow.loadUrl('file://' + __dirname + '/../app.html#loading');
  //   // Jump to scanning mode when powered on.  Make sure to do this only after
  //   // showing the loading page or else there could be a race condition where
  //   // the scan finishes and the loading page is displayed.
  //   noble.on('stateChange', function(state) {
  //     if (state === 'poweredOn') {
  //       mainWindow.loadUrl('file://' + __dirname + '/../app.html#scan');
  //     }
  //   });
  // }

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
  disconnect();
});
