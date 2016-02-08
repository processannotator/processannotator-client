/* eslint no-alert:0*/
'use strict' /*eslint global-strict:0*/

var ipc = require('ipc')
PouchDB.plugin(require('pouchdb-authentication'))
var localDB = new PouchDB('collabdb')
var remoteDB = new PouchDB('http://127.0.0.1:5984/collabdb')
var sync
var db = new PouchDB('http://127.0.0.1:5984/db', {skipSetup: true})
var ws //websocket connection
require('./test').test()

var annotationElements = new Map()

// DOM elements
var app = document.querySelector('#app')
var imageContainer
var annotationList
var renderView
var activeProfile
app.activeProject = {_id: 'project_1'}
app.activeTopic = {_id: 'topic_1'}


function addProject(file) {
	// FIXME: this ain't working, server has to ceate a DB first
	// first create DB entry for new project
	// then create a new topic from file/.. which belongs to the newly created project
	return localDB.put({
		_id: 'project_' + 1,
		type: 'project',
		creator: activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a project title',
		description: 'a description to a project'
	})
	.then(localDB.get('project' + 1))
	.then((newProject) => {
		app.activeProject = newProject
		return addNewTopic(file)
	})
	// finally return the new projects object
	.then(() => app.activeProject)
	.catch((err) => {
		console.error('error creating new project in DB', err)
	})


}

function addTopic() {
	// add new topic to active project
	return localDB.put({
		_id: 'topic_' + 1,
		type: 'topic',
		parentProject: activeProject._id,
		creator: activeProfile._id,
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
	console.log('creator', activeProfile)
	console.log('put annotation into DB')
	return localDB.put(annotation)
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
			console.log('setting preferences')
			app.preferences = preferences
			console.log(this.preferences)
		}
		if (preferences === undefined) {
			throw	new Error('preferences missing, this error shouldnt happen at all!')
			// because if preferences is undefined, it should have thrown an error before!
		} else if (preferences.activeProfile === '') {
			console.log('activeProfile missing, should open a dialog to create a new one!')
			throw	new Error('activeProfile missing')
		}

		// try to login to profile thats saved in preferences info from remote server
		// to get up-to-date profile info and save it later
		console.log('LOGIN TEST')
		console.log(preferences.activeProfile._id)
		console.log(preferences.activeProfile.password)
		return login(preferences.activeProfile._id, preferences.activeProfile.password)
	})
	.then(response => {
		console.log('successfully logged in: ', response)
		console.log('after succesfull login, get new user info')
		return remoteDB.getSession()
	})
	.then(session => {
		console.log('got session:', session)
		console.log('now. trying to get user info for session', preferences.activeProfile._id)
		return remoteDB.getUser(preferences.activeProfile._id)
	})
	.then(profile => {
		console.log('profile', profile)
		console.log('activeProfile', activeProfile)
		if(activeProfile)
		profile._id = activeProfile._id // don't use the verbose couchdb:etc username
		console.log('got profile:', profile)
		console.log('login via preferences successful')
		preferences.activeProfile = profile
		console.log('prefs:', preferences)
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
			return app.preferences
		}

	})

}

function savePreferences() {
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

	let id = metadata.prename + metadata.surname + Math.random()
	// TODO: this is only a testing password for all users
	let password = 'thisisasupersecrettestingpassworduntilthebeta'

	// put the new profile into the database
	return remoteDB.signup( id, password, {metadata} )
	.then( () => remoteDB.login(id, password) )
	.then( response => {
		console.log('succesfully created user and logged in.')
		console.log(response)
		return remoteDB.getSession()
	})
	.then((response) => {
		console.log(response)

		// then update the active profile to the new profile
		app.activeProfile = {_id: id, password, metadata: response}

		// and save preferences
		return savePreferences()
	})
	.catch(err => console.log(err))
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

	return localDB.allDocs({
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
			console.log('testesttest')
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

function rebuildAnnotationElements() {
	// this function removes all created representations for annotations
	// and re-creates and appends them to the view

	return fetchAnnotations().then( function(annotations) {

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

		var exampleSocket = new WebSocket('ws:/localhost:7000', ['protocolbla'])

		exampleSocket.onopen = function (event) {
			exampleSocket.send("Here's some text that the server is urgently awaiting!")
			resolve(exampleSocket)
		}
	})


}


function init() {


	initWebsockets()
	.then(() => console.log('websocket succesfully connected'))
	.catch(err => console.error(err))

	loadPreferences()
	.then(preferences => {

		return new Promise((resolve, reject) => {
			if(preferences.activeProfile === ''){
				console.log('NO ACTIVE PROFIL found in the preferences! creating one now.')

				let profileOverlay = document.querySelector('#profileSetupOverlay')

				profileOverlay.addEventListener('iron-overlay-closed', (e) => {
					setNewProfile({
						prename: profileOverlay.prename,
						surname: profileOverlay.surname,
						color: profileOverlay.color,
						email: profileOverlay.email
					}).then((result) => resolve(activeProfile))
				})

				profileOverlay.open()


			} else if(preferences.activeProfile !== undefined) {
				// TODO: fixme: activeProfile assignment might be redundant here? check it!
				app.activeProfile = preferences.activeProfile
				console.log('active profile:', activeProfile)
				resolve(app.activeProfile)

			}
		})

	}).then((activeProfile) => {
		console.log('ok, loaded or created the active profile. Now check if there is an active project')
		// if()
		rebuildAnnotationElements()

	}).then(() => {

		imageContainer = document.querySelector('.object-view')
		annotationList = document.querySelector('.annotation-list')
		renderView = document.querySelector('render-view')

		// perhaps also on change localDB to rebuildAnnotation elements?
		sync = PouchDB.sync(localDB, remoteDB, {
			live: true,
			retry: true
		}).on('change', function(info) {
			console.log('sync change!!')
			console.log('TODO: now sync all DOM elements...')
			rebuildAnnotationElements()


		}).on('paused', () => {
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
			// handle complete
		}).on('error', err => {
			console.log('sync error')

			// handle error
		})

		localDB.info().then((result) => {
			console.log('localDB info:', result)

			// update the renderView with new annotation
			renderView.addEventListener('initialized', () => {
				rebuildAnnotationElements()
			})

		})
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
