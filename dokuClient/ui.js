/* eslint no-alert:0*/
'use strict' /*eslint global-strict:0*/

var ipc = require('ipc')

var localDB, localProjectDB, remoteDB, remoteProjectDB
var sync
var ws //websocket connection
require('./test').test()

var annotationElements = new Map()

// DOM elements
var app = document.querySelector('#app')
var imageContainer
var annotationList
var renderView
app.activeProfile = ''
app.activeProject = 'collabdb'
app.activeTopic = {_id: 'topic_1'}

function switchProjectDB(dbname) {
	console.log('switch to projectDB with name', dbname)
	// TODO: check if dname is a valid database name for a project
	app.activeProject = dbname
	localProjectDB = new PouchDB(app.activeProject)
	remoteProjectDB = new PouchDB('http://127.0.0.1:5984/' + app.activeProject)
	savePreferences()

	// perhaps also on change localDB to rebuildAnnotation elements?
	sync = PouchDB.sync(localProjectDB, remoteProjectDB, {
		live: true,
		retry: true
	}).on('change', function(info) {
		console.log('sync change!!')
		console.log(info)
		console.log('TODO: now sync all DOM elements...')
		rebuildRenderingElements()


	}).on('paused', () => {
		rebuildRenderingElements()
		console.log('sync pause')

		// replication paused (e.g. user went offline)
	}).on('active', () => {
		console.log('sync active')

		// replicate resumed (e.g. user went back online)
	}).on('denied', info => {
		console.log('sync denied')

		// a document failed to replicate, e.g. due to permissions
	}).on('complete', info => {
		console.log('sync complete')
		console.log(info)
		//renderView.
		rebuildRenderingElements()

		// handle complete
	}).on('error', err => {
		console.log('sync error')

		// handle error
	})


	return sync


}

function addTopic() {
	// add new topic to active project
	return localDB.put({
		_id: 'topic_' + 1,
		type: 'topic',
		parentProject: app.activeProject._id,
		creator: app.activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a topic title',
		description: 'a description to a topic'
	})
}

function addAnnotation({description='', position={x: 0, y: 0, z: 0}, polygon=[]}) {
	let annotation = {
		_id: 'annotation_' + new Date().toISOString(),
		type: 'annotation',
		parentProject: app.activeProject._id,
		parentTopic: app.activeTopic._id,
		creator: app.activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a topic title',
		description: description,
		position: position,
		polygon: polygon
	}
	console.log('double check, is this the annotation?:')
	console.log(annotation)
	console.log('creator', app.activeProfile)
	console.log('put annotation into DB')
	return localProjectDB.put(annotation)
}

function login(user, password) {
	// IDEA: maybe save cookie or do notifactions.
	return remoteDB.login(user, password)
}

function loadPreferences() {

	return localDB.get('_local/lastSession')
	.then((preferences) => {
		console.log('preferences loaded?')
		if(preferences !== undefined) {
			console.log('setting active profile, project and topic from local preferences')
			app.preferences = preferences
			app.activeProfile = preferences.activeProfile
			app.activeProject = preferences.activeProject
			app.activeTopic = preferences.activeTopic
		}
		if (preferences === undefined) {
			throw	new Error('preferences missing, this error shouldnt happen at all!')
			// because if preferences is undefined, it should have thrown an error before!
		}

		// try to login to profile thats saved in preferences info from remote server
		// to get up-to-date profile info and save it later
		console.log('got prefs: ' + preferences)
		console.log('Use the profile info from preferences to login and possibly update activeProject')
		console.log(preferences.activeProfile._id)
		console.log(preferences.activeProfile.password)
		return login(preferences.activeProfile._id, preferences.activeProfile.password)
	})
	.then(response => {
		console.log('successfully logged in: ', response)
		return remoteDB.getSession()
	})
	.then(response => {
		if(!response.userCtx.name){
			console.error('Couldnt get user session: hmm, nobody logged on.')
		}
		// got session, that means login works and user remains logged in, get more userInfo now.
		return remoteDB.getUser(app.activeProfile._id)
	})
	.then(updatedProfile => {
		console.log('loaded user info from server', updatedProfile)
		console.log('current activeProfile', app.activeProfile)
		if(app.activeProfile) {
			// don't use the verbose couchdb:etc username, but keep the simple one
			updatedProfile._id = app.activeProfile._id
		}

		console.log('got profile from server:', updatedProfile)
		// use fresh profile info to set local profile (eg. when user logged in from other device and changed colors etc.)
		app.activeProfile = updatedProfile
		return app.preferences
	})
	.catch((err) => {
		console.log('some error loading the preferences...')
		console.log(err)

		if(err.message === 'missing'){
			console.log('no preferences yet, creating template.')
			return localDB.put({
				_id: '_local/lastSession',
				activeProfile: '',
				activeProject: '',
				activeTopic: ''
			})
			.then((result) => {
				console.log('trying to reload preferences after setting fresh initial one.')
				return loadPreferences()
			})
			.catch((error) => {
				console.log(error)
			})
		} else {
			console.log('possible no internet connection, just use offline data for now')
			return app.preferences
		}

	})

}

function savePreferences() {
	console.log('saving preferences...')
	// _local/lastSession should exist because loadPreferences creates the doc
	return localDB.get('_local/lastSession').then(doc => {
		doc.activeProfile = app.activeProfile
		doc.activeProject = app.activeProject
		doc.activeTopic = app.activeTopic
		return localDB.put(doc)
	})
	.then(() => localDB.get('_local/lastSession'))

}

function setNewProfile({prename, surname, email, color}) {

	let metadata = {
		surname: surname,
		prename: prename,
		email: email,
		color: color,
		creationDate: new Date().toISOString()
	}

	let id = metadata.prename + metadata.surname
	// TODO: this is only a testing password for all users
	let password = 'thisisasupersecrettestingpassworduntilthebeta'

	// then update the active profile to the new profile
	app.activeProfile = {_id: id, password, metadata}
	console.log(app.activeProfile)
	// FIXME: will be problematic when doing an offline "signup"
	// will need to redo the signup once possible

	// before trying any network stuff, save preferences with locally created profile
	return savePreferences()
	.then(() => {
		return remoteDB.signup( id, password, {metadata} )
	})
	// put the new profile into the database
	.then( (response) => {
		console.log('tryed to signup')
		console.log(response)
		return remoteDB.login(id, password)
	} )
	.then( response => {
		console.log('succesfully created user and logged in.')
		console.log(response)
		return remoteDB.getSession()
	})
	.then((response) => {
		if(!response.userCtx.name){
			console.error('Couldnt get user session: hmm, nobody logged on.');
		} else {
			console.log(response)
		}
	})
	.catch(err => console.log(err))
}

function setNewProject({projectname, topicname, file, emails}) {
	// assumes current activeProfile as the creator
	// we will create a new DB for the project
	// however, as we can't just do that from here for the server, we are telling
	// the server via websockets to create one

	// FIXME: create some kind of queue in the preferences to send out the request
	// at a later time when the server is offline
	ws.send(JSON.stringify({type: 'createDB', projectname, emails}))

	console.log('not waiting for response from server, just hoping it works')
	console.log('if not, we\'ll have to retry once they are online')

	console.log('listening for', ('db-' + projectname + '-created'))
	app.addEventListener('db-' + projectname + '-created', (e) => {
		console.log('we received an event via websockets!')
		console.log(e.detail)
		if(e.detail.successful) {
			console.log('database creation was successful')
			app.projectOpened = true
		} else {
			console.log('database creation was _not_ successful')
		}
	})

	// independently of internet connection and remote DB already create local DB
	new PouchDB(projectname).put({
		_id: 'topic_' + topicname,
		_attachments: {
			'file': {
				type: file.type,
				data: file,
				something: 'else'
			}
		}
	}).then(() => {
		app.activeTopic = 'topic_' + topicname
		console.log('created project', projectname, 'with first topic', topicname, 'locally.')
		console.log('now set a timeout of 1 second to try a live sync.')
		setTimeout(() => {
			switchProjectDB(projectname)
		}, 1000)

	}).catch(function (err) {
    console.log(err);
  })


}


function removeAnnotationElements(id) {
	// get DOM objects belonging to id
	let [annotationBox] = annotationElements.get(id)
	// annotationPoint.parentNode.removeChild(annotationPoint)
	annotationBox.parentNode.removeChild(annotationBox)
}


function addElementsForAnnotation(annotation){
	// add both, annotation box and annotation point to DOM
	// only handle creation of DOM element, actual DB updates
	// are done independently
	// TODO: also create 3D Labels here??
	//
	let annotationBox = document.createElement('annotation-box')
	annotationBox.annotation = annotation

	if (annotation.position.x === undefined) {
		throw Error('position.x === undefined', annotation)
	}

	annotationList.appendChild(annotationBox)
	annotationElements.set(annotation._id, [/*annotationPoint,*/ annotationBox])
}


function fetchAnnotations() {

	return localProjectDB.allDocs({
		include_docs: true,
		attachments: true,
		startkey: 'annotation', /* using startkey and endkey is faster than querying by type */
		endkey: 'annotation\uffff' /* and keeps the cod more readable  */
	})
	.then(result => {
		// now fetch the profile of the annotation creator
		// and append it to the annotation object to be used by the app (color of annotation etc.)

		let fetchedProfiles = []
		for (let {doc} of result.rows) {
			console.log(doc.creator)
			fetchedProfiles.push(
				remoteDB.getUser(doc.creator).then(profile => {
					doc.creatorProfile = profile
					return doc
				}).catch(err => {
					console.error('couldnt read user info from DB. FIXME: save local copy of used user infos', err)
				})
			)

		}
		return Promise.all(fetchedProfiles)
	})
	.catch(err => console.error('error fetching annotations', err))
}

function rebuildRenderingElements() {

	// this function removes all created representations for annotations
	// and re-creates and appends them to the view

	localProjectDB.getAttachment(app.activeTopic, 'file')
	.then(blob => {
		renderView.file = blob
		return
	})
	.then(fetchAnnotations)
	.then( annotations => {

		// first clean old annotation elements
		for (let id of annotationElements.keys()) {
			removeAnnotationElements(id)
		}

		// then add new annotation elements to the list
		// FIXME: outsource this to the annotationlist element
		for (let annotation of annotations) {
			addElementsForAnnotation(annotation)
		}

		// then add annotations to renderview and let it render them in threedimensional space
		renderView.annotations = annotations

	})
}


var alertOnlineStatus = function() {
	if(navigator.onLine === 'offline')
	window.alert('You are not connected to the internet.')
}

function handleResize(event) {
	if(renderView) {
		renderView.resize()
	}
}

window.addEventListener('online', alertOnlineStatus)
window.addEventListener('offline', alertOnlineStatus)
window.addEventListener('resize', handleResize)


function websockettest() {

}

function initWebsockets() {

	return new Promise((resolve, reject) => {

		ws = new WebSocket('ws:/localhost:7000', ['protocolbla'])

		ws.onopen = function (event) {
			resolve(ws)
		}

		ws.onmessage = function (event) {
			let msg = JSON.parse(event.data)
			switch (msg.type) {
				case 'createDB':
					let e = new CustomEvent('db-' + msg.projectname + '-created', {detail: msg})

					console.log('attention, dispatching event', ('db-' + msg.projectname + '-created'), '!')
					app.dispatchEvent(e)
					break;
				default:
				console.log('unknown websockets event:', msg)
			}
		}



	})


}

function createFirstProject() {
	console.log('click')
	let projectOverlay = document.querySelector('#projectSetupOverlay')
	projectOverlay.addEventListener('iron-overlay-closed', (e) => {
		console.log('overlay closed')
		console.log(projectOverlay.projectname, projectOverlay.file)
		console.log(projectOverlay);

		setNewProject({
			projectname: projectOverlay.projectname,
			topicname: projectOverlay.topicname,
			file: projectOverlay.file,
			emails: ['bla']
		})

	})
	projectOverlay.open()
}


function init() {

	imageContainer = document.querySelector('.object-view')
	annotationList = document.querySelector('.annotation-list')
	renderView = document.querySelector('render-view')

	localDB = new PouchDB('collabdb')
	remoteDB = new PouchDB('http://127.0.0.1:5984/collabdb')

	initWebsockets()
	.then(() => console.log('websocket succesfully connected'))
	.catch(err => console.error(err))

	loadPreferences()
	.then(() => {
		console.log('active profile:')
		console.log(app.activeProfile)
		return new Promise((resolve, reject) => {
			if(app.activeProfile === ''){
				console.log('NO ACTIVE PROFIL found in the preferences! creating one now.')

				let profileOverlay = document.querySelector('#profileSetupOverlay')

				profileOverlay.addEventListener('iron-overlay-closed', (e) => {
					console.log('profile setup overlay closed')
					setNewProfile({
						prename: profileOverlay.prename,
						surname: profileOverlay.surname,
						color: profileOverlay.color,
						email: profileOverlay.email
					}).then((result) => resolve(app.activeProfile))
				})
				profileOverlay.open()

			} else if(app.activeProfile !== undefined) {
				resolve(app.activeProfile)
			}
		})

	}).then(() => {
		console.log('ok, loaded or created the active profile. Now check if there is an active project')
		console.log(app.activeProject)
		if(app.activeProject === '') {
			console.log('no active Project, yet!');
			app.projectOpened = false
		} else {
			console.log('loaded a project, show the renderview')
			app.projectOpened = true
			return switchProjectDB(app.activeProject)
		}


	}).then(() => {
		console.log('continue')
		rebuildRenderingElements()
	})

}

app.addEventListener('dom-change', () => {
	console.log('app is ready.')
	init()
})




/////////////////////////////////////////////
// OLD STUFF down there. maybe useful later!?
/////////////////////////////////////////////

// ipc.on('someNotification', function(annotation, status) {
// 	console.log('annotation with image arrived')
// })
