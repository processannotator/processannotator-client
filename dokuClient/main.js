'use strict' /*eslint global-strict:0*/

require('electron-compile').init() // to compile to ES6/harmony
const electron = require('electron')
const app = electron.app // Module to control application life.
const ipc = electron.ipcMain // module for interprocess communication (renderer <-> backend)
const BrowserWindow = electron.BrowserWindow // Module to create native browser window.


// Report crashes to our server.
require('crash-reporter').start()

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is GCed.
var mainWindow = null

// Quit when all windows are closed.
app.on('window-all-closed', function() {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit()
	}
})




app.on('ready', function() {

	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800
	})

	// load the index.html of the app.
	mainWindow.loadURL('file://' + __dirname + '/index.html')

	// Open the devtools.
	// mainWindow.openDevTools()

	mainWindow.on('closed', function() {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		mainWindow = null
	})
})
