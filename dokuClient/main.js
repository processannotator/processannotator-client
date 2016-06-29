'use strict' /*eslint global-strict:0*/


const electron = require('electron');
const app = electron.app; // Module to control application life.
const ipcMain = electron.ipcMain; // module for interprocess communication (renderer <-> backend)
const BrowserWindow = electron.BrowserWindow; // Module to create native browser window.
const dialog = electron.dialog;



app.commandLine.appendSwitch('enable-file-cookies');
//app.commandLine.appendSwitch('enable-web-bluetooth');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is GCed.
var mainWindow = null;

// Quit when all windows are closed.
app.on('window-all-closed', function() {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit();
	}
});



app.on('ready', function() {

	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800
	});

	let webContents = mainWindow.webContents;





  webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    let result = deviceList.find((device) => {
      return device.deviceName === 'test'
    })
    if (!result) {
      callback('')
    } else {
      callback(result.deviceId)
    }
  });


	mainWindow.setAutoHideMenuBar(true);

	// load the index.html of the app.
	mainWindow.loadURL('file://' + __dirname + '/index.html');
	var session = mainWindow.webContents.session;


	ipcMain.on('asynchronous-message', function(event, arg) {
		if(arg === 'resetLocalDB') {
			session.clearStorageData({
				storages: ['cookies', 'indexdb', 'local storage', 'serviceworkers']
			}, () => { console.log('session cleared')});
			mainWindow.webContents.session.clearCache(function(){
				console.log('session cleared');
				dialog.showMessageBox({type: 'info', buttons: [], message: 'Reset succesfull. The application will quit now. Please start manually afterwards.'}, () => {
					app.quit();
				});
			});
		}
	});

	ipcMain.on('synchronous-message', function(event, arg) {
		console.log(arg);  // prints "ping"
		event.returnValue = 'pong';
	});

	// Open the devtools.
	// mainWindow.openDevTools()

	mainWindow.on('closed', function() {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		mainWindow = null;
	});
});
