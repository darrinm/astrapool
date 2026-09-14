import test from 'node:test';
import assert from 'node:assert/strict';
import { CueAim } from './cue-aim.js';
const p=(x=0,y=0)=>({clientX:x,clientY:y});
const create=()=>new CueAim(p(),{now:0});
const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const shot=aim=>({dir:{...aim.dir},pull:aim.pull});
const angle=aim=>Math.atan2(aim.dir.y,aim.dir.x);
const turn=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function ready(raw={x:0,y:10}) {
  const aim=create(); aim.update(p(0,80),raw,100); assert.equal(aim.tick(500),true); return aim;
}

test('rough aim follows the projected pull directly, including power and all directions',()=>{
  for(const raw of [{x:3,y:4},{x:-3,y:-4},{x:30,y:40}]) {
    const aim=create(); aim.update(p(30,40),raw,10);
    const length=Math.hypot(raw.x,raw.y);
    close(aim.dir.x,-raw.x/length); close(aim.dir.y,-raw.y/length); close(aim.pull,Math.min(24,length));
  }
});
test('a stationary pointer enters fine mode after 400ms without another move event or shot change',()=>{
  const aim=create(); aim.update(p(0,80),{x:0,y:10},100); const before=shot(aim);
  assert.equal(aim.tick(499),false); assert.equal(aim.tick(500),true); assert.equal(aim.fine,true);
  assert.deepEqual(shot(aim),before); assert.equal(aim.tick(900),false);
});
test('small finger tremor stays inside the dwell tolerance',()=>{
  const aim=create(); aim.update(p(0,80),{x:0,y:10},100);
  aim.update(p(3,82),{x:0.2,y:10.1},200); aim.update(p(-3,78),{x:-0.2,y:9.9},400);
  assert.equal(aim.tick(500),true);
});
test('movement outside the hold radius restarts the dwell, including cumulative small steps',()=>{
  const aim=create(); aim.update(p(0,80),{x:0,y:10},100);
  for(const [x,time] of [[3,200],[6,300],[9,400]])aim.update(p(x,80),{x:x/8,y:10},time);
  assert.equal(aim.tick(799),false); assert.equal(aim.tick(800),true);
});
test('holding without a shootable pull never locks fine aim',()=>{
  const aim=create(); assert.equal(aim.tick(1000),false);
  aim.update(p(1,0),{x:0.2,y:0},1100); assert.equal(aim.tick(2000),false);
});
test('fine aim uses the same 0.1 degree per pixel at every angle and power',()=>{
  for(const radians of [0,Math.PI/4,Math.PI/2,Math.PI,-Math.PI/2])for(const pull of [0.4,4,24]) {
    const aim=ready({x:Math.cos(radians)*pull,y:Math.sin(radians)*pull}); const before=angle(aim);
    aim.update(p(40,80),{x:100,y:100},550);
    close(turn(angle(aim),before),4*Math.PI/180); close(aim.pull,pull);
  }
});
test('minor vertical movement keeps power locked and does not change fine aim',()=>{
  const aim=ready(); const before=shot(aim);
  aim.update(p(0,99),{x:20,y:20},600); assert.equal(aim.fine,true);
  close(aim.dir.x,before.dir.x); close(aim.dir.y,before.dir.y); assert.equal(aim.pull,before.pull);
});
test('20 pixels vertically exits fine mode with no jump, then direct dragging resumes',()=>{
  for(const sign of [-1,1]) {
    const aim=ready(); aim.update(p(20,80),{x:2,y:10},550); const before=shot(aim);
    const raw={x:2,y:10+sign*3};
    aim.update(p(20,80+sign*20),raw,600); assert.equal(aim.fine,false); assert.deepEqual(shot(aim),before);
    aim.update(p(20,80+sign*20),raw,620);
    close(aim.dir.x,before.dir.x); close(aim.dir.y,before.dir.y); close(aim.pull,before.pull);
    aim.update(p(20,80+sign*24),{x:raw.x,y:raw.y+1},650);
    const expected={x:-before.dir.x*before.pull,y:-before.dir.y*before.pull+1},len=Math.hypot(expected.x,expected.y);
    close(aim.pull,len); close(aim.dir.x,-expected.x/len); close(aim.dir.y,-expected.y/len);
  }
});
test('fine mode cannot immediately reenter after a vertical exit',()=>{
  const aim=ready(); aim.update(p(0,100),{x:0,y:13},600);
  assert.equal(aim.tick(999),false); assert.equal(aim.tick(1000),true);
});
test('a new gesture starts without stale fine mode, offsets or locked power',()=>{
  const previous=ready(); previous.update(p(30,100),{x:2,y:13},600);
  const aim=create(); assert.equal(aim.fine,false); assert.equal(aim.pull,0);
  aim.update(p(30,40),{x:3,y:4},20); close(aim.dir.x,-0.6); close(aim.pull,5);
});
test('fine adjustments depend on current displacement rather than the path or sample count',()=>{
  const a=ready(),b=ready(); a.update(p(40,80),{x:5,y:10},600);
  for(const x of [10,-20,50,40])b.update(p(x,80),{x:x/8,y:10},600);
  assert.deepEqual(shot(a),shot(b));
});


test('side-on fine aiming uses up/down to rotate and left/right to exit',()=>{
  for (const side of [-1,1]) {
    const aim=create(); aim.update(p(side*80,0),{x:side*10,y:0},100);
    assert.equal(aim.tick(500,{x:side,y:0}),true);
    const before=angle(aim);
    aim.update(p(side*80,30),{x:side*10,y:4},600);
    assert.equal(aim.fine,true); close(aim.pull,10);
    close(turn(angle(aim),before),-side*3*Math.PI/180);
    const adjusted=shot(aim);
    aim.update(p(side*100,30),{x:side*13,y:4},650);
    assert.equal(aim.fine,false); assert.deepEqual(shot(aim),adjusted);
  }
});
test('diagonal fine control projects movement onto the cue axes, independent of their length',()=>{
  for(const radians of [Math.PI/4,3*Math.PI/4,5*Math.PI/4,7*Math.PI/4]) {
    const axis={x:Math.cos(radians),y:Math.sin(radians)};
    const aim=create(); aim.update(p(0,80),{x:3,y:4},100);
    aim.tick(500,{x:axis.x*7,y:axis.y*7});
    const before=angle(aim);
    const across={x:axis.y*30,y:-axis.x*30};
    aim.update(p(across.x,80+across.y),{x:5,y:7},600);
    assert.equal(aim.fine,true); close(turn(angle(aim),before),3*Math.PI/180); close(aim.pull,5);
    const adjusted=shot(aim);
    aim.update(p(across.x+axis.x*21,80+across.y+axis.y*21),{x:8,y:11},650);
    assert.equal(aim.fine,false); close(aim.dir.x,adjusted.dir.x); close(aim.dir.y,adjusted.dir.y); close(aim.pull,adjusted.pull);
  }
});
