import RAPIER from '@dimforge/rapier3d-compat';
import {writeFile} from 'node:fs/promises';
import {endgameLayouts} from '../../../physics/computer-benchmark.js';
import {newMatch} from '../../../src/eight-ball.js';
import {newArcade} from '../../../src/arcade-score.js';
import {trickyComputerShot} from '../../../src/tricky-computer.js';
import {practiceTable,simulateShot} from '../../../src/shot-simulation.js';
await RAPIER.init();
const results=[];
for(const [index,balls] of endgameLayouts(1234,6).entries()){
 const state={...newMatch(1),breaking:false,groups:['stripes','solids'],down:[4,5,6,7,12,13,14,15]};
 const table=practiceTable(balls),previews=[];
 const shot=trickyComputerShot(balls,state,table,p=>previews.push(p),newArcade(),{maxMs:Infinity,maxSimulations:180});
 const result=simulateShot(table,state,shot,true,{arcade:true});
 results.push({index,balls,state,shot,previews,result});
 console.log(JSON.stringify({index,label:shot.label,family:shot.family,pots:result.report.pocketed,previews:previews.length}));
 await writeFile('pipeline/trailer/action/searches.json',JSON.stringify(results));
}
