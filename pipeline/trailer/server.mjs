import http from 'node:http';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('pipeline/trailer/render');
await mkdir(`${root}/frames`,{recursive:true});
http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5173');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.end();return;}
  const frame=/^\/frame\/(\d{5})$/.exec(req.url);
  if(req.method!=='POST'||(!frame&&req.url!=='/complete')){res.writeHead(404).end();return;}
  try{
    const data=[]; for await(const chunk of req)data.push(chunk);
    await writeFile(frame?`${root}/frames/${frame[1]}.jpg`:`${root}/capture.json`,Buffer.concat(data));
    if(!frame)console.log('Capture complete');
    else if(Number(frame[1])%150===0)console.log(`Saved frame ${frame[1]}`);
    res.end('ok');
  }catch(error){console.error(error);res.writeHead(500).end();}
}).listen(5174,'127.0.0.1',()=>console.log(`Trailer frames: ${root}`));
