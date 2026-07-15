import { writeFile } from "node:fs/promises";

const version = await fetch("http://127.0.0.1:9222/json/version").then((response) => response.json());
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve,reject) => {
  socket.addEventListener("open",resolve,{once:true});
  socket.addEventListener("error",reject,{once:true});
});

let requestId = 0;
const pending = new Map();
socket.addEventListener("message",({data}) => {
  const message = JSON.parse(data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

function command(method,params={},sessionId) {
  const id = ++requestId;
  socket.send(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}));
  return new Promise((resolve,reject) => pending.set(id,{resolve,reject}));
}

async function inspect(name,url,width,height) {
  const { targetId } = await command("Target.createTarget",{url:"about:blank"});
  const { sessionId } = await command("Target.attachToTarget",{targetId,flatten:true});
  await command("Page.enable",{},sessionId);
  await command("Runtime.enable",{},sessionId);
  await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width <= 640},sessionId);
  await command("Page.navigate",{url},sessionId);
  await new Promise((resolve) => setTimeout(resolve,1200));
  const inspected = await command("Runtime.evaluate",{
    expression:`JSON.stringify({title:document.title,innerWidth,bodyWidth:document.body.scrollWidth,documentWidth:document.documentElement.scrollWidth,sidebarVisible:Boolean(document.querySelector('.sidebar')?.offsetParent),apiError:document.body.textContent.includes('Servizio dati non disponibile')})`,
    returnByValue:true
  },sessionId);
  const screenshot = await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);
  await writeFile(`qa-${name}-real.png`,Buffer.from(screenshot.data,"base64"));
  await command("Target.closeTarget",{targetId});
  return JSON.parse(inspected.result.value);
}

const token = process.argv[2];
const results = [];
results.push(await inspect("overview-desktop","http://127.0.0.1:4173/?page=overview",1440,970));
results.push(await inspect("overview-mobile","http://127.0.0.1:4173/?page=overview",390,844));
results.push(await inspect("survey-mobile",`http://127.0.0.1:4173/?page=survey&token=${encodeURIComponent(token)}`,390,844));
console.log(JSON.stringify(results,null,2));
socket.close();
