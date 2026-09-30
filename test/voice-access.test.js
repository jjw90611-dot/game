import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice } from '../public/js/voice.js';

function setup(t, response) {
  const oldFetch=globalThis.fetch, oldNav=Object.getOwnPropertyDescriptor(globalThis,'navigator'), oldWindow=globalThis.window;
  let cameraCalls=0, stopped=0, resolveCamera;
  const messages=[];
  const track={enabled:true,stop(){++stopped;}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  const media={getUserMedia:async()=>{++cameraCalls;return stream;}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:media}});
  globalThis.window={RTCPeerConnection:function(){}};
  globalThis.fetch=async()=>response;
  const voice=createVoice({send:m=>messages.push(m),me:()=> 'uid',game:()=> 'omok',session:()=> 'test-session'});
  t.after(()=>{
    voice.leave();globalThis.fetch=oldFetch;globalThis.window=oldWindow;
    if(oldNav) Object.defineProperty(globalThis,'navigator',oldNav); else delete globalThis.navigator;
  });
  return {voice,messages,get cameraCalls(){return cameraCalls;},get stopped(){return stopped;},
    deferCamera(){media.getUserMedia=()=>{++cameraCalls;return new Promise(r=>{resolveCamera=r;});};},
    resolveCamera(){resolveCamera(stream);}
  };
}
for(const status of [401,403,423,503]) test(`Voice refuses HTTP ${status} without acquiring a microphone or falling back to STUN`,async t=>{
  const f=setup(t,Response.json({ok:false,error:'access denied'},{status}));
  await assert.rejects(f.voice.join(),/access denied/);
  assert.equal(f.cameraCalls,0);assert.equal(f.voice.active,false);
});
test('Voice refuses malformed success responses',async t=>{
  const f=setup(t,Response.json({ok:true}));await assert.rejects(f.voice.join());assert.equal(f.cameraCalls,0);
});
test('Voice network failure does not bypass admission with fallback STUN',async t=>{
  const f=setup(t,null);globalThis.fetch=async()=>{throw new Error('offline');};
  await assert.rejects(f.voice.join(),/offline/);assert.equal(f.cameraCalls,0);
});
test('Leaving while a microphone permission prompt is pending stops the eventual stream',async t=>{
  const f=setup(t,Response.json({ok:true,iceServers:[{urls:'stun:test.invalid'}]}));f.deferCamera();
  const pending=f.voice.join();
  while(!f.cameraCalls) await new Promise(r=>setImmediate(r));
  f.voice.leave();f.resolveCamera();await pending;
  assert.equal(f.stopped,1);assert.equal(f.voice.active,false);
  assert.equal(f.messages.some(m=>m.on),false);
});
test('Successful voice join sends the game session header and cleanup stops tracks',async t=>{
  const f=setup(t,null);let seen;
  globalThis.fetch=async(url,options)=>{seen={url,options};return Response.json({ok:true,iceServers:[{urls:'stun:test.invalid'}]});};
  await f.voice.join();assert.equal(f.voice.active,true);
  assert.equal(seen.url,'/api/ice?game=omok');assert.equal(seen.options.headers['x-game-session'],'test-session');
  f.voice.leave();assert.equal(f.stopped,1);assert.equal(f.voice.active,false);
});
