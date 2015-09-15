#pragma once

#include "ofMain.h"
#include "sio_client.h"
#include "ofxVideoRecorder.h"


using namespace sio;
using namespace std;

class ofApp : public ofBaseApp{

	public:
		void setup();
		void update();
		void draw();

		void keyPressed(int key);
		void keyReleased(int key);
		void mouseMoved(int x, int y );
		void mouseDragged(int x, int y, int button);
		void mousePressed(int x, int y, int button);
		void mouseReleased(int x, int y, int button);
		void mouseEntered(int x, int y);
		void mouseExited(int x, int y);
		void windowResized(int w, int h);
		void dragEvent(ofDragInfo dragInfo);
		void gotMessage(ofMessage msg);
		void audioIn(float * input, int bufferSize, int nChannels);

		// audio stuff
		ofxVideoRecorder    audioRecorder;
		ofSoundStream       soundStream;
		bool bRecording;
		int sampleRate;
		int channels;
		
		

		
		sio::client h;
		int sendcount;
		
};
