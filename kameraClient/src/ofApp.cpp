#include "ofApp.h"
using namespace sio;
using namespace std;

//--------------------------------------------------------------
void ofApp::setup(){


  ofSetLogLevel(OF_LOG_VERBOSE);
  ofSetFrameRate(60);
  
  // init audio recording stuff
  sampleRate = 44100;
  channels = 2;
  // audioRecorder.setFfmpegLocation(ofFilePath::getAbsolutePath("ffmpeg"));
  // use this is you have ffmpeg installed in your data folder
  // run 'ffmpeg -codecs' to find out what your implementation supports
  audioRecorder.setAudioCodec("speex");
  audioRecorder.setAudioBitrate("44k"); //44k is the max bitrate for speex
  
  soundStream.setup(this, 0, channels, sampleRate, 256, 4);
  
  
  // init WebSocket/socket.io server
  h.connect("http://127.0.0.1:3000/CameraClients");
  
}

//--------------------------------------------------------------
void ofApp::update(){
  if (audioRecorder.hasAudioError()) {
      ofLogWarning("The audio recorder failed to write some audio samples!");
  }
}

//--------------------------------------------------------------
void ofApp::draw(){

  ofCircle(200, 400, 100);

}

//--------------------------------------------------------------
void ofApp::keyPressed(int key){


  if(key == 'a' && bRecording == false){
    bRecording = true;
    if(bRecording && !audioRecorder.isInitialized()) {
      audioRecorder.setup("audiosample.ogg", 0, 0, 0, sampleRate, channels);
      audioRecorder.start();
    }
  }


}


//--------------------------------------------------------------
void ofApp::keyReleased(int key){
  
  if (key == 'a') {
    if(bRecording == true) {
      bRecording = false;
      audioRecorder.close();
      
      // Take a screenshot of the current openFrameworks app
      ofImage screenImg;
      screenImg.allocate(ofGetWidth(), ofGetHeight(), OF_IMAGE_COLOR);
      screenImg.grabScreen(0, 0, ofGetWidth(), ofGetHeight());
      
      ofBuffer imgBuffer;
      ofBuffer audioBuffer = ofBufferFromFile("audiosample.ogg");
      
      ofSaveImage(screenImg.getPixelsRef(), imgBuffer, OF_IMAGE_FORMAT_JPEG, OF_IMAGE_QUALITY_BEST);
      
      char *imgbuff = imgBuffer.getBinaryBuffer();
      char *audiobuff = audioBuffer.getBinaryBuffer();
      
      message::list argumentList(string_message::create("blaaa"));
      argumentList.push(string_message::create(ofToString(mouseX)));
      argumentList.push(string_message::create(ofToString(mouseY)));
      argumentList.push(binary_message::create(std::make_shared<std::string>(imgbuff, imgBuffer.size())));
      argumentList.push(binary_message::create(std::make_shared<std::string>(audiobuff, audioBuffer.size())));
      
    
      h.socket()->emit("annotation_with_image", argumentList);
      sendcount++;
      
      // support io.on("new va",function(arg1,arg2){}); style in server side.
      // h.socket()->emit("annotation", "{\"bla\":\"fooo\", \"descr\":" + ofToString(sendcount) + "}");
      //h.socket()->emit("image", );
      
      
    }
  }

}

void ofApp::audioIn(float *input, int bufferSize, int nChannels){
  if(bRecording)
    audioRecorder.addAudioSamples(input, bufferSize, nChannels);
}

//--------------------------------------------------------------
void ofApp::mouseMoved(int x, int y ){

}

//--------------------------------------------------------------
void ofApp::mouseDragged(int x, int y, int button){

}

//--------------------------------------------------------------
void ofApp::mousePressed(int x, int y, int button){

}

//--------------------------------------------------------------
void ofApp::mouseReleased(int x, int y, int button){

}

//--------------------------------------------------------------
void ofApp::mouseEntered(int x, int y){

}

//--------------------------------------------------------------
void ofApp::mouseExited(int x, int y){

}

//--------------------------------------------------------------
void ofApp::windowResized(int w, int h){

}

//--------------------------------------------------------------
void ofApp::gotMessage(ofMessage msg){

}

//--------------------------------------------------------------
void ofApp::dragEvent(ofDragInfo dragInfo){

}
