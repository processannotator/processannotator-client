/* eslint no-alert:0*/
'use strict'; /*eslint global-strict:0*/

import BNO055 from './bno055';
const electron = require('electron');
console.log(electron);
const ipc = electron.ipcRenderer;
const { dialog } = electron.remote;
const SERVERADDR = '141.20.168.11';
const PORT = '80';

var localInfoDB, remoteInfoDB, localProjectDB, userDB, remoteProjectDB, localCachedUserDB;
var sync;
var ws; //websocket connection
// require('./test').test();

var annotationElements = new Map();

// DOM elements
var imageContainer;
var renderView;

Polymer({
	is: 'main-app',

	properties: {
		objectTool: {
			type: 'Object'
		},
		selectedAnnotation: {
			type: 'Object',
			notify: true,
			observer: '_selectedAnnotationChanged'
		}

	},

	observers: [
	],

	attached: function () {
		document.app = this;

		this.setupEventHandlers();
		this.projects = [];
		this.activeProject = {_id: 'collabdb', activeTopic: 'topic_1'};
		this.remoteUrl = 'http://' + SERVERADDR + ':' + PORT;
		console.log(this.remoteUrl);

		imageContainer = document.querySelector('.object-view');
		renderView = document.querySelector('render-view');

		// This is only a temporary DB, will be replaced once switchDB(dbname) is called soon.
		localInfoDB = new PouchDB('info');
		remoteInfoDB = new PouchDB(this.remoteUrl + '/info');
		localInfoDB.sync(remoteInfoDB, {live: true, retry: true });
		localInfoDB.changes({live: true, since: 'now'})
		.on('change', (info) => {
			console.log('local info DB changed!!');
			return this.updateProjectList();
		})
		.on('error', function (err) {
			console.log(err);
		});


		this.updateProjectList();
		// Contains public user info (color, name) and is used for offline situations
		// and to reduce traffic.
		localCachedUserDB = new PouchDB('localCachedUserDB');
		userDB = new PouchDB(this.remoteUrl + '/_users');

		// this.initWebsockets()
		// .then(() => console.log('websocket succesfully connected'))
		// .catch(err => console.error(err));

		this.loadPreferences().then(() => {
			console.log('Loaded preferences.');

			return new Promise((resolve, reject) => {
				if(this.activeProfile === ''){
					console.log('NO ACTIVE PROFIL found in the preferences! creating one now.');

					let profileOverlay = document.querySelector('#profileSetupOverlay');

					profileOverlay.addEventListener('iron-overlay-closed', (e) => {
						this.setNewProfile({
							prename: profileOverlay.prename,
							surname: profileOverlay.surname,
							color: profileOverlay.color,
							email: profileOverlay.email
						}).then((result) => resolve(this.activeProfile));
					});
					profileOverlay.open();
				} else if(this.activeProfile !== undefined) {
					resolve(this.activeProfile);
				}
			});
		}).then(() => {
			console.log('ok, loaded or created the active profile. Now check if there is an active project');
			console.log(this.activeProject);
			if(this.activeProject === undefined || Object.keys(this.activeProject).length === 0) {
				this.projectOpened = false;
				console.log('NO ACTIVE PROFILE YET!');
			} else {
				console.log('loaded a project, show the renderview');
				this.projectOpened = true;
				return this.switchProjectDB(this.activeProject);
			}
		}).then(() => {
			console.log('continue');
			this.updateElements({updateFile: true});
		});

		window.addEventListener('resize', this.handleResize.bind(this));
		window.addEventListener('keyup', this.keyUp.bind(this));
	},

	connectSensors: function () {
		ipc.send('startScan');
	},

	deleteProjectDB: function (project) {
		let localDeleteDB = new PouchDB(project._id);
		console.log('really about to delete', project);
		return localDeleteDB.destroy().then(() => {
			// FIXME: Ok, the following is obviously not going to work
			// because the user is no couchdb admin, handle this with nodejs
			let remoteDeleteDB = new PouchDB(this.remoteUrl + '/' + project._id);
      return remoteDeleteDB.destroy();
    }).then((result) => {
      console.log(result);
    }).catch((err) => {
      alert(err);
      console.log(err);
    });
	},

	switchProjectDB: function(newProject) {
		// TODO: check if dname is a valid database name for a project
		this.activeProject = newProject;
		this.annotations = [];
		console.log('switch to projectDB with name', this.activeProject);
		console.log('ADAPTER: WORKER MIGHT CAUSE PROBLEMS, TEST!');
		localProjectDB = new PouchDB(this.activeProject._id, {adapter: 'worker'});
		remoteProjectDB = new PouchDB(this.remoteUrl + '/' + this.activeProject._id, {adapter: 'worker'});

		this.savePreferences();

		// perhaps also on change localInfoDB to rebuildAnnotation elements?
		sync = PouchDB.sync(localProjectDB, remoteProjectDB, {
			live: true,
			retry: true
		}).on('change', function(info) {
			// console.log('sync change!!');
			// console.log(info);
			// // TODO: implement function that only updates elements that changed
			// this.updateElements(info.change.docs);

		}).on('paused', (info) => {
			console.log('sync pause', info);

			// replication paused (e.g. user went offline)
		}).on('active', () => {
			console.log('sync active');

			// replicate resumed (e.g. user went back online)
		}).on('denied', info => {
			console.log('sync denied');

			// a document failed to replicate, e.g. due to permissions
		}).on('complete', info => {
			console.log('sync complete');
			console.log(info);

			// handle complete
		}).on('error', err => {
			console.log('sync error');
			// handle error
		});

		localProjectDB.changes({live: true, since: 'now', include_docs: true})
		.on('change', (info) => {
			console.log('change, info:', info);
			// only update also the file (for the renderer) if it's not an annotation
			let updateFile = false;
			if(info.doc.type !== 'annotation') {
				updateFile = true;
			}
			// Reduce calls to this.updateElements if there are many simultaneous changes!
			// Therefore only update every 30ms
			// This would not be valid if we only actually update individual elements from changes,
			// as we would have to notify updateElements about the actual changed docs. this is not true yet
			// and may never be, just wanted to note this here in case we ever decide to do so:)
			clearTimeout(this.updateTimeout);
			this.updateTimeout = setTimeout(() => {
				this.updateElements({updateFile: updateFile});
			}, 30);

		})
		.on('complete', function(info) {
			console.log('complete');
		}).on('error', function (err) {
			console.log(err);

		});

		localProjectDB.get('info').then(info => {
			console.log('info', info);
			this.activeProject.activeTopic = info.activeTopic;

			this.updateElements({updateFile: true});
		});

		// TODO: this.switchTopic().then(() => {
		//  this.updateElements
		// })

		return sync;
	},

	addTopic: function() {
		// add new topic to active project
		return localProjectDB.put({
			_id: 'topic_' + 1,
			type: 'topic',
			parentProject: this.activeProject._id,
			creator: this.activeProfile.name,
			creationDate: new Date().toISOString(),
			title: 'a topic title',
			description: 'a description to a topic'
		});
	},

	// this is an event handler, triggering on enter-key event in renderview
	addAnnotation: function({detail: {description='', position={x: 0, y: 0, z: 0}, cameraPosition={x: 0, y: 0, z: 0}, cameraRotation={x: 0, y: 0, z: 0}, cameraUp={x: 0, y: 0, z: 0}, polygon=[]}}) {
		console.log('about to add annotation to', this.activeProject._id);

		let annotation = {
			_id: 'annotation_' + new Date().toISOString(),
			type: 'annotation',
			status: 'status',
			parentProject: this.activeProject._id,
			parentTopic: this.activeProject.activeTopic,
			parentObject: this.activeObject_id,
			creator: this.activeProfile.name,
			creationDate: new Date().toISOString(),
			cameraPosition,
			// cameraRotation,
			cameraUp,
			description,
			position,
			polygon
		};

		console.log('about to add an annotation!');
		return localProjectDB.put(annotation).then((result) => {
		})
		.catch((err) => {
			console.log(err);
		});
	},

	login: function(user, password) {
		return userDB.login(user, password);
	},

	loadPreferences: function() {
		return localInfoDB.get('_local/lastSession')
		.then((preferences) => {
			console.log('preferences loaded?');
			if(preferences !== undefined) {
				console.log('setting active profile, project and topic from local preferences');
				console.log(preferences);
				this.preferences = preferences;
				this.activeProfile = preferences.activeProfile;
				this.activeProject = preferences.activeProject;
			}
			if (preferences === undefined) {
				throw	new Error('preferences missing, this error shouldnt hthisen at all!');
				// because if preferences is undefined, it should have thrown an error before!
			}

			// try to login to profile thats saved in preferences info from remote server
			// to get up-to-date profile info and save it later
			return this.login(preferences.activeProfile.name, preferences.activeProfile.password);
		})
		.then(response => {
			return userDB.getSession();
		})
		.then(response => {
			if(!response.userCtx.name){
				console.error('Couldnt get user session: hmm, nobody logged on.');
			}
			// got session, that means login works and user remains logged in, get more userInfo now.
			return userDB.getUser(this.activeProfile.name);
		})
		.then(updatedProfile => {
			// use fresh profile info to set local profile (eg. when user logged in from other device and changed colors etc.)
			this.activeProfile = Object.assign(updatedProfile, this.activeProfile);
			return this.preferences;
		})
		.catch((err) => {
			if(err.message === 'missing'){
				console.log('no preferences yet, creating template.');
				return localInfoDB.put({
					_id: '_local/lastSession',
					projects: [],
					activeProfile: '',
					activeProject: {}
				})
				.then((result) => {
					//trying to reload preferences after setting fresh initial one.
					return this.loadPreferences();
				})
				.catch((error) => {
					console.log(error);
				});
			} else {
				console.error('possible no internet connection, just use offline data for now', err);
				return this.preferences;
			}
		});
	},

	savePreferences: function() {
		console.log('saving preferences...');
		// _local/lastSession should exist because loadPreferences creates it.

		return localInfoDB.get('_local/lastSession').then(doc => {
			console.log('getting lastSession for saving:', doc);
			doc.activeProfile = this.activeProfile;
			doc.activeProject = this.activeProject;
			return localInfoDB.put(doc);
		})
		.then((result) => {
			console.log('saved preferences.', result);
		})
		.catch((err) => {
			console.log('error in saving prefs');
			console.log(err);
		});
	},

	setNewProfile: function({prename, surname, email, color}) {
		let metadata = {
			surname: surname,
			prename: prename,
			email: email,
			color: color,
			creationDate: new Date().toISOString()
		};

		let name = metadata.prename + metadata.surname;
		// TODO: this is only a testing password for all users
		let password = 'thisisasupersecrettestingpassworduntilthebeta';

		// Then set the current active profile to the new profile.
		this.activeProfile = {name: name, password, metadata};
		// FIXME: will be problematic when doing an offline 'signup'
		// will need to redo the signup once possible

		// Before trying any network stuff, save preferences with locally created profile.
		return this.savePreferences()
		.then(() => {
			// The testkey is necessary, otherwise the user will get deleted and won't get the proper db role.
			metadata.testkey = 'testuserkey';
			metadata.projects = [];
			console.log('signing up');
			return userDB.signup( name, password, {metadata} );
		})
		.then((response) => userDB.login(name, password))
		.then((response) => {
			console.log('succesfully created user and logged in.', response);
			return userDB.getUser(name);
		})
		.then((response) => {
			this.activeProfile = Object.assign(this.activeProfile, response);
		})
		.catch(err => console.error(err));
	},

	setNewProject: function({projectname, topicname, file, emails}) {
		// Assumes current activeProfile as the creator.
		// We will create a new db for the project.
		// However, only server admins are allowed to create db's in couchdb,
		// so we are sending a message via websockets to let the server create the DB.

		// FIXME: create some kind of queue in the preferences to send out the request
		// at a later time when the server is offline.

		function normalizeCouchDBName(name) {
			return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_$()+/-]/g, '$');
		}

		function annotationWithCreatorProfile(doc) {
			console.log('doc');
			if(doc.creator === this.activeProfile.name)
			return localCachedUserDB.get(doc.creator)
			.then(profile => {
				doc.creatorProfile = profile;
				return doc;
			}).catch(err => {
				console.log(err);
				doc.creatorProfile = {};
				return doc;
			});
		}

		let topicID = 'topic_' + topicname;
		let newProjectDescription = {
			_id: 'project_' + (Date.now()) + '_' + normalizeCouchDBName(projectname),
			name: projectname,
			activeTopic: topicID
		};

		userDB.getUser(this.activeProfile.name).then((response) => {
			// Save intend of user to create new DB into it's 'projects' field.
			// This field will get read on the server, which decices wether to create a
			// DB for it.

			response.projects.push(newProjectDescription._id);
			return userDB.putUser(
				this.activeProfile.name,
				{metadata: {projects: response.projects}}
			);
		}).then(() => {
			this.projectOpened = true;
			localInfoDB.get('projectsInfo').then((doc) => {
				doc.projects.push(newProjectDescription);
				return localInfoDB.put(doc);
			}).catch((err) => {
				if(err.status === 404) {
					return localInfoDB.put({_id: 'projectsInfo', projects: [newProjectDescription]});
				}
			});

			this.push('projects', newProjectDescription);
			// independently of internet connection and remote DB already create local DB
			// and add first topic with object/file
			return new PouchDB(newProjectDescription._id).bulkDocs(
				[{
					_id: 'info',
					name: projectname,
					activeTopic: topicID
				},
				{
					_id: 'topic_' + topicname,
					_attachments: {
						'file': { type: file.type, data: file, something: 'else'}
					}
				}]);
			})
			.then(() => {
				return this.switchProjectDB(newProjectDescription);
			})
			.then((result) => {
				this.activeProject.activeTopic = topicID;
				this.updateElements({updateFile: true});
			})
			.catch(function (err) {
				console.log('something went wrong creating the new project db');
				console.log(err);
			});
		},

		// Get all annotation of current project.
		// 1. Update localCachedUserDB based in annotation creators (if userDB is available)
		// 2. Use localCachedUserDB to add profile info (color, name) to annotation.
		// 3. return updated annotations.
		getAnnotations: function() {
			if(localProjectDB === undefined) return false;
			let creators = new Set();
			let updatedCreators = new Set();
			let annotations;


			return localProjectDB.allDocs({
				include_docs: true,
				startkey: 'annotation',
				endkey: 'annotation\uffff'
			})
			.then(result => {
				annotations = result.rows;
				let promiseUserUpdates = [];
				let updatedAnnotations = [];
				// now fetch the profile of the annotation creator and try to get it from userDB
				// to update the localCachedUserDB.
				// Collect all creator names and fetch them from localCachedUserDB
				// for (let {doc: {creator}} of annotations) {
				// 	creators.add(creator);
				// }
				// TODO:
				// HACK! This is inefficient. In future update localCachedUserDB periodically (try every 10 mins?)
				// And update annotations only from local cache
				for (let {doc} of annotations) {
					let updatedAnnotation = userDB.getUser(doc.creator).then((creatorProfile) => {
						let {surname, prename} = creatorProfile;
						doc.creatorProfile = creatorProfile;

						// also update localCachedUserDB if not done yet.
						if(updatedCreators.has(doc.creator) === false) {
							updatedCreators.add(doc.creator);
							localCachedUserDB.get(doc.creator).then((cachedProfile) => {
								cachedProfile.surname = surname;
								cachedProfile.prename = prename;
								return localCachedUserDB.put(cachedProfile);
							})
							.catch((err) => {
								// No local cache of user info yet, cache it now!
								if(err.status === 404) {
									console.log('No local cache of user info yet, cache it now!');
									return localCachedUserDB.put({_id: doc.creator, surname, prename});
								} else {
									console.error(err);
								}
							});
						}
						return doc;
					})
					.catch((err) => {
						console.log(err);
						console.log('try to get from localCache');
						// Try to get creatorProfile from cache instead.
						console.log(doc.creator);
						return localCachedUserDB.get(doc.creator).then((creatorProfile) => {
							console.log(creatorProfile);
							doc.creatorProfile = creatorProfile;
							return doc;
						})
						.catch((err_) => {
							console.error(err_);
						});
					});
					updatedAnnotations.push(updatedAnnotation);
				}
				return Promise.all(updatedAnnotations);
			});
		},

		onAnnotationDeleted(evt) {
			debugger
			localProjectDB.remove(evt.detail.annotation);
		},

		onAnnotationEdit: function(evt) {
			// emitted when user edits text in annotationbox and hits enter
			localProjectDB.get(evt.detail.newAnnotation._id).then(doc => {
				doc.description = evt.detail.newAnnotation.description;
				doc.status = evt.detail.newAnnotation.status;
				// TODO: get colors from CSS, so it stays in one place?
				switch (doc.status) {
					case 'comment':
						doc.statusColor = 'blue';
						break;
					case 'task':
						doc.statusColor = 'yellow';
						break;
					case 'problem':
						doc.statusColor = 'red';
						break;
					default: break;
				}

				return localProjectDB.put(doc).then((value) => {});
				// after put into DB, DB change event should be triggered automatically to update
			});//.then(() => {updateElements()})
		},

		updateElements: function(options) {
			if(localProjectDB === undefined) return;

			if((options.updateFile && options.updateFile === true)) {
				localProjectDB.get('info')
				.then((doc) => localProjectDB.getAttachment(doc.activeTopic, 'file'))
				.then(blob => {
					renderView.file = blob;
					return Promise.resolve();
				})
				.catch((err) => {
					console.log(err);
				});
			}

			this.getAnnotations().then(annotations => {
				this.annotations = annotations;
			});
		},

		handleResize: function(event) {
			if(renderView) {
				renderView.resize();
			}
		},

		keyUp: function(evt) {
			// if(evt.keyCode === 189){
			// 	console.log('complete reset');
			// 	completeReset();
			// }
		},

		handleCreateProject: function() {
			let projectOverlay = document.querySelector('#projectSetupOverlay');
			projectOverlay.addEventListener('iron-overlay-closed', (e) => {

				this.setNewProject({
					projectname: projectOverlay.projectname,
					topicname: projectOverlay.topicname,
					file: projectOverlay.file,
					emails: ['bla']
				});

			});
			projectOverlay.open();
		},

		updateProjectList: function () {
			return localInfoDB.get('projectsInfo').then((doc) => {
				this.set('projects', doc.projects);
			}).catch((err) => {
				console.log(err);
			});
		},

		toggleDashboard: function (e) {
			console.log('toggle dashboard');

			this.$.dashboard.toggle();
			this.$.projectMenuItem.classList.toggle('selected');
			console.log(this.$.dashboard);
		},

		handleSwitchProject: function (e) {
			this.switchProjectDB(e.detail);
		},

		handleDeleteProject: function (e) {
			console.log(e.detail);
			dialog.showMessageBox({
				type: 'info',
				buttons: ['cancel', 'delete local and remote project files'],
				defaultId: 0,
				title: 'Delete Project',
				message: 'Are you sure you want to delete the project, including all annotations, files by all users inside \'' + e.detail.name + '\'? This will delete local and files on the server and can not be reversed.',
				cancelId: 0
			}, (response) => {
				console.log('response', response);
				console.log('going to delete??', e.detail);
				if(response === 1) this.deleteProjectDB(e.detail);
			});
		},

		resetLocalDB: function (e) {
			ipc.send('asynchronous-message', 'resetLocalDB');
		},

		mouseOutAnnotationLabel: function (e) {
			clearTimeout(this.labelHoverTimeout);
		},

		mouseOverAnnotationLabel: function (e) {
			this.labelHoverTimeout = setTimeout(() => {
				let annotationBox = document.getElementById('annotationbox_' + e.detail);
				annotationBox.scrollIntoView({block: 'end', behavior: 'smooth'});

				// let index = this.annotations.findIndex((annotation) => annotation._id === e.detail);
				// this.$.annotationList.scrollToIndex(index);
			}, 500);
		},

		annotationBoxClicked: function (e) {
			e.target.classList.toggle('selectedAnnotation');
			let item = this.$.annotationListTemplate.itemForElement(e.target);
			this.$.annotationSelector.select(item);

			console.log(this.selectedAnnotation);
		},

		_selectedAnnotationChanged: function (e) {
			console.log('selected annotation changed');
			if(this.selectedAnnotation === undefined || this.selectedAnnotation === null) return;
			renderView.focusAnnotation(this.selectedAnnotation);
		},

		toolChanged: function (e) {
			this.objectTool = this.$.toolBox.selected;
			console.log(this.objectTool);
		},

		setupEventHandlers() {
			const callback = state => {
				if (!renderView) return;
				renderView.physicalModelState = state;
			};
			const buttonCallback = () => {
				console.log('Button pressed');
			};
			this.bno055 = new BNO055(callback, buttonCallback);
			ipc.on('connectStatus', (emitter, status, percent) => {
				this.sensorStatus = `${status} (${percent}%)`;
				console.log('Connect status:', status, percent);
				// setTimeout(() => {
				// 	this.bno055.straighten();
				// }, 5000);
				if (status === 'Connected') {
					this.bno055.reset();
				}
			});

			ipc.on('uartRx', (emitter, data) => this.bno055.push(data));
		}
	});
