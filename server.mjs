import {createServer} from 'node:http';
import catalog from './catalog.json' with {type:'json'};
import {validateCatalog} from './catalog.mjs';
import {createApp} from './app.mjs';
const app=createApp(process.env,validateCatalog(catalog));
const server=createServer(app.handle);
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.info(JSON.stringify({event:'listening',service:catalog.id+'-payments'})));
async function shutdown(){server.close(async()=>{await app.close();process.exit(0);});setTimeout(()=>process.exit(1),25000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
