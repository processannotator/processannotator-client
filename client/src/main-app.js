/* eslint no-alert:0*/
'use strict'; /*eslint global-strict:0*/

import BNO055 from './bno055';

// import SpeechRecognition from './speechRecognition'
const equal = require('deep-equal');
const electron = require('electron');
const ipc = electron.ipcRenderer;
const { dialog } = electron.remote;
// Uses rollup-replace to replace ENV with the env set when starting rollup
const SERVERADDR = (ENV === 'dev') ? '127.0.0.1' : '127.0.0.1';
const PORT = 8301;
let POUCHCONF = {};

var db, localInfoDB;

Polymer({
	is: 'main-app',

	properties: {
		objectTool: {
			type: Object
		},
		selectedAnnotation: {
			type: Object,
			notify: true,
			observer: '_selectedAnnotationChanged'
		},
		annotations: {
			type: Array,
			notify: true,
			// observer: 'annotationsChangedObserver'
		},
		penStatus: {
			type: String,
			value: 'disconnected'
		},

	},
	observers: [
		'annotationsChanged(annotations.*)'
	],

	attached: async function () {
		document.app = this;

		this.setupPenEventHandlers();
		this.previouslyFetchedAnnotations = [];
		this.penButtonText = 'Connect Pen';
		this.objectButtonText = 'Connect Object';
		this.penButtonConnecting = false;
		this.penButtonConnected = false;
		this.objectButtonConnecting = false;
		this.onlineStatus = false;
		this.OnlineStatusText = '-';

		this.targets = [];
		this.activeTarget = {_id: 'target:1', activeTopic: 'topic_1'};

		this.isOnline = window.navigator.onLine;
		window.addEventListener("offline", this.updateOnlineStatus.bind(this));
		window.addEventListener("online", this.updateOnlineStatus.bind(this));


		this.renderView = document.querySelector('render-view');
		localInfoDB = new PouchDB('info', POUCHCONF);
		localInfoDB.changes({live: true, since: 'now'})
			.on('change', this.updateTargetList);

		setInterval(this.updateOnlineStatus.bind(this), 1000 * 30);
		this.updateOnlineStatus();


		this.loadPreferences().then(async () => {
			console.log(this.activeTarget);

			if( this.activeTarget === undefined || Object.keys(this.activeTarget).length === 0) {
				this.projectOpened = false;
				console.log('no active project yet!');
			} else {
				this.projectOpened = true;
				await this.switchTarget(this.activeTarget.id);
			}

			return this.updateElements({updateFile: true});

		});

		window.addEventListener('resize', this.handleResize.bind(this));
		window.addEventListener('keyup', this.keyUp.bind(this));
	},
	annotationsChanged: function () {
		// TODO: get database annotations and diff them to new ones
		// but also to a timeout!
		//
		// this would make it possible to easier select the just created annotation
	},

	updateTargetList: async function () {
		this.targets = await NeonionRest.fetchTargets({host: SERVERADDR, port: PORT});
	},

	// Return false if either whole computer is offline or databases are unreachable
	updateOnlineStatus: async function () {

			let status = false;
			if(window.navigator.onLine === false) {
				status = false;
			} else {
				// HACK/PLACEHOLDER. instead  try to ping neonion db to determine status
				status = true;
				// try {
				// 	status = true;
				// } catch (err) {
				// 	status = false;
				// }
			}

			this.onlineStatus = status;
			this.onlineStatusText = status ? 'DB ONLINE ⦿' : 'DB OFFLINE ○';

			console.log('online status change', this.onlineStatus);
			return status;
	},

	connectOrDisconnectPen: function () {

		if (this.penStatus === 'connected') {
			this.penButtonConnecting = false;
			ipc.send('disconnectPen');
			console.log('trying to disconnect pen');
		} else {
			this.penButtonConnecting = true;
			ipc.send('startScan');
			console.log('trying to connect pen');
		}
	},

	deleteTarget: async function (targetID) {

		// HACK: Only in testing phase, any user can delete any project DB by
		// modifying the array targetsInfo.targets of the `info` db
		// In the future only allow db members to delete their project db, by modifying a users targets array.

		try {
			await db.deleteTarget(targetID);
		} catch (err) {
			console.error('something went wrong deleting', targetID);
			console.log(err);
		} finally {
			this.updateTargetList();
			this.updateElements();
		}


	},

	// Takes a new target object and reloads annotations, the file blob etc.
	switchTarget: async function(targetID) {
		console.log('switch to annotation target with ID', targetID);
		this.annotations = [];
		this.activeTarget = await NeonionRest.fetchTarget({id:targetID, host: SERVERADDR, port: PORT});
		console.log('ACTIVE TARGET:', this.activeTarget);
		db = new NeonionRest.NeonionRestTarget({id:targetID, host: SERVERADDR, port: PORT});

		this.savePreferences();

		// Clear any previous target's timeouts
		// then define and immediately start recursive timeout
		// which starts a new timeout after elements have been updated
		clearTimeout(this.updateAnnotationsTimeout);

		var recursiveUpdateAnnotations = async () => {
			await this.updateElements({updateFile: false});
			this.updateAnnotationsTimeout = setTimeout(recursiveUpdateAnnotations, 4000);
		}
		recursiveUpdateAnnotations();




	},

	// this is an event handler, triggering on enter-key event in this.renderView
	// or by a button press on the physical pen.
	addAnnotation: function({detail: {description='', localPosition={x: 0,y: 0,z: 0}, worldPosition={x: 0, y: 0, z: 0}, cameraPosition={x: 0, y: 0, z: 0}, localCameraPosition={x: 0, y: 0, z: 0}, worldCameraPosition={x: 0, y: 0, z: 0}, cameraRotation={x: 0, y: 0, z: 0}, cameraUp={x: 0, y: 0, z: 0}, polygon=[], responses=[]}}) {

		let created = new Date().toISOString();
		let id = `annotation:${created}`;
		let referedBy = [];
		if(this.referingAnnotation) {
			referedBy = [this.referingAnnotation._id];
			// As this annotation is refered by another one, also add
			// referTo field to the refering annotation:
			this.referingAnnotation.referingTo.push(_id);
			this.editAnnotation({detail: {annotation: this.referingAnnotation}});

		}

		let annotation = {
			status: 'comment',
			motivation: 'commenting', // web annotation model
			responses,
			referedBy,
			referingTo: [],
			parentProject: this.activeTarget._id,
			parentTopic: this.activeTarget.activeTopic,
			creator: this.activeProfile.name,
			creationDate: created,
			created, // same as above, conforms to web-annotation-model
			worldCameraPosition,
			localCameraPosition,
			// cameraRotation,
			cameraUp,
			description,
			worldPosition,
			localPosition,
			polygon
		};


		// annotation = JSON.parse(JSON.stringify(annotation));
		return db.createAnnotation({info:annotation, id})
		.then((res) => {
			console.log('Added annotation.', res);
			console.log('refer mode active?', this.referMode);
			if(this.referMode) this.toggleReferMode();
		})
		.catch(err => console.log)
	},

	// editAnnotation: function (evt) {
	// 	if (evt.defaultPrevented)
	// 		return; // Should do nothing if the key event was already consumed.
	//
	// 	let editedAnnotation = Object.assign({}, evt.detail.annotation);
	// 	delete editedAnnotation.creatorProfile; //purge possibly sensitive info
	//
	// 	console.log('\n\n received annotation to be updated!!\n\n', editedAnnotation);
	//
	// 	if(evt.detail.temporary && evt.detail.temporary === true) {
	// 		console.log('is temporary', evt.detail);
	// 		let index = this.annotations.findIndex((annotation) => annotation._id === editedAnnotation._id);
	//
	// 		this.splice('annotations', index, editedAnnotation);
	// 	} else {
	// 		db.get(editedAnnotation._id).then((storedAnnotation) => {
	// 			console.log('saving changes to annotation');
	// 			editedAnnotation.modified = new Date().toISOString();
	// 			editedAnnotation = Object.assign(storedAnnotation, editedAnnotation);
	//
	// 			return db.put(editedAnnotation);
	// 		})
	// 	}
	//
	// },

	// deleteAnnotation: function (e) {
	// 	console.log('removing', e.detail.annotation);
	// 	let id = e.detail.annotation._id;
	// 	return db.removeAnnotation(e.detail.annotation)
	// 	.catch((err) => {
	// 		console.error('error deleting', id);
	// 		console.error(err);
	// 	});
	// },

	login: function(user, password) {
		// return userDB.login(user, password);
	},

	loadPreferences: async function() {

		try {

			let preferences = await localInfoDB.get('_local/lastSession');

			if(preferences !== undefined) {
				this.preferences = preferences;
				this.activeProfile = preferences.activeProfile;
				this.activeTarget = preferences.activeTarget;
			} else {
				throw	new Error('No preferences loaded.');
			}

			this.updateTargetList();
			return this.preferences;

		} catch (err) {

			if(err.message === 'missing'){
				console.log('no preferences yet, creating template.');

				let result = await localInfoDB.put({
					_id: '_local/lastSession',
					targets: [],
					activeProfile: '',
					activeTarget: {}
				})

				//trying to reload preferences after setting fresh initial one.
				return this.loadPreferences();

			} else {
				console.error('possible no internet connection, just use offline data for now', err);
				return this.preferences;
			}
		};


	},

	savePreferences: async function() {

		// _local/lastSession should exist because loadPreferences creates it.
		try {
			let doc = await localInfoDB.get('_local/lastSession');
			doc.activeProfile = this.activeProfile;
			doc.activeTarget = this.activeTarget;
			let result = await localInfoDB.put(doc);
			console.log('saved preferences.', result);
		} catch (err) {
			console.log('error in saving preferences', err);
		}

	},

	setNewProfile: async function({prename, surname, email, color}) {

		let metadata = {
			surname: surname,
			prename: prename,
			email: email,
			color: color,
			creationDate: new Date().toISOString()
		};

		let name = metadata.prename + metadata.surname;
		this.activeProfile = {name: name, metadata};
		await this.savePreferences();

		// The testkey is necessary, otherwise the user will get deleted and won't get the proper db role.
		metadata.testkey = 'testuserkey';
		metadata.targets = [];
		// No further signup required for this (neonion-rest) fork
		// profile ise simply used to supply a name for new annotations

	},

	setNewTarget: async function({targetname, file}) {

		let fileEnding = file.name.split('.').pop();
		if(fileEnding !== 'obj' && fileEnding !== 'dae') {
			alert('For now you can only upload OBJ and DAE files.');
			return;
		}

		if(await this.updateOnlineStatus() === false) {
			alert('Error connecting to the database for Project creation. Please check if you are connected to the internet and try again.');
			return;
		}

		function normalizeCouchDBName(name) {
			return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_$()+/-]/g, '$');
		}


		let newTargetDescription = {
			_id: 'project_' + (Date.now()) + '_' + normalizeCouchDBName(projectname),
			name: targetname,
			/* fileurl? */

		};

			// Set appropriate mime type for blob
			let contentType = 'text/plain';

			if(fileEnding === 'dae') {
				contentType = 'model/vnd.collada+xml';
			} else if (fileEnding === 'obj') {
				contentType = 'text/plain';
			}

			let blob = new Blob([file], {type: contentType});

			try {
				// Add target to our local targets list
				this.push('targets', newTargetDescription);
				// Then try to create it on the remote DB
				await db.createTarget(newTargetDescription);
				await this.switchTarget(newTargetDescription.id);
				return this.updateElements({updateFile: true});
			} catch (err) {
				console.error('something went wrong creating the new project db');
				console.error(err);
			}


		},

		getAnnotations: async function() {
			if(db === undefined) return false;
			return db.fetchAnnotations();

		},


		updateElements: async function(options) {

			if((options.updateFile && options.updateFile === true)) {
				try {
					// Update activeTarget object with most recent version
					console.log(this.activeTarget);
					this.activeTarget = await NeonionRest.fetchTarget({id:this.activeTarget.id, host: SERVERADDR, port: PORT});
					// Get most recent target file from DB and pipe it into renderview

					// TODO: Read the "file" field from the target entry and use that url/file (optionally cache it)
					// for now, testing it is always target1 using shuttle for a web url
					let blob = await fetch('https://people.sc.fsu.edu/~jburkardt/data/obj/shuttle.obj').then(res => res.blob());
					this.renderView.fileEnding = 'obj';
					this.renderView.fileName = this.activeTarget.id;
					this.renderView.file = blob;
				} catch (err) {
					console.log(err);
				}
			}

			const updatedAnnotations = await this.getAnnotations();

			// Check if there is any difference between the current ones and the updated ones
			// console.log(JSON.stringify(this.previouslyFetchedAnnotations));
			// console.log(JSON.stringify(updatedAnnotations));

			if(equal(this.previouslyFetchedAnnotations, updatedAnnotations)) {
				console.log('updated annotations are equal. Dont continue');
				return;
			}
			console.log('NEW updated annotations, use them!');

			// Save a version that won't change state in the appendChild
			// for diffing/comparing
			this.previouslyFetchedAnnotations = updatedAnnotations.slice();

			// try selection of previous selected annotation for new list
			let previousSelectedID;
			if(this.selectedAnnotation) {
				previousSelectedID = this.selectedAnnotation.id;
			}
			// Now replace main annotations object for use in app
			this.annotations = updatedAnnotations.slice();

			// Either select the actual previously selected annotation or pick the most recent one (last in list)
			let previousSelected = this.annotations.find((annotation) => annotation.id === previousSelectedID) || this.annotations[this.annotations.length - 1];
			if(previousSelected) {
				this.$.annotationSelector.select(previousSelected);
			}
		},

		handleResize: function(event) {
			if(this.renderView) {
				this.renderView.resize();
			}
		},

		keyUp: function(evt) {
			// if(evt.keyCode === 189){
			// 	console.log('complete reset');
			// 	completeReset();
			// }
		},

		handleCreateTarget: async function() {
			if(await this.updateOnlineStatus() === false) {
				dialog.showErrorBox('DokuClient', 'Error connecting to the database for new Project creation. Please check if you are connected to the internet and try again.');
				return;
			}

			let targetOverlay = document.createElement('project-setup-overlay');
			targetOverlay.classList.add("fullbleed");
			targetOverlay['with-back-drop'] = true;
			targetOverlay['auto-fit-on-attach'] = true;
			Polymer.dom(this.root).appendChild(targetOverlay);

			targetOverlay.addEventListener('iron-overlay-closed', (e) => {
				if(targetOverlay.pageNumber !== 2) return;

				this.setNewTarget({
					projectname: targetOverlay.projectname,
					file: targetOverlay.file
				});

				Polymer.dom(this.root).removeChild(targetOverlay);

			}, {once: true});
			targetOverlay.open();
		},

		toggleDashboard: function (e) {
			this.$.dashboard.toggle();
			this.$.projectMenuItem.classList.toggle('selected');
			this.$.dashboard.addEventListener('switch-project-click', (e) => {
				this.$.projectMenuItem.classList.toggle('selected');
			}, {once: true});
		},

		handleSwitchTarget: function (e) {
			console.log('Switch Target', e.detail.id);
			return this.switchTarget(e.detail.id);
		},

		handleDeleteTarget: function (e) {

			dialog.showMessageBox({
				type: 'info',
				buttons: ['cancel', 'delete local and remote project files'],
				defaultId: 0,
				title: 'Delete Project',
				message: 'Are you sure you want to delete the project, including all annotations, files by all users inside \'' + e.detail.name + '\'? This will delete local and files on the server and can not be reversed.',
				cancelId: 0
			}, (response) => {
				console.log('going to delete??', e.detail);
				if(response === 1) this.deleteTarget(e.detail);
			});
		},

		resetLocalDB: function (e) {
			ipc.send('resetLocalDB');
		},

		mouseOutAnnotationLabel: function (e) {
			clearTimeout(this.labelHoverTimeout);
		},

		mouseOverAnnotationLabel: function (e) {
			// this.labelHoverTimeout = setTimeout(() => {
			// 	let annotationBox = document.getElementById('annotationbox_' + e.detail);
			// 	annotationBox.scrollIntoView({block: 'end', behavior: 'smooth'});
			// }, 500);
		},

		annotationBoxClicked: function (e) {
			console.log('annotation box clicked', e);
			console.log(e.target);
			e.target.classList.toggle('selectedAnnotation');

			let item = Polymer.dom(this.root).querySelector('.annotationListTemplate').itemForElement(e.target);
			this.$.annotationSelector.select(item);

			console.log('SELECTED ANNO', this.selectedAnnotation);

		},
		annotationBoxMouseover: function (e) {
			let item = Polymer.dom(this.root).querySelector('.annotationListTemplate').itemForElement(e.target);
			this.hoveredAnnotation = item;
		},

		_selectedAnnotationChanged: function (e) {
			if(this.renderView) this.renderView.render();
			if(this.selectedAnnotation === undefined || this.selectedAnnotation === null) return;
		},

		toolChanged: function (e) {
			this.objectTool = this.$.toolSelector.selected;
			console.log(this.objectTool);
		},
		toggleReferMode: function (e) {
			console.log('in main.app.js');


			if(this.referMode) {
				console.log('refering annotaitonEl', this.referingAnnotationEl);
				this.referMode = false;
				this.referingAnnotationEl.toggleReferIcon();
				this.referingAnnotation = undefined;
			} else {
				this.referMode = true;
				this.referingAnnotationEl = e.target;
				this.referingAnnotation = e.detail;
				this.$.toolSelector.selected = 'point';
			}
		},

		showFullAnnotationList: function (e) {
			this.$.sidePanel.increase();
		},
		getAnnotationDiff: function (e) {
			let changedAnnotations = [];
			let addedAnnotations = [];
			let removedAnnotations = [];

			// Get changed and new annotations
			for (let newAnnotation of this.annotations) {
				let oldAnnotation = oldAnnotations.find(({_id}) => _id === newAnnotation._id);

				if(oldAnnotation && oldAnnotation._rev !== newAnnotation._rev) {
					// changd annotation
					changedAnnotations.push(newAnnotation)
				} else if (oldAnnotation === undefined) {
					// new annotation
					addedAnnotations.push(newAnnotation)
				}
			}

			// Get removed annotations
			removedAnnotations = oldAnnotations === undefined ? [] : oldAnnotations.filter((oldAnnotation) => {
				return this.annotations.find((annotation) => annotation._id === oldAnnotation._id) === undefined;
			}) || [];

			return {changedAnnotations, addedAnnotations, removedAnnotations}
		},

		setupPenEventHandlers() {
			const onPenSensorState = state => {
				if (!this.renderView) return;
				this.renderView.penState = state;
			};

			const onPhysicalModelSensorState = state => {
				if (!this.renderView) return;
				this.renderView.physicalModelState = state;
			};

			let annotationIndex = 0;

			const onPenEvent = (eventName) => {
				if (eventName === 'buttonDown') {
					// this.renderView.tap(eventName);
					let worldPosition = this.renderView.pointerSphere.getWorldPosition();
					let localPosition = worldPosition.clone();
					this.renderView.fileRepresentation.worldToLocal(localPosition);
					this.renderView.mainGroupGL.worldToLocal(worldPosition);

					let worldCameraPosition = this.renderView.physicalPenModel.getWorldPosition().multiplyScalar(2.0);
					let localCameraPosition = worldCameraPosition.clone();
					this.renderView.fileRepresentation.worldToLocal(localCameraPosition);

					this.addAnnotation({
						detail: {
							description: `Annotation #${++annotationIndex}`,
							worldPosition: worldPosition,
							localPosition: localPosition,
							worldCameraPosition: worldCameraPosition,
							localCameraPosition: localCameraPosition,

							// cameraRotation: camera.rotation,
							cameraUp: this.renderView.physicalPenModel.up.clone(),
						},
					});
				}
			};

			const onPhysicalModelSensorEvent = (eventName) => {
				if (eventName === 'buttonDown') {
					this.parsers['Project Annotator Asset'].straighten();
				}
			};

			this.parsers = {
				'Project Annotator Pen': new BNO055(onPenSensorState, onPenEvent),
				'Project Annotator Asset': new BNO055(onPhysicalModelSensorState, onPhysicalModelSensorEvent),
				// 'DokuPen': new BNO055(onPenSensorState, onPenEvent),
				'Adafruit Bluefruit LE': new BNO055(onPhysicalModelSensorState, onPhysicalModelSensorEvent),

			};

			ipc.on('connectStatus', (emitter, deviceName, status, percent) => {
				console.log('\n\ndevicename:', deviceName);
				console.log('status:', status);
				this.penStatus = status;
				this.penStatusPercent = percent;
				this.penButtonText = status === 'connecting' ? `${status} (${percent}%)` : `${status}`;
				console.log('Connect status:', status, percent);
				if (status === 'connected' && percent === 100) {
					this.penButtonText = 'Disconnect Sensors';
					this.parsers[deviceName].reset();
					this.penButtonConnected = true;
					this.penButtonConnecting = false;
					setTimeout(() => {
						this.penSensorDataParser.straighten();
					}, 5000);
				} else if (status === 'disconnecting') {
					this.penButtonText = 'Connect Sensors';
					this.penButtonConnected = false;
				}


				console.log('Connect status:', status, percent);
				// setTimeout(() => {
				// 	this.bno055.straighten();
				// }, 5000);

			});

			ipc.on('uartRx', (emitter, deviceName, data) => {
				this.parsers[deviceName].push(data);
			});
		}
	});
