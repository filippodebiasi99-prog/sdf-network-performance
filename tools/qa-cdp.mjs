import { writeFile } from "node:fs/promises";

const version = await fetch("http://127.0.0.1:9222/json/version").then((response) => response.json());
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve,reject) => {
  socket.addEventListener("open",resolve,{once:true});
  socket.addEventListener("error",reject,{once:true});
});

let requestId = 0;
const pending = new Map();
const runtimeIssues = [];
socket.addEventListener("message",({data}) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") runtimeIssues.push({type:"exception",text:message.params.exceptionDetails.text});
  if (message.method === "Runtime.consoleAPICalled" && ["error","warning"].includes(message.params.type)) runtimeIssues.push({type:message.params.type,text:message.params.args.map((item)=>item.value || item.description || "").join(" ")});
  if (message.method === "Network.responseReceived" && message.params.response.status >= 400) runtimeIssues.push({type:"http",text:`${message.params.response.status} ${message.params.response.url}`});
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
  await command("Network.enable",{},sessionId);
  await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width <= 640},sessionId);
  await command("Page.navigate",{url},sessionId);
  await new Promise((resolve) => setTimeout(resolve,1200));
  const inspected = await command("Runtime.evaluate",{
    expression:`JSON.stringify({title:document.title,innerWidth,bodyWidth:document.body.scrollWidth,documentWidth:document.documentElement.scrollWidth,apiError:document.body.textContent.includes('Servizio dati non disponibile'),collectionVisible:Boolean(document.querySelector('.collection-page')),mode:document.body.className,fieldCount:document.querySelectorAll('.survey-field input').length,prefilledCount:document.querySelectorAll('.collection-prefilled dd').length,firstFieldLabel:document.querySelector('.survey-field label')?.textContent.trim(),headings:[...document.querySelectorAll('h1,h2,h3')].slice(0,6).map(item=>item.textContent.trim()),brandRect:document.querySelector('.collection-brand .brand-mark')?.getBoundingClientRect().toJSON(),headerBackground:document.querySelector('.collection-header')&&getComputedStyle(document.querySelector('.collection-header')).backgroundColor})`,
    returnByValue:true
  },sessionId);
  const screenshot = await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);
  await writeFile(`qa-${name}-real.png`,Buffer.from(screenshot.data,"base64"));
  await command("Target.closeTarget",{targetId});
  return JSON.parse(inspected.result.value);
}

const token = process.argv[2] || await fetch("http://127.0.0.1:4173/api/dealers/DEMO-004/collection-link?campaignId=campaign-2026-1",{headers:{"x-demo-role":"JET"}})
  .then((response)=>response.json())
  .then((payload)=>new URL(payload.url).pathname.split("/").pop());
const results = [];
results.push(await inspect("overview-desktop","http://127.0.0.1:4173/?page=overview",1440,970));
results.push(await inspect("overview-mobile","http://127.0.0.1:4173/?page=overview",390,844));
results.push(await inspect("collection-desktop",`http://127.0.0.1:4173/compila/${encodeURIComponent(token)}`,1440,970));
results.push(await inspect("collection-mobile",`http://127.0.0.1:4173/compila/${encodeURIComponent(token)}`,390,844));
results.push(await inspect("confirmation-mobile",`http://127.0.0.1:4173/compila/${encodeURIComponent(token)}/conferma`,390,844));
console.log(JSON.stringify(results,null,2));
if (runtimeIssues.length) console.error(JSON.stringify({runtimeIssues},null,2));
socket.close();
